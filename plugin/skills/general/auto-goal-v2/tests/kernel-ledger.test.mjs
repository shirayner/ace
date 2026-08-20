/**
 * Criterion ledger tests (design §11.1; scenarios E01-E05, C08).
 *
 * The ledger is the sole input to the terminal verdict, so these tests focus on
 * the two ways a false DONE gets in: weak evidence counted as strong, and the
 * Agent judging what only a person can judge.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assessSatisfaction,
  buildLedger,
  countStates,
  emptyLedger,
  hasExhaustedEvidence,
  inScopeEntries,
  planRequiredRung,
} from '../lib/ledger.mjs';
import { ReducerError } from '../lib/errors.mjs';
import { sealEvent } from '../lib/canonical.mjs';
import {
  eventDraft,
  ledgerEntry,
  makeArtifactIndex,
  sealChain,
  TASK_ID,
  FIXED_TIME,
} from './fixtures/kernel-fixtures.mjs';

/** Sealed event stream built directly, so ledger tests need no filesystem. */
function chain(drafts) {
  return sealChain(drafts.map((draft) => eventDraft(draft.type, draft)));
}

function defineCriterion(criterionId, overrides = {}) {
  return {
    type: 'CRITERION_DEFINED',
    payload: {
      criterion_id: criterionId,
      type: 'STATE',
      statement: `criterion ${criterionId}`,
      required_rung: 'E2',
      max_rung: 'E4',
      ...overrides,
    },
  };
}

test('an empty ledger has no entries', () => {
  const ledger = emptyLedger();
  assert.equal(ledger.entries.size, 0);
  assert.deepEqual(inScopeEntries(ledger), []);
});

test('CRITERION_DEFINED creates an UNTESTED entry at E0', () => {
  const ledger = buildLedger(chain([defineCriterion('c-001abcd')]));
  const entry = ledger.entries.get('c-001abcd');
  assert.equal(entry.state, 'UNTESTED');
  assert.equal(entry.achieved_rung, 'E0');
  assert.equal(entry.required_rung, 'E2');
  assert.equal(entry.max_rung, 'E4');
  assert.deepEqual(entry.evidence_refs, []);
  assert.equal(entry.in_scope, true);
});

test('a criterion whose requirement outruns its ceiling is UNTESTABLE at definition', () => {
  const ledger = buildLedger(
    chain([defineCriterion('c-001abcd', { type: 'BEHAVIOR', required_rung: 'E4', max_rung: 'E3' })]),
  );
  assert.equal(ledger.entries.get('c-001abcd').state, 'UNTESTABLE');
});

test('an unknown criterion type is an explicit reducer failure', () => {
  assert.throws(
    () => buildLedger(chain([defineCriterion('c-001abcd', { type: 'PERFORMANCE' })])),
    (error) => {
      assert.ok(error instanceof ReducerError);
      assert.match(error.message, /unknown criterion type/);
      return true;
    },
  );
});

test('an event referencing an undefined criterion is an explicit failure', () => {
  assert.throws(
    () =>
      buildLedger(
        chain([
          {
            type: 'EVIDENCE_RECORDED',
            payload: { criterion_id: 'c-ghost001', rung: 'E2' },
            artifact_refs: ['a-001abcd'],
          },
        ]),
      ),
    /references unknown criterion/,
  );
});

test('EVIDENCE_RECORDED raises the achieved rung and collects artifacts', () => {
  const ledger = buildLedger(
    chain([
      defineCriterion('c-001abcd'),
      {
        type: 'EVIDENCE_RECORDED',
        payload: { criterion_id: 'c-001abcd', rung: 'E2' },
        artifact_refs: ['a-001abcd'],
      },
    ]),
  );
  const entry = ledger.entries.get('c-001abcd');
  assert.equal(entry.achieved_rung, 'E2');
  assert.deepEqual(entry.evidence_refs, ['a-001abcd']);
  assert.equal(entry.checked_at, FIXED_TIME);
});

test('the achieved rung never regresses when weaker evidence arrives later', () => {
  const ledger = buildLedger(
    chain([
      defineCriterion('c-001abcd'),
      {
        type: 'EVIDENCE_RECORDED',
        payload: { criterion_id: 'c-001abcd', rung: 'E3' },
        artifact_refs: ['a-strong01'],
      },
      {
        type: 'EVIDENCE_RECORDED',
        payload: { criterion_id: 'c-001abcd', rung: 'E1' },
        artifact_refs: ['a-weak0001'],
      },
    ]),
  );
  const entry = ledger.entries.get('c-001abcd');
  assert.equal(entry.achieved_rung, 'E3');
  assert.deepEqual(entry.evidence_refs, ['a-strong01', 'a-weak0001']);
});

test('duplicate evidence references are not double counted', () => {
  const ledger = buildLedger(
    chain([
      defineCriterion('c-001abcd'),
      {
        type: 'EVIDENCE_RECORDED',
        payload: { criterion_id: 'c-001abcd', rung: 'E2' },
        artifact_refs: ['a-001abcd'],
      },
      {
        type: 'EVIDENCE_RECORDED',
        payload: { criterion_id: 'c-001abcd', rung: 'E2' },
        artifact_refs: ['a-001abcd'],
      },
    ]),
  );
  assert.deepEqual(ledger.entries.get('c-001abcd').evidence_refs, ['a-001abcd']);
});

test('an unknown evidence rung is an explicit failure', () => {
  assert.throws(
    () =>
      buildLedger(
        chain([
          defineCriterion('c-001abcd'),
          {
            type: 'EVIDENCE_RECORDED',
            payload: { criterion_id: 'c-001abcd', rung: 'E9' },
            artifact_refs: ['a-001abcd'],
          },
        ]),
      ),
    /unknown rung/,
  );
});

test('CRITERION_UPDATED sets the ledger state', () => {
  const ledger = buildLedger(
    chain([
      defineCriterion('c-001abcd'),
      {
        type: 'EVIDENCE_RECORDED',
        payload: { criterion_id: 'c-001abcd', rung: 'E2' },
        artifact_refs: ['a-001abcd'],
      },
      { type: 'CRITERION_UPDATED', payload: { criterion_id: 'c-001abcd', state: 'SATISFIED' } },
    ]),
  );
  assert.equal(ledger.entries.get('c-001abcd').state, 'SATISFIED');
});

test('an unknown criterion state is an explicit failure', () => {
  assert.throws(
    () =>
      buildLedger(
        chain([
          defineCriterion('c-001abcd'),
          { type: 'CRITERION_UPDATED', payload: { criterion_id: 'c-001abcd', state: 'DONE' } },
        ]),
      ),
    /unknown state/,
  );
});

test('SCOPE_CHANGED advances the ledger scope version', () => {
  const events = chain([defineCriterion('c-001abcd')]);
  const scoped = [
    ...events,
    sealEvent(
      {
        schema_version: 1,
        event_id: '01J8ZQ9TESTEVENT0000000099',
        task_id: TASK_ID,
        segment: 1,
        seq: 2,
        occurred_at: FIXED_TIME,
        type: 'SCOPE_CHANGED',
        actor: 'controller',
        causation_id: null,
        correlation_id: null,
        idempotency_key: null,
        scope_version: 2,
        payload: { approved_by: 'decider:alice' },
        artifact_refs: [],
      },
      events.at(-1).event_hash,
    ),
  ];
  assert.equal(buildLedger(scoped).scopeVersion, 2);
});

test('evidence recorded under a superseded scope does not move the ledger (C08, I12)', () => {
  const base = chain([defineCriterion('c-001abcd')]);
  const scopeChange = sealEvent(
    {
      schema_version: 1,
      event_id: '01J8ZQ9TESTEVENT0000000098',
      task_id: TASK_ID,
      segment: 1,
      seq: 2,
      occurred_at: FIXED_TIME,
      type: 'SCOPE_CHANGED',
      actor: 'controller',
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      scope_version: 2,
      payload: { approved_by: 'decider:alice' },
      artifact_refs: [],
    },
    base.at(-1).event_hash,
  );
  // A worker result computed against scope_version 1 arrives after the change.
  const staleEvidence = sealEvent(
    {
      schema_version: 1,
      event_id: '01J8ZQ9TESTEVENT0000000097',
      task_id: TASK_ID,
      segment: 1,
      seq: 3,
      occurred_at: FIXED_TIME,
      type: 'EVIDENCE_RECORDED',
      actor: 'proxy',
      causation_id: null,
      correlation_id: null,
      idempotency_key: null,
      scope_version: 1,
      payload: { criterion_id: 'c-001abcd', rung: 'E3' },
      artifact_refs: ['a-stale001'],
    },
    scopeChange.event_hash,
  );

  const ledger = buildLedger([...base, scopeChange, staleEvidence]);
  const entry = ledger.entries.get('c-001abcd');
  assert.equal(entry.achieved_rung, 'E0', 'stale evidence must not raise the rung');
  assert.deepEqual(entry.evidence_refs, [], 'stale evidence must not be credited');
});

test('countStates tallies every ledger state', () => {
  const ledger = {
    entries: new Map([
      ['c-1aaaaaaa', ledgerEntry('c-1aaaaaaa', { state: 'SATISFIED' })],
      ['c-2aaaaaaa', ledgerEntry('c-2aaaaaaa', { state: 'VIOLATED' })],
      ['c-3aaaaaaa', ledgerEntry('c-3aaaaaaa', { state: 'UNTESTED' })],
      ['c-4aaaaaaa', ledgerEntry('c-4aaaaaaa', { state: 'UNTESTABLE' })],
      ['c-5aaaaaaa', ledgerEntry('c-5aaaaaaa', { state: 'MOOT' })],
    ]),
  };
  assert.deepEqual(countStates(ledger), {
    satisfied: 1,
    violated: 1,
    untested: 1,
    untestable: 1,
    moot: 1,
  });
});

test('inScopeEntries excludes out-of-scope and MOOT criteria', () => {
  const ledger = {
    entries: new Map([
      ['c-1aaaaaaa', ledgerEntry('c-1aaaaaaa')],
      ['c-2aaaaaaa', ledgerEntry('c-2aaaaaaa', { in_scope: false })],
      ['c-3aaaaaaa', ledgerEntry('c-3aaaaaaa', { state: 'MOOT' })],
    ]),
  };
  assert.deepEqual(
    inScopeEntries(ledger).map((entry) => entry.criterion_id),
    ['c-1aaaaaaa'],
  );
});

const artifactIndex = makeArtifactIndex([{ artifact_id: 'a-fixture01' }]);

test('adequate evidence is satisfiable', () => {
  const { satisfiable, reasons } = assessSatisfaction(ledgerEntry('c-1aaaaaaa'), { artifactIndex });
  assert.equal(satisfiable, true);
  assert.deepEqual(reasons, []);
});

test('E1 is not satisfiable for an E2 requirement (E01, I14)', () => {
  const { satisfiable, reasons } = assessSatisfaction(
    ledgerEntry('c-1aaaaaaa', { achieved_rung: 'E1' }),
    { artifactIndex },
  );
  assert.equal(satisfiable, false);
  assert.ok(reasons.some((reason) => reason.includes('achieved E1 < required E2')));
});

test('evidence that is missing from the index is not satisfiable', () => {
  const { satisfiable, reasons } = assessSatisfaction(
    ledgerEntry('c-1aaaaaaa', { evidence_refs: ['a-ghost001'] }),
    { artifactIndex },
  );
  assert.equal(satisfiable, false);
  assert.ok(reasons.some((reason) => reason.includes('not registered')));
});

test('an empty artifact index does not make ghost evidence satisfiable (I5)', () => {
  // The defect this pins: the assessment used to skip existence checks entirely
  // when the index was empty, so the emptier the index the easier the criterion.
  // An empty index is exactly what a journal with no ARTIFACT_REGISTERED yields.
  const { satisfiable, reasons } = assessSatisfaction(
    ledgerEntry('c-1aaaaaaa', { evidence_refs: ['a-ghost001'] }),
    { artifactIndex: new Map() },
  );
  assert.equal(satisfiable, false);
  assert.ok(reasons.some((reason) => reason.includes('not registered')));
});

test('control: an index holding exactly the referenced evidence is satisfiable', () => {
  // Without this control an unconditionally-unsatisfiable assessment would pass
  // the assertion above. The only difference from it is that the evidence exists.
  const { satisfiable, reasons } = assessSatisfaction(
    ledgerEntry('c-1aaaaaaa', { evidence_refs: ['a-ghost001'] }),
    { artifactIndex: makeArtifactIndex([{ artifact_id: 'a-ghost001' }]) },
  );
  assert.equal(satisfiable, true);
  assert.deepEqual(reasons, []);
});

test('truncated evidence cannot prove a criterion', () => {
  const truncatedIndex = makeArtifactIndex([{ artifact_id: 'a-fixture01', truncated: true }]);
  const { satisfiable, reasons } = assessSatisfaction(ledgerEntry('c-1aaaaaaa'), {
    artifactIndex: truncatedIndex,
  });
  assert.equal(satisfiable, false);
  assert.ok(reasons.some((reason) => reason.includes('truncated')));
});

test('no evidence at all is not satisfiable', () => {
  const { satisfiable, reasons } = assessSatisfaction(
    ledgerEntry('c-1aaaaaaa', { evidence_refs: [] }),
    { artifactIndex },
  );
  assert.equal(satisfiable, false);
  assert.ok(reasons.includes('no evidence references'));
});

test('JUDGMENT without an external acceptor is not satisfiable (E04, I9)', () => {
  const entry = ledgerEntry('c-1aaaaaaa', {
    type: 'JUDGMENT',
    required_rung: 'E4',
    max_rung: 'E4',
    achieved_rung: 'E4',
    acceptor_ref: null,
  });
  const { satisfiable, reasons } = assessSatisfaction(entry, { artifactIndex });
  assert.equal(satisfiable, false);
  assert.ok(reasons.some((reason) => reason.includes('no external acceptor')));
});

test('the Agent may not stand in as its own acceptor (I9)', () => {
  const entry = ledgerEntry('c-1aaaaaaa', {
    type: 'KNOWLEDGE',
    required_rung: 'E4',
    max_rung: 'E4',
    achieved_rung: 'E4',
    acceptor_ref: 'Agent',
  });
  const { satisfiable, reasons } = assessSatisfaction(entry, { artifactIndex });
  assert.equal(satisfiable, false);
  assert.ok(reasons.some((reason) => reason.includes('names the Agent as acceptor')));
});

test('JUDGMENT with a named human acceptor is satisfiable', () => {
  const entry = ledgerEntry('c-1aaaaaaa', {
    type: 'JUDGMENT',
    required_rung: 'E4',
    max_rung: 'E4',
    achieved_rung: 'E4',
    acceptor_ref: 'user:bob',
  });
  assert.equal(assessSatisfaction(entry, { artifactIndex }).satisfiable, true);
});

test('NEGATIVE without a bounded check surface is not satisfiable (E05)', () => {
  const entry = ledgerEntry('c-1aaaaaaa', {
    type: 'NEGATIVE',
    required_rung: 'E3',
    max_rung: 'E3',
    achieved_rung: 'E3',
    check_surface: [],
  });
  const { satisfiable, reasons } = assessSatisfaction(entry, { artifactIndex });
  assert.equal(satisfiable, false);
  assert.ok(reasons.some((reason) => reason.includes('no bounded check surface')));
});

test('NEGATIVE with an enumerated check surface is satisfiable', () => {
  const entry = ledgerEntry('c-1aaaaaaa', {
    type: 'NEGATIVE',
    required_rung: 'E3',
    max_rung: 'E3',
    achieved_rung: 'E3',
    check_surface: ['dir-a', 'dir-b', 'dir-c'],
  });
  assert.equal(assessSatisfaction(entry, { artifactIndex }).satisfiable, true);
});

test('hasExhaustedEvidence separates a reached ceiling from untried verification (O06)', () => {
  // Still room to try: E2 achieved, E4 possible.
  assert.equal(hasExhaustedEvidence(ledgerEntry('c-1', { achieved_rung: 'E2', max_rung: 'E4' })), false);
  // Ceiling reached: nothing stronger is obtainable.
  assert.equal(hasExhaustedEvidence(ledgerEntry('c-1', { achieved_rung: 'E4', max_rung: 'E4' })), true);
  assert.equal(hasExhaustedEvidence(ledgerEntry('c-1', { achieved_rung: 'E0', max_rung: 'E0' })), true);
});

test('planRequiredRung exposes an unattainable requirement before execution', () => {
  const plan = planRequiredRung('BEHAVIOR', { externality: 'public' });
  assert.equal(plan.required, 'E4');
  assert.equal(plan.ceiling, 'E3');
  assert.equal(plan.attainable, false);
});
