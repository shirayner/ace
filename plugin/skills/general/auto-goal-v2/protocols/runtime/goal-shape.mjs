/**
 * Goal shape validation — intent must be a world delta, not an action.
 *
 * Design refs: §2.1, generic-goal-model §2.1.
 *
 * "Build a bulk import" is not an intent; "operations no longer hand-enter 20k rows
 * a day" is. Forcing the delta form is the structural cure for a solution
 * masquerading as a requirement — and it is checkable enough to gate on.
 */

import { deepFreeze } from './freeze.mjs';

/**
 * Verbs that describe an action the Agent would take rather than a state of the
 * world. An intent opening with one of these is almost always a solution in
 * disguise. This is a heuristic flag, not a proof, so it surfaces as a blocker with
 * a rewrite instruction rather than silently rewriting anything.
 */
const ACTION_LEAD_VERBS = deepFreeze([
  '实现', '开发', '写', '做', '搭建', '新增', '添加', '创建', '修改', '重构',
  '优化', '接入', '集成', '部署', '调用', '设计', '编写', '制作', '生成',
  'implement', 'build', 'create', 'write', 'add', 'refactor', 'develop',
  'design', 'integrate', 'deploy', 'make', 'set up', 'generate',
]);

/** Functional principal roles. They may be the same person, but not absent (§2.1). */
export const PRINCIPAL_ROLES = deepFreeze(['owner', 'decider', 'acceptor']);

function looksLikeAction(intent) {
  const text = String(intent).trim();
  const lower = text.toLowerCase();
  return ACTION_LEAD_VERBS.filter(
    (verb) => text.startsWith(verb) || lower.startsWith(verb.toLowerCase()),
  );
}

/**
 * Validate a goal's structural shape.
 *
 * Checks the obligations that §2.1 marks as blocking entry to execution:
 *   - intent describes a delta, not an action
 *   - subject resolves to a unique referent
 *   - scope.in and scope.out are equally required
 *   - all three principal roles are filled
 *   - scope_version is an integer
 */
export function validateGoalShape(goal = {}) {
  const blockers = [];
  const warnings = [];

  const intent = String(goal.intent ?? '').trim();
  if (!intent) {
    blockers.push({ code: 'MISSING_INTENT', fix: '写出目标追求的世界差量' });
  } else {
    const actionVerbs = looksLikeAction(intent);
    if (actionVerbs.length > 0) {
      blockers.push({
        code: 'INTENT_IS_ACTION',
        detail: `intent 以动作动词 "${actionVerbs[0]}" 开头，描述的是做什么而非世界变成什么样`,
        fix: '反推其目标：这个动作成功后，世界有什么不同？用该差量替换 intent',
      });
    }
  }

  if (!goal.subject || String(goal.subject).trim() === '') {
    blockers.push({ code: 'MISSING_SUBJECT', fix: '给出唯一可解析的作用对象' });
  } else if (goal.subject_resolvable === false || goal.subjectResolvable === false) {
    blockers.push({
      code: 'SUBJECT_UNRESOLVED',
      detail: 'subject 未能解析到唯一指称',
      fix: '做指称消解；高爆炸半径动作前必须枚举确切目标集',
    });
  }

  const scope = goal.scope ?? {};
  // in and out are equally required: a scope with only an `in` list is not a scope.
  if (!Array.isArray(scope.in)) {
    blockers.push({ code: 'MISSING_SCOPE_IN', fix: '列出本轮范围内项' });
  }
  if (!Array.isArray(scope.out)) {
    blockers.push({
      code: 'MISSING_SCOPE_OUT',
      detail: 'scope.out 与 scope.in 同权必填',
      fix: '显式列出非目标；只写 in 的范围不是范围',
    });
  }

  const principals = goal.principals ?? {};
  for (const role of PRINCIPAL_ROLES) {
    if (!principals[role] || String(principals[role]).trim() === '') {
      blockers.push({
        code: 'MISSING_PRINCIPAL',
        detail: `缺少功能位 ${role}`,
        fix: `指定 ${role}（可与其他角色为同一主体，但功能位不可省略）`,
      });
    }
  }

  if (!Number.isInteger(goal.scope_version)) {
    blockers.push({ code: 'MISSING_SCOPE_VERSION', fix: 'scope_version 必须为整数' });
  }

  if (!Array.isArray(goal.criteria) || goal.criteria.length === 0) {
    blockers.push({ code: 'MISSING_CRITERIA', fix: '至少定义一条判据' });
  }

  if (!goal.horizon) {
    warnings.push({ code: 'MISSING_HORIZON', detail: '未声明目标成立的时间窗口' });
  }

  return deepFreeze({ valid: blockers.length === 0, blockers, warnings });
}

/**
 * Validate a scope change. `scope_version` may only advance via a SCOPE_CHANGED
 * event the decider approved (invariant I2).
 *
 * This closes the "quietly narrow the scope, then declare DONE" path: without the
 * check, an Agent could drop the hard half of the goal and satisfy what remains.
 */
export function validateScopeChange({ from, to, approval, decider } = {}) {
  const problems = [];

  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    problems.push({ code: 'INVALID_SCOPE_VERSIONS' });
  } else if (to !== from + 1) {
    problems.push({
      code: 'NON_MONOTONIC_SCOPE_VERSION',
      detail: `scope_version 只能 +1 递增：${from} → ${to}`,
    });
  }

  if (!approval) {
    problems.push({
      code: 'SCOPE_CHANGE_WITHOUT_APPROVAL',
      detail: '范围变更必须有 decider 批准的 SCOPE_CHANGED 事件',
    });
  } else {
    if (approval.scope_version !== from) {
      problems.push({
        code: 'APPROVAL_SCOPE_MISMATCH',
        detail: `批准绑定 scope_version=${approval.scope_version}，变更起点为 ${from}`,
      });
    }
    if (decider && approval.granted_by !== decider) {
      problems.push({
        code: 'APPROVER_NOT_DECIDER',
        detail: `批准者 ${approval.granted_by} 不是 decider ${decider}`,
      });
    }
  }

  return deepFreeze({ valid: problems.length === 0, problems });
}

/**
 * Detect silent scope narrowing: criteria that were in scope at an earlier version
 * and are absent now without a MOOT record. Any hit caps the outcome at PARTIAL
 * (§11.2), which is why this is computed rather than trusted to narrative.
 */
export function detectSilentNarrowing({ originalCriteria = [], currentCriteria = [], mootRecords = [] } = {}) {
  const current = new Set(currentCriteria.map((c) => c.criterion_id ?? c.id));
  const mooted = new Set(mootRecords.map((record) => record.criterion_id));
  const dropped = [];

  for (const criterion of originalCriteria) {
    const id = criterion.criterion_id ?? criterion.id;
    if (!current.has(id) && !mooted.has(id)) {
      dropped.push(id);
    }
  }

  return deepFreeze({
    narrowed: dropped.length > 0,
    droppedCriteria: dropped,
    maxOutcome: dropped.length > 0 ? 'PARTIAL' : 'DONE',
  });
}
