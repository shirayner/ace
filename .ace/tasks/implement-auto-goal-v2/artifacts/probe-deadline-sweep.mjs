// M2 passed 6/6 with a 150 ms deadline, but the measured detach latency is 211-417 ms (40/40 over
// 150). Under my story -- "the SIGKILL lands before `_spawnl`, so no writer exists, so raw_bytes==0"
// -- M2 should have failed every time. It failed none. So the story is wrong somewhere, and the
// premise guard I built on it is comparing two intervals that may not share an origin.
//
// This prints the actual numbers instead of a verdict: for a range of deadlines, what raw_bytes and
// timed_out come out as, N runs each. No assertions -- assertions are how I got a wrong answer
// confidently. Just the observed values.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SUITE = 'plugin/skills/auto-goal-v2/tests/dispatch-stream-completeness.test.mjs';
const source = fs.readFileSync(SUITE, 'utf8');
const ORIGINAL = 'function safeTimeoutMs() {\n  return 3 * measureDetachLatency() + 200;\n}';
const GUARD = /\s*assert\.ok\(\n\s*measureDetachLatency\(\) < timeoutMs,[\s\S]*?\n\s*\);\n/;
if (!source.includes(ORIGINAL) || !GUARD.test(source)) throw new Error('harness stale');

// Emit the observed audit BEFORE any assertion can abort the test, so a red run still reports.
const PROBE_ANCHOR = "    assert.equal(audit.timed_out, true, 'the deadline must be reported, not silently survived');";
if (!source.includes(PROBE_ANCHOR)) throw new Error('probe anchor not found');
const PROBE = "    console.log(`PROBE deadline=${timeoutMs} writeAt=${writeAt} detachMax=${detachMaxMs} raw_bytes=${audit.raw_bytes} timed_out=${audit.timed_out} status=${envelope.status} reason=${envelope.reason} elapsed=${Date.now() - started}`);\n"
  + PROBE_ANCHOR;

const RUNS = 6;
const DEADLINES = [150, 400, 800];

for (const deadline of DEADLINES) {
  const mutated = source
    .replace(ORIGINAL, `function safeTimeoutMs() {\n  return ${deadline};\n}`)
    .replace(GUARD, '\n')                 // guard removed: we want the raw behaviour, not its opinion
    .replace(PROBE_ANCHOR, PROBE);
  fs.writeFileSync(SUITE, mutated);
  try {
    for (let i = 1; i <= RUNS; i++) {
      const r = spawnSync(process.execPath, ['--test', SUITE], { encoding: 'utf8', maxBuffer: 1 << 28 });
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
      const probe = /PROBE .*/.exec(out)?.[0] ?? 'PROBE MISSING (test aborted before the probe)';
      const fail = /^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1] ?? '?';
      console.log(`deadline=${deadline} run=${i} fail=${fail} | ${probe.replace('PROBE ', '')}`);
    }
  } finally {
    fs.writeFileSync(SUITE, source);
  }
  console.log('');
}

if (fs.readFileSync(SUITE, 'utf8') !== source) throw new Error('SUITE NOT RESTORED');
console.log('suite restored byte-for-byte');
