/**
 * Signal router — method packs are loaded by observable signal, not by domain.
 *
 * Design refs: §3.1, §3.2, §3.3, generic-goal-model §7.
 *
 * This exists to prevent two failures at once: a fixed ten-step questionnaire
 * (which asks irrelevant questions in most domains) and loading every methodology
 * document up front (which floods the context so `[IF]` skips inside the prompt do
 * nothing). Packs are named here; the caller loads only the ones that fire.
 */

import { deepFreeze } from './freeze.mjs';

/**
 * Signal table. Each signal has a `test` over the assessment input and names the
 * method pack plus the goal field the answer would update.
 *
 * The `updates` field matters: a method that cannot change anything about the goal
 * is not worth loading.
 */
export const SIGNALS = deepFreeze([
  {
    id: 'INPUT_IS_SOLUTION',
    pack: 'outcome-reframing',
    updates: 'intent',
    detail: '输入是方案或动作，需差量重写 + 有界 5 Whys',
    test: (input) => input.intentIsAction === true || input.inputIsSolution === true,
  },
  {
    id: 'SUBJECT_AMBIGUOUS',
    pack: 'ambiguity',
    updates: 'subject/scope',
    detail: '目标或主体歧义，需指称消解与现状对照',
    test: (input) => input.subjectResolvable === false || input.scopeDefined === false,
  },
  {
    id: 'RULE_DENSE',
    pack: 'decision-table',
    updates: 'criteria',
    detail: '规则密集或条件组合多，需决策表穷举正例/反例与半成功状态',
    test: (input) => (input.ruleCount ?? 0) >= 3 || input.combinatorial === true,
  },
  {
    id: 'VAGUE_TERMS_PRESENT',
    pack: 'ambiguity',
    updates: 'criteria/constraints',
    detail: '存在模糊词，需六类歧义扫描',
    test: (input) => (input.vagueTerms?.length ?? 0) > 0,
  },
  {
    id: 'JUDGMENT_CRITERION',
    pack: 'judgment-sampling',
    updates: 'evidence contract',
    detail: '存在判定型判据，需尽早交付小样给 acceptor',
    test: (input) => (input.criterionTypes ?? []).some(
      (type) => type === 'JUDGMENT' || type === 'KNOWLEDGE',
    ),
  },
  {
    id: 'HIGH_BLAST_RADIUS',
    pack: 'target-enumeration',
    updates: 'approval scope',
    detail: '高爆炸半径，需先枚举确切目标集并就枚举取得批准',
    test: (input) => input.blastRadius === 'bounded_many' || input.blastRadius === 'unbounded',
  },
  {
    id: 'DOMAIN_UNFAMILIAR',
    pack: 'domain-anchoring',
    updates: 'assumptions/evidence',
    detail: '领域不熟，需先查既有标准、先例和事实',
    test: (input) => input.domainFamiliar === false,
  },
  {
    id: 'SHADOW_PROCESS',
    pack: 'current-flow',
    updates: 'constraints',
    detail: '存在人工补偿或影子流程，需还原现状寻找隐含风控职责',
    test: (input) => input.manualWorkaround === true || input.shadowProcess === true,
  },
  {
    id: 'LOAD_BEARING_ASSUMPTION',
    pack: 'examples-defeaters',
    updates: 'assumption status',
    detail: '假设承重，需 Steel-man → Attack Defeater',
    test: (input) => (input.loadBearingAssumptions?.length ?? 0) > 0,
  },
  {
    id: 'MANDATE_UNCLEAR',
    pack: 'mandate-probe',
    updates: 'attainable/residual',
    detail: '能力或授权不明，需 Mandate 探针',
    test: (input) => input.mandateAssessed === false
      || (input.mandateGaps?.length ?? 0) > 0,
  },
]);

/** All method pack names referenced by the router. */
export const METHOD_PACKS = deepFreeze([
  ...new Set(SIGNALS.map((signal) => signal.pack)),
]);

/**
 * Route observable signals to method packs.
 *
 * Returns only fired signals and the deduplicated pack list. Nothing that did not
 * fire is loaded — that is the whole point (§3.2).
 */
export function route(input = {}) {
  const fired = SIGNALS.filter((signal) => signal.test(input) === true).map((signal) => ({
    id: signal.id,
    pack: signal.pack,
    updates: signal.updates,
    detail: signal.detail,
  }));

  return deepFreeze({
    fired,
    packs: [...new Set(fired.map((signal) => signal.pack))],
  });
}

/**
 * Derive the Frontier: the questions that may legitimately be asked right now.
 *
 * A question enters only when all four hold (§3.1):
 *   1. unresolved
 *   2. its prerequisites are resolved
 *   3. the answer materially changes scope, risk, plan or criteria
 *   4. only a principal can answer it — the Agent cannot look it up
 *
 * Condition 4 is the most-violated one: routing a checkable fact to the user turns
 * the user into a search engine (§3.3). Those become dispatch suggestions instead.
 *
 * The Frontier is a transient computation. It is never persisted — invariant I13 —
 * and `assertNotPersisted` below exists so tests can prove that mechanically.
 */
export function deriveFrontier({ candidates = [], resolved = [] } = {}) {
  const resolvedSet = new Set(resolved);
  const admitted = [];
  const deferred = [];
  const delegated = [];

  for (const candidate of candidates) {
    const id = candidate.id ?? null;

    if (resolvedSet.has(id) || candidate.resolved === true) {
      deferred.push({ id, reason: 'ALREADY_RESOLVED' });
      continue;
    }

    const prerequisites = candidate.depends_on ?? candidate.dependsOn ?? [];
    const unmetPrereqs = prerequisites.filter((dep) => !resolvedSet.has(dep));
    if (unmetPrereqs.length > 0) {
      // Upstream-first: asking a downstream question now risks invalidating the
      // answer when the upstream decision lands (§3.3).
      deferred.push({ id, reason: 'PREREQUISITE_UNRESOLVED', blockedBy: unmetPrereqs });
      continue;
    }

    if (candidate.changesDecision === false) {
      deferred.push({ id, reason: 'DOES_NOT_CHANGE_DECISION' });
      continue;
    }

    if (candidate.agentCanCheck === true) {
      delegated.push({
        id,
        reason: 'AGENT_CAN_CHECK',
        detail: '可查事实由 discovery worker 查证，不询问用户',
        suggestedDispatch: 'DISCOVER',
      });
      continue;
    }

    if (!worthAsking(candidate)) {
      deferred.push({
        id,
        reason: 'BELOW_ASK_THRESHOLD',
        detail: '不确定性 × 猜错代价 未超过提问成本；登记为假设',
        registerAssumption: true,
        defeatCondition: candidate.defeatCondition ?? null,
      });
      continue;
    }

    admitted.push({
      id,
      question: candidate.question ?? null,
      requiredFrom: candidate.requiredFrom ?? 'decider',
      surpriseTest: candidate.surprising === true,
    });
  }

  // One interruption resolves one load-bearing decision (§3.3). The most upstream
  // admitted question wins; the rest wait for the next Frontier derivation.
  const next = admitted[0] ?? null;

  return deepFreeze({
    admitted,
    next,
    deferred,
    delegated,
    // Assumptions that must be logged with a defeat condition (§3.3).
    assumptions: deferred
      .filter((item) => item.registerAssumption === true)
      .map((item) => ({ id: item.id, defeatCondition: item.defeatCondition })),
  });
}

/**
 * The ask threshold: uncertainty × cost-of-guessing-wrong > cost-of-asking.
 *
 * The surprise test is the backstop — if the user would be surprised to see this
 * decision made for them, ask regardless of the arithmetic (§3.3).
 */
export function worthAsking(candidate = {}) {
  if (candidate.surprising === true) return true;
  const uncertainty = candidate.uncertainty ?? 0;
  const costOfWrong = candidate.costOfWrong ?? 0;
  const costOfAsking = candidate.costOfAsking ?? 1;
  return uncertainty * costOfWrong > costOfAsking;
}

/**
 * Assert that no Frontier data leaked into a persisted structure (invariant I13).
 *
 * Frontier questions are recomputed from current state every round; a stored copy
 * would be consulted after the answer that invalidated it, resurrecting settled
 * questions. Journals and checkpoints must therefore never contain these keys.
 */
export const FRONTIER_KEYS = deepFreeze([
  'frontier', 'admitted', 'candidates', 'pending_questions', 'question_queue',
]);

export function assertNotPersisted(persisted = {}) {
  const found = [];
  const walk = (node, path) => {
    if (node === null || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (FRONTIER_KEYS.includes(key)) found.push([...path, key].join('.'));
      walk(value, [...path, key]);
    }
  };
  walk(persisted, []);
  return deepFreeze({ clean: found.length === 0, violations: found });
}
