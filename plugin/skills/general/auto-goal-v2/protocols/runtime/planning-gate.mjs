/**
 * Planning gate — the composed check that PLANNING → EXECUTING must pass.
 *
 * Design refs: §6.3, §10, §17 (mechanically checkable invariants).
 *
 * This is the one function a controller calls before dispatching a step with side
 * effects. It composes the individual gates so that no caller has to remember the
 * order, and so a missing check is a test failure here rather than a silent gap in
 * one call site.
 */

import { deepFreeze } from './freeze.mjs';
import { criteriaGate } from './criteria-gate.mjs';
import { assessStep } from './mandate.mjs';
import { checkDeltaApproval } from './approval.mjs';
import { requiresApproval, requiresTargetEnumeration } from './risk.mjs';
import { validateGoalShape } from './goal-shape.mjs';

/**
 * Gate one planned step.
 *
 * Returns `{ cleared, blockers, interruption, checks }`. When `cleared` is false the
 * step must not run; `interruption` names the single principal-answerable question
 * when one exists, otherwise the blockers require a plan change (BLOCKED) rather
 * than a question.
 */
export function gateStep({ goal, step = {}, mandate = {}, approval = null } = {}) {
  const blockers = [];
  const checks = {};

  // A step is only as legitimate as the goal it serves.
  if (goal) {
    const shape = validateGoalShape(goal);
    checks.goalShape = shape;
    for (const blocker of shape.blockers) {
      blockers.push({ ...blocker, stage: 'GOAL_SHAPE' });
    }

    const criteria = criteriaGate(goal.criteria ?? []);
    checks.criteria = criteria;
    for (const blocker of criteria.blockers) {
      blockers.push({ ...blocker, stage: 'CRITERIA' });
    }
  }

  const mandateCheck = assessStep({ step, mandate });
  checks.mandate = mandateCheck;
  for (const gap of mandateCheck.gaps) {
    blockers.push({
      code: 'MANDATE_GAP',
      stage: 'MANDATE',
      detail: `缺少 ${gap.component}：${gap.question}`,
      component: gap.component,
      onMissing: gap.onMissing,
    });
  }

  // Side-effect guard: approval requirement is derived from the risk dimensions of
  // the step itself, never from the name of the tool it would use.
  const hasSideEffect = step.has_side_effect ?? step.hasSideEffect ?? false;
  if (hasSideEffect) {
    const approvalNeed = requiresApproval(step.risk);
    checks.approvalRequirement = approvalNeed;

    const enumeration = requiresTargetEnumeration(step.risk);
    checks.targetEnumeration = enumeration;

    if (enumeration.required && !enumeration.enumerable) {
      blockers.push({
        code: 'UNBOUNDED_TARGET_SET',
        stage: 'APPROVAL',
        detail: '爆炸半径不可枚举，无法就目标集取得批准',
        fix: '缩小范围到可枚举集合，或拆分为可枚举的多步',
      });
    } else if (enumeration.required && !Array.isArray(step.targets)) {
      blockers.push({
        code: 'TARGETS_NOT_ENUMERATED',
        stage: 'APPROVAL',
        detail: '高风险动作执行前必须枚举确切目标集',
        fix: '枚举将被影响的实体，并就该枚举取得批准',
      });
    }

    if (approvalNeed.required) {
      if (!approval) {
        blockers.push({
          code: 'APPROVAL_REQUIRED',
          stage: 'APPROVAL',
          detail: `风险触发批准门：${approvalNeed.triggers.map((t) => t.code).join(', ')}`,
          principalAnswerable: true,
        });
      } else {
        const delta = checkDeltaApproval({
          approval,
          action: {
            action_kind: step.action_kind ?? step.actionKind,
            targets: step.targets,
            risk: step.risk,
            scope_version: goal?.scope_version,
          },
          currentScopeVersion: goal?.scope_version,
        });
        checks.deltaApproval = delta;
        if (delta.reapprovalRequired) {
          blockers.push({
            code: 'REAPPROVAL_REQUIRED',
            stage: 'APPROVAL',
            detail: delta.reasons.map((r) => r.code).join(', '),
            reasons: delta.reasons,
            principalAnswerable: true,
          });
        }
      }
    }
  }

  // Exactly one next step, per invariant I8.
  if (step.competing_steps && step.competing_steps > 1) {
    blockers.push({
      code: 'NEXT_STEP_NOT_UNIQUE',
      stage: 'PLAN',
      detail: `存在 ${step.competing_steps} 个候选下一步，必须唯一`,
    });
  }

  // A step whose evidence contract is unreachable should not run: it would burn a
  // side effect and still leave the criterion UNTESTABLE (§2.6).
  const unreachable = (checks.criteria?.criteria ?? []).filter(
    (result) => result.untestable && (step.criteria ?? []).includes(result.criterion_id),
  );
  if (unreachable.length > 0) {
    blockers.push({
      code: 'EVIDENCE_CONTRACT_UNREACHABLE',
      stage: 'EVIDENCE',
      detail: `判据 ${unreachable.map((r) => r.criterion_id).join(', ')} 的 required_rung 超出上限`,
      fix: '在规划期披露；改判据、找 acceptor，或接受 UNVERIFIABLE',
    });
  }

  const principalAnswerable = blockers.find((blocker) => blocker.principalAnswerable === true)
    ?? (mandateCheck.interruption
      ? {
        code: mandateCheck.interruption.interruptionCode,
        stage: 'MANDATE',
        component: mandateCheck.interruption.component,
        principalAnswerable: true,
      }
      : null);

  return deepFreeze({
    cleared: blockers.length === 0,
    blockers,
    // When something is missing but a principal holds the key, the correct move is
    // NEEDS_INPUT (ask), not BLOCKED (stop) — generic-goal-model §6.4 priority 2.
    interruption: principalAnswerable,
    recommendedPhase: resolvePhase(blockers, principalAnswerable),
    checks,
  });
}

function resolvePhase(blockers, principalAnswerable) {
  if (blockers.length === 0) return 'EXECUTING';
  if (principalAnswerable) return 'NEEDS_INPUT';
  return 'BLOCKED';
}

/**
 * The full HARD GATE set from SKILL.md, evaluated as data.
 *
 * Kept as an explicit list so the gate count is visible and testable: a gate that
 * gets dropped during a refactor shows up as a failing assertion on this length
 * rather than as an unguarded execution path.
 */
export const HARD_GATES = deepFreeze([
  {
    id: 'G1',
    rule: '未对齐 goal/scope_version，不执行',
    test: (ctx) => ctx.goalAligned === true && Number.isInteger(ctx.approvedScopeVersion),
  },
  {
    id: 'G2',
    rule: '未分类 criteria 或 evidence contract 不完整，不执行',
    test: (ctx) => ctx.criteriaAdmissible === true,
  },
  {
    id: 'G3',
    rule: '副作用未通过 capability/risk/approval guard，不执行',
    test: (ctx) => ctx.sideEffectGuardPassed === true,
  },
  {
    id: 'G4',
    rule: 'worker 必须经 dispatch/proxy；不得直收长结果',
    test: (ctx) => ctx.workerViaProxy === true,
  },
  {
    id: 'G5',
    rule: 'outcome 只能由 derive-outcome 产生',
    test: (ctx) => ctx.outcomeDerivedByReducer !== false,
  },
]);

/** Evaluate all hard gates. Any failure blocks execution. */
export function checkHardGates(context = {}) {
  const failed = HARD_GATES.filter((gate) => gate.test(context) !== true).map((gate) => ({
    id: gate.id,
    rule: gate.rule,
  }));
  return deepFreeze({ passed: failed.length === 0, failed });
}
