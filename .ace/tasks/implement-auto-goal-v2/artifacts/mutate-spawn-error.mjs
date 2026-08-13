// Do the rewritten spawn-failure tests have power, or did I just make them agree with the code?
//
// The tests changed at the same time as the product, which is the setup where a "fix" can be
// nothing more than the assertions being rewritten to match observed behaviour. Two mutations,
// each removing exactly one thing the fix added. Both must turn the suite RED.
//
// M1: delete the try/catch around `spawn`, restoring the platform-dependent shape. The suite must
//     fail, because the synchronous throw again escapes as a rejection and no audit is produced.
// M2: keep the catch but report `spawnError: null`, i.e. catch the throw and lose the reason.
//     The suite must fail on the `typeof audit.spawn_error === 'string'` assertion.
//
// Self-check: each mutation asserts the file actually changed. A no-op replace would make this
// harness report "killed" for a mutation that was never applied -- the exact failure mode the
// earlier filtered-mutation run had.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SRC = 'plugin/skills/auto-goal-v2/scripts/dispatch-worker.mjs';
const SUITE = 'plugin/skills/auto-goal-v2/tests/dispatch-stream-completeness.test.mjs';
const original = fs.readFileSync(SRC, 'utf8');

const CATCH_BLOCK = `    } catch (error) {
      // No child exists, so there are no streams to drain and no timers to clear: resolve the
      // same shape the async path resolves, with empty captures and no exit code.
      res({
        code: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        stdoutReceived: 0,
        stderrReceived: 0,
        overflowed: false,
        timedOut: false,
        spawnError: String(error.message),
      });
      return;
    }`;

if (!original.includes(CATCH_BLOCK)) throw new Error('catch block not found; harness is stale');

const MUTANTS = [
  {
    name: 'M1_no_catch (synchronous throw escapes again)',
    apply: (s) => s.replace(
      `    let child;
    try {
      child = spawn(`,
      `    let child;
    {
      child = spawn(`,
    ).replace(CATCH_BLOCK, '    }'),
  },
  {
    name: 'M2_catch_but_drop_reason (spawn_error becomes null)',
    apply: (s) => s.replace('spawnError: String(error.message),', 'spawnError: null,'),
  },
];

let allKilled = true;
for (const m of MUTANTS) {
  const mutated = m.apply(original);
  if (mutated === original) throw new Error(`${m.name}: MUTATION IS A NO-OP -- file unchanged, result would be void`);
  fs.writeFileSync(SRC, mutated);
  try {
    const r = spawnSync(process.execPath, ['--test', SUITE], { encoding: 'utf8', maxBuffer: 1 << 28 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const fail = /^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1];
    if (fail === undefined) throw new Error(`${m.name}: counts unparseable -- refusing to score it`);
    const killed = fail !== '0';
    if (!killed) allKilled = false;
    const names = [...out.matchAll(/^\s*✖\s+(.+?)\s+\(\d/gm)].map((x) => x[1]).filter((n) => n !== 'failing tests:');
    console.log(`${m.name}: fail=${fail} -> ${killed ? 'KILLED' : 'SURVIVED (the assertion has no power)'}`);
    for (const n of [...new Set(names)]) console.log(`    ✖ ${n}`);
  } finally {
    fs.writeFileSync(SRC, original);
  }
}
if (fs.readFileSync(SRC, 'utf8') !== original) throw new Error('SOURCE NOT RESTORED');
console.log(`\nsource restored byte-for-byte; ${allKilled ? 'both mutants killed' : 'AT LEAST ONE SURVIVED'}`);
