/**
 * Schema tests: the validator subset, the registry's $ref inlining, each control
 * plane document, and the enum-sync guard between JSON schemas and the vocabulary.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { assertSchema, validateSchema } from '../lib/schema-validator.mjs';
import { SchemaValidationError } from '../lib/errors.mjs';
import {
  SCHEMA_IDS,
  getRawSchemaDocument,
  getSchema,
  listSchemas,
} from '../schemas/registry.mjs';
import {
  ARTIFACT_KINDS,
  CLAIM_KINDS,
  CRITERION_STATES,
  CRITERION_TYPES,
  EVENT_TYPES,
  EVIDENCE_RUNGS,
  INTERRUPTION_CODES,
  NEXT_ACTION_KINDS,
  PHASES,
  RETENTION_CLASSES,
  RISK_DIMENSIONS,
  STEP_STATUSES,
  TERMINAL_OUTCOMES,
  WORKER_ROLES,
  WORKER_STATUSES,
  BLOCKED_REASONS,
} from '../lib/vocabulary.mjs';
import {
  interruption,
  makeManifest,
  makeTaskRoot,
  workerInput,
  workerOutput,
  TASK_ID,
  FIXED_TIME,
} from './fixtures/kernel-fixtures.mjs';

test('registry exposes exactly the eight control plane schemas', () => {
  assert.deepEqual(listSchemas(), [
    'artifact-manifest.schema.json',
    'checkpoint.schema.json',
    'criterion.schema.json',
    'goal.schema.json',
    'interruption.schema.json',
    'journal-event.schema.json',
    'worker-input.schema.json',
    'worker-output.schema.json',
  ]);
});

test('registry inlines $refs so the validator never resolves references', () => {
  const cursor = getSchema(SCHEMA_IDS.CHECKPOINT).properties.source_cursor;
  assert.equal(cursor.$ref, undefined);
  assert.deepEqual(cursor.required, ['segment', 'seq', 'event_hash']);
  assert.equal(cursor.properties.event_hash.pattern, '^sha256:[0-9a-f]{64}$');
});

test('a sibling keyword beside $ref overrides the shared fragment', () => {
  // latest_manifest is a relativePath that is additionally nullable.
  const field = getSchema(SCHEMA_IDS.CHECKPOINT).properties.latest_manifest;
  assert.equal(field.nullable, true);
  assert.ok(field.pattern);
  assert.equal(validateSchema(null, field).valid, true);
});

test('getSchema rejects an unknown name instead of returning undefined', () => {
  assert.throws(() => getSchema('nope.schema.json'), /Unknown schema/);
});

test('validator rejects an unsupported keyword rather than ignoring it', () => {
  assert.throws(
    () => validateSchema({}, { $id: 'x', type: 'object', oneOf: [] }),
    /unsupported keyword "oneOf"/,
  );
});

test('validator reports every violation, not just the first', () => {
  const schema = {
    $id: 'multi',
    type: 'object',
    required: ['a', 'b'],
    properties: { c: { type: 'integer' } },
    additionalProperties: false,
  };
  const { valid, violations } = validateSchema({ c: 'text', d: 1 }, schema);
  assert.equal(valid, false);
  const rules = violations.map((entry) => entry.rule).sort();
  assert.deepEqual(rules, ['additionalProperties', 'required', 'required', 'type']);
});

test('maxBytes gates UTF-8 bytes while maxLength gates code units', () => {
  const schema = { $id: 'bytes', type: 'string', maxBytes: 6 };
  assert.equal(validateSchema('目标', schema).valid, true); // 6 bytes
  assert.equal(validateSchema('目标标', schema).valid, false); // 9 bytes
  const lengthSchema = { $id: 'len', type: 'string', maxLength: 2 };
  assert.equal(validateSchema('目标标', lengthSchema).valid, false);
});

test('integer and number are distinguished, nullable is explicit', () => {
  assert.equal(validateSchema(1.5, { $id: 'i', type: 'integer' }).valid, false);
  assert.equal(validateSchema(1.5, { $id: 'n', type: 'number' }).valid, true);
  assert.equal(validateSchema(2, { $id: 'n2', type: 'number' }).valid, true);
  assert.equal(validateSchema(null, { $id: 's', type: 'string' }).valid, false);
  assert.equal(validateSchema(null, { $id: 's2', type: 'string', nullable: true }).valid, true);
});

test('assertSchema throws a SchemaValidationError carrying the violations', () => {
  assert.throws(
    () => assertSchema({}, { $id: 'need', type: 'object', required: ['x'] }),
    (error) => {
      assert.ok(error instanceof SchemaValidationError);
      assert.equal(error.details.schemaId, 'need');
      assert.equal(error.violations.length, 1);
      return true;
    },
  );
});

test('journal event schema accepts a complete event and pins the hash format', () => {
  const event = {
    schema_version: 1,
    event_id: '01J8ZQ9TESTEVENT0000000001',
    task_id: TASK_ID,
    segment: 1,
    seq: 42,
    occurred_at: FIXED_TIME,
    type: 'WORKER_RESULT_ACCEPTED',
    actor: 'proxy',
    causation_id: null,
    correlation_id: 'd-abc12345',
    idempotency_key: null,
    scope_version: 2,
    payload: { dispatch_id: 'd-abc12345' },
    artifact_refs: ['a-abc12345'],
    prev_event_hash: `sha256:${'0'.repeat(64)}`,
    event_hash: `sha256:${'a'.repeat(64)}`,
  };
  assert.equal(validateSchema(event, getSchema(SCHEMA_IDS.JOURNAL_EVENT)).valid, true);

  assert.equal(
    validateSchema({ ...event, event_hash: 'a'.repeat(64) }, getSchema(SCHEMA_IDS.JOURNAL_EVENT)).valid,
    false,
  );
  assert.equal(
    validateSchema({ ...event, task_id: 'task-1' }, getSchema(SCHEMA_IDS.JOURNAL_EVENT)).valid,
    false,
  );
  // A worker may not be an event actor; the pattern allows worker:<id> only so
  // the semantic layer can reject it with a clear invariant name.
  assert.equal(
    validateSchema({ ...event, actor: 'somebody' }, getSchema(SCHEMA_IDS.JOURNAL_EVENT)).valid,
    false,
  );
});

test('journal event schema forbids unknown properties and unknown types', () => {
  const schema = getSchema(SCHEMA_IDS.JOURNAL_EVENT);
  assert.equal(validateSchema({ type: 'STATE_SET' }, schema).valid, false);
  const { violations } = validateSchema({ extra: true }, schema);
  assert.ok(violations.some((entry) => entry.rule === 'additionalProperties'));
});

test('checkpoint schema bounds goal_summary at 240 bytes', () => {
  const schema = getSchema(SCHEMA_IDS.CHECKPOINT).properties.goal_summary;
  assert.equal(validateSchema('目'.repeat(80), schema).valid, true); // 240 bytes
  assert.equal(validateSchema('目'.repeat(81), schema).valid, false); // 243 bytes
});

test('checkpoint outcome accepts only sealable terminal statuses', () => {
  const schema = getSchema(SCHEMA_IDS.CHECKPOINT).properties.outcome;
  assert.equal(validateSchema(null, schema).valid, true);
  for (const status of TERMINAL_OUTCOMES) {
    assert.equal(validateSchema({ status, reason: null }, schema).valid, true, status);
  }
  // NEEDS_INPUT is a phase, never a sealed outcome.
  assert.equal(validateSchema({ status: 'NEEDS_INPUT', reason: null }, schema).valid, false);
  assert.equal(validateSchema({ status: 'FAILED', reason: null }, schema).valid, false);
});

test('worker output schema enforces the 3-claim and 4-artifact caps', () => {
  const schema = getSchema(SCHEMA_IDS.WORKER_OUTPUT);
  assert.equal(validateSchema(workerOutput(), schema).valid, true);

  const claim = workerOutput().claims[0];
  assert.equal(validateSchema(workerOutput({ claims: [claim, claim, claim] }), schema).valid, true);
  assert.equal(
    validateSchema(workerOutput({ claims: [claim, claim, claim, claim] }), schema).valid,
    false,
  );
  assert.equal(
    validateSchema(
      workerOutput({ artifact_refs: ['a-1111aaaa', 'a-2222aaaa', 'a-3333aaaa', 'a-4444aaaa', 'a-5555aaaa'] }),
      schema,
    ).valid,
    false,
  );
});

test('worker output summary is capped at 400 bytes', () => {
  const schema = getSchema(SCHEMA_IDS.WORKER_OUTPUT);
  assert.equal(validateSchema(workerOutput({ summary: 'x'.repeat(400) }), schema).valid, true);
  assert.equal(validateSchema(workerOutput({ summary: 'x'.repeat(401) }), schema).valid, false);
});

test('worker input schema caps max_envelope_bytes at the 1 KiB output budget', () => {
  const schema = getSchema(SCHEMA_IDS.WORKER_INPUT);
  assert.equal(validateSchema(workerInput(), schema).valid, true);
  assert.equal(
    validateSchema(
      workerInput({ expected_output: { schema: 'schemas/worker-output.schema.json', max_envelope_bytes: 2048 } }),
      schema,
    ).valid,
    false,
  );
});

test('worker input rejects an escaping write_root or input path (C07)', () => {
  const schema = getSchema(SCHEMA_IDS.WORKER_INPUT);
  for (const badPath of ['../outside/', '/etc/', 'C:/Windows/', 'work\\d1\\', 'work/../../etc/']) {
    assert.equal(
      validateSchema(workerInput({ write_root: badPath }), schema).valid,
      false,
      badPath,
    );
  }
});

test('artifact manifest schema accepts a real manifest and rejects a bad digest', () => {
  const task = makeTaskRoot();
  try {
    const manifest = makeManifest(task.root, 'evidence body');
    const schema = getSchema(SCHEMA_IDS.ARTIFACT_MANIFEST);
    assert.equal(validateSchema(manifest, schema).valid, true);
    assert.equal(validateSchema({ ...manifest, sha256: 'ABC' }, schema).valid, false);
    assert.equal(validateSchema({ ...manifest, path: '../escape.txt' }, schema).valid, false);
    assert.equal(validateSchema({ ...manifest, media_type: 'text' }, schema).valid, false);
  } finally {
    task.dispose();
  }
});

test('interruption schema requires 2-3 options and a safe default', () => {
  const schema = getSchema(SCHEMA_IDS.INTERRUPTION);
  assert.equal(validateSchema(interruption(), schema).valid, true);

  const single = interruption().options.slice(0, 1);
  assert.equal(validateSchema(interruption({ options: single }), schema).valid, false);
  assert.equal(
    validateSchema(interruption({ default_if_no_response: 'PROCEED' }), schema).valid,
    false,
  );
});

test('goal schema requires scope.in and scope.out with equal standing', () => {
  const goal = {
    schema_version: 1,
    goal_id: 'g-001abcd',
    task_id: TASK_ID,
    intent: 'Operations no longer key in 20k rows daily',
    subject: 'orders import pipeline',
    principals: { owner: 'ops-lead', decider: 'ops-lead', acceptor: 'ops-lead' },
    criteria: ['c-001abcd'],
    constraints: [],
    scope: { in: ['orders table'], out: ['refunds table'] },
    horizon: null,
    scope_version: 1,
  };
  const schema = getSchema(SCHEMA_IDS.GOAL);
  assert.equal(validateSchema(goal, schema).valid, true);
  // Declaring only what is in scope is not a scope.
  assert.equal(validateSchema({ ...goal, scope: { in: ['x'], out: [] } }, schema).valid, false);
  assert.equal(
    validateSchema({ ...goal, principals: { owner: 'a', decider: 'b' } }, schema).valid,
    false,
  );
});

test('criterion schema pins the type, state and rung vocabularies', () => {
  const schema = getSchema(SCHEMA_IDS.CRITERION);
  const criterion = {
    criterion_id: 'c-001abcd',
    scope_version: 1,
    type: 'NEGATIVE',
    statement: 'No PII found in the three exported files',
    required_rung: 'E3',
    max_rung: 'E3',
    achieved_rung: 'E3',
    state: 'SATISFIED',
    evidence_refs: ['a-001abcd'],
    check_surface: ['export-a.csv', 'export-b.csv', 'export-c.csv'],
  };
  assert.equal(validateSchema(criterion, schema).valid, true);
  assert.equal(validateSchema({ ...criterion, type: 'PERFORMANCE' }, schema).valid, false);
  assert.equal(validateSchema({ ...criterion, state: 'DONE' }, schema).valid, false);
  assert.equal(validateSchema({ ...criterion, required_rung: 'E9' }, schema).valid, false);
});

/**
 * Enum drift guard.
 *
 * The schemas are JSON files (worker envelopes reference them by path), so they
 * cannot import the vocabulary. This test is what keeps the two in lockstep:
 * adding an event type or criterion state in one place without the other fails
 * here rather than silently passing validation in one layer and not the other.
 */
test('JSON schema enums stay in sync with lib/vocabulary.mjs', () => {
  const cases = [
    ['journal-event.schema.json', ['properties', 'type', 'enum'], EVENT_TYPES],
    ['checkpoint.schema.json', ['properties', 'phase', 'enum'], PHASES],
    [
      'checkpoint.schema.json',
      ['properties', 'outcome', 'properties', 'status', 'enum'],
      TERMINAL_OUTCOMES,
    ],
    [
      'checkpoint.schema.json',
      ['properties', 'outcome', 'properties', 'reason', 'enum'],
      BLOCKED_REASONS,
    ],
    [
      'checkpoint.schema.json',
      ['properties', 'next_action', 'properties', 'kind', 'enum'],
      NEXT_ACTION_KINDS,
    ],
    [
      'checkpoint.schema.json',
      ['properties', 'active_step', 'properties', 'status', 'enum'],
      STEP_STATUSES,
    ],
    [
      'checkpoint.schema.json',
      ['properties', 'active_step', 'properties', 'kind', 'enum'],
      WORKER_ROLES,
    ],
    [
      'checkpoint.schema.json',
      ['properties', 'pending_interruption', 'properties', 'code', 'enum'],
      INTERRUPTION_CODES,
    ],
    ['worker-input.schema.json', ['properties', 'role', 'enum'], WORKER_ROLES],
    ['worker-output.schema.json', ['properties', 'status', 'enum'], WORKER_STATUSES],
    ['worker-output.schema.json', ['properties', 'claims', 'items', 'properties', 'kind', 'enum'], CLAIM_KINDS],
    ['artifact-manifest.schema.json', ['properties', 'kind', 'enum'], ARTIFACT_KINDS],
    ['artifact-manifest.schema.json', ['properties', 'retention', 'enum'], RETENTION_CLASSES],
    ['interruption.schema.json', ['properties', 'code', 'enum'], INTERRUPTION_CODES],
    ['common.schema.json', ['$defs', 'criterionType', 'enum'], CRITERION_TYPES],
    ['common.schema.json', ['$defs', 'criterionState', 'enum'], CRITERION_STATES],
    ['common.schema.json', ['$defs', 'evidenceRung', 'enum'], EVIDENCE_RUNGS],
  ];

  for (const [fileName, pointer, expected] of cases) {
    let node = getRawSchemaDocument(fileName);
    for (const key of pointer) node = node[key];
    assert.deepEqual(
      node,
      [...expected],
      `${fileName} at ${pointer.join('.')} drifted from lib/vocabulary.mjs`,
    );
  }
});

test('risk dimension enums stay in sync with the vocabulary', () => {
  const risk = getRawSchemaDocument('common.schema.json').$defs.risk;
  for (const [dimension, values] of Object.entries(RISK_DIMENSIONS)) {
    assert.deepEqual(risk.properties[dimension].enum, [...values], dimension);
  }
  assert.deepEqual(risk.required.sort(), Object.keys(RISK_DIMENSIONS).sort());
});
