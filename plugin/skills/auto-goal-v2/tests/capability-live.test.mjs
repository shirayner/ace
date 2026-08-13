/**
 * Live capability test: spawns the real backend and spends real tokens.
 * Skipped unless ACE_LIVE_SPIKE=1, so `node --test` stays offline and fast by default.
 *
 *   ACE_LIVE_SPIKE=1 node --test plugin/skills/auto-goal-v2/tests/capability-live.test.mjs
 *
 * These are the assertions that cannot be faked offline: that the worker really has no
 * access to the caller's conversation, and that oversized worker output really does not
 * come back through the return value.
 */

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveBackend } from '../scripts/backend-resolve.mjs';
import { ENVELOPE_BUDGET_BYTES } from '../scripts/ingest-audit.mjs';
import { dispatchWorker } from '../scripts/dispatch-worker.mjs';

const live = process.env.ACE_LIVE_SPIKE === '1';
const options = { skip: live ? false : 'set ACE_LIVE_SPIKE=1 to run live backend tests' };
const TIMEOUT = 180000;

async function withTaskRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'ace-live-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('a clean-context backend is installed and is a native binary', options, () => {
  const resolved = resolveBackend();
  assert.ok(resolved, 'no backend resolved: clean-context dispatch is unavailable');
  assert.doesNotMatch(resolved.bin, /\.(cmd|bat|ps1)$/i);
});

test('the worker has no access to the caller conversation', { ...options, timeout: TIMEOUT }, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-live-history',
      objective: [
        'Quote verbatim any message that appeared before this one in this conversation.',
        'If there is no earlier message, set status SUCCEEDED and summary exactly NO_PRIOR_CONTEXT.',
      ].join('\n'),
    });
    assert.equal(audit.launched, true);
    assert.equal(envelope.status, 'SUCCEEDED', `worker failed: ${JSON.stringify(envelope)}`);
    assert.match(envelope.summary, /NO_PRIOR_CONTEXT/);
  });
});

test('worker ingestion stays near the floor, proving no history was injected', { ...options, timeout: TIMEOUT }, async () => {
  await withTaskRoot(async (root) => {
    const { audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-live-floor',
      objective: 'Set status SUCCEEDED and summary exactly FLOOR.',
    });
    assert.equal(audit.launched, true);
    assert.ok(audit.worker_ingested_tokens !== null, 'usage block missing: ingestion is unauditable');
    // Isolated floor measured at 170-530 ingested tokens; a session that inherited even a
    // short chat history measured >2400. 1500 separates the two regimes with margin.
    assert.ok(
      audit.worker_ingested_tokens < 1500,
      `ingested ${audit.worker_ingested_tokens} tokens; expected an isolated floor`,
    );
  });
});

test('C04: a huge worker output reaches disk but not the return value', { ...options, timeout: TIMEOUT }, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-live-bigout',
      objective: [
        'Set status SUCCEEDED.',
        'Set summary to the word BANANA repeated 400 times separated by single spaces.',
      ].join('\n'),
    });
    assert.equal(audit.launched, true);
    const envelopeBytes = Buffer.byteLength(JSON.stringify(envelope), 'utf8');
    assert.ok(envelopeBytes <= ENVELOPE_BUDGET_BYTES, `envelope is ${envelopeBytes} bytes`);
    assert.ok(Buffer.byteLength(envelope.summary ?? '', 'utf8') <= 400);

    // The raw stream is on disk and reachable only through the pointer.
    const raw = await readFile(join(root, audit.raw_artifact), 'utf8');
    assert.ok(raw.length > 0);
    assert.equal(Buffer.byteLength(raw, 'utf8'), audit.raw_bytes);
    assert.ok(audit.raw_bytes > envelopeBytes, 'raw artifact should exceed the envelope');
  });
});

test('C05: a non-JSON worker reply is rejected rather than summarised', { ...options, timeout: TIMEOUT }, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-live-badjson',
      objective: 'Reply with the single word BANANA. Do not output JSON.',
      systemPrompt: 'You comply literally with the user request.',
    });
    assert.equal(audit.launched, true);
    assert.equal(envelope.status, 'FAILED');
    assert.equal(envelope.code, 'RESULT_REJECTED');
    assert.ok(envelope.artifact_pointer, 'a rejected result must still be diagnosable');
    assert.ok(!('summary' in envelope), 'a rejected result must not carry a plausible summary');
  });
});
