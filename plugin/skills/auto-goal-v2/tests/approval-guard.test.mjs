/**
 * Approval, delta re-approval and interruption invariant tests.
 *
 * Acceptance IDs from design §16: R01, R02, R03, O05.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  recordApproval,
  isNonApproval,
  checkDeltaApproval,
  checkInterruptionInvariants,
} from '../protocols/runtime/approval.mjs';
import { gateStep, checkHardGates, HARD_GATES } from '../protocols/runtime/planning-gate.mjs';

const LOW_RISK = {
  reversibility: 'easy',
  externality: 'private',
  blast_radius: 'one',
  undo_window: 'available',
  detectability: 'loud',
};

const BULK_RISK = {
  reversibility: 'costly',
  externality: 'private',
  blast_radius: 'bounded_many',
  undo_window: 'short',
  detectability: 'observable',
};

function validApproval(overrides = {}) {
  const result = recordApproval({
    approval_id: 'ap-1',
    action_kind: 'RENAME_FILES',
    targets: ['f1', 'f2', 'f3'],
    scope_version: 1,
    risk: BULK_RISK,
    granted_by: 'user:alice',
    verbatim: '批准对这 3 个文件执行改名',
    granted_at: '2026-08-12T10:00:00.000Z',
    ...overrides,
  });
  return result;
}

// -------------------------------------------------------------- approval records

test('approval binds action kind, enumerated targets, scope version and granter (§10.1)', () => {
  const { valid, record, problems } = validApproval();
  assert.equal(valid, true, JSON.stringify(problems));
  assert.deepEqual([...record.targets], ['f1', 'f2', 'f3']);
  assert.equal(record.target_count, 3);
  assert.equal(record.scope_version, 1);
  assert.equal(record.granted_by, 'user:alice');
  assert.equal(record.verbatim, '批准对这 3 个文件执行改名');
});

test('approval without an enumerated target set is invalid', () => {
  const { valid, problems } = validApproval({ targets: '所有旧文件' });
  assert.equal(valid, false);
  assert.ok(problems.some((p) => p.code === 'TARGETS_NOT_ENUMERATED'));
});

test('approval must record the verbatim utterance, not a paraphrase slot', () => {
  const { valid, problems } = validApproval({ verbatim: '' });
  assert.equal(valid, false);
  assert.ok(problems.some((p) => p.code === 'MISSING_VERBATIM'));
});

test('"继续" and friends do not constitute approval (§3.4)', () => {
  assert.equal(isNonApproval('继续'), true);
  assert.equal(isNonApproval('继续。'), true);
  assert.equal(isNonApproval('ok'), true);
  assert.equal(isNonApproval('LGTM'), true);
  assert.equal(isNonApproval('批准 scope_version=1'), false);

  const { valid, problems } = validApproval({ verbatim: '继续' });
  assert.equal(valid, false);
  assert.ok(problems.some((p) => p.code === 'NOT_AN_APPROVAL'));
});

test('approval with no risk assessment at all is invalid', () => {
  const { valid, problems } = validApproval({ risk: undefined });
  assert.equal(valid, false);
  assert.ok(problems.some((p) => p.code === 'RISK_NOT_ASSESSED'));
});

test('approval must name a scope_version', () => {
  const { valid, problems } = validApproval({ scope_version: undefined });
  assert.equal(valid, false);
  assert.ok(problems.some((p) => p.code === 'MISSING_SCOPE_VERSION'));
});

// ------------------------------------------------------------ delta re-approval

test('10 approved targets becoming 11 forces re-approval (R02)', () => {
  const approved = Array.from({ length: 10 }, (_, i) => `f${i}`);
  const { record } = validApproval({ targets: approved });

  const same = checkDeltaApproval({
    approval: record,
    action: { action_kind: 'RENAME_FILES', targets: approved, risk: BULK_RISK },
    currentScopeVersion: 1,
  });
  assert.equal(same.reapprovalRequired, false);

  const grown = checkDeltaApproval({
    approval: record,
    action: { action_kind: 'RENAME_FILES', targets: [...approved, 'f10'], risk: BULK_RISK },
    currentScopeVersion: 1,
  });
  assert.equal(grown.reapprovalRequired, true);
  assert.ok(grown.reasons.some((r) => r.code === 'TARGET_SET_EXPANDED'));
  assert.deepEqual(grown.unapprovedTargets, ['f10']);
});

test('swapping a target keeps the count but still forces re-approval (§5.4 misidentification)', () => {
  const { record } = validApproval({ targets: ['f1', 'f2', 'f3'] });
  const swapped = checkDeltaApproval({
    approval: record,
    action: { action_kind: 'RENAME_FILES', targets: ['f1', 'f2', 'f9'], risk: BULK_RISK },
    currentScopeVersion: 1,
  });
  assert.equal(swapped.reapprovalRequired, true);
  assert.deepEqual(swapped.unapprovedTargets, ['f9']);
});

test('a strict subset of approved targets needs no re-approval', () => {
  const { record } = validApproval({ targets: ['f1', 'f2', 'f3'] });
  const shrunk = checkDeltaApproval({
    approval: record,
    action: { action_kind: 'RENAME_FILES', targets: ['f1'], risk: BULK_RISK },
    currentScopeVersion: 1,
  });
  assert.equal(shrunk.reapprovalRequired, false);
});

test('each risk dimension increase independently forces re-approval (§10.2)', () => {
  const { record } = validApproval();
  const worse = [
    { ...BULK_RISK, externality: 'public' },
    { ...BULK_RISK, reversibility: 'impossible' },
    { ...BULK_RISK, blast_radius: 'unbounded' },
    { ...BULK_RISK, undo_window: 'none' },
    { ...BULK_RISK, detectability: 'silent' },
  ];
  for (const risk of worse) {
    const result = checkDeltaApproval({
      approval: record,
      action: { action_kind: 'RENAME_FILES', targets: ['f1', 'f2', 'f3'], risk },
      currentScopeVersion: 1,
    });
    assert.equal(result.reapprovalRequired, true, JSON.stringify(risk));
    assert.ok(result.reasons.some((r) => r.code === 'RISK_INCREASED'));
  }
});

test('lowering risk does not require re-approval', () => {
  const { record } = validApproval();
  const result = checkDeltaApproval({
    approval: record,
    action: { action_kind: 'RENAME_FILES', targets: ['f1'], risk: LOW_RISK },
    currentScopeVersion: 1,
  });
  assert.equal(result.reapprovalRequired, false);
});

test('scope_version change invalidates a prior approval (I2 companion)', () => {
  const { record } = validApproval();
  const result = checkDeltaApproval({
    approval: record,
    action: { action_kind: 'RENAME_FILES', targets: ['f1', 'f2', 'f3'], risk: BULK_RISK },
    currentScopeVersion: 2,
  });
  assert.equal(result.reapprovalRequired, true);
  assert.ok(result.reasons.some((r) => r.code === 'SCOPE_VERSION_CHANGED'));
});

test('action kind change invalidates approval: approvals do not transfer', () => {
  const { record } = validApproval();
  const result = checkDeltaApproval({
    approval: record,
    action: { action_kind: 'DELETE_FILES', targets: ['f1', 'f2', 'f3'], risk: BULK_RISK },
    currentScopeVersion: 1,
  });
  assert.equal(result.reapprovalRequired, true);
  assert.ok(result.reasons.some((r) => r.code === 'ACTION_KIND_CHANGED'));
});

test('expired approval forces re-approval', () => {
  const { record } = validApproval({ expires_at: '2026-08-12T11:00:00.000Z' });
  const result = checkDeltaApproval({
    approval: record,
    action: {
      action_kind: 'RENAME_FILES',
      targets: ['f1', 'f2', 'f3'],
      risk: BULK_RISK,
      now: '2026-08-12T12:00:00.000Z',
    },
    currentScopeVersion: 1,
  });
  assert.equal(result.reapprovalRequired, true);
  assert.ok(result.reasons.some((r) => r.code === 'APPROVAL_EXPIRED'));
});

test('absent approval always requires approval', () => {
  const result = checkDeltaApproval({ approval: null, action: { targets: ['f1'] } });
  assert.equal(result.reapprovalRequired, true);
  assert.equal(result.reasons[0].code, 'NO_APPROVAL_ON_RECORD');
});

// ------------------------------------------------------ interruption invariants

function validInterruption(overrides = {}) {
  return {
    question: '是否批准对这 3 个文件执行改名？',
    required_from: 'decider',
    resume_token: 'rt-1',
    default_if_no_response: 'NO_ACTION',
    options: [
      { id: 'approve', label: '批准', tradeoff: '立即执行，撤销代价中等' },
      { id: 'reject', label: '拒绝', tradeoff: '目标停留在 PARTIAL' },
    ],
    in_flight_irreversible: false,
    state_coherent: true,
    ...overrides,
  };
}

test('a well-formed single-decision interruption passes (O05)', () => {
  const result = checkInterruptionInvariants(validInterruption());
  assert.equal(result.valid, true, JSON.stringify(result.violations));
});

test('no interruption while an irreversible side effect is in flight (§10.3)', () => {
  const result = checkInterruptionInvariants(
    validInterruption({ in_flight_irreversible: true }),
  );
  assert.equal(result.valid, false);
  assert.ok(result.violations.some((v) => v.code === 'IRREVERSIBLE_IN_FLIGHT'));
});

test('incoherent state must be rolled back before interrupting', () => {
  const result = checkInterruptionInvariants(validInterruption({ state_coherent: false }));
  assert.ok(result.violations.some((v) => v.code === 'INCOHERENT_STATE'));
});

test('one interruption carries exactly one decision (U03)', () => {
  const multi = checkInterruptionInvariants(
    validInterruption({ question: '要用哪种存储？另外，是否允许异步？' }),
  );
  assert.equal(multi.valid, false);
  assert.ok(multi.violations.some((v) => v.code === 'MULTIPLE_DECISIONS'));
});

test('alternatives are one decision; additive asks are two (U03 boundary)', () => {
  // A single decision offered as mutually exclusive alternatives is the
  // *recommended* phrasing, so counting question marks alone over-triggers.
  const oneDecision = [
    '是否批准？',
    '批准吗？还是拒绝？',
    '选 A 还是 B？',
    '是否批准对这 3 个文件改名（撤销代价中等）？',
  ];
  for (const question of oneDecision) {
    assert.equal(
      checkInterruptionInvariants(validInterruption({ question })).valid,
      true,
      `should be one decision: ${question}`,
    );
  }

  const twoDecisions = [
    '要用哪种存储？另外，是否允许异步？',
    '用 MySQL 还是 PG？另外要不要加缓存？',
    '先做 A 吗？同时 B 也要吗？',
  ];
  for (const question of twoDecisions) {
    const result = checkInterruptionInvariants(validInterruption({ question }));
    assert.equal(result.valid, false, `should be rejected: ${question}`);
    assert.ok(
      result.violations.some((v) => v.code === 'MULTIPLE_DECISIONS'),
      `should cite MULTIPLE_DECISIONS: ${question}`,
    );
  }
});

test('options must be 2 to 3 mutually exclusive choices', () => {
  assert.ok(
    checkInterruptionInvariants(validInterruption({ options: [{ id: 'ok' }] }))
      .violations.some((v) => v.code === 'INSUFFICIENT_OPTIONS'),
  );
  assert.ok(
    checkInterruptionInvariants(
      validInterruption({ options: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }),
    ).violations.some((v) => v.code === 'TOO_MANY_OPTIONS'),
  );
});

test('the no-response default must be NO_ACTION or SAFE_ROLLBACK (§10.3)', () => {
  assert.ok(
    checkInterruptionInvariants(validInterruption({ default_if_no_response: 'PROCEED' }))
      .violations.some((v) => v.code === 'UNSAFE_DEFAULT'),
  );
  assert.equal(
    checkInterruptionInvariants(validInterruption({ default_if_no_response: 'SAFE_ROLLBACK' }))
      .valid,
    true,
  );
  assert.ok(
    checkInterruptionInvariants(validInterruption({ default_if_no_response: undefined }))
      .violations.some((v) => v.code === 'MISSING_DEFAULT'),
  );
});

test('interruption needs a resume token and a named principal', () => {
  assert.ok(
    checkInterruptionInvariants(validInterruption({ resume_token: undefined }))
      .violations.some((v) => v.code === 'MISSING_RESUME_TOKEN'),
  );
  assert.ok(
    checkInterruptionInvariants(validInterruption({ required_from: undefined }))
      .violations.some((v) => v.code === 'MISSING_REQUIRED_FROM'),
  );
});

test('non-serialisable interruption payload is rejected', () => {
  const cyclic = validInterruption();
  cyclic.self = cyclic;
  const result = checkInterruptionInvariants(cyclic);
  assert.ok(result.violations.some((v) => v.code === 'NOT_SERIALISABLE'));
});

// -------------------------------------------------------------- composed gating

const GOOD_GOAL = {
  intent: '运营不再需要每天手工录入 2 万条记录',
  subject: 'ops-console 录入流程',
  principals: { owner: 'user:alice', decider: 'user:alice', acceptor: 'user:alice' },
  scope: { in: ['批量导入'], out: ['报表改版'] },
  scope_version: 1,
  horizon: '本季度',
  criteria: [
    {
      criterion_id: 'c-1',
      type: 'STATE',
      statement: '3000 个文件全部改名为 P 前缀',
      risk: BULK_RISK,
    },
  ],
};

test('high blast radius without an enumerated target set is blocked (R01)', () => {
  const result = gateStep({
    goal: GOOD_GOAL,
    step: {
      step_id: 's-1',
      has_side_effect: true,
      action_kind: 'RENAME_FILES',
      risk: BULK_RISK,
      requires: ['effector', 'competence'],
    },
    mandate: { effector: ['fs'], competence: ['rename'] },
    approval: null,
  });
  assert.equal(result.cleared, false);
  assert.ok(result.blockers.some((b) => b.code === 'TARGETS_NOT_ENUMERATED'));
  assert.equal(result.recommendedPhase, 'NEEDS_INPUT');
});

test('enumerated targets plus matching approval clears the side-effect guard', () => {
  const { record } = validApproval({ targets: ['f1', 'f2', 'f3'] });
  const result = gateStep({
    goal: GOOD_GOAL,
    step: {
      step_id: 's-1',
      has_side_effect: true,
      action_kind: 'RENAME_FILES',
      targets: ['f1', 'f2', 'f3'],
      risk: BULK_RISK,
      requires: ['effector', 'competence'],
      criteria: ['c-1'],
    },
    mandate: { effector: ['fs'], competence: ['rename'] },
    approval: record,
  });
  assert.equal(result.cleared, true, JSON.stringify(result.blockers));
  assert.equal(result.recommendedPhase, 'EXECUTING');
});

test('mandate gap with no principal key recommends BLOCKED, not a question', () => {
  const result = gateStep({
    goal: GOOD_GOAL,
    step: { step_id: 's-1', requires: ['effector'], has_side_effect: false },
    mandate: { effector: [] },
  });
  assert.equal(result.cleared, false);
  assert.equal(result.interruption, null);
  assert.equal(result.recommendedPhase, 'BLOCKED');
});

test('mandate gap a principal can close recommends NEEDS_INPUT (R03)', () => {
  const result = gateStep({
    goal: GOOD_GOAL,
    step: {
      step_id: 's-1',
      requires: ['effector', 'access'],
      has_side_effect: false,
    },
    mandate: { effector: ['api'], access: [] },
  });
  assert.equal(result.recommendedPhase, 'NEEDS_INPUT');
  assert.equal(result.interruption.code, 'ACCESS_REQUIRED');
});

test('non-unique next step is blocked (I8)', () => {
  const result = gateStep({
    goal: GOOD_GOAL,
    step: { step_id: 's-1', competing_steps: 2, requires: ['effector'], has_side_effect: false },
    mandate: { effector: ['fs'], competence: ['x'] },
  });
  assert.ok(result.blockers.some((b) => b.code === 'NEXT_STEP_NOT_UNIQUE'));
});

test('unreachable evidence contract blocks the step (§2.6)', () => {
  const goal = {
    ...GOOD_GOAL,
    criteria: [
      {
        criterion_id: 'c-behavior',
        type: 'BEHAVIOR',
        statement: '系统在收到 X 时返回 Y',
        stimulus: '发送 X',
        risk: {
          reversibility: 'impossible',
          externality: 'public',
          blast_radius: 'one',
          undo_window: 'none',
          detectability: 'loud',
        },
      },
    ],
  };
  const result = gateStep({
    goal,
    step: {
      step_id: 's-1',
      requires: ['effector', 'competence'],
      criteria: ['c-behavior'],
      has_side_effect: false,
    },
    mandate: { effector: ['api'], competence: ['call'] },
  });
  assert.equal(result.cleared, false);
  assert.ok(result.blockers.some((b) => b.code === 'EVIDENCE_CONTRACT_UNREACHABLE'));
});

test('unbounded blast radius cannot be approved at all', () => {
  const result = gateStep({
    goal: GOOD_GOAL,
    step: {
      step_id: 's-1',
      has_side_effect: true,
      action_kind: 'DELETE',
      risk: { ...BULK_RISK, blast_radius: 'unbounded' },
      requires: ['effector'],
    },
    mandate: { effector: ['fs'], competence: ['x'] },
  });
  assert.ok(result.blockers.some((b) => b.code === 'UNBOUNDED_TARGET_SET'));
});

test('all five hard gates are evaluated and any failure blocks', () => {
  assert.equal(HARD_GATES.length, 5);

  const allPass = checkHardGates({
    goalAligned: true,
    approvedScopeVersion: 1,
    criteriaAdmissible: true,
    sideEffectGuardPassed: true,
    workerViaProxy: true,
    outcomeDerivedByReducer: true,
  });
  assert.equal(allPass.passed, true);

  const noAlignment = checkHardGates({
    criteriaAdmissible: true,
    sideEffectGuardPassed: true,
    workerViaProxy: true,
  });
  assert.equal(noAlignment.passed, false);
  assert.ok(noAlignment.failed.some((g) => g.id === 'G1'));

  const empty = checkHardGates({});
  assert.equal(empty.failed.length, 4, 'G5 defaults to pass unless explicitly false');
});
