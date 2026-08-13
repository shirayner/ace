/**
 * Is `raw_bytes == 0` in the ghost deadline test a product defect or a test-side race?
 *
 * Observed: 2/16 full-suite runs red at `assert.ok(audit.raw_bytes > 0)`, while the isolated
 * suite went 8/8 green and pure CPU pressure 6/6 green. A rate that changes with load shape and
 * not with the code under test is the signature of a race in the MEASUREMENT, not in the thing
 * measured -- but that is a hypothesis, and the way to settle it is to find the boundary.
 *
 * The claim to test: the assertion sits on a boundary at `CLOSE_GRACE_MS`. The dispatcher kills
 * at `timeoutMs`, then waits `CLOSE_GRACE_MS` for the pipe. The detached writer sleeps
 * `ACE_GHOST_DELAY_MS` measured on ITS OWN clock, starting whenever the OS gets around to
 * starting it. If the writer's write lands before the grace timer, `raw_bytes > 0`; if after,
 * `raw_bytes == 0`. Both are correct product behaviour -- the envelope is refused either way.
 *
 * So: sweep the delay across the boundary. If the flip is at the grace budget and the envelope
 * verdict never changes, the product is right and the assertion is a timing hope.
 *
 * Read-only w.r.t. the skill tree: imports it, compiles the fixture into tmpdir, writes nothing.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SKILL = resolve(import.meta.dirname, '..', '..', '..', '..', 'plugin', 'skills', 'auto-goal-v2');
const { dispatchWorker, CLOSE_GRACE_MS } = await import(`file://${join(SKILL, 'scripts', 'dispatch-worker.mjs')}`);

const STUB_SOURCE = join(SKILL, 'tests', 'fixtures', 'dispatch-ghost-stub.c');
const BIN = process.platform === 'win32' ? 'ghost.exe' : 'ghost';

function compile() {
  for (const cc of ['gcc', 'cc', 'clang']) {
    try {
      const dir = mkdtempSync(join(tmpdir(), 'ace-ghost-probe-'));
      const bin = join(dir, BIN);
      execFileSync(cc, ['-O0', '-o', bin, STUB_SOURCE], { stdio: 'pipe' });
      if (existsSync(bin)) return bin;
    } catch { /* try the next compiler */ }
  }
  throw new Error('no C compiler available; this probe cannot run');
}

const stubBin = compile();

function reply() {
  const worker = { status: 'SUCCEEDED', summary: 'ghost writer', claims: [], artifact_refs: [] };
  const body = JSON.stringify({ result: JSON.stringify(worker), usage: { input_tokens: 10, cache_read_input_tokens: 0 }, transcript: 'y'.repeat(4096) });
  return body;
}

async function once(delayMs, timeoutMs) {
  const root = await mkdtemp(join(tmpdir(), 'ace-ghost-probe-task-'));
  const replyDir = mkdtempSync(join(tmpdir(), 'ace-ghost-probe-reply-'));
  const replyFile = join(replyDir, 'reply.bin');
  writeFileSync(replyFile, Buffer.from(reply(), 'utf8'));
  const started = Date.now();
  try {
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: `probe-${delayMs}`,
      objective: 'boundary sweep',
      timeoutMs,
      env: { PATH: '', ACE_CLAUDE_BIN: stubBin, ACE_GHOST_REPLY_FILE: replyFile, ACE_GHOST_DELAY_MS: String(delayMs) },
    });
    return {
      elapsed: Date.now() - started,
      rawBytes: audit.raw_bytes,
      timedOut: audit.timed_out,
      status: envelope.status,
      reason: envelope.reason ?? null,
      stage: audit.rejected_stage,
    };
  } finally {
    await rm(root, { recursive: true, force: true }).catch(() => {});
    await rm(replyDir, { recursive: true, force: true }).catch(() => {});
  }
}

const timeoutMs = 150;
// Straddle the grace budget: two comfortably inside, two comfortably outside.
const DELAYS = [0, 450, CLOSE_GRACE_MS + 400, CLOSE_GRACE_MS + 1500];
const REPEATS = Number(process.env.PROBE_REPEATS ?? 3);

console.log(`timeoutMs=${timeoutMs}  CLOSE_GRACE_MS=${CLOSE_GRACE_MS}  ceiling=${timeoutMs + CLOSE_GRACE_MS} ms\n`);
console.log('writer delay | raw_bytes | timed_out | envelope                      | elapsed');
console.log('-------------|-----------|-----------|-------------------------------|--------');

const verdicts = new Set();
for (const delay of DELAYS) {
  for (let i = 0; i < REPEATS; i += 1) {
    const r = await once(delay, timeoutMs);
    const verdict = `${r.status}/${r.reason}/${r.stage}`;
    verdicts.add(verdict);
    const inside = delay < CLOSE_GRACE_MS ? 'inside grace' : 'past grace';
    console.log(`${String(delay).padStart(6)} ms ${inside.padEnd(5)}| ${String(r.rawBytes).padStart(9)} | ${String(r.timedOut).padStart(9)} | ${verdict.padEnd(29)} | ${r.elapsed} ms`);
  }
}

console.log(`\ndistinct envelope verdicts across every delay: ${[...verdicts].join('  ')}`);
assert.equal(verdicts.size, 1, 'if this trips, the delay DOES change the product verdict and the flake is a real defect');
console.log('The product verdict is invariant to when the late bytes land; only `raw_bytes` flips.');
console.log('=> `assert.ok(audit.raw_bytes > 0)` is a race against CLOSE_GRACE_MS, not an invariant.');
