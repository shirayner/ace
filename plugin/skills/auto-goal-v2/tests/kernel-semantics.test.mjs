/**
 * Semantic validation tests (design §8.2, §17; scenarios C06, C08, E01, E04, E05).
 *
 * These cover the defects a schema cannot see: a valid shape carrying an invalid
 * meaning.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assertNoViolations,
  isMainAgentIngestible,
  validateArtifactManifest,
  validateCriterion,
  validateEventSemantics,
  validateEvidenceUsability,
  validatePhaseTransition,
  validateWorkerOutput,
} from '../lib/semantic-validator.mjs';
import { SemanticValidationError } from '../lib/errors.mjs';
import { deriveRequiredRung, rungSatisfies } from '../lib/vocabulary.mjs';
import { TASK_ID, FIXED_TIME, workerOutput } from './fixtures/kernel-fixtures.mjs';

function criterion(overrides = {}) {
  return {
    criterion_id: 'c-001abcd',
    scope_version: 1,
    type: 'STATE',
    statement: 'The 3 target rows exist in the destination table',
    required_rung: 'E2',
    max_rung: 'E4',
    achieved_rung: 'E2',
    state: 'SATISFIED',
    evidence_refs: ['a-001abcd'],
    check_surface: [],
    acceptor_ref: null,
    ...overrides,
  };
}

function invariants(violations) {
  return violations.map((entry) => entry.invariant).sort();
}

test('a coherent criterion produces no violations', () => {
  assert.deepEqual(validateCriterion(criterion()), []);
});

test('E1 cannot satisfy a criterion requiring E2 (I14, E01)', () => {
  // "The API returned 200" is an action trace, not a state read-back.
  const violations = validateCriterion(
    criterion({ required_rung: 'E2', achieved_rung: 'E1' }),
  );
  assert.ok(invariants(violations).includes('evidence_sufficiency'));
  assert.equal(rungSatisfies('E1', 'E2'), false);
});

test('an independent read-back at E2 satisfies a STATE criterion (E02)', () => {
  assert.deepEqual(validateCriterion(criterion({ achieved_rung: 'E2' })), []);
});

test('SATISFIED without evidence references is rejected (I5)', () => {
  const violations = validateCriterion(criterion({ evidence_refs: [] }));
  assert.ok(invariants(violations).includes('evidence_present'));
});

test('achieved rung above the type ceiling is rejected', () => {
  const violations = validateCriterion(
    criterion({ type: 'BEHAVIOR', required_rung: 'E3', max_rung: 'E3', achieved_rung: 'E4' }),
  );
  assert.ok(invariants(violations).includes('rung_ceiling'));
});

test('max_rung above the type ceiling is rejected', () => {
  const violations = validateCriterion(criterion({ type: 'BEHAVIOR', max_rung: 'E5' }));
  assert.ok(invariants(violations).includes('rung_ceiling'));
});

test('required beyond max must be declared UNTESTABLE during planning', () => {
  const gapNotDeclared = validateCriterion(
    criterion({ required_rung: 'E4', max_rung: 'E3', achieved_rung: 'E3', state: 'UNTESTED' }),
  );
  assert.ok(invariants(gapNotDeclared).includes('untestable_gap'));

  const declared = validateCriterion(
    criterion({
      required_rung: 'E4',
      max_rung: 'E3',
      achieved_rung: 'E3',
      state: 'UNTESTABLE',
      evidence_refs: [],
    }),
  );
  assert.deepEqual(declared, []);
});

test('a NEGATIVE criterion must name a bounded check surface (E05)', () => {
  const universal = validateCriterion(
    criterion({ type: 'NEGATIVE', required_rung: 'E3', max_rung: 'E3', achieved_rung: 'E3', check_surface: [] }),
  );
  assert.ok(invariants(universal).includes('negative_bounded'));

  const bounded = validateCriterion(
    criterion({
      type: 'NEGATIVE',
      required_rung: 'E3',
      max_rung: 'E3',
      achieved_rung: 'E3',
      check_surface: ['export-a.csv', 'export-b.csv', 'export-c.csv'],
    }),
  );
  assert.deepEqual(bounded, []);
});

test('JUDGMENT cannot be SATISFIED without an acceptor (I9, E04)', () => {
  const noAcceptor = validateCriterion(
    criterion({ type: 'JUDGMENT', required_rung: 'E4', max_rung: 'E4', achieved_rung: 'E4', acceptor_ref: null }),
  );
  assert.ok(invariants(noAcceptor).includes('acceptor_required'));
});

test('JUDGMENT cannot name the Agent as its own acceptor (I9)', () => {
  for (const identity of ['agent', 'Agent', 'self', 'controller']) {
    const violations = validateCriterion(
      criterion({
        type: 'JUDGMENT',
        required_rung: 'E4',
        max_rung: 'E4',
        achieved_rung: 'E4',
        acceptor_ref: identity,
      }),
    );
    assert.ok(invariants(violations).includes('acceptor_not_agent'), identity);
  }
});

test('KNOWLEDGE satisfied by a named external acceptor is accepted', () => {
  const violations = validateCriterion(
    criterion({
      type: 'KNOWLEDGE',
      required_rung: 'E4',
      max_rung: 'E4',
      achieved_rung: 'E4',
      acceptor_ref: 'user:bob',
    }),
  );
  assert.deepEqual(violations, []);
});

test('required_rung below the risk-derived floor is rejected', () => {
  // A public, irreversible action raises the floor to E4 regardless of type.
  const risk = {
    reversibility: 'impossible',
    externality: 'public',
    blast_radius: 'bounded_many',
    undo_window: 'none',
    detectability: 'silent',
  };
  const violations = validateCriterion(criterion({ risk, required_rung: 'E2' }));
  assert.ok(invariants(violations).includes('risk_rung_floor'));

  const derived = deriveRequiredRung('STATE', risk);
  assert.equal(derived.required, 'E4');
  // bounded_many does not raise on its own; the other three dimensions do.
  assert.deepEqual(derived.raisedBy.sort(), ['detectability', 'externality', 'reversibility']);
});

test('private, reversible risk leaves the baseline alone', () => {
  const derived = deriveRequiredRung('STATE', {
    reversibility: 'easy',
    externality: 'private',
    blast_radius: 'one',
    undo_window: 'available',
    detectability: 'loud',
  });
  assert.equal(derived.required, 'E2');
  assert.equal(derived.attainable, true);
  assert.deepEqual(derived.raisedBy, []);
});

test('an unbounded blast radius raises the floor to E4', () => {
  // Every other dimension is stated as benign, isolating blast_radius as the
  // sole escalation. Leaving them unstated would raise the floor by itself.
  const derived = deriveRequiredRung('STATE', {
    reversibility: 'easy',
    externality: 'private',
    blast_radius: 'unbounded',
    undo_window: 'available',
    detectability: 'loud',
  });
  assert.equal(derived.required, 'E4');
  assert.deepEqual(derived.raisedBy, ['blast_radius']);
});

test('an unassessed risk dimension counts as its worst case, raising the floor', () => {
  // Forgetting to assess must never lower a gate. An empty risk profile is
  // therefore treated as public, irreversible, unbounded and silent.
  const derived = deriveRequiredRung('STATE', {});
  assert.equal(derived.required, 'E4');
  assert.deepEqual(derived.raisedBy.sort(), [
    'blast_radius',
    'detectability',
    'externality',
    'reversibility',
  ]);
});

test('a raised floor above a BEHAVIOR ceiling reports unattainable', () => {
  // BEHAVIOR tops out at E3, so any escalation to E4 makes it undecidable — the
  // gap must be reported, not capped away.
  const derived = deriveRequiredRung('BEHAVIOR', {
    reversibility: 'easy',
    externality: 'public',
    blast_radius: 'one',
    undo_window: 'available',
    detectability: 'loud',
  });
  assert.equal(derived.required, 'E4');
  assert.equal(derived.ceiling, 'E3');
  assert.equal(derived.attainable, false);
  assert.deepEqual(derived.raisedBy, ['externality']);
});

test('EFFECT keeps its E5 baseline and is not lowered by risk', () => {
  // E5 already exceeds the E4 escalation floor, so escalation cannot move it.
  const risk = {
    reversibility: 'easy',
    externality: 'public',
    blast_radius: 'one',
    undo_window: 'available',
    detectability: 'loud',
  };
  assert.equal(deriveRequiredRung('EFFECT', risk).required, 'E5');
  assert.equal(deriveRequiredRung('EFFECT', {}).required, 'E5');
});

test('an unknown criterion type is rejected rather than defaulted', () => {
  assert.throws(() => deriveRequiredRung('PERFORMANCE', {}), TypeError);
});

test('assertNoViolations throws a SemanticValidationError listing every defect', () => {
  const violations = validateCriterion(criterion({ evidence_refs: [], achieved_rung: 'E0' }));
  assert.throws(
    () => assertNoViolations('criterion c-001abcd', violations),
    (error) => {
      assert.ok(error instanceof SemanticValidationError);
      assert.equal(error.violations.length, violations.length);
      return true;
    },
  );
});

function event(overrides = {}) {
  return {
    schema_version: 1,
    event_id: '01J8ZQ9TESTEVENT0000000001',
    task_id: TASK_ID,
    segment: 1,
    seq: 5,
    occurred_at: FIXED_TIME,
    type: 'CRITERION_DEFINED',
    actor: 'controller',
    causation_id: null,
    correlation_id: null,
    idempotency_key: null,
    scope_version: 1,
    payload: { criterion_id: 'c-001abcd', type: 'STATE', required_rung: 'E2' },
    artifact_refs: [],
    prev_event_hash: `sha256:${'0'.repeat(64)}`,
    event_hash: `sha256:${'a'.repeat(64)}`,
    ...overrides,
  };
}

/**
 * `validateEventSemantics` requires both reference sets, so every context carries
 * them. That is the point of the contract: an absent set cannot confirm any
 * reference, so it may not be silently read as an empty one.
 */
const KNOWN_EVENT_ID = '01J8ZQ9TESTEVENT0000000000';
const KNOWN_ARTIFACT_ID = 'a-real0001';

function eventCtx(overrides = {}) {
  return {
    taskId: TASK_ID,
    expectedSeq: 5,
    expectedSegment: 1,
    currentScopeVersion: 1,
    knownEventIds: new Set([KNOWN_EVENT_ID]),
    knownArtifactIds: new Set([KNOWN_ARTIFACT_ID]),
    ...overrides,
  };
}

const eventContext = eventCtx();

test('a well-formed event passes semantic validation', () => {
  assert.deepEqual(validateEventSemantics(event(), eventContext), []);
});

test('validateEventSemantics refuses to run without the sets it resolves against', () => {
  // The gate must not answer a question it was not given the facts for. Silently
  // defaulting to an empty set is how the reference checks used to disable
  // themselves: no set meant no comparison meant no violation meant "valid".
  for (const missing of ['knownEventIds', 'knownArtifactIds']) {
    const context = eventCtx();
    delete context[missing];
    assert.throws(
      () => validateEventSemantics(event(), context),
      (error) => {
        assert.ok(error instanceof TypeError);
        assert.match(error.message, new RegExp(`^${missing} must be a Set`));
        return true;
      },
      missing,
    );
  }
});

test('an empty known-artifact set rejects every reference rather than passing them all', () => {
  // A journal with no ARTIFACT_REGISTERED yet is a real state, and in it no
  // artifact_ref can be confirmed. Reading "nothing to compare against" as
  // "nothing to object to" is what let ghost references onto disk (C06).
  const violations = validateEventSemantics(
    event({ artifact_refs: [KNOWN_ARTIFACT_ID] }),
    eventCtx({ knownArtifactIds: new Set() }),
  );
  assert.deepEqual(invariants(violations), ['artifact_resolves']);
});

test('an empty known-event set rejects a causation reference rather than passing it', () => {
  const violations = validateEventSemantics(
    event({ causation_id: KNOWN_EVENT_ID }),
    eventCtx({ knownEventIds: new Set() }),
  );
  assert.deepEqual(invariants(violations), ['causation_resolves']);
});

test('control: a reference present in a non-empty set is accepted', () => {
  // Without this the two tests above would also hold for a validator that
  // rejected every reference unconditionally, which would prove nothing.
  assert.deepEqual(
    validateEventSemantics(
      event({ artifact_refs: [KNOWN_ARTIFACT_ID], causation_id: KNOWN_EVENT_ID }),
      eventContext,
    ),
    [],
  );
});

test('an event bound to another task is rejected', () => {
  const violations = validateEventSemantics(event({ task_id: 'goal-other01' }), eventContext);
  assert.ok(invariants(violations).includes('task_binding'));
});

test('a worker may not author a control plane event (I3)', () => {
  const violations = validateEventSemantics(event({ actor: 'worker:w1' }), eventContext);
  assert.ok(invariants(violations).includes('single_writer'));
});

test('a seq or segment other than the expected one is rejected', () => {
  assert.ok(invariants(validateEventSemantics(event({ seq: 7 }), eventContext)).includes('seq_monotonic'));
  assert.ok(
    invariants(validateEventSemantics(event({ segment: 2 }), eventContext)).includes('segment_binding'),
  );
});

test('only SCOPE_CHANGED may advance scope_version (I2)', () => {
  const drifted = validateEventSemantics(event({ scope_version: 2 }), eventContext);
  assert.ok(invariants(drifted).includes('scope_stable'));

  const changed = validateEventSemantics(
    event({
      type: 'SCOPE_CHANGED',
      scope_version: 2,
      payload: { approved_by: 'decider:alice', reason: 'narrowed to the reachable prefix' },
    }),
    eventContext,
  );
  assert.deepEqual(changed, []);
});

test('SCOPE_CHANGED must increment by one and name its approver', () => {
  const jumped = validateEventSemantics(
    event({ type: 'SCOPE_CHANGED', scope_version: 4, payload: { approved_by: 'decider:alice' } }),
    eventContext,
  );
  assert.ok(invariants(jumped).includes('scope_monotonic'));

  const unapproved = validateEventSemantics(
    event({ type: 'SCOPE_CHANGED', scope_version: 2, payload: {} }),
    eventContext,
  );
  assert.ok(invariants(unapproved).includes('scope_approved'));
});

test('an artifact reference that is not registered is rejected (C06)', () => {
  const violations = validateEventSemantics(event({ artifact_refs: ['a-ghost001'] }), eventContext);
  assert.ok(invariants(violations).includes('artifact_resolves'));
});

test('a causation id that names no known event is rejected', () => {
  const violations = validateEventSemantics(
    event({ causation_id: '01J8ZQ9TESTEVENTGHOST00001' }),
    eventContext,
  );
  assert.ok(invariants(violations).includes('causation_resolves'));
});

test('EFFECT_INTENDED requires an enumerated target set, approval and idempotency key', () => {
  const bare = validateEventSemantics(
    event({ type: 'EFFECT_INTENDED', payload: { action_kind: 'rename' } }),
    eventContext,
  );
  assert.deepEqual(invariants(bare), ['effect_approved', 'effect_enumerated', 'effect_idempotent']);

  const complete = validateEventSemantics(
    event({
      type: 'EFFECT_INTENDED',
      idempotency_key: 'eff:goal-fixture01:rename:ABC1234',
      payload: {
        action_kind: 'rename',
        target_set: ['a.txt', 'b.txt'],
        approval_ref: 'ap-001abcd',
      },
    }),
    eventContext,
  );
  assert.deepEqual(complete, []);
});

test('EVIDENCE_RECORDED must reference at least one artifact', () => {
  const violations = validateEventSemantics(
    event({ type: 'EVIDENCE_RECORDED', payload: { criterion_id: 'c-001abcd', rung: 'E2' } }),
    eventContext,
  );
  assert.ok(invariants(violations).includes('evidence_present'));
});

test('APPROVAL_GRANTED must bind to an action kind and target set', () => {
  const violations = validateEventSemantics(
    event({ type: 'APPROVAL_GRANTED', payload: { approval_id: 'ap-001abcd', granted_by: 'alice' } }),
    eventContext,
  );
  assert.deepEqual(invariants(violations), ['approval_scoped', 'approval_scoped']);
});

test('GOAL_TERMINATED rejects NEEDS_INPUT and demands residual', () => {
  const asTerminal = validateEventSemantics(
    event({ type: 'GOAL_TERMINATED', payload: { status: 'NEEDS_INPUT', residual: [] } }),
    eventContext,
  );
  assert.ok(invariants(asTerminal).includes('terminal_status'));

  const noResidual = validateEventSemantics(
    event({ type: 'GOAL_TERMINATED', payload: { status: 'DONE' } }),
    eventContext,
  );
  assert.ok(invariants(noResidual).includes('handoff_present'));

  const complete = validateEventSemantics(
    event({ type: 'GOAL_TERMINATED', payload: { status: 'DONE', residual: [] } }),
    eventContext,
  );
  assert.deepEqual(complete, []);
});

test('GOAL_ALIGNED requires an explicit approver', () => {
  const silent = validateEventSemantics(event({ type: 'GOAL_ALIGNED', payload: {} }), eventContext);
  assert.ok(invariants(silent).includes('alignment_approved'));
});

test('phase transitions follow the state machine', () => {
  assert.deepEqual(validatePhaseTransition('NEW', 'ALIGNING'), []);
  assert.deepEqual(validatePhaseTransition('ALIGNING', 'PLANNING'), []);
  assert.deepEqual(validatePhaseTransition('VERIFYING', 'EXECUTING'), []);
  assert.deepEqual(validatePhaseTransition('EXECUTING', 'EXECUTING'), []);
  assert.deepEqual(validatePhaseTransition('RECOVERING', 'EXECUTING'), []);

  assert.equal(validatePhaseTransition('NEW', 'EXECUTING').length, 1);
  assert.equal(validatePhaseTransition('TERMINAL', 'EXECUTING').length, 1);
  assert.equal(validatePhaseTransition('ALIGNING', 'VERIFYING').length, 1);
  // The invariant name, not just the count: a length-only assertion passes when an illegal
  // transition is reported as `phase_known`, which would tell the caller the phase does not
  // exist rather than that the move is forbidden. Measured -- renaming `phase_transition` to
  // `phase_known` left the whole suite green, so the count alone pinned nothing.
  assert.equal(validatePhaseTransition('NEW', 'EXECUTING')[0].invariant, 'phase_transition');
  assert.equal(validatePhaseTransition('UNKNOWN', 'NEW')[0].invariant, 'phase_known');
});

test('any non-terminal phase may reach TERMINAL (a BLOCKED fall)', () => {
  for (const phase of ['NEW', 'ALIGNING', 'PLANNING', 'EXECUTING', 'NEEDS_INPUT', 'VERIFYING', 'RECOVERING']) {
    assert.deepEqual(validatePhaseTransition(phase, 'TERMINAL'), [], phase);
  }
});

const KNOWN_OUTPUT_ARTIFACT_ID = 'a-fixture01';

function outputCtx(overrides = {}) {
  return {
    dispatchId: 'd-fixture01',
    role: 'VERIFY',
    dispatchScopeVersion: 1,
    currentScopeVersion: 1,
    artifactIndex: new Map([
      [KNOWN_OUTPUT_ARTIFACT_ID, { artifact_id: KNOWN_OUTPUT_ARTIFACT_ID, truncated: false }],
    ]),
    ...overrides,
  };
}

const outputContext = outputCtx();

test('a well-formed worker output passes', () => {
  assert.deepEqual(validateWorkerOutput(workerOutput(), outputContext), []);
});

test('validateWorkerOutput refuses to run without the artifact index it resolves against', () => {
  // Same contract as the event gate's reference sets: a missing index is the
  // caller's defect, not the output's, and it cannot be answered either way.
  const context = outputCtx();
  delete context.artifactIndex;
  assert.throws(
    () => validateWorkerOutput(workerOutput(), context),
    (error) => {
      assert.ok(error instanceof TypeError);
      assert.match(error.message, /^artifactIndex must be a Map/);
      return true;
    },
  );
});

test('an empty artifact index rejects every evidence_ref rather than passing them all', () => {
  const violations = validateWorkerOutput(workerOutput(), outputCtx({ artifactIndex: new Map() }));
  assert.ok(invariants(violations).includes('claim_evidence_exists'));
});

test('an output for a different dispatch is rejected', () => {
  const violations = validateWorkerOutput(workerOutput({ dispatch_id: 'd-other001' }), outputContext);
  assert.ok(invariants(violations).includes('dispatch_binding'));
});

test('a result computed under a stale scope is flagged (C08, I12)', () => {
  const violations = validateWorkerOutput(
    workerOutput(),
    outputCtx({ dispatchScopeVersion: 1, currentScopeVersion: 2 }),
  );
  const stale = violations.find((entry) => entry.invariant === 'stale_scope');
  assert.ok(stale);
  assert.match(stale.message, /keep the artifact, do not update the ledger/);
});

test('a role may not produce a claim outside its authority', () => {
  // An ACT worker cannot decide that a criterion was checked.
  const violations = validateWorkerOutput(workerOutput(), outputCtx({ role: 'ACT' }));
  assert.ok(invariants(violations).includes('role_claim_authority'));
});

test('a claim without evidence is rejected, but no_finding needs none', () => {
  const noEvidence = validateWorkerOutput(
    workerOutput({
      claims: [{ kind: 'fact_found', subject_ref: 'x', result: 'y' }],
    }),
    outputContext,
  );
  assert.ok(invariants(noEvidence).includes('claim_evidence'));

  const honestEmpty = validateWorkerOutput(
    workerOutput({
      summary: 'Searched all three directories; no matching config found.',
      claims: [{ kind: 'no_finding', subject_ref: 'config search', result: 'none found' }],
      artifact_refs: [],
    }),
    outputContext,
  );
  assert.deepEqual(honestEmpty, []);
});

test('a claim citing an unregistered artifact is rejected (C06)', () => {
  const violations = validateWorkerOutput(
    workerOutput({
      claims: [
        { kind: 'criterion_checked', subject_ref: 'c-1', result: 'ok', evidence_ref: 'a-ghost001', achieved_rung: 'E3' },
      ],
      artifact_refs: [],
    }),
    outputContext,
  );
  assert.ok(invariants(violations).includes('claim_evidence_exists'));
});

test('criterion_checked must state the rung it achieved', () => {
  const violations = validateWorkerOutput(
    workerOutput({
      claims: [
        { kind: 'criterion_checked', subject_ref: 'c-1', result: 'ok', evidence_ref: 'a-fixture01' },
      ],
    }),
    outputContext,
  );
  assert.ok(invariants(violations).includes('claim_rung'));
});

test('status and error must agree', () => {
  assert.ok(
    invariants(validateWorkerOutput(workerOutput({ status: 'FAILED' }), outputContext)).includes(
      'error_present',
    ),
  );
  assert.ok(
    invariants(
      validateWorkerOutput(
        workerOutput({ status: 'SUCCEEDED', error: { code: 'X', message: 'y' } }),
        outputContext,
      ),
    ).includes('error_absent'),
  );
});

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    artifact_id: 'a-001abcd',
    task_id: TASK_ID,
    kind: 'evidence',
    path: 'artifacts/objects/ab/report.txt',
    media_type: 'text/plain',
    bytes: 100,
    sha256: 'a'.repeat(64),
    created_at: FIXED_TIME,
    producer: 'proxy',
    truncated: false,
    original_bytes: 100,
    retention: 'task',
    ...overrides,
  };
}

test('a manifest matching disk facts passes', () => {
  const violations = validateArtifactManifest(manifest(), {
    taskId: TASK_ID,
    existsOnDisk: true,
    actualSha256: 'a'.repeat(64),
    actualBytes: 100,
  });
  assert.deepEqual(violations, []);
});

test('a manifest whose file is missing is rejected (C06)', () => {
  const violations = validateArtifactManifest(manifest(), { existsOnDisk: false });
  assert.ok(invariants(violations).includes('artifact_exists'));
});

test('a manifest whose digest disagrees with disk is rejected', () => {
  const violations = validateArtifactManifest(manifest(), {
    existsOnDisk: true,
    actualSha256: 'b'.repeat(64),
  });
  assert.ok(invariants(violations).includes('digest_matches'));
});

test('an escaping manifest path is rejected (C07)', () => {
  for (const badPath of ['../outside.txt', '/etc/passwd', 'C:/Windows/x', 'a\\b']) {
    const violations = validateArtifactManifest(manifest({ path: badPath }), { existsOnDisk: true });
    assert.ok(invariants(violations).includes('path_containment'), badPath);
  }
});

test('truncation must be reported honestly', () => {
  const dishonest = validateArtifactManifest(
    manifest({ truncated: true, bytes: 100, original_bytes: 100 }),
    { existsOnDisk: true },
  );
  assert.ok(invariants(dishonest).includes('truncation_honest'));

  const inconsistent = validateArtifactManifest(
    manifest({ truncated: false, bytes: 100, original_bytes: 5000 }),
    { existsOnDisk: true },
  );
  assert.ok(invariants(inconsistent).includes('truncation_honest'));

  const honest = validateArtifactManifest(
    manifest({ truncated: true, bytes: 100, original_bytes: 5000 }),
    { existsOnDisk: true },
  );
  assert.deepEqual(honest, []);
});

test('a truncated artifact cannot satisfy a criterion', () => {
  const violations = validateEvidenceUsability(criterion(), [
    { artifact_id: 'a-001abcd', truncated: true },
  ]);
  assert.ok(invariants(violations).includes('truncated_evidence'));

  assert.deepEqual(
    validateEvidenceUsability(criterion(), [{ artifact_id: 'a-001abcd', truncated: false }]),
    [],
  );
});

test('raw worker output is not main-agent ingestible (I4)', () => {
  assert.equal(isMainAgentIngestible('raw_output'), false);
  assert.equal(isMainAgentIngestible('log'), false);
  assert.equal(isMainAgentIngestible('diff'), false);
  assert.equal(isMainAgentIngestible('report'), true);
  assert.equal(isMainAgentIngestible('evidence'), true);
  assert.equal(isMainAgentIngestible('handoff'), true);
});
