/**
 * Is the low-frequency `dispatch-pipeline` red the #20 mechanism wearing a different assertion?
 *
 * Observed on the fixed 89-file guard, all windows INTACT, same digest `all-89:891c21fa1bf6`:
 * 2 reds in 25 full-suite rounds, and the red MIGRATED between assertions --
 *   round 3: `B5 SEMANTIC: a DISCOVER worker declaring a criterion checked ...`
 *            actual `cli_output_unparseable`, expected `worker_output_semantic_invalid`
 *   fs6    : `B5 SEMANTIC: SUCCEEDED carrying an error object is refused`
 *            actual `parse`, expected `semantic`
 * The same file alone went 0/10. Load-shape dependence plus a migrating assertion is the #20
 * signature, and `cli_output_unparseable` is exactly what an EMPTY stdout yields
 * (`dispatch-worker.mjs:616` -- `JSON.parse('')` throws, so the parse stage claims the rejection).
 *
 * But "consistent with" is not "confirmed". Two histories produce an empty capture:
 *   (a) the child never ran -- Windows failed to load the freshly built image (#20's mechanism),
 *       which shows as a 0xC00000xx exit code and zero bytes;
 *   (b) the dispatcher collected stdout before it was drained -- a product defect, and the real
 *       hazard, which would show a NORMAL exit code (0) with zero or partial bytes.
 * The assertion prints neither, so on its face the red cannot tell a platform fault from a
 * dispatcher fault. That is the finding either way; the exit code decides which.
 *
 * So: copy the real suite to tmpdir, rewrite its relative imports to absolute so the copy still
 * loads real product code and the real fixture, and print `exit_code` / `raw_bytes` / `timed_out`
 * whenever a dispatch comes back rejected. Run it ALONGSIDE the other real suite files so the load
 * shape that produces the red is preserved -- the same reason the file alone proves nothing.
 * The repository is not modified.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const SKILL = path.join(REPO_ROOT, 'plugin', 'skills', 'auto-goal-v2');
const TESTS = path.join(SKILL, 'tests');
const posix = (p) => p.replace(/\\/g, '/');

const SUITE = 'dispatch-pipeline.test.mjs';
const source = fs.readFileSync(path.join(TESTS, SUITE), 'utf8');

/**
 * The instrumentation hooks the harness, not the individual tests: every dispatch in the file
 * flows through `dispatchAgainstStub`, so one wrapper covers all of them and cannot miss the
 * assertion that happens to fail next time. Hooking a specific test would bake in the guess that
 * the red stays put -- and the red has already moved once.
 */
const HARNESS = 'function dispatchAgainstStub({ taskRoot, dispatchId, reply, stubEnv = {}, ...rest }) {';
if (!source.includes(HARNESS)) {
  throw new Error('the pipeline harness signature changed; re-read the suite before trusting this probe');
}

let instrumented = source
  .replace(/from '(\.\.\/[^']+)'/g, (_m, rel) => `from 'file://${posix(path.join(TESTS, rel))}'`)
  .replace(/join\(HERE, 'fixtures'/g, `join('${posix(TESTS)}', 'fixtures'`)
  .replace(HARNESS, `${HARNESS}
  const __probeId = dispatchId;`);

// Wrap the harness's return so every rejected dispatch reports the two fields the assertion hides.
const RETURN_MARKER = 'return dispatchWorker({';
if (!instrumented.includes(RETURN_MARKER)) {
  throw new Error('the pipeline harness no longer calls dispatchWorker directly; probe is stale');
}
instrumented = instrumented.replace(RETURN_MARKER, `return __probeWrap(__probeId, dispatchWorker({`);

// Close the extra paren the wrapper opened. `\n  });\n}` occurs 30 times in this file, and
// `String.replace` with a string replaces only the FIRST -- which happens to be the harness's.
// "Happens to be" is not a premise worth resting on, so assert it: the first occurrence must be
// the first one at or after the harness call. If a new function is ever added above the harness,
// this throws instead of silently instrumenting the wrong call.
const CALL_END = '\n  });\n}';
const harnessAt = instrumented.indexOf('return __probeWrap(__probeId, dispatchWorker({');
const firstEnd = instrumented.indexOf(CALL_END);
if (firstEnd === -1) {
  throw new Error('could not find the end of the dispatchWorker call; probe is stale');
}
if (firstEnd !== instrumented.indexOf(CALL_END, harnessAt)) {
  throw new Error(`the first "${CALL_END.trim()}" is no longer the harness's (first at ${firstEnd}, harness at ${harnessAt}); probe would instrument the wrong call`);
}
instrumented = instrumented.replace(CALL_END, `\n  }));\n}

async function __probeWrap(id, promise) {
  const result = await promise;
  const { envelope, audit } = result;
  if (envelope?.status !== 'ACCEPTED' && envelope?.reason) {
    console.error(\`    [instr] \${id} reason=\${envelope.reason} stage=\${audit?.rejected_stage} exit=\${audit?.exit_code} raw_bytes=\${audit?.raw_bytes} timed_out=\${audit?.timed_out}\`);
  }
  return result;
}`);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-pipe-instr-'));
const copy = path.join(dir, 'instr-pipeline.test.mjs');
fs.writeFileSync(copy, instrumented);
console.log(`instrumented copy: ${copy}`);

/** Every other suite file, real and unmodified -- the load that makes the red appear at all. */
const others = fs.readdirSync(TESTS)
  .filter((f) => f.endsWith('.test.mjs') && f !== SUITE)
  .map((f) => path.join(TESTS, f));
const repoTests = path.join(REPO_ROOT, 'tests');
if (fs.existsSync(repoTests)) {
  for (const f of fs.readdirSync(repoTests).filter((f) => f.endsWith('.test.mjs'))) {
    others.push(path.join(repoTests, f));
  }
}
console.log(`load shape: instrumented pipeline + ${others.length} real suite files\n`);

const ROUNDS = Number(process.env.PROBE_ROUNDS ?? 12);
let reds = 0;
for (let i = 1; i <= ROUNDS; i += 1) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', copy, ...others], {
    cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, ACE_REQUIRE_STUB_BACKEND: '1' },
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const fail = Number(/^# fail (\d+)$/m.exec(out)?.[1] ?? -1);
  // A count from a detector that cannot see a red is worthless; -1 means the TAP summary is
  // missing, so report that rather than a zero.
  if (fail < 0) {
    console.log(`round ${i}  NO TAP SUMMARY -- this round yields no count`);
    continue;
  }
  const failing = out.match(/^not ok \d+ - .*/gm) ?? [];
  const instr = out.match(/\[instr\][^\n]*/g) ?? [];
  if (fail === 0) {
    console.log(`round ${i}  GREEN  (${instr.length} rejected dispatches, all expected)`);
    continue;
  }
  reds += 1;
  console.log(`round ${i}  RED  fail=${fail}`);
  for (const line of failing) console.log(`         ${line.slice(0, 110)}`);
  // Only the lines that mention an unexpected shape matter, but print them all: which dispatch id
  // was affected is part of the evidence, and filtering here would be another guess.
  for (const line of instr) console.log(`         ${line.trim()}`);
}
console.log(`\n---> ${reds} red of ${ROUNDS} rounds`);
