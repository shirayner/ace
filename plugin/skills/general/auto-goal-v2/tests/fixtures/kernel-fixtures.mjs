/**
 * Test fixtures for the kernel tests.
 *
 * Builders exist so a test states only what it is about: a test for the evidence
 * ladder should not have to spell out a whole valid manifest. Every builder
 * returns a payload that passes schema and semantic validation unless the test
 * overrides a field to make it fail.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { GENESIS_HASH, sealEvent, sha256Bytes } from '../../lib/canonical.mjs';
import { initTaskRoot } from '../../lib/journal.mjs';
import { artifactObjectPath } from '../../lib/paths.mjs';

export const TASK_ID = 'goal-fixture01';
export const FIXED_TIME = '2026-08-13T00:00:00.000Z';

/** Temporary task root with the journal tree created. Caller must dispose. */
export function makeTaskRoot(prefix = 'agv2-kernel-') {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  initTaskRoot(root);
  return {
    root,
    dispose() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Write a file under the task root and return its manifest-ready facts. */
export function writeArtifactFile(taskRoot, content, extension = '.txt') {
  const buffer = Buffer.from(content, 'utf8');
  const sha256 = sha256Bytes(buffer);
  const relativePath = artifactObjectPath(sha256, extension);
  const absolutePath = path.join(taskRoot, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, buffer);
  return { path: relativePath, sha256, bytes: buffer.length, absolutePath };
}

/** Manifest for an artifact already on disk. */
export function makeManifest(taskRoot, content, overrides = {}) {
  const file = writeArtifactFile(taskRoot, content);
  return {
    schema_version: 1,
    artifact_id: 'a-fixture01',
    task_id: TASK_ID,
    dispatch_id: 'd-fixture01',
    kind: 'evidence',
    path: file.path,
    media_type: 'text/plain',
    bytes: file.bytes,
    sha256: file.sha256,
    created_at: FIXED_TIME,
    producer: 'proxy',
    truncated: false,
    original_bytes: file.bytes,
    retention: 'task',
    evidence_for: [],
    redaction: { applied: false, policy: null },
    ...overrides,
  };
}

/** Journal event draft — appendEvent supplies seq, segment, hashes and id. */
export function eventDraft(type, overrides = {}) {
  return {
    task_id: TASK_ID,
    type,
    actor: 'controller',
    scope_version: 1,
    payload: {},
    artifact_refs: [],
    ...overrides,
  };
}

/**
 * Sealed event stream built directly from drafts, bypassing `appendEvent`.
 *
 * For tests of a read-path defense whose premise the write path now refuses to
 * create — a journal naming an unregistered artifact, say. Such a journal can
 * still arrive by tampering or by a future writer's defect, so the reducer must
 * hold on its own; forging the stream is the only way to hand it one.
 *
 * Never use this to set up a test that `appendEvent` could have set up. The
 * append path is where the invariants are enforced, and a fixture that walks
 * around it proves nothing about what reaches disk in production.
 */
export function sealChain(drafts) {
  let previousHash = GENESIS_HASH;
  let seq = 0;
  return drafts.map((draft) => {
    seq += 1;
    const event = sealEvent(
      {
        schema_version: 1,
        event_id: `01J8ZQ9TESTEVENT${String(seq).padStart(10, '0')}`,
        segment: 1,
        seq,
        occurred_at: FIXED_TIME,
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        ...draft,
      },
      previousHash,
    );
    previousHash = event.event_hash;
    return event;
  });
}

/** GOAL_CREATED followed by GOAL_ALIGNED — the minimal aligned task. */
export function alignedTaskDrafts({ goalSummary = 'Operations no longer key in 20k rows daily', constraints = [] } = {}) {
  return [
    eventDraft('GOAL_CREATED', {
      payload: { goal_id: 'g-fixture01', goal_summary: goalSummary, constraints },
    }),
    eventDraft('GOAL_ALIGNED', {
      actor: 'user',
      payload: { approved_by: 'decider:alice', scope_version: 1, residual: [] },
    }),
  ];
}

/** CRITERION_DEFINED payload with rungs consistent by default. */
export function criterionDraft(criterionId, type, overrides = {}) {
  const defaults = {
    STATE: { required_rung: 'E2', max_rung: 'E4' },
    BEHAVIOR: { required_rung: 'E3', max_rung: 'E3' },
    ARTIFACT_PROPERTY: { required_rung: 'E3', max_rung: 'E4' },
    JUDGMENT: { required_rung: 'E4', max_rung: 'E4' },
    EFFECT: { required_rung: 'E5', max_rung: 'E5' },
    KNOWLEDGE: { required_rung: 'E4', max_rung: 'E4' },
    NEGATIVE: { required_rung: 'E3', max_rung: 'E3' },
  }[type];

  return eventDraft('CRITERION_DEFINED', {
    payload: {
      criterion_id: criterionId,
      type,
      statement: `fixture criterion ${criterionId}`,
      ...defaults,
      ...overrides,
    },
  });
}

/** Ledger entry, bypassing the journal — for reducer and outcome unit tests. */
export function ledgerEntry(criterionId, overrides = {}) {
  return {
    criterion_id: criterionId,
    scope_version: 1,
    type: 'STATE',
    statement: `fixture ${criterionId}`,
    required_rung: 'E2',
    max_rung: 'E4',
    achieved_rung: 'E2',
    state: 'SATISFIED',
    evidence_refs: ['a-fixture01'],
    check_surface: [],
    checked_at: FIXED_TIME,
    acceptor_ref: null,
    risk: null,
    in_scope: true,
    ...overrides,
  };
}

/** Ledger shaped like buildLedger's output, from plain entries. */
export function makeLedger(entries, scopeVersion = 1) {
  return {
    entries: new Map(entries.map((entry) => [entry.criterion_id, entry])),
    scopeVersion,
  };
}

/** Artifact index shaped like the reducer's, from manifest-ish rows. */
export function makeArtifactIndex(rows) {
  return new Map(
    rows.map((row) => [
      row.artifact_id,
      { truncated: false, kind: 'evidence', sha256: 'f'.repeat(64), ...row },
    ]),
  );
}

/** Worker output envelope, valid by default. */
export function workerOutput(overrides = {}) {
  return {
    schema_version: 1,
    dispatch_id: 'd-fixture01',
    status: 'SUCCEEDED',
    summary: 'Checked 3 of 3 target rows; all present.',
    claims: [
      {
        kind: 'criterion_checked',
        subject_ref: 'c-001',
        result: 'satisfied',
        evidence_ref: 'a-fixture01',
        achieved_rung: 'E3',
      },
    ],
    artifact_refs: ['a-fixture01'],
    suggested_next_action: null,
    error: null,
    ...overrides,
  };
}

/** Worker input envelope, valid by default. */
export function workerInput(overrides = {}) {
  return {
    schema_version: 1,
    dispatch_id: 'd-fixture01',
    task_id: TASK_ID,
    role: 'VERIFY',
    objective: 'Confirm all 3 target rows exist in the destination table.',
    scope: { include: ['table:orders'], exclude: [] },
    constraints: ['read-only'],
    inputs: [],
    expected_output: { schema: 'schemas/worker-output.schema.json', max_envelope_bytes: 1024 },
    write_root: 'work/d-fixture01/',
    deadline: null,
    ...overrides,
  };
}

/** Interruption payload, valid by default. */
export function interruption(overrides = {}) {
  return {
    schema_version: 1,
    kind: 'NEEDS_INPUT',
    code: 'APPROVAL_REQUIRED',
    question: 'Approve renaming the 11 enumerated files under /reports?',
    why_blocking: 'Bulk rename is externally visible and cannot be undone per-file.',
    options: [
      { id: 'approve', label: 'Rename all 11', tradeoff: 'Irreversible without a manual restore.' },
      { id: 'reject', label: 'Stop and hand off', tradeoff: 'Goal ends PARTIAL with a handoff.' },
    ],
    recommended_option: 'approve',
    required_from: 'decider',
    resume_token: 'rt-fixture01',
    default_if_no_response: 'NO_ACTION',
    expires_at: null,
    ...overrides,
  };
}
