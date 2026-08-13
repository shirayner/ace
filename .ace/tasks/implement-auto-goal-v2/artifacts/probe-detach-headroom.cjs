/**
 * Measure the ONE quantity the new deadline test does not guard: detach latency against the
 * 1800 ms ceiling implied by `CLOSE_GRACE_MS - 200`.
 *
 * Why this probe and not another round of the suite. The suite's new precondition
 *
 *     writeAt = timeoutMs + 200;  assert(writeAt < timeoutMs + CLOSE_GRACE_MS)
 *
 * has `timeoutMs` on both sides, so it reduces to `200 < 2000` and cannot fail on any machine.
 * The invariant it MEANT to state is that the late write still lands inside the grace window,
 * and because the write clock starts when the stub's writer is airborne, that is:
 *
 *     detach + 200 < CLOSE_GRACE_MS      i.e.   detach < 1800 ms
 *
 * `safeTimeoutMs() = 3*detach + 200` cancels out of this inequality entirely: scaling the
 * deadline also scales the write instant. So the `3*` headroom -- the whole point of the
 * calibration -- buys exactly nothing here, and no assertion watches the bound that remains.
 *
 * Running the suite cannot measure this. Under the ceiling the suite is green; over it the
 * suite is red on `raw_bytes == 0`. Green therefore means "detach < 1800 on this machine right
 * now", never "the bound is guarded". This probe reports the MARGIN, which is the thing a
 * pass/fail cannot express.
 *
 * LOAD IS THE SIGNAL, NOT THE CONTAMINATION. `detach` is process-creation latency; it grows
 * precisely when the machine is busy. A quiet-machine reading is the weak one -- it samples the
 * condition under which the original hand-picked 150 ms also passed review.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SKILL = path.resolve(__dirname, '..', '..', '..', '..', 'plugin', 'skills', 'auto-goal-v2');
const STUB_SOURCE = path.join(SKILL, 'tests', 'fixtures', 'dispatch-ghost-stub.c');
const CLOSE_GRACE_MS = 2000;
const WRITE_OFFSET_MS = 200;
const CEILING = CLOSE_GRACE_MS - WRITE_OFFSET_MS;
const ROUNDS = Number(process.env.PROBE_ROUNDS ?? 30);

// Compile into tmpdir, never into the skill tree: this probe must not move the digest of the
// tree whose reading it is here to qualify. (`.ace/` is outside the sampled surface; `plugin/`
// is inside it.)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-detach-headroom-'));
const bin = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
for (const cc of ['gcc', 'cc', 'clang']) {
  try { execFileSync(cc, ['-O0', '-o', bin, STUB_SOURCE], { stdio: 'pipe' }); break; } catch { /* next */ }
}
if (!fs.existsSync(bin)) throw new Error('no C compiler produced the stub; this probe cannot report');

/** One sample of the exact interval the suite's helper measures: spawn -> parent 'exit'. */
function detachOnce() {
  const t0 = Date.now();
  try {
    execFileSync(bin, [], { cwd: dir, stdio: 'ignore', env: { PATH: '', ACE_GHOST_DELAY_MS: '1000' } });
  } catch { /* exit status irrelevant; only the interval */ }
  return Date.now() - t0;
}

const samples = [];
for (let i = 0; i < ROUNDS; i += 1) {
  const ms = detachOnce();
  samples.push(ms);
  const over = ms >= CEILING ? '   <-- OVER THE 1800 ms CEILING: raw_bytes would be 0' : '';
  console.log(`  sample ${String(i + 1).padStart(3)}  detach ${String(ms).padStart(5)} ms${over}`);
}

samples.sort((a, b) => a - b);
const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
const max = samples[samples.length - 1];

console.log(`\n  n=${samples.length}  min ${samples[0]}  p50 ${at(0.5)}  p90 ${at(0.9)}  max ${max} ms`);
console.log(`  safeTimeoutMs() from this max = 3*${max} + 200 = ${3 * max + 200} ms`);
console.log(`\n  the UNGUARDED bound:  detach < ${CEILING} ms   (CLOSE_GRACE_MS ${CLOSE_GRACE_MS} - write offset ${WRITE_OFFSET_MS})`);
console.log(`  margin at observed max: ${CEILING - max} ms  (${(max / CEILING * 100).toFixed(1)}% of budget consumed)`);
console.log(`  slowdown factor that breaks it: ${(CEILING / max).toFixed(1)}x the max seen here`);
console.log(`\n  note: 3* does NOT protect this bound -- timeoutMs cancels from detach + 200 < CLOSE_GRACE_MS.`);
