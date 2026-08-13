/**
 * Outcome reducer tests (design §11.2; scenarios O01-O06).
 *
 * The reducer is the only path to DONE, so these tests are as much about what it
 * refuses as what it returns. The arbitration order is exercised by constructing
 * states where two rules could fire and asserting the more conservative wins.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveOutcome, isSealable, missingTerminalFields } from '../lib/outcome.mjs';
import { TERMINAL_OUTCOMES } from '../lib/vocabulary.mjs';
import { ledgerEntry, makeArtifactIndex, makeLedger } from './fixtures/kernel-fixtures.mjs';

const artifactIndex = makeArtifactIndex([
  { artifact_id: 'a-fixture01' },
  { artifact_id: 'a-fixture02' },
]);

/** All satisfied, nothing outstanding — the only shape that may reach DONE. */
function doneInput(overrides = {}) {
  return {
    ledger: makeLedger([ledgerEntry('c-1aaaaaaa'), ledgerEntry('c-2aaaaaaa')]),
    scopeVersion: 1,
    scopeApproved: true,
    originalScopeVersion: 1,
    constraints: [],
    deliveredStateCoherent: true,
    residual: [],
    pendingInterruption: null,
    attainableWorkComplete: true,
    artifactIndex,
    ...overrides,
  };
}

test('all criteria satisfied at their required rung yields DONE (O01)', () => {
  const result = deriveOutcome(doneInput());
  assert.equal(result.status, 'DONE');
  assert.equal(result.reason, null);
  assert.equal(result.criteria.length, 2);
  assert.deepEqual(result.residual, []);
  assert.equal(result.scope_version, 1);
  assert.match(result.rationale, /All 2 in-scope criteria satisfied/);
});

test('DONE reports every criterion with its evidence and rung', () => {
  const result = deriveOutcome(doneInput());
  for (const criterion of result.criteria) {
    assert.equal(criterion.state, 'SATISFIED');
    assert.equal(criterion.required_rung, 'E2');
    assert.equal(criterion.achieved_rung, 'E2');
    assert.deepEqual(criterion.evidence_refs, ['a-fixture01']);
    assert.deepEqual(criterion.blocking_reasons, []);
  }
});

test('a violated constraint outranks satisfied criteria', () => {
  const result = deriveOutcome(
    doneInput({ constraints: [{ constraint_id: 'k-nospend', violated: true }] }),
  );
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'CONSTRAINT_VIOLATED');
  assert.deepEqual(result.required_fields.gaps, ['k-nospend']);
});

test('an incoherent delivered state is BLOCKED, never PARTIAL', () => {
  // A half-applied change is not a usable prefix; roll back before reporting.
  const result = deriveOutcome(doneInput({ deliveredStateCoherent: false }));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'INCOHERENT_STATE');
});

test('an incoherent state outranks a pending interruption', () => {
  const result = deriveOutcome(
    doneInput({
      deliveredStateCoherent: false,
      pendingInterruption: { code: 'APPROVAL_REQUIRED', required_from: 'decider', resume_token: 'rt-1' },
    }),
  );
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'INCOHERENT_STATE');
});

test('a principal-held key yields NEEDS_INPUT with a resume token (O05)', () => {
  const pendingInterruption = {
    code: 'APPROVAL_REQUIRED',
    required_from: 'decider',
    resume_token: 'rt-fixture01',
  };
  const result = deriveOutcome(doneInput({ pendingInterruption }));
  assert.equal(result.status, 'NEEDS_INPUT');
  assert.deepEqual(result.required_fields.interruption, pendingInterruption);
  assert.match(result.rationale, /Awaiting APPROVAL_REQUIRED from decider/);
});

test('NEEDS_INPUT is not sealable; the four terminal outcomes are', () => {
  assert.equal(isSealable('NEEDS_INPUT'), false);
  for (const status of TERMINAL_OUTCOMES) {
    assert.equal(isSealable(status), true, status);
  }
});

test('asking beats stopping: NEEDS_INPUT outranks a falsified criterion', () => {
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa', { state: 'VIOLATED' }),
        ledgerEntry('c-2aaaaaaa'),
      ]),
      pendingInterruption: { code: 'DECISION_REQUIRED', required_from: 'decider', resume_token: 'rt-1' },
    }),
  );
  assert.equal(result.status, 'NEEDS_INPUT');
});

test('a falsified in-scope criterion yields BLOCKED(FALSIFIED) (O04)', () => {
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa', { state: 'VIOLATED' }),
        ledgerEntry('c-2aaaaaaa'),
      ]),
    }),
  );
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'FALSIFIED');
  assert.deepEqual(result.required_fields.gaps, ['c-1aaaaaaa']);
});

test('unfinished attainable work yields PARTIAL, listing both sets', () => {
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa'),
        ledgerEntry('c-2aaaaaaa', { state: 'UNTESTED', achieved_rung: 'E0', evidence_refs: [] }),
      ]),
      attainableWorkComplete: false,
    }),
  );
  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(result.required_fields.completed, ['c-1aaaaaaa']);
  assert.deepEqual(result.required_fields.outstanding, ['c-2aaaaaaa']);
});

test('an untested criterion with verification still available is not UNVERIFIABLE (O06)', () => {
  // E2 achieved against an E4 ceiling: more evidence is obtainable, so the goal
  // stays open rather than hiding behind UNVERIFIABLE.
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa', {
          state: 'UNTESTED',
          required_rung: 'E3',
          max_rung: 'E4',
          achieved_rung: 'E2',
        }),
      ]),
    }),
  );
  assert.equal(result.status, 'PARTIAL');
  assert.match(result.rationale, /still have available verification/);
});

test('a requirement unreachable after maximal evidence yields UNVERIFIABLE', () => {
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa', {
          type: 'JUDGMENT',
          state: 'UNTESTED',
          required_rung: 'E4',
          max_rung: 'E4',
          achieved_rung: 'E4',
          acceptor_ref: null, // no reachable acceptor
        }),
      ]),
    }),
  );
  assert.equal(result.status, 'UNVERIFIABLE');
  const [reached] = result.required_fields.highest_reached;
  assert.equal(reached.criterion_id, 'c-1aaaaaaa');
  assert.equal(reached.achieved_rung, 'E4');
  assert.equal(reached.who_can_decide, 'unnamed acceptor');
});

test('UNVERIFIABLE names who could still decide when an acceptor exists', () => {
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa', {
          state: 'UNTESTED',
          required_rung: 'E4',
          max_rung: 'E2',
          achieved_rung: 'E2',
          acceptor_ref: 'metrics-owner:carol',
        }),
      ]),
    }),
  );
  assert.equal(result.status, 'UNVERIFIABLE');
  assert.equal(result.required_fields.highest_reached[0].who_can_decide, 'metrics-owner:carol');
});

test('an external-system goal stuck at E1 does not become DONE (E01)', () => {
  // "The unsubscribe request returned 200" is E1; the STATE criterion needs E2.
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa', {
          state: 'UNTESTED',
          required_rung: 'E2',
          max_rung: 'E1',
          achieved_rung: 'E1',
        }),
      ]),
    }),
  );
  assert.equal(result.status, 'UNVERIFIABLE');
  assert.notEqual(result.status, 'DONE');
});

test('a non-empty residual caps the outcome at PARTIAL (O03)', () => {
  const residual = [
    {
      item: 'Send the letter and attend the boiler inspection',
      owner: 'user',
      next_action: 'Post the drafted letter, then book the visit',
      acceptance: 'Boiler repaired and confirmed working',
    },
  ];
  const result = deriveOutcome(doneInput({ residual }));
  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(result.residual, residual);
  assert.deepEqual(result.required_fields.completed, ['c-1aaaaaaa', 'c-2aaaaaaa']);
  assert.match(result.rationale, /1 residual item/);
});

test('a narrowed scope caps the outcome at PARTIAL (O02)', () => {
  const result = deriveOutcome(doneInput({ scopeVersion: 2, originalScopeVersion: 1 }));
  assert.equal(result.status, 'PARTIAL');
  assert.match(result.rationale, /scope narrowed from version 1 to 2/);
});

test('an unapproved scope version cannot reach DONE (I2)', () => {
  const result = deriveOutcome(doneInput({ scopeApproved: false }));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'INVARIANT_VIOLATED');
  assert.match(result.rationale, /lacks decider approval/);
});

test('a criterion marked SATISFIED on inadequate evidence cannot reach DONE', () => {
  // This is the false-DONE attack: the state field says SATISFIED, the evidence
  // does not support it, and the reducer must not take the field at its word.
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa', { state: 'SATISFIED', achieved_rung: 'E1' }),
      ]),
    }),
  );
  assert.notEqual(result.status, 'DONE');
  assert.equal(result.status, 'PARTIAL');
  assert.ok(result.criteria[0].blocking_reasons.length > 0);
});

test('a criterion marked SATISFIED by the Agent as acceptor cannot reach DONE (I9)', () => {
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa', {
          type: 'JUDGMENT',
          state: 'SATISFIED',
          required_rung: 'E4',
          max_rung: 'E4',
          achieved_rung: 'E4',
          acceptor_ref: 'agent',
        }),
      ]),
    }),
  );
  assert.notEqual(result.status, 'DONE');
  assert.equal(result.status, 'UNVERIFIABLE');
});

test('a criterion whose evidence vanished cannot reach DONE (I5)', () => {
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([ledgerEntry('c-1aaaaaaa', { evidence_refs: ['a-ghost001'] })]),
    }),
  );
  assert.notEqual(result.status, 'DONE');
});

test('an empty artifact index cannot reach DONE either (I5)', () => {
  // Same ledger the DONE path uses, but no artifact was ever registered. The
  // outcome must degrade, not sail through on an unchecked existence test.
  const result = deriveOutcome(doneInput({ artifactIndex: new Map() }));
  assert.notEqual(result.status, 'DONE');
  assert.ok(
    result.criteria.every((criterion) =>
      criterion.blocking_reasons.some((reason) => reason.includes('not registered'))),
    'each criterion must name its unregistered evidence as the blocker',
  );
});

test('an empty in-scope ledger cannot reach DONE', () => {
  // Nothing to verify means nothing was proven.
  const result = deriveOutcome(doneInput({ ledger: makeLedger([]) }));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.reason, 'INVARIANT_VIOLATED');
});

test('out-of-scope and MOOT criteria do not block DONE', () => {
  const result = deriveOutcome(
    doneInput({
      ledger: makeLedger([
        ledgerEntry('c-1aaaaaaa'),
        ledgerEntry('c-2aaaaaaa', { state: 'UNTESTED', in_scope: false }),
        ledgerEntry('c-3aaaaaaa', { state: 'MOOT' }),
      ]),
    }),
  );
  assert.equal(result.status, 'DONE');
  assert.equal(result.criteria.length, 1);
});

test('every outcome carries residual, even when empty (I15)', () => {
  const inputs = [
    doneInput(),
    doneInput({ constraints: [{ constraint_id: 'k-1', violated: true }] }),
    doneInput({ pendingInterruption: { code: 'ACCESS_REQUIRED', required_from: 'owner', resume_token: 'rt-1' } }),
    doneInput({ attainableWorkComplete: false }),
    doneInput({ ledger: makeLedger([ledgerEntry('c-1aaaaaaa', { state: 'VIOLATED' })]) }),
  ];
  for (const input of inputs) {
    const result = deriveOutcome(input);
    assert.ok(Array.isArray(result.residual), result.status);
    assert.deepEqual(missingTerminalFields(result), [], `${result.status} is missing required fields`);
  }
});

test('missingTerminalFields catches an outcome lacking its mandatory content', () => {
  assert.deepEqual(
    missingTerminalFields({ status: 'PARTIAL', residual: [], required_fields: {} }),
    ['completed', 'outstanding'],
  );
  assert.deepEqual(
    missingTerminalFields({ status: 'UNVERIFIABLE', residual: [], required_fields: {} }),
    ['highest_reached'],
  );
  assert.deepEqual(
    missingTerminalFields({ status: 'DONE', required_fields: { constraints: [] } }),
    ['residual'],
  );
});

test('the reducer is pure: the same input always gives the same verdict', () => {
  const input = doneInput();
  const first = deriveOutcome(input);
  const second = deriveOutcome(input);
  assert.deepEqual(first, second);
});

test('the reducer does not mutate the ledger or residual it was given', () => {
  const residual = [{ item: 'x', owner: 'user', next_action: 'y' }];
  const entry = ledgerEntry('c-1aaaaaaa');
  const input = doneInput({ ledger: makeLedger([entry]), residual });

  const result = deriveOutcome(input);
  result.residual.push({ item: 'injected', owner: 'nobody', next_action: 'none' });
  result.criteria[0].evidence_refs.push('a-injected');

  assert.equal(residual.length, 1);
  assert.deepEqual(entry.evidence_refs, ['a-fixture01']);
});
