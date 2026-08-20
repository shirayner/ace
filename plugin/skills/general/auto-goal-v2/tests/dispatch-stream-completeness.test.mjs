/**
 * Does `dispatchWorker` collect stdout on `'close'`, or does it read it on `'exit'`?
 *
 * Node's contract: `'exit'` fires when the child process terminates and does NOT promise the
 * stdio pipes have been drained; `'close'` fires only after every stdio stream is finished.
 * The dispatcher snapshots the byte collectors synchronously inside its settle function, so
 * settling on `'exit'` can capture a short or empty stdout. Downstream that is indistinguishable
 * from a broken worker: the raw artifact is written and hashed faithfully, the JSON parse of a
 * truncated envelope fails, and a worker that succeeded is rejected with
 * `cli_output_unparseable` — at random.
 *
 * Why the fixture spawns a grandchild instead of just writing a large payload. Measured on this
 * platform before this suite existed, with a child that writes its own stdout and exits:
 *
 *   4 KiB   x 400 runs, 8-way concurrency          -> 0 separations
 *   512 KiB x 120 runs, 8-way concurrency          -> 0 separations
 *   8 MiB   x  24 runs, 12-way, event loop blocked -> 0 separations
 *
 * In every one of those 544 runs the pipe was already drained by `'exit'`. A payload-size test
 * would therefore pass against the defect, which makes it worthless as a guard. What separates
 * the two events is not volume but *who owns the write handle*: when the spawned process hands
 * its inherited stdout to a helper and exits, `'exit'` arrives with the pipe open and empty and
 * `'close'` arrives after the helper is finished. Measured with that topology: 6/6 runs saw
 * 0 bytes at `'exit'` and the full 512 KiB at `'close'`.
 *
 * That topology is the normal case for a launcher-style backend, and the real Claude CLI ships
 * as exactly such a shim pair (see `backend-resolve.mjs`). So this is the defect's real
 * mechanism, not a synthetic amplifier of it.
 *
 * Requires a C compiler, for the same reason as the sibling stub suites: the observation can
 * only be made from a real child process. The skip is decided at module load so a suite that
 * does not run is reported as skipped rather than as passing tests.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

import { sha256Bytes } from '../lib/canonical.mjs';
import { CLOSE_GRACE_MS, dispatchWorker } from '../scripts/dispatch-worker.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB_SOURCE = join(HERE, 'fixtures', 'dispatch-ghost-stub.c');

/** A shim cannot be spawned without a shell, so the stub must be a native binary. */
const STUB_BINARY_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude';

/** Large enough to span many pipe chunks, so a partial read is partial by a wide margin. */
const PAYLOAD_BYTES = 512 * 1024;

function findCompiler() {
  for (const candidate of ['gcc', 'cc', 'clang']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * Build the ghost-writer stub, distinguishing a broken fixture from a hostile environment.
 *
 * Why the compile is wrapped at all. It used to run bare, so ANY compile failure threw during
 * module evaluation and killed the whole file: `node --test` reports one anonymous failure at
 * `<file>:1:1` and not one of the 8 cases in here is ever registered. A post-fix census caught
 * that once in 75 runs, with `gcc` exiting 3221225539 (0xC0000043, STATUS_SHARING_VIOLATION) and
 * an EMPTY stderr -- an empty stderr means gcc never got as far as compiling, so the fault was in
 * creating the process or its output image, not in the fixture.
 *
 * Why it is not simply downgraded to `skip` like a missing toolchain. A missing compiler is an
 * environment fact about which nothing can be done; a compile that FAILS is normally a broken
 * `.c` file, and silently skipping that would hide a real defect behind the same green as a
 * toolchain-free runner. So the two are separated: a retry distinguishes them empirically.
 * A fixture with a syntax error fails identically every time, and is rethrown with the compiler's
 * own diagnostics. A transient refusal succeeds on a later attempt and costs only the retry.
 *
 * The exhausted case still throws rather than skipping, for the same reason: repeated failure
 * with diagnostics is evidence of a broken fixture, and this suite must not go quiet on it.
 * `ACE_REQUIRE_STUB_BACKEND` therefore keeps its single meaning -- it governs the missing-toolchain
 * skip below and nothing else. (`probe-gcc-sharing-violation.mjs` ran 480 compiles across
 * concurrent/serial and shared/isolated %TEMP% arms without a single failure, so the mechanism
 * behind that census red is NOT demonstrated; this is the deterministic part -- one bad compile
 * must not erase 8 tests -- and makes no claim to have found the cause.)
 *
 * Both arms are verified rather than argued, by injecting a counting `gcc.exe` ahead of the real
 * one on PATH (`artifacts/verify-loud-failures.mjs`): failing once yields 2 invocations and all 8
 * cases still pass; failing always yields 3 invocations, a red file, and an error carrying the
 * compiler's status. A transparent-wrapper baseline runs first, so a wrapper that never executes
 * cannot be mistaken for a passing retry -- which is exactly the error it caught twice.
 */
function buildGhostStub(compiler, attempts = 3) {
  const failures = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const dir = mkdtempSync(join(tmpdir(), 'ace-ghost-stub-'));
    const bin = join(dir, STUB_BINARY_NAME);
    try {
      execFileSync(compiler, ['-O0', '-o', bin, STUB_SOURCE], { stdio: 'pipe' });
      if (!existsSync(bin)) throw new Error('reported success but produced no binary');
      return { bin, dir };
    } catch (error) {
      // Both streams: a compiler diagnostic proves the fixture was read, an empty stderr beside
      // an NTSTATUS proves it was not. That difference is the whole diagnostic value here.
      const stderr = error.stderr?.toString().trim() ?? '';
      const stdout = error.stdout?.toString().trim() ?? '';
      failures.push(
        `attempt ${attempt}: ${error.message}`
        + ` | status=${error.status ?? 'none'}`
        + (typeof error.status === 'number' ? ` (0x${(error.status >>> 0).toString(16).toUpperCase()})` : '')
        + ` | stderr=${JSON.stringify(stderr.slice(0, 500))}`
        + (stdout ? ` | stdout=${JSON.stringify(stdout.slice(0, 200))}` : ''),
      );
      rmSync(dir, { recursive: true, force: true });
    }
  }
  throw new Error(
    `${compiler} could not build ${STUB_SOURCE} in ${attempts} attempts.\n`
    + `${failures.join('\n')}\n`
    + 'Repeated failure with compiler diagnostics means the fixture is broken; a single failure '
    + 'with an empty stderr and an NTSTATUS means the environment refused the compiler.',
  );
}

const { options: STUB_OPTIONS, bin: stubBin, dir: stubDir } = (() => {
  const compiler = findCompiler();
  if (!compiler) {
    return { options: { skip: 'no C compiler (gcc/cc/clang) available to build the ghost-writer stub' } };
  }
  return { options: {}, ...buildGhostStub(compiler) };
})();

// A missing toolchain is an environment fact and skips; in CI it must be a hard failure, or
// this file would quietly stop testing anything. Same switch as the other stub suites.
if (STUB_OPTIONS.skip && process.env.ACE_REQUIRE_STUB_BACKEND === '1') {
  throw new Error(`ACE_REQUIRE_STUB_BACKEND=1 but the ghost-writer stub is unavailable: ${STUB_OPTIONS.skip}`);
}

/** Temp dirs holding canned replies; removed together after the suite. */
const replyDirs = [];

/**
 * Remove a temp tree, waiting out any writer that still holds it.
 *
 * Needed because of a fact this suite surfaced: `child.kill('SIGKILL')` signals only the
 * process the dispatcher spawned, so a detached writer outlives the timeout. It keeps the task
 * root as its cwd and the stub binary as its image, which makes `rmdir` EBUSY and `unlink`
 * EPERM on Windows until it exits on its own. That is test-fixture debris, not a dispatcher
 * defect -- the dispatch itself already returned -- but it must not be reported as a failure.
 */
async function removeWithRetry(target, deadlineMs = 15000) {
  const until = Date.now() + deadlineMs;
  for (;;) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (Date.now() > until) throw error;
      await new Promise((res) => setTimeout(res, 200));
    }
  }
}

after(async () => {
  if (stubDir) await removeWithRetry(stubDir);
  for (const dir of replyDirs) await removeWithRetry(dir);
});

/** A CLI envelope whose `result` is the worker's own JSON, as the real backend emits it. */
function cliEnvelope(workerOutput, extra = {}) {
  return JSON.stringify({
    result: JSON.stringify(workerOutput),
    usage: { input_tokens: 10, cache_read_input_tokens: 0 },
    ...extra,
  });
}

/**
 * A reply of exactly `PAYLOAD_BYTES`, padded in CLI-envelope noise rather than in `summary`.
 *
 * The padding cannot go in `summary`: the schema caps it at 400 bytes, and this test must
 * reach SUCCEEDED so that a truncated read is the only thing that can fail it.
 */
function bigReply() {
  const worker = { status: 'SUCCEEDED', summary: 'ghost writer finished after the child exited', claims: [], artifact_refs: [] };
  const skeleton = cliEnvelope(worker, { transcript: '' });
  const padding = 'y'.repeat(PAYLOAD_BYTES - Buffer.byteLength(skeleton, 'utf8'));
  const reply = cliEnvelope(worker, { transcript: padding });
  // Asserted, not assumed: `transcript` padding must not have shifted the total off the mark,
  // or the "bytes match exactly" assertions below would be comparing against the wrong ruler.
  assert.equal(Buffer.byteLength(reply, 'utf8'), PAYLOAD_BYTES);
  return reply;
}

/** Dispatch against the ghost stub, whose detached writer emits `reply` after the child exits. */
function dispatchAgainstGhost({ taskRoot, dispatchId, reply, stubEnv = {}, ...rest }) {
  const dir = mkdtempSync(join(tmpdir(), 'ace-ghost-reply-'));
  replyDirs.push(dir);
  const replyFile = join(dir, 'reply.bin');
  writeFileSync(replyFile, Buffer.from(reply, 'utf8'));
  return dispatchWorker({
    taskRoot,
    dispatchId,
    objective: 'reply from a detached writer',
    // `PATH: ''` guarantees the stub is the only resolvable backend, so a real `claude` on
    // this machine can never satisfy this test by accident.
    env: {
      PATH: '',
      ACE_CLAUDE_BIN: stubBin,
      ACE_GHOST_REPLY_FILE: replyFile,
      ...stubEnv,
    },
    ...rest,
  });
}

async function withTaskRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'ace-ghost-task-'));
  try {
    return await fn(root);
  } finally {
    await removeWithRetry(root);
  }
}

/**
 * How long this machine needs, right now, to get the stub's detached writer airborne.
 *
 * The deadline tests need a writer that exists but has not written yet. Two events race to
 * produce that state: the dispatcher's SIGKILL at `timeoutMs`, and the stub reaching its
 * `_spawnl`/`fork`. A hand-picked `timeoutMs` loses that race whenever process creation is
 * slower than the guess -- measured on this machine at 107-250 ms for the stub parent against a
 * 150 ms deadline, which made `raw_bytes > 0` fail about one run in eight. The failure was in
 * the fixture, never in the dispatcher: the product verdict was FAILED/worker_timeout in all 39
 * runs measured, because whether a writer got airborne cannot change whether the deadline was
 * breached.
 *
 * What is measured here is the stub parent's own lifetime, spawn to `'exit'`. That interval is
 * exactly the window in which a SIGKILL would prevent the writer from ever being detached,
 * because `'exit'` cannot arrive until after `detach_writer` has returned. Measuring a whole
 * dispatch instead is the mistake this replaced: a dispatch with `ACE_GHOST_DELAY_MS: 0`
 * overlaps the parent's exit with the writer's work and returned samples as low as 76 ms, which
 * yields a deadline *below* the racing interval and reintroduces the flake it was meant to
 * remove.
 *
 * The writer's delay is NOT part of that: this comment used to claim the 1000 ms below was needed
 * so the writer "cannot finish first and shorten the sample", and measurement says otherwise --
 * 15 interleaved samples each, `delay=0` gave min/med/max 226/249/586 ms and `delay=1000` gave
 * 210/244/634 ms, a 48 ms difference in the maxima and none in the medians. The parent returns
 * once `_spawnl` has handed off, whatever the grandchild then does, so the two settings measure
 * the same thing. Recorded because a mutation that flipped 1000 to 0 survived 16 rounds, and the
 * honest reading of that survival is not "the suite is weak" but "the mutation changes a parameter
 * the measurement does not depend on" -- an invalid mutation, whose survival is not evidence
 * either way. The real reason for 1000 is cleanup, and it is stated at the call site.
 *
 * The deadline is set at a multiple of the observed maximum rather than a fixed margin above
 * it: five samples cannot bound the tail of a process-creation distribution on a loaded
 * machine, so the headroom has to scale with what was seen instead of being a constant that
 * happens to work here.
 *
 * The multiple is load-bearing and the measurement is only a rough scale for it. Measured, full
 * suite, 16 rounds each: the hand-picked 150 ms reds 1/16 on `raw_bytes == 0`; `3 * d + 200`
 * (~450 ms here) reds 0/13. But in that one red round this function had returned 52 ms while the
 * dispatch's own detach exceeded 150 ms -- the sample is drawn from a different process than the
 * one under test, and under concurrency it can be off by 3x. So the value is usable for scaling a
 * deadline with headroom, and is NOT usable as a predicate about any single dispatch. An
 * `assert(measureDetachLatency() < timeoutMs)` was tried and removed for both reasons: it is
 * algebraically implied by the line below it, and it stayed silent through the one failure it
 * existed to explain.
 */
let detachMaxMs = null;

function measureDetachLatency() {
  if (detachMaxMs !== null) return detachMaxMs;
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const started = Date.now();
    // Synchronous on purpose: `execFileSync` returns when the stub parent exits, which is the
    // event being timed. The delay bounds the writer it detaches, and that is its whole job --
    // each of these writers holds the stub binary as its image, and one that outlives the suite
    // makes the `after()` cleanup fail with EBUSY. A second is long enough that every writer is
    // still alive while its parent is being timed, and short enough that all of them are gone
    // before cleanup. It does not change the measurement (see above). It never writes -- no reply
    // file is given.
    try {
      execFileSync(stubBin, [], {
        cwd: stubDir,
        stdio: 'ignore',
        env: { PATH: '', ACE_GHOST_DELAY_MS: '1000' },
      });
    } catch {
      /* the parent's exit status is irrelevant; only how long it took */
    }
    samples.push(Date.now() - started);
  }
  detachMaxMs = Math.max(...samples);
  return detachMaxMs;
}

/** A deadline comfortably past the detach race, derived from measurement rather than guessed. */
function safeTimeoutMs() {
  return 3 * measureDetachLatency() + 200;
}

test('stdout written after the spawned process exits is still collected in full', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const reply = bigReply();
    const expected = Buffer.from(reply, 'utf8');

    const { envelope, audit } = await dispatchAgainstGhost({
      taskRoot: root,
      dispatchId: 'd-ghost-full',
      reply,
    });

    // The point of the suite: settling on `'exit'` yields an empty stdout here, so the parse
    // fails and this is `RESULT_REJECTED / cli_output_unparseable` instead.
    assert.equal(envelope.status, 'SUCCEEDED', `unexpected rejection: ${JSON.stringify(envelope)}`);
    assert.equal(audit.launched, true);

    // Completeness, asserted three ways against ground truth rather than as "something arrived".
    assert.equal(audit.raw_bytes, PAYLOAD_BYTES);
    assert.equal(audit.raw_original_bytes, PAYLOAD_BYTES);
    assert.equal(audit.raw_truncated, false);
    assert.equal(audit.raw_sha256, sha256Bytes(expected));
    assert.deepEqual(readFileSync(join(root, audit.raw_artifact)), expected);
  });
});

test('a 4 MiB reply from a detached writer arrives whole, so no fixed slice is being read', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // A single size proves the bytes matched; a second, much larger one rules out the
    // possibility that some constant-sized buffer happened to hold the first payload.
    const worker = { status: 'SUCCEEDED', summary: 'four mebibytes through a ghost writer', claims: [], artifact_refs: [] };
    const target = 4 * 1024 * 1024;
    const skeleton = cliEnvelope(worker, { transcript: '' });
    const reply = cliEnvelope(worker, { transcript: 'z'.repeat(target - Buffer.byteLength(skeleton, 'utf8')) });
    const expected = Buffer.from(reply, 'utf8');
    assert.equal(expected.length, target);

    const { envelope, audit } = await dispatchAgainstGhost({
      taskRoot: root,
      dispatchId: 'd-ghost-4mib',
      reply,
    });

    assert.equal(envelope.status, 'SUCCEEDED', `unexpected rejection: ${JSON.stringify(envelope)}`);
    assert.equal(audit.raw_bytes, target);
    assert.equal(audit.raw_sha256, sha256Bytes(expected));
  });
});

test('the capture cap still fires on a detached writer, and truncation is declared', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // Waiting for `'close'` must not mean waiting forever, and must not quietly accept more
    // than the cap. The overflow kill targets the process the dispatcher spawned, which is
    // already gone -- so the guard that actually holds here is the collector's own ceiling.
    const cap = 64 * 1024;
    const { envelope, audit } = await dispatchAgainstGhost({
      taskRoot: root,
      dispatchId: 'd-ghost-cap',
      reply: bigReply(),
      maxRawBytes: cap,
    });

    // Every assertion here carries the capture readings, because this test reds about 1 run in 24
    // (full suite; 1/24 measured, so n=71 for 95% detection -- too rare to reproduce on demand).
    // The one captured failure said only `'RESULT_REJECTED' !== 'ARTIFACT_LIMIT_EXCEEDED'`, which
    // states that the cap did not fire and nothing about why. Both live causes are byte-shortfalls
    // and both are already in `audit`: fewer than `cap` bytes ever arrived (so no overflow could be
    // detected), or the image never ran at all (`exit_code` in the loader set, zero bytes). A
    // failure that has to be re-run 71 times to be diagnosed must diagnose itself the first time.
    const readings = () => `[cap=${cap} raw_bytes=${audit.raw_bytes} raw_original_bytes=${audit.raw_original_bytes} `
      + `raw_truncated=${audit.raw_truncated} exit_code=${audit.exit_code} timed_out=${audit.timed_out} `
      + `spawn_error=${JSON.stringify(audit.spawn_error ?? null)} envelope=${envelope.status}/${envelope.code}/${envelope.reason}]`;

    assert.equal(envelope.status, 'FAILED', `expected the cap to reject this dispatch ${readings()}`);
    assert.equal(
      envelope.code,
      'ARTIFACT_LIMIT_EXCEEDED',
      'the cap must be the stage that rejects. A RESULT_REJECTED here means the overflow was never '
      + `detected, i.e. fewer than ${cap} bytes ever arrived -- read raw_original_bytes and exit_code: `
      + `a loader-failure exit code with 0 bytes is an environment failure, not a cap defect. ${readings()}`,
    );
    assert.equal(envelope.reason, 'raw_output_over_limit', `unexpected reason ${readings()}`);
    assert.equal(audit.raw_bytes, cap, `the cap bounds what is retained, exactly ${readings()}`);
    assert.equal(audit.raw_truncated, true, `truncation must be declared ${readings()}`);
    assert.ok(audit.raw_original_bytes > cap, `the original must exceed the cap ${readings()}`);
  });
});

test('a deadline still settles, and a reply that lands after it is refused', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // Two regressions in one, both introduced by moving the collection point to `'close'`:
    //
    // 1. `'close'` cannot arrive while a live writer owns the inherited stdout, so a timeout
    //    path that waits only for `'close'` would hang forever and `timeoutMs` would stop being
    //    a ceiling. The bound is `timeoutMs + CLOSE_GRACE_MS`, asserted against the constant
    //    rather than a hand-picked number so the two cannot drift apart.
    // 2. The writer survives SIGKILL (the signal reaches only the process the dispatcher
    //    spawned), so a complete, valid, parseable reply can arrive after the deadline. It must
    //    be refused: accepting it would make the deadline advisory.
    //
    // The ordering this test needs is spawn-out < deadline < write < grace ceiling: the writer
    // must be airborne before the kill (or there is nothing to arrive late) and must write
    // inside the grace window (or only the bound is tested, not the refusal). The deadline is
    // scaled off a measurement rather than hand-picked, because 150 ms lost the race with process
    // creation about one run in eight and surfaced as a red on the evidence assertion below.
    const timeoutMs = safeTimeoutMs();
    const writeAt = timeoutMs + 200;

    // That ordering is NOT asserted up front, and the two guards that used to try are gone. Both
    // were measured, and the measurements are what removed them:
    //
    //   `writeAt - timeoutMs < CLOSE_GRACE_MS` with `writeAt = timeoutMs + 200` cancels to
    //   `200 < CLOSE_GRACE_MS` -- two source constants, true on every machine in every load
    //   condition, even with no writer at all.
    //
    //   `measureDetachLatency() < timeoutMs` with `timeoutMs = 3 * measureDetachLatency() + 200`
    //   cancels to `d < 3d + 200` -- true for every d >= 0. Written as the fix for exactly this
    //   defect, it reproduced the defect. Mutation-tested: forcing the deadline below the measured
    //   latency killed it, but restoring the original hand-picked 150 ms did not, because a cached
    //   5-sample max is not the latency of THIS dispatch. In the one full-suite round out of 16
    //   that did reproduce the flake, the measurement read 52 ms while the real detach exceeded
    //   150 ms: the guard would have stayed silent through the failure it was written to explain.
    //
    // A precondition computed from the same expression it checks cannot fail, and one that samples
    // a different process than the one under test does not predict it. The ordering is instead
    // established by observation, below: `raw_bytes > 0` is true only if the writer really was
    // airborne before the kill AND really did write inside the grace window. It is the same two
    // facts, read from the run instead of asserted about it -- and unlike a precondition, it is
    // known to fail when they do not hold.
    const started = Date.now();
    const { envelope, audit } = await dispatchAgainstGhost({
      taskRoot: root,
      dispatchId: 'd-ghost-timeout',
      reply: bigReply(),
      timeoutMs,
      stubEnv: { ACE_GHOST_DELAY_MS: String(writeAt) },
    });

    assert.equal(audit.timed_out, true, 'the deadline must be reported, not silently survived');
    assert.equal(envelope.status, 'FAILED');
    assert.equal(envelope.code, 'RESULT_REJECTED');
    assert.equal(envelope.reason, 'worker_timeout');
    assert.equal(audit.rejected_stage, 'timeout');

    // The late reply is evidence, not a result: it reached disk, and it did not reach the
    // envelope. Both halves matter -- §3 keeps a rejection diagnosable.
    //
    // This is also where the fixture premise is checked, so the message has to separate the two
    // things a zero can mean. `raw_bytes == 0` with the assertions above already green means the
    // dispatcher did everything right and the writer simply never got airborne before the kill --
    // a slow machine, not a defect. Reproduced 1 round in 16 against the old 150 ms deadline; the
    // scaled deadline is what makes it rare, and this message is what keeps it from being
    // misread as the dispatcher dropping bytes.
    assert.ok(
      audit.raw_bytes > 0,
      `the late bytes must still be captured as evidence, but raw_bytes is ${audit.raw_bytes}. `
      + `The rejection above is correct, so the dispatcher is not at fault: with a ${timeoutMs} ms `
      + `deadline the SIGKILL beat the stub's own process creation, and no writer ever existed to `
      + 'write late. Re-run on an idle machine; if it persists, process creation here is slower '
      + 'than 3x the sampled detach latency and safeTimeoutMs needs a larger multiple.',
    );
    assert.ok(!('summary' in envelope), 'a timed-out dispatch must not carry a summary');
    assert.ok(envelope.artifact_pointer, 'a rejected result must still be diagnosable');

    const elapsed = Date.now() - started;
    assert.ok(
      elapsed < timeoutMs + CLOSE_GRACE_MS + 1000,
      `dispatch took ${elapsed} ms, past the ${timeoutMs} + ${CLOSE_GRACE_MS} ms ceiling`,
    );
  });
});

test('the grace budget bounds the wait even when the writer never releases the pipe', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // Distinct from the test above, which keeps its writer inside the grace window so the late
    // bytes arrive. Here the writer outlives the window: `'close'` cannot arrive before the
    // budget expires, so the budget is the only thing that can settle this dispatch. Deleting
    // it leaves the promise waiting on a stream no live child owns, and the earlier test would
    // not notice -- its writer settles it either way.
    //
    // The assertion is an upper bound, not an equality: it must fail if the wait becomes
    // unbounded, and must not fail because a loaded machine was slow.
    //
    // `timeoutMs` is derived from the same measurement as the test above, for a reason specific
    // to this one: if the kill beats the stub's spawn-out, no writer ever holds the pipe,
    // `'close'` arrives at once, and every assertion below passes while testing nothing at all.
    // That is the vacuous form of this test, and a hardcoded deadline is what produces it.
    const timeoutMs = safeTimeoutMs();
    const writerAlive = timeoutMs + CLOSE_GRACE_MS + 4000;
    const started = Date.now();

    const { envelope, audit } = await dispatchAgainstGhost({
      taskRoot: root,
      dispatchId: 'd-ghost-grace',
      reply: bigReply(),
      timeoutMs,
      stubEnv: { ACE_GHOST_DELAY_MS: String(writerAlive) },
    });
    const elapsed = Date.now() - started;

    assert.equal(audit.timed_out, true);
    assert.equal(envelope.reason, 'worker_timeout');
    assert.ok(
      elapsed < writerAlive - 1000,
      `dispatch took ${elapsed} ms and the writer lives ${writerAlive} ms: the wait is not bounded by the grace budget`,
    );
    // The lower bound is what keeps this test from passing vacuously. Without it, a dispatch that
    // settled immediately -- because no writer ever took the pipe -- satisfies every assertion
    // above: `timed_out` is true, the reason is right, and the elapsed time is comfortably under
    // the ceiling. The grace budget is only under test if the dispatch actually had to wait it
    // out, so the wait must be at least the budget rather than merely less than the writer.
    assert.ok(
      elapsed >= CLOSE_GRACE_MS,
      `dispatch settled in ${elapsed} ms, under the ${CLOSE_GRACE_MS} ms grace budget: nothing held the pipe, so the budget was never exercised`,
    );
  });
});

test('an unspawnable backend terminates the dispatch instead of hanging on a close that never comes', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // The third way out of the settle function. Moving the success path from `'exit'` to
    // `'close'` is exactly the change that can leave a child which never spawned with no
    // event left to resolve on, so "it terminates at all" is the property under test.
    //
    // This test used to refuse to pin the failure SHAPE, on the grounds that doing so would pin
    // the platform's error taxonomy rather than the dispatcher's contract. That reasoning was
    // right about the old code and is now obsolete: `dispatchWorker` catches the synchronous
    // `spawn` throw and resolves the same capture shape as the async `'error'` event, so one
    // outcome is guaranteed on every platform. The hedge is therefore removed -- and with it a
    // vacuity hole, since the old `if (rejected) return` branch could pass while asserting
    // nothing about the audit at all.
    const notAnImage = join(mkdtempSync(join(tmpdir(), 'ace-ghost-bad-')), STUB_BINARY_NAME);
    replyDirs.push(dirname(notAnImage));
    writeFileSync(notAnImage, 'this is not an executable image');

    const { envelope, audit } = await dispatchAgainstGhost({
      taskRoot: root,
      dispatchId: 'd-ghost-nospawn',
      reply: 'unused',
      stubEnv: { ACE_CLAUDE_BIN: notAnImage },
    });

    assert.equal(envelope.status, 'FAILED');
    assert.ok(!('summary' in envelope), 'a failed dispatch must not carry a plausible summary');

    // The audit must carry the reason.
    //
    // `exit_code` cannot carry this on its own: a child that never launched has no exit code, so
    // "never spawned" and "spawned, wrote nothing, exited 0" collapse into the same reading. That
    // ambiguity is not hypothetical -- it is what made two ~4%-rate flakes (this suite's cap test,
    // dispatch-pipeline's B5) undiagnosable from their failure output, since both are byte
    // shortfalls and neither could say whether bytes were lost or never produced.
    //
    // `launched: true` is the correct reading and the one this test had backwards: a backend WAS
    // resolved and a launch WAS attempted. `launched: false` is reserved for the pre-spawn
    // refusal, which is a different state with a different cause -- see the control test for the
    // unresolvable case, which pins that half of the taxonomy.
    assert.equal(audit.launched, true, `a resolved backend was launch-attempted: ${JSON.stringify(audit)}`);
    assert.equal(typeof audit.spawn_error, 'string', `spawn_error must name the failure: ${JSON.stringify(audit)}`);
    assert.match(audit.spawn_error, /spawn|ENOENT|EACCES|UNKNOWN|EFTYPE/i);
    assert.equal(audit.exit_code, null, 'a child that never ran has no exit code');
  });
});

test('a spawn failure names itself in the audit rather than only in the raw artifact', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // The complement of the test above, and the one that actually pins `spawn_error`.
    //
    // This test used a DIRECTORY named like the binary, on the stated premise that "the child gets
    // a pid, so `resolveBackend` passes it through". That premise was false, and the test failed
    // 22/22 rounds because of it. Measured taxonomy (probe: `artifacts/probe-spawn-error-taxonomy.mjs`):
    //
    //   directory as backend    -> resolveBackend returns null (isFile refuses it)
    //                              => DISPATCH_REJECTED, launched:false, NO spawn_error field
    //   nonexistent path        -> identical to the above
    //   real file, not an image -> isFile passes; spawn THROWS `spawn UNKNOWN` (win32)
    //   zero-byte file          -> isFile passes; spawn THROWS `spawn EFTYPE` (win32)
    //
    // So a directory is refused BEFORE any spawn and therefore cannot produce a spawn failure to
    // report. The input that reaches the spawn path is a real file that is not a valid executable
    // image -- `isFile` admits it, and the launch is what fails. That is what this uses now.
    //
    // The synchronous throw is not asserted around any more either: `dispatchWorker` catches it
    // and resolves the same capture shape the async `'error'` event produces, precisely so that
    // "resolved backend cannot be launched" has ONE observable outcome instead of one per platform.
    const junkDir = mkdtempSync(join(tmpdir(), 'ace-ghost-junk-'));
    replyDirs.push(junkDir);
    const notAnImage = join(junkDir, STUB_BINARY_NAME);
    writeFileSync(notAnImage, 'this is not a valid executable image\n');
    try {
      chmodSync(notAnImage, 0o755); // POSIX: make the failure EFTYPE/UNKNOWN, not EACCES
    } catch {
      /* win32 has no executable bit */
    }

    const { envelope, audit } = await dispatchAgainstGhost({
      taskRoot: root,
      dispatchId: 'd-ghost-spawnerr',
      reply: 'unused',
      stubEnv: { ACE_CLAUDE_BIN: notAnImage },
    });

    assert.equal(envelope.status, 'FAILED', `expected failure, got ${JSON.stringify(envelope)}`);
    // `launched` is true: a backend WAS resolved and a launch WAS attempted. This is the state
    // `exit_code` alone cannot express -- it is null here, exactly as it is for a child that
    // launched, wrote nothing and exited 0.
    assert.equal(audit.launched, true, `a resolved backend was launch-attempted: ${JSON.stringify(audit)}`);
    assert.equal(audit.exit_code, null, 'a child that never ran has no exit code');
    assert.equal(
      typeof audit.spawn_error,
      'string',
      'a dispatch that failed to spawn must report the reason in the audit, not only inside the raw '
      + `artifact: ${JSON.stringify(audit)}`,
    );
    assert.ok(audit.spawn_error.length > 0, 'an empty spawn_error is not a reason');
    // The reason must be the launch failure itself, not some downstream parse complaint.
    assert.match(audit.spawn_error, /spawn|ENOENT|EACCES|UNKNOWN|EFTYPE|EISDIR/i);
    // And it must still ALSO reach the raw artifact, since that is the only diagnostic a caller
    // has when the audit is not what they kept.
    assert.ok(audit.raw_bytes > 0, 'the spawn failure text is what the raw artifact carries');
  });
});

test('control: an unresolvable backend is refused before any spawn and carries no spawn_error', async () => {
  await withTaskRoot(async (root) => {
    // The other half of the taxonomy, asserted so the two states can never be conflated again.
    // A directory is the exact input the test above used to use: it must produce the PRE-spawn
    // rejection, with `launched: false` and no launch attempt at all. Without this control,
    // `dispatchWorker` could start reporting a fabricated `spawn_error` for unresolvable backends
    // and the suite would not notice.
    const asDirectory = join(mkdtempSync(join(tmpdir(), 'ace-ghost-dir-')), STUB_BINARY_NAME);
    replyDirs.push(dirname(asDirectory));
    mkdirSync(asDirectory, { recursive: true });

    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-ghost-nobackend',
      objective: 'never launched',
      env: { PATH: '', ACE_CLAUDE_BIN: asDirectory },
    });

    assert.equal(envelope.status, 'FAILED');
    assert.equal(envelope.code, 'DISPATCH_REJECTED');
    assert.equal(envelope.reason, 'no_clean_context_backend');
    assert.equal(audit.launched, false);
    assert.equal(audit.backend, null);
    assert.ok(!('spawn_error' in audit), 'nothing was spawned, so there is no spawn error to name');
  });
});
