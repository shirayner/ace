/**
 * Mutation harness for the vacuous-test audit follow-up.
 *
 * Copies the skill tree OUT of the repo, applies one textual mutation, and runs the
 * suite. The replacement is verified byte-for-byte: a no-op replace is reported as
 * VOID and exits non-zero, because "the mutation did not apply" is indistinguishable
 * from "the constraint held" in the test output alone.
 *
 * Usage: node mutate.mjs <mutation-id>
 */

import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SKILL = 'D:/Users/r.shi/work-space/incubator-mess/requirement-agent-skill/ace/plugin/skills/auto-goal-v2';

/** file -> [from, to] textual edits. Every edit must change the file or the run is VOID. */
const MUTATIONS = {
  M22: { 'scripts/ingest-audit.mjs': [['export const ENVELOPE_BUDGET_BYTES = 1024;', 'export const ENVELOPE_BUDGET_BYTES = 102400;']] },
  M25: { 'scripts/ingest-audit.mjs': [['export const LAUNCH_BUDGET_BYTES = 16 * 1024;', 'export const LAUNCH_BUDGET_BYTES = 1600 * 1024;']] },
  M26: { 'scripts/ingest-audit.mjs': [['buf.length <= 400 ? buf.toString(\'utf8\') : buf.subarray(0, 400)', 'buf.length <= 40000 ? buf.toString(\'utf8\') : buf.subarray(0, 40000)']] },
  M26b: { 'scripts/ingest-audit.mjs': [['raw.claims.slice(0, 3)', 'raw.claims.slice(0, 30)']] },
  M26c: { 'scripts/ingest-audit.mjs': [['raw.artifact_refs.slice(0, 4)', 'raw.artifact_refs.slice(0, 40)']] },
  M28: {
    'lib/artifacts.mjs': [[
      `    if (actualBytes > BUDGETS.ARTIFACT) {
      throw new KernelError(
        KERNEL_CODES.BUDGET_EXCEEDED,
        \`Artifact \${manifest.artifact_id} is \${actualBytes} bytes, exceeding the \${BUDGETS.ARTIFACT} byte hard limit\`,
        { artifact_id: manifest.artifact_id, bytes: actualBytes, limit: BUDGETS.ARTIFACT },
      );
    }
`,
      '',
    ]],
  },
  M29: { 'lib/paths.mjs': [['  if (/^[A-Za-z]:/.test(candidate)) return false;\n', '']] },
  M39: {
    'scripts/backend-resolve.mjs': [[
      `      if (native) return { bin: native, via: 'shim', shim: candidate };
      continue; // A shim we cannot spawn directly is not a usable backend.`,
      `      if (native) return { bin: native, via: 'shim', shim: candidate };
      return { bin: candidate, via: 'shim', shim: candidate };`,
    ]],
  },
  M40: { 'scripts/dispatch-worker.mjs': [['shell: false, // never a shell', 'shell: true, // never a shell']] },
  // M24: remove the pre-spawn isolation-args gate from the dispatch path. The function keeps
  // its own unit tests, so only an integration-point assertion can catch this.
  M24: { 'scripts/dispatch-worker.mjs': [['  assertIsolatedArgs(args);\n', '']] },
  // Control: no mutation at all. Proves the copy itself is green.
  NONE: {},

  // ---- Blanket-reject mutations (item 9) ----
  // Each makes one validator reject EVERYTHING. A surviving mutation means that
  // validator's tests only ever assert rejection: they would pass against an
  // implementation that says "no" to all input, so they pin nothing.
  BR_validateSchema: {
    'lib/schema-validator.mjs': [[
      'return { valid: violations.length === 0, violations };',
      "return { valid: false, violations: [{ path: '', rule: 'blanket', message: 'blanket reject' }] };",
    ]],
  },
  BR_assertNoViolations: {
    'lib/semantic-validator.mjs': [[
      `export function assertNoViolations(subject, violations) {
  if (violations.length > 0) {`,
      `export function assertNoViolations(subject, violations) {
  if (true) {`,
    ]],
  },
  BR_isSafeRelativePath: {
    'lib/paths.mjs': [[
      'export function isSafeRelativePath(candidate) {',
      'export function isSafeRelativePath(candidate) {\n  return false;',
    ]],
  },
  BR_rungSatisfies: {
    'lib/vocabulary.mjs': [[
      'export function rungSatisfies(achieved, required) {',
      'export function rungSatisfies(achieved, required) {\n  return false;',
    ]],
  },
  BR_isHashRef: {
    'lib/canonical.mjs': [['export function isHashRef(value) {', 'export function isHashRef(value) {\n  return false;']],
  },
  BR_assertWithinBudget: {
    'lib/budgets.mjs': [[
      `  const actualBytes = utf8Bytes(serialized);
  if (actualBytes > limitBytes) {`,
      `  const actualBytes = utf8Bytes(serialized);
  if (true) {`,
    ]],
  },
  BR_assertCompositionWithinBudget: {
    'lib/budgets.mjs': [[
      `  const { total, composition } = measureComposition(parts);
  if (total > limitBytes) {`,
      `  const { total, composition } = measureComposition(parts);
  if (true) {`,
    ]],
  },
  BR_checkLaunchBudget: {
    'scripts/ingest-audit.mjs': [[
      'if (breakdown.total <= limit) return { ok: true, bytes: breakdown.total, limit };',
      'if (false) return { ok: true, bytes: breakdown.total, limit };',
    ]],
  },
  BR_verifyEventHash: {
    'lib/canonical.mjs': [[
      "  return { valid: expected === event[SELF_HASH_FIELD], expected, actual: event[SELF_HASH_FIELD] };",
      "  return { valid: false, expected, actual: event[SELF_HASH_FIELD] };",
    ]],
  },
  BR_verifyChain: {
    'lib/canonical.mjs': [[
      `export function verifyChain(events, genesisHash = GENESIS_HASH) {
  let expectedPrev = genesisHash;`,
      `export function verifyChain(events, genesisHash = GENESIS_HASH) {
  if (events.length >= 0) return { valid: false, brokenAtIndex: 0, reason: 'blanket reject' };
  let expectedPrev = genesisHash;`,
    ]],
  },
  BR_verifyCursor: {
    'lib/journal.mjs': [[
      `export function verifyCursor(taskRoot, cursor) {
  const { events } = readAllEvents(taskRoot);`,
      `export function verifyCursor(taskRoot, cursor) {
  if (cursor) return { valid: false, reason: 'blanket reject' };
  const { events } = readAllEvents(taskRoot);`,
    ]],
  },
  BR_resolveBackend: {
    'scripts/backend-resolve.mjs': [[
      `export function resolveBackend(env = process.env) {
  for (const candidate of candidatePaths(env)) {`,
      `export function resolveBackend(env = process.env) {
  if (env) return null;
  for (const candidate of candidatePaths(env)) {`,
    ]],
  },
  BR_assertIsolatedArgs: {
    'scripts/backend-resolve.mjs': [[
      `  const violations = args.filter((arg) => FORBIDDEN_ARGS.includes(arg));
  if (violations.length > 0) {`,
      `  const violations = args.filter((arg) => FORBIDDEN_ARGS.includes(arg));
  if (true) {`,
    ]],
  },
  BR_validateCriterion: {
    'lib/semantic-validator.mjs': [[
      `export function validateCriterion(criterion, { agentIdentities = ['agent', 'controller', 'self'] } = {}) {
  const violations = [];`,
      `export function validateCriterion(criterion, { agentIdentities = ['agent', 'controller', 'self'] } = {}) {
  const violations = [violation('blanket', 'blanket reject')];`,
    ]],
  },
  BR_validateEventSemantics: {
    'lib/semantic-validator.mjs': [[
      `export function validateEventSemantics(event, context) {
  const violations = [];`,
      `export function validateEventSemantics(event, context) {
  const violations = [violation('blanket', 'blanket reject')];`,
    ]],
  },
  BR_validatePhaseTransition: {
    'lib/semantic-validator.mjs': [[
      `export function validatePhaseTransition(fromPhase, toPhase) {
  const allowed = PHASE_TRANSITIONS[fromPhase];`,
      `export function validatePhaseTransition(fromPhase, toPhase) {
  if (fromPhase !== undefined) return [violation('blanket', 'blanket reject')];
  const allowed = PHASE_TRANSITIONS[fromPhase];`,
    ]],
  },
  BR_validateWorkerOutput: {
    'lib/semantic-validator.mjs': [[
      `export function validateWorkerOutput(output, context) {
  const violations = [];`,
      `export function validateWorkerOutput(output, context) {
  const violations = [violation('blanket', 'blanket reject')];`,
    ]],
  },
  BR_validateArtifactManifest: {
    'lib/semantic-validator.mjs': [[
      `export function validateArtifactManifest(manifest, context = {}) {
  const violations = [];`,
      `export function validateArtifactManifest(manifest, context = {}) {
  const violations = [violation('blanket', 'blanket reject')];`,
    ]],
  },
  BR_validateEvidenceUsability: {
    'lib/semantic-validator.mjs': [[
      `export function validateEvidenceUsability(criterion, manifests) {
  const violations = [];`,
      `export function validateEvidenceUsability(criterion, manifests) {
  const violations = [violation('blanket', 'blanket reject')];`,
    ]],
  },
  BR_isMainAgentIngestible: {
    'lib/semantic-validator.mjs': [[
      'export function isMainAgentIngestible(artifactKind) {',
      'export function isMainAgentIngestible(artifactKind) {\n  return false;',
    ]],
  },
};

const id = process.argv[2];
const mutation = MUTATIONS[id];
if (!mutation) {
  console.error(`unknown mutation ${id}; known: ${Object.keys(MUTATIONS).join(', ')}`);
  process.exit(2);
}

const work = mkdtempSync(join(tmpdir(), `agv2-mut-${id}-`));
const root = join(work, 'auto-goal-v2');
cpSync(SKILL, root, { recursive: true });

let edits = 0;
for (const [relative, replacements] of Object.entries(mutation)) {
  const file = join(root, relative);
  let text = readFileSync(file, 'utf8');
  for (const [from, to] of replacements) {
    const before = text;
    if (!before.includes(from)) {
      console.error(`VOID: target absent in ${relative}\n--- looked for ---\n${from}`);
      rmSync(work, { recursive: true, force: true });
      process.exit(3);
    }
    text = before.split(from).join(to);
    if (text === before) {
      console.error(`VOID: replace was a no-op in ${relative}`);
      rmSync(work, { recursive: true, force: true });
      process.exit(3);
    }
    edits += 1;
  }
  writeFileSync(file, text);
  const written = readFileSync(file, 'utf8');
  if (written !== text) {
    console.error(`VOID: write-back mismatch in ${relative}`);
    process.exit(3);
  }
}
if (id !== 'NONE' && edits === 0) {
  console.error('VOID: mutation declared no edits');
  process.exit(3);
}
console.log(`[${id}] applied ${edits} edit(s) in ${root}`);

// Explicit file list: `node --test tests/` finds zero cases on Node 24.
const testFiles = readdirSync(join(root, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .map((name) => `tests/${name}`);

const run = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...testFiles], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  env: { ...process.env, ACE_REQUIRE_STUB_BACKEND: '1' },
});
const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const counts = /# tests (\d+)[\s\S]*?# pass (\d+)[\s\S]*?# fail (\d+)/.exec(out);
if (!counts) {
  console.error(`VOID: could not parse test counts from the run output\n${out.slice(-4000)}`);
  process.exit(4);
}
const failCount = Number(counts[3]);
const failing = [...out.matchAll(/^not ok \d+ - (.*)$/gm)].map((m) => m[1].trim());

console.log(`[${id}] counts: tests=${counts[1]} pass=${counts[2]} fail=${failCount}`);
console.log(`[${id}] verdict: ${failCount > 0 ? 'KILLED' : 'SURVIVED'}`);
for (const name of failing) console.log(`    FAIL: ${name}`);
if (failCount > 0 && failing.length === 0) {
  console.log('    (fail count > 0 but no `not ok` line matched; raw tail follows)');
  console.log(out.slice(-3000));
}

rmSync(work, { recursive: true, force: true });
process.exit(0);
