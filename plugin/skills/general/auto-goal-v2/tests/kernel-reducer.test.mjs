/**
 * Checkpoint reducer tests (design §7.2, §9.5; scenarios J01, I8, I1).
 *
 * The checkpoint is a projection, so these tests drive it from real journals and
 * assert three things: it stays under 2 KiB, it always names exactly one next
 * action, and it cannot record an outcome the ledger does not support.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appendEvent, readAllEvents, readTail, rollSegment } from '../lib/journal.mjs';
import { deriveNextAction, projectState, reduceCheckpoint } from '../lib/reducer.mjs';
import { BUDGETS } from '../lib/budgets.mjs';
import { ReducerError } from '../lib/errors.mjs';
import { NON_TERMINAL_PHASES } from '../lib/vocabulary.mjs';
import {
  alignedTaskDrafts,
  eventDraft,
  makeTaskRoot,
  sealChain,
  TASK_ID,
  FIXED_TIME,
} from './fixtures/kernel-fixtures.mjs';

function withTask(run) {
  const task = makeTaskRoot('agv2-reducer-');
  try {
    return run(task.root);
  } finally {
    task.dispose();
  }
}

function append(root, draft) {
  return appendEvent(root, draft).event;
}

function appendAll(root, drafts) {
  return drafts.map((draft) => append(root, draft));
}

function reduce(root) {
  return reduceCheckpoint(readAllEvents(root).events, { now: FIXED_TIME });
}

/**
 * A task aligned, planned, dispatched, verified and evidenced into DONE shape.
 *
 * `truncated` is the one knob because it is the only difference between evidence
 * that earns DONE and evidence that must not: flipping it leaves a journal the
 * write path still accepts in full, so what changes is the reducer's verdict and
 * nothing else.
 */
function driveToSatisfied(root, { truncated = false } = {}) {
  appendAll(root, alignedTaskDrafts());
  append(root, eventDraft('CRITERION_DEFINED', {
    payload: {
      criterion_id: 'c-001abcd',
      type: 'STATE',
      statement: 'The 3 rows exist in the destination table',
      required_rung: 'E2',
      max_rung: 'E4',
    },
  }));
  append(root, eventDraft('STEP_PLANNED', {
    payload: { step_id: 's-001abcd', kind: 'VERIFY', completes_attainable_work: true },
  }));
  append(root, eventDraft('WORKER_DISPATCHED', {
    payload: { dispatch_id: 'd-001abcd', role: 'VERIFY', step_id: 's-001abcd' },
  }));
  append(root, eventDraft('ARTIFACT_REGISTERED', {
    actor: 'proxy',
    payload: {
      artifact_id: 'a-001abcd',
      kind: 'evidence',
      sha256: 'a'.repeat(64),
      truncated,
      manifest_path: 'manifests/manifest-6.json',
    },
  }));
  append(root, eventDraft('WORKER_RESULT_ACCEPTED', {
    actor: 'proxy',
    payload: { dispatch_id: 'd-001abcd' },
  }));
  append(root, eventDraft('EVIDENCE_RECORDED', {
    actor: 'proxy',
    payload: { criterion_id: 'c-001abcd', rung: 'E2' },
    artifact_refs: ['a-001abcd'],
  }));
  append(root, eventDraft('CRITERION_UPDATED', {
    payload: { criterion_id: 'c-001abcd', state: 'SATISFIED', achieved_rung: 'E2' },
  }));
}

test('an empty journal cannot be reduced', () => {
  assert.throws(() => reduceCheckpoint([]), ReducerError);
});

test('a journal without GOAL_CREATED cannot be reduced', () => {
  withTask((root) => {
    // A journal whose first event is not GOAL_CREATED has no goal_summary.
    append(root, eventDraft('MANDATE_ASSESSED', { payload: { residual: [] } }));
    assert.throws(() => reduce(root), /no GOAL_CREATED event/);
  });
});

test('GOAL_CREATED alone puts the task in ALIGNING awaiting alignment', () => {
  withTask((root) => {
    append(root, eventDraft('GOAL_CREATED', {
      payload: { goal_id: 'g-001abcd', goal_summary: 'Ops no longer key in 20k rows daily' },
    }));
    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.phase, 'ALIGNING');
    assert.deepEqual(checkpoint.next_action, { kind: 'ALIGN', target: 'goal', ref: null });
    assert.equal(checkpoint.outcome, null);
    assert.equal(checkpoint.scope_version, 1);
  });
});

test('GOAL_ALIGNED moves to PLANNING with a single PLAN action', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.phase, 'PLANNING');
    assert.deepEqual(checkpoint.next_action, { kind: 'PLAN', target: 'next_step', ref: null });
  });
});

test('the cursor points at the last event and verifies against the journal (I7)', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    const tail = readTail(root);
    const { checkpoint } = reduce(root);
    assert.deepEqual(checkpoint.source_cursor, {
      segment: 1,
      seq: tail.seq,
      event_hash: tail.eventHash,
    });
  });
});

test('the cursor tracks the segment after a rollover', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    rollSegment(root, { taskId: TASK_ID, scopeVersion: 1 });
    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.source_cursor.segment, 2);
    assert.equal(checkpoint.source_cursor.seq, 3);
  });
});

test('every non-terminal checkpoint names exactly one next action (I8)', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    const stages = [
      eventDraft('CRITERION_DEFINED', {
        payload: { criterion_id: 'c-001abcd', type: 'STATE', required_rung: 'E2', max_rung: 'E4' },
      }),
      eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }),
      eventDraft('WORKER_DISPATCHED', { payload: { dispatch_id: 'd-001abcd', role: 'ACT' } }),
      eventDraft('WORKER_RESULT_ACCEPTED', { actor: 'proxy', payload: { dispatch_id: 'd-001abcd' } }),
    ];

    for (const draft of stages) {
      append(root, draft);
      const { checkpoint } = reduce(root);
      assert.notEqual(checkpoint.phase, 'TERMINAL');
      assert.ok(checkpoint.next_action, `phase ${checkpoint.phase} lost its next_action`);
      assert.equal(typeof checkpoint.next_action.kind, 'string');
    }
  });
});

test('an open dispatch waits for its result rather than planning again', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }));
    append(root, eventDraft('WORKER_DISPATCHED', {
      payload: { dispatch_id: 'd-001abcd', role: 'ACT' },
    }));

    const { checkpoint } = reduce(root);
    assert.deepEqual(checkpoint.next_action, {
      kind: 'REDUCE',
      target: 'await_result',
      ref: 'd-001abcd',
    });
    assert.equal(checkpoint.active_step.status, 'dispatched');
  });
});

test('a planned step is dispatched next, naming the step', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'VERIFY' } }));
    const { checkpoint } = reduce(root);
    assert.deepEqual(checkpoint.next_action, {
      kind: 'DISPATCH',
      target: 'verify',
      ref: 's-001abcd',
    });
  });
});

test('an accepted result moves to VERIFYING and then to outcome derivation', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'VERIFY' } }));
    append(root, eventDraft('WORKER_DISPATCHED', {
      payload: { dispatch_id: 'd-001abcd', role: 'VERIFY' },
    }));
    append(root, eventDraft('WORKER_RESULT_ACCEPTED', {
      actor: 'proxy',
      payload: { dispatch_id: 'd-001abcd' },
    }));

    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.phase, 'VERIFYING');
    assert.deepEqual(checkpoint.next_action, {
      kind: 'DERIVE_OUTCOME',
      target: 'ledger',
      ref: 's-001abcd',
    });
  });
});

test('an open interruption becomes the sole next action with its resume token', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('INPUT_REQUESTED', {
      payload: { code: 'APPROVAL_REQUIRED', resume_token: 'rt-001abc', required_from: 'decider' },
    }));

    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.phase, 'NEEDS_INPUT');
    assert.deepEqual(checkpoint.next_action, {
      kind: 'ASK_USER',
      target: 'decider',
      ref: 'rt-001abc',
    });
    assert.deepEqual(checkpoint.pending_interruption, {
      code: 'APPROVAL_REQUIRED',
      resume_token: 'rt-001abc',
      required_from: 'decider',
    });
  });
});

test('an answered interruption resumes the same plan (O05)', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('INPUT_REQUESTED', {
      payload: { code: 'APPROVAL_REQUIRED', resume_token: 'rt-001abc', required_from: 'decider' },
    }));
    append(root, eventDraft('INPUT_RECEIVED', {
      actor: 'user',
      payload: { resume_token: 'rt-001abc', resume_phase: 'EXECUTING', answer: 'approve' },
    }));

    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.pending_interruption, null);
    assert.equal(checkpoint.phase, 'EXECUTING');
    assert.notEqual(checkpoint.next_action.kind, 'ASK_USER');
  });
});

test('a dangling effect intent must be observed before anything else (I6, E03)', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }));
    const intent = append(root, eventDraft('EFFECT_INTENDED', {
      idempotency_key: 'eff:goal-fixture01:rename:ABC1234',
      payload: {
        action_kind: 'rename',
        target_set: ['a.txt', 'b.txt'],
        approval_ref: 'ap-001abcd',
      },
    }));

    // Recovery must query the world, not replay the side effect.
    const { checkpoint } = reduce(root);
    assert.deepEqual(checkpoint.next_action, {
      kind: 'DISPATCH',
      target: 'verify',
      ref: intent.event_id,
    });

    append(root, eventDraft('EFFECT_OBSERVED', {
      payload: { intent_event_id: intent.event_id, rung: 'E2', observed: '2 of 2 renamed' },
    }));
    const after = reduce(root);
    assert.notEqual(after.checkpoint.next_action.ref, intent.event_id);
  });
});

test('a dangling effect outranks an open interruption', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('EFFECT_INTENDED', {
      idempotency_key: 'eff:goal-fixture01:send:ABC1234',
      payload: { action_kind: 'send', target_set: ['landlord@example.com'], approval_ref: 'ap-001abcd' },
    }));
    append(root, eventDraft('INPUT_REQUESTED', {
      payload: { code: 'DECISION_REQUIRED', resume_token: 'rt-001abc', required_from: 'decider' },
    }));

    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.next_action.kind, 'DISPATCH');
    assert.equal(checkpoint.next_action.target, 'verify');
  });
});

test('the ledger counts are projected into the checkpoint', () => {
  withTask((root) => {
    driveToSatisfied(root);
    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.ledger_counts.satisfied, 1);
    assert.equal(checkpoint.ledger_counts.untested, 0);
    assert.equal(checkpoint.ledger_counts.violated, 0);
  });
});

test('the latest manifest pointer is carried, not the artifact content', () => {
  withTask((root) => {
    driveToSatisfied(root);
    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.latest_manifest, 'manifests/manifest-6.json');
    // The checkpoint holds pointers only; no artifact body may appear in it.
    assert.ok(!JSON.stringify(checkpoint).includes('a'.repeat(64)));
  });
});

test('a terminal journal derives its outcome from the ledger (O01, I1)', () => {
  withTask((root) => {
    driveToSatisfied(root);
    append(root, eventDraft('GOAL_TERMINATED', {
      payload: { status: 'DONE', reason: null, residual: [] },
    }));

    const { checkpoint, outcome } = reduce(root);
    assert.equal(checkpoint.phase, 'TERMINAL');
    assert.deepEqual(checkpoint.outcome, { status: 'DONE', reason: null });
    assert.equal(checkpoint.next_action, null);
    assert.equal(outcome.status, 'DONE');
  });
});

test('a sealed status the ledger does not support is a reducer failure (I1)', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('CRITERION_DEFINED', {
      payload: { criterion_id: 'c-001abcd', type: 'STATE', required_rung: 'E2', max_rung: 'E4' },
    }));
    // The criterion was never evidenced, yet the journal claims DONE.
    append(root, eventDraft('GOAL_TERMINATED', {
      payload: { status: 'DONE', reason: null, residual: [] },
    }));

    assert.throws(
      () => reduce(root),
      (error) => {
        assert.ok(error instanceof ReducerError);
        assert.match(error.message, /recorded DONE but the ledger derives/);
        return true;
      },
    );
  });
});

/**
 * I5's false-DONE defense, reached the way production can reach it.
 *
 * The reducer's `recorded DONE but the ledger derives` branch is live: two routes
 * build a DONE-claiming journal through the real `appendEvent`, because neither
 * needs an unregistered artifact_ref. `a sealed status the ledger does not
 * support` above covers the first (SATISFIED claimed with no evidence at all);
 * this covers the second, which the suite did not exercise end to end.
 *
 * Registered-but-truncated is the more dangerous of the two: the artifact exists,
 * so every reference resolves and the append gate has nothing to object to. Only
 * `assessSatisfaction` knows that a truncated artifact cannot prove completeness.
 * The control for this test is `the same journal with whole, registered evidence
 * does seal DONE` below — the same helper, one field flipped.
 */
test('evidence that is registered but truncated cannot seal DONE (I5, I1)', () => {
  withTask((root) => {
    driveToSatisfied(root, { truncated: true });
    append(root, eventDraft('GOAL_TERMINATED', {
      payload: { status: 'DONE', reason: null, residual: [] },
    }));

    assert.throws(
      () => reduce(root),
      (error) => {
        assert.ok(error instanceof ReducerError);
        assert.match(error.message, /recorded DONE but the ledger derives/);
        return true;
      },
    );
  });
});

/**
 * The same terminal state reached by damage rather than by a legal write.
 *
 * `appendEvent`'s artifact_resolves gate makes an unregistered evidence_ref
 * unreachable through the write path — the two indexes are built from the same
 * journal (`deriveSemanticContext` and `projectState` both key on
 * ARTIFACT_REGISTERED), so anything the reducer would call unregistered is
 * refused at append. That does not retire `assessSatisfaction`'s existence check:
 * a segment can be tampered with, or lose an ARTIFACT_REGISTERED line to damage,
 * after the referencing event was legally appended. Then the reducer is handed a
 * journal the write path would never have produced, and it must still refuse.
 *
 * Forging the stream is the only way to model that, since the point is a journal
 * `appendEvent` rejects. Its write-path counterpart is asserted below.
 */
test('a journal naming an unregistered artifact cannot seal DONE (I5, I1)', () => {
  // Every step of a satisfied task except registering the evidence, so the
  // reducer's artifactIndex stays empty and the evidence ref is a ghost. This
  // used to seal DONE with zero blocking reasons — the shortest false DONE.
  const events = sealChain([
    ...alignedTaskDrafts(),
    eventDraft('CRITERION_DEFINED', {
      payload: { criterion_id: 'c-001abcd', type: 'STATE', statement: 'x', required_rung: 'E2', max_rung: 'E4' },
    }),
    eventDraft('STEP_PLANNED', {
      payload: { step_id: 's-001abcd', kind: 'VERIFY', completes_attainable_work: true },
    }),
    eventDraft('EVIDENCE_RECORDED', {
      actor: 'proxy',
      payload: { criterion_id: 'c-001abcd', rung: 'E2' },
      artifact_refs: ['a-NEVERREG'],
    }),
    eventDraft('CRITERION_UPDATED', {
      payload: { criterion_id: 'c-001abcd', state: 'SATISFIED', achieved_rung: 'E2' },
    }),
    eventDraft('GOAL_TERMINATED', {
      payload: { status: 'DONE', reason: null, residual: [] },
    }),
  ]);

  assert.throws(
    () => reduceCheckpoint(events, { now: FIXED_TIME }),
    /recorded DONE but the ledger derives/,
  );
});

test('the write path refuses that journal in the first place (C06)', () => {
  // The read-path test above forges its stream, which would hide a regression in
  // the append gate. This states the other half: the ghost ref never lands.
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('CRITERION_DEFINED', {
      payload: { criterion_id: 'c-001abcd', type: 'STATE', statement: 'x', required_rung: 'E2', max_rung: 'E4' },
    }));
    assert.throws(
      () => append(root, eventDraft('EVIDENCE_RECORDED', {
        actor: 'proxy',
        payload: { criterion_id: 'c-001abcd', rung: 'E2' },
        artifact_refs: ['a-NEVERREG'],
      })),
      (error) => {
        assert.deepEqual(
          error.violations.map((entry) => entry.invariant),
          ['artifact_resolves'],
        );
        assert.match(error.violations[0].message, /a-NEVERREG is not registered/);
        return true;
      },
    );
    // And the refused event left nothing behind for the reducer to read.
    assert.equal(readAllEvents(root).events.at(-1).type, 'CRITERION_DEFINED');
  });
});

test('control: the same journal with whole, registered evidence does seal DONE', () => {
  // The control for both false-DONE tests above. Against the truncation test it
  // differs by one boolean; against the ghost-ref test, by one ARTIFACT_REGISTERED
  // event. Without it, a reducer that refused every DONE would pass them both.
  withTask((root) => {
    driveToSatisfied(root);
    append(root, eventDraft('GOAL_TERMINATED', {
      payload: { status: 'DONE', reason: null, residual: [] },
    }));
    assert.deepEqual(reduce(root).checkpoint.outcome, { status: 'DONE', reason: null });
  });
});

test('a terminal checkpoint never carries a next action', () => {
  withTask((root) => {
    driveToSatisfied(root);
    append(root, eventDraft('GOAL_TERMINATED', {
      payload: { status: 'DONE', reason: null, residual: [] },
    }));
    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.next_action, null);
    assert.equal(checkpoint.active_step.status, 'awaiting_verification');
  });
});

test('a residual recorded at alignment is counted, not inlined', () => {
  withTask((root) => {
    append(root, eventDraft('GOAL_CREATED', {
      payload: { goal_id: 'g-001abcd', goal_summary: 'Boiler repaired and confirmed working' },
    }));
    append(root, eventDraft('GOAL_ALIGNED', {
      actor: 'user',
      payload: {
        approved_by: 'decider:alice',
        residual: [
          { item: 'Post the letter', owner: 'user', next_action: 'Send by recorded delivery' },
          { item: 'Attend the inspection', owner: 'user', next_action: 'Book a visit slot' },
        ],
      },
    }));

    const { checkpoint } = reduce(root);
    assert.equal(checkpoint.residual_count, 2);
    // The checkpoint stores a count; the items live in the goal artifact.
    assert.ok(!JSON.stringify(checkpoint).includes('Post the letter'));
  });
});

test('an over-long goal summary is trimmed on a character boundary', () => {
  withTask((root) => {
    // 300 CJK characters is 900 bytes; the checkpoint field allows 240.
    append(root, eventDraft('GOAL_CREATED', {
      payload: { goal_id: 'g-001abcd', goal_summary: '目'.repeat(300) },
    }));

    const { checkpoint } = reduce(root);
    assert.ok(Buffer.byteLength(checkpoint.goal_summary, 'utf8') <= BUDGETS.GOAL_SUMMARY);
    // Trimming must not leave a broken codepoint behind.
    assert.ok(!checkpoint.goal_summary.includes('�'));
    assert.equal(checkpoint.goal_summary, '目'.repeat(80));
  });
});

test('every reduced checkpoint stays within 2 KiB (C01)', () => {
  withTask((root) => {
    driveToSatisfied(root);
    const { bytes } = reduce(root);
    assert.ok(bytes < BUDGETS.CHECKPOINT, `checkpoint was ${bytes} bytes`);
  });
});

test('reduction is deterministic for the same journal', () => {
  withTask((root) => {
    driveToSatisfied(root);
    const first = reduce(root);
    const second = reduce(root);
    assert.deepEqual(first.checkpoint, second.checkpoint);
    assert.equal(first.hash, second.hash);
  });
});

test('a scope change is reflected and keeps its approval (I2)', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('SCOPE_CHANGED', {
      scope_version: 2,
      payload: { approved_by: 'decider:alice', reason: 'narrowed to the reachable prefix' },
    }));

    const { checkpoint, state } = reduce(root);
    assert.equal(checkpoint.scope_version, 2);
    assert.equal(state.originalScopeVersion, 1);
    assert.equal(state.scopeApproved, true);
  });
});

test('projectState records rejections without inventing a retry', () => {
  withTask((root) => {
    appendAll(root, alignedTaskDrafts());
    append(root, eventDraft('DISPATCH_REJECTED', {
      actor: 'proxy',
      payload: { dispatch_id: 'd-001abcd', code: 'DISPATCH_REJECTED', actual_bytes: 20000 },
    }));

    const state = projectState(readAllEvents(root).events);
    assert.equal(state.consecutiveRejections.get('d-001abcd:DISPATCH_REJECTED'), 1);
    // A rejected dispatch never becomes an open dispatch (invariant I11).
    assert.equal(state.openDispatches.size, 0);
  });
});

test('deriveNextAction returns null only for a terminated task', () => {
  const terminated = { terminated: { status: 'DONE' }, danglingEffects: new Map(), openDispatches: new Map() };
  assert.equal(deriveNextAction(terminated), null);
});

test('the phase vocabulary and the reducer agree on non-terminal phases', () => {
  assert.ok(NON_TERMINAL_PHASES.includes('NEEDS_INPUT'));
  assert.ok(!NON_TERMINAL_PHASES.includes('TERMINAL'));
});
