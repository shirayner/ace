/**
 * Journal tests (design §7.1, §9.1-§9.4; scenarios J01-J04, C01).
 *
 * The crash cases are exercised by writing the exact on-disk state a crash would
 * leave — a partial trailing line, an orphaned temp file, an event without its
 * checkpoint — rather than by killing processes, so they are deterministic.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import path from 'node:path';

import {
  activeSegment,
  appendEvent,
  cleanStaleTempFiles,
  exceedsSegmentSoftLimit,
  initTaskRoot,
  journalPaths,
  listSegments,
  readAllEvents,
  readCheckpoint,
  readEventsAfter,
  readSeal,
  readSegment,
  readTail,
  rollSegment,
  shouldRollover,
  verifyCursor,
  verifyJournal,
  writeCheckpoint,
  writeFileAtomic,
} from '../lib/journal.mjs';
import { BUDGETS, COUNT_LIMITS, SOFT_LIMITS, utf8Bytes } from '../lib/budgets.mjs';
import { GENESIS_HASH, canonicalHash } from '../lib/canonical.mjs';
import { reduceCheckpoint } from '../lib/reducer.mjs';
import { assertSchema } from '../lib/schema-validator.mjs';
import { getSchema, SCHEMA_IDS } from '../schemas/registry.mjs';
import {
  BudgetExceededError,
  JournalConflictError,
  SchemaValidationError,
  SemanticValidationError,
} from '../lib/errors.mjs';
import {
  alignedTaskDrafts,
  eventDraft,
  makeTaskRoot,
  TASK_ID,
  FIXED_TIME,
} from './fixtures/kernel-fixtures.mjs';

function withTask(run) {
  const task = makeTaskRoot('agv2-journal-');
  try {
    return run(task.root);
  } finally {
    task.dispose();
  }
}

function appendAligned(root) {
  return alignedTaskDrafts().map((draft) => appendEvent(root, draft).event);
}

test('initTaskRoot creates the journal tree and is idempotent', () => {
  withTask((root) => {
    const paths = initTaskRoot(root);
    assert.ok(existsSync(paths.journalDir));
    assert.deepEqual(listSegments(root), []);
    assert.equal(activeSegment(root), 0);
  });
});

test('an empty journal reports a genesis tail', () => {
  withTask((root) => {
    assert.deepEqual(readTail(root), {
      segment: 1,
      seq: 0,
      eventHash: GENESIS_HASH,
      eventCount: 0,
      bytes: 0,
    });
  });
});

test('appended events get sequential seq and a linked hash chain', () => {
  withTask((root) => {
    const [first, second] = appendAligned(root);
    assert.equal(first.seq, 1);
    assert.equal(second.seq, 2);
    assert.equal(first.prev_event_hash, GENESIS_HASH);
    assert.equal(second.prev_event_hash, first.event_hash);
    assert.equal(verifyJournal(root).valid, true);
  });
});

test('the journal is JSONL: one complete canonical event per line', () => {
  withTask((root) => {
    appendAligned(root);
    const content = readFileSync(path.join(root, 'journal', 'segment-0001.jsonl'), 'utf8');
    const lines = content.split('\n');
    assert.equal(lines.at(-1), ''); // always newline-terminated
    assert.equal(lines.length, 3);
    // Canonical form: sorted keys, no whitespace.
    assert.ok(lines[0].startsWith('{"actor":'));
    assert.equal(JSON.parse(lines[0]).seq, 1);
  });
});

test('the controller fills in id, seq, segment, timestamp and hashes', () => {
  withTask((root) => {
    const { event } = appendEvent(root, eventDraft('GOAL_CREATED', {
      payload: { goal_id: 'g-001abcd', goal_summary: 'delta' },
    }));
    assert.match(event.event_id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(event.segment, 1);
    assert.equal(event.seq, 1);
    assert.match(event.occurred_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(event.schema_version, 1);
  });
});

test('a schema-invalid event is refused before it reaches disk', () => {
  withTask((root) => {
    assert.throws(
      () => appendEvent(root, eventDraft('NOT_AN_EVENT_TYPE')),
      SchemaValidationError,
    );
    assert.deepEqual(readAllEvents(root).events, []);
  });
});

test('a semantically invalid event is refused before it reaches disk', () => {
  withTask((root) => {
    // GOAL_CREATED without goal_summary fails the payload completeness check.
    assert.throws(
      () => appendEvent(root, eventDraft('GOAL_CREATED', { payload: { goal_id: 'g-001abcd' } })),
      SemanticValidationError,
    );
    assert.deepEqual(readAllEvents(root).events, []);
  });
});

test('an event over 4 KiB is refused; its payload belongs in an artifact', () => {
  withTask((root) => {
    appendAligned(root);
    assert.throws(
      () =>
        appendEvent(root, eventDraft('STEP_PLANNED', {
          payload: { step_id: 's-001abcd', kind: 'ACT', note: 'x'.repeat(BUDGETS.JOURNAL_EVENT) },
        })),
      (error) => {
        assert.ok(error instanceof BudgetExceededError);
        assert.equal(error.details.budget, 'JOURNAL_EVENT');
        return true;
      },
    );
    assert.equal(readAllEvents(root).events.length, 2);
  });
});

test('optimistic concurrency rejects an append built on a stale tail (J04)', () => {
  withTask((root) => {
    const [first] = appendAligned(root);

    // A second writer that read the tail at seq 1 now finds seq 2 on disk.
    assert.throws(
      () =>
        appendEvent(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }), {
          expectedSeq: first.seq,
          expectedEventHash: first.event_hash,
        }),
      (error) => {
        assert.ok(error instanceof JournalConflictError);
        assert.equal(error.details.expectedSeq, 1);
        assert.equal(error.details.actualSeq, 2);
        return true;
      },
    );

    // Re-reading the cursor lets the same writer succeed.
    const tail = readTail(root);
    const { event } = appendEvent(
      root,
      eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }),
      { expectedSeq: tail.seq, expectedEventHash: tail.eventHash },
    );
    assert.equal(event.seq, 3);
  });
});

test('only one of two writers claiming the same seq wins (J04)', () => {
  withTask((root) => {
    appendAligned(root);
    const tail = readTail(root);

    const draft = eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } });
    const first = appendEvent(root, draft, { expectedSeq: tail.seq, expectedEventHash: tail.eventHash });
    assert.equal(first.event.seq, 3);

    assert.throws(
      () => appendEvent(root, draft, { expectedSeq: tail.seq, expectedEventHash: tail.eventHash }),
      JournalConflictError,
    );
    assert.equal(readAllEvents(root).events.length, 3);
    assert.equal(verifyJournal(root).valid, true);
  });
});

test('a repeated idempotency key returns the original event, not a duplicate', () => {
  withTask((root) => {
    appendAligned(root);
    const draft = eventDraft('EFFECT_INTENDED', {
      idempotency_key: 'eff:goal-fixture01:rename:ABC1234',
      payload: { action_kind: 'rename', target_set: ['a.txt'], approval_ref: 'ap-001abcd' },
    });

    const first = appendEvent(root, draft);
    assert.equal(first.deduplicated, false);

    const replay = appendEvent(root, draft);
    assert.equal(replay.deduplicated, true);
    assert.equal(replay.event.seq, first.event.seq);
    assert.equal(replay.event.event_id, first.event.event_id);
    assert.equal(readAllEvents(root).events.length, 3);
  });
});

test('a partial trailing line is dropped and reported, not treated as corruption (J01)', () => {
  withTask((root) => {
    appendAligned(root);
    const segmentFile = path.join(root, 'journal', 'segment-0001.jsonl');

    // A crash mid-append leaves a line without its newline.
    appendFileSync(segmentFile, '{"actor":"controller","seq":3,"type":"STEP_PLA');

    const result = readSegment(root, 1);
    assert.equal(result.droppedPartialLine, true);
    assert.equal(result.events.length, 2);
    // The intact prefix still verifies, so recovery can continue from it.
    assert.equal(verifyJournal(root).valid, true);
    assert.equal(verifyJournal(root).droppedPartialLine, true);
  });
});

test('a crash residue that is no longer the last line still leaves a readable journal (J01)', () => {
  withTask((root) => {
    appendAligned(root);
    const segmentFile = path.join(root, 'journal', 'segment-0001.jsonl');
    appendFileSync(segmentFile, '{"actor":"controller","seq":3,"type":"STEP_PLA');

    // The control loop keeps going; this must not corrupt the journal. Before the
    // fix the append fused itself onto the residue and every later read threw.
    appendEvent(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }));

    // The three read paths recovery depends on must all still work.
    const all = readAllEvents(root);
    assert.equal(all.events.length, 3, 'the intact events must remain readable');
    assert.deepEqual(all.droppedResidueLines, [{ segment: 1, line: 3 }]);
    assert.doesNotThrow(() => readTail(root));
    assert.doesNotThrow(() => verifyJournal(root));
    assert.equal(verifyJournal(root).valid, true);

    // And the new event must be a line of its own, not fused onto the residue.
    const lines = readFileSync(segmentFile, 'utf8').split('\n').filter((line) => line !== '');
    assert.equal(lines.length, 4);
    assert.equal(lines[2], '{"actor":"controller","seq":3,"type":"STEP_PLA');
    assert.equal(JSON.parse(lines[3]).seq, 3);
  });
});

test('an append after a torn write reports the tail it actually wrote, not an error (J01)', () => {
  // The failure this pins is subtler than corruption: the old code wrote the bytes
  // and then threw from the re-read, so the caller believed the append had failed
  // while it had in fact succeeded. Nothing downstream can recover from that.
  withTask((root) => {
    appendAligned(root);
    appendFileSync(path.join(root, 'journal', 'segment-0001.jsonl'), '{"actor":"controller","seq":3,"typ');

    const result = appendEvent(root, eventDraft('STEP_PLANNED', {
      payload: { step_id: 's-001abcd', kind: 'ACT' },
    }));
    assert.equal(result.event.seq, 3);
    assert.equal(result.tail.seq, 3);
    assert.equal(result.tail.eventHash, result.event.event_hash);
    // The reported byte count is the file's real size, residue and repair included.
    assert.equal(result.tail.bytes, statSync(path.join(root, 'journal', 'segment-0001.jsonl')).size);
    // The derived tail must agree with a fresh read in every field. Deriving it is
    // what stops a failed re-read from being reported as a failed append, but a
    // derived value that drifts from the file would be its own defect.
    assert.deepEqual(result.tail, readTail(root));
  });
});

test('control: an append onto an intact segment adds no newline and reads back identically', () => {
  // Without this the newline repair could fire unconditionally, inserting a blank
  // line into every healthy segment, and the residue tests would not notice.
  withTask((root) => {
    appendAligned(root);
    const before = readFileSync(path.join(root, 'journal', 'segment-0001.jsonl'), 'utf8');

    const result = appendEvent(root, eventDraft('STEP_PLANNED', {
      payload: { step_id: 's-001abcd', kind: 'ACT' },
    }));
    const after = readFileSync(path.join(root, 'journal', 'segment-0001.jsonl'), 'utf8');

    assert.ok(after.startsWith(before), 'an intact segment must be extended, not rewritten');
    assert.equal(after.slice(before.length).startsWith('\n'), false, 'no newline was needed');
    assert.deepEqual(readAllEvents(root).droppedResidueLines, []);
    assert.equal(readAllEvents(root).events.length, 3);
    assert.equal(result.tail.bytes, after.length);
    assert.equal(verifyJournal(root).valid, true);
  });
});

test('a mid-file line the chain does not heal over is still an explicit error', () => {
  // The tolerance is narrow on purpose: it applies only when the surrounding
  // events link hash-to-hash, which proves nothing real was lost at that spot.
  // Here a whole event is replaced by garbage, so the next event links to a hash
  // no surviving event has — that is a lost event, and dropping it silently would
  // turn data loss into a journal that looks clean.
  withTask((root) => {
    appendAligned(root);
    appendEvent(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }));

    const segmentFile = path.join(root, 'journal', 'segment-0001.jsonl');
    const [first, , third] = readFileSync(segmentFile, 'utf8').split('\n');
    writeFileSync(segmentFile, `${first}\ngarbage instead of event 2\n${third}\n`, 'utf8');

    assert.throws(() => readSegment(root, 1), /line 2 is not valid JSON/);
  });
});

test('a bad first line is an error too: the chain link is checked against the seal', () => {
  // The dangerous shortcut here is to skip the link check when there is no local
  // predecessor. That would make an unparseable first line always look like
  // residue, which is exactly how a lost first event would present.
  withTask((root) => {
    appendAligned(root);
    const segmentFile = path.join(root, 'journal', 'segment-0001.jsonl');
    const [, second] = readFileSync(segmentFile, 'utf8').split('\n');
    writeFileSync(segmentFile, `garbage instead of event 1\n${second}\n`, 'utf8');

    assert.throws(() => readSegment(root, 1), /line 1 is not valid JSON/);
  });
});

test('residue as a segment’s first line is tolerated when the seal proves the link', () => {
  // Control for the test above: the same position, but the surviving event does
  // chain from the sealed predecessor, so nothing was lost and the read succeeds.
  withTask((root) => {
    appendAligned(root);
    rollSegment(root, { taskId: TASK_ID, scopeVersion: 1 });
    const secondSegment = path.join(root, 'journal', 'segment-0002.jsonl');
    const rolled = readFileSync(secondSegment, 'utf8');
    writeFileSync(secondSegment, `torn write residue\n${rolled}`, 'utf8');

    const result = readSegment(root, 2);
    assert.deepEqual(result.droppedResidueLines, [1]);
    assert.equal(result.events.length, 1);
    assert.equal(verifyJournal(root).valid, true);
  });
});

test('appendEvent never reports failure over bytes it wrote, nor success over none', () => {
  // The original B1 broke exactly this: the line landed on disk and then the
  // post-write re-read threw, so the caller was told the append had failed. The
  // property is the ordering one — every validation happens before the write, and
  // the returned tail is derived from what was written rather than re-read.
  withTask((root) => {
    appendAligned(root);
    const segmentFile = path.join(root, 'journal', 'segment-0001.jsonl');
    // A chain-breaking corruption: the read the append starts with must refuse it,
    // and refusing must mean not one byte moved.
    const [first] = readFileSync(segmentFile, 'utf8').split('\n');
    writeFileSync(segmentFile, `${first}\nan event lost to garbage\n`, 'utf8');
    const bytesBefore = statSync(segmentFile).size;

    assert.throws(() => appendEvent(root, eventDraft('STEP_PLANNED', {
      payload: { step_id: 's-001abcd', kind: 'ACT' },
    })), /not valid JSON/);
    assert.equal(statSync(segmentFile).size, bytesBefore, 'a rejected append must write nothing');
  });
});

test('residue that happens to be valid JSON is still residue, not an event (J01)', () => {
  // A torn write can stop at a syntactically complete point. Parsing alone would
  // then admit a record with no seq and no hashes into the chain, and verifyJournal
  // would report the journal broken over debris rather than over a real problem.
  withTask((root) => {
    appendAligned(root);
    appendFileSync(path.join(root, 'journal', 'segment-0001.jsonl'), '{"actor":"controller"}');
    appendEvent(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }));

    const all = readAllEvents(root);
    assert.equal(all.events.length, 3, 'the JSON-shaped residue must not count as an event');
    assert.deepEqual(all.droppedResidueLines, [{ segment: 1, line: 3 }]);
    assert.equal(verifyJournal(root).valid, true);
    const tail = readTail(root);
    assert.equal(tail.seq, 3);
    assert.equal(tail.eventCount, 3);
  });
});

test('residue next to a tampered event is diagnosed by verifyJournal, not by a throw', () => {
  // readSegment answers "is this a record or debris"; whether a record's own hash
  // holds is verifyChain's question. Conflating them would replace a precise
  // "event_hash mismatch at index N" with an opaque parse error, and would make the
  // journal unreadable again for a state recovery is supposed to be able to report.
  withTask((root) => {
    appendAligned(root);
    const segmentFile = path.join(root, 'journal', 'segment-0001.jsonl');
    const [first, second] = readFileSync(segmentFile, 'utf8').split('\n');
    const tampered = JSON.parse(second);
    tampered.actor = 'attacker';
    writeFileSync(segmentFile, `${first}\ntorn write residue\n${JSON.stringify(tampered)}\n`, 'utf8');

    const result = readSegment(root, 1);
    assert.deepEqual(result.droppedResidueLines, [2]);
    const verified = verifyJournal(root);
    assert.equal(verified.valid, false, 'tampering must still be reported');
    assert.match(verified.reason, /event_hash mismatch/);
  });
});

test('a corrupt complete line is an explicit error, not a silent skip', () => {
  withTask((root) => {
    appendAligned(root);
    appendFileSync(path.join(root, 'journal', 'segment-0001.jsonl'), 'not json at all\n');
    assert.throws(() => readSegment(root, 1), /line 3 is not valid JSON/);
  });
});

test('rollover triggers are the byte and event count limits (J03)', () => {
  assert.equal(shouldRollover({ bytes: BUDGETS.JOURNAL_SEGMENT - 1, eventCount: 1 }), false);
  assert.equal(shouldRollover({ bytes: BUDGETS.JOURNAL_SEGMENT, eventCount: 1 }), true);
  assert.equal(shouldRollover({ bytes: 0, eventCount: COUNT_LIMITS.JOURNAL_SEGMENT_EVENTS }), true);
  assert.equal(exceedsSegmentSoftLimit({ bytes: SOFT_LIMITS.JOURNAL_SEGMENT }), true);
  assert.equal(exceedsSegmentSoftLimit({ bytes: SOFT_LIMITS.JOURNAL_SEGMENT - 1 }), false);
});

test('rollSegment seals the segment and continues the chain across it (J03)', () => {
  withTask((root) => {
    const events = appendAligned(root);
    const lastBefore = events.at(-1);

    const { seal, newSegment, rolledEvent } = rollSegment(root, {
      taskId: TASK_ID,
      scopeVersion: 1,
      checkpointHash: `sha256:${'c'.repeat(64)}`,
    });

    assert.equal(seal.segment, 1);
    assert.equal(seal.last_seq, lastBefore.seq);
    assert.equal(seal.last_event_hash, lastBefore.event_hash);
    assert.equal(seal.next_segment, 2);
    assert.equal(newSegment, 2);

    // The first event of the new segment references the seal and links the chain.
    assert.equal(rolledEvent.type, 'SEGMENT_ROLLED');
    assert.equal(rolledEvent.segment, 2);
    assert.equal(rolledEvent.seq, lastBefore.seq + 1);
    assert.equal(rolledEvent.prev_event_hash, lastBefore.event_hash);
    assert.equal(rolledEvent.payload.seal_hash, canonicalHash(seal));

    assert.deepEqual(listSegments(root), [1, 2]);
    assert.equal(verifyJournal(root).valid, true);
    assert.deepEqual(readSeal(root, 1).last_seq, seal.last_seq);
    assert.equal(readSeal(root, 2), null);
  });
});

test('appends continue in the new segment after a roll', () => {
  withTask((root) => {
    appendAligned(root);
    rollSegment(root, { taskId: TASK_ID, scopeVersion: 1 });

    const { event } = appendEvent(root, eventDraft('STEP_PLANNED', {
      payload: { step_id: 's-001abcd', kind: 'ACT' },
    }));
    assert.equal(event.segment, 2);
    assert.equal(event.seq, 4);
    assert.equal(verifyJournal(root).valid, true);
    assert.equal(readAllEvents(root).events.length, 4);
  });
});

test('an empty journal cannot be rolled', () => {
  withTask((root) => {
    assert.throws(() => rollSegment(root, { taskId: TASK_ID, scopeVersion: 1 }), JournalConflictError);
  });
});

test('a tail read on a freshly rolled empty segment continues from the seal', () => {
  withTask((root) => {
    const events = appendAligned(root);
    // Simulate a crash between writing the seal and appending SEGMENT_ROLLED.
    const seal = {
      schema_version: 1,
      task_id: TASK_ID,
      segment: 1,
      last_seq: events.at(-1).seq,
      last_event_hash: events.at(-1).event_hash,
      event_count: 2,
      bytes: 100,
      checkpoint_hash: null,
      next_segment: 2,
      sealed_at: FIXED_TIME,
    };
    writeFileAtomic(path.join(root, 'journal', 'segment-0001.seal.json'), JSON.stringify(seal));
    writeFileSync(path.join(root, 'journal', 'segment-0002.jsonl'), '');

    const tail = readTail(root);
    assert.equal(tail.segment, 2);
    assert.equal(tail.seq, events.at(-1).seq);
    assert.equal(tail.eventHash, events.at(-1).event_hash);
  });
});

test('a checkpoint is written atomically and read back', () => {
  withTask((root) => {
    appendAligned(root);
    // Built by the reducer, because that is now the only source of a persistable
    // checkpoint: writeCheckpoint refuses documents the journal does not derive.
    const { checkpoint } = reduceCheckpoint(readAllEvents(root).events, { now: FIXED_TIME });

    const written = writeCheckpoint(root, checkpoint);
    assert.ok(written.bytes < BUDGETS.CHECKPOINT);
    assert.deepEqual(readCheckpoint(root), checkpoint);
    // No temp file survives a successful atomic write.
    assert.deepEqual(cleanStaleTempFiles(root), []);
  });
});

test('writeCheckpoint refuses a checkpoint the journal does not derive (I1, G5)', () => {
  withTask((root) => {
    appendEvent(root, eventDraft('GOAL_CREATED', {
      payload: { goal_id: 'g-001abcd', goal_summary: 'one event only' },
    }));
    // The cursor is copied from the real tail, so verifyCursor reports valid. That
    // is the point: a real cursor is no evidence at all for the other fields.
    const tail = readTail(root);
    const forged = {
      schema_version: 1,
      task_id: TASK_ID,
      source_cursor: { segment: tail.segment, seq: tail.seq, event_hash: tail.eventHash },
      phase: 'TERMINAL',
      outcome: { status: 'DONE', reason: null },
      scope_version: 1,
      goal_summary: 'one event only',
      ledger_counts: { satisfied: 9, violated: 0, untested: 0, untestable: 0, moot: 0 },
      active_step: null,
      next_action: null,
      pending_interruption: null,
      residual_count: 0,
      latest_manifest: null,
      updated_at: FIXED_TIME,
    };

    assert.throws(() => writeCheckpoint(root, forged), (error) => {
      assert.equal(error.code, 'INVARIANT_VIOLATED');
      return true;
    });
    assert.equal(readCheckpoint(root), null, 'a rejected checkpoint must leave no file');
  });
});

test('control: writeCheckpoint accepts exactly what reduceCheckpoint produced', () => {
  // Without this control, a writeCheckpoint that rejected everything would pass
  // the assertion above and the forgery test would prove nothing.
  withTask((root) => {
    appendAligned(root);
    const { checkpoint } = reduceCheckpoint(readAllEvents(root).events, { now: FIXED_TIME });
    assert.doesNotThrow(() => writeCheckpoint(root, checkpoint));
    assert.deepEqual(readCheckpoint(root), checkpoint);
  });
});

test('a checkpoint whose ledger_counts were inflated is refused, not only its outcome (I1)', () => {
  // The forgery does not have to touch `outcome` to mislead: ledger_counts is
  // what the Agent reads to decide whether anything is left to verify. A gate
  // that only compared the verdict would let this through.
  withTask((root) => {
    appendAligned(root);
    const { checkpoint } = reduceCheckpoint(readAllEvents(root).events, { now: FIXED_TIME });
    const inflated = {
      ...checkpoint,
      ledger_counts: { ...checkpoint.ledger_counts, satisfied: checkpoint.ledger_counts.satisfied + 7 },
    };

    assert.throws(() => writeCheckpoint(root, inflated), (error) => {
      assert.equal(error.code, 'INVARIANT_VIOLATED');
      assert.deepEqual(error.details.divergingFields, ['ledger_counts']);
      return true;
    });
    assert.equal(readCheckpoint(root), null);
  });
});

test('a checkpoint for an empty journal has nothing to derive from and is refused', () => {
  withTask((root) => {
    const forged = {
      schema_version: 1,
      task_id: TASK_ID,
      source_cursor: { segment: 1, seq: 1, event_hash: `sha256:${'a'.repeat(64)}` },
      phase: 'PLANNING',
      outcome: null,
      scope_version: 1,
      goal_summary: 'a journal that does not exist',
      ledger_counts: { satisfied: 0, violated: 0, untested: 0, untestable: 0, moot: 0 },
      active_step: null,
      next_action: { kind: 'PLAN', target: 'next_step', ref: null },
      pending_interruption: null,
      residual_count: 0,
      latest_manifest: null,
      updated_at: FIXED_TIME,
    };

    assert.throws(() => writeCheckpoint(root, forged), (error) => {
      assert.equal(error.code, 'INVARIANT_VIOLATED');
      assert.match(error.message, /cannot be derived/);
      return true;
    });
  });
});

/**
 * C01 has two layers, and they are worth separating.
 *
 * Layer 1: every checkpoint field is individually bounded, so the widest legal
 * document cannot reach 2 KiB. That is the real guarantee — the limit holds by
 * construction rather than by a check that happens to run.
 *
 * Layer 2: the writer still measures bytes as a backstop, in case a future field
 * widens the document. That gate is exercised directly in kernel-budgets.test.mjs;
 * here we pin the headroom that makes it unreachable today.
 */
test('the widest schema-legal checkpoint stays under the 2 KiB limit (C01)', () => {
  const widest = {
    schema_version: 1,
    task_id: `goal-${'t'.repeat(59)}`, // 64 chars, the schema maximum
    source_cursor: { segment: 9999, seq: 999999, event_hash: `sha256:${'a'.repeat(64)}` },
    phase: 'NEEDS_INPUT',
    outcome: null,
    scope_version: 999,
    goal_summary: '目'.repeat(80), // exactly 240 bytes
    ledger_counts: { satisfied: 999, violated: 999, untested: 999, untestable: 999, moot: 999 },
    active_step: { step_id: `s-${'a'.repeat(61)}`, kind: 'SUMMARIZE', status: 'awaiting_verification' },
    next_action: { kind: 'DERIVE_OUTCOME', target: '目'.repeat(21), ref: '目'.repeat(21) },
    pending_interruption: {
      code: 'APPROVAL_REQUIRED',
      resume_token: 'r'.repeat(64),
      required_from: 'decider',
    },
    residual_count: 999,
    latest_manifest: `manifests/${'m'.repeat(245)}`, // 256 chars, the schema maximum
    updated_at: FIXED_TIME,
  };

  // Measured, not written: the widest document is by construction not derivable
  // from any journal, and layer 1 is a claim about size alone. The serialization
  // is the one writeCheckpoint uses, so the number is the number it would gate on.
  assertSchema(widest, getSchema(SCHEMA_IDS.CHECKPOINT));
  const bytes = utf8Bytes(`${JSON.stringify(widest, null, 2)}\n`);
  assert.ok(
    bytes < BUDGETS.CHECKPOINT,
    `widest legal checkpoint is ${bytes} bytes, which must stay under ${BUDGETS.CHECKPOINT}`,
  );
});

test('a checkpoint field beyond its bound fails validation, never truncation (C01)', () => {
  withTask((root) => {
    const checkpoint = {
      schema_version: 1,
      task_id: TASK_ID,
      source_cursor: { segment: 1, seq: 1, event_hash: `sha256:${'a'.repeat(64)}` },
      phase: 'PLANNING',
      outcome: null,
      scope_version: 1,
      goal_summary: '目'.repeat(81), // 243 bytes, one character over
      ledger_counts: { satisfied: 0, violated: 0, untested: 0, untestable: 0 },
      active_step: null,
      next_action: { kind: 'PLAN', target: 'next_step' },
      pending_interruption: null,
      residual_count: 0,
      latest_manifest: null,
      updated_at: FIXED_TIME,
    };

    assert.throws(
      () => writeCheckpoint(root, checkpoint),
      (error) => {
        assert.ok(error instanceof SchemaValidationError);
        assert.ok(error.violations.some((entry) => entry.rule === 'maxBytes'));
        return true;
      },
    );
    // Nothing was written; a rejected checkpoint leaves no partial file.
    assert.equal(readCheckpoint(root), null);
  });
});

test('a corrupt checkpoint reads as null so recovery rebuilds from the journal (J02)', () => {
  withTask((root) => {
    const { checkpointPath } = journalPaths(root);
    writeFileSync(checkpointPath, '{ "task_id": "goal-fix');
    assert.equal(readCheckpoint(root), null);
  });
});

test('an orphaned temp file is ignored and cleanable (J02)', () => {
  withTask((root) => {
    mkdirSync(path.join(root, 'journal'), { recursive: true });
    const orphan = path.join(root, 'checkpoint.json.tmp-999-123');
    writeFileSync(orphan, '{ half');
    assert.equal(readCheckpoint(root), null);

    const removed = cleanStaleTempFiles(root);
    assert.deepEqual(removed, [orphan]);
    assert.equal(existsSync(orphan), false);
  });
});

test('an event appended without its checkpoint leaves a replayable journal (J01)', () => {
  withTask((root) => {
    appendAligned(root);
    // No checkpoint was ever written; the journal alone must be sufficient.
    assert.equal(readCheckpoint(root), null);
    const { events } = readAllEvents(root);
    assert.equal(events.length, 2);
    assert.equal(verifyJournal(root).valid, true);
  });
});

test('verifyCursor accepts a real cursor and rejects a forged one (I7)', () => {
  withTask((root) => {
    const events = appendAligned(root);
    const last = events.at(-1);

    assert.deepEqual(verifyCursor(root, { segment: 1, seq: last.seq, event_hash: last.event_hash }), {
      valid: true,
      reason: null,
    });

    assert.equal(
      verifyCursor(root, { segment: 1, seq: last.seq, event_hash: `sha256:${'9'.repeat(64)}` }).valid,
      false,
    );
    assert.equal(verifyCursor(root, { segment: 1, seq: 99, event_hash: last.event_hash }).valid, false);
    assert.equal(
      verifyCursor(root, { segment: 7, seq: last.seq, event_hash: last.event_hash }).valid,
      false,
    );
  });
});

test('readEventsAfter returns only the tail past the cursor', () => {
  withTask((root) => {
    const events = appendAligned(root);
    const first = events[0];

    const after = readEventsAfter(root, { segment: 1, seq: first.seq, event_hash: first.event_hash });
    assert.equal(after.reason, null);
    assert.equal(after.events.length, 1);
    assert.equal(after.events[0].seq, 2);

    const last = events.at(-1);
    const none = readEventsAfter(root, { segment: 1, seq: last.seq, event_hash: last.event_hash });
    assert.deepEqual(none.events, []);

    const missing = readEventsAfter(root, { segment: 1, seq: 1, event_hash: `sha256:${'0'.repeat(64)}` });
    assert.equal(missing.events, null);
    assert.match(missing.reason, /cursor not found/);
  });
});

test('readAllEvents concatenates segments in order', () => {
  withTask((root) => {
    appendAligned(root);
    rollSegment(root, { taskId: TASK_ID, scopeVersion: 1 });
    appendEvent(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }));

    const { events } = readAllEvents(root);
    assert.deepEqual(events.map((event) => event.seq), [1, 2, 3, 4]);
    assert.deepEqual(events.map((event) => event.segment), [1, 1, 2, 2]);
  });
});
