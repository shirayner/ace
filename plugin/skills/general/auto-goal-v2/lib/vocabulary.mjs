/**
 * The control plane's closed vocabulary (design §2, §6, §7, §11).
 *
 * Single source of truth for every enum. Schemas and the semantic validator both
 * read from here so a new event type or criterion state cannot be introduced in
 * one place and silently unrecognized in the other.
 *
 * One exception, by design: the risk→evidence mapping lives in
 * `protocols/runtime/risk.mjs`, which owns that policy. `deriveRequiredRung`
 * below delegates to it. The rung, type and state lists here are pinned to that
 * module by a kernel test.
 */

import { deriveRequiredRung as deriveRiskRung } from '../protocols/runtime/risk.mjs';

/** Lifecycle phases. NEEDS_INPUT is a resumable phase, not a terminal outcome. */
export const PHASES = Object.freeze([
  'NEW',
  'ALIGNING',
  'PLANNING',
  'EXECUTING',
  'NEEDS_INPUT',
  'VERIFYING',
  'RECOVERING',
  'TERMINAL',
]);

/** Non-terminal phases: each must carry exactly one next_action (invariant I8). */
export const NON_TERMINAL_PHASES = Object.freeze(
  PHASES.filter((phase) => phase !== 'TERMINAL'),
);

/**
 * Legal phase transitions (design §6.1, §6.3).
 * Any non-terminal phase may additionally fall to BLOCKED, which is expressed as
 * an outcome on the TERMINAL phase — hence TERMINAL is reachable from all of them.
 */
export const PHASE_TRANSITIONS = Object.freeze({
  NEW: Object.freeze(['ALIGNING', 'TERMINAL']),
  ALIGNING: Object.freeze(['PLANNING', 'NEEDS_INPUT', 'RECOVERING', 'TERMINAL']),
  PLANNING: Object.freeze(['EXECUTING', 'ALIGNING', 'NEEDS_INPUT', 'RECOVERING', 'TERMINAL']),
  EXECUTING: Object.freeze(['VERIFYING', 'NEEDS_INPUT', 'RECOVERING', 'TERMINAL']),
  NEEDS_INPUT: Object.freeze(['ALIGNING', 'PLANNING', 'EXECUTING', 'VERIFYING', 'RECOVERING', 'TERMINAL']),
  VERIFYING: Object.freeze(['EXECUTING', 'PLANNING', 'NEEDS_INPUT', 'RECOVERING', 'TERMINAL']),
  RECOVERING: Object.freeze(['ALIGNING', 'PLANNING', 'EXECUTING', 'VERIFYING', 'NEEDS_INPUT', 'TERMINAL']),
  TERMINAL: Object.freeze([]),
});

/** Sealable terminal outcomes. NEEDS_INPUT is intentionally absent. */
export const TERMINAL_OUTCOMES = Object.freeze(['DONE', 'PARTIAL', 'BLOCKED', 'UNVERIFIABLE']);

/** All outcome statuses the reducer can report, including the interruption. */
export const OUTCOME_STATUSES = Object.freeze([...TERMINAL_OUTCOMES, 'NEEDS_INPUT']);

/** BLOCKED reasons — no separate FAILED state exists (design §11.2). */
export const BLOCKED_REASONS = Object.freeze([
  'FALSIFIED',
  'EXHAUSTED',
  'PLAN_CHANGE_REQUIRED',
  'CONSTRAINT_VIOLATED',
  'INCOHERENT_STATE',
  'INVARIANT_VIOLATED',
]);

/** Criterion types (design §2.4). */
export const CRITERION_TYPES = Object.freeze([
  'STATE',
  'BEHAVIOR',
  'ARTIFACT_PROPERTY',
  'JUDGMENT',
  'EFFECT',
  'KNOWLEDGE',
  'NEGATIVE',
]);

/** Criterion ledger states (design §11.1). */
export const CRITERION_STATES = Object.freeze([
  'SATISFIED',
  'VIOLATED',
  'UNTESTED',
  'UNTESTABLE',
  'MOOT',
]);

/** Evidence ladder rungs, ordered weakest to strongest (design §2.5). */
export const EVIDENCE_RUNGS = Object.freeze(['E0', 'E1', 'E2', 'E3', 'E4', 'E5']);

/** Types whose acceptor cannot be the Agent (design §2.4 rule, invariant I9). */
export const EXTERNAL_ACCEPTOR_TYPES = Object.freeze(['JUDGMENT', 'KNOWLEDGE']);

/** Baseline required rung per criterion type (design §2.6). */
export const RUNG_BASELINE = Object.freeze({
  STATE: 'E2',
  BEHAVIOR: 'E3',
  ARTIFACT_PROPERTY: 'E3',
  JUDGMENT: 'E4',
  EFFECT: 'E5',
  KNOWLEDGE: 'E4',
  NEGATIVE: 'E3',
});

/** Evidence ceiling per criterion type (design §2.4). */
export const RUNG_CEILING = Object.freeze({
  STATE: 'E4',
  BEHAVIOR: 'E3',
  ARTIFACT_PROPERTY: 'E4',
  JUDGMENT: 'E4',
  EFFECT: 'E5',
  KNOWLEDGE: 'E4',
  NEGATIVE: 'E3',
});

/** Risk dimensions and their legal values (design §2.6). */
export const RISK_DIMENSIONS = Object.freeze({
  reversibility: Object.freeze(['easy', 'costly', 'impossible']),
  externality: Object.freeze(['private', 'shared', 'public']),
  blast_radius: Object.freeze(['one', 'bounded_many', 'unbounded']),
  undo_window: Object.freeze(['available', 'short', 'none']),
  detectability: Object.freeze(['loud', 'observable', 'silent']),
});

/** Journal event types (design §7.1). No generic STATE_SET exists, by design. */
export const EVENT_TYPES = Object.freeze([
  'GOAL_CREATED',
  'GOAL_ALIGNED',
  'SCOPE_CHANGE_PROPOSED',
  'SCOPE_CHANGED',
  'ASSUMPTION_RECORDED',
  'ASSUMPTION_DEFEATED',
  'CRITERION_DEFINED',
  'MANDATE_ASSESSED',
  'APPROVAL_REQUESTED',
  'APPROVAL_GRANTED',
  'APPROVAL_REJECTED',
  'STEP_PLANNED',
  'DISPATCH_REJECTED',
  'WORKER_DISPATCHED',
  'WORKER_RESULT_ACCEPTED',
  'WORKER_RESULT_REJECTED',
  'ARTIFACT_REGISTERED',
  'EFFECT_INTENDED',
  'EFFECT_OBSERVED',
  'EVIDENCE_RECORDED',
  'CRITERION_UPDATED',
  'INPUT_REQUESTED',
  'INPUT_RECEIVED',
  'CHECKPOINT_REDUCED',
  'SEGMENT_ROLLED',
  'GOAL_TERMINATED',
]);

/** Who may author an event. Workers never write the control plane (invariant I3). */
export const ACTOR_KINDS = Object.freeze(['controller', 'user', 'proxy', 'worker']);

/** Worker roles — one role per dispatch (design §4.2). */
export const WORKER_ROLES = Object.freeze(['DISCOVER', 'PLAN_STEP', 'ACT', 'VERIFY', 'SUMMARIZE']);

/** Worker output statuses (design §7.4). */
export const WORKER_STATUSES = Object.freeze(['SUCCEEDED', 'BLOCKED', 'NEEDS_INPUT', 'FAILED']);

/** Worker claim kinds (design §7.4). */
export const CLAIM_KINDS = Object.freeze([
  'artifact_created',
  'fact_found',
  'criterion_checked',
  'no_finding',
]);

/**
 * Which roles may produce which claims (design §8.2 semantic check).
 * An ACT worker cannot itself decide a criterion was checked; that is VERIFY's job.
 */
export const ROLE_CLAIM_PERMISSIONS = Object.freeze({
  DISCOVER: Object.freeze(['fact_found', 'artifact_created', 'no_finding']),
  PLAN_STEP: Object.freeze(['fact_found', 'artifact_created', 'no_finding']),
  ACT: Object.freeze(['artifact_created', 'fact_found', 'no_finding']),
  VERIFY: Object.freeze(['criterion_checked', 'fact_found', 'artifact_created', 'no_finding']),
  SUMMARIZE: Object.freeze(['artifact_created', 'fact_found', 'no_finding']),
});

/** Artifact kinds (design §7.5). */
export const ARTIFACT_KINDS = Object.freeze([
  'raw_output',
  'report',
  'evidence',
  'diff',
  'log',
  'handoff',
]);

/** Artifact kinds the main Agent may never ingest as content (invariant I4). */
export const MAIN_AGENT_FORBIDDEN_ARTIFACT_KINDS = Object.freeze(['raw_output', 'log', 'diff']);

/** Retention classes for artifacts. */
export const RETENTION_CLASSES = Object.freeze(['task', 'session', 'ephemeral']);

/** next_action kinds the reducer may emit (design §7.2). */
export const NEXT_ACTION_KINDS = Object.freeze([
  'ALIGN',
  'PLAN',
  'DISPATCH',
  'REDUCE',
  'ASK_USER',
  'DERIVE_OUTCOME',
  'SEAL',
]);

/** Active step statuses. */
export const STEP_STATUSES = Object.freeze(['planned', 'ready', 'dispatched', 'awaiting_verification']);

/** Interruption kinds and codes (design §7.6). */
export const INTERRUPTION_KINDS = Object.freeze(['NEEDS_INPUT']);

export const INTERRUPTION_CODES = Object.freeze([
  'APPROVAL_REQUIRED',
  'ACCESS_REQUIRED',
  'ACCEPTOR_REQUIRED',
  'DECISION_REQUIRED',
  'FACT_REQUIRED',
]);

/** Principal functional positions (design §2.1). */
export const PRINCIPAL_ROLES = Object.freeze(['owner', 'decider', 'acceptor']);

/** Mandate components (design §2.2). */
export const MANDATE_COMPONENTS = Object.freeze([
  'effectors',
  'access',
  'authority',
  'competence',
  'observations',
  'safety_boundaries',
]);

/** Numeric strength of an evidence rung; higher dominates. */
export function rungIndex(rung) {
  return EVIDENCE_RUNGS.indexOf(rung);
}

/** Whether `achieved` is at least as strong as `required`. Unknown rungs never satisfy. */
export function rungSatisfies(achieved, required) {
  const achievedIndex = rungIndex(achieved);
  const requiredIndex = rungIndex(required);
  if (achievedIndex < 0 || requiredIndex < 0) return false;
  return achievedIndex >= requiredIndex;
}

/**
 * Required rung for a criterion: type baseline, raised by risk, capped by ceiling.
 *
 * Delegates to the control-plane runtime, which owns the risk→evidence mapping
 * (see `protocols/runtime/index.mjs`). Defining the escalation rules twice would
 * let the two drift, and a drifting evidence floor is precisely the false-DONE
 * hole the ladder exists to close — so this is a thin adapter, not a second
 * implementation.
 *
 * Note the deliberate fail-safe there: an unassessed risk dimension counts as its
 * worst case, so omitting an assessment raises the requirement rather than
 * lowering it.
 *
 * Returns the raised requirement even when it exceeds the ceiling — the caller
 * needs to see the gap to mark the criterion UNTESTABLE during planning rather
 * than silently lowering the bar (design §2.6).
 *
 * @param {string} type criterion type
 * @param {object} [risk] the five risk dimensions; missing ones assume worst case
 * @returns {{required: string, ceiling: string, attainable: boolean, raisedBy: string[]}}
 */
export function deriveRequiredRung(type, risk = {}) {
  if (!RUNG_BASELINE[type]) {
    throw new TypeError(`Unknown criterion type: ${type}`);
  }

  const derived = deriveRiskRung({ type, risk });
  return {
    required: derived.required,
    ceiling: derived.ceiling,
    attainable: !derived.untestable,
    raisedBy: derived.escalations.map((escalation) => ESCALATION_DIMENSIONS[escalation.code]),
  };
}

/** Maps the runtime's escalation codes onto the risk dimension that triggered them. */
const ESCALATION_DIMENSIONS = Object.freeze({
  EXTERNALITY_NOT_PRIVATE: 'externality',
  IRREVERSIBLE: 'reversibility',
  UNBOUNDED_BLAST_RADIUS: 'blast_radius',
  SILENT_FAILURE: 'detectability',
});
