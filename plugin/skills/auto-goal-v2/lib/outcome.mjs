/**
 * Deterministic outcome reducer (design §11.2, invariant I1).
 *
 * This is the only place a terminal outcome — DONE above all — can come from. It
 * is a pure function of the criterion ledger, constraints, scope and residual, so
 * the same journal always yields the same verdict and no narrative can talk its
 * way to completion.
 *
 * The arbitration order deliberately biases toward under-reporting:
 *   1. constraint violated or delivered state incoherent  -> BLOCKED
 *   2. a named principal-held key can resume this plan    -> NEEDS_INPUT
 *   3. any in-scope criterion VIOLATED                    -> BLOCKED(FALSIFIED)
 *   4. attainable work unfinished                         -> PARTIAL
 *   5. requirement unreachable after maximal evidence     -> UNVERIFIABLE
 *   6. scope narrowed or residual non-empty               -> PARTIAL
 *   7. all in-scope criteria satisfied at required rung    -> DONE
 *   otherwise                                             -> BLOCKED(INVARIANT_VIOLATED)
 *
 * UNVERIFIABLE requires the evidence ceiling to have been reached. Not having
 * tried yet is UNTESTED, and UNTESTED never ends a goal.
 */

import { assessSatisfaction, hasExhaustedEvidence, inScopeEntries } from './ledger.mjs';

/**
 * Derive the outcome.
 *
 * @param {object} input
 * @param {{entries: Map<string, object>}} input.ledger built ledger
 * @param {number} input.scopeVersion current approved scope version
 * @param {boolean} [input.scopeApproved] whether this scope version has decider approval
 * @param {number} [input.originalScopeVersion] scope version originally aligned
 * @param {Array<{constraint_id: string, violated: boolean}>} [input.constraints]
 * @param {boolean} [input.deliveredStateCoherent] false when work stopped mid-change
 * @param {Array<object>} [input.residual] goal \ mandate
 * @param {object|null} [input.pendingInterruption] open principal-held key request
 * @param {boolean} [input.attainableWorkComplete] whether planned reachable work finished
 * @param {Map<string, object>} [input.artifactIndex] artifact_id -> manifest
 * @param {string[]} [input.agentIdentities]
 * @returns {{status: string, reason: string|null, rationale: string, criteria: object[], residual: object[], scope_version: number, required_fields: object}}
 */
export function deriveOutcome(input) {
  const {
    ledger,
    scopeVersion,
    scopeApproved = true,
    originalScopeVersion = scopeVersion,
    constraints = [],
    deliveredStateCoherent = true,
    residual = [],
    pendingInterruption = null,
    attainableWorkComplete = true,
    artifactIndex = new Map(),
    agentIdentities = ['agent', 'controller', 'self'],
  } = input;

  const entries = inScopeEntries(ledger);
  const assessed = entries.map((entry) => ({
    entry,
    assessment: assessSatisfaction(entry, { artifactIndex, agentIdentities }),
  }));

  const criteriaProjection = assessed.map(({ entry, assessment }) => ({
    criterion_id: entry.criterion_id,
    type: entry.type,
    state: entry.state,
    required_rung: entry.required_rung,
    achieved_rung: entry.achieved_rung,
    evidence_refs: [...entry.evidence_refs],
    blocking_reasons: assessment.satisfiable ? [] : assessment.reasons,
  }));

  const base = {
    criteria: criteriaProjection,
    residual: [...residual],
    scope_version: scopeVersion,
  };

  const violatedConstraints = constraints.filter((constraint) => constraint.violated === true);

  // 1. A broken invariant or a half-changed world outranks everything: stop and
  //    roll back rather than reporting a partial delivery that is not usable.
  if (violatedConstraints.length > 0) {
    return outcome('BLOCKED', 'CONSTRAINT_VIOLATED', base, {
      rationale: `${violatedConstraints.length} constraint(s) violated: ${violatedConstraints
        .map((constraint) => constraint.constraint_id)
        .join(', ')}`,
      gaps: violatedConstraints.map((constraint) => constraint.constraint_id),
    });
  }

  if (deliveredStateCoherent === false) {
    return outcome('BLOCKED', 'INCOHERENT_STATE', base, {
      rationale: 'Delivered state is not self-coherent; roll back before reporting progress',
      gaps: ['delivered state incoherent'],
    });
  }

  // 2. Asking beats stopping when one named answer resumes the same plan.
  if (pendingInterruption) {
    return outcome('NEEDS_INPUT', null, base, {
      rationale: `Awaiting ${pendingInterruption.code} from ${pendingInterruption.required_from}`,
      interruption: pendingInterruption,
    });
  }

  const violated = assessed.filter(({ entry }) => entry.state === 'VIOLATED');
  if (violated.length > 0) {
    return outcome('BLOCKED', 'FALSIFIED', base, {
      rationale: `${violated.length} in-scope criterion/criteria falsified`,
      gaps: violated.map(({ entry }) => entry.criterion_id),
    });
  }

  const untested = assessed.filter(({ entry }) => entry.state === 'UNTESTED');

  // 4. Unfinished reachable work is PARTIAL, never DONE and never UNVERIFIABLE.
  if (attainableWorkComplete === false) {
    return outcome('PARTIAL', null, base, {
      rationale: 'Attainable work is not complete',
      completed: satisfiedIds(assessed),
      outstanding: outstandingIds(assessed),
    });
  }

  // 5. UNVERIFIABLE only after the ceiling is genuinely reached. A criterion that
  //    is merely untested keeps the goal open (scenario O06).
  //
  //    Classification uses the assessment, never the recorded `state`. An entry
  //    labelled SATISFIED on inadequate evidence must be treated as the shortfall
  //    it is — trusting the label here would be exactly the false-DONE hole the
  //    ledger exists to close.
  const unsatisfied = assessed.filter(({ assessment }) => !assessment.satisfiable);
  const unreachable = unsatisfied.filter(({ entry }) => hasExhaustedEvidence(entry));
  const stillTestable = unsatisfied.filter(({ entry }) => !hasExhaustedEvidence(entry));

  if (stillTestable.length > 0) {
    return outcome('PARTIAL', null, base, {
      rationale: `${stillTestable.length} criterion/criteria still have available verification; not yet unverifiable`,
      completed: satisfiedIds(assessed),
      outstanding: stillTestable.map(({ entry }) => entry.criterion_id),
    });
  }

  if (unreachable.length > 0) {
    return outcome('UNVERIFIABLE', null, base, {
      rationale: `${unreachable.length} criterion/criteria cannot reach required_rung after maximal available evidence`,
      highest_reached: unreachable.map(({ entry }) => ({
        criterion_id: entry.criterion_id,
        achieved_rung: entry.achieved_rung,
        required_rung: entry.required_rung,
        max_rung: entry.max_rung,
        who_can_decide: entry.acceptor_ref ?? 'unnamed acceptor',
      })),
    });
  }

  // 6. A narrowed scope or non-empty residual caps the outcome at PARTIAL even
  //    when every remaining criterion passed (design §11.2).
  if (scopeVersion > originalScopeVersion || residual.length > 0) {
    return outcome('PARTIAL', null, base, {
      rationale:
        residual.length > 0
          ? `${residual.length} residual item(s) outside the Agent's mandate`
          : `scope narrowed from version ${originalScopeVersion} to ${scopeVersion}`,
      completed: satisfiedIds(assessed),
      outstanding: outstandingIds(assessed),
    });
  }

  const allSatisfied =
    assessed.length > 0 &&
    assessed.every(({ entry, assessment }) => entry.state === 'SATISFIED' && assessment.satisfiable);

  if (allSatisfied && scopeApproved) {
    return outcome('DONE', null, base, {
      rationale: `All ${assessed.length} in-scope criteria satisfied at required rung under approved scope_version ${scopeVersion}`,
      constraints: constraints.map((constraint) => ({
        constraint_id: constraint.constraint_id,
        violated: false,
      })),
    });
  }

  // Everything above should have matched. Reaching here means the ledger and the
  // guards disagree — report it rather than guessing a friendlier answer.
  return outcome('BLOCKED', 'INVARIANT_VIOLATED', base, {
    rationale: allSatisfied
      ? `scope_version ${scopeVersion} lacks decider approval`
      : `ledger is not in a decidable terminal shape (${untested.length} untested, ${assessed.length} in scope)`,
    gaps: outstandingIds(assessed),
  });
}

function satisfiedIds(assessed) {
  return assessed
    .filter(({ entry, assessment }) => entry.state === 'SATISFIED' && assessment.satisfiable)
    .map(({ entry }) => entry.criterion_id);
}

function outstandingIds(assessed) {
  return assessed
    .filter(({ entry, assessment }) => entry.state !== 'SATISFIED' || !assessment.satisfiable)
    .map(({ entry }) => entry.criterion_id);
}

function outcome(status, reason, base, extra) {
  const { rationale, ...requiredFields } = extra;
  return {
    status,
    reason,
    rationale,
    ...base,
    // Terminal-specific mandatory content (design §11.3). Always present, even
    // when empty, so "never empty-handed" is a field constraint not a slogan.
    required_fields: requiredFields,
  };
}

/** Whether an outcome may be sealed with GOAL_TERMINATED. NEEDS_INPUT may not. */
export function isSealable(status) {
  return status !== 'NEEDS_INPUT';
}

/**
 * Verify a terminal outcome carries its mandatory fields (design §11.3).
 * @returns {string[]} missing field names
 */
export function missingTerminalFields(result) {
  const required = {
    DONE: ['constraints'],
    PARTIAL: ['completed', 'outstanding'],
    BLOCKED: ['gaps'],
    UNVERIFIABLE: ['highest_reached'],
    NEEDS_INPUT: ['interruption'],
  }[result.status] ?? [];

  const missing = required.filter((field) => result.required_fields[field] === undefined);
  // Residual accompanies every outcome, empty or not (invariant I15).
  if (result.residual === undefined) missing.push('residual');
  return missing;
}
