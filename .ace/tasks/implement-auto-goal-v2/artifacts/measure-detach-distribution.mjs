// What is the detach latency on this machine, actually, right now?
//
// M2/M3 surviving says one of two things and they have opposite consequences:
//   (a) this machine is currently fast enough that 150 ms clears the race, so the flake is dormant
//       rather than fixed, and my 8 green rounds measured the weather; or
//   (b) the race is not where I said it was, and the whole detachMaxMs story is wrong.
//
// Distinguishing them needs the distribution, not a verdict. So: 40 samples of the stub parent's
// spawn-to-exit, printed as a distribution, next to the 150 ms that used to be the deadline.
import { spawnSync, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = process.cwd();
const SRC = path.join(REPO, 'plugin/skills/auto-goal-v2/tests/fixtures/dispatch-ghost-stub.c');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghost-dist-'));
const bin = path.join(dir, process.platform === 'win32' ? 'ghost.exe' : 'ghost');

const cc = ['cc', 'gcc', 'clang'].find((c) => {
  const probe = spawnSync(c, ['--version'], { encoding: 'utf8' });
  return !probe.error && probe.status === 0;
});
if (!cc) throw new Error('no C compiler found; cannot measure');
const build = spawnSync(cc, ['-O2', '-o', bin, SRC], { encoding: 'utf8' });
if (build.status !== 0) throw new Error(`build failed: ${build.stderr}`);

const N = 40;
const samples = [];
for (let i = 0; i < N; i++) {
  const t = Date.now();
  try {
    // Same shape the suite's measureDetachLatency uses: writer delay far past the measurement so
    // it cannot finish first and confuse the parent's own lifetime with the write.
    execFileSync(bin, [], { cwd: dir, stdio: 'ignore', env: { PATH: '', ACE_GHOST_DELAY_MS: '1500' } });
  } catch { /* exit status irrelevant, only elapsed */ }
  samples.push(Date.now() - t);
}

samples.sort((a, b) => a - b);
const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
console.log(`n=${N}  min=${samples[0]}  p50=${at(0.5)}  p90=${at(0.9)}  p99=${at(0.99)}  max=${samples[N - 1]}`);
console.log(`samples: ${samples.join(' ')}`);
console.log(`\nover the old 150 ms deadline: ${samples.filter((s) => s >= 150).length}/${N}`);
console.log(`over 3*max+200 (=${3 * samples[N - 1] + 200} ms): ${samples.filter((s) => s >= 3 * samples[N - 1] + 200).length}/${N}`);

// The suite takes max of 5. How often would 5 samples have seen the tail this machine can produce?
let sawTail = 0;
for (let trial = 0; trial < 2000; trial++) {
  let m = 0;
  for (let k = 0; k < 5; k++) m = Math.max(m, samples[(trial * 7 + k * 13) % N]);
  if (m >= 150) sawTail++;
}
console.log(`a max-of-5 estimate lands >=150 ms in ${(100 * sawTail / 2000).toFixed(0)}% of resamples`);

fs.rmSync(dir, { recursive: true, force: true });
