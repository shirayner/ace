// Post-fix census. Separate from `flake-census.mjs` on purpose: that run finished at 07:28 and
// the fixes it was meant to judge landed at 07:30-07:32, so its two reds (round 2 = detached-writer
// capture cap, round 17 = B5 pipeline order) describe a tree that no longer exists. Mixing the two
// logs would let pre-fix reds be read as post-fix survivals, or -- worse -- let post-fix greens
// inherit the pre-fix sample size.
//
// Sizing, per D5b: both target reds were observed at 1/24 ~= 4%. n for 95% detection at p=0.04 is
// 74, so n=75. At that n a clean sweep still only means "P(0) = 4.6% if the rate were unchanged" --
// which is a reading, not a proof, and the summary says so rather than declaring the flake dead.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const N = Number(process.argv[2] ?? 75);
const DIR = '.ace/tasks/implement-auto-goal-v2/artifacts';
const LOG = `${DIR}/census-postfix.jsonl`;

// Both reporter shapes: the spec reporter is the default here, but a reporter change must not be
// able to silently blind this the way the TAP-only regex did.
const SPEC_FAIL = /^\s*✖\s+(.+?)\s+\(\d+(?:\.\d+)?ms\)/gm;
const TAP_FAIL = /^not ok \d+ - (.+)$/gm;

const names = (out) => {
  const found = new Set();
  for (const m of out.matchAll(SPEC_FAIL)) found.add(m[1].trim());
  for (const m of out.matchAll(TAP_FAIL)) found.add(m[1].trim());
  return [...found].filter((n) => n !== 'failing tests:');
};

// The two reds this run exists to re-test, matched on the substrings that named them pre-fix.
const TARGETS = [
  { key: 'detached-writer-cap', re: /capture cap still fires on a detached writer/ },
  { key: 'B5-pipeline-order', re: /B5: the pipeline order holds/ },
];

const census = new Map();
let reds = 0;
let unnamed = 0;
const records = [];

for (let i = 1; i <= N; i++) {
  const r = spawnSync(process.execPath, ['scripts/run-tests.mjs'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const fail = /^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1];
  const pass = /^[ℹ#]\s*pass\s+(\d+)\s*$/m.exec(out)?.[1];
  if (fail === undefined) throw new Error(`round ${i}: counts unparseable -- refusing to score it`);
  const red = r.status !== 0 || fail !== '0';
  const failed = names(out);

  if (red) {
    reds++;
    for (const n of failed) census.set(n, (census.get(n) ?? 0) + 1);
    if (failed.length === 0) {
      unnamed++;
      console.log(`round ${i}: RED but UNNAMED (fail=${fail}) -- instrument could not identify it`);
      for (const l of out.split('\n').filter((x) => /✖|not ok|AssertionError|Error:/.test(x)).slice(0, 12)) {
        console.log(`    ${l.trim()}`);
      }
    }
    fs.writeFileSync(`${DIR}/postfix-round-${i}.log`, out);
  }
  records.push({ round: i, red, pass, fail, failed });
  console.log(`round ${i}: ${red ? 'RED' : 'green'} pass=${pass} fail=${fail}${failed.length ? ` | ${failed.join(' ; ')}` : ''}`);
}

fs.writeFileSync(LOG, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

console.log(`\n=== post-fix census over n=${N} ===`);
console.log(`${reds}/${N} rounds red (${(100 * reds / N).toFixed(1)}%), ${unnamed} of them unnamed`);
for (const [name, count] of [...census].sort((a, b) => b[1] - a[1])) {
  const p = count / N;
  console.log(`  ${count}/${N} (${(100 * p).toFixed(1)}%)  ${name}`);
  console.log(`      n for 95% detection at this rate: ${Math.ceil(Math.log(0.05) / Math.log(1 - p))}`);
}

// The targeted verdict, stated as a rate reading rather than as a pass/fail claim.
console.log('\n=== the two pre-fix reds, re-tested ===');
for (const t of TARGETS) {
  const hits = records.filter((r) => r.failed.some((n) => t.re.test(n))).length;
  const prior = 1 / 24; // both were observed once in the 24-round pre-fix census
  const absence = Math.pow(1 - prior, N);
  console.log(`  ${t.key}: ${hits}/${N} post-fix`
    + (hits === 0
      ? ` -- consistent with fixed; also consistent with the unchanged pre-fix rate ${(100 * prior).toFixed(1)}% at P(0)=${(100 * absence).toFixed(1)}%`
      : ' -- STILL PRESENT, the fix did not close it'));
}
if (unnamed > 0) console.log('\nUNNAMED REDS PRESENT: the rates above are lower bounds, not the full picture.');
console.log(`per-round records: ${LOG}`);
