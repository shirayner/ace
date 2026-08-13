/**
 * Identifier and timestamp generation.
 *
 * Event ids are monotonic within a process so append order and lexical order
 * agree, which makes a truncated journal easier to read. Cross-process ordering
 * comes from `seq` under the write lock, never from an id.
 */

import { randomBytes } from 'node:crypto';

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: no I, L, O, U

let lastTimestamp = -1;
let lastRandom = null;

function encodeTime(milliseconds, length) {
  let remaining = milliseconds;
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output = BASE32[remaining % 32] + output;
    remaining = Math.floor(remaining / 32);
  }
  return output;
}

function randomChars(length) {
  const bytes = randomBytes(length);
  let output = '';
  for (let index = 0; index < length; index += 1) {
    output += BASE32[bytes[index] % 32];
  }
  return output;
}

function incrementRandom(chars) {
  const symbols = chars.split('');
  for (let index = symbols.length - 1; index >= 0; index -= 1) {
    const next = BASE32.indexOf(symbols[index]) + 1;
    if (next < 32) {
      symbols[index] = BASE32[next];
      return symbols.join('');
    }
    symbols[index] = BASE32[0];
  }
  return null; // Exhausted within this millisecond.
}

/**
 * ULID-style 26-character identifier: 10 chars of time, 16 of randomness.
 * Two ids minted in the same millisecond stay ordered via random increment.
 */
export function newEventId(now = Date.now()) {
  if (now === lastTimestamp && lastRandom) {
    const incremented = incrementRandom(lastRandom);
    if (incremented) {
      lastRandom = incremented;
      return encodeTime(now, 10) + lastRandom;
    }
  }
  lastTimestamp = now;
  lastRandom = randomChars(16);
  return encodeTime(now, 10) + lastRandom;
}

/** `<prefix>-<8 lowercase base32>` identifier, matching the `id` schema fragment. */
export function newId(prefix) {
  if (!/^[a-z][a-z0-9]*$/.test(prefix)) {
    throw new TypeError(`Id prefix must be lowercase alphanumeric, received "${prefix}"`);
  }
  return `${prefix}-${randomChars(8).toLowerCase()}`;
}

/** RFC 3339 UTC timestamp with milliseconds — the only accepted time format. */
export function isoTimestamp(date = new Date()) {
  return date.toISOString();
}

/**
 * Stable idempotency key for an external effect.
 *
 * Derived from the task, the action and the exact target set so a replay after a
 * crash produces the same key and the effector can deduplicate (design §9.3).
 */
export function effectIdempotencyKey(taskId, actionKind, targets) {
  const normalizedTargets = [...targets].map(String).sort().join('|');
  const source = `${taskId}:${actionKind}:${normalizedTargets}`;
  // Hyphens and colons are allowed by the schema's idempotency_key pattern.
  return `eff:${taskId}:${actionKind}:${hashToBase32(source)}`;
}

function hashToBase32(source) {
  // FNV-1a is enough: keys need stability and collision resistance within one
  // task's action set, not cryptographic strength.
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let output = '';
  let remaining = hash;
  for (let index = 0; index < 7; index += 1) {
    output = BASE32[remaining % 32] + output;
    remaining = Math.floor(remaining / 32);
  }
  return output;
}
