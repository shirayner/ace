#!/usr/bin/env node
/**
 * Does `tree-snapshot.mjs --verify` actually distinguish the four cases it claims to?
 *
 * `--verify` guards the SECOND window: team-lead took two red tests from an intact run
 * window, then opened the sources to explain them, and by that point the tree had moved
 * to `fadd42b7115a` -- the mechanism he nearly reported rested on a line that had not
 * existed during the run that produced the red. Counts survive a closed window;
 * mechanisms do not. `--verify` is what makes that difference checkable.
 *
 * A guard needs its own falsification, or it is the vacuous-assertion shape again -- an
 * always-exit-0 `--verify` would look identical in every report that cites it. So each
 * case below is paired with a MUTATION of the tool, and the case must flip when the
 * tool is broken. A case that cannot fail is reported as VACUOUS, not as passing.
 *
 * Runs entirely on a synthetic tree in `os.tmpdir()`; the repository is never touched.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TOOL_SOURCE = path.join(import.meta.dirname, 'tree-snapshot.mjs');

/** The tool locates its watched tree relative to itself, so the copy needs the same depth. */
const TOOL_RELATIVE_HOME = path.join('.ace', 'tasks', 'implement-auto-goal-v2', 'artifacts');
const SKILL_RELATIVE = path.join('plugin', 'skills', 'auto-goal-v2');

function buildFakeTree(mutateTool = source => source) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ace-readwin-'));
  const home = path.join(root, TOOL_RELATIVE_HOME);
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'tree-snapshot.mjs'), mutateTool(readFileSync(TOOL_SOURCE, 'utf8')));
  for (const dir of ['lib', 'scripts', 'tests']) {
    const full = path.join(root, SKILL_RELATIVE, dir);
    mkdirSync(full, { recursive: true });
    writeFileSync(path.join(full, `${dir}-sample.mjs`), `export const where = '${dir}';\n`);
  }
  return { root, tool: path.join(home, 'tree-snapshot.mjs') };
}

/**
 * The same tool, placed so that its ledger lands INSIDE the tree it samples.
 *
 * The tool derives `SKILL_ROOT` as four levels up plus `plugin/skills/auto-goal-v2`, so putting it
 * at `<root>/plugin/skills/auto-goal-v2/artifacts/` makes four-up equal `<root>` and the sampled
 * root the tool's own grandparent -- `.snapshots/` is then under measurement. That is the only
 * layout this misconfiguration can take, and it is one relocated path away from real.
 */
function buildSelfSamplingTree(mutateTool = source => source) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ace-readwin-self-'));
  const home = path.join(root, SKILL_RELATIVE, 'artifacts');
  mkdirSync(home, { recursive: true });
  writeFileSync(path.join(home, 'tree-snapshot.mjs'), mutateTool(readFileSync(TOOL_SOURCE, 'utf8')));
  return { root, tool: path.join(home, 'tree-snapshot.mjs') };
}

function run(tool, args) {
  const result = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/**
 * Open and close a window over a no-op command, returning the recorded digest AS PRINTED --
 * i.e. with its surface label (`all-3:4f580fbdb890`), because that is the string the tool hands
 * the reader and therefore the string a citation will contain.
 */
function closedWindowDigest(tool) {
  const { status, out } = run(tool, ['--run', `${JSON.stringify(process.execPath)} -e ""`]);
  const digest = out.match(/WINDOW CLOSE .*digest=(\S+)/)?.[1];
  if (status !== 0 || !digest) throw new Error(`could not open a clean window: ${out}`);
  return digest;
}

const SAMPLE = path.join(SKILL_RELATIVE, 'lib', 'lib-sample.mjs');

/**
 * Each case: set up a tree, produce a digest, perturb, then verify. `expect` is what a
 * correct tool must do; `killedBy` names the tool mutation that must make the case stop
 * matching. A case with no mutation that can break it is proving nothing, so every case
 * carries its own -- see the note on `MUTATIONS` for why one global mutation was not
 * enough. `marker` may be a string or a RegExp; `build` defaults to the ordinary tree.
 */
const CASES = [
  {
    id: 'V1',
    what: 'unchanged tree -> reading may be explained from these sources',
    expect: { status: 0, marker: 'READ WINDOW INTACT' },
    killedBy: 'alwaysBroken',
    act: ({ tool }) => run(tool, ['--verify', closedWindowDigest(tool)]),
  },
  {
    id: 'V2',
    what: 'a watched file was rewritten after the run -> mechanism may not be cited',
    expect: { status: 4, marker: 'READ WINDOW BROKEN' },
    killedBy: 'blindVerify',
    act: ({ root, tool }) => {
      const digest = closedWindowDigest(tool);
      writeFileSync(path.join(root, SAMPLE), 'export const where = "rewritten after the run";\n');
      return run(tool, ['--verify', digest]);
    },
  },
  {
    id: 'V3',
    what: 'mtime moved but every byte is identical -> still explainable (no false alarm)',
    expect: { status: 0, marker: 'READ WINDOW INTACT (bytes)' },
    killedBy: 'alwaysBroken',
    act: ({ root, tool }) => {
      const digest = closedWindowDigest(tool);
      const later = new Date(Date.now() + 60_000);
      utimesSync(path.join(root, SAMPLE), later, later);
      return run(tool, ['--verify', digest]);
    },
  },
  {
    id: 'V4',
    what: 'a digest with no recorded file list -> refuses, and says why it cannot name files',
    expect: { status: 4, marker: 'no recorded file list' },
    killedBy: 'blindVerify',
    act: ({ tool }) => run(tool, ['--verify', 'ffffffffffff']),
  },
  {
    id: 'V5',
    what: 'no digest supplied -> usage error, not a silent pass',
    expect: { status: 2, marker: 'needs the digest' },
    killedBy: 'dropUsageGuard',
    act: ({ tool }) => run(tool, ['--verify']),
  },
  {
    id: 'V6',
    what: 'an intact --run hands the reader the digest that gates the explanation',
    expect: { status: 0, marker: 'before reading any source to explain this reading, run: --verify' },
    killedBy: 'dropCitationHint',
    act: ({ tool }) => run(tool, ['--run', `${JSON.stringify(process.execPath)} -e ""`]),
  },
  {
    // The label is what makes a cross-surface citation visible to a HUMAN. The tool was already
    // safe (team-lead forged a 46-file ledger against the real tree and got exit 4 with 43 ADDED),
    // but a digest that does not say which surface made it is a premise the reader has to carry in
    // their head -- and that premise already failed once in the report.
    id: 'V7',
    what: 'every printed digest carries its sampling surface, so two surfaces cannot look alike',
    expect: { status: 0, marker: /--verify all-\d+:[0-9a-f]{12}/ },
    killedBy: 'dropSurfaceLabel',
    act: ({ tool }) => run(tool, ['--run', `${JSON.stringify(process.execPath)} -e ""`]),
  },
  {
    // Refusing is not enough; refusing for the RIGHT REASON is the point. Reported as drift, a
    // cross-surface claim sends the reader hunting a write that never happened.
    id: 'V8',
    what: 'a claim from another surface is refused as uncomparable, not misreported as drift',
    expect: { status: 5, marker: 'READ WINDOW UNCOMPARABLE' },
    killedBy: 'dropSurfaceGuard',
    act: ({ tool }) => run(tool, ['--verify', 'lib-46:3ee4f8e4a2ec']),
  },
  {
    // If the ledger sat inside the sampled tree, recording a snapshot would move the digest just
    // recorded: every later --verify would report BROKEN and the guard would void its own
    // observations while looking like a permanently dirty tree.
    id: 'V9',
    what: 'a ledger inside the sampled tree is refused at load, not tolerated into self-voiding',
    expect: { status: 1, marker: 'is inside the sampled tree' },
    killedBy: 'dropLedgerGuard',
    build: buildSelfSamplingTree,
    act: ({ tool }) => run(tool, ['--verify', 'ffffffffffff']),
  },
  {
    // The asymmetry this pair closes: `--verify` reported `INTACT (bytes)` for a pure touch from
    // the day it was written (V3), while `--run` compared only the mtime-bearing digest and
    // called the SAME event `VIOLATED / VOID`. One tool, two verdicts, and the strict one gated
    // exactly the timing runs team-lead was taking -- two readings were discarded before the
    // volume journal showed the cause was a zero-byte touch (BASIC_INFO_CHANGE, no DATA_* bits).
    id: 'V10',
    what: 'a --run spanning a pure touch reports TOUCHED and warns that timing readings are contaminated',
    expect: { status: 0, marker: /WINDOW TOUCHED[\s\S]*contaminated/ },
    killedBy: 'touchIsVoid',
    act: ({ root, tool }) => {
      const target = path.join(root, SAMPLE);
      // Touch DURING the window, from inside the guarded command -- the real shape of the event.
      const cmd = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
        `const {utimesSync}=require('node:fs');const t=new Date(Date.now()+60000);utimesSync(${JSON.stringify(target)},t,t);`,
      )}`;
      return run(tool, ['--run', cmd]);
    },
  },
  {
    // The other side of the same branch. A tolerant TOUCHED must not become a hole through which
    // real byte changes pass: a run that rewrites content is still VOID, and the new branch is
    // only reachable when every content hash matches.
    id: 'V11',
    what: 'a --run that rewrites bytes is still VOID, not softened into TOUCHED',
    expect: { status: 3, marker: /WINDOW VIOLATED[\s\S]*CHANGED/ },
    killedBy: 'touchAlways',
    act: ({ root, tool }) => {
      const target = path.join(root, SAMPLE);
      const cmd = `${JSON.stringify(process.execPath)} -e ${JSON.stringify(
        `require('node:fs').writeFileSync(${JSON.stringify(target)},'export const where = "rewritten mid-run";\\n');`,
      )}`;
      return run(tool, ['--run', cmd]);
    },
  },
  {
    // The `status` fork arrived with NO killer, and the probe went 11/11 green across the run that
    // followed it -- a green sheet over an unguarded property, which is the exact thing this file
    // exists to refuse. Both directions are needed and neither implies the other:
    //
    // V12  a run that never started must NOT be called admissible   (the deceptive direction)
    // V13  a run that did produce a reading MUST still be called admissible  (or the fork is
    //      pure noise: a tool that never says "admissible" carries no information either)
    // V14  a run that DID run and then failed must be told apart from one that never started --
    //      the fork's first version printed the same sentence for both and left the reader to
    //      resolve "if this exit came from the command not starting"; stdout bytes settle it.
    //
    // `blindStatus` kills V12 only and `alwaysUnstarted` kills V14 only, so a single mutation over
    // this fork would have left the others unfalsified -- the asymmetry the exemption-list lesson
    // is about, arriving here as three cases rather than one case plus a note.
    id: 'V12',
    what: 'an INTACT window over a command that never started is not called admissible',
    expect: { status: 1, marker: /THERE IS NO READING HERE[\s\S]*ZERO bytes on stdout/ },
    killedBy: 'blindStatus',
    act: ({ tool }) => run(tool, ['--run', `${JSON.stringify(process.execPath)} no/such/path.mjs`]),
  },
  {
    id: 'V13',
    what: 'an INTACT window over a run that did exit 0 is still called admissible',
    expect: { status: 0, marker: 'reading is admissible' },
    killedBy: 'neverAdmissible',
    act: ({ tool }) => run(tool, ['--run', `${JSON.stringify(process.execPath)} -e ""`]),
  },
  {
    id: 'V14',
    what: 'a run that produced output and then failed is distinguished from one that never started',
    expect: { status: 7, marker: /THE RUN FAILED[\s\S]*so a reading exists/ },
    killedBy: 'alwaysUnstarted',
    act: ({ tool }) => run(tool, ['--run',
      `${JSON.stringify(process.execPath)} -e "console.log('a reading');process.exit(7)"`]),
  },
];

function replaceOnce(source, target, replacement) {
  if (!source.includes(target)) throw new Error(`mutation target not found; the probe is stale: ${target.slice(0, 60)}`);
  return source.replace(target, replacement);
}

const VERIFY_ENTRY = 'const now = snapshot();\n  const recorded = loadSnapshot(claimed);';

/**
 * One mutation per property, because a single mutation cannot falsify every case.
 *
 * The first draft used only `blindVerify` (always report INTACT) and exempted the cases it
 * could not touch. That was backwards: V1 asserts INTACT, so an always-INTACT tool passes
 * it -- the case was scored VACUOUS and the exemption list was hiding the fact that the
 * POSITIVE branch had no falsifier at all. A positive claim needs a mutation that breaks
 * positives (`alwaysBroken`); exempting it just relabels the hole.
 */
const MUTATIONS = {
  // Invisible in any report: a mechanism "verified" by this tool would read identically.
  blindVerify: source => replaceOnce(source, VERIFY_ENTRY,
    `${VERIFY_ENTRY}\n  { console.log('READ WINDOW INTACT  mutated  digest=' + now.digest); process.exit(0); }`),
  // The mirror image: a tool that always refuses would train readers to ignore it.
  alwaysBroken: source => replaceOnce(source, VERIFY_ENTRY,
    `${VERIFY_ENTRY}\n  { console.error('READ WINDOW BROKEN  mutated'); process.exit(4); }`),
  dropUsageGuard: source => replaceOnce(source,
    "if (!claimedArg) {\n    console.error('--verify needs the digest printed by the run you are about to explain');\n    process.exit(2);\n  }",
    '/* usage guard removed */'),
  dropCitationHint: source => replaceOnce(source,
    'console.log(`  before reading any source to explain this reading, run: --verify ${surfaceLabel(after)}`);',
    '/* citation hint removed */'),
  // The pre-label tool: digests print bare, so `all-89:fc5b7b11d834` and a 46-file digest are
  // again the same shape on the page. Kills V7 only -- V8's refusal is a separate mechanism.
  dropSurfaceLabel: source => replaceOnce(source,
    'const surfaceLabel = (snap) => `${SURFACE_POLICY}-${snap.entries.length}:${snap.digest}`;',
    'const surfaceLabel = (snap) => snap.digest;'),
  // Keeps the label but drops the refusal: a foreign-surface claim then falls through to the
  // ordinary comparison and comes back as BROKEN-with-drift, i.e. the right verdict for the
  // wrong reason. This is the mutation that proves V8 tests the REASON, not just the exit code.
  dropSurfaceGuard: source => replaceOnce(source, 'if (surfaceMismatch) {', 'if (false) {'),
  dropLedgerGuard: source => replaceOnce(source,
    'if (path.resolve(LEDGER_DIR).startsWith(path.resolve(SKILL_ROOT) + path.sep)) {',
    'if (false) {'),
  // The pre-fix `--run`: the strongest INTACT printed over the emptiest reading. Forces the
  // admissible branch regardless of exit status or bytes produced, which is the direction that
  // gets quoted in a report.
  blindStatus: source => replaceOnce(source, 'if (status === 0) {', 'if (true) {'),
  // The opposite collapse, aimed at the byte measurement rather than the status. It still
  // "refuses", so it looks conservative -- but a tool that calls every failing run empty stops
  // distinguishing "never started" from "ran and failed", which is the distinction the three-way
  // fork exists for, and V14 is the only case that can see it.
  alwaysUnstarted: source => replaceOnce(source, '} else if (outBytes === 0) {', '} else if (true) {'),
  // V13's own falsifier. `alwaysUnstarted` cannot be it: V13 exits 0 and never reaches the branch
  // that mutation rewrites, so V13 passed the mutant and the probe scored it VACUOUS -- the same
  // hole, one layer up, found by the same mechanism. A positive claim ("this DID certify") needs a
  // mutation that suppresses certification, so this one denies the admissible branch instead.
  neverAdmissible: source => replaceOnce(source, 'if (status === 0) {', 'if (false) {'),
  // The pre-fix `--run`: no content-level branch, so a pure touch is VOID again. This is the
  // regression V10 exists to catch, and it is the tool's actual behaviour until today.
  touchIsVoid: source => replaceOnce(source, 'if (before.contentDigest === after.contentDigest) {', 'if (false) {'),
  // The over-correction in the other direction: treat every drift as mtime-only. Real byte
  // changes would then print TOUCHED and exit with the command's own status, so a run that
  // rewrote the tree under itself would read as citable. Kills V11.
  touchAlways: source => replaceOnce(source, 'if (before.contentDigest === after.contentDigest) {', 'if (true) {'),
};

/** `marker` is a string or a RegExp; a RegExp is needed where the expected text carries a digest. */
const hit = (out, marker) => (marker instanceof RegExp ? marker.test(out) : out.includes(marker));

const rows = [];
for (const testCase of CASES) {
  const build = testCase.build ?? buildFakeTree;
  const honest = build();
  const broken = build(MUTATIONS[testCase.killedBy]);
  try {
    const real = testCase.act(honest);
    const matched = real.status === testCase.expect.status && hit(real.out, testCase.expect.marker);

    const mutated = testCase.act(broken);
    const stillMatches = mutated.status === testCase.expect.status && hit(mutated.out, testCase.expect.marker);

    let verdict;
    let detail = '';
    if (!matched) {
      verdict = 'FAILED';
      detail = `expected exit ${testCase.expect.status} + "${testCase.expect.marker}", got exit ${real.status}: ${real.out.trim().split('\n').slice(-2).join(' | ').slice(0, 150)}`;
    } else if (stillMatches) {
      // Passing against both the honest and the broken tool means the case is insensitive
      // to the property it claims to test. D3: report it, never count it as coverage.
      verdict = 'VACUOUS';
      detail = `this case also passes against the ${testCase.killedBy} mutation`;
    } else {
      verdict = 'PASSED-AND-SENSITIVE';
      detail = `killed by ${testCase.killedBy}; live: ${real.out.trim().split('\n')[0].slice(0, 80)}`;
    }
    rows.push({ ...testCase, verdict, detail });
  } finally {
    rmSync(honest.root, { recursive: true, force: true });
    rmSync(broken.root, { recursive: true, force: true });
  }
  const row = rows.at(-1);
  console.log(`${row.id.padEnd(4)} ${row.verdict.padEnd(22)} ${row.what}`);
  if (row.detail) console.log(`${' '.repeat(28)}${row.detail}`);
}

// No exemptions: every case names a mutation that must kill it, so any VACUOUS verdict is
// a real hole rather than a category the harness declined to test.
const bad = rows.filter(r => r.verdict !== 'PASSED-AND-SENSITIVE');

console.log(bad.length === 0
  ? `\nAll ${rows.length} cases pass and each is provably sensitive to its own mutation.`
  : `\nUNEXPECTED: ${bad.map(r => `${r.id}=${r.verdict}`).join(', ')}`);
process.exit(bad.length === 0 ? 0 : 1);
