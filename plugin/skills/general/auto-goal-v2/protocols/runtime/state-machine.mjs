/**
 * Phase state machine and transition guards.
 *
 * Design refs: §6.1, §6.2, §6.3.
 *
 * Phase and outcome are deliberately separate fields. `NEEDS_INPUT` is a
 * recoverable *phase*; `BLOCKED` is a terminal *outcome*. §6.3 writes the latter as
 * `* → BLOCKED`, which we read as `* → TERMINAL(outcome=BLOCKED)` because §6.1 and
 * the checkpoint contract both store phase and outcome separately. Treating BLOCKED
 * as a phase would give the reducer two places to record the same fact.
 */

import { deepFreeze } from './freeze.mjs';

export const PHASES = deepFreeze([
  'NEW',
  'ALIGNING',
  'PLANNING',
  'EXECUTING',
  'NEEDS_INPUT',
  'VERIFYING',
  'RECOVERING',
  'TERMINAL',
]);

/** Sealable terminal outcomes plus the persistent interruption outcome (§11.2). */
export const OUTCOMES = deepFreeze(['DONE', 'PARTIAL', 'BLOCKED', 'UNVERIFIABLE', 'NEEDS_INPUT']);

/** Only these four produce GOAL_TERMINATED. */
export const SEALABLE_OUTCOMES = deepFreeze(['DONE', 'PARTIAL', 'BLOCKED', 'UNVERIFIABLE']);

export const BLOCKED_REASONS = deepFreeze([
  'FALSIFIED',
  'EXHAUSTED',
  'PLAN_CHANGE_REQUIRED',
  'INVARIANT_VIOLATED',
]);

/**
 * Guard requirements per transition. Each entry lists condition keys that must be
 * truthy in the supplied context, with the human-readable obligation.
 *
 * `NEEDS_INPUT` and `TERMINAL` are reachable from any non-terminal phase, handled
 * as wildcards below rather than enumerated per source phase.
 */
const TRANSITIONS = deepFreeze({
  'NEW->ALIGNING': {
    taskRootPersisted: 'task root 与首事件已持久化',
  },
  'ALIGNING->PLANNING': {
    goalComplete: 'Goal 完整（intent 为世界差量、subject 唯一可解析）',
    scopeInOutDefined: 'scope.in 与 scope.out 均已明确',
    criteriaClassified: '全部 criteria 已分类且通过 criteria gate',
    approvalRecorded: '必要的 scope_version 批准已记录',
  },
  'PLANNING->EXECUTING': {
    singleNextStep: 'next step 唯一',
    mandateAttainable: 'Mandate 覆盖该步所需组件',
    evidenceContractReachable: 'evidence contract 可达（required_rung <= ceiling）',
    sideEffectGuardPassed: '副作用已通过 capability/risk/approval guard',
  },
  'EXECUTING->VERIFYING': {
    artifactsExist: '声称产物存在',
    manifestRegistered: 'manifest 已登记',
    rawOutputProcessed: '原始输出已由 Proxy 处理',
  },
  'VERIFYING->EXECUTING': {
    unsatisfiedCriteriaRemain: '尚有未满足判据',
    nextStepLegal: '下一步合法可达',
  },
  'VERIFYING->TERMINAL': {
    outcomeDerived: 'outcome 由 derive-outcome 纯函数产生',
    handoffComplete: '终态必填 handoff 字段齐全',
  },
  'RECOVERING->PLANNING': { recoveryReduced: 'checkpoint 已由 reducer 重建' },
  'RECOVERING->EXECUTING': {
    recoveryReduced: 'checkpoint 已由 reducer 重建',
    danglingEffectsResolved: '悬空 EFFECT_INTENDED 已先观测世界，未盲重放',
  },
  'RECOVERING->VERIFYING': { recoveryReduced: 'checkpoint 已由 reducer 重建' },
  'RECOVERING->ALIGNING': { recoveryReduced: 'checkpoint 已由 reducer 重建' },
  'RECOVERING->NEEDS_INPUT': { recoveryReduced: 'checkpoint 已由 reducer 重建' },
  'NEEDS_INPUT->PLANNING': { inputReceived: '所需输入已由 principal 提供' },
  'NEEDS_INPUT->EXECUTING': {
    inputReceived: '所需输入已由 principal 提供',
    resumesSamePlan: '同一计划可原样恢复',
  },
  'NEEDS_INPUT->ALIGNING': { inputReceived: '所需输入已由 principal 提供' },
  'NEEDS_INPUT->VERIFYING': { inputReceived: '所需输入已由 principal 提供' },
  'PLANNING->ALIGNING': { realignmentRequired: '新事实要求重新对齐' },
  'EXECUTING->PLANNING': { replanRequired: '需要重新规划下一短步，且已确定合法替代计划' },
});

/** Any non-terminal phase may be interrupted or may terminate. */
const NEEDS_INPUT_GUARD = deepFreeze({
  namedInputIdentified: '所需输入可由 principal 提供且已命名',
  resumableAsIs: '提供后可原样恢复',
  interruptionInvariantsHeld: '中断前不变量成立（无在途不可逆副作用、状态自洽）',
});

const TERMINAL_GUARD = deepFreeze({
  outcomeDerived: 'outcome 由 derive-outcome 纯函数产生',
  handoffComplete: '终态必填 handoff 字段齐全',
});

/** Is a phase terminal? */
export function isTerminal(phase) {
  return phase === 'TERMINAL';
}

/**
 * Evaluate a proposed transition.
 *
 * Returns `{ allowed, transition, unmet, guard }`. `unmet` lists the exact
 * obligations that are not satisfied, so a rejected transition tells the caller
 * what to do rather than just refusing.
 *
 * A guard key that is absent from `context` counts as unmet: an unproven
 * precondition is not a satisfied one.
 */
export function checkTransition({ from, to, context = {} } = {}) {
  if (!PHASES.includes(from)) throw new TypeError(`unknown phase: ${JSON.stringify(from)}`);
  if (!PHASES.includes(to)) throw new TypeError(`unknown phase: ${JSON.stringify(to)}`);

  const key = `${from}->${to}`;
  let guard = TRANSITIONS[key];

  if (!guard && to === 'NEEDS_INPUT' && !isTerminal(from) && from !== 'NEEDS_INPUT') {
    guard = NEEDS_INPUT_GUARD;
  }
  if (!guard && to === 'TERMINAL' && !isTerminal(from)) {
    guard = TERMINAL_GUARD;
  }
  if (!guard && to === 'RECOVERING' && !isTerminal(from)) {
    // A process restart may interrupt any live phase.
    guard = { taskRootPersisted: 'task root 可定位且权限有效' };
  }

  if (!guard) {
    return deepFreeze({
      allowed: false,
      transition: key,
      unmet: [{ code: 'ILLEGAL_TRANSITION', detail: `${from} → ${to} 不是合法转移` }],
      guard: null,
    });
  }

  const unmet = [];
  for (const [condition, obligation] of Object.entries(guard)) {
    if (context[condition] !== true) {
      unmet.push({ code: 'GUARD_UNMET', condition, detail: obligation });
    }
  }

  return deepFreeze({
    allowed: unmet.length === 0,
    transition: key,
    unmet,
    guard: Object.keys(guard),
  });
}

/** List the guard obligations for a transition without evaluating them. */
export function guardsFor(from, to) {
  const result = checkTransition({ from, to, context: {} });
  return result.guard ?? null;
}

/**
 * Validate the phase/outcome pairing in a checkpoint.
 *
 * Two rules that keep "where we are" from colliding with "how it ended":
 *   - a non-terminal phase carries no sealable outcome
 *   - TERMINAL always carries one
 * NEEDS_INPUT is the one legal overlap: it is a phase and a reportable outcome.
 */
export function validatePhaseOutcome({ phase, outcome, blocked_reason } = {}) {
  const problems = [];

  if (!PHASES.includes(phase)) {
    problems.push({ code: 'UNKNOWN_PHASE', detail: String(phase) });
  }
  if (outcome !== null && outcome !== undefined && !OUTCOMES.includes(outcome)) {
    problems.push({ code: 'UNKNOWN_OUTCOME', detail: String(outcome) });
  }

  if (phase === 'TERMINAL') {
    if (!SEALABLE_OUTCOMES.includes(outcome)) {
      problems.push({
        code: 'TERMINAL_WITHOUT_SEALABLE_OUTCOME',
        detail: `TERMINAL 必须携带 ${SEALABLE_OUTCOMES.join('/')} 之一`,
      });
    }
    if (outcome === 'BLOCKED' && !BLOCKED_REASONS.includes(blocked_reason)) {
      problems.push({
        code: 'BLOCKED_WITHOUT_REASON',
        detail: `BLOCKED 必须带 reason: ${BLOCKED_REASONS.join('/')}`,
      });
    }
  } else if (SEALABLE_OUTCOMES.includes(outcome)) {
    problems.push({
      code: 'NON_TERMINAL_WITH_SEALED_OUTCOME',
      detail: `phase=${phase} 不得携带终态 outcome=${outcome}`,
    });
  }

  if (outcome === 'NEEDS_INPUT' && phase !== 'NEEDS_INPUT') {
    problems.push({
      code: 'NEEDS_INPUT_PHASE_MISMATCH',
      detail: 'outcome=NEEDS_INPUT 时 phase 必须为 NEEDS_INPUT',
    });
  }

  return deepFreeze({ valid: problems.length === 0, problems });
}
