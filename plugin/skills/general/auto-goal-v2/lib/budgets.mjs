/**
 * Hard context and storage budgets (design §12) plus the UTF-8 byte gate.
 *
 * Every limit is measured in real UTF-8 bytes of the serialized form — never
 * characters, never estimated tokens. Callers must gate BEFORE the bytes can
 * reach the main model or a worker process.
 */

import { BudgetExceededError } from './errors.mjs';

const KIB = 1024;
const MIB = 1024 * KIB;

/** Hard limits. Exceeding one is an event, never something to silently truncate. */
export const BUDGETS = Object.freeze({
  SKILL_MD: 6 * KIB,
  CHECKPOINT: 2 * KIB,
  WORKER_INPUT_ENVELOPE: 2 * KIB,
  WORKER_LAUNCH_TOTAL: 16 * KIB,
  WORKER_OUTPUT_ENVELOPE: 1 * KIB,
  JOURNAL_EVENT: 4 * KIB,
  JOURNAL_SEGMENT: 1 * MIB,
  RECOVERY_TOTAL: 4 * KIB,
  RECOVERY_EVENT_TAIL: 16 * KIB,
  ARTIFACT: 8 * MIB,
  GOAL_SUMMARY: 240,
  WORKER_SUMMARY: 400,
  ARTIFACT_MANIFEST: 2 * KIB,
});

/** Soft warning thresholds — advisory, they never reject. */
export const SOFT_LIMITS = Object.freeze({
  JOURNAL_SEGMENT: 512 * KIB,
  ARTIFACT: 1 * MIB,
  ARTIFACT_SLICE_TOTAL: 12 * KIB,
});

/** Count-based limits that trigger alongside byte limits. */
export const COUNT_LIMITS = Object.freeze({
  JOURNAL_SEGMENT_EVENTS: 2000,
  WORKER_OUTPUT_CLAIMS: 3,
  WORKER_OUTPUT_ARTIFACT_REFS: 4,
});

const encoder = new TextEncoder();

/**
 * Actual UTF-8 byte length of a string.
 * Distinct from `String#length` (UTF-16 code units) for any non-ASCII input.
 */
export function utf8Bytes(text) {
  if (typeof text !== 'string') {
    throw new TypeError(`utf8Bytes expects a string, received ${typeof text}`);
  }
  return encoder.encode(text).length;
}

/**
 * Reject when a serialized payload exceeds its budget.
 *
 * @param {string} serialized already-serialized payload
 * @param {number} limitBytes hard limit from BUDGETS
 * @param {string} budget budget name for the error envelope
 * @param {object} [composition] per-part byte breakdown, for actionable diagnosis
 * @returns {number} actual byte count when within budget
 */
export function assertWithinBudget(serialized, limitBytes, budget, composition = undefined) {
  const actualBytes = utf8Bytes(serialized);
  if (actualBytes > limitBytes) {
    throw new BudgetExceededError({ budget, actualBytes, limitBytes, composition });
  }
  return actualBytes;
}

/**
 * Sum a named byte composition, e.g. the worker launch payload's parts.
 * @param {Record<string, string>} parts name -> serialized text
 * @returns {{total: number, composition: Record<string, number>}}
 */
export function measureComposition(parts) {
  const composition = {};
  let total = 0;
  for (const [name, text] of Object.entries(parts)) {
    const bytes = utf8Bytes(text);
    composition[name] = bytes;
    total += bytes;
  }
  return { total, composition };
}

/**
 * Gate a multi-part payload against a single total budget.
 * Reports every part's byte count so the caller can shrink the right slice.
 */
export function assertCompositionWithinBudget(parts, limitBytes, budget) {
  const { total, composition } = measureComposition(parts);
  if (total > limitBytes) {
    throw new BudgetExceededError({ budget, actualBytes: total, limitBytes, composition });
  }
  return { total, composition };
}

/** Whether a byte count crossed an advisory soft threshold. */
export function exceedsSoftLimit(actualBytes, softLimitBytes) {
  return actualBytes > softLimitBytes;
}
