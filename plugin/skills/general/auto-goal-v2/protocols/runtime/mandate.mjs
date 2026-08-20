/**
 * Mandate assessment — what the Agent may legitimately do right now.
 *
 * Design refs: §2.2, §2.3, generic-goal-model §2.2, §4.
 *
 *   attainable = goal ∩ mandate
 *   residual   = goal \ mandate
 *
 * Capability is not a boolean. It decomposes into five independently missing parts,
 * and which part is missing determines the correct terminal state. Collapsing them
 * into "can I do this?" is what produces the top failure mode: the Agent quietly
 * substitutes a reachable action (drafting an email) for the goal (the gym
 * membership actually being cancelled) and reports DONE.
 */

import { deepFreeze } from './freeze.mjs';

/**
 * The five mandate components and the terminal state implied by each absence.
 *
 * `access` vs `authority` are orthogonal on purpose: holding the password is not
 * permission to use it for this (generic-goal-model §2.2).
 */
export const MANDATE_COMPONENTS = deepFreeze({
  effector: {
    question: '存在从 Agent 通往目标物的改变机制吗',
    onMissing: 'REDEFINE_TO_REACHABLE_PREFIX',
    interruptionCode: null,
  },
  access: {
    question: '在该效应器上有凭证/权限吗',
    onMissing: 'NEEDS_INPUT',
    interruptionCode: 'ACCESS_REQUIRED',
  },
  authority: {
    question: '主体允许把它用于此事吗',
    onMissing: 'NEEDS_INPUT',
    interruptionCode: 'APPROVAL_REQUIRED',
  },
  competence: {
    question: '用该效应器能做对吗',
    onMissing: 'BOUNDED_RETRY_THEN_BLOCKED',
    interruptionCode: null,
  },
  observation: {
    question: '行动后能独立读回吗',
    onMissing: 'UNVERIFIABLE',
    interruptionCode: null,
  },
});

export const MANDATE_COMPONENT_NAMES = deepFreeze(Object.keys(MANDATE_COMPONENTS));

/**
 * Assess one intended step against the mandate.
 *
 * `step.requires` lists the mandate components this step depends on; `mandate`
 * supplies what is actually held. A component counts as held only when a non-empty
 * entry covers it — an empty array means "assessed and absent", which is different
 * from never assessed but equally blocking.
 */
export function assessStep({ step = {}, mandate = {} } = {}) {
  const required = Array.isArray(step.requires) && step.requires.length > 0
    ? step.requires
    : ['effector', 'competence'];

  const gaps = [];
  for (const component of required) {
    if (!MANDATE_COMPONENT_NAMES.includes(component)) {
      throw new TypeError(`unknown mandate component: ${JSON.stringify(component)}`);
    }
    const held = mandate[component];
    const satisfied = Array.isArray(held) ? held.length > 0 : Boolean(held);
    if (!satisfied) {
      gaps.push({
        component,
        question: MANDATE_COMPONENTS[component].question,
        onMissing: MANDATE_COMPONENTS[component].onMissing,
        interruptionCode: MANDATE_COMPONENTS[component].interruptionCode,
      });
    }
  }

  const expired = isExpired(mandate.expires_at ?? mandate.expiresAt);
  if (expired) {
    gaps.push({
      component: 'authority',
      question: 'mandate 是否仍在有效期内',
      onMissing: 'NEEDS_INPUT',
      interruptionCode: 'APPROVAL_REQUIRED',
      detail: 'mandate 已过期',
    });
  }

  return deepFreeze({
    step_id: step.step_id ?? step.id ?? null,
    attainable: gaps.length === 0,
    gaps,
    // The first gap that a principal can close decides the interruption; effector
    // and competence gaps cannot be closed by answering a question.
    interruption: gaps.find((gap) => gap.interruptionCode) ?? null,
  });
}

function isExpired(expiresAt, now = Date.now()) {
  if (!expiresAt) return false;
  const timestamp = Date.parse(expiresAt);
  return Number.isFinite(timestamp) && timestamp < now;
}

/**
 * Partition a goal's criteria into the attainable set and the residual.
 *
 * The point of computing this at PLANNING time is disclosure: if `residual` is
 * non-empty the goal is already PARTIAL, and the decider must be told now rather
 * than after execution "discovers" it (§2.2).
 */
export function partitionGoal({ criteria = [], mandate = {}, stepsByCriterion = {} } = {}) {
  const attainable = [];
  const residual = [];

  for (const criterion of criteria) {
    const id = criterion.criterion_id ?? criterion.id ?? null;
    const step = stepsByCriterion[id] ?? { requires: criterion.requires };
    const assessment = assessStep({ step: { ...step, step_id: id }, mandate });
    if (assessment.attainable) {
      attainable.push({ criterion_id: id, type: criterion.type ?? null });
    } else {
      residual.push({
        criterion_id: id,
        type: criterion.type ?? null,
        gaps: assessment.gaps.map((gap) => gap.component),
        onMissing: assessment.gaps.map((gap) => gap.onMissing),
      });
    }
  }

  return deepFreeze({
    attainable,
    residual,
    // A non-empty residual caps the original goal at PARTIAL even if every
    // attainable criterion later succeeds (§2.2).
    maxOutcome: residual.length === 0 ? 'DONE' : 'PARTIAL',
    disclosureRequired: residual.length > 0,
  });
}

/**
 * Validate a handoff for the residual. Every terminal state must carry one —
 * "never return empty-handed" becomes a field constraint, not a slogan
 * (generic-goal-model §10.6).
 */
export function validateHandoff(handoff = {}) {
  const missing = [];
  const required = {
    residual_items: '未完成项清单（可为空数组，但字段必须存在）',
    responsible: '每项的责任人',
    next_action: '人类可独立执行的下一动作',
    acceptance: '如何验收',
  };

  for (const [field, description] of Object.entries(required)) {
    const value = handoff[field];
    const absent = value === undefined
      || value === null
      || (typeof value === 'string' && value.trim() === '');
    if (absent) missing.push({ field, detail: description });
  }

  if (Array.isArray(handoff.residual_items) && handoff.residual_items.length > 0) {
    if (!handoff.responsible || !handoff.next_action) {
      missing.push({
        field: 'residual_items',
        detail: 'residual 非空时 responsible 与 next_action 不可为空',
      });
    }
  }

  return deepFreeze({ valid: missing.length === 0, missing });
}
