/**
 * Cross-layer consistency between the data kernel and the control-plane runtime.
 *
 * Both layers describe the same evidence ladder and criterion typology. The
 * runtime (`protocols/runtime/`) owns the risk→evidence policy; the kernel's
 * vocabulary delegates to it. These tests pin the remaining shared constants so a
 * change on either side that breaks the other fails here rather than in
 * production, where a drifting evidence floor is a false-DONE path.
 *
 * A divergence found during implementation motivated this file: the kernel had
 * defined its own escalation rules that failed open on unassessed risk, while the
 * runtime failed safe. The kernel now delegates, and this suite keeps it honest.
 *
 * The second half pins the numeric budgets. Measured before these assertions
 * existed: changing `LAUNCH_BUDGET_BYTES` from 16 KiB to 64 KiB,
 * `ENVELOPE_BUDGET_BYTES` from 1 KiB to 8 KiB, or the claim/ref caps from 3/4 to
 * 30/40 left all 402 tests green. Those literals are now gone — `scripts/` imports
 * `lib/budgets.mjs` directly, so there is nothing left to drift. What remains
 * duplicated is the schema JSON, which cannot import, and `protocols/*.md`, which is
 * prose; those are what the registry and the doc-vs-code test below govern. Unchecked
 * duplication is the「声明了却无人校验」defect class in cross-layer form.
 *
 * Collapsing the copies left its own residue. Two assertions of the shape
 * `assert.equal(LAUNCH_BUDGET_BYTES, BUDGETS.WORKER_LAUNCH_TOTAL)` stayed behind after
 * the alias became `export const LAUNCH_BUDGET_BYTES = BUDGETS.WORKER_LAUNCH_TOTAL`,
 * at which point both sides were the same value and no edit could redden them. A
 * tautology is worse than a missing test: it occupies the place a reader checks. They
 * are replaced by a test that reads `protocols/dispatch.md` — the remaining authority
 * that cannot import a constant, and the one a human actually consults.
 *
 * A note on how that gap was found, since the same mistake is easy to repeat: the
 * mutation was first run against this file alone, came back green, and was briefly
 * recorded as "the suite does not catch a 4× launch budget". Re-run through
 * `scripts/run-tests.mjs` it reddens three tests in `kernel-budgets.test.mjs`, which
 * holds the literal design-table pin. A single-file run is a different instrument from
 * the suite, and its silence was not a finding about the suite.
 *
 * An earlier version of this comment claimed `scripts/` deliberately avoided
 * importing `lib/` "so the dispatch layer stays independently copyable". That was
 * never a design constraint: the archived design's dependency rules forbid
 * `../shared`, `../auto-goal` and other skills, and say nothing about `lib/`; the
 * design diagram in fact shows `lib/  # 仅本 Skill 使用的纯函数` under the same tree.
 * The rationale was invented after the fact to justify duplication that was merely
 * incidental. Recorded here because a fabricated constraint is more durable than the
 * duplication it protects — it makes the next reader stop looking.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import {
  CRITERION_STATES as KERNEL_STATES,
  CRITERION_TYPES as KERNEL_TYPES,
  EVIDENCE_RUNGS,
  RISK_DIMENSIONS as KERNEL_RISK_DIMENSIONS,
  RUNG_BASELINE,
  RUNG_CEILING,
  deriveRequiredRung as kernelDeriveRung,
  rungIndex as kernelRungIndex,
  rungSatisfies,
} from '../lib/vocabulary.mjs';
import {
  CRITERION_STATES as RUNTIME_STATES,
  CRITERION_TYPES as RUNTIME_TYPES,
  RUNGS,
  meetsRung,
  rungIndex as runtimeRungIndex,
} from '../protocols/runtime/evidence.mjs';
import {
  RISK_DIMENSIONS as RUNTIME_RISK_DIMENSIONS,
  deriveRequiredRung as runtimeDeriveRung,
} from '../protocols/runtime/risk.mjs';
import { BUDGETS, COUNT_LIMITS, SOFT_LIMITS } from '../lib/budgets.mjs';
import {
  ENVELOPE_BUDGET_BYTES,
  LAUNCH_BUDGET_BYTES,
  checkLaunchBudget,
  injectedBytes,
  projectEnvelope,
} from '../scripts/ingest-audit.mjs';
import { WORKER_SYSTEM_PROMPT } from '../scripts/dispatch-worker.mjs';
import { getSchema, SCHEMA_IDS } from '../schemas/registry.mjs';

test('both layers order the evidence ladder identically', () => {
  assert.deepEqual([...EVIDENCE_RUNGS], [...RUNGS]);
});

test('both layers agree on rung ordinals and comparison', () => {
  for (const rung of EVIDENCE_RUNGS) {
    assert.equal(kernelRungIndex(rung), runtimeRungIndex(rung), rung);
  }
  for (const achieved of EVIDENCE_RUNGS) {
    for (const required of EVIDENCE_RUNGS) {
      assert.equal(
        rungSatisfies(achieved, required),
        meetsRung(achieved, required),
        `${achieved} vs ${required}`,
      );
    }
  }
});

test('both layers recognize the same criterion types', () => {
  assert.deepEqual([...KERNEL_TYPES].sort(), Object.keys(RUNTIME_TYPES).sort());
});

test('both layers recognize the same criterion states', () => {
  assert.deepEqual([...KERNEL_STATES], [...RUNTIME_STATES]);
});

test('the kernel baselines and ceilings match the runtime type descriptors', () => {
  for (const type of KERNEL_TYPES) {
    const descriptor = RUNTIME_TYPES[type];
    assert.equal(RUNG_BASELINE[type], descriptor.baseline, `${type} baseline`);
    assert.equal(RUNG_CEILING[type], descriptor.maxRung, `${type} ceiling`);
  }
});

test('both layers define the same risk dimensions and value scales', () => {
  assert.deepEqual(
    Object.keys(KERNEL_RISK_DIMENSIONS).sort(),
    Object.keys(RUNTIME_RISK_DIMENSIONS).sort(),
  );
  for (const [dimension, values] of Object.entries(KERNEL_RISK_DIMENSIONS)) {
    assert.deepEqual([...values], [...RUNTIME_RISK_DIMENSIONS[dimension]], dimension);
  }
});

/** Every combination of type and a representative set of risk profiles. */
function riskProfiles() {
  const complete = {
    reversibility: 'easy',
    externality: 'private',
    blast_radius: 'one',
    undo_window: 'available',
    detectability: 'loud',
  };
  const profiles = [{}, complete];
  // One escalated dimension at a time, everything else benign.
  for (const [dimension, values] of Object.entries(RUNTIME_RISK_DIMENSIONS)) {
    for (const value of values) {
      profiles.push({ ...complete, [dimension]: value });
    }
  }
  return profiles;
}

test('the kernel and the runtime derive the same required rung everywhere', () => {
  let compared = 0;
  for (const type of KERNEL_TYPES) {
    for (const risk of riskProfiles()) {
      const kernel = kernelDeriveRung(type, risk);
      const runtime = runtimeDeriveRung({ type, risk });
      const context = `${type} / ${JSON.stringify(risk)}`;

      assert.equal(kernel.required, runtime.required, `required for ${context}`);
      assert.equal(kernel.ceiling, runtime.ceiling, `ceiling for ${context}`);
      assert.equal(kernel.attainable, !runtime.untestable, `attainability for ${context}`);
      compared += 1;
    }
  }
  assert.ok(compared > 100, `expected broad coverage, compared only ${compared}`);
});

test('an unassessed risk dimension raises rather than lowers the requirement', () => {
  // The fail-safe direction is the whole point: forgetting to assess a dimension
  // must never make a criterion easier to satisfy.
  for (const type of KERNEL_TYPES) {
    const unassessed = kernelDeriveRung(type, {});
    const benign = kernelDeriveRung(type, {
      reversibility: 'easy',
      externality: 'private',
      blast_radius: 'one',
      undo_window: 'available',
      detectability: 'loud',
    });
    assert.ok(
      kernelRungIndex(unassessed.required) >= kernelRungIndex(benign.required),
      `${type}: unassessed ${unassessed.required} must not be weaker than benign ${benign.required}`,
    );
  }
});

test('no criterion type can be escalated above its own ceiling silently', () => {
  for (const type of KERNEL_TYPES) {
    for (const risk of riskProfiles()) {
      const derived = kernelDeriveRung(type, risk);
      if (kernelRungIndex(derived.required) > kernelRungIndex(derived.ceiling)) {
        // The gap must be reported as unattainable, never capped into passability.
        assert.equal(derived.attainable, false, `${type} hides an unreachable requirement`);
      }
    }
  }
});

test('JUDGMENT and KNOWLEDGE are never agent-decidable in either layer', () => {
  for (const type of ['JUDGMENT', 'KNOWLEDGE', 'EFFECT']) {
    assert.equal(RUNTIME_TYPES[type].agentMayJudge, false, type);
  }
  for (const type of ['STATE', 'BEHAVIOR', 'ARTIFACT_PROPERTY', 'NEGATIVE']) {
    assert.equal(RUNTIME_TYPES[type].agentMayJudge, true, type);
  }
});

// ------------------------------------------------- shared budgets across layers

/**
 * Every place outside `lib/` that repeats a declared budget value, and why it is
 * allowed to repeat it instead of importing it.
 *
 * This registry exists because the pins below it were a hand-picked list. Pinning
 * `LAUNCH_BUDGET_BYTES` and friends stops *those* copies from drifting; it says
 * nothing about a fourth copy written next month. That is the same root cause as
 * the `RUNTIME_DIRS` whitelist and the A02 hardcoded module list: a hand-maintained
 * list of what to check stops covering whatever was added last, silently.
 *
 * `reason` is the load-bearing column. `pinned-below` means a test in this file
 * already ties the copy to the kernel value. `coincidence` means the number equals
 * a budget without being that budget — a different concept that happens to have
 * picked the same bound — and renaming or changing the budget must NOT change it.
 *
 * `count` is exact, not a floor. Registering presence alone was the first version
 * of this and mutation S1 killed it: adding a *second* copy of an already-registered
 * value to an already-registered file inherited the existing entry's exemption and
 * the scan stayed green. An exemption is granted to specific occurrences, not to a
 * (file, value) pair forever.
 *
 * Adding an entry is a deliberate act: the author has to state which case it is.
 */
const KNOWN_CROSS_LAYER_LITERALS = [
  // Real duplicates of a kernel budget, each pinned by a test below. JSON cannot import, so
  // these three cannot be deleted the way the `scripts/` copies were.
  { file: 'schemas/worker-output.schema.json', value: 400, count: 2, of: 'BUDGETS.WORKER_SUMMARY', reason: 'pinned-below' },
  { file: 'schemas/worker-input.schema.json', value: 400, count: 1, of: 'BUDGETS.WORKER_SUMMARY', reason: 'pinned-below' },
  // Same number, different concept. These are NOT copies of a budget: a criterion
  // statement, a goal object name and an interruption question have their own bounds
  // that happen to coincide. Changing WORKER_SUMMARY must not touch them.
  { file: 'schemas/criterion.schema.json', value: 400, count: 1, of: 'BUDGETS.WORKER_SUMMARY', reason: 'coincidence' },
  { file: 'schemas/interruption.schema.json', value: 400, count: 1, of: 'BUDGETS.WORKER_SUMMARY', reason: 'coincidence' },
  { file: 'schemas/goal.schema.json', value: 240, count: 1, of: 'BUDGETS.GOAL_SUMMARY', reason: 'coincidence' },
  { file: 'schemas/checkpoint.schema.json', value: 240, count: 1, of: 'BUDGETS.GOAL_SUMMARY', reason: 'coincidence' },
  // `CLOSE_GRACE_MS` is milliseconds of grace for a killed child's pipes to drain; the budget
  // it collides with is a count of events per journal segment. Different dimension, different
  // layer, no shared cause: retuning journal rollover must not move a dispatch timeout, and
  // vice versa. Registered rather than renumbered — picking a different value to silence this
  // guard would make the collision detector into a noise filter and leave the real question
  // ("does this cross-layer number have one source of truth?") unanswered.
  { file: 'scripts/dispatch-worker.mjs', value: 2000, count: 1, of: 'COUNT_LIMITS.JOURNAL_SEGMENT_EVENTS', reason: 'coincidence' },
];


/**
 * Values too common to attribute. A `3` or a `1024` in arbitrary code is not
 * evidence of a copied budget, and flagging every one would make the scanner noise
 * that gets suppressed rather than read.
 *
 * `1024` is listed despite equalling `WORKER_OUTPUT_ENVELOPE` because it is also the
 * KiB multiplier itself, so an occurrence carries no attribution either way. The
 * dispatch layer no longer writes it as a literal — it imports the budget — and the
 * behavioural tests below drive the real gate, so nothing rests on a text scan here.
 */
const UNATTRIBUTABLE_VALUES = new Set([0, 1, 2, 3, 4, 8, 10, 16, 100, 1024]);

const SCANNED_LAYER_DIRS = ['scripts', 'schemas'];

/** Declared value -> the budget names that declare it. */
function declaredValues() {
  const byValue = new Map();
  for (const [table, obj] of [
    ['BUDGETS', BUDGETS],
    ['SOFT_LIMITS', SOFT_LIMITS],
    ['COUNT_LIMITS', COUNT_LIMITS],
  ]) {
    for (const [name, value] of Object.entries(obj)) {
      if (!byValue.has(value)) byValue.set(value, []);
      byValue.get(value).push(`${table}.${name}`);
    }
  }
  return byValue;
}

function layerFiles() {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(mjs|json)$/.test(name)) found.push(full);
    }
  };
  for (const dir of SCANNED_LAYER_DIRS) walk(path.join(SKILL_ROOT, dir));
  return found;
}

/**
 * Numeric literals in a line, including simple products so `16 * 1024` is seen as
 * 16384 rather than as a 16 and a 1024. Comment-only lines are skipped: prose that
 * mentions a budget is documentation, not a second source of truth.
 */
function literalsIn(line) {
  if (/^\s*(\*|\/\/)/.test(line)) return [];
  const values = new Set();
  for (const m of line.matchAll(/\b(\d+)\s*\*\s*(\d+)\b/g)) values.add(Number(m[1]) * Number(m[2]));
  for (const m of line.matchAll(/\b(\d+)\b/g)) values.add(Number(m[1]));
  return [...values];
}

/** Count occurrences of each declared value, per scanned file. */
function scanOccurrences(declared) {
  const counts = new Map();
  for (const filePath of layerFiles()) {
    const relative = path.relative(SKILL_ROOT, filePath).split(path.sep).join('/');
    const lines = readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const value of literalsIn(line)) {
        if (!declared.has(value) || UNATTRIBUTABLE_VALUES.has(value)) continue;
        const key = `${relative}:${value}`;
        if (!counts.has(key)) counts.set(key, []);
        counts.get(key).push(index + 1);
      }
    });
  }
  return counts;
}

test('every cross-layer copy of a kernel budget is registered with a reason', () => {
  // The scanner, not the list, is what makes this hold: a fourth copy written into
  // scripts/ or schemas/ fails here until its author records whether it is a real
  // duplicate to pin or a coincidence to leave alone.
  const declared = declaredValues();
  const found = scanOccurrences(declared);
  const expected = new Map(KNOWN_CROSS_LAYER_LITERALS.map((e) => [`${e.file}:${e.value}`, e.count]));
  const problems = [];

  for (const [key, lines] of found) {
    const value = Number(key.slice(key.lastIndexOf(':') + 1));
    if (!expected.has(key)) {
      problems.push(`UNREGISTERED ${key} at line(s) ${lines.join(', ')} (= ${declared.get(value).join(' / ')})`);
    } else if (expected.get(key) !== lines.length) {
      // An exemption covers a stated number of occurrences. A new copy alongside an
      // already-registered one must not inherit the old entry's permission.
      problems.push(`COUNT CHANGED ${key}: registered ${expected.get(key)}, found ${lines.length} at line(s) ${lines.join(', ')}`);
    }
  }

  assert.deepEqual(
    problems,
    [],
    'cross-layer copies of a declared budget that the registry does not account for:\n' +
      `${problems.join('\n')}\n\n` +
      'Add or update KNOWN_CROSS_LAYER_LITERALS with reason "pinned-below" (and a test that pins it) ' +
      'or "coincidence" (a different concept that happens to share the number). ' +
      'Better still: import the constant from lib/budgets.mjs and delete the literal.',
  );
});

test('the cross-layer registry has no stale entries', () => {
  // A registry that outlives the copies it describes is the same unchecked
  // declaration in reverse: it would let a future copy of the same value inherit
  // an exemption written for code that no longer exists.
  const found = scanOccurrences(declaredValues());
  const stale = [];
  for (const entry of KNOWN_CROSS_LAYER_LITERALS) {
    if (!found.has(`${entry.file}:${entry.value}`)) {
      stale.push(`${entry.file} no longer holds ${entry.value} (${entry.of}) — delete this entry`);
    }
  }
  assert.deepEqual(stale, [], `stale KNOWN_CROSS_LAYER_LITERALS entries:\n${stale.join('\n')}`);
});

test('every registered duplicate declares one of the two allowed reasons', () => {
  const allowed = new Set(['pinned-below', 'coincidence']);
  for (const entry of KNOWN_CROSS_LAYER_LITERALS) {
    assert.ok(
      allowed.has(entry.reason),
      `${entry.file}:${entry.value} has reason "${entry.reason}" — must be pinned-below or coincidence`,
    );
    assert.ok(entry.of, `${entry.file}:${entry.value} must name the budget it duplicates`);
    assert.ok(
      Number.isInteger(entry.count) && entry.count > 0,
      `${entry.file}:${entry.value} must register an exact positive occurrence count`,
    );
  }
});

test('the worker system prompt states the same summary bound the projection enforces', () => {
  // The prompt now interpolates the budget rather than spelling it out, so this guards the
  // interpolation itself: if the template stopped referencing the budget, or referenced a
  // different one, the worker would be instructed to overrun its own envelope and the mismatch
  // would surface as silently trimmed summaries rather than an error.
  assert.match(WORKER_SYSTEM_PROMPT, new RegExp(`<=${BUDGETS.WORKER_SUMMARY} bytes`));
});

/**
 * The dispatch-layer aliases are now `export const X = BUDGETS.Y`, so asserting
 * `X === BUDGETS.Y` compares a value to itself: no edit to either side can make it
 * red. Two such assertions used to live here, left behind when the duplicated
 * literals they guarded were replaced by the import. Removing duplication removed
 * the drift class, but a tautology is worse than nothing — it reads as coverage.
 *
 * `protocols/dispatch.md` §2 is the one authority genuinely independent of the
 * kernel: prose a human wrote, which cannot import a constant. It is also what a
 * reader trusts when deciding what to send a worker. So the surviving question is
 * not "do the two code copies agree" (there is one copy) but "does the code enforce
 * what the document promises". That is what this parses.
 */
test('the documented dispatch budgets are the ones the kernel enforces', () => {
  const doc = readFileSync(path.join(SKILL_ROOT, 'protocols', 'dispatch.md'), 'utf8');
  // Rows look like: `| input envelope JSON | 2 KiB | ... |`
  const rows = [...doc.matchAll(/^\|([^|]+)\|\s*(\d+)\s*KiB\s*\|/gm)]
    .map(([, label, kib]) => ({ label: label.trim(), bytes: Number(kib) * 1024 }));

  // Guard the parser before trusting its verdict: a regex that silently matches
  // nothing would make every expectation below vacuously true.
  assert.ok(rows.length >= 3, `parsed ${rows.length} budget rows from dispatch.md §2, expected >=3`);

  const documented = (needle) => {
    const hits = rows.filter((row) => row.label.includes(needle));
    assert.equal(hits.length, 1, `expected exactly one dispatch.md row matching ${needle}, got ${hits.length}`);
    return hits[0].bytes;
  };

  assert.equal(documented('input envelope JSON'), BUDGETS.WORKER_INPUT_ENVELOPE);
  assert.equal(documented('总启动载荷'), LAUNCH_BUDGET_BYTES);
  assert.equal(documented('artifact slices'), SOFT_LIMITS.ARTIFACT_SLICE_TOTAL);

  // The output envelope is stated in prose (§3's `RETURN ≤1 KiB TO MAIN MODEL`)
  // rather than the table, so it is matched where it actually lives.
  const envelopeKib = ENVELOPE_BUDGET_BYTES / 1024;
  assert.match(doc, new RegExp(`RETURN ≤${envelopeKib} KiB TO MAIN MODEL`));
});

test('the launch gate rejects at the kernel budget, one byte over and not before', () => {
  // Pinning the exported constant is not enough on its own: the gate could read a
  // different default. This drives the real gate at both sides of the boundary.
  const atLimit = injectedBytes({ userPrompt: 'x'.repeat(BUDGETS.WORKER_LAUNCH_TOTAL) });
  assert.equal(checkLaunchBudget(atLimit).ok, true, 'exactly at budget must be accepted');

  const overLimit = injectedBytes({ userPrompt: 'x'.repeat(BUDGETS.WORKER_LAUNCH_TOTAL + 1) });
  const rejected = checkLaunchBudget(overLimit);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.limit, BUDGETS.WORKER_LAUNCH_TOTAL);
  assert.equal(rejected.bytes, BUDGETS.WORKER_LAUNCH_TOTAL + 1);
});

test('projectEnvelope clamps the summary to the kernel WORKER_SUMMARY budget', () => {
  // Asserted through behaviour rather than by reading the literal out of the
  // source: what protects the main model is what the function does.
  const ascii = projectEnvelope(
    { status: 'SUCCEEDED', summary: 'z'.repeat(BUDGETS.WORKER_SUMMARY * 10) },
    { dispatchId: 'd-ascii' },
  );
  // ASCII input makes the clamp exact, so a loosened cap cannot hide behind a
  // multi-byte boundary retreat.
  assert.equal(Buffer.byteLength(ascii.envelope.summary, 'utf8'), BUDGETS.WORKER_SUMMARY);

  const multibyte = projectEnvelope(
    { status: 'SUCCEEDED', summary: '中'.repeat(BUDGETS.WORKER_SUMMARY) },
    { dispatchId: 'd-cjk' },
  );
  const cjkBytes = Buffer.byteLength(multibyte.envelope.summary, 'utf8');
  assert.ok(cjkBytes <= BUDGETS.WORKER_SUMMARY, `summary ${cjkBytes} bytes over budget`);
  // A clamp that retreated further than one character would be over-trimming.
  assert.ok(cjkBytes > BUDGETS.WORKER_SUMMARY - 3, `summary ${cjkBytes} bytes trimmed too far`);
  assert.doesNotMatch(multibyte.envelope.summary, /�/);
});

test('projectEnvelope keeps claims and artifact refs within the kernel count limits', () => {
  const overfull = projectEnvelope(
    {
      status: 'SUCCEEDED',
      summary: 'ok',
      claims: Array.from({ length: COUNT_LIMITS.WORKER_OUTPUT_CLAIMS * 3 }, (_, i) => ({
        kind: 'fact_found',
        subject_ref: `s${i}`,
        result: 'r',
      })),
      artifact_refs: Array.from({ length: COUNT_LIMITS.WORKER_OUTPUT_ARTIFACT_REFS * 3 }, (_, i) => `a-${i}`),
    },
    { dispatchId: 'd-counts', artifactRef: 'artifacts/raw/d-counts.raw' },
  );

  // Small enough to stay under 1 KiB, so the caps are what bind here rather than
  // the byte gate dropping the arrays wholesale.
  assert.equal(overfull.envelope.claims.length, COUNT_LIMITS.WORKER_OUTPUT_CLAIMS);
  assert.equal(overfull.envelope.artifact_refs.length, COUNT_LIMITS.WORKER_OUTPUT_ARTIFACT_REFS);
});

test('the worker-output schema encodes the same bounds the projection enforces', () => {
  // Third copy of the same numbers. The schema is what a worker's reply is
  // validated against, so a schema that drifted looser would admit an envelope the
  // projection would then have to silently trim.
  const schema = getSchema(SCHEMA_IDS.WORKER_OUTPUT);
  assert.equal(schema.properties.summary.maxBytes, BUDGETS.WORKER_SUMMARY);
  assert.equal(schema.properties.claims.maxItems, COUNT_LIMITS.WORKER_OUTPUT_CLAIMS);
  assert.equal(schema.properties.artifact_refs.maxItems, COUNT_LIMITS.WORKER_OUTPUT_ARTIFACT_REFS);
});

test('the worker-input schema caps the requested envelope at the output budget', () => {
  const schema = getSchema(SCHEMA_IDS.WORKER_INPUT);
  assert.equal(
    schema.properties.expected_output.properties.max_envelope_bytes.maximum,
    BUDGETS.WORKER_OUTPUT_ENVELOPE,
  );
});

test('the worker-input schema caps the objective at the summary budget', () => {
  // One decidable objective, same 400-byte ceiling as a worker summary.
  const schema = getSchema(SCHEMA_IDS.WORKER_INPUT);
  assert.equal(schema.properties.objective.maxBytes, BUDGETS.WORKER_SUMMARY);
});

test('ARTIFACT_SLICE_TOTAL gains a gate on the day slice reading appears', async () => {
  // Tripwire, not coverage. `SOFT_LIMITS.ARTIFACT_SLICE_TOTAL` is declared with no
  // gate because nothing slices artifacts yet — reserving a number is legitimate.
  // What is not legitimate is shipping the slice reader while the number stays a
  // comment, which is how the other declared-only budgets got that way.
  //
  // This is a plain test rather than a `todo`: node:test keeps a failing `todo` out
  // of the fail count and out of the exit code, so marking it would produce a
  // tripwire that cannot fail the build — the very pattern this suite exists to
  // remove. It passes today because slicing genuinely does not exist, and it goes
  // red the moment it does.
  const artifacts = await import('../lib/artifacts.mjs');
  const slicing = Object.keys(artifacts).filter((name) => /slice/i.test(name));
  assert.deepEqual(slicing, [], `slice reading exists (${slicing.join(', ')}) — ARTIFACT_SLICE_TOTAL needs a real gate`);
});
