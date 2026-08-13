/**
 * Is `dispatch-stream-completeness` deadline-test failure a real defect, or a test that
 * encodes a race it cannot win?
 *
 * The failing assertion is `audit.raw_bytes > 0` -- "the late bytes must still be captured
 * as evidence". The test asks the ghost writer to write at `timeoutMs + 300`, inside a
 * 2500 ms grace window, and expects those bytes to land. That expectation holds only if the
 * writer's delay is measured on the same clock as the dispatcher's grace timer AND the box
 * is fast enough to let the write happen before the timer fires.
 *
 * Under CPU pressure both can slip. This probe applies pressure and counts.
 *
 * Read-only w.r.t. the skill tree: it runs the existing suite, mutates nothing.
 */
const { execFileSync, spawn } = require('node:child_process');

const LOADERS = Number(process.env.PROBE_LOADERS ?? 8);
const ROUNDS = Number(process.env.PROBE_ROUNDS ?? 6);
const SUITE = 'plugin/skills/auto-goal-v2/tests/dispatch-stream-completeness.test.mjs';

const load = [];
for (let i = 0; i < LOADERS; i += 1) {
  load.push(spawn(process.execPath, ['-e', 'const t=Date.now();while(Date.now()-t<120000){Math.sqrt(Math.random());}'], { stdio: 'ignore' }));
}

let green = 0;
const reds = [];
for (let i = 1; i <= ROUNDS; i += 1) {
  try {
    execFileSync(process.execPath, ['--test', SUITE], {
      encoding: 'utf8',
      env: { ...process.env, ACE_REQUIRE_STUB_BACKEND: '1' },
    });
    green += 1;
    console.log(`round ${i}  GREEN`);
  } catch (error) {
    const out = String(error.stdout ?? '') + String(error.stderr ?? '');
    // Name WHICH assertion, so a different failure is not silently pooled with this one.
    let which = 'unrecognised failure';
    if (out.includes('the late bytes must still be captured as evidence')) which = 'raw_bytes == 0  (late bytes never landed inside the grace window)';
    else if (/past the \d+ \+ \d+ ms ceiling/.test(out)) which = 'elapsed past the ceiling  (the bound itself broke)';
    else {
      const m = out.match(/✖ [^\n(]{6,90}/);
      if (m) which = m[0].trim();
    }
    reds.push(which);
    console.log(`round ${i}  RED    ${which}`);
  }
}

for (const p of load) p.kill();

console.log(`\n---> loaders=${LOADERS}  green ${green} / red ${reds.length} of ${ROUNDS}`);
for (const [which, n] of Object.entries(reds.reduce((a, r) => ({ ...a, [r]: (a[r] ?? 0) + 1 }), {}))) {
  console.log(`     ${n}x  ${which}`);
}
