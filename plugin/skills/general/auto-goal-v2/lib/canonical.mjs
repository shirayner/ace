/**
 * Canonical JSON serialization and the journal hash chain (design §7.1).
 *
 * Canonical form exists so two processes hash the same logical event to the same
 * digest. It is deliberately stricter than JSON.stringify: values that serialize
 * ambiguously (undefined, NaN, Infinity, functions, non-plain objects) are
 * rejected rather than coerced or dropped.
 *
 * The chain detects truncation and tampering. It is not a security signature —
 * anyone able to rewrite the journal can recompute it.
 */

import { createHash } from 'node:crypto';
import { KernelError, KERNEL_CODES, HashMismatchError } from './errors.mjs';

const HASH_ALGORITHM = 'sha256';
const HASH_PREFIX = 'sha256:';

/** Genesis link for a task's first event — a segment's chain starts here. */
export const GENESIS_HASH = `${HASH_PREFIX}${'0'.repeat(64)}`;

/** Field excluded from its own digest. */
const SELF_HASH_FIELD = 'event_hash';

function rejectValue(path, reason) {
  throw new KernelError(
    KERNEL_CODES.CANONICALIZATION_FAILED,
    `Value at ${path || '<root>'} cannot be canonicalized: ${reason}`,
    { path: path || '<root>', reason },
  );
}

function canonicalizeValue(value, path, seen) {
  if (value === null) return 'null';

  const type = typeof value;

  if (type === 'boolean') return value ? 'true' : 'false';

  if (type === 'number') {
    if (!Number.isFinite(value)) rejectValue(path, `non-finite number (${value})`);
    // Integers and JS doubles both round-trip through JSON.stringify verbatim.
    return JSON.stringify(value);
  }

  if (type === 'string') return JSON.stringify(value);

  if (type === 'undefined') rejectValue(path, 'undefined is not a JSON value');
  if (type === 'function') rejectValue(path, 'functions are not JSON values');
  if (type === 'bigint') rejectValue(path, 'bigint is not a JSON value');
  if (type === 'symbol') rejectValue(path, 'symbols are not JSON values');

  if (seen.has(value)) rejectValue(path, 'circular reference');
  seen.add(value);

  let serialized;
  if (Array.isArray(value)) {
    const items = value.map((item, index) => canonicalizeValue(item, `${path}[${index}]`, seen));
    serialized = `[${items.join(',')}]`;
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      rejectValue(path, `non-plain object (${value.constructor?.name ?? 'unknown'})`);
    }
    // Sorted keys are what make the digest reproducible across producers.
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => {
      const child = canonicalizeValue(value[key], path ? `${path}.${key}` : key, seen);
      return `${JSON.stringify(key)}:${child}`;
    });
    serialized = `{${entries.join(',')}}`;
  }

  seen.delete(value);
  return serialized;
}

/**
 * Deterministic, whitespace-free JSON with recursively sorted object keys.
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalize(value) {
  return canonicalizeValue(value, '', new Set());
}

/** `sha256:<hex>` digest of a UTF-8 string. */
export function sha256Hex(text) {
  return createHash(HASH_ALGORITHM).update(text, 'utf8').digest('hex');
}

/** `sha256:<hex>` digest of arbitrary bytes. */
export function sha256Bytes(buffer) {
  return createHash(HASH_ALGORITHM).update(buffer).digest('hex');
}

/** Digest of a value's canonical form, prefixed for self-description. */
export function canonicalHash(value) {
  return `${HASH_PREFIX}${sha256Hex(canonicalize(value))}`;
}

/** Whether a string is a well-formed `sha256:<64 hex>` reference. */
export function isHashRef(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

/**
 * Compute an event's chain hash: the canonical event minus its own hash field.
 * `prev_event_hash` stays in the digest input, which is what links the chain.
 */
export function computeEventHash(event) {
  const { [SELF_HASH_FIELD]: _ignored, ...hashable } = event;
  return canonicalHash(hashable);
}

/**
 * Attach `prev_event_hash` and `event_hash` to an unsealed event.
 * @param {object} event event without hash fields
 * @param {string} prevEventHash predecessor hash, or GENESIS_HASH for the first
 * @returns {object} new sealed event; the input is not mutated
 */
export function sealEvent(event, prevEventHash) {
  if (!isHashRef(prevEventHash)) {
    throw new HashMismatchError('prev_event_hash is not a valid sha256 reference', {
      prevEventHash,
    });
  }
  const linked = { ...event, prev_event_hash: prevEventHash };
  return { ...linked, [SELF_HASH_FIELD]: computeEventHash(linked) };
}

/**
 * Verify a single sealed event's self-hash.
 * @returns {{valid: boolean, expected: string, actual: string}}
 */
export function verifyEventHash(event) {
  const expected = computeEventHash(event);
  return { valid: expected === event[SELF_HASH_FIELD], expected, actual: event[SELF_HASH_FIELD] };
}

/**
 * Verify a chain's link integrity, self-hashes and strictly increasing `seq`.
 *
 * Returns the first defect instead of throwing so recovery can report exactly
 * where the journal became untrustworthy and rebuild from the prefix before it.
 *
 * @param {object[]} events events in append order
 * @param {string} [genesisHash] expected `prev_event_hash` of the first event
 * @returns {{valid: boolean, brokenAtIndex: number|null, reason: string|null}}
 */
export function verifyChain(events, genesisHash = GENESIS_HASH) {
  let expectedPrev = genesisHash;
  let lastSeq = null;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];

    if (event.prev_event_hash !== expectedPrev) {
      return {
        valid: false,
        brokenAtIndex: index,
        reason: `prev_event_hash mismatch: expected ${expectedPrev}, found ${event.prev_event_hash}`,
      };
    }

    const selfCheck = verifyEventHash(event);
    if (!selfCheck.valid) {
      return {
        valid: false,
        brokenAtIndex: index,
        reason: `event_hash mismatch: expected ${selfCheck.expected}, found ${selfCheck.actual}`,
      };
    }

    if (lastSeq !== null && !(event.seq > lastSeq)) {
      return {
        valid: false,
        brokenAtIndex: index,
        reason: `seq not strictly increasing: ${event.seq} follows ${lastSeq}`,
      };
    }

    lastSeq = event.seq;
    expectedPrev = event[SELF_HASH_FIELD];
  }

  return { valid: true, brokenAtIndex: null, reason: null };
}
