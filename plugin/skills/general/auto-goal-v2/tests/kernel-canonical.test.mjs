/**
 * Canonical serialization and hash chain tests (design §7.1, scenario J03).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  GENESIS_HASH,
  canonicalHash,
  canonicalize,
  computeEventHash,
  isHashRef,
  sealEvent,
  sha256Hex,
  verifyChain,
  verifyEventHash,
} from '../lib/canonical.mjs';
import { KERNEL_CODES, HashMismatchError } from '../lib/errors.mjs';

test('canonical form sorts object keys recursively', () => {
  assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalize({ z: { y: 1, x: 2 } }), '{"z":{"x":2,"y":1}}');
});

test('key order does not change the digest, but values do', () => {
  assert.equal(canonicalHash({ a: 1, b: 2 }), canonicalHash({ b: 2, a: 1 }));
  assert.notEqual(canonicalHash({ a: 1 }), canonicalHash({ a: 2 }));
});

test('array order is preserved because it is meaningful', () => {
  assert.equal(canonicalize([3, 1, 2]), '[3,1,2]');
  assert.notEqual(canonicalHash([1, 2]), canonicalHash([2, 1]));
});

test('canonical form emits no whitespace', () => {
  assert.equal(canonicalize({ a: [1, { b: 'c' }] }), '{"a":[1,{"b":"c"}]}');
});

test('canonicalize rejects values that JSON.stringify would silently drop', () => {
  // JSON.stringify drops undefined properties and turns NaN into null, which
  // would make two different events hash identically.
  for (const value of [{ a: undefined }, { a: Number.NaN }, { a: Infinity }, { a() {} }]) {
    assert.throws(() => canonicalize(value), (error) => {
      assert.equal(error.code, KERNEL_CODES.CANONICALIZATION_FAILED);
      return true;
    });
  }
});

test('canonicalize rejects circular references and non-plain objects', () => {
  const circular = { a: 1 };
  circular.self = circular;
  assert.throws(() => canonicalize(circular), /circular/);
  assert.throws(() => canonicalize({ when: new Date() }), /non-plain object/);
});

test('canonicalize accepts null and nested empty containers', () => {
  assert.equal(canonicalize({ a: null, b: [], c: {} }), '{"a":null,"b":[],"c":{}}');
});

test('unicode strings hash by their bytes', () => {
  assert.equal(sha256Hex('目标').length, 64);
  assert.notEqual(sha256Hex('目标'), sha256Hex('目標'));
});

test('isHashRef accepts only sha256:<64 lowercase hex>', () => {
  assert.equal(isHashRef(`sha256:${'a'.repeat(64)}`), true);
  assert.equal(isHashRef(`sha256:${'A'.repeat(64)}`), false);
  assert.equal(isHashRef(`sha256:${'a'.repeat(63)}`), false);
  assert.equal(isHashRef('a'.repeat(64)), false);
  assert.equal(isHashRef(null), false);
});

test('sealEvent links to its predecessor and hashes itself', () => {
  const sealed = sealEvent({ seq: 1, type: 'GOAL_CREATED' }, GENESIS_HASH);
  assert.equal(sealed.prev_event_hash, GENESIS_HASH);
  assert.ok(isHashRef(sealed.event_hash));
  assert.deepEqual(verifyEventHash(sealed), {
    valid: true,
    expected: sealed.event_hash,
    actual: sealed.event_hash,
  });
});

test('sealEvent does not mutate its input', () => {
  const draft = { seq: 1, type: 'GOAL_CREATED' };
  sealEvent(draft, GENESIS_HASH);
  assert.deepEqual(draft, { seq: 1, type: 'GOAL_CREATED' });
});

test('sealEvent rejects a malformed predecessor hash', () => {
  assert.throws(() => sealEvent({ seq: 1 }, 'not-a-hash'), HashMismatchError);
});

test('event_hash excludes itself but includes prev_event_hash', () => {
  const linked = { seq: 1, prev_event_hash: GENESIS_HASH };
  const withStaleHash = { ...linked, event_hash: `sha256:${'9'.repeat(64)}` };
  // The stale self-hash must not affect the computation.
  assert.equal(computeEventHash(withStaleHash), computeEventHash(linked));

  const differentPrev = { seq: 1, prev_event_hash: `sha256:${'1'.repeat(64)}` };
  assert.notEqual(computeEventHash(linked), computeEventHash(differentPrev));
});

function buildChain(count) {
  const events = [];
  let prev = GENESIS_HASH;
  for (let seq = 1; seq <= count; seq += 1) {
    const event = sealEvent({ seq, type: 'CRITERION_DEFINED', payload: { n: seq } }, prev);
    events.push(event);
    prev = event.event_hash;
  }
  return events;
}

test('an intact chain verifies', () => {
  assert.deepEqual(verifyChain(buildChain(5)), { valid: true, brokenAtIndex: null, reason: null });
  assert.deepEqual(verifyChain([]), { valid: true, brokenAtIndex: null, reason: null });
});

test('a tampered payload breaks the chain at that event', () => {
  const events = buildChain(4);
  events[2] = { ...events[2], payload: { n: 999 } };
  const result = verifyChain(events);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAtIndex, 2);
  assert.match(result.reason, /event_hash mismatch/);
});

test('a removed middle event breaks the link (truncation detection)', () => {
  const events = buildChain(4);
  events.splice(1, 1);
  const result = verifyChain(events);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAtIndex, 1);
  assert.match(result.reason, /prev_event_hash mismatch/);
});

test('a chain not starting at genesis is rejected', () => {
  const events = buildChain(2);
  const result = verifyChain(events, `sha256:${'7'.repeat(64)}`);
  assert.equal(result.valid, false);
  assert.equal(result.brokenAtIndex, 0);
});

test('non-increasing seq is rejected even when hashes link', () => {
  let prev = GENESIS_HASH;
  const events = [];
  for (const seq of [1, 1]) {
    const event = sealEvent({ seq, type: 'CRITERION_DEFINED' }, prev);
    events.push(event);
    prev = event.event_hash;
  }
  const result = verifyChain(events);
  assert.equal(result.valid, false);
  assert.match(result.reason, /seq not strictly increasing/);
});
