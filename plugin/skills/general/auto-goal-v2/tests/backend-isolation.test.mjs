/**
 * Offline tests for the clean-context backend. No model calls; runs on any platform.
 * Live end-to-end coverage lives in `capability-live.test.mjs` behind ACE_LIVE_SPIKE=1.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  FORBIDDEN_ARGS,
  assertIsolatedArgs,
  buildArgs,
  cleanEnv,
  resolveBackend,
} from '../scripts/backend-resolve.mjs';
import {
  ENVELOPE_BUDGET_BYTES,
  LAUNCH_BUDGET_BYTES,
  checkLaunchBudget,
  ingestedTokens,
  injectedBytes,
  projectEnvelope,
} from '../scripts/ingest-audit.mjs';
import { dispatchWorker, safeRelativePath } from '../scripts/dispatch-worker.mjs';

test('argv carries every isolation flag and none of the history flags', () => {
  const args = buildArgs({ systemPrompt: 'sp', model: 'claude-opus-5' });
  assert.ok(args.includes('--bare'));
  assert.ok(args.includes('--no-session-persistence'));
  assert.ok(args.includes('--setting-sources'));
  assert.ok(args.includes('--tools'));
  for (const forbidden of FORBIDDEN_ARGS) assert.ok(!args.includes(forbidden), `leaked ${forbidden}`);
  assert.equal(assertIsolatedArgs(args), true);
});

test('X02: argv that would inherit the caller session is rejected', () => {
  const tampered = [...buildArgs({ systemPrompt: 'sp' }), '--resume', 'abc'];
  assert.throws(() => assertIsolatedArgs(tampered), /INVARIANT_VIOLATED/);
  assert.throws(() => assertIsolatedArgs(['-p', '--bare']), /missing required isolation arg/);
});

test('cleanEnv strips parent session identity and the conflicting auth token', () => {
  const parent = {
    ANTHROPIC_API_KEY: 'sk-keep',
    ANTHROPIC_BASE_URL: 'https://example.invalid',
    ANTHROPIC_AUTH_TOKEN: 'sk-other-gateway',
    CLAUDE_CODE_SESSION_ID: 'parent-session',
    CLAUDE_CODE_CHILD_SESSION: '1',
    CLAUDECODE: '1',
    CLAUDE_CODE_ENTRYPOINT: 'cli',
    CLAUDE_CODE_EXECPATH: 'C:/somewhere/claude.exe',
  };
  const child = cleanEnv(parent);
  assert.equal(child.ANTHROPIC_API_KEY, 'sk-keep');
  assert.equal(child.ANTHROPIC_BASE_URL, 'https://example.invalid');
  for (const key of [
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_EXECPATH',
  ]) {
    assert.ok(!(key in child), `${key} leaked into worker env`);
  }
});

// Resolved once at module load so the shim check below can declare itself SKIPPED when no
// backend exists, rather than returning early: an early return reports `ok` with the
// assertion never executed, which is indistinguishable in TAP from a real pass.
const INSTALLED_BACKEND = resolveBackend();

test('resolver never returns a .cmd/.bat/.ps1 shim (Node spawn EINVAL without a shell)', {
  skip: INSTALLED_BACKEND ? false : 'no clean-context backend installed on this machine',
}, () => {
  assert.doesNotMatch(INSTALLED_BACKEND.bin, /\.(cmd|bat|ps1)$/i);
});

test('a real .cmd shim with no native sibling is refused, not returned', async () => {
  // The machine-independent half of the assertion above: an actually-present shim, not a
  // missing path, must still be rejected -- otherwise the resolver's shim branch would be
  // proven only by a file that does not exist, which any `isFile` check rejects anyway.
  const shimDir = await mkdtemp(join(tmpdir(), 'ace-shim-'));
  try {
    const shim = join(shimDir, 'claude.cmd');
    await writeFile(shim, '@echo off\r\n');
    assert.equal(resolveBackend({ PATH: '', ACE_CLAUDE_BIN: shim }), null);
    assert.equal(resolveBackend({ PATH: shimDir }), null);
  } finally {
    await rm(shimDir, { recursive: true, force: true });
  }
});

test('resolver honours ACE_CLAUDE_BIN and ignores an unusable shim', () => {
  const shimOnly = resolveBackend({ PATH: '', ACE_CLAUDE_BIN: join(tmpdir(), 'definitely-missing-claude.cmd') });
  assert.equal(shimOnly, null);
});

test('ingestedTokens counts cached prefix tokens, which input_tokens alone hides', () => {
  // Real numbers from the spike: resuming a seeded session vs a fresh one.
  const resumed = { input_tokens: 228, cache_read_input_tokens: 2304, cache_creation_input_tokens: 0 };
  const fresh = { input_tokens: 196, cache_read_input_tokens: 256, cache_creation_input_tokens: 0 };
  assert.equal(ingestedTokens(resumed), 2532);
  assert.equal(ingestedTokens(fresh), 452);
  // The naive metric inverts the comparison, which is exactly why we do not use it.
  assert.ok(resumed.input_tokens > fresh.input_tokens);
  assert.ok(ingestedTokens(resumed) > ingestedTokens(fresh) * 5);
  assert.equal(ingestedTokens(null), null);
  assert.equal(ingestedTokens({}), null);
});

test('C03: launch payload over 16 KiB is rejected before any spawn, with byte breakdown', () => {
  const breakdown = injectedBytes({ systemPrompt: 'a'.repeat(100), userPrompt: 'b'.repeat(LAUNCH_BUDGET_BYTES) });
  const gate = checkLaunchBudget(breakdown);
  assert.equal(gate.ok, false);
  assert.equal(gate.envelope.code, 'DISPATCH_REJECTED');
  assert.equal(gate.envelope.bytes, breakdown.total);
  assert.ok(gate.envelope.parts.user_prompt > 0);

  const withinBudget = checkLaunchBudget(injectedBytes({ systemPrompt: 'x', userPrompt: 'y' }));
  assert.equal(withinBudget.ok, true);
});

test('injectedBytes counts UTF-8 bytes, not characters', () => {
  const { total } = injectedBytes({ userPrompt: '需求' });
  assert.equal(total, 6);
});

test('C04: an oversized worker result still yields a <=1 KiB parseable envelope', () => {
  const { envelope, bytes } = projectEnvelope(
    {
      status: 'SUCCEEDED',
      summary: 'z'.repeat(50000),
      claims: Array.from({ length: 40 }, (_, i) => ({ kind: 'fact_found', subject_ref: `s${i}`, result: 'y'.repeat(500) })),
      artifact_refs: Array.from({ length: 30 }, (_, i) => `a-${i}`),
    },
    { dispatchId: 'd-1', artifactRef: 'artifacts/raw/d-1.raw' },
  );
  assert.ok(bytes <= ENVELOPE_BUDGET_BYTES, `envelope ${bytes} bytes exceeds budget`);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(envelope)));
  assert.equal(envelope.dispatch_id, 'd-1');
  assert.equal(envelope.artifact_pointer, 'artifacts/raw/d-1.raw');
  assert.ok(Buffer.byteLength(envelope.summary ?? '', 'utf8') <= 400);
});

test('summary clamping keeps 400 bytes without emitting broken UTF-8', () => {
  const { envelope } = projectEnvelope({ status: 'SUCCEEDED', summary: '中'.repeat(300) }, { dispatchId: 'd-2' });
  assert.ok(Buffer.byteLength(envelope.summary, 'utf8') <= 400);
  assert.doesNotMatch(envelope.summary, /\uFFFD/);
});

test('C07: path traversal, absolute paths and drive letters are refused', () => {
  const root = join(tmpdir(), 'ace-task-root');
  for (const bad of ['../outside.txt', 'a/../../outside.txt', '/etc/passwd', 'C:/Windows/system.ini', '']) {
    assert.throws(() => safeRelativePath(root, bad), /DISPATCH_REJECTED/, `accepted ${bad}`);
  }
  const good = safeRelativePath(root, 'artifacts/raw/x.raw');
  assert.equal(good.relative, 'artifacts/raw/x.raw');
  assert.ok(!good.relative.includes('\\'));
});

test('missing backend produces DISPATCH_REJECTED and never launches', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ace-nobackend-'));
  try {
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-nobackend',
      objective: 'anything',
      env: { PATH: '' },
    });
    assert.equal(envelope.code, 'DISPATCH_REJECTED');
    assert.equal(envelope.reason, 'no_clean_context_backend');
    assert.equal(audit.launched, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('C02/C03: over-budget dispatch does not launch and writes no artifact', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ace-overbudget-'));
  try {
    // The subject here is the budget gate, which sits AFTER backend resolution in
    // dispatchWorker. Without an injected backend this test would report
    // `no_clean_context_backend` on any machine without the Claude CLI -- green for
    // developers, red in CI, and the green side is the accident. `process.execPath` is
    // a real native binary on every platform, so resolution succeeds deterministically;
    // the budget gate then rejects before anything is ever spawned.
    const env = { PATH: '', ACE_CLAUDE_BIN: process.execPath };
    assert.notEqual(resolveBackend(env), null, 'precondition: the injected backend resolves');

    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-big',
      objective: 'q'.repeat(LAUNCH_BUDGET_BYTES + 1),
      env,
    });
    assert.equal(envelope.code, 'DISPATCH_REJECTED');
    assert.equal(envelope.reason, 'launch_payload_over_budget');
    assert.equal(audit.launched, false);
    await assert.rejects(readFile(join(root, 'artifacts/raw')), /ENOENT|EISDIR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
