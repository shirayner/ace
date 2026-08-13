/**
 * Recovery read-surface tests (design §9.1, §9.5 step 8, §12; scenario X05).
 *
 * The claim under test is the one the design states as a correctness constraint:
 * a normal recovery costs the main Agent at most 4 KiB. These tests measure the
 * assembled envelope's real UTF-8 bytes, because a budget that is only a constant
 * is a comment. They also pin the two properties that make degradation honest:
 * the tail never carries event bodies, and anything withheld is declared.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { appendEvent, journalPaths, readAllEvents, writeCheckpoint, writeFileAtomic } from '../lib/journal.mjs';
import { reduceCheckpoint } from '../lib/reducer.mjs';
import { buildRecoveryEnvelope, recoveryEnvelopeBytes } from '../lib/recovery.mjs';
import { BUDGETS } from '../lib/budgets.mjs';
import { KernelError } from '../lib/errors.mjs';
import {
  alignedTaskDrafts,
  eventDraft,
  makeTaskRoot,
  FIXED_TIME,
} from './fixtures/kernel-fixtures.mjs';

function withTask(run) {
  const task = makeTaskRoot('agv2-recovery-');
  try {
    return run(task.root);
  } finally {
    task.dispose();
  }
}

function append(root, draft) {
  return appendEvent(root, draft).event;
}

/** Checkpoint the journal as it stands, the way the control loop's step 5 does. */
function checkpointNow(root) {
  const { checkpoint } = reduceCheckpoint(readAllEvents(root).events, { now: FIXED_TIME });
  writeCheckpoint(root, checkpoint);
  return checkpoint;
}

/**
 * Append `count` events past the checkpoint, each carrying a payload near the
 * per-event limit so the tail is genuinely large rather than merely numerous.
 */
function growTail(root, count, noteBytes = 3000) {
  for (let index = 0; index < count; index += 1) {
    append(root, eventDraft('ASSUMPTION_RECORDED', {
      payload: { assumption_id: `as-${String(index).padStart(6, '0')}`, note: 'x'.repeat(noteBytes) },
    }));
  }
}

// ------------------------------------------------------------- the normal path

test('a normal recovery envelope fits RECOVERY_TOTAL and names one next action', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    append(root, eventDraft('STEP_PLANNED', {
      payload: { step_id: 's-001abcd', kind: 'VERIFY', completes_attainable_work: true },
    }));

    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.ok(
      bytes <= BUDGETS.RECOVERY_TOTAL,
      `recovery envelope is ${bytes} bytes, over the ${BUDGETS.RECOVERY_TOTAL} byte budget`,
    );
    assert.equal(envelope.checkpoint_source, 'stored');
    assert.equal(envelope.tail.complete, true);
    assert.equal(envelope.tail.event_count, 1);
    assert.equal(envelope.tail.omitted_count, 0);
    // I8 survives the projection: recovery still yields exactly one next step.
    assert.ok(envelope.next_action);
    assert.equal(typeof envelope.next_action.kind, 'string');
  });
});

test('the reported byte count is the envelope measured, not an estimate', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);

    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.equal(bytes, recoveryEnvelopeBytes(envelope));
  });
});

test('an absent checkpoint rebuilds from the journal and still fits the budget', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    // No writeCheckpoint: this is the J01/J02 crash shape.
    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.equal(envelope.checkpoint_source, 'rebuilt');
    assert.match(envelope.cursor_note, /absent or unreadable/);
    // A rebuilt checkpoint folded every event, so nothing is outstanding.
    assert.equal(envelope.tail.event_count, 0);
    assert.equal(envelope.tail.complete, true);
    assert.ok(bytes <= BUDGETS.RECOVERY_TOTAL);
  });
});

test('an empty journal with no checkpoint cannot fabricate a recovery envelope', () => {
  withTask((root) => {
    assert.throws(() => buildRecoveryEnvelope(root), (error) => {
      assert.ok(error instanceof KernelError);
      assert.equal(error.code, 'INVARIANT_VIOLATED');
      return true;
    });
  });
});

// ------------------------------------------------- degradation and disclosure

test('a long tail is projected into the budget and declares what it withheld', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    growTail(root, 40);

    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.ok(
      bytes <= BUDGETS.RECOVERY_TOTAL,
      `envelope is ${bytes} bytes for a 40-event tail; the projection failed to bound it`,
    );
    assert.equal(envelope.tail.event_count, 40);
    assert.equal(envelope.tail.complete, false);
    assert.ok(envelope.tail.omitted_count > 0);
    // Withholding is only acceptable when it is stated.
    assert.match(envelope.tail.omitted_detail, /not shown/);
    assert.equal(envelope.tail.included_count + envelope.tail.omitted_count, 40);
  });
});

test('past RECOVERY_EVENT_TAIL the reducer compresses and no event rows are returned', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    // 10 events x ~3 KiB each clears the 16 KiB hard cap on the raw tail.
    growTail(root, 10);

    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.ok(envelope.tail.raw_bytes > BUDGETS.RECOVERY_EVENT_TAIL);
    assert.equal(envelope.tail.reducer_compressed, true);
    // §9.1: the main Agent reads no event bodies past the cap — not even identity rows.
    assert.equal(envelope.tail.rows, undefined);
    assert.equal(envelope.tail.included_count, 0);
    assert.equal(envelope.tail.omitted_count, 10);
    assert.ok(bytes <= BUDGETS.RECOVERY_TOTAL);
  });
});

test('a tail just under the raw cap keeps rows rather than compressing', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    growTail(root, 3, 1000);

    const { envelope } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.ok(envelope.tail.raw_bytes <= BUDGETS.RECOVERY_EVENT_TAIL);
    assert.equal(envelope.tail.reducer_compressed, false);
    assert.equal(envelope.tail.rows.length, 3);
    assert.equal(envelope.tail.complete, true);
  });
});

test('tail rows carry identity only, never event payloads', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    const secret = 'PAYLOAD_BODY_MUST_NOT_APPEAR';
    append(root, eventDraft('ASSUMPTION_RECORDED', {
      payload: { assumption_id: 'as-000001', note: secret },
    }));

    const { envelope } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.deepEqual(Object.keys(envelope.tail.rows[0]).sort(), ['actor', 'seq', 'type']);
    // The strongest form of the assertion: the body is nowhere in the envelope.
    assert.ok(!JSON.stringify(envelope).includes(secret));
  });
});

test('a tail of many small events is capped by row count, not only by bytes', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    // 30 minimal events: the raw tail stays under the 16 KiB cap, so rows are
    // still affordable and the row count is the only thing bounding the output.
    // This is the regime the compression path would otherwise mask.
    for (let index = 0; index < 30; index += 1) {
      append(root, eventDraft('ASSUMPTION_RECORDED', {
        payload: { assumption_id: `as-${String(index).padStart(6, '0')}` },
      }));
    }

    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.ok(envelope.tail.raw_bytes <= BUDGETS.RECOVERY_EVENT_TAIL, 'test drifted into the compression regime');
    assert.equal(envelope.tail.fidelity, 'rows');
    assert.equal(envelope.tail.event_count, 30);
    assert.equal(envelope.tail.included_count, 20);
    assert.equal(envelope.tail.omitted_count, 10);
    assert.equal(envelope.tail.rows.length, 20);
    assert.equal(envelope.tail.complete, false);
    assert.ok(bytes <= BUDGETS.RECOVERY_TOTAL);
  });
});

test('the type histogram is bounded even when the tail spans many event types', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    // Eight distinct types, more than the histogram's key cap, each with a
    // payload its semantic validator accepts.
    append(root, eventDraft('ASSUMPTION_RECORDED', { payload: { assumption_id: 'as-000001' } }));
    append(root, eventDraft('MANDATE_ASSESSED', { payload: { residual: [] } }));
    append(root, eventDraft('SCOPE_CHANGE_PROPOSED', { payload: { reason: 'narrower surface' } }));
    append(root, eventDraft('STEP_PLANNED', {
      payload: { step_id: 's-001abcd', kind: 'VERIFY', completes_attainable_work: false },
    }));
    append(root, eventDraft('WORKER_DISPATCHED', {
      payload: { dispatch_id: 'd-001abcd', role: 'VERIFY', step_id: 's-001abcd' },
    }));
    append(root, eventDraft('DISPATCH_REJECTED', {
      payload: { dispatch_id: 'd-000002', code: 'DISPATCH_REJECTED' },
    }));
    append(root, eventDraft('WORKER_RESULT_REJECTED', {
      actor: 'proxy',
      payload: { dispatch_id: 'd-000003', code: 'RESULT_REJECTED' },
    }));
    append(root, eventDraft('CHECKPOINT_REDUCED', { payload: { checkpoint_hash: `sha256:${'b'.repeat(64)}` } }));

    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.equal(envelope.tail.event_count, 8);
    // Six ranked keys plus the `other` bucket: bounded regardless of type spread.
    assert.ok(Object.keys(envelope.tail.types).length <= 7, 'histogram grew unbounded');
    assert.ok(bytes <= BUDGETS.RECOVERY_TOTAL);
  });
});

// ------------------------------------------------------- untrustworthy inputs

test('a stored checkpoint whose cursor does not match the journal is rebuilt', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    const checkpoint = checkpointNow(root);
    // A cursor pointing at a hash no event has: I7 says rebuild, not "probably fine".
    //
    // Written with the raw atomic writer rather than writeCheckpoint, because
    // writeCheckpoint now refuses any checkpoint the journal does not derive (I1) —
    // and this state is precisely one no honest writer would produce. It stands in
    // for a tampered or stale-from-another-task file found on disk, so it must be
    // planted at the file layer, the same way the unparseable case below is. The
    // guard is not relaxed to make the test reachable; the test writes past it.
    writeFileAtomic(
      journalPaths(root).checkpointPath,
      `${JSON.stringify({
        ...checkpoint,
        source_cursor: { ...checkpoint.source_cursor, event_hash: `sha256:${'0'.repeat(64)}` },
      }, null, 2)}\n`,
    );

    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.equal(envelope.checkpoint_source, 'rebuilt');
    assert.match(envelope.cursor_note, /unusable/);
    assert.ok(bytes <= BUDGETS.RECOVERY_TOTAL);
  });
});

test('control: the same journal with its real cursor is used as stored, not rebuilt', () => {
  // The only difference from the test above is that the cursor is the real one.
  // Without this, a recovery path that always rebuilt would pass that assertion.
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);

    const { envelope } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.equal(envelope.checkpoint_source, 'stored');
    assert.equal(envelope.cursor_note, null);
  });
});

test('an unparseable checkpoint file does not block recovery', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    // Written past the validating writer on purpose: this is the half-flushed
    // file a crash leaves behind, which no writer would ever produce willingly.
    writeFileSync(journalPaths(root).checkpointPath, '{ this is not json', 'utf8');

    const { envelope } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.equal(envelope.checkpoint_source, 'rebuilt');
  });
});

test('recovery still produces an envelope after a crash residue mid-segment (J01)', () => {
  // The reason B1 was blocking rather than merely ugly: with the journal unreadable
  // even "report BLOCKED and hand off" was unreachable, because every recovery read
  // threw. This asserts the escape hatch itself, not just the parser.
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    appendFileSync(
      path.join(root, 'journal', 'segment-0001.jsonl'),
      '{"actor":"controller","seq":3,"type":"STEP_PLA',
    );
    append(root, eventDraft('STEP_PLANNED', {
      payload: { step_id: 's-001abcd', kind: 'VERIFY', completes_attainable_work: true },
    }));

    const { envelope, bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });
    assert.ok(envelope.next_action, 'recovery must still name a next action');
    assert.ok(bytes <= BUDGETS.RECOVERY_TOTAL);
  });
});

// --------------------------------------------------------------- the boundary

test('the gate accepts an envelope exactly at the budget and rejects one byte less', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);
    append(root, eventDraft('ASSUMPTION_RECORDED', { payload: { assumption_id: 'as-000001' } }));

    // Measure the envelope this journal produces, then drive the gate at exactly
    // that size and at one byte below it. This is what proves the comparison is
    // `<=` and that the limit is actually consulted rather than ignored.
    const { bytes } = buildRecoveryEnvelope(root, { now: FIXED_TIME });

    const atLimit = buildRecoveryEnvelope(root, { now: FIXED_TIME, limitBytes: bytes });
    assert.equal(atLimit.bytes, bytes);
    assert.equal(atLimit.envelope.tail.fidelity, 'rows');

    // One byte tighter: rows no longer fit, so the ladder degrades rather than
    // returning something over budget.
    const below = buildRecoveryEnvelope(root, { now: FIXED_TIME, limitBytes: bytes - 1 });
    assert.ok(below.bytes <= bytes - 1, `degraded envelope is ${below.bytes}, limit was ${bytes - 1}`);
    assert.notEqual(below.envelope.tail.fidelity, 'rows');
    assert.equal(below.envelope.tail.complete, false);
    assert.match(below.envelope.tail.omitted_detail, /not shown/);
  });
});

test('when even the minimum fidelity cannot fit, the gate throws rather than overrun', () => {
  withTask((root) => {
    alignedTaskDrafts().forEach((draft) => append(root, draft));
    checkpointNow(root);

    // A budget no envelope can satisfy stands in for an oversized checkpoint,
    // which the 2 KiB writers make unreachable through normal writes.
    assert.throws(() => buildRecoveryEnvelope(root, { now: FIXED_TIME, limitBytes: 200 }), (error) => {
      assert.ok(error instanceof KernelError);
      assert.equal(error.code, 'INVARIANT_VIOLATED');
      assert.equal(error.details.limit, 200);
      assert.ok(error.details.bytes > 200, 'the error must report the actual overrun');
      assert.ok(error.details.checkpointBytes > 0);
      return true;
    });
  });
});

test('RECOVERY_EVENT_TAIL is the raw-tail cap and RECOVERY_TOTAL the delivered cap', () => {
  // They are different limits on different things; conflating them would make
  // the 16 KiB cap unreachable, since 16 KiB can never fit in 4 KiB.
  assert.ok(BUDGETS.RECOVERY_EVENT_TAIL > BUDGETS.RECOVERY_TOTAL);
});
