#!/usr/bin/env node
/**
 * #20, last discriminator: is the image-load failure a property of `dispatchWorker`, or of
 * spawning ANY freshly built native executable concurrently on this machine?
 *
 * What is already established, in intact windows, at 480 dispatches per arm:
 *   - the red's shape is `raw_bytes == 0`, `raw_original_bytes == 0`, `timed_out == false`,
 *     and an exit code that is an NTSTATUS image-load failure:
 *       0xC0000043 STATUS_SHARING_VIOLATION      (the image could not be opened)
 *       0xC0000142 STATUS_DLL_INIT_FAILED        (the image opened, its DLL init failed)
 *   - one shared image (`load`) vs twelve distinct images (`distinct`) are indistinguishable:
 *     1/4/4 vs 2/1/4 nulls per 480. The "shared binary" family of mechanisms is falsified
 *     for the fourth time, now including the version this probe itself proposed.
 *   - spawn stagger (0ms vs 60ms across the width) changes nothing, so spawn RATE is not it.
 *
 * This probe removes `dispatchWorker` from the picture entirely: same stub image, same
 * concurrency, spawned by a bare `child_process.spawn` with nothing of the product in the
 * path. If the failures persist here, the dispatcher is not implicated at all and the honest
 * finding is a platform-level flake with a named NTSTATUS -- and the suite's assertion is
 * then measuring the environment, not the code it claims to test.
 *
 * Usage: node spawn-floor-probe.mjs [rounds] [width]
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const STUB_SOURCE = path.join(REPO_ROOT, 'plugin', 'skills', 'auto-goal-v2', 'tests', 'fixtures', 'argv-echo-stub.c');

/** NTSTATUS values seen so far, named so a reader does not have to convert hex. */
const NTSTATUS = new Map([
  [3221225539, '0xC0000043 STATUS_SHARING_VIOLATION'],
  [3221225794, '0xC0000142 STATUS_DLL_INIT_FAILED'],
  [3221225781, '0xC0000135 STATUS_DLL_NOT_FOUND'],
]);

function stamp() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

/**
 * Spawn the stub bare and collect stdout on `'close'`.
 *
 * `'close'`, not `'exit'`, on purpose: reading on `'exit'` would let this probe manufacture
 * its own short reads and then attribute them to the platform.
 */
function spawnOnce(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-p', '--bare'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, shell: false });
    const chunks = [];
    let spawnError = null;
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', () => {});
    child.on('error', (error) => { spawnError = String(error.message); });
    child.on('close', (code) => {
      resolve({ code, bytes: Buffer.concat(chunks).length, spawnError });
    });
    child.stdin.on('error', () => {});
    child.stdin.end('objective');
  });
}

const rounds = Number(process.argv[2] ?? 40);
const width = Number(process.argv[3] ?? 12);

const compiler = ['gcc', 'cc', 'clang'].find((candidate) => {
  try {
    execFileSync(candidate, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
});
if (!compiler) {
  console.error('no C compiler; this probe cannot run and must not report green');
  process.exit(2);
}

const dir = mkdtempSync(path.join(tmpdir(), 'ace-spawn-floor-'));
const bin = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
execFileSync(compiler, ['-O0', '-o', bin, STUB_SOURCE], { stdio: 'pipe' });
if (!existsSync(bin)) {
  console.error('compiler reported success but produced no binary');
  process.exit(2);
}

console.log(`spawn-floor: ${rounds} rounds x ${width} concurrent bare spawns, started ${stamp()}`);
const shapes = new Map();
let bad = 0;
let total = 0;
try {
  for (let round = 1; round <= rounds; round++) {
    const results = await Promise.all(Array.from({ length: width }, () => spawnOnce(bin)));
    for (const { code, bytes, spawnError } of results) {
      total++;
      const ok = code === 0 && bytes > 0 && spawnError === null;
      const shape = ok ? 'OK' : `BAD code=${code}${NTSTATUS.has(code) ? ` (${NTSTATUS.get(code)})` : ''} bytes=${bytes} spawnError=${spawnError ?? '-'}`;
      if (!ok) {
        bad++;
        console.log(`  round ${round} ${stamp()} ${shape}`);
      }
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\nspawn-floor: ${total} bare spawns, ${bad} bad, ended ${stamp()}`);
for (const [shape, count] of [...shapes].sort((a, b) => b[1] - a[1])) console.log(`  ${count}x ${shape}`);
// A zero here does NOT clear the dispatcher: it only means this arm did not reach the rate.
// Report the number; let the report do the reasoning.
process.exit(bad > 0 ? 1 : 0);
