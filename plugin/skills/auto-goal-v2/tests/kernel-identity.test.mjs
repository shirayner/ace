/**
 * Identity generation tests (design §9.3, §9.4).
 *
 * Event ids must sort in append order to make a truncated journal readable, and
 * idempotency keys must be stable across a crash so recovery can query the
 * effector instead of repeating an external side effect.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  effectIdempotencyKey,
  isoTimestamp,
  newEventId,
  newId,
} from '../lib/identity.mjs';
import { getSchema, SCHEMA_IDS } from '../schemas/registry.mjs';
import { validateSchema } from '../lib/schema-validator.mjs';

test('newEventId is 26 Crockford base32 characters', () => {
  const id = newEventId();
  assert.equal(id.length, 26);
  // The alphabet excludes I, L, O and U to avoid transcription mistakes.
  assert.match(id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
});

test('event ids sort in creation order, including within one millisecond', () => {
  const now = Date.now();
  const sameMillisecond = Array.from({ length: 50 }, () => newEventId(now));
  assert.deepEqual(sameMillisecond, [...sameMillisecond].sort());
  assert.equal(new Set(sameMillisecond).size, 50);

  const later = newEventId(now + 1);
  assert.ok(later > sameMillisecond.at(-1));
});

test('event ids satisfy the journal event schema', () => {
  const schema = getSchema(SCHEMA_IDS.JOURNAL_EVENT).properties.event_id;
  for (let index = 0; index < 20; index += 1) {
    assert.equal(validateSchema(newEventId(), schema).valid, true);
  }
});

test('newId produces a prefixed identifier accepted by the id fragment', () => {
  const schema = getSchema(SCHEMA_IDS.WORKER_INPUT).properties.dispatch_id;
  for (const prefix of ['d', 'a', 'c', 's', 'ap']) {
    const id = newId(prefix);
    assert.match(id, new RegExp(`^${prefix}-[a-z0-9]{8}$`));
    assert.equal(validateSchema(id, schema).valid, true, id);
  }
});

test('newId rejects an invalid prefix instead of producing an unusable id', () => {
  for (const bad of ['D', 'a b', '1d', '', 'a-b']) {
    assert.throws(() => newId(bad), TypeError, bad);
  }
});

test('newId collisions are not expected across many draws', () => {
  const ids = new Set(Array.from({ length: 2000 }, () => newId('d')));
  assert.equal(ids.size, 2000);
});

test('isoTimestamp matches the schema timestamp format', () => {
  const schema = getSchema(SCHEMA_IDS.JOURNAL_EVENT).properties.occurred_at;
  assert.equal(validateSchema(isoTimestamp(), schema).valid, true);
  assert.equal(validateSchema(isoTimestamp(new Date(0)), schema).valid, true);
  assert.equal(isoTimestamp(new Date(0)), '1970-01-01T00:00:00.000Z');
});

test('an idempotency key is stable for the same task, action and target set', () => {
  const first = effectIdempotencyKey('goal-t1', 'rename', ['b.txt', 'a.txt']);
  const second = effectIdempotencyKey('goal-t1', 'rename', ['b.txt', 'a.txt']);
  assert.equal(first, second);
});

test('target set order does not change the key, but its contents do', () => {
  // Order is an artifact of enumeration, not part of the action's identity.
  assert.equal(
    effectIdempotencyKey('goal-t1', 'rename', ['a.txt', 'b.txt']),
    effectIdempotencyKey('goal-t1', 'rename', ['b.txt', 'a.txt']),
  );
  // An extra target is a different action and must re-approve and re-key (R02).
  assert.notEqual(
    effectIdempotencyKey('goal-t1', 'rename', ['a.txt', 'b.txt']),
    effectIdempotencyKey('goal-t1', 'rename', ['a.txt', 'b.txt', 'c.txt']),
  );
});

test('task and action are part of the key so approvals cannot leak across goals', () => {
  assert.notEqual(
    effectIdempotencyKey('goal-t1', 'rename', ['a.txt']),
    effectIdempotencyKey('goal-t2', 'rename', ['a.txt']),
  );
  assert.notEqual(
    effectIdempotencyKey('goal-t1', 'rename', ['a.txt']),
    effectIdempotencyKey('goal-t1', 'delete', ['a.txt']),
  );
});

test('an idempotency key is accepted by the journal event schema', () => {
  const schema = getSchema(SCHEMA_IDS.JOURNAL_EVENT).properties.idempotency_key;
  const key = effectIdempotencyKey('goal-fixture01', 'rename', ['a.txt', 'b.txt']);
  assert.equal(validateSchema(key, schema).valid, true, key);
});
