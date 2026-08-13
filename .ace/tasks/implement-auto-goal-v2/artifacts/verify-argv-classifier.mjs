// Two questions about the argv classifier, and a rate estimate that decides how to ask the second.
//
// Q1 (mutation, cheap and decisive): does the split have power in BOTH directions? A classifier
// that always says "environment" is as useless as the bare `notEqual` it replaced -- it would
// excuse the shell-in-the-path defect as a bad day. Injected faults, both arms:
//   E-arm: argv=null + a loader exit code + 0 bytes  -> must say ENVIRONMENT
//   C-arm: argv=null + exit 0 + bytes present        -> must say CONTRACT
//
// Q2 (the flake itself): docs-wiring measured ~2/25 for dispatch-pipeline's `parse` red. Per D5b
// the honest move is to estimate p first, then size n -- so this run does NOT claim to settle
// whether the flake is fixed. It reports the observed rate with its n and the absence probability
// at that n, which is the reading D5b (3) requires.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SUITE = 'plugin/skills/auto-goal-v2/tests/dispatch-argv-integrity.test.mjs';
const source = fs.readFileSync(SUITE, 'utf8');
const HELPER = '  if (argv !== null) return argv;';
if (!source.includes(HELPER)) throw new Error('classifier not found; harness is stale');

// Each fault forces the null branch with a specific audit, so the classifier is fed the exact
// world it claims to distinguish. This is injection at the observation point, not a stubbed
// classifier: the real function decides.
const ARMS = [
  {
    name: 'E-arm: loader failure (exit 3221225539, 0 bytes)',
    inject: '  if (true) { argv = null; audit = { exit_code: 3221225539, raw_bytes: 0 }; }\n' + HELPER,
    wantEnv: true,
  },
  {
    name: 'C-arm: clean exit, no argv (exit 0, 42 bytes)',
    inject: '  if (true) { argv = null; audit = { exit_code: 0, raw_bytes: 42 }; }\n' + HELPER,
    wantEnv: false,
  },
];

const ENV_MARK = /ENVIRONMENT failure, not an argv-contract/;
const CONTRACT_MARK = /shell-in-the-spawn-path symptom this file exists to catch/;

console.log('=== Q1 both-directions mutation ===');
for (const arm of ARMS) {
  // `argv`/`audit` are const-destructured at the call sites, so the injection goes inside the
  // helper where they are plain parameters.
  const mutated = source
    .replace('function assertArgvObserved({ argv, audit }) {', 'function assertArgvObserved({ argv: argv0, audit: audit0 }) {\n  let argv = argv0, audit = audit0;')
    .replace(HELPER, arm.inject);
  fs.writeFileSync(SUITE, mutated);
  try {
    const r = spawnSync(process.execPath, ['--test', SUITE], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const fail = /^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1];
    if (fail === undefined) throw new Error(`${arm.name}: counts unparseable`);
    const saidEnv = ENV_MARK.test(out);
    const saidContract = CONTRACT_MARK.test(out);
    const correct = arm.wantEnv ? (saidEnv && !saidContract) : (saidContract && !saidEnv);
    console.log(`${arm.name}\n  fail=${fail} saidEnvironment=${saidEnv} saidContract=${saidContract} -> ${correct ? 'CORRECT diagnosis' : 'WRONG diagnosis'}`);
    if (fail === '0') console.log('  !! the fault did not even turn the suite red -- classifier never ran');
  } finally {
    fs.writeFileSync(SUITE, source);
  }
}
if (fs.readFileSync(SUITE, 'utf8') !== source) throw new Error('SUITE NOT RESTORED');
console.log('suite restored byte-for-byte\n');

// --- Q2: rate estimation, full suite, unmutated. Reports; does not conclude. ---
const N = Number(process.argv[2] ?? 12);
console.log(`=== Q2 rate estimation, ${N} full-suite rounds (estimating, NOT concluding) ===`);
const events = { argvEnv: 0, argvContract: 0, parseRed: 0, otherRed: 0, green: 0 };
for (let i = 1; i <= N; i++) {
  const r = spawnSync(process.execPath, ['scripts/run-tests.mjs'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const fail = /^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1];
  if (fail === undefined) throw new Error(`round ${i}: counts unparseable -- refusing to score it`);
  const red = r.status !== 0 || fail !== '0';
  const names = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  if (!red) events.green++;
  if (ENV_MARK.test(out)) events.argvEnv++;
  if (CONTRACT_MARK.test(out)) events.argvContract++;
  const parse = names.some((n) => /parse/i.test(n));
  if (parse) events.parseRed++;
  else if (red) events.otherRed++;
  console.log(`round ${i}: ${red ? 'RED' : 'green'} fail=${fail}${names.length ? ` | ${names.slice(0, 3).join(' ; ')}` : ''}`);
}

// D5b (3): a zero is meaningless without n and the absence probability at that n.
const absence = (p) => Math.pow(1 - p, N);
console.log(`\nobserved over n=${N}: ${JSON.stringify(events)}`);
console.log('if the true rate were:');
for (const p of [0.006, 0.02, 0.08]) {
  console.log(`  p=${(p * 100).toFixed(1)}% -> P(0 occurrences in ${N}) = ${(100 * absence(p)).toFixed(1)}%`
    + `, n for 95% detection = ${Math.ceil(Math.log(0.05) / Math.log(1 - p))}`);
}
console.log('A green batch at these sizes is NOT evidence of a fix -- it is consistent with all three rates.');
