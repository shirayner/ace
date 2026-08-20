/**
 * Risk dimensions and the risk → required-evidence mapping.
 *
 * Design refs: §2.6 (deterministic mapping), §10 (approval), generic-goal-model §5.1.
 *
 * Risk is described by five orthogonal dimensions, never by tool name. "Dangerous ==
 * rm -rf" is a software-engineering bias; sending an email is irreversible in the
 * dimensions that matter while `rm` on a scratch file is not.
 */

import { deepFreeze } from './freeze.mjs';
import { criterionType, maxRung, minRung, rungIndex } from './evidence.mjs';

/**
 * The five risk dimensions, each ordered from least to most severe.
 * Order matters: `atLeast` comparisons below use the index.
 */
export const RISK_DIMENSIONS = deepFreeze({
  reversibility: ['easy', 'costly', 'impossible'],
  externality: ['private', 'shared', 'public'],
  blast_radius: ['one', 'bounded_many', 'unbounded'],
  undo_window: ['available', 'short', 'none'],
  detectability: ['loud', 'observable', 'silent'],
});

export const RISK_DIMENSION_NAMES = deepFreeze(Object.keys(RISK_DIMENSIONS));

/**
 * The most conservative value of every dimension. Used as the default when a
 * dimension is absent: an unassessed action is treated as maximally risky, so
 * forgetting to assess raises the gate instead of lowering it.
 */
export const RISK_WORST_CASE = deepFreeze(
  Object.fromEntries(
    RISK_DIMENSION_NAMES.map((name) => [name, RISK_DIMENSIONS[name].at(-1)]),
  ),
);

/** Severity ordinal of one dimension value. Throws on unknown values. */
export function riskLevel(dimension, value) {
  const scale = RISK_DIMENSIONS[dimension];
  if (!scale) throw new TypeError(`unknown risk dimension: ${JSON.stringify(dimension)}`);
  const index = scale.indexOf(value);
  if (index === -1) {
    throw new TypeError(`unknown ${dimension} value: ${JSON.stringify(value)}`);
  }
  return index;
}

/** Is `value` at or above `threshold` on this dimension's severity scale? */
export function riskAtLeast(dimension, value, threshold) {
  return riskLevel(dimension, value) >= riskLevel(dimension, threshold);
}

/**
 * Normalise a partial risk assessment, filling absent dimensions with the worst
 * case and recording which ones were unassessed.
 *
 * Returned `unassessed` is not cosmetic: an action whose risk was never assessed
 * must not be presented to a decider as if it had been.
 */
export function normalizeRisk(risk = {}) {
  const unassessed = [];
  const assessed = {};
  for (const name of RISK_DIMENSION_NAMES) {
    const value = risk?.[name];
    if (value === undefined || value === null) {
      unassessed.push(name);
      assessed[name] = RISK_WORST_CASE[name];
    } else {
      riskLevel(name, value); // throws on garbage rather than silently defaulting
      assessed[name] = value;
    }
  }
  return deepFreeze({ risk: assessed, unassessed });
}

/**
 * Conditions that force a criterion's required evidence to at least E4 (external
 * authority). Each is independently sufficient — an action that leaves the user's
 * private domain cannot be self-certified even when it is technically reversible.
 */
const E4_ESCALATIONS = deepFreeze([
  {
    code: 'EXTERNALITY_NOT_PRIVATE',
    reason: '效果离开用户私域，社会性效果几乎不可撤销',
    test: (risk) => riskAtLeast('externality', risk.externality, 'shared'),
  },
  {
    code: 'IRREVERSIBLE',
    reason: '动作不可逆，事后无法通过同等能力撤销',
    test: (risk) => risk.reversibility === 'impossible',
  },
  {
    code: 'UNBOUNDED_BLAST_RADIUS',
    reason: '影响实体不可枚举，误识别目标集的代价无界',
    test: (risk) => risk.blast_radius === 'unbounded',
  },
  {
    code: 'SILENT_FAILURE',
    reason: '出错时用户不会察觉，静默污染比响亮失败更危险',
    test: (risk) => risk.detectability === 'silent',
  },
]);

/**
 * Derive the required evidence rung for one criterion under one risk profile.
 *
 * Algorithm (design §2.6), deliberately conservative and deterministic — it does
 * not pretend to quantify probability:
 *
 *   1. baseline from the criterion type
 *   2. raise to >= E4 if any escalation condition holds
 *   3. compare against the ceiling (type ceiling, optionally lowered per criterion)
 *
 * Step 3 is where the design text reads ambiguously: it says both "cap by
 * max_rung" and "if required_rung > max_rung => UNTESTABLE". Capping alone would
 * make the second clause unreachable. We resolve it by reporting both: `required`
 * is the honest demand, `effectiveRequired` is what verification can actually
 * attempt, and `untestable` is true when they differ. Silently capping would turn
 * an undecidable criterion into a passable one, which is exactly the false-DONE
 * path the ladder exists to close.
 */
export function deriveRequiredRung({ type, risk, maxRung: ceilingOverride } = {}) {
  const descriptor = criterionType(type);
  const { risk: assessed, unassessed } = normalizeRisk(risk);

  let required = descriptor.baseline;
  const escalations = [];
  for (const escalation of E4_ESCALATIONS) {
    if (escalation.test(assessed)) {
      escalations.push({ code: escalation.code, reason: escalation.reason });
      required = maxRung(required, 'E4');
    }
  }

  // A per-criterion ceiling may only lower the type ceiling, never raise it:
  // raising it would let JUDGMENT claim rungs its decider never granted (I9).
  const ceiling = ceilingOverride
    ? minRung(descriptor.maxRung, ceilingOverride)
    : descriptor.maxRung;

  const untestable = rungIndex(required) > rungIndex(ceiling);

  return deepFreeze({
    type,
    baseline: descriptor.baseline,
    required,
    ceiling,
    effectiveRequired: untestable ? ceiling : required,
    untestable,
    escalations,
    unassessedDimensions: unassessed,
    decidedBy: descriptor.decidedBy,
  });
}

/**
 * Does this risk profile require an explicit approval gate before the side effect
 * runs? Approval is a function of the risk dimensions, not of the tool used.
 *
 * Note this is intentionally broader than the E4 escalation set: a bounded-but-many
 * blast radius over a shared resource needs a decider's key even when each single
 * change is cheap to undo.
 */
export function requiresApproval(risk = {}) {
  const { risk: assessed, unassessed } = normalizeRisk(risk);
  const triggers = [];

  if (riskAtLeast('externality', assessed.externality, 'shared')) {
    triggers.push({ code: 'LEAVES_PRIVATE_DOMAIN', dimension: 'externality' });
  }
  if (riskAtLeast('reversibility', assessed.reversibility, 'costly')) {
    triggers.push({ code: 'NOT_FREELY_REVERSIBLE', dimension: 'reversibility' });
  }
  if (riskAtLeast('blast_radius', assessed.blast_radius, 'bounded_many')) {
    triggers.push({ code: 'MULTI_ENTITY', dimension: 'blast_radius' });
  }
  if (riskAtLeast('undo_window', assessed.undo_window, 'short')) {
    triggers.push({ code: 'NARROW_UNDO_WINDOW', dimension: 'undo_window' });
  }
  if (riskAtLeast('detectability', assessed.detectability, 'silent')) {
    triggers.push({ code: 'SILENT_ON_ERROR', dimension: 'detectability' });
  }

  return deepFreeze({
    required: triggers.length > 0,
    triggers,
    unassessedDimensions: unassessed,
  });
}

/**
 * Must the exact target set be enumerated and approved before acting?
 *
 * Misidentification is usually worse than the action itself: the risk of "rename
 * 3000 files" is not renaming, it is renaming the wrong directory
 * (generic-goal-model §5.4). An unbounded blast radius cannot be enumerated at
 * all, which is itself a blocking finding rather than a licence to proceed.
 */
export function requiresTargetEnumeration(risk = {}) {
  const { risk: assessed } = normalizeRisk(risk);
  if (assessed.blast_radius === 'unbounded') {
    return deepFreeze({ required: true, enumerable: false, code: 'UNBOUNDED_NOT_ENUMERABLE' });
  }
  if (assessed.blast_radius === 'bounded_many') {
    return deepFreeze({ required: true, enumerable: true, code: 'ENUMERATE_BEFORE_APPROVAL' });
  }
  const singleButExternal = riskAtLeast('externality', assessed.externality, 'shared')
    || assessed.reversibility === 'impossible';
  return deepFreeze({
    required: singleButExternal,
    enumerable: true,
    code: singleButExternal ? 'IDENTIFY_SINGLE_TARGET' : 'NOT_REQUIRED',
  });
}
