/**
 * Control-plane protocol runtime — public surface.
 *
 * Pure functions only: no I/O, no clock reads except explicit expiry comparisons,
 * no dependencies outside this directory. Everything here is a planning-phase or
 * gate-phase decision, which is what makes the protocol mechanically verifiable
 * rather than advisory.
 *
 * Ownership boundary: journal append, checkpoint reduction, schema/semantic
 * validation and `deriveOutcome` live in the data kernel (`../../lib/`). This module
 * owns the evidence ladder and criterion typology as the single source of truth —
 * the kernel imports them from here rather than redefining the rung order.
 */

export { deepFreeze } from './freeze.mjs';

export {
  RUNGS,
  CRITERION_STATES,
  CRITERION_TYPES,
  CRITERION_TYPE_NAMES,
  rungIndex,
  meetsRung,
  maxRung,
  minRung,
  criterionType,
  agentMayJudge,
} from './evidence.mjs';

export {
  RISK_DIMENSIONS,
  RISK_DIMENSION_NAMES,
  RISK_WORST_CASE,
  riskLevel,
  riskAtLeast,
  normalizeRisk,
  deriveRequiredRung,
  requiresApproval,
  requiresTargetEnumeration,
} from './risk.mjs';

export {
  VAGUE_PREDICATES,
  VAGUE_PREDICATES_EN,
  UNIVERSAL_NEGATIVE_MARKERS,
  gateCriterion,
  criteriaGate,
} from './criteria-gate.mjs';

export {
  MANDATE_COMPONENTS,
  MANDATE_COMPONENT_NAMES,
  assessStep,
  partitionGoal,
  validateHandoff,
} from './mandate.mjs';

export {
  NON_APPROVAL_UTTERANCES,
  SAFE_DEFAULTS,
  recordApproval,
  isNonApproval,
  checkDeltaApproval,
  checkInterruptionInvariants,
} from './approval.mjs';

export {
  PHASES,
  OUTCOMES,
  SEALABLE_OUTCOMES,
  BLOCKED_REASONS,
  isTerminal,
  checkTransition,
  guardsFor,
  validatePhaseOutcome,
} from './state-machine.mjs';

export {
  SIGNALS,
  METHOD_PACKS,
  FRONTIER_KEYS,
  route,
  deriveFrontier,
  worthAsking,
  assertNotPersisted,
} from './router.mjs';

export {
  PRINCIPAL_ROLES,
  validateGoalShape,
  validateScopeChange,
  detectSilentNarrowing,
} from './goal-shape.mjs';

export {
  HARD_GATES,
  gateStep,
  checkHardGates,
} from './planning-gate.mjs';
