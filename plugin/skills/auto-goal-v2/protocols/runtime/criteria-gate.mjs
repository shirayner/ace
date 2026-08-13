/**
 * Criterion classification gate — the planning-phase filter.
 *
 * Design refs: §2.4 (rules), §3.2 (ambiguity signal), generic-goal-model §3.
 *
 * An unclassified criterion must not enter execution. This module answers one
 * question mechanically: may this criterion be executed against, and if not, what
 * exactly must change first?
 */

import { deepFreeze } from './freeze.mjs';
import { CRITERION_TYPE_NAMES, criterionType, rungIndex } from './evidence.mjs';
import { deriveRequiredRung } from './risk.mjs';

/**
 * Vague predicates that must be quantified or explicitly downgraded to JUDGMENT.
 *
 * Kept deliberately domain-neutral: these are hedges that hide a missing threshold
 * in any domain, not software-specific jargon. Matching is substring-based because
 * Chinese has no word boundaries; the English entries are padded at the call site.
 */
export const VAGUE_PREDICATES = deepFreeze([
  '快', '慢', '大量', '少量', '及时', '合理', '实时', '相关', '异常',
  '友好', '稳定', '高效', '简洁', '清晰', '完善', '优化', '提升',
  '足够', '适当', '尽快', '流畅', '好用', '干净', '专业', '动人',
]);

/** English vague predicates, matched as whole words. */
export const VAGUE_PREDICATES_EN = deepFreeze([
  'fast', 'slow', 'quickly', 'timely', 'reasonable', 'relevant', 'appropriate',
  'sufficient', 'robust', 'clean', 'professional', 'compelling', 'user-friendly',
  'efficient', 'scalable', 'better', 'improved', 'optimal', 'seamless',
]);

/**
 * Universal negative phrasings. "No problems at all" is unprovable and is the
 * classic false-DONE seedbed; it must be rewritten as a bounded check surface
 * ("checked A/B/C, found no X") per §2.4.
 */
export const UNIVERSAL_NEGATIVE_MARKERS = deepFreeze([
  '绝无', '绝不', '没有任何', '不存在任何', '任何问题', '完全没有',
  '毫无', '一切正常', '所有情况', '任何情况下', '永不',
  'no issues at all', 'never fails', 'nothing is broken', '完全无',
]);

/** Numeric or bounded-quantity evidence that a vague word has been pinned down. */
const QUANTIFIED_PATTERN = /\d|[<>≤≥=]|百分之|以内|以下|以上|不超过|至少|最多/u;

function containsVague(text) {
  const hits = [];
  for (const word of VAGUE_PREDICATES) {
    if (text.includes(word)) hits.push(word);
  }
  const lower = ` ${text.toLowerCase().replace(/[^a-z0-9-]+/gu, ' ')} `;
  for (const word of VAGUE_PREDICATES_EN) {
    if (lower.includes(` ${word} `)) hits.push(word);
  }
  return hits;
}

function containsUniversalNegative(text) {
  const lower = text.toLowerCase();
  return UNIVERSAL_NEGATIVE_MARKERS.filter(
    (marker) => text.includes(marker) || lower.includes(marker.toLowerCase()),
  );
}

/**
 * Gate a single criterion.
 *
 * Returns `{ admissible, blockers, requirement }`. `blockers` are actionable: each
 * names the code, the offending content and the one change that would clear it.
 * `admissible === false` means EXECUTING is illegal for this criterion — the fix is
 * a better criterion, not a retry.
 *
 * `untestable` is reported separately from `admissible`: an UNTESTABLE criterion is
 * well-formed and may be recorded, but §2.6 requires it be disclosed during
 * planning rather than discovered at verification time.
 */
export function gateCriterion(criterion = {}) {
  const blockers = [];
  const warnings = [];
  const id = criterion.criterion_id ?? criterion.id ?? null;
  const statement = String(criterion.statement ?? criterion.text ?? '').trim();

  if (!id) {
    blockers.push({
      code: 'MISSING_CRITERION_ID',
      detail: 'criterion 必须有稳定 id 才能进入台账',
      fix: '分配 criterion_id',
    });
  }

  if (!statement) {
    blockers.push({
      code: 'EMPTY_STATEMENT',
      detail: 'criterion 无陈述内容',
      fix: '写出可判定的命题',
    });
  }

  const type = criterion.type ?? null;
  if (!type) {
    blockers.push({
      code: 'UNCLASSIFIED',
      detail: '未贴 criterion 类型',
      fix: `贴上 ${CRITERION_TYPE_NAMES.join(' | ')} 之一`,
    });
  } else if (!CRITERION_TYPE_NAMES.includes(type)) {
    blockers.push({
      code: 'UNKNOWN_TYPE',
      detail: `未知类型 ${type}`,
      fix: `改为 ${CRITERION_TYPE_NAMES.join(' | ')} 之一`,
    });
  }

  // Vague predicates must be quantified, or the criterion must own up to being a
  // JUDGMENT whose decider is a person. Both are acceptable; leaving it as an
  // Agent-judgeable criterion with an unquantified adjective is not.
  if (statement) {
    const vague = containsVague(statement);
    if (vague.length > 0 && !QUANTIFIED_PATTERN.test(statement)) {
      if (type === 'JUDGMENT' || type === 'KNOWLEDGE') {
        warnings.push({
          code: 'VAGUE_BUT_DOWNGRADED',
          detail: `模糊词 ${vague.join('/')} 已通过判定型交还 acceptor`,
        });
      } else {
        blockers.push({
          code: 'UNQUANTIFIED_VAGUE_PREDICATE',
          detail: `模糊词 ${vague.join('/')} 无量化条件`,
          fix: '给出阈值/计数/时间窗，或显式降级为 JUDGMENT 并指定 acceptor',
        });
      }
    }

    if (type === 'NEGATIVE') {
      const universal = containsUniversalNegative(statement);
      const surface = criterion.check_surface ?? criterion.checkSurface ?? [];
      if (universal.length > 0) {
        blockers.push({
          code: 'UNIVERSAL_NEGATIVE',
          detail: `全称否定表述：${universal.join('/')}`,
          fix: '改写为有界检查面，例如"已在 A/B/C 检查，未发现 X"',
        });
      }
      if (!Array.isArray(surface) || surface.length === 0) {
        blockers.push({
          code: 'MISSING_CHECK_SURFACE',
          detail: 'NEGATIVE criterion 未列出检查面',
          fix: '列出被检查的确切范围（文件/系统/时段）',
        });
      }
    }
  }

  // Judgment-family criteria need a named acceptor that is not the Agent (I9).
  let acceptorBlocked = false;
  if (type && CRITERION_TYPE_NAMES.includes(type) && !criterionType(type).agentMayJudge) {
    const acceptor = criterion.acceptor_ref ?? criterion.acceptorRef ?? null;
    if (!acceptor) {
      acceptorBlocked = true;
      blockers.push({
        code: 'ACCEPTOR_REQUIRED',
        detail: `${type} 类判据的判定权不在 Agent，但未指定 acceptor`,
        fix: `指定可触达的 ${criterionType(type).decidedBy}；不可触达则终态最高 UNVERIFIABLE`,
      });
    } else if (isAgentActor(acceptor)) {
      acceptorBlocked = true;
      blockers.push({
        code: 'AGENT_CANNOT_ACCEPT',
        detail: `${type} 类判据不得由 Agent 自评（invariant I9）`,
        fix: '指定 Agent 以外的 acceptor',
      });
    }
  }

  // EFFECT criteria whose horizon exceeds the session must become an agreed proxy
  // metric or move to deferred; they cannot be claimed inside the window (§2.4).
  if (type === 'EFFECT') {
    const withinHorizon = criterion.within_horizon ?? criterion.withinHorizon ?? null;
    const proxy = criterion.proxy_metric ?? criterion.proxyMetric ?? null;
    if (withinHorizon === false && !proxy) {
      blockers.push({
        code: 'EFFECT_BEYOND_HORIZON',
        detail: 'EFFECT 判据的效果窗口超出会话，且无经同意的代理指标',
        fix: '转为经同意的代理指标（并声明其为代理），或移入 deferred',
      });
    }
  }

  if (type === 'BEHAVIOR') {
    const stimulus = criterion.stimulus ?? null;
    if (!stimulus) {
      warnings.push({
        code: 'MISSING_STIMULUS',
        detail: 'BEHAVIOR 判据需要施加激励才可判；未声明激励方式',
      });
    }
  }

  let requirement = null;
  if (type && CRITERION_TYPE_NAMES.includes(type)) {
    requirement = deriveRequiredRung({
      type,
      risk: criterion.risk,
      maxRung: criterion.max_rung ?? criterion.maxRung,
    });
    if (requirement.untestable) {
      warnings.push({
        code: 'UNTESTABLE_AT_PLANNING',
        detail: `required ${requirement.required} 超过上限 ${requirement.ceiling}`,
      });
    }
  }

  return deepFreeze({
    criterion_id: id,
    type,
    admissible: blockers.length === 0,
    untestable: Boolean(requirement?.untestable) || acceptorBlocked,
    requirement,
    blockers,
    warnings,
  });
}

/** Is this actor reference the Agent itself? */
function isAgentActor(actor) {
  const text = String(actor).trim().toLowerCase();
  return text === 'agent'
    || text === 'self'
    || text === 'controller'
    || text.startsWith('worker:')
    || text.startsWith('agent:');
}

/**
 * Gate a whole criterion set. `admissible` is true only when every criterion is
 * admissible AND the set is non-empty — a goal with no criteria has no way to
 * ever be DONE, and admitting it would let the reducer conclude DONE vacuously.
 */
export function criteriaGate(criteria = []) {
  const results = criteria.map((criterion) => gateCriterion(criterion));
  const blockers = [];

  if (results.length === 0) {
    blockers.push({
      code: 'NO_CRITERIA',
      detail: '目标没有任何判据，无法判定完成',
      fix: '至少定义一条已分类判据',
    });
  }

  for (const result of results) {
    for (const blocker of result.blockers) {
      blockers.push({ ...blocker, criterion_id: result.criterion_id });
    }
  }

  return deepFreeze({
    admissible: blockers.length === 0,
    criteria: results,
    blockers,
    untestableCount: results.filter((r) => r.untestable).length,
  });
}
