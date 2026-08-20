/**
 * Evidence ladder and criterion typology — the single source of truth.
 *
 * Design refs: §2.4 (criterion types), §2.5 (evidence ladder E0–E5), §11.1 (ledger states).
 *
 * Every other module (including the data kernel's outcome reducer) MUST import the
 * ladder order and the type table from here. A second definition of "which rung is
 * higher" is how E1 starts satisfying an E2 criterion (invariant I14).
 */

import { deepFreeze } from './freeze.mjs';

/**
 * Evidence ladder, ascending. Index is the only ordering authority.
 *
 * E0 model assertion        — proves nothing, never sufficient
 * E1 action trace           — proves an action was attempted, NOT its effect
 * E2 independent read-back  — proves world state at a point in time
 * E3 derived check          — proves a plain-text rule holds over a read-back
 * E4 external authority     — the deciding party has spoken
 * E5 measured world effect  — the intended delta actually happened
 */
export const RUNGS = deepFreeze(['E0', 'E1', 'E2', 'E3', 'E4', 'E5']);

/** Ledger states for a single criterion (design §11.1). */
export const CRITERION_STATES = deepFreeze([
  'SATISFIED',
  'VIOLATED',
  'UNTESTED',
  'UNTESTABLE',
  'MOOT',
]);

/**
 * Criterion typology. `baseline` is the pre-risk required rung; `maxRung` is the
 * ceiling the type itself imposes regardless of effort (design §2.4).
 *
 * `agentMayJudge: false` means the Agent can never be the acceptor for this type.
 * V2 explicitly forbids a user-preauthorised proxy rubric from converting
 * JUDGMENT/KNOWLEDGE into Agent self-verification (design §2.4 rule).
 */
export const CRITERION_TYPES = deepFreeze({
  STATE: {
    baseline: 'E2',
    maxRung: 'E4',
    agentMayJudge: true,
    decidedBy: 'agent',
  },
  BEHAVIOR: {
    baseline: 'E3',
    maxRung: 'E3',
    agentMayJudge: true,
    decidedBy: 'agent',
    requiresStimulus: true,
  },
  ARTIFACT_PROPERTY: {
    baseline: 'E3',
    maxRung: 'E4',
    agentMayJudge: true,
    decidedBy: 'agent',
    requiresPlainStandard: true,
  },
  JUDGMENT: {
    baseline: 'E4',
    maxRung: 'E4',
    agentMayJudge: false,
    decidedBy: 'acceptor',
  },
  EFFECT: {
    baseline: 'E5',
    maxRung: 'E5',
    agentMayJudge: false,
    decidedBy: 'metric_owner',
    horizonSensitive: true,
  },
  KNOWLEDGE: {
    baseline: 'E4',
    maxRung: 'E4',
    agentMayJudge: false,
    decidedBy: 'user',
  },
  NEGATIVE: {
    baseline: 'E3',
    maxRung: 'E3',
    agentMayJudge: true,
    decidedBy: 'agent',
    requiresBoundedSurface: true,
  },
});

/** Criterion type names, for schema enums and validation messages. */
export const CRITERION_TYPE_NAMES = deepFreeze(Object.keys(CRITERION_TYPES));

/** Ordinal position of a rung. Throws on anything not on the ladder. */
export function rungIndex(rung) {
  const index = RUNGS.indexOf(rung);
  if (index === -1) {
    throw new TypeError(`unknown evidence rung: ${JSON.stringify(rung)}`);
  }
  return index;
}

/**
 * Does `achieved` evidence satisfy a `required` rung?
 *
 * Strictly "at or above". This is the mechanical form of invariant I14: E1 never
 * satisfies a criterion requiring E2+, no matter how confident the narrative is.
 */
export function meetsRung(achieved, required) {
  return rungIndex(achieved) >= rungIndex(required);
}

/** The higher of two rungs. */
export function maxRung(a, b) {
  return rungIndex(a) >= rungIndex(b) ? a : b;
}

/** The lower of two rungs. */
export function minRung(a, b) {
  return rungIndex(a) <= rungIndex(b) ? a : b;
}

/** Look up a criterion type descriptor. Throws on unknown types. */
export function criterionType(type) {
  const descriptor = CRITERION_TYPES[type];
  if (!descriptor) {
    throw new TypeError(`unknown criterion type: ${JSON.stringify(type)}`);
  }
  return descriptor;
}

/**
 * Can the Agent itself be the deciding party for this criterion type?
 * JUDGMENT / EFFECT / KNOWLEDGE always answer false (invariant I9).
 */
export function agentMayJudge(type) {
  return criterionType(type).agentMayJudge === true;
}
