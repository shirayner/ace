/**
 * Budget gate tests (design §12, scenarios C01-C03).
 *
 * The point of these is that limits are measured in real UTF-8 bytes and that
 * exceeding one raises rather than silently trims.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUDGETS,
  COUNT_LIMITS,
  SOFT_LIMITS,
  assertCompositionWithinBudget,
  assertWithinBudget,
  exceedsSoftLimit,
  measureComposition,
  utf8Bytes,
} from '../lib/budgets.mjs';
import { BudgetExceededError } from '../lib/errors.mjs';

test('utf8Bytes counts bytes, not UTF-16 code units', () => {
  assert.equal(utf8Bytes('abc'), 3);
  // Each CJK character is 3 bytes but 1 code unit — the gap a length check misses.
  assert.equal('目标'.length, 2);
  assert.equal(utf8Bytes('目标'), 6);
  // An emoji outside the BMP is 4 bytes and 2 code units.
  assert.equal(utf8Bytes('🔒'), 4);
  assert.equal('🔒'.length, 2);
});

test('utf8Bytes rejects non-string input rather than coercing', () => {
  assert.throws(() => utf8Bytes(42), TypeError);
  assert.throws(() => utf8Bytes(null), TypeError);
});

// These are hand-copied literals, not a parse of the design table the name used to
// claim. That is deliberate and sufficient here: an independent restatement is what
// makes an accidental edit to `lib/budgets.mjs` fail. Whether the *documents* still
// agree is a separate proposition, checked against `protocols/dispatch.md` in
// `kernel-layer-consistency.test.mjs`.
test('budget constants are pinned against accidental edits', () => {
  assert.equal(BUDGETS.SKILL_MD, 6 * 1024);
  assert.equal(BUDGETS.CHECKPOINT, 2 * 1024);
  assert.equal(BUDGETS.WORKER_INPUT_ENVELOPE, 2 * 1024);
  assert.equal(BUDGETS.WORKER_LAUNCH_TOTAL, 16 * 1024);
  assert.equal(BUDGETS.WORKER_OUTPUT_ENVELOPE, 1 * 1024);
  assert.equal(BUDGETS.JOURNAL_EVENT, 4 * 1024);
  assert.equal(BUDGETS.JOURNAL_SEGMENT, 1024 * 1024);
  assert.equal(BUDGETS.RECOVERY_TOTAL, 4 * 1024);
  assert.equal(BUDGETS.ARTIFACT, 8 * 1024 * 1024);
  assert.equal(BUDGETS.GOAL_SUMMARY, 240);
  assert.equal(BUDGETS.WORKER_SUMMARY, 400);
  assert.equal(COUNT_LIMITS.JOURNAL_SEGMENT_EVENTS, 2000);
  assert.equal(SOFT_LIMITS.JOURNAL_SEGMENT, 512 * 1024);
  assert.equal(SOFT_LIMITS.ARTIFACT_SLICE_TOTAL, 12 * 1024);
});

test('assertWithinBudget accepts a payload exactly at the limit', () => {
  const exact = 'x'.repeat(BUDGETS.CHECKPOINT);
  assert.equal(assertWithinBudget(exact, BUDGETS.CHECKPOINT, 'CHECKPOINT'), BUDGETS.CHECKPOINT);
});

test('checkpoint of 2049 bytes is rejected, not truncated (C01)', () => {
  const oversized = 'x'.repeat(BUDGETS.CHECKPOINT + 1);
  assert.throws(
    () => assertWithinBudget(oversized, BUDGETS.CHECKPOINT, 'CHECKPOINT'),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.details.actualBytes, 2049);
      assert.equal(error.details.limitBytes, 2048);
      assert.equal(error.details.budget, 'CHECKPOINT');
      return true;
    },
  );
});

test('input envelope of 2049 bytes is rejected (C02)', () => {
  const oversized = 'x'.repeat(BUDGETS.WORKER_INPUT_ENVELOPE + 1);
  assert.throws(
    () => assertWithinBudget(oversized, BUDGETS.WORKER_INPUT_ENVELOPE, 'WORKER_INPUT_ENVELOPE'),
    BudgetExceededError,
  );
});

test('launch payload of 16385 bytes is rejected and reports its composition (C03)', () => {
  const parts = {
    envelope: 'e'.repeat(1024),
    prompt: 'p'.repeat(2048),
    slices: 's'.repeat(BUDGETS.WORKER_LAUNCH_TOTAL - 1024 - 2048 + 1),
  };

  assert.throws(
    () => assertCompositionWithinBudget(parts, BUDGETS.WORKER_LAUNCH_TOTAL, 'WORKER_LAUNCH_TOTAL'),
    (error) => {
      assert.equal(error.details.actualBytes, 16385);
      assert.equal(error.details.limitBytes, 16384);
      // The breakdown is what makes the rejection actionable: shrink the slices.
      assert.equal(error.details.composition.envelope, 1024);
      assert.equal(error.details.composition.prompt, 2048);
      assert.equal(error.details.composition.slices, 13313);
      return true;
    },
  );
});

test('control: a launch payload exactly at the limit is accepted and returns its composition', () => {
  // Without this case the whole `assertCompositionWithinBudget` group asserts only rejection,
  // so it would pass just as well against an implementation that rejects every payload --
  // verified: a blanket-reject mutation of this function survived the entire suite until this
  // test existed. Exactly-at-the-limit also pins the boundary as `>` rather than `>=`.
  const parts = {
    envelope: 'e'.repeat(1024),
    prompt: 'p'.repeat(2048),
    slices: 's'.repeat(BUDGETS.WORKER_LAUNCH_TOTAL - 1024 - 2048),
  };

  const { total, composition } = assertCompositionWithinBudget(
    parts,
    BUDGETS.WORKER_LAUNCH_TOTAL,
    'WORKER_LAUNCH_TOTAL',
  );
  assert.equal(total, 16384);
  assert.equal(composition.envelope, 1024);
  assert.equal(composition.prompt, 2048);
  assert.equal(composition.slices, 13312);
});

test('measureComposition totals every named part', () => {
  const { total, composition } = measureComposition({ a: 'ab', b: '目' });
  assert.equal(composition.a, 2);
  assert.equal(composition.b, 3);
  assert.equal(total, 5);
});

test('soft limits report without rejecting', () => {
  assert.equal(exceedsSoftLimit(SOFT_LIMITS.ARTIFACT, SOFT_LIMITS.ARTIFACT), false);
  assert.equal(exceedsSoftLimit(SOFT_LIMITS.ARTIFACT + 1, SOFT_LIMITS.ARTIFACT), true);
});
