/**
 * Offline regression for the §3 output-ingestion pipeline of `protocols/dispatch.md`.
 *
 * Two defects motivate this suite, both silent in every earlier test:
 *
 * B4 — stdout was decoded per pipe chunk (`text += chunk`), so a multi-byte UTF-8
 *      character straddling a chunk boundary decayed into U+FFFD. The raw artifact, its
 *      byte count and its sha256 were then all wrong together, and sha256 is the root of
 *      every later integrity check. Chinese output makes this the common case, not a corner.
 *      Also, accumulation had no ceiling: a runaway worker could exhaust the dispatcher heap.
 *
 * B5 — the pipeline ran CAPTURE -> RAW WRITE -> HASH -> PARSE -> NORMALIZE and stopped.
 *      SCHEMA VALIDATE, SEMANTIC VALIDATE and HASH+MANIFEST were absent, so a schema-valid
 *      but unauthorised result (a DISCOVER worker declaring a criterion checked) was accepted
 *      as SUCCEEDED and reached the main agent's criterion ledger.
 *
 * The stub backend is spawned through the existing `ACE_CLAUDE_BIN` injection point with the
 * real fixed argv; no product code is modified or bypassed. Requires a C compiler; without
 * one the suite skips, since a missing toolchain is an environment fact, not a defect.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

import { readManifestIndex, registerManifest, verifyArtifactIntegrity } from '../lib/artifacts.mjs';
import { BUDGETS } from '../lib/budgets.mjs';
import { canonicalize, sha256Bytes } from '../lib/canonical.mjs';
import { validateSchema } from '../lib/schema-validator.mjs';
import { getSchema, SCHEMA_IDS } from '../schemas/registry.mjs';
import {
  buildWorkerInput,
  dispatchWorker,
  measureWorkerInput,
  WORKER_SYSTEM_PROMPT,
} from '../scripts/dispatch-worker.mjs';
import { checkLaunchBudget, injectedBytes } from '../scripts/ingest-audit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB_SOURCE = join(HERE, 'fixtures', 'dispatch-pipeline-stub.c');

/** The backend must be a native binary: a .cmd/.bat shim cannot be spawned without a shell. */
const STUB_BINARY_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude';

const TASK_ID = 'goal-dispatch-pipeline';

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
 * Build the stub at module load, synchronously, and decide the skip once.
 *
 * Why not in a `before` hook with `if (skipReason) return` inside each test: that shape
 * reports a skipped suite as N passing tests. It was observed silently passing all 16 cases
 * in roughly one run in thirty here, which is precisely the false green these tests exist to
 * prevent. Deciding at load time lets the skip travel in `node:test`'s own `skip` option, so
 * a suite that does not run is reported as skipped and never counted as passed.
 *
 * A missing toolchain is an environment fact and skips. Anything else — a compiler that is
 * present but fails, or produces no binary — is a defect and throws.
 */
const { options: STUB_OPTIONS, bin: stubBin, dir: stubDir } = (() => {
  const compiler = findCompiler();
  if (!compiler) {
    return { options: { skip: 'no C compiler (gcc/cc/clang) available to build the stub backend' } };
  }
  const dir = mkdtempSync(join(tmpdir(), 'ace-pipeline-stub-'));
  const bin = join(dir, STUB_BINARY_NAME);
  execFileSync(compiler, ['-O0', '-o', bin, STUB_SOURCE], { stdio: 'pipe' });
  if (!existsSync(bin)) {
    throw new Error(`${compiler} reported success but produced no binary at ${bin}`);
  }
  return { options: {}, bin, dir };
})();

/** Temp dirs holding canned replies; removed together after the suite. */
const replyFiles = [];

// A conditional suite that can vanish without anyone noticing is not coverage. CI sets this
// so a missing toolchain fails loudly instead of skipping quietly. Same switch as the other
// stub suites -- without it these 22 cases would silently stop regressing anything.
if (STUB_OPTIONS.skip && process.env.ACE_REQUIRE_STUB_BACKEND === '1') {
  throw new Error(`ACE_REQUIRE_STUB_BACKEND=1 but the pipeline stub is unavailable: ${STUB_OPTIONS.skip}`);
}

after(async () => {
  if (stubDir) await rm(stubDir, { recursive: true, force: true });
  for (const dir of replyFiles) await rm(dir, { recursive: true, force: true });
});

async function withTaskRoot(fn) {
  const root = await mkdtemp(join(tmpdir(), 'ace-pipeline-task-'));
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * Dispatch against the stub, which replies with `reply` verbatim.
 *
 * The reply travels through a file rather than through `objective`: stdin now carries the §2
 * input envelope, whose `objective` the schema caps at 400 bytes, so it cannot smuggle a
 * multi-KB canned reply. Writing the bytes to a file keeps them byte-exact, which is what the
 * B4 fidelity assertions depend on.
 *
 * `PATH: ''` guarantees the stub is the only resolvable backend, so a real `claude` on
 * this machine can never satisfy a test by accident.
 */
function dispatchAgainstStub({ taskRoot, dispatchId, reply, stubEnv = {}, ...rest }) {
  const replyFile = join(mkdtempSync(join(tmpdir(), 'ace-pipeline-reply-')), 'reply.bin');
  replyFiles.push(dirname(replyFile));
  writeFileSync(replyFile, Buffer.from(reply ?? '', 'utf8'));
  return dispatchWorker({
    taskRoot,
    dispatchId,
    objective: 'emit the canned reply',
    env: {
      PATH: '',
      ACE_CLAUDE_BIN: stubBin,
      ACE_STUB_REPLY_FILE: replyFile,
      ...stubEnv,
    },
    ...rest,
  });
}

/** A CLI envelope whose `result` is the worker's own JSON, as the real backend emits it. */
function cliEnvelope(workerOutput, extra = {}) {
  return JSON.stringify({
    result: JSON.stringify(workerOutput),
    usage: { input_tokens: 10, cache_read_input_tokens: 0 },
    ...extra,
  });
}

function assertRejected(envelope, { dispatchId, code = 'RESULT_REJECTED' }) {
  assert.equal(envelope.status, 'FAILED');
  assert.equal(envelope.code, code);
  assert.equal(envelope.dispatch_id, dispatchId);
  assert.ok(envelope.artifact_pointer, 'a rejected result must still be diagnosable');
  assert.ok(
    !('summary' in envelope),
    `a rejected result must not carry a plausible summary (got ${JSON.stringify(envelope.summary)})`,
  );
}

test('the stub backend is usable and does not shadow a real one', STUB_OPTIONS, () => {
  assert.ok(existsSync(stubBin));
  assert.doesNotMatch(stubBin, /\.(cmd|bat|ps1)$/i);
});

// ---------------------------------------------------------------- B4: byte fidelity

/**
 * Build a reply large enough to span many 64 KiB pipe chunks, and report the exact bytes
 * the stub will emit so the test can compare against ground truth.
 *
 * The stub expands one `<<PAD:unit:PAD>>` token instead of receiving the whole payload,
 * because the objective itself is gated at 16 KiB before launch (dispatch.md §2).
 */
function paddedReply({ unit, repeats, summary }) {
  const worker = { status: 'SUCCEEDED', summary, claims: [], artifact_refs: [] };
  // `transcript` is CLI-envelope noise, not worker output: it makes the raw stream big
  // without pushing `summary` past its 400-byte schema ceiling.
  const template = cliEnvelope(worker, { transcript: `<<PAD:${unit}:PAD>>` });
  const expected = template.replace(`<<PAD:${unit}:PAD>>`, unit.repeat(repeats));
  return { objective: template, expected };
}

/** A byte offset that lands strictly inside a multi-byte character. */
function continuationByteOffset(buffer, from) {
  for (let i = from; i < buffer.length; i++) {
    if ((buffer[i] & 0b1100_0000) === 0b1000_0000) return i;
  }
  throw new Error('fixture contains no multi-byte character to split');
}

test('B4: multi-byte UTF-8 spanning pipe chunks survives verbatim, with a matching sha256', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // 36 bytes per unit x 2400 -> ~86 KB, so the stream provably crosses the 64 KiB
    // chunk size regardless of how the OS happens to slice it.
    const { objective, expected } = paddedReply({
      unit: '需求理解与澄清并对齐目标',
      repeats: 2400,
      summary: '需求理解与澄清',
    });
    const expectedBuffer = Buffer.from(expected, 'utf8');
    assert.ok(expectedBuffer.length > 80 * 1024, `fixture is only ${expectedBuffer.length} bytes`);

    // Do not rely on the OS splitting inside a character: force it. The offset is a
    // continuation byte, so a per-chunk decoder must corrupt exactly there.
    const splitAt = continuationByteOffset(expectedBuffer, Math.floor(expectedBuffer.length / 2));

    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-utf8',
      reply: objective,
      stubEnv: { ACE_STUB_PAD_REPEATS: '2400', ACE_STUB_SPLIT_AT: String(splitAt) },
    });

    assert.equal(audit.launched, true);
    assert.equal(envelope.status, 'SUCCEEDED', `unexpected rejection: ${JSON.stringify(envelope)}`);
    assert.equal(envelope.summary, '需求理解与澄清');

    const stored = readFileSync(join(root, audit.raw_artifact));
    assert.doesNotMatch(stored.toString('utf8'), /�/, 'raw artifact contains replacement characters');
    assert.deepEqual(stored, expectedBuffer, 'raw artifact is not byte-identical to what the worker wrote');
    assert.equal(audit.raw_bytes, expectedBuffer.length);
    assert.equal(audit.raw_sha256, sha256Bytes(expectedBuffer));
    assert.equal(audit.raw_truncated, false);
  });
});

test('B4: a character split across chunks would otherwise break the JSON, not just the text', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // Small payload, split inside the summary's first character. Under per-chunk decoding
    // the corrupted bytes still parse as JSON, so the failure would be a silently wrong
    // summary reaching the main model -- worse than a rejection.
    const objective = cliEnvelope({
      status: 'SUCCEEDED',
      summary: '澄清目标与判据',
      claims: [],
      artifact_refs: [],
    });
    const expectedBuffer = Buffer.from(objective, 'utf8');
    const splitAt = continuationByteOffset(expectedBuffer, 0);

    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-utf8-small',
      reply: objective,
      stubEnv: { ACE_STUB_SPLIT_AT: String(splitAt) },
    });

    assert.equal(envelope.status, 'SUCCEEDED', `unexpected rejection: ${JSON.stringify(envelope)}`);
    assert.equal(envelope.summary, '澄清目标与判据');
    assert.equal(audit.raw_sha256, sha256Bytes(expectedBuffer));
    assert.deepEqual(readFileSync(join(root, audit.raw_artifact)), expectedBuffer);
  });
});

test('B4: capture stops at the byte cap, keeps what arrived, and refuses the result', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const cap = 64 * 1024;
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-flood',
      reply: 'ignored',
      maxRawBytes: cap,
      taskId: TASK_ID,
      stubEnv: { ACE_STUB_FILL_BYTES: String(4 * 1024 * 1024) },
    });

    // Silent truncation would be the dangerous outcome: a partial stream is not a reply.
    assertRejected(envelope, { dispatchId: 'd-pipe-flood', code: 'ARTIFACT_LIMIT_EXCEEDED' });
    assert.equal(envelope.reason, 'raw_output_over_limit');

    const stored = readFileSync(join(root, audit.raw_artifact));
    assert.equal(stored.length, cap, 'the cap must bound what is retained, exactly');
    assert.ok(audit.raw_truncated, 'truncation must be declared, not hidden');
    assert.ok(audit.raw_original_bytes > cap);
    assert.equal(audit.raw_sha256, sha256Bytes(stored));

    // A truncated artifact is still registered: it cannot prove completeness, but it
    // remains the diagnostic evidence for why the dispatch was refused.
    const index = readManifestIndex(root);
    assert.equal(index.get(`raw-d-pipe-flood`)?.truncated, true);
  });
});

test('B4: the default capture cap is the artifact hard limit, so the two cannot drift', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // 1 MiB is far under the 8 MiB default, so nothing is truncated -- which is only
    // meaningful because the previous test proves the cap does fire when crossed.
    const { audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-under-cap',
      reply: 'ignored',
      stubEnv: { ACE_STUB_FILL_BYTES: String(1024 * 1024) },
    });
    assert.equal(BUDGETS.ARTIFACT, 8 * 1024 * 1024);
    assert.equal(audit.raw_bytes, 1024 * 1024);
    assert.equal(audit.raw_truncated, false);
  });
});

// ---------------------------------------------------------- B5: schema + semantic + manifest

/**
 * Register a real evidence artifact under the task root and return its id.
 *
 * A claim must cite a registered artifact: `validateWorkerOutput` refuses an absent index
 * outright and checks `evidence_ref` against it, so a control case that cites an unregistered
 * id would be rejected for lack of evidence rather than accepted. Writing real bytes and
 * hashing them is what makes the acceptance mean "backed by evidence" instead of
 * "unverifiable but tolerated".
 */
function registerEvidence(taskRoot, artifactId) {
  const relative = `artifacts/evidence/${artifactId}.txt`;
  const absolute = join(taskRoot, relative);
  const bytes = Buffer.from(`evidence for ${artifactId}\n`, 'utf8');
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, bytes);
  registerManifest(
    taskRoot,
    {
      schema_version: 1,
      artifact_id: artifactId,
      task_id: TASK_ID,
      kind: 'evidence',
      path: relative,
      media_type: 'text/plain',
      bytes: bytes.length,
      sha256: sha256Bytes(bytes),
      producer: 'controller',
      truncated: false,
      original_bytes: bytes.length,
      retention: 'task',
      created_at: new Date().toISOString(),
    },
    artifactId,
  );
  return artifactId;
}

test('B5 control: a well-formed, in-authority result is accepted end to end', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // The evidence exists and is registered, so nothing but role authority and shape can
    // decide this case -- which is what makes it a control for the rejections below.
    const evidenceRef = registerEvidence(root, 'art-run-1');

    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-ok',
      taskId: TASK_ID,
      role: 'VERIFY',
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'gate holds',
        claims: [
          {
            kind: 'criterion_checked',
            subject_ref: 'crit-1',
            result: 'passed',
            evidence_ref: evidenceRef,
            achieved_rung: 'E3',
          },
        ],
        artifact_refs: [],
      }),
    });
    // Without this case every assertion below would also pass against a dispatcher that
    // rejects unconditionally.
    assert.equal(audit.launched, true);
    assert.equal(envelope.status, 'SUCCEEDED', `unexpected rejection: ${JSON.stringify(envelope)}`);
    assert.equal(envelope.summary, 'gate holds');
    assert.equal(audit.rejected_stage, null);
    assert.equal(audit.violations, null);
  });
});

test('B5 SEMANTIC: a DISCOVER worker declaring a criterion checked is refused, not accepted', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-role',
      taskId: TASK_ID,
      role: 'DISCOVER',
      // Byte-for-byte schema valid. Only role authority separates it from the control case
      // above, which is exactly what schema validation cannot see.
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'criterion satisfied',
        claims: [
          {
            kind: 'criterion_checked',
            subject_ref: 'crit-1',
            result: 'passed',
            evidence_ref: 'art-run-1',
            achieved_rung: 'E3',
          },
        ],
        artifact_refs: [],
      }),
    });

    assertRejected(envelope, { dispatchId: 'd-pipe-role' });
    assert.equal(envelope.reason, 'worker_output_semantic_invalid');
    assert.equal(audit.rejected_stage, 'semantic', 'schema must pass; only semantics may reject this');
    assert.ok(
      audit.violations.some((v) => v.invariant === 'role_claim_authority'),
      `expected a role_claim_authority violation, got ${JSON.stringify(audit.violations)}`,
    );
    // The claim must not reach the main agent's ledger in any form.
    assert.doesNotMatch(JSON.stringify(envelope), /criterion_checked|criterion satisfied/);
  });
});

test('B5 SEMANTIC: an undeclared role is entitled to no claims at all', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-norole',
      // role omitted: the default must be the least authority, not a convenient one.
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'found a fact',
        claims: [{ kind: 'fact_found', subject_ref: 'src-1', result: 'x', evidence_ref: 'art-1' }],
        artifact_refs: [],
      }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-norole' });
    assert.equal(audit.rejected_stage, 'semantic');
    assert.ok(audit.violations.some((v) => v.invariant === 'role_claim_authority'));
  });
});

test('B5 SEMANTIC: a result bound to another dispatch is refused', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-bind',
      role: 'DISCOVER',
      reply: cliEnvelope({
        schema_version: 1,
        dispatch_id: 'd-somewhere-else',
        status: 'SUCCEEDED',
        summary: 'result for a different dispatch',
        claims: [],
        artifact_refs: [],
      }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-bind' });
    assert.equal(audit.rejected_stage, 'semantic');
    assert.ok(audit.violations.some((v) => v.invariant === 'dispatch_binding'));
  });
});

test('B5 SEMANTIC: a claim with no evidence_ref is refused even from an authorised role', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-noevidence',
      role: 'DISCOVER',
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'asserted without evidence',
        claims: [{ kind: 'fact_found', subject_ref: 'src-1', result: 'trust me' }],
        artifact_refs: [],
      }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-noevidence' });
    assert.equal(audit.rejected_stage, 'semantic');
    assert.ok(audit.violations.some((v) => v.invariant === 'claim_evidence'));
  });
});

test('B5 SEMANTIC: a result computed under a superseded scope yields STALE_SCOPE, not a score', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-stale',
      taskId: TASK_ID,
      role: 'DISCOVER',
      dispatchScopeVersion: 1,
      currentScopeVersion: 2,
      reply: cliEnvelope({ status: 'SUCCEEDED', summary: 'ok under the old scope', claims: [], artifact_refs: [] }),
    });
    // dispatch.md §6/I12: keep the artifact, do not update the ledger -- a distinct code
    // from RESULT_REJECTED because the result is not malformed, only out of date.
    assertRejected(envelope, { dispatchId: 'd-pipe-stale', code: 'STALE_SCOPE' });
    assert.equal(envelope.reason, 'result_scope_stale');
    assert.equal(audit.rejected_stage, 'semantic');
    // The artifact is still registered, which is what "keep the artifact" means.
    assert.ok(readManifestIndex(root).has('raw-d-pipe-stale'));
  });
});

/*
 * The five cases below close the rest of `validateWorkerOutput`'s reachable surface.
 *
 * `validateWorkerOutput` emits nine invariants. Four were already driven end-to-end above
 * (`dispatch_binding`, `stale_scope`, `role_claim_authority`, `claim_evidence`); the other
 * five were only ever exercised by direct unit calls in `tests/kernel-semantics.test.mjs`,
 * which cannot tell whether the dispatcher passes the right context — the exact gap that
 * made B5 possible in the first place. Each is reachable here because the schema permits the
 * shape and the dispatcher supplies the context field the check reads:
 *
 *   claim_evidence_exists — schema accepts any well-formed id; only the index can refute it
 *   claim_rung            — `achieved_rung` is nullable in the schema, required by semantics
 *   artifact_resolves     — same as claim_evidence_exists, on `artifact_refs`
 *   error_present/absent  — `status` and `error` are independent schema properties
 */

test('B5 SEMANTIC: an evidence_ref that names no registered artifact is refused', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-ghostev',
      taskId: TASK_ID,
      role: 'DISCOVER',
      // A syntactically perfect id that was never registered. This is the check that makes
      // the index authoritative rather than decorative: only reading it can refute the ref.
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'cites evidence that does not exist',
        claims: [{ kind: 'fact_found', subject_ref: 'src-1', result: 'x', evidence_ref: 'art-neverwritten' }],
        artifact_refs: [],
      }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-ghostev' });
    assert.equal(audit.rejected_stage, 'semantic');
    assert.deepEqual(
      audit.violations.map((v) => v.invariant),
      ['claim_evidence_exists'],
      'the ref is present and well-formed, so only its non-existence may reject it',
    );
  });
});

test('B5 SEMANTIC: a criterion_checked claim without achieved_rung is refused', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // VERIFY may make this claim and the evidence is real, so authority and evidence are both
    // satisfied; the missing rung is the only defect left. `achieved_rung` is nullable in the
    // schema, which is why schema validation cannot catch this.
    const evidenceRef = registerEvidence(root, 'art-rung-1');
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-norung',
      taskId: TASK_ID,
      role: 'VERIFY',
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'checked, but will not say how well',
        claims: [{ kind: 'criterion_checked', subject_ref: 'crit-1', result: 'passed', evidence_ref: evidenceRef }],
        artifact_refs: [],
      }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-norung' });
    assert.equal(audit.rejected_stage, 'semantic');
    assert.deepEqual(audit.violations.map((v) => v.invariant), ['claim_rung']);
  });
});

test('B5 SEMANTIC: an artifact_ref outside the index is refused even with no claims', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // No claims at all, so every claim-side check is vacuously satisfied and `artifact_refs`
    // is the only thing that can reject this dispatch.
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-ghostref',
      taskId: TASK_ID,
      role: 'DISCOVER',
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'points at an unregistered artifact',
        claims: [],
        artifact_refs: ['art-notregistered'],
      }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-ghostref' });
    assert.equal(audit.rejected_stage, 'semantic');
    assert.deepEqual(audit.violations.map((v) => v.invariant), ['artifact_resolves']);
    // The raw artifact of THIS dispatch is registered, so the index is non-empty: the
    // rejection is about the named ref, not about an index nobody populated.
    assert.ok(readManifestIndex(root).has('raw-d-pipe-ghostref'));
  });
});

test('B5 SEMANTIC: FAILED without an error object is refused', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // A worker that reports failure while withholding the reason leaves the controller with
    // a status it cannot act on. `error` is nullable in the schema; only semantics pair them.
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-noerr',
      taskId: TASK_ID,
      role: 'DISCOVER',
      reply: cliEnvelope({ status: 'FAILED', summary: 'it broke', claims: [], artifact_refs: [] }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-noerr' });
    assert.equal(audit.rejected_stage, 'semantic');
    assert.deepEqual(audit.violations.map((v) => v.invariant), ['error_present']);
  });
});

test('B5 SEMANTIC: SUCCEEDED carrying an error object is refused', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // The mirror case, and the reason both directions are needed: a validator that only
    // checked FAILED-needs-error would let a self-contradicting success through.
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-botherr',
      taskId: TASK_ID,
      role: 'DISCOVER',
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'succeeded, allegedly',
        claims: [],
        artifact_refs: [],
        error: { code: 'E_SOMETHING', message: 'but also failed' },
      }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-botherr' });
    assert.equal(audit.rejected_stage, 'semantic');
    assert.deepEqual(audit.violations.map((v) => v.invariant), ['error_absent']);
  });
});

test('B5 SEMANTIC control: a FAILED result WITH an error object is accepted', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // Control for the pair above: without it, both would pass against a validator that
    // rejects every FAILED result, or every result carrying an `error` at all.
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-okerr',
      taskId: TASK_ID,
      role: 'DISCOVER',
      reply: cliEnvelope({
        status: 'FAILED',
        summary: 'could not reach the endpoint',
        claims: [],
        artifact_refs: [],
        error: { code: 'E_NET', message: 'connection refused' },
      }),
    });
    assert.equal(audit.rejected_stage, null, `unexpected rejection: ${JSON.stringify(audit.violations)}`);
    assert.equal(envelope.status, 'FAILED');
    assert.equal(envelope.code, undefined, 'a legitimately FAILED worker result is not a dispatch rejection');
  });
});

test('B5 SCHEMA: a summary past its 400-byte ceiling is refused by schema, not clamped', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-fatsummary',
      // 200 Chinese characters = 600 UTF-8 bytes: within maxLength, past maxBytes. Only a
      // byte-aware schema check catches it, and clamping it would fabricate a shorter fact.
      reply: cliEnvelope({ status: 'SUCCEEDED', summary: '需'.repeat(200), claims: [], artifact_refs: [] }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-fatsummary' });
    assert.equal(envelope.reason, 'worker_output_schema_invalid');
    assert.equal(audit.rejected_stage, 'schema');
    assert.ok(audit.violations.some((v) => v.rule === 'maxBytes'));
  });
});

test('B5 SCHEMA: unknown properties and bad claim shapes are refused', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const smuggled = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-extra',
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'ok',
        claims: [],
        artifact_refs: [],
        raw_output: 'the whole transcript, smuggled past the envelope',
      }),
    });
    assertRejected(smuggled.envelope, { dispatchId: 'd-pipe-extra' });
    assert.equal(smuggled.audit.rejected_stage, 'schema');
    assert.ok(smuggled.audit.violations.some((v) => v.rule === 'additionalProperties'));
    assert.doesNotMatch(JSON.stringify(smuggled.envelope), /smuggled/);

    const badClaim = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-badclaim',
      role: 'VERIFY',
      reply: cliEnvelope({
        status: 'SUCCEEDED',
        summary: 'ok',
        claims: [{ kind: 'invented_kind', subject_ref: 'x-1', result: 'y' }],
        artifact_refs: [],
      }),
    });
    assertRejected(badClaim.envelope, { dispatchId: 'd-pipe-badclaim' });
    assert.equal(badClaim.audit.rejected_stage, 'schema');
  });
});

test('B5 SCHEMA: the status enum is enforced by the schema, not by an ad-hoc allowlist', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-status',
      reply: cliEnvelope({ status: 'MAYBE', summary: 'plausible but invalid', claims: [], artifact_refs: [] }),
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-status' });
    assert.equal(envelope.reason, 'invalid_status_enum');
    assert.equal(audit.rejected_stage, 'schema', 'the enum must be a schema rule now');
    assert.ok(audit.violations.some((v) => v.path === 'status' && v.rule === 'enum'));
  });
});

test('B5 MANIFEST: the raw artifact is registered before parsing, so rejections stay traceable', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-manifest',
      taskId: TASK_ID,
      role: 'DISCOVER',
      // Rejected at the very first parse step -- the manifest must already exist by then.
      reply: 'BANANA, not JSON at all',
    });
    assertRejected(envelope, { dispatchId: 'd-pipe-manifest' });
    assert.equal(envelope.reason, 'cli_output_unparseable');

    assert.ok(audit.manifest, 'a rejected dispatch must still have a registered manifest');
    const manifest = JSON.parse(readFileSync(join(root, audit.manifest), 'utf8'));
    assert.equal(manifest.task_id, TASK_ID);
    assert.equal(manifest.dispatch_id, 'd-pipe-manifest');
    assert.equal(manifest.kind, 'raw_output');
    assert.equal(manifest.producer, 'worker:DISCOVER');
    assert.equal(manifest.sha256, audit.raw_sha256);
    assert.equal(manifest.bytes, audit.raw_bytes);
    assert.equal(manifest.path, audit.raw_artifact);

    const index = readManifestIndex(root);
    assert.deepEqual([...index.keys()], ['raw-d-pipe-manifest']);
    // The registered digest must match the bytes on disk, which is the property the whole
    // manifest step exists to make checkable.
    assert.deepEqual(verifyArtifactIntegrity(root), { valid: ['raw-d-pipe-manifest'], invalid: [] });
  });
});

test('B5 MANIFEST: without a task_id the step is skipped explicitly, not silently', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // Backward compatibility: existing callers pass no taskId. An unattributable index row
    // would be worse than none, so the skip is recorded in the audit instead.
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-notask',
      reply: cliEnvelope({ status: 'SUCCEEDED', summary: 'ok', claims: [], artifact_refs: [] }),
    });
    assert.equal(envelope.status, 'SUCCEEDED');
    assert.equal(audit.manifest, null);
    assert.equal(audit.manifest_skipped, 'no_task_id');
    assert.equal(readManifestIndex(root).size, 0);
    assert.ok(existsSync(join(root, audit.raw_artifact)), 'the raw artifact is written regardless');
  });
});

/**
 * A reply that nothing but the manifest step can reject.
 *
 * The whole point of the cases below is attribution: if the reply could also fail schema or
 * semantics, a `rejected_stage === 'manifest'` assertion would pass for the wrong reason.
 */
const REGISTRABLE_REPLY = () => cliEnvelope({
  status: 'SUCCEEDED', summary: 'nothing here can fail validation', claims: [], artifact_refs: [],
});

/**
 * Make `registerManifest` fail using only the filesystem — no product code, no injected error.
 *
 * `mode` picks which of its two writes breaks, because they fail at different points and only
 * the second one leaves a half-registered manifest behind:
 *   'manifest-file' — the manifest's own path is a directory, so `renameSync` in
 *                     `writeFileAtomic` cannot land it (EPERM on Windows, EISDIR on POSIX).
 *   'index'         — `manifests/index.jsonl` is a directory, so the manifest file lands but
 *                     `appendIndexEntry` fails reading it back (EISDIR).
 */
function breakManifestWrite(taskRoot, dispatchId, mode) {
  const target = mode === 'index'
    ? join(taskRoot, 'manifests', 'index.jsonl')
    : join(taskRoot, 'manifests', `manifest-${dispatchId}.json`);
  mkdirSync(target, { recursive: true });
  return target;
}

test('B5 MANIFEST control: the same reply registers and succeeds when nothing is in the way', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // Without this, both rejection cases below would also pass against a dispatcher that
    // rejects every dispatch at the manifest stage.
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-regok',
      taskId: TASK_ID,
      role: 'DISCOVER',
      reply: REGISTRABLE_REPLY(),
    });
    assert.equal(envelope.status, 'SUCCEEDED', `unexpected rejection: ${JSON.stringify(envelope)}`);
    assert.equal(audit.rejected_stage, null);
    assert.equal(audit.manifest, 'manifests/manifest-d-pipe-regok.json');
    assert.deepEqual([...readManifestIndex(root).keys()], ['raw-d-pipe-regok']);
  });
});

test('B5 MANIFEST: a failed registration rejects the dispatch instead of proceeding unregistered', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    breakManifestWrite(root, 'd-pipe-regfail', 'manifest-file');

    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-regfail',
      taskId: TASK_ID,
      role: 'DISCOVER',
      reply: REGISTRABLE_REPLY(),
    });

    // The reply itself is impeccable -- the control above proves it succeeds. So this
    // rejection is attributable to the registration failure and nothing else.
    assertRejected(envelope, { dispatchId: 'd-pipe-regfail' });
    assert.equal(envelope.reason, 'manifest_registration_failed');
    assert.equal(audit.rejected_stage, 'manifest');
    assert.equal(audit.manifest, null, 'a manifest that failed to register must not be reported as one');
    assert.deepEqual(audit.violations?.map((v) => v.invariant), ['manifest_registers']);
    assert.match(audit.violations[0].message, /manifest/, 'the audit must name what could not be written');

    // Evidence outlives the failure: the raw bytes are on disk and hash to what the audit
    // claims, so the dispatch stays diagnosable even though no manifest vouches for it.
    assert.ok(existsSync(join(root, envelope.artifact_pointer)));
    assert.equal(audit.raw_sha256, sha256Bytes(readFileSync(join(root, envelope.artifact_pointer))));

    // And the failure did not leave a usable-looking index row behind.
    assert.equal(readManifestIndex(root).size, 0);
  });
});

test('B5 MANIFEST: a manifest written but not indexed still counts as a failed registration', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // The index append is the second write inside `registerManifest`. If only the manifest
    // write were guarded, this dispatch would proceed with an artifact that no index can
    // resolve -- which is precisely the state `artifact_resolves` later trusts the index about.
    breakManifestWrite(root, 'd-pipe-regsplit', 'index');

    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-regsplit',
      taskId: TASK_ID,
      role: 'DISCOVER',
      reply: REGISTRABLE_REPLY(),
    });

    assertRejected(envelope, { dispatchId: 'd-pipe-regsplit' });
    assert.equal(envelope.reason, 'manifest_registration_failed');
    assert.equal(audit.rejected_stage, 'manifest');
    // The file landed on disk, yet the audit must not claim a registration that no index
    // backs: `audit.manifest` is assigned only after `registerManifest` returns.
    assert.ok(existsSync(join(root, 'manifests', 'manifest-d-pipe-regsplit.json')));
    assert.equal(audit.manifest, null);
  });
});

test('B5: the pipeline order holds -- the artifact exists even when nothing validates', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    const { envelope, audit } = await dispatchAgainstStub({
      taskRoot: root,
      dispatchId: 'd-pipe-order',
      taskId: TASK_ID,
      role: 'DISCOVER',
      reply: cliEnvelope({ status: 'SUCCEEDED', summary: '需'.repeat(200), claims: [], artifact_refs: [] }),
    });
    // Rejected at SCHEMA, yet RAW WRITE and HASH+MANIFEST already happened -- that is the
    // ordering guarantee, stated as three facts about one rejected dispatch.
    //
    // The stage assertion carries the capture readings for the same reason as the cap test in
    // dispatch-stream-completeness: this reds about 1 run in 24 full-suite (n=71 for 95%
    // detection), and the captured failure said only `'parse' !== 'schema'`. That is the least
    // informative form of a real distinction: rejection at `parse` means the raw bytes were not
    // valid JSON, which on a stub that emits a fixed valid reply means the bytes were SHORT --
    // a capture or loader problem upstream of the ordering property under test. Naming that
    // difference costs one template string; re-deriving it costs 71 rounds.
    const readings = `[stage=${audit.rejected_stage} raw_bytes=${audit.raw_bytes} exit_code=${audit.exit_code} `
      + `timed_out=${audit.timed_out} spawn_error=${JSON.stringify(audit.spawn_error ?? null)} `
      + `envelope=${envelope.status}/${envelope.code}/${envelope.reason}]`;
    assert.equal(
      audit.rejected_stage,
      'schema',
      'the ordering property needs a SCHEMA rejection. A `parse` rejection means the raw bytes did '
      + 'not parse at all, so the stub reply arrived short or not at all -- that is a capture/'
      + `environment failure upstream of this test's subject, not a pipeline-order defect. ${readings}`,
    );
    assert.ok(existsSync(join(root, envelope.artifact_pointer)), `raw artifact must exist ${readings}`);
    assert.ok(audit.manifest && existsSync(join(root, audit.manifest)), `manifest must exist ${readings}`);
    assert.equal(
      audit.raw_sha256,
      sha256Bytes(readFileSync(join(root, envelope.artifact_pointer))),
      `the recorded hash must describe the bytes on disk ${readings}`,
    );
  });
});

// ------------------------------------------------- §2: the input envelope is a real object

/**
 * Before this group, `dispatch.md` §2 declared an "input envelope JSON / 2 KiB /
 * DISPATCH_REJECTED" that the dispatcher never built: `objective` went to stdin as a bare
 * string. `BUDGETS.WORKER_INPUT_ENVELOPE` therefore had nothing to measure — it was not a
 * missing gate but a missing object, which is why a byte gate alone would not have fixed it.
 *
 * The tests below assert the object exists, that both of its gates fire, and that the two
 * budgets no longer leave a gap between them.
 */

test('§2: the worker receives the envelope, not a bare objective', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // The stub echoes its stdin when told to reply from it, so what the worker was handed is
    // observable rather than inferred.
    const echoDir = mkdtempSync(join(tmpdir(), 'ace-pipeline-echo-'));
    replyFiles.push(echoDir);

    const { audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-env-echo',
      taskId: TASK_ID,
      role: 'VERIFY',
      objective: 'Confirm the destination row exists.',
      env: { PATH: '', ACE_CLAUDE_BIN: stubBin },
    });

    // stdin is echoed straight back, so the raw artifact IS the envelope the worker ingested.
    const ingested = JSON.parse(readFileSync(join(root, audit.raw_artifact), 'utf8'));
    assert.equal(ingested.dispatch_id, 'd-env-echo');
    assert.equal(ingested.task_id, TASK_ID);
    assert.equal(ingested.role, 'VERIFY', 'the worker must be told the role it is judged against');
    assert.equal(ingested.objective, 'Confirm the destination row exists.');
    assert.equal(ingested.write_root, 'work/d-env-echo/');
    assert.equal(ingested.expected_output.max_envelope_bytes, BUDGETS.WORKER_OUTPUT_ENVELOPE);
    assert.equal(validateSchema(ingested, getSchema(SCHEMA_IDS.WORKER_INPUT)).valid, true);

    // The gate measures the bytes that were actually written, not an estimate of them.
    assert.equal(audit.input_bytes, Buffer.byteLength(canonicalize(ingested), 'utf8'));
    assert.equal(audit.input_limit, BUDGETS.WORKER_INPUT_ENVELOPE);
  });
});

test('§2: an objective past the schema ceiling is refused before any spawn', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // 1900 bytes: the exact leak the audit measured. It passes the 16 KiB launch total, so
    // before the envelope existed it reached the worker despite the 400-byte objective cap.
    const oversized = 'x'.repeat(1900);
    assert.ok(oversized.length < 16 * 1024, 'precondition: this payload clears the launch total');

    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-env-longobj',
      taskId: TASK_ID,
      role: 'DISCOVER',
      objective: oversized,
      env: { PATH: '', ACE_CLAUDE_BIN: stubBin },
    });

    assert.equal(envelope.code, 'DISPATCH_REJECTED');
    assert.equal(envelope.reason, 'worker_input_schema_invalid');
    assert.equal(audit.launched, false, 'I11: a rejected dispatch must never start a worker');
    assert.equal(audit.rejected_stage, 'input_schema');
    assert.ok(
      audit.input_violations.some((v) => v.path === 'objective' && v.rule === 'maxBytes'),
      `expected an objective maxBytes violation, got ${JSON.stringify(audit.input_violations)}`,
    );
    assert.ok(!('summary' in envelope));
    // Nothing launched, so nothing was captured and no artifact exists to point at.
    assert.equal(audit.raw_artifact, undefined);
  });
});

/**
 * An envelope payload whose every field is individually schema-legal — the objective sits
 * exactly on its 400-byte cap, every constraint and scope entry is a plain short string —
 * while the assembled canonical form is past the 2 KiB envelope ceiling.
 *
 * Shared by the byte-gate test and the gate-independence test below so the two cannot drift
 * into disagreeing about what the construction is.
 */
function fieldLegalButFatPayload() {
  return {
    objective: 'y'.repeat(400),
    constraints: Array.from({ length: 16 }, (_, i) => `${i}:${'c'.repeat(120)}`),
    scope: {
      include: Array.from({ length: 16 }, (_, i) => `${i}:${'i'.repeat(100)}`),
      exclude: Array.from({ length: 16 }, (_, i) => `${i}:${'e'.repeat(100)}`),
    },
  };
}

test('§2: an envelope past 2 KiB is refused before any spawn', STUB_OPTIONS, async () => {
  await withTaskRoot(async (root) => {
    // Every field is individually schema-legal; only the assembled total breaks the ceiling.
    // That is the case the schema alone cannot catch, which is why the byte gate is separate.
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-env-fat',
      taskId: TASK_ID,
      role: 'DISCOVER',
      ...fieldLegalButFatPayload(),
      env: { PATH: '', ACE_CLAUDE_BIN: stubBin },
    });

    assert.equal(envelope.code, 'DISPATCH_REJECTED');
    assert.equal(envelope.reason, 'worker_input_over_budget');
    assert.equal(audit.launched, false);
    assert.equal(audit.rejected_stage, 'input_budget');
    assert.ok(envelope.bytes > BUDGETS.WORKER_INPUT_ENVELOPE);
    assert.equal(envelope.limit, BUDGETS.WORKER_INPUT_ENVELOPE);
  });
});

test('§2: the envelope gate is measured on canonical bytes, at and past the limit', STUB_OPTIONS, () => {
  // Driven through the real builder rather than by pinning a literal, so the assertion tracks
  // the budget instead of restating it.
  const build = (constraint) =>
    buildWorkerInput({
      dispatchId: 'd-env-edge',
      taskId: TASK_ID,
      role: 'DISCOVER',
      objective: 'edge',
      constraints: constraint === null ? undefined : [constraint],
    });

  // Derive the per-character overhead by measurement instead of by counting quotes and
  // commas: an arithmetic guess here would silently aim at the wrong byte.
  const oneChar = measureWorkerInput(build('z')).bytes;
  const twoChar = measureWorkerInput(build('zz')).bytes;
  assert.equal(twoChar - oneChar, 1, 'one ASCII character must cost exactly one canonical byte');

  const fillFor = (target) => 'z'.repeat(target - oneChar + 1);
  const atLimit = build(fillFor(BUDGETS.WORKER_INPUT_ENVELOPE));
  assert.equal(measureWorkerInput(atLimit).bytes, BUDGETS.WORKER_INPUT_ENVELOPE);

  const overLimit = build(fillFor(BUDGETS.WORKER_INPUT_ENVELOPE + 1));
  assert.equal(measureWorkerInput(overLimit).bytes, BUDGETS.WORKER_INPUT_ENVELOPE + 1);
});

test('§2: an undeclared role travels as an explicit null, never as an omission', STUB_OPTIONS, () => {
  // `role: null` must be representable: it is what ROLE_CLAIM_PERMISSIONS treats as zero
  // authority. If the schema forced a concrete role, every caller that declared none would
  // have to invent one, and inventing one grants claim authority the caller never asked for.
  const bare = buildWorkerInput({ dispatchId: 'd-env-norole', taskId: null, role: null, objective: 'x' });
  assert.equal(bare.role, null);
  assert.equal(bare.task_id, null);
  assert.equal(validateSchema(bare, getSchema(SCHEMA_IDS.WORKER_INPUT)).valid, true);

  // A role outside the enum is still refused: nullable widens the type, not the vocabulary.
  const bogus = buildWorkerInput({ dispatchId: 'd-env-bogus', taskId: null, role: 'ADMIN', objective: 'x' });
  assert.equal(validateSchema(bogus, getSchema(SCHEMA_IDS.WORKER_INPUT)).valid, false);
});

/**
 * Run one envelope past all three input gates and report each verdict independently.
 *
 * `dispatchWorker` cannot answer this question. Its gates are sequential and it returns at
 * the first objection, so "the other two gates would have passed" is unobservable through
 * it — the three tests above each see exactly one verdict and nothing about the other two.
 * Calling the gates directly, in the product's own order and with the product's own system
 * prompt, is the only way an assertion can watch all three at once.
 */
function gateVerdicts(args) {
  const envelope = buildWorkerInput(args);
  const { serialized, bytes } = measureWorkerInput(envelope);
  const breakdown = injectedBytes({
    systemPrompt: WORKER_SYSTEM_PROMPT,
    userPrompt: serialized,
    jsonSchema: '',
  });
  const launch = checkLaunchBudget(breakdown);
  const shape = validateSchema(envelope, getSchema(SCHEMA_IDS.WORKER_INPUT));
  return {
    launchOk: launch.ok,
    launchBytes: breakdown.total,
    schemaOk: shape.valid,
    violations: shape.violations ?? [],
    envelopeOk: bytes <= BUDGETS.WORKER_INPUT_ENVELOPE,
    envelopeBytes: bytes,
  };
}

/**
 * The three gates are pairwise non-implying: no one of them can stand in for another.
 *
 * Why this needs its own test rather than resting on the three rejection tests above. Each
 * of those asserts that ONE gate objects, which is equally consistent with all three
 * objecting — and if all three objected to everything, any two could be deleted with every
 * test still green. Independence is the property that makes three gates three gates, and it
 * is exactly the property a single-verdict assertion cannot express.
 *
 * The construction of each row is load-bearing, not illustrative:
 *
 *  [A] proves the 2 KiB ceiling is not a corollary of the 16 KiB one. Every field is legal
 *      and the total is still ~10 KiB under the launch budget when the envelope gate fires:
 *      "sum of all serialized fields" is not a constraint the schema can even state.
 *
 *  [C] proves the schema is not a corollary of either byte gate. 401 bytes is one past the
 *      objective's cap and the whole envelope is well under 2 KiB, so neither byte gate can
 *      see it. It must be 401 and not the 1900 of the test above: 1900 pushes the envelope
 *      to 2189 bytes, so the 2 KiB gate objects too and the row proves nothing about the
 *      schema's own necessity.
 *
 *  [D] is the strongest form of the same point. `role: "ADMIN"` is a semantic overreach at
 *      315 bytes total; no byte gate at any threshold can ever detect it.
 */
test('§2: the three input gates are pairwise non-implying, each row objected to by exactly one', STUB_OPTIONS, () => {
  const common = { dispatchId: 'd-env-indep', taskId: TASK_ID };

  const rows = [
    {
      label: '[A] every field legal, assembled total over 2 KiB',
      args: { ...common, role: 'DISCOVER', ...fieldLegalButFatPayload() },
      objector: 'envelope',
    },
    {
      label: '[C] objective one byte past its 400-byte field cap',
      args: { ...common, role: 'DISCOVER', objective: 'x'.repeat(401) },
      objector: 'schema',
      expectViolation: { path: 'objective', rule: 'maxBytes' },
    },
    {
      label: '[D] role outside the enum: semantic, not volumetric',
      args: { ...common, role: 'ADMIN', objective: 'x' },
      objector: 'schema',
      expectViolation: { path: 'role', rule: 'enum' },
    },
  ];

  for (const { label, args, objector, expectViolation } of rows) {
    const v = gateVerdicts(args);
    const verdicts = { launch: v.launchOk, schema: v.schemaOk, envelope: v.envelopeOk };

    for (const [gate, ok] of Object.entries(verdicts)) {
      assert.equal(
        ok,
        gate !== objector,
        `${label}: expected only the ${objector} gate to object, but ${gate} returned ` +
          `${ok ? 'PASS' : 'REJECT'} (launch ${v.launchBytes} B, envelope ${v.envelopeBytes} B, ` +
          `violations ${JSON.stringify(v.violations)})`,
      );
    }

    if (expectViolation) {
      assert.ok(
        v.violations.some((x) => x.path === expectViolation.path && x.rule === expectViolation.rule),
        `${label}: expected a ${expectViolation.path}:${expectViolation.rule} violation, got ${JSON.stringify(v.violations)}`,
      );
    }
  }

  // [A]'s headroom is the quantitative core of its claim: a row rejected at 2049 bytes would
  // be consistent with the 2 KiB gate being a mere tightening of the 16 KiB one. Being this
  // far under the coarse budget while the fine one fires is what rules that reading out.
  const fat = gateVerdicts({ ...common, role: 'DISCOVER', ...fieldLegalButFatPayload() });
  assert.ok(
    BUDGETS.WORKER_LAUNCH_TOTAL - fat.launchBytes > 4096,
    `[A] must clear the launch budget with room to spare, not squeeze under it ` +
      `(${fat.launchBytes} of ${BUDGETS.WORKER_LAUNCH_TOTAL} B used)`,
  );
});

