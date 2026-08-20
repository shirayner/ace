/**
 * Control-plane protocol tests: evidence ladder, risk mapping, criteria gate,
 * mandate, goal shape, state machine.
 *
 * Acceptance IDs from design §16 are cited where a test covers one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  RUNGS,
  CRITERION_TYPES,
  rungIndex,
  meetsRung,
  criterionType,
  agentMayJudge,
} from '../protocols/runtime/evidence.mjs';

import {
  RISK_DIMENSIONS,
  normalizeRisk,
  riskAtLeast,
  deriveRequiredRung,
  requiresApproval,
  requiresTargetEnumeration,
} from '../protocols/runtime/risk.mjs';

import { gateCriterion, criteriaGate } from '../protocols/runtime/criteria-gate.mjs';
import { assessStep, partitionGoal, validateHandoff } from '../protocols/runtime/mandate.mjs';
import {
  validateGoalShape,
  validateScopeChange,
  detectSilentNarrowing,
} from '../protocols/runtime/goal-shape.mjs';
import {
  PHASES,
  checkTransition,
  validatePhaseOutcome,
} from '../protocols/runtime/state-machine.mjs';

// ---------------------------------------------------------------- evidence ladder

test('evidence ladder is ordered E0..E5 and frozen', () => {
  assert.deepEqual([...RUNGS], ['E0', 'E1', 'E2', 'E3', 'E4', 'E5']);
  assert.ok(Object.isFrozen(RUNGS));
  assert.throws(() => rungIndex('E9'), TypeError);
});

test('E1 never satisfies a criterion requiring E2+ (invariant I14, E01)', () => {
  assert.equal(meetsRung('E1', 'E2'), false);
  assert.equal(meetsRung('E1', 'E1'), true);
  assert.equal(meetsRung('E2', 'E2'), true);
  assert.equal(meetsRung('E4', 'E2'), true);
});

test('JUDGMENT/EFFECT/KNOWLEDGE are never agent-judgeable (invariant I9)', () => {
  assert.equal(agentMayJudge('JUDGMENT'), false);
  assert.equal(agentMayJudge('EFFECT'), false);
  assert.equal(agentMayJudge('KNOWLEDGE'), false);
  assert.equal(agentMayJudge('STATE'), true);
  assert.equal(criterionType('JUDGMENT').decidedBy, 'acceptor');
});

test('criterion type table is deeply frozen', () => {
  assert.ok(Object.isFrozen(CRITERION_TYPES));
  assert.ok(Object.isFrozen(CRITERION_TYPES.STATE));
  assert.throws(() => { CRITERION_TYPES.STATE.baseline = 'E0'; }, TypeError);
});

// ------------------------------------------------------------------ risk mapping

test('unassessed risk dimensions default to worst case', () => {
  const { risk, unassessed } = normalizeRisk({});
  assert.equal(risk.reversibility, 'impossible');
  assert.equal(risk.externality, 'public');
  assert.equal(risk.detectability, 'silent');
  assert.equal(unassessed.length, Object.keys(RISK_DIMENSIONS).length);
});

test('risk dimension ordering is monotone', () => {
  assert.ok(riskAtLeast('externality', 'public', 'shared'));
  assert.ok(!riskAtLeast('externality', 'private', 'shared'));
  assert.throws(() => riskAtLeast('externality', 'nonsense', 'shared'), TypeError);
});

test('private reversible STATE criterion stays at baseline E2', () => {
  const result = deriveRequiredRung({
    type: 'STATE',
    risk: {
      reversibility: 'easy',
      externality: 'private',
      blast_radius: 'one',
      undo_window: 'available',
      detectability: 'loud',
    },
  });
  assert.equal(result.required, 'E2');
  assert.equal(result.untestable, false);
  assert.deepEqual(result.escalations, []);
});

test('leaving the private domain raises required rung to E4 (§2.6)', () => {
  const result = deriveRequiredRung({
    type: 'STATE',
    risk: {
      reversibility: 'easy',
      externality: 'public',
      blast_radius: 'one',
      undo_window: 'available',
      detectability: 'loud',
    },
  });
  assert.equal(result.required, 'E4');
  assert.equal(result.escalations[0].code, 'EXTERNALITY_NOT_PRIVATE');
});

test('silent failure and irreversibility each independently escalate to E4', () => {
  const base = {
    reversibility: 'easy',
    externality: 'private',
    blast_radius: 'one',
    undo_window: 'available',
    detectability: 'loud',
  };
  assert.equal(
    deriveRequiredRung({ type: 'STATE', risk: { ...base, detectability: 'silent' } }).required,
    'E4',
  );
  assert.equal(
    deriveRequiredRung({ type: 'STATE', risk: { ...base, reversibility: 'impossible' } }).required,
    'E4',
  );
  assert.equal(
    deriveRequiredRung({ type: 'STATE', risk: { ...base, blast_radius: 'unbounded' } }).required,
    'E4',
  );
});

test('required rung above the type ceiling reports UNTESTABLE, never a silent cap', () => {
  // BEHAVIOR ceilings at E3, but a public irreversible action demands E4.
  const result = deriveRequiredRung({
    type: 'BEHAVIOR',
    risk: {
      reversibility: 'impossible',
      externality: 'public',
      blast_radius: 'one',
      undo_window: 'none',
      detectability: 'loud',
    },
  });
  assert.equal(result.required, 'E4');
  assert.equal(result.ceiling, 'E3');
  assert.equal(result.untestable, true, 'must surface as UNTESTABLE at planning time');
  assert.equal(result.effectiveRequired, 'E3');
});

test('per-criterion ceiling may lower but never raise the type ceiling', () => {
  const lowered = deriveRequiredRung({ type: 'STATE', maxRung: 'E2', risk: {} });
  assert.equal(lowered.ceiling, 'E2');
  const attemptedRaise = deriveRequiredRung({ type: 'BEHAVIOR', maxRung: 'E5', risk: {} });
  assert.equal(attemptedRaise.ceiling, 'E3', 'type ceiling wins');
});

test('approval gate is driven by risk dimensions, not tool identity', () => {
  const safe = requiresApproval({
    reversibility: 'easy',
    externality: 'private',
    blast_radius: 'one',
    undo_window: 'available',
    detectability: 'loud',
  });
  assert.equal(safe.required, false);

  const sending = requiresApproval({
    reversibility: 'impossible',
    externality: 'public',
    blast_radius: 'one',
    undo_window: 'none',
    detectability: 'loud',
  });
  assert.equal(sending.required, true);
  assert.ok(sending.triggers.some((t) => t.code === 'LEAVES_PRIVATE_DOMAIN'));
});

test('bounded_many requires target enumeration; unbounded is not enumerable (R01)', () => {
  const bounded = requiresTargetEnumeration({ blast_radius: 'bounded_many' });
  assert.equal(bounded.required, true);
  assert.equal(bounded.enumerable, true);

  const unbounded = requiresTargetEnumeration({ blast_radius: 'unbounded' });
  assert.equal(unbounded.required, true);
  assert.equal(unbounded.enumerable, false);
});

// ----------------------------------------------------------------- criteria gate

test('unclassified criterion cannot enter execution (§2.4 rule 1)', () => {
  const result = gateCriterion({ criterion_id: 'c-1', statement: '订阅已取消' });
  assert.equal(result.admissible, false);
  assert.ok(result.blockers.some((b) => b.code === 'UNCLASSIFIED'));
});

test('unquantified vague predicate blocks unless downgraded to JUDGMENT (E05 sibling)', () => {
  const blocked = gateCriterion({
    criterion_id: 'c-1',
    type: 'STATE',
    statement: '接口响应要快',
    risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
  });
  assert.equal(blocked.admissible, false);
  assert.ok(blocked.blockers.some((b) => b.code === 'UNQUANTIFIED_VAGUE_PREDICATE'));

  const quantified = gateCriterion({
    criterion_id: 'c-2',
    type: 'STATE',
    statement: '接口 P99 响应快于 200ms',
    risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
  });
  assert.equal(quantified.admissible, true);

  const downgraded = gateCriterion({
    criterion_id: 'c-3',
    type: 'JUDGMENT',
    statement: '这封信要动人',
    acceptor_ref: 'user:owner',
    risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
  });
  assert.equal(downgraded.admissible, true);
  assert.ok(downgraded.warnings.some((w) => w.code === 'VAGUE_BUT_DOWNGRADED'));
});

test('universal NEGATIVE phrasing is rejected, bounded surface accepted (E05)', () => {
  const universal = gateCriterion({
    criterion_id: 'c-1',
    type: 'NEGATIVE',
    statement: '没有任何问题',
    risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
  });
  assert.equal(universal.admissible, false);
  assert.ok(universal.blockers.some((b) => b.code === 'UNIVERSAL_NEGATIVE'));
  assert.ok(universal.blockers.some((b) => b.code === 'MISSING_CHECK_SURFACE'));

  const bounded = gateCriterion({
    criterion_id: 'c-2',
    type: 'NEGATIVE',
    statement: '在 A/B/C 三处检查未发现 PII 外泄',
    check_surface: ['module A', 'module B', 'module C'],
    risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
  });
  assert.equal(bounded.admissible, true);
});

test('JUDGMENT without a reachable acceptor is untestable; Agent cannot self-accept (E04, I9)', () => {
  const noAcceptor = gateCriterion({
    criterion_id: 'c-1',
    type: 'JUDGMENT',
    statement: '建议质量达到评审标准',
  });
  assert.equal(noAcceptor.admissible, false);
  assert.equal(noAcceptor.untestable, true);
  assert.ok(noAcceptor.blockers.some((b) => b.code === 'ACCEPTOR_REQUIRED'));

  const selfAccept = gateCriterion({
    criterion_id: 'c-2',
    type: 'JUDGMENT',
    statement: '建议质量达到评审标准',
    acceptor_ref: 'agent',
  });
  assert.equal(selfAccept.admissible, false);
  assert.ok(selfAccept.blockers.some((b) => b.code === 'AGENT_CANNOT_ACCEPT'));

  const workerAccept = gateCriterion({
    criterion_id: 'c-3',
    type: 'KNOWLEDGE',
    statement: '用户能独立推导共识算法的安全性论证',
    acceptor_ref: 'worker:verify-1',
  });
  assert.equal(workerAccept.admissible, false);
  assert.ok(workerAccept.blockers.some((b) => b.code === 'AGENT_CANNOT_ACCEPT'));
});

test('EFFECT beyond horizon needs a proxy metric or deferral (§2.4)', () => {
  const beyond = gateCriterion({
    criterion_id: 'c-1',
    type: 'EFFECT',
    statement: '流失率下降 5%',
    within_horizon: false,
  });
  assert.ok(beyond.blockers.some((b) => b.code === 'EFFECT_BEYOND_HORIZON'));

  const proxied = gateCriterion({
    criterion_id: 'c-2',
    type: 'EFFECT',
    statement: '流失率下降 5%',
    within_horizon: false,
    proxy_metric: '首周留存（声明为代理指标）',
  });
  assert.equal(proxied.blockers.some((b) => b.code === 'EFFECT_BEYOND_HORIZON'), false);
});

test('empty criterion set is inadmissible so DONE cannot be reached vacuously', () => {
  const result = criteriaGate([]);
  assert.equal(result.admissible, false);
  assert.ok(result.blockers.some((b) => b.code === 'NO_CRITERIA'));
});

test('criteriaGate attributes each blocker to its criterion', () => {
  const result = criteriaGate([
    { criterion_id: 'c-ok', type: 'STATE', statement: '文件全部改名为 P 前缀', risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' } },
    { criterion_id: 'c-bad', statement: '看起来还行' },
  ]);
  assert.equal(result.admissible, false);
  assert.ok(result.blockers.every((b) => b.criterion_id !== undefined));
  assert.ok(result.blockers.some((b) => b.criterion_id === 'c-bad' && b.code === 'UNCLASSIFIED'));
});

// ----------------------------------------------------------------------- mandate

test('access and authority are orthogonal: credentials are not permission (R03)', () => {
  const result = assessStep({
    step: { step_id: 's-1', requires: ['effector', 'access', 'authority'] },
    mandate: { effector: ['api'], access: ['token'], authority: [] },
  });
  assert.equal(result.attainable, false);
  assert.deepEqual(result.gaps.map((g) => g.component), ['authority']);
  assert.equal(result.interruption.interruptionCode, 'APPROVAL_REQUIRED');
});

test('missing effector implies reachable-prefix redefinition, not a question', () => {
  const result = assessStep({
    step: { requires: ['effector'] },
    mandate: { effector: [] },
  });
  assert.equal(result.attainable, false);
  assert.equal(result.gaps[0].onMissing, 'REDEFINE_TO_REACHABLE_PREFIX');
  assert.equal(result.interruption, null, 'no principal can answer an effector gap');
});

test('missing observation implies UNVERIFIABLE', () => {
  const result = assessStep({
    step: { requires: ['effector', 'observation'] },
    mandate: { effector: ['fs'], observation: [] },
  });
  assert.equal(result.gaps[0].onMissing, 'UNVERIFIABLE');
});

test('expired mandate reopens the authority gap', () => {
  const result = assessStep({
    step: { requires: ['effector'] },
    mandate: { effector: ['api'], expires_at: '2000-01-01T00:00:00.000Z' },
  });
  assert.equal(result.attainable, false);
  assert.ok(result.gaps.some((g) => g.detail === 'mandate 已过期'));
});

test('non-empty residual caps outcome at PARTIAL and requires disclosure (§2.2)', () => {
  const result = partitionGoal({
    criteria: [
      { criterion_id: 'c-1', type: 'ARTIFACT_PROPERTY', requires: ['effector', 'competence'] },
      { criterion_id: 'c-2', type: 'EFFECT', requires: ['effector'] },
    ],
    mandate: { effector: [], competence: ['writing'] },
  });
  assert.equal(result.maxOutcome, 'PARTIAL');
  assert.equal(result.disclosureRequired, true);
  assert.equal(result.residual.length, 2);
});

test('fully covered goal allows DONE as max outcome', () => {
  const result = partitionGoal({
    criteria: [{ criterion_id: 'c-1', type: 'STATE', requires: ['effector', 'competence'] }],
    mandate: { effector: ['fs'], competence: ['refactor'] },
  });
  assert.equal(result.maxOutcome, 'DONE');
  assert.equal(result.residual.length, 0);
});

test('unknown mandate component is a programming error, not a silent pass', () => {
  assert.throws(
    () => assessStep({ step: { requires: ['telepathy'] }, mandate: {} }),
    TypeError,
  );
});

test('handoff must carry residual, owner, next action and acceptance (I15)', () => {
  assert.equal(validateHandoff({}).valid, false);
  assert.equal(
    validateHandoff({
      residual_items: [],
      responsible: 'n/a',
      next_action: 'none',
      acceptance: 'n/a',
    }).valid,
    true,
    'empty residual still requires the fields to exist',
  );
  const withResidual = validateHandoff({
    residual_items: ['发送邮件'],
    responsible: '',
    next_action: '',
    acceptance: '收到回执',
  });
  assert.equal(withResidual.valid, false);
});

// -------------------------------------------------------------------- goal shape

test('action-phrased intent is rejected with a rewrite instruction (U01)', () => {
  const result = validateGoalShape({
    intent: '做一个批量导入功能',
    subject: 'ops-console',
    principals: { owner: 'u', decider: 'u', acceptor: 'u' },
    scope: { in: ['import'], out: ['export'] },
    scope_version: 1,
    criteria: [{ criterion_id: 'c-1' }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.blockers.some((b) => b.code === 'INTENT_IS_ACTION'));
});

test('delta-phrased intent passes shape validation', () => {
  const result = validateGoalShape({
    intent: '运营不再需要每天手工录入 2 万条记录',
    subject: 'ops-console 的日常录入流程',
    principals: { owner: 'u', decider: 'u', acceptor: 'u' },
    scope: { in: ['批量导入'], out: ['报表改版'] },
    scope_version: 1,
    criteria: [{ criterion_id: 'c-1' }],
    horizon: '本季度内',
  });
  assert.equal(result.valid, true, JSON.stringify(result.blockers));
});

test('scope.out is as mandatory as scope.in (§2.1)', () => {
  const result = validateGoalShape({
    intent: '运营不再手工录入',
    subject: 's',
    principals: { owner: 'u', decider: 'u', acceptor: 'u' },
    scope: { in: ['a'] },
    scope_version: 1,
    criteria: [{ criterion_id: 'c-1' }],
  });
  assert.ok(result.blockers.some((b) => b.code === 'MISSING_SCOPE_OUT'));
});

test('every principal role must be filled even when one person holds all three', () => {
  const result = validateGoalShape({
    intent: '运营不再手工录入',
    subject: 's',
    principals: { owner: 'u' },
    scope: { in: ['a'], out: ['b'] },
    scope_version: 1,
    criteria: [{ criterion_id: 'c-1' }],
  });
  const missing = result.blockers.filter((b) => b.code === 'MISSING_PRINCIPAL');
  assert.equal(missing.length, 2);
});

test('scope_version advances only via decider-approved single increments (I2)', () => {
  const ok = validateScopeChange({
    from: 1,
    to: 2,
    decider: 'user:alice',
    approval: { scope_version: 1, granted_by: 'user:alice' },
  });
  assert.equal(ok.valid, true);

  const noApproval = validateScopeChange({ from: 1, to: 2 });
  assert.ok(noApproval.problems.some((p) => p.code === 'SCOPE_CHANGE_WITHOUT_APPROVAL'));

  const jump = validateScopeChange({
    from: 1,
    to: 4,
    decider: 'user:alice',
    approval: { scope_version: 1, granted_by: 'user:alice' },
  });
  assert.ok(jump.problems.some((p) => p.code === 'NON_MONOTONIC_SCOPE_VERSION'));

  const wrongApprover = validateScopeChange({
    from: 1,
    to: 2,
    decider: 'user:alice',
    approval: { scope_version: 1, granted_by: 'agent' },
  });
  assert.ok(wrongApprover.problems.some((p) => p.code === 'APPROVER_NOT_DECIDER'));
});

test('silently dropped criteria cap the outcome at PARTIAL (O02)', () => {
  const result = detectSilentNarrowing({
    originalCriteria: [{ criterion_id: 'c-1' }, { criterion_id: 'c-2' }],
    currentCriteria: [{ criterion_id: 'c-1' }],
  });
  assert.equal(result.narrowed, true);
  assert.deepEqual(result.droppedCriteria, ['c-2']);
  assert.equal(result.maxOutcome, 'PARTIAL');

  const declared = detectSilentNarrowing({
    originalCriteria: [{ criterion_id: 'c-1' }, { criterion_id: 'c-2' }],
    currentCriteria: [{ criterion_id: 'c-1' }],
    mootRecords: [{ criterion_id: 'c-2' }],
  });
  assert.equal(declared.narrowed, false);
});

// ------------------------------------------------------------------ state machine

test('BLOCKED is an outcome, not a phase (§6.1)', () => {
  assert.ok(!PHASES.includes('BLOCKED'));
  assert.ok(PHASES.includes('NEEDS_INPUT'));
  assert.ok(PHASES.includes('TERMINAL'));
});

test('ALIGNING to PLANNING requires the full alignment guard set (§6.3)', () => {
  const blocked = checkTransition({ from: 'ALIGNING', to: 'PLANNING', context: {} });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.unmet.length, 4);

  const cleared = checkTransition({
    from: 'ALIGNING',
    to: 'PLANNING',
    context: {
      goalComplete: true,
      scopeInOutDefined: true,
      criteriaClassified: true,
      approvalRecorded: true,
    },
  });
  assert.equal(cleared.allowed, true);
});

test('an unproven guard condition counts as unmet, not satisfied', () => {
  const truthy = checkTransition({
    from: 'NEW',
    to: 'ALIGNING',
    context: { taskRootPersisted: 'yes' },
  });
  assert.equal(truthy.allowed, false, 'only boolean true clears a guard');
});

test('illegal transitions are rejected by name', () => {
  const result = checkTransition({ from: 'NEW', to: 'VERIFYING', context: {} });
  assert.equal(result.allowed, false);
  assert.equal(result.unmet[0].code, 'ILLEGAL_TRANSITION');
  assert.throws(() => checkTransition({ from: 'NOPE', to: 'ALIGNING' }), TypeError);
});

test('any live phase may be interrupted or terminate; TERMINAL cannot', () => {
  for (const phase of ['ALIGNING', 'PLANNING', 'EXECUTING', 'VERIFYING']) {
    const interrupt = checkTransition({
      from: phase,
      to: 'NEEDS_INPUT',
      context: {
        namedInputIdentified: true,
        resumableAsIs: true,
        interruptionInvariantsHeld: true,
      },
    });
    assert.equal(interrupt.allowed, true, `${phase} → NEEDS_INPUT`);
  }
  const fromTerminal = checkTransition({ from: 'TERMINAL', to: 'EXECUTING', context: {} });
  assert.equal(fromTerminal.allowed, false);
});

test('TERMINAL requires a reducer-derived outcome and complete handoff (I1, I15)', () => {
  const narrative = checkTransition({
    from: 'VERIFYING',
    to: 'TERMINAL',
    context: { handoffComplete: true },
  });
  assert.equal(narrative.allowed, false);
  assert.ok(narrative.unmet.some((u) => u.condition === 'outcomeDerived'));
});

test('phase and outcome pairings are validated in both directions', () => {
  assert.equal(validatePhaseOutcome({ phase: 'EXECUTING', outcome: null }).valid, true);

  const sealedMidflight = validatePhaseOutcome({ phase: 'EXECUTING', outcome: 'DONE' });
  assert.equal(sealedMidflight.valid, false);
  assert.equal(sealedMidflight.problems[0].code, 'NON_TERMINAL_WITH_SEALED_OUTCOME');

  const terminalNoOutcome = validatePhaseOutcome({ phase: 'TERMINAL', outcome: null });
  assert.equal(terminalNoOutcome.valid, false);

  const blockedNoReason = validatePhaseOutcome({ phase: 'TERMINAL', outcome: 'BLOCKED' });
  assert.ok(blockedNoReason.problems.some((p) => p.code === 'BLOCKED_WITHOUT_REASON'));

  const blockedOk = validatePhaseOutcome({
    phase: 'TERMINAL',
    outcome: 'BLOCKED',
    blocked_reason: 'FALSIFIED',
  });
  assert.equal(blockedOk.valid, true);

  const mismatch = validatePhaseOutcome({ phase: 'EXECUTING', outcome: 'NEEDS_INPUT' });
  assert.ok(mismatch.problems.some((p) => p.code === 'NEEDS_INPUT_PHASE_MISMATCH'));
});
