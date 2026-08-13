/**
 * Offline C05 regression: a worker reply that is not the agreed JSON must be
 * REJECTED, never salvaged into a plausible-looking summary.
 *
 * Why this file exists: C05's only prior evidence was the live case in
 * `capability-live.test.mjs`, which spends real tokens and is skipped by
 * default -- so in practice the invariant was not regressed at all. This suite
 * drives the same `dispatchWorker` code path through a compiled stub backend,
 * so it runs offline on every `node --test`.
 *
 * The invariant is load-bearing, not cosmetic: if unconstrained worker text were
 * accepted as a summary, that text would flow straight into the main agent's
 * context and the clean-context guarantee would be gone at that moment. Hence
 * every case asserts BOTH that the status is FAILED/RESULT_REJECTED AND that no
 * `summary` field rides along.
 *
 * The stub is spawned through the existing `ACE_CLAUDE_BIN` injection point and
 * receives the real fixed argv; no product code is modified or bypassed.
 *
 * Requires a C compiler (gcc/cc/clang), so the strength of this suite depends on
 * one environment variable:
 *
 *   unset                        -> CONDITIONAL coverage. A missing toolchain
 *                                   SKIPS the cases (visibly: the TAP skip count
 *                                   rises), and the run still exits 0.
 *   ACE_REQUIRE_STUB_BACKEND=1   -> ENFORCED coverage. A missing toolchain FAILS
 *                                   the run and names the reason. Whether a
 *                                   missing toolchain is tolerable is the caller's
 *                                   call, not this file's; without the switch
 *                                   nobody could make C05 binding in a given
 *                                   environment.
 *
 * A missing toolchain is the ONLY thing that skip governs. A compiler that is
 * present and fails to build the fixture is a defect and fails the run in both
 * modes — see `buildStub` for the reproduction that motivated the split.
 *
 * The skip is a registration-time `test(name, {skip}, fn)` on purpose. A `return`
 * inside a test body is counted as a PASS by node:test, so the earlier version of
 * this file reported the same counts with and without a compiler -- C05 was never
 * checked and nothing was observable. That is the exact "declared but never
 * checked" failure mode this suite exists to prevent.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

import { ENVELOPE_BUDGET_BYTES } from '../scripts/ingest-audit.mjs';
import { dispatchWorker } from '../scripts/dispatch-worker.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB_SOURCE = join(HERE, 'fixtures', 'stub-backend.c');

/** The backend must be a native binary: a .cmd/.bat shim cannot be spawned without a shell. */
const STUB_BINARY_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude';

let stubDir = null;
let stubBin = null;

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
 * Build the stub at module load, synchronously, so the result is known while the
 * tests are still being REGISTERED. An async `before()` cannot inform
 * `test(name, {skip}, fn)`: by the time it runs the options are already fixed,
 * which is why the earlier version of this file silently reported passes.
 *
 * Only a MISSING compiler skips. A compiler that is present and fails is retried, and
 * if it keeps failing it throws — the same split `dispatch-stream-completeness.test.mjs`
 * already makes, for the same reason.
 *
 * This file used to fold the two together: the `catch` returned
 * `skip: 'stub backend failed to compile: …'`, so a broken fixture and a toolchain-free
 * runner produced the same green. Reproduced here on a machine that HAS gcc — 1 run in
 * 12 of the full suite, all 8 cases skipped, `fail 0`, exit 0:
 *
 *   ﹣ the stub backend is usable and does not shadow a real one
 *       # stub backend failed to compile: Command failed: gcc -O0 -o …\claude.exe …
 *
 * Two separate defects in one line. First, C05 stopped being checked and the run still
 * reported success; the whole point of this suite is that a rejected worker reply cannot
 * be summarised, and that went unverified while looking fine. Second, `error.message`
 * carries neither `status` nor `stderr`, so the message could not distinguish a compiler
 * diagnostic (fixture broken) from an NTSTATUS with empty stderr (0xC0000043, the
 * environment refusing to create the image). Both are captured now, because the retry's
 * verdict depends on telling them apart.
 *
 * What makes the environment refuse is NOT known, and the retry deliberately does not
 * depend on knowing. The obvious suspect — this suite and `dispatch-stream-completeness`
 * competing for one artifact path — was measured and ruled out: each mkdtempSyncs its own
 * directory, and 120 concurrent builds of the two fixtures into fresh dirs produced 0
 * failures. Some other transient holder of the output path (AV scanner, indexer) fits the
 * signature; retrying is correct for any of them, which is why the cause was left open
 * rather than guessed at in a comment.
 *
 * `ACE_REQUIRE_STUB_BACKEND=1` did catch this case, since it fires on any `skip`. It is
 * not the fix: CI sets it to '0' on windows-latest, which is the platform where the
 * refusal was observed.
 */
function buildStub(attempts = 3) {
  const compiler = findCompiler();
  if (!compiler) return { skip: 'no C compiler (gcc/cc/clang) available to build the stub backend' };

  const failures = [];
  let lastDir = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const dir = mkdtempSync(join(tmpdir(), 'ace-stub-backend-'));
    lastDir = dir;
    const bin = join(dir, STUB_BINARY_NAME);
    try {
      execFileSync(compiler, ['-O0', '-o', bin, STUB_SOURCE], { stdio: 'pipe' });
      if (!existsSync(bin)) throw new Error('reported success but produced no binary');
      return { dir, bin };
    } catch (error) {
      // Both streams: a compiler diagnostic proves the fixture was read, an empty stderr
      // beside an NTSTATUS proves it was not. That difference is the diagnostic value.
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
      lastDir = null;
    }
  }
  throw new Error(
    `${compiler} could not build ${STUB_SOURCE} in ${attempts} attempts.\n`
    + `${failures.join('\n')}\n`
    + 'Repeated failure with compiler diagnostics means the fixture is broken; a single failure '
    + 'with an empty stderr and an NTSTATUS means the environment refused the compiler.'
    + (lastDir ? `\nLast build dir: ${lastDir}` : ''),
  );
}

const built = buildStub();
stubDir = built.dir ?? null;
stubBin = built.bin ?? null;

// A conditional suite that can vanish without anyone noticing is not coverage.
// CI sets this so a missing toolchain fails loudly instead of skipping quietly.
if (built.skip && process.env.ACE_REQUIRE_STUB_BACKEND === '1') {
  throw new Error(`ACE_REQUIRE_STUB_BACKEND=1 but the stub backend is unavailable: ${built.skip}`);
}

/** node:test only records a skip when it is passed at registration time. */
const options = built.skip ? { skip: built.skip } : {};

after(async () => {
  if (stubDir) await rm(stubDir, { recursive: true, force: true });
});

async function withTaskRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'ace-stub-task-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * Dispatch against the stub in a given reply mode.
 * `PATH: ''` guarantees the stub is the only resolvable backend, so a real
 * `claude` on this machine can never satisfy the test by accident.
 */
function dispatchAgainstStub({ taskRoot, dispatchId, mode, objective = 'stub objective' }) {
  return dispatchWorker({
    taskRoot,
    dispatchId,
    objective,
    env: { PATH: '', ACE_CLAUDE_BIN: stubBin, ACE_STUB_MODE: mode },
  });
}

/** Every rejection must look the same to the main agent, whatever the bad input was. */
function assertRejected(envelope, { dispatchId }) {
  assert.equal(envelope.status, 'FAILED');
  assert.equal(envelope.code, 'RESULT_REJECTED');
  assert.equal(envelope.dispatch_id, dispatchId);
  assert.ok(envelope.artifact_pointer, 'a rejected result must still be diagnosable');
  assert.ok(
    !('summary' in envelope),
    `a rejected result must not carry a plausible summary (got ${JSON.stringify(envelope.summary)})`,
  );
}

test('the stub backend is usable and does not shadow a real one', options, () => {
  assert.ok(existsSync(stubBin));
  assert.doesNotMatch(stubBin, /\.(cmd|bat|ps1)$/i);
});

test('C05 control: a well-formed stub reply IS accepted (the suite can tell them apart)', options, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-stub-ok',
      mode: 'ok',
    });
    // Without this case, every assertion below would also pass against a
    // dispatcher that rejects unconditionally.
    assert.equal(audit.launched, true, 'the stub must really be spawned');
    assert.equal(envelope.status, 'SUCCEEDED');
    assert.notEqual(envelope.code, 'RESULT_REJECTED');
    assert.equal(envelope.summary, 'stub ok');
  });
});

test('C05: a plain-text worker reply is rejected, not summarised', options, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-stub-plain',
      mode: 'plain',
    });
    assert.equal(audit.launched, true);
    assertRejected(envelope, { dispatchId: 'd-stub-plain' });
    assert.equal(envelope.reason, 'cli_output_unparseable');

    // The offending text must be on disk (diagnosable) but absent from the envelope.
    const raw = readFileSync(join(root, envelope.artifact_pointer), 'utf8');
    assert.equal(raw, 'BANANA');
    assert.doesNotMatch(JSON.stringify(envelope), /BANANA/);
  });
});

test('C05: truncated JSON is rejected, never leniently repaired', options, async () => {
  await withTaskRoot(async (root) => {
    const { envelope } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-stub-trunc',
      mode: 'truncated',
    });
    assertRejected(envelope, { dispatchId: 'd-stub-trunc' });
    assert.equal(envelope.reason, 'cli_output_unparseable');
    // A tolerant parser might read the prefix as status SUCCEEDED; it must not.
    assert.notEqual(envelope.status, 'SUCCEEDED');
    assert.equal(readFileSync(join(root, envelope.artifact_pointer), 'utf8'), '{"status":"SUCC');
  });
});

test('C05: valid JSON that does not match the worker contract is rejected', options, async () => {
  await withTaskRoot(async (root) => {
    const { envelope } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-stub-schema',
      mode: 'schema',
    });
    // Parses as JSON, so this exercises the inner contract check rather than the
    // outer JSON.parse -- a different rejection path with the same guarantee.
    assertRejected(envelope, { dispatchId: 'd-stub-schema' });
    assert.equal(envelope.reason, 'worker_output_not_json');
  });
});

test('C05: a status outside the enum is rejected even though the JSON is well formed', options, async () => {
  await withTaskRoot(async (root) => {
    const { envelope } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-stub-badstatus',
      mode: 'badstatus',
    });
    assertRejected(envelope, { dispatchId: 'd-stub-badstatus' });
    assert.equal(envelope.reason, 'invalid_status_enum');
    // The reply carried a readable summary; it must not survive the rejection.
    assert.doesNotMatch(JSON.stringify(envelope), /plausible but invalid/);
  });
});

test('C05: empty stdout is rejected and never read as success', options, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-stub-empty',
      mode: 'empty',
    });
    assert.equal(audit.launched, true);
    assert.equal(audit.exit_code, 0, 'a clean exit must not be mistaken for a valid reply');
    assertRejected(envelope, { dispatchId: 'd-stub-empty' });
    assert.equal(envelope.reason, 'cli_output_unparseable');
  });
});

test('C05: a huge non-JSON reply lands on disk while the envelope stays under 1 KiB', options, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-stub-huge',
      mode: 'huge',
    });
    assertRejected(envelope, { dispatchId: 'd-stub-huge' });

    const rawBytes = Buffer.byteLength(readFileSync(join(root, envelope.artifact_pointer)), 'utf8');
    assert.ok(rawBytes > 200 * 1024, `expected a large raw artifact, got ${rawBytes} bytes`);
    assert.equal(audit.raw_bytes, rawBytes);

    // The whole point: the flood is reachable only by path, never by value.
    const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
    assert.ok(
      envelopeBytes <= ENVELOPE_BUDGET_BYTES,
      `envelope ${envelopeBytes} bytes exceeds the ${ENVELOPE_BUDGET_BYTES} byte budget`,
    );
    assert.doesNotMatch(JSON.stringify(envelope), /XXXX/);
  });
});
