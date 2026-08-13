// The 36-round run scored 4 reds and told me nothing about them: `otherRed:4`, `parseRed:0`, and
// no test names printed. `not ok \d+ - ` never matched, because the node:test default reporter is
// the spec reporter (`✖ name (123ms)`), not TAP -- my regex was written for a format this run does
// not emit. So the previous harness could count reds but could not identify a single one.
//
// That is the same defect three times over now (cmd.exe loop, filtered mutation, TAP regex): the
// instrument silently measured something other than what it reported. Per the memory note --
// instrument silence is not a finding -- this run refuses to score a red it cannot name.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const N = Number(process.argv[2] ?? 24);
const LOG = '.ace/tasks/implement-auto-goal-v2/artifacts/flake-census.jsonl';

// Both reporter shapes, so a change of reporter cannot silently blind this again.
const SPEC_FAIL = /^\s*✖\s+(.+?)\s+\(\d+(?:\.\d+)?ms\)/gm;
const TAP_FAIL = /^not ok \d+ - (.+)$/gm;

const names = (out) => {
  const found = new Set();
  for (const m of out.matchAll(SPEC_FAIL)) found.add(m[1].trim());
  for (const m of out.matchAll(TAP_FAIL)) found.add(m[1].trim());
  // The spec reporter repeats failures under a "failing tests:" footer; dedup via the Set above.
  return [...found].filter((n) => n !== 'failing tests:');
};

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
    // A red whose tests cannot be named is an instrument failure, not a data point.
    if (failed.length === 0) {
      unnamed++;
      console.log(`round ${i}: RED but UNNAMED (fail=${fail}) -- instrument could not identify it; dumping context`);
      for (const l of out.split('\n').filter((x) => /✖|not ok|AssertionError|Error:/.test(x)).slice(0, 12)) {
        console.log(`    ${l.trim()}`);
      }
    }
    // Keep the whole failing round on disk: these are rare and re-running is expensive.
    fs.writeFileSync(`.ace/tasks/implement-auto-goal-v2/artifacts/flake-round-${i}.log`, out);
  }
  records.push({ round: i, red, pass, fail, failed });
  console.log(`round ${i}: ${red ? 'RED' : 'green'} pass=${pass} fail=${fail}${failed.length ? ` | ${failed.join(' ; ')}` : ''}`);
}

fs.writeFileSync(LOG, records.map((r) => JSON.stringify(r)).join('\n') + '\n');

console.log(`\n=== census over n=${N} ===`);
console.log(`${reds}/${N} rounds red (${(100 * reds / N).toFixed(1)}%), ${unnamed} of them unnamed`);
for (const [name, count] of [...census].sort((a, b) => b[1] - a[1])) {
  const p = count / N;
  console.log(`  ${count}/${N} (${(100 * p).toFixed(1)}%)  ${name}`);
  console.log(`      n for 95% detection at this rate: ${Math.ceil(Math.log(0.05) / Math.log(1 - p))}`);
}
if (unnamed > 0) console.log('\nUNNAMED REDS PRESENT: the rates above are lower bounds, not the full picture.');
console.log(`per-round records: ${LOG}`);
