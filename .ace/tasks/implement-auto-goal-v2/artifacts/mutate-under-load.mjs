// The mutation that mattered, run under the load the flake actually needs.
//
// mutate-premise.mjs ran M2 through run-tests.mjs FILTERED to one suite. That deleted the
// contention: `node --test` runs the full set of files concurrently, and process creation on this
// box goes from ~40 ms idle to 211-417 ms loaded. So "M2 survived" was measured in a world where
// the bug cannot occur -- the same class of mistake as the cmd.exe loop and `node --test <dir>`,
// for the third time: the harness quietly changed the conditions and then reported on them.
//
// Here both arms run the FULL suite via the canonical entry point:
//   A. baseline  -- 3 * measureDetachLatency() + 200, guard present  (what is committed)
//   B. mutant    -- the original hand-picked 150 ms, guard deleted   (the pre-fix world)
//
// If B reds on `raw_bytes > 0` and A does not, the fix is load-bearing and the flake is real.
// If B is green across all rounds, the committed complexity is not buying anything measurable and
// that needs saying plainly rather than being defended.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SUITE = 'plugin/skills/auto-goal-v2/tests/dispatch-stream-completeness.test.mjs';
const source = fs.readFileSync(SUITE, 'utf8');
const ORIGINAL = 'function safeTimeoutMs() {\n  return 3 * measureDetachLatency() + 200;\n}';
const GUARD = /\s*assert\.ok\(\n\s*measureDetachLatency\(\) < timeoutMs,[\s\S]*?\n\s*\);\n/;
const ANCHOR = "    assert.equal(audit.timed_out, true, 'the deadline must be reported, not silently survived');";
if (!source.includes(ORIGINAL) || !GUARD.test(source) || !source.includes(ANCHOR)) {
  throw new Error('harness stale against the suite');
}
const PROBE = "    console.log(`PROBE deadline=${timeoutMs} writeAt=${writeAt} raw_bytes=${audit.raw_bytes} elapsed=${Date.now() - started}`);\n" + ANCHOR;

const ROUNDS = 5;
const ARMS = [
  { name: 'A baseline (measured deadline + guard)', src: source.replace(ANCHOR, PROBE) },
  {
    name: 'B mutant (hand-picked 150 ms, guard deleted)',
    src: source.replace(ORIGINAL, 'function safeTimeoutMs() {\n  return 150;\n}').replace(GUARD, '\n').replace(ANCHOR, PROBE),
  },
];

const tally = [];
for (const arm of ARMS) {
  fs.writeFileSync(SUITE, arm.src);
  let reds = 0;
  const probes = [];
  try {
    for (let i = 1; i <= ROUNDS; i++) {
      // Full suite, no filter: this is the contention the flake needs.
      const r = spawnSync(process.execPath, ['scripts/run-tests.mjs'], { encoding: 'utf8', maxBuffer: 1 << 28 });
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      const pass = /^[ℹ#]\s*pass\s+(\d+)\s*$/m.exec(out)?.[1];
      const fail = /^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1];
      if (fail === undefined) throw new Error(`round ${i}: counts unparseable -- refusing to score it`);
      const probe = /PROBE .*/.exec(out)?.[0]?.replace('PROBE ', '') ?? 'probe missing';
      probes.push(probe);
      const rawBytesRed = /the late bytes must still be captured as evidence/.test(out);
      const premiseRed = /the writer needs \d+ ms to get airborne/.test(out);
      const red = r.status !== 0 || fail !== '0';
      if (red) reds++;
      console.log(`${arm.name} round ${i}: ${red ? 'RED' : 'green'} pass=${pass} fail=${fail}`
        + `${rawBytesRed ? ' [raw_bytes fired]' : ''}${premiseRed ? ' [premise fired]' : ''} | ${probe}`);
      if (red) {
        for (const line of out.split('\n').filter((l) => /^not ok \d+ - /.test(l)).slice(0, 8)) {
          console.log(`      ${line.trim()}`);
        }
      }
    }
  } finally {
    fs.writeFileSync(SUITE, source);
  }
  tally.push({ name: arm.name, reds, probes });
  console.log('');
}

if (fs.readFileSync(SUITE, 'utf8') !== source) throw new Error('SUITE NOT RESTORED');
console.log('suite restored byte-for-byte\n');
for (const t of tally) console.log(`${t.name}: ${t.reds}/${ROUNDS} rounds red`);
