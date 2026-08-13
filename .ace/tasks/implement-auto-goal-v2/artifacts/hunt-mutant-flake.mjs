// B alone, 16 full-suite rounds, hunting the 1-in-8.
//
// At p=1/8, 16 rounds miss entirely only ~12% of the time, so a clean 16 is real evidence that the
// pre-fix deadline no longer flakes on this machine -- and 5 rounds was not. Every round also
// prints the suite's OWN detachMax next to the deadline, because that pairing is the whole
// question: 150 ms failed when detach spiked past it, and the committed 3*d+200 (~450 ms) is
// ~4-5x the typical 74-108 ms. Whether that margin is load-bearing is decided by these numbers,
// not by my story about them.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SUITE = 'plugin/skills/auto-goal-v2/tests/dispatch-stream-completeness.test.mjs';
const source = fs.readFileSync(SUITE, 'utf8');
const ORIGINAL = 'function safeTimeoutMs() {\n  return 3 * measureDetachLatency() + 200;\n}';
const GUARD = /\s*assert\.ok\(\n\s*measureDetachLatency\(\) < timeoutMs,[\s\S]*?\n\s*\);\n/;
const ANCHOR = "    assert.equal(audit.timed_out, true, 'the deadline must be reported, not silently survived');";
if (!source.includes(ORIGINAL) || !GUARD.test(source) || !source.includes(ANCHOR)) throw new Error('harness stale');

// Report the independent measurement even in the mutant arm, where it no longer sets the deadline:
// `measureDetachLatency()` is cached, so calling it here costs one measurement and tells us how
// close this round came to the 150 ms cliff.
const PROBE = '    console.log(`PROBE deadline=${timeoutMs} detachMax=${measureDetachLatency()} '
  + 'raw_bytes=${audit.raw_bytes} elapsed=${Date.now() - started}`);\n' + ANCHOR;

const mutant = source
  .replace(ORIGINAL, 'function safeTimeoutMs() {\n  return 150;\n}')
  .replace(GUARD, '\n')
  .replace(ANCHOR, PROBE);

const ROUNDS = 16;
let reds = 0;
let nearMisses = 0;
fs.writeFileSync(SUITE, mutant);
try {
  for (let i = 1; i <= ROUNDS; i++) {
    const r = spawnSync(process.execPath, ['scripts/run-tests.mjs'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const fail = /^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1];
    if (fail === undefined) throw new Error(`round ${i}: counts unparseable -- refusing to score it`);
    const probe = /PROBE .*/.exec(out)?.[0]?.replace('PROBE ', '') ?? 'probe missing';
    const detach = Number(/detachMax=(\d+)/.exec(probe)?.[1] ?? NaN);
    const rawBytes = /raw_bytes=(\d+)/.exec(probe)?.[1];
    const red = r.status !== 0 || fail !== '0';
    if (red) reds++;
    if (Number.isFinite(detach) && detach > 100) nearMisses++;   // creeping toward the 150 cliff
    console.log(`round ${i}: ${red ? 'RED' : 'green'} fail=${fail} | ${probe}`);
    if (red) {
      for (const l of out.split('\n').filter((x) => /^not ok \d+ - |airborne|late bytes/.test(x)).slice(0, 6)) {
        console.log(`    ${l.trim()}`);
      }
    }
    if (rawBytes === '0') console.log('    ^ raw_bytes==0: this is the #23 flake, reproduced');
  }
} finally {
  fs.writeFileSync(SUITE, source);
}
if (fs.readFileSync(SUITE, 'utf8') !== source) throw new Error('SUITE NOT RESTORED');
console.log(`\nmutant: ${reds}/${ROUNDS} red; ${nearMisses}/${ROUNDS} rounds measured detach > 100 ms`);
console.log('suite restored byte-for-byte');
