/**
 * Scoped approval and delta re-approval.
 *
 * Design refs: §10.1, §10.2, §10.3, generic-goal-model §5.2.
 *
 * An approval binds to:
 *   action kind × exact target set × scope_version × risk summary × time window
 *
 * Approvals do not travel. They do not carry across goals, instances, or scope
 * versions, and they expire. The delta check below is the structural answer to
 * "the user already approved something like this earlier".
 */

import { deepFreeze } from './freeze.mjs';
import { RISK_DIMENSION_NAMES, normalizeRisk, riskLevel } from './risk.mjs';

/**
 * Phrases that are NOT approval. Silence, "continue", conditional agreement and
 * an executor's own inference all fail the gate (§3.4).
 */
export const NON_APPROVAL_UTTERANCES = deepFreeze([
  '继续', '好', '嗯', '可以吧', '应该没问题', '你决定', '随你', '看着办',
  'ok', 'sure', 'go ahead', 'continue', 'sounds good', 'lgtm',
]);

/** Build a canonical, comparable target set. Order is irrelevant; identity is not. */
function canonicalTargets(targets) {
  if (!Array.isArray(targets)) return null;
  return deepFreeze([...new Set(targets.map((t) => String(t)))].sort());
}

/**
 * Record an approval. Returns `{ valid, record, problems }`.
 *
 * Requires the enumerated target set and the verbatim user utterance, not a
 * paraphrase: §10.1 stores "what was actually approved", because a summary written
 * by the party that wants to proceed is not evidence of consent.
 */
export function recordApproval({
  approval_id,
  action_kind,
  targets,
  scope_version,
  risk,
  granted_by,
  verbatim,
  granted_at,
  expires_at = null,
  invalidation_conditions = [],
} = {}) {
  const problems = [];

  if (!approval_id) problems.push({ code: 'MISSING_APPROVAL_ID' });
  if (!action_kind) problems.push({ code: 'MISSING_ACTION_KIND' });
  if (!granted_by) {
    problems.push({ code: 'MISSING_GRANTER', detail: '必须记录批准者（decider）' });
  }
  if (!Number.isInteger(scope_version)) {
    problems.push({ code: 'MISSING_SCOPE_VERSION', detail: '批准必须绑定 scope_version' });
  }

  const canonical = canonicalTargets(targets);
  if (!canonical) {
    problems.push({
      code: 'TARGETS_NOT_ENUMERATED',
      detail: '批准对象必须是枚举后的确切目标集，不能是描述',
    });
  } else if (canonical.length === 0) {
    problems.push({ code: 'EMPTY_TARGET_SET' });
  }

  const utterance = String(verbatim ?? '').trim();
  if (!utterance) {
    problems.push({ code: 'MISSING_VERBATIM', detail: '必须记录用户原话' });
  } else if (isNonApproval(utterance)) {
    problems.push({
      code: 'NOT_AN_APPROVAL',
      detail: `"${utterance}" 不构成批准：沉默、"继续"、带条件同意均不算`,
      fix: '要求明确的"批准当前 goal/scope_version"或"拒绝并修正"',
    });
  }

  const { risk: assessed, unassessed } = normalizeRisk(risk);
  if (unassessed.length === RISK_DIMENSION_NAMES.length) {
    problems.push({
      code: 'RISK_NOT_ASSESSED',
      detail: '五个风险维度均未评估，批准对象不明确',
    });
  }

  const record = deepFreeze({
    approval_id: approval_id ?? null,
    action_kind: action_kind ?? null,
    targets: canonical ?? [],
    target_count: canonical?.length ?? 0,
    scope_version: Number.isInteger(scope_version) ? scope_version : null,
    risk: assessed,
    unassessed_dimensions: unassessed,
    granted_by: granted_by ?? null,
    verbatim: utterance,
    granted_at: granted_at ?? null,
    expires_at,
    invalidation_conditions,
  });

  return deepFreeze({ valid: problems.length === 0, record, problems });
}

/** Does this utterance fall in the "not an approval" set? */
export function isNonApproval(text) {
  const normalized = String(text).trim().toLowerCase().replace(/[。.!！~\s]+$/u, '');
  return NON_APPROVAL_UTTERANCES.some((phrase) => normalized === phrase.toLowerCase());
}

/**
 * Delta re-approval check: compare the action about to run against what was
 * approved (§10.2).
 *
 * Re-approval is required when any of these changed:
 *   - target set grew OR any identity changed
 *   - private → shared/public
 *   - reversibility decreased
 *   - blast radius increased
 *   - undo window shortened
 *   - failure went from loud to silent
 *   - scope_version changed
 *
 * Note the target rule is deliberately asymmetric-plus-identity: a *smaller* set is
 * fine only if it is a subset. Swapping one target for another keeps the count
 * identical while acting on something never approved — the misidentification risk
 * that generic-goal-model §5.4 calls the largest ignored danger.
 */
export function checkDeltaApproval({ approval, action, currentScopeVersion } = {}) {
  if (!approval) {
    return deepFreeze({
      reapprovalRequired: true,
      reasons: [{ code: 'NO_APPROVAL_ON_RECORD' }],
    });
  }

  const reasons = [];
  const approvedTargets = new Set(approval.targets ?? []);
  const actualTargets = canonicalTargets(action?.targets) ?? [];

  const added = actualTargets.filter((t) => !approvedTargets.has(t));
  if (added.length > 0) {
    reasons.push({
      code: 'TARGET_SET_EXPANDED',
      detail: `新增 ${added.length} 个未批准目标`,
      samples: added.slice(0, 5),
      approved_count: approvedTargets.size,
      actual_count: actualTargets.length,
    });
  }

  if (action?.action_kind && action.action_kind !== approval.action_kind) {
    reasons.push({
      code: 'ACTION_KIND_CHANGED',
      detail: `批准的是 ${approval.action_kind}，实际为 ${action.action_kind}`,
    });
  }

  const effectiveScope = currentScopeVersion ?? action?.scope_version;
  if (Number.isInteger(effectiveScope) && effectiveScope !== approval.scope_version) {
    reasons.push({
      code: 'SCOPE_VERSION_CHANGED',
      detail: `批准绑定 scope_version=${approval.scope_version}，当前为 ${effectiveScope}`,
    });
  }

  // Every risk dimension is monotone: a higher index is strictly worse, so any
  // increase invalidates the approval the decider gave against the lower value.
  const { risk: actualRisk } = normalizeRisk(action?.risk);
  for (const dimension of RISK_DIMENSION_NAMES) {
    const approvedValue = approval.risk?.[dimension];
    if (!approvedValue) continue;
    if (riskLevel(dimension, actualRisk[dimension]) > riskLevel(dimension, approvedValue)) {
      reasons.push({
        code: 'RISK_INCREASED',
        dimension,
        detail: `${dimension}: ${approvedValue} → ${actualRisk[dimension]}`,
      });
    }
  }

  if (isApprovalExpired(approval, action?.now)) {
    reasons.push({ code: 'APPROVAL_EXPIRED', detail: `失效于 ${approval.expires_at}` });
  }

  return deepFreeze({
    reapprovalRequired: reasons.length > 0,
    reasons,
    unapprovedTargets: added,
  });
}

function isApprovalExpired(approval, now) {
  if (!approval?.expires_at) return false;
  const deadline = Date.parse(approval.expires_at);
  const current = now ? Date.parse(now) : Date.now();
  return Number.isFinite(deadline) && Number.isFinite(current) && current > deadline;
}

/**
 * Pre-interruption invariants (§10.3). Before waiting on a human:
 *   - no un-rollbackable side effect may be in flight
 *   - already-started reversible steps must be in a self-consistent state
 *   - the payload must be serialisable and carry exactly one decision
 *   - the no-response default must be NO_ACTION or a safe rollback
 *
 * The single-decision rule is not stylistic: LangGraph's documented behaviour is
 * that resumption re-runs the code before the interrupt, so a node holding two
 * decisions cannot resume deterministically (industry-practices §4).
 */
export const SAFE_DEFAULTS = deepFreeze(['NO_ACTION', 'SAFE_ROLLBACK']);

export function checkInterruptionInvariants(interruption = {}) {
  const violations = [];

  if (interruption.in_flight_irreversible === true) {
    violations.push({
      code: 'IRREVERSIBLE_IN_FLIGHT',
      detail: '存在未完成的不可回滚副作用，不得在此中断',
      fix: '先完成或回滚该副作用',
    });
  }

  if (interruption.state_coherent === false) {
    violations.push({
      code: 'INCOHERENT_STATE',
      detail: '已开始的可逆步骤处于不自洽状态',
      fix: '回滚到自洽状态后再中断',
    });
  }

  const options = interruption.options ?? [];
  if (!Array.isArray(options) || options.length < 2) {
    violations.push({
      code: 'INSUFFICIENT_OPTIONS',
      detail: '中断必须给出至少 2 个互斥选项',
    });
  } else if (options.length > 3) {
    violations.push({
      code: 'TOO_MANY_OPTIONS',
      detail: '一次中断最多 3 个选项，超出说明包含多个决策',
    });
  }

  if (!interruption.question || String(interruption.question).trim() === '') {
    violations.push({ code: 'MISSING_QUESTION' });
  } else if (countDecisions(interruption.question) > 1) {
    violations.push({
      code: 'MULTIPLE_DECISIONS',
      detail: '一次中断只能包含一个决策',
      fix: '拆成多次中断，只发最上游的承重决策',
    });
  }

  if (!interruption.required_from) {
    violations.push({
      code: 'MISSING_REQUIRED_FROM',
      detail: '必须指明所需主体（owner/decider/acceptor）',
    });
  }

  if (!interruption.resume_token) {
    violations.push({ code: 'MISSING_RESUME_TOKEN', detail: '缺少恢复令牌，回答后无法原样续跑' });
  }

  const fallback = interruption.default_if_no_response;
  if (!fallback) {
    violations.push({ code: 'MISSING_DEFAULT', detail: '必须声明不回复时的默认动作' });
  } else if (!SAFE_DEFAULTS.includes(fallback)) {
    violations.push({
      code: 'UNSAFE_DEFAULT',
      detail: `默认动作必须是 ${SAFE_DEFAULTS.join(' 或 ')}，实际为 ${fallback}`,
    });
  }

  if (!isSerialisable(interruption)) {
    violations.push({
      code: 'NOT_SERIALISABLE',
      detail: '中断载荷必须可 JSON 序列化才能被持久化和恢复',
    });
  }

  return deepFreeze({ valid: violations.length === 0, violations });
}

/**
 * Count independent asks in a question string.
 *
 * Counting question marks alone over-triggers: "批准吗？还是拒绝？" is one decision
 * offered as two alternatives, which is exactly the recommended phrasing. Only
 * marks that introduce a *new* subject count, so alternative-offering connectives
 * ("还是", "or") are discounted, while additive ones ("另外", "同时") are counted.
 */
function countDecisions(question) {
  const text = String(question);
  const marks = (text.match(/[?？]/gu) ?? []).length;
  // "A？还是 B？" presents one choice: discount marks followed by an alternative.
  const alternatives = (text.match(/[?？]\s*(?:还是|或者|或|or\b)/giu) ?? []).length;
  const additive = (text.match(/(?:，|,|;|；|[?？])\s*(?:另外|此外|同时|以及|and also)/gu) ?? []).length;
  return Math.max(marks - alternatives, 1) + additive;
}

function isSerialisable(value) {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}
