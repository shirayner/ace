// Does the premise guard added for #23 have any power, or is it a restatement of its own source?
//
// The claim under test is mine, from the comment at dispatch-stream-completeness.test.mjs:334:
// "`detachMaxMs` is an independent measurement of this machine, so this comparison can actually
// fail". If that is true, a deadline below the measured detach latency must make it fire. If it is
// false, the guard is the very D0023 shape it was written to replace.
//
// Each mutation patches the suite on disk, runs the CANONICAL entry point (scripts/run-tests.mjs,
// filtered to this one suite), restores the file, and reports which assertion spoke. A mutation
// that produces a green run is a SURVIVOR: the guard could not tell that world from this one.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const SUITE = 'plugin/skills/auto-goal-v2/tests/dispatch-stream-completeness.test.mjs';
const ORIGINAL = 'function safeTimeoutMs() {\n  return 3 * measureDetachLatency() + 200;\n}';

const MUTATIONS = [
  {
    name: 'M0 baseline (unmutated)',
    body: ORIGINAL,
    expect: 'green',
    why: 'the control: anything but green here invalidates the other three readings',
  },
  {
    name: 'M1 deadline below measured detach latency',
    body: 'function safeTimeoutMs() {\n  return Math.max(1, Math.floor(measureDetachLatency() / 3));\n}',
    expect: 'premise-fires',
    why: 'the SIGKILL now lands before the writer is airborne -- exactly the state the guard claims to detect',
  },
  {
    name: 'M2 the original hand-picked 150 ms',
    body: 'function safeTimeoutMs() {\n  return 150;\n}',
    expect: 'premise-fires',
    why: 'the deadline whose lost race made raw_bytes>0 a 1-in-8 red; the guard should convert that flake into a deterministic, named failure',
  },
  {
    name: 'M3 guard deleted, deadline still hand-picked',
    body: 'function safeTimeoutMs() {\n  return 150;\n}',
    dropGuard: true,
    expect: 'anything-but-green-is-informative',
    why: 'what the suite looked like before the guard existed -- establishes what the guard is actually buying',
  },
];

const GUARD = /\s*assert\.ok\(\n\s*measureDetachLatency\(\) < timeoutMs,[\s\S]*?\n\s*\);\n/;

const source = fs.readFileSync(SUITE, 'utf8');
if (!source.includes(ORIGINAL)) throw new Error('safeTimeoutMs body not found verbatim; harness is stale');
if (!GUARD.test(source)) throw new Error('premise guard not found; harness is stale');

const results = [];
for (const m of MUTATIONS) {
  let mutated = source.replace(ORIGINAL, m.body);
  if (m.dropGuard) mutated = mutated.replace(GUARD, '\n');
  fs.writeFileSync(SUITE, mutated);
  try {
    const r = spawnSync(process.execPath, ['scripts/run-tests.mjs', 'dispatch-stream-completeness'], {
      encoding: 'utf8', maxBuffer: 1 << 28,
    });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const fail = /^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1];
    const pass = /^[ℹ#]\s*pass\s+(\d+)\s*$/m.exec(out)?.[1];
    if (fail === undefined) throw new Error(`counts unparseable for ${m.name} -- refusing to guess`);

    // Which assertion spoke matters more than that something did: the premise guard failing is a
    // diagnosis, `raw_bytes > 0` failing is the flake wearing a dispatcher-defect costume.
    const premise = /the writer needs \d+ ms to get airborne but the deadline is \d+ ms/.test(out);
    const rawBytes = /the late bytes must still be captured as evidence/.test(out);
    const otherFails = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((x) => x[1]);

    results.push({ ...m, exit: r.status, pass, fail, premise, rawBytes, otherFails });
    console.log(`${m.name}\n  exit=${r.status} pass=${pass} fail=${fail} premiseFired=${premise} rawBytesFired=${rawBytes}`);
    for (const f of otherFails.slice(0, 6)) console.log(`    not ok: ${f}`);
  } finally {
    fs.writeFileSync(SUITE, source);
  }
}

// Restoration is a claim; verify it rather than trusting the finally block.
if (fs.readFileSync(SUITE, 'utf8') !== source) throw new Error('SUITE NOT RESTORED -- fix before committing');
console.log('\nsuite restored byte-for-byte');

console.log('\nVERDICT');
for (const r of results) {
  const verdict = r.expect === 'green'
    ? (r.fail === '0' ? 'ok (control green)' : 'CONTROL BROKEN')
    : r.expect === 'premise-fires'
      ? (r.premise ? 'KILLED by the premise guard' : r.fail === '0' ? 'SURVIVOR -- guard has no power here' : 'killed, but by a DIFFERENT assertion')
      : `pre-guard world: exit=${r.exit} fail=${r.fail}`;
  console.log(`  ${r.name}: ${verdict}`);
}
