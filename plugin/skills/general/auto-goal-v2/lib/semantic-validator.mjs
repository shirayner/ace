/**
 * Semantic validation (design §8.2, §17).
 *
 * Schema conformance proves shape. These checks prove meaning: that references
 * resolve, that enums combine legally, that a transition is allowed, that a claim
 * carries evidence and that the claiming role was entitled to make it.
 *
 * Every function returns a violation list rather than throwing, so the proxy can
 * append one rejection event carrying all defects instead of failing on the first.
 */

import {
  PHASE_TRANSITIONS,
  TERMINAL_OUTCOMES,
  EXTERNAL_ACCEPTOR_TYPES,
  ROLE_CLAIM_PERMISSIONS,
  RUNG_CEILING,
  MAIN_AGENT_FORBIDDEN_ARTIFACT_KINDS,
  rungSatisfies,
  rungIndex,
  deriveRequiredRung,
} from './vocabulary.mjs';
import { SemanticValidationError } from './errors.mjs';
import { isSafeRelativePath } from './paths.mjs';

function violation(invariant, message) {
  return { invariant, message };
}

/**
 * A reference-resolution gate cannot run on a set that was never supplied.
 *
 * This throws rather than returning a violation because it is not a defect in the
 * subject under validation — it is the gate reporting that it was not given what
 * it needs to decide. Returning a violation would let a caller "fail" validation
 * for an event that may well be legal, and returning nothing would let it pass one
 * that may well be illegal; only refusing to answer is honest.
 */
function requireSet(context, key) {
  const value = context[key];
  if (!(value instanceof Set)) {
    throw new TypeError(
      `${key} must be a Set of known ids; an absent set cannot confirm any reference and must not be read as an empty one`,
    );
  }
}

/** Same contract as `requireSet`, for the artifact_id -> manifest index. */
function requireMap(context, key) {
  const value = context[key];
  if (!(value instanceof Map)) {
    throw new TypeError(
      `${key} must be a Map of registered artifacts; an absent index cannot confirm any reference and must not be read as an empty one`,
    );
  }
}

/** Aggregate a violation list into a throw. */
export function assertNoViolations(subject, violations) {
  if (violations.length > 0) {
    throw new SemanticValidationError(subject, violations);
  }
}

/**
 * A criterion's internal coherence.
 *
 * Enforces: rung ordering, the UNTESTABLE gap, NEGATIVE's bounded check surface,
 * JUDGMENT/KNOWLEDGE acceptor authority (I9), and that evidence exists for any
 * SATISFIED state (I5/I14).
 */
export function validateCriterion(criterion, { agentIdentities = ['agent', 'controller', 'self'] } = {}) {
  const violations = [];
  const { type, required_rung: required, max_rung: maxRung, achieved_rung: achieved, state } = criterion;

  const ceiling = RUNG_CEILING[type];
  if (ceiling && rungIndex(maxRung) > rungIndex(ceiling)) {
    violations.push(
      violation('rung_ceiling', `max_rung ${maxRung} exceeds ${type} ceiling ${ceiling}`),
    );
  }

  if (rungIndex(achieved) > rungIndex(maxRung)) {
    violations.push(
      violation('rung_ceiling', `achieved_rung ${achieved} exceeds max_rung ${maxRung}`),
    );
  }

  // required > max must surface as UNTESTABLE, never as a quietly lowered bar.
  const gapExists = rungIndex(required) > rungIndex(maxRung);
  if (gapExists && state !== 'UNTESTABLE') {
    violations.push(
      violation(
        'untestable_gap',
        `required_rung ${required} exceeds max_rung ${maxRung}; state must be UNTESTABLE, found ${state}`,
      ),
    );
  }

  if (criterion.risk) {
    const derived = deriveRequiredRung(type, criterion.risk);
    if (rungIndex(required) < rungIndex(derived.required)) {
      violations.push(
        violation(
          'risk_rung_floor',
          `required_rung ${required} is below the risk-derived floor ${derived.required} (raised by ${derived.raisedBy.join(', ') || 'baseline'})`,
        ),
      );
    }
  }

  if (type === 'NEGATIVE') {
    const surface = criterion.check_surface ?? [];
    if (surface.length === 0) {
      violations.push(
        violation(
          'negative_bounded',
          'NEGATIVE criterion requires a non-empty check_surface; a universal absence claim is not checkable',
        ),
      );
    }
  }

  if (EXTERNAL_ACCEPTOR_TYPES.includes(type)) {
    const acceptor = criterion.acceptor_ref;
    if (state === 'SATISFIED') {
      if (!acceptor) {
        violations.push(
          violation('acceptor_required', `${type} criterion cannot be SATISFIED without an acceptor_ref`),
        );
      } else if (agentIdentities.includes(acceptor.toLowerCase())) {
        violations.push(
          violation(
            'acceptor_not_agent',
            `${type} criterion cannot name the Agent ("${acceptor}") as acceptor`,
          ),
        );
      }
    }
  }

  if (state === 'SATISFIED') {
    if (!rungSatisfies(achieved, required)) {
      violations.push(
        violation(
          'evidence_sufficiency',
          `SATISFIED requires achieved_rung >= required_rung, found ${achieved} < ${required}`,
        ),
      );
    }
    if ((criterion.evidence_refs ?? []).length === 0) {
      violations.push(
        violation('evidence_present', 'SATISFIED requires at least one evidence_ref'),
      );
    }
  }

  if (state === 'VIOLATED' && (criterion.evidence_refs ?? []).length === 0) {
    violations.push(violation('evidence_present', 'VIOLATED requires at least one evidence_ref'));
  }

  return violations;
}

/**
 * A journal event's semantics in the context of the chain so far.
 *
 * The reference sets are required, not defaulted. An empty set is a real state — a
 * journal with no ARTIFACT_REGISTERED yet — and it means no reference can be
 * confirmed, so every reference in that state must be rejected. Defaulting a
 * missing set to empty would make "the caller forgot" indistinguishable from
 * "nothing is registered", and since the check then passed silently, a forgotten
 * argument disabled the gate without turning anything red.
 *
 * @param {object} event schema-valid event
 * @param {object} context
 * @param {string} context.taskId task this journal belongs to
 * @param {number} context.expectedSeq the seq this append must claim
 * @param {number} context.expectedSegment the active segment
 * @param {number} context.currentScopeVersion latest approved scope version
 * @param {Set<string>} context.knownArtifactIds registered artifact ids
 * @param {Set<string>} context.knownEventIds ids already in the chain
 */
export function validateEventSemantics(event, context) {
  const violations = [];
  const { taskId, expectedSeq, expectedSegment, currentScopeVersion, knownArtifactIds, knownEventIds } = context;

  requireSet(context, 'knownArtifactIds');
  requireSet(context, 'knownEventIds');

  if (event.task_id !== taskId) {
    violations.push(violation('task_binding', `event task_id ${event.task_id} != ${taskId}`));
  }
  if (expectedSeq !== undefined && event.seq !== expectedSeq) {
    violations.push(violation('seq_monotonic', `expected seq ${expectedSeq}, found ${event.seq}`));
  }
  if (expectedSegment !== undefined && event.segment !== expectedSegment) {
    violations.push(
      violation('segment_binding', `expected segment ${expectedSegment}, found ${event.segment}`),
    );
  }

  // Workers never author control-plane events (invariant I3).
  if (event.actor.startsWith('worker:')) {
    violations.push(
      violation('single_writer', `actor ${event.actor} may not append events; only controller/proxy/user may`),
    );
  }

  if (event.causation_id !== null && !knownEventIds.has(event.causation_id)) {
    violations.push(
      violation('causation_resolves', `causation_id ${event.causation_id} is not a known event`),
    );
  }

  for (const artifactId of event.artifact_refs) {
    if (!knownArtifactIds.has(artifactId)) {
      violations.push(
        violation('artifact_resolves', `artifact_ref ${artifactId} is not registered in this task`),
      );
    }
  }

  // scope_version may only advance through an approved SCOPE_CHANGED (invariant I2).
  if (currentScopeVersion !== undefined) {
    if (event.type === 'SCOPE_CHANGED') {
      if (event.scope_version !== currentScopeVersion + 1) {
        violations.push(
          violation(
            'scope_monotonic',
            `SCOPE_CHANGED must increment scope_version to ${currentScopeVersion + 1}, found ${event.scope_version}`,
          ),
        );
      }
      if (!event.payload?.approved_by) {
        violations.push(
          violation('scope_approved', 'SCOPE_CHANGED requires payload.approved_by naming the decider'),
        );
      }
    } else if (event.scope_version !== currentScopeVersion) {
      violations.push(
        violation(
          'scope_stable',
          `${event.type} carries scope_version ${event.scope_version}, expected ${currentScopeVersion}; only SCOPE_CHANGED may advance it`,
        ),
      );
    }
  }

  violations.push(...validateEventPayload(event));
  return violations;
}

/** Per-type payload requirements. Only fields the reducer actually consumes. */
function validateEventPayload(event) {
  const violations = [];
  const payload = event.payload ?? {};

  const require = (field, invariant, hint) => {
    if (payload[field] === undefined || payload[field] === null) {
      violations.push(violation(invariant, `${event.type} requires payload.${field}: ${hint}`));
    }
  };

  switch (event.type) {
    case 'GOAL_CREATED':
      require('goal_id', 'payload_complete', 'the goal artifact this task tracks');
      require('goal_summary', 'payload_complete', 'bounded summary for the checkpoint');
      break;
    case 'GOAL_ALIGNED':
      require('approved_by', 'alignment_approved', 'explicit approval; silence is not approval');
      break;
    case 'CRITERION_DEFINED':
      require('criterion_id', 'payload_complete', 'the criterion being defined');
      require('type', 'criterion_typed', 'untyped criteria may not enter execution');
      require('required_rung', 'payload_complete', 'evidence contract must be explicit');
      break;
    case 'CRITERION_UPDATED':
      require('criterion_id', 'payload_complete', 'the criterion being updated');
      require('state', 'payload_complete', 'the new ledger state');
      break;
    case 'EVIDENCE_RECORDED':
      require('criterion_id', 'payload_complete', 'the criterion this evidence serves');
      require('rung', 'payload_complete', 'the evidence rung achieved');
      if (event.artifact_refs.length === 0) {
        violations.push(
          violation('evidence_present', 'EVIDENCE_RECORDED requires at least one artifact_ref'),
        );
      }
      break;
    case 'APPROVAL_GRANTED':
      require('approval_id', 'payload_complete', 'the approval being granted');
      require('granted_by', 'approval_attributed', 'who granted it');
      require('action_kind', 'approval_scoped', 'approval binds to an action kind');
      require('target_set', 'approval_scoped', 'approval binds to an enumerated target set');
      break;
    case 'EFFECT_INTENDED':
      require('action_kind', 'payload_complete', 'what effect is about to happen');
      require('target_set', 'effect_enumerated', 'the exact targets, enumerated before acting');
      require('approval_ref', 'effect_approved', 'the scoped approval authorizing it');
      if (!event.idempotency_key) {
        violations.push(
          violation(
            'effect_idempotent',
            'EFFECT_INTENDED requires an idempotency_key so recovery can query instead of replaying',
          ),
        );
      }
      break;
    case 'EFFECT_OBSERVED':
      require('intent_event_id', 'effect_paired', 'the EFFECT_INTENDED this observes');
      require('rung', 'payload_complete', 'observation strength; a 200 response is only E1');
      break;
    case 'WORKER_DISPATCHED':
      require('dispatch_id', 'payload_complete', 'the dispatch being launched');
      require('role', 'payload_complete', 'the single worker role');
      break;
    case 'DISPATCH_REJECTED':
      require('dispatch_id', 'payload_complete', 'the rejected dispatch');
      require('code', 'payload_complete', 'the machine rejection code');
      break;
    case 'WORKER_RESULT_ACCEPTED':
    case 'WORKER_RESULT_REJECTED':
      require('dispatch_id', 'payload_complete', 'the dispatch this result belongs to');
      break;
    case 'ARTIFACT_REGISTERED':
      require('artifact_id', 'payload_complete', 'the artifact being registered');
      require('sha256', 'payload_complete', 'content digest for later verification');
      break;
    case 'INPUT_REQUESTED':
      require('resume_token', 'interruption_resumable', 'the token that resumes this plan');
      require('code', 'payload_complete', 'the interruption code');
      break;
    case 'INPUT_RECEIVED':
      require('resume_token', 'interruption_resumable', 'the token being answered');
      break;
    case 'STEP_PLANNED':
      require('step_id', 'payload_complete', 'the planned step');
      require('kind', 'payload_complete', 'the step role');
      break;
    case 'SEGMENT_ROLLED':
      require('previous_segment', 'segment_sealed', 'the sealed segment being continued');
      require('seal_hash', 'segment_sealed', 'the seal hash linking the chain across segments');
      break;
    case 'CHECKPOINT_REDUCED':
      require('checkpoint_hash', 'payload_complete', 'hash of the reduced checkpoint');
      break;
    case 'GOAL_TERMINATED':
      require('status', 'terminal_status', 'the sealed terminal outcome');
      if (payload.status !== undefined && !TERMINAL_OUTCOMES.includes(payload.status)) {
        violations.push(
          violation(
            'terminal_status',
            `GOAL_TERMINATED status must be one of ${TERMINAL_OUTCOMES.join('|')}, found ${payload.status}; NEEDS_INPUT is not sealable`,
          ),
        );
      }
      if (payload.residual === undefined) {
        violations.push(
          violation('handoff_present', 'GOAL_TERMINATED requires payload.residual, even when empty'),
        );
      }
      break;
    default:
      break;
  }

  return violations;
}

/** Whether a phase transition is permitted (design §6.1). */
export function validatePhaseTransition(fromPhase, toPhase) {
  const allowed = PHASE_TRANSITIONS[fromPhase];
  if (!allowed) {
    return [violation('phase_known', `unknown phase "${fromPhase}"`)];
  }
  if (fromPhase === toPhase) return [];
  if (!allowed.includes(toPhase)) {
    return [
      violation(
        'phase_transition',
        `transition ${fromPhase} -> ${toPhase} is not permitted; allowed: ${allowed.join(', ') || 'none'}`,
      ),
    ];
  }
  return [];
}

/**
 * A worker output envelope's semantics before it may update any ledger.
 *
 * `artifactIndex` is required for the same reason the event gate's sets are: an
 * empty index means nothing is registered, so no evidence_ref can be confirmed and
 * every one of them must be rejected. Treating an absent index as empty-and-fine
 * would let a caller that forgot the argument accept unverifiable evidence.
 *
 * @param {object} output schema-valid worker output
 * @param {object} context
 * @param {string} context.dispatchId the dispatch this result must match
 * @param {string} context.role role the dispatch assigned
 * @param {number} context.dispatchScopeVersion scope version captured at dispatch
 * @param {number} context.currentScopeVersion scope version now
 * @param {Map<string, object>} context.artifactIndex artifact_id -> manifest
 */
export function validateWorkerOutput(output, context) {
  const violations = [];
  const { dispatchId, role, dispatchScopeVersion, currentScopeVersion, artifactIndex } = context;

  requireMap(context, 'artifactIndex');

  if (output.dispatch_id !== dispatchId) {
    violations.push(
      violation('dispatch_binding', `output dispatch_id ${output.dispatch_id} != ${dispatchId}`),
    );
  }

  // A result computed against a superseded scope may be stored but never scored.
  if (
    dispatchScopeVersion !== undefined &&
    currentScopeVersion !== undefined &&
    dispatchScopeVersion !== currentScopeVersion
  ) {
    violations.push(
      violation(
        'stale_scope',
        `result was produced under scope_version ${dispatchScopeVersion} but current is ${currentScopeVersion}; keep the artifact, do not update the ledger`,
      ),
    );
  }

  const permitted = ROLE_CLAIM_PERMISSIONS[role] ?? [];
  for (const claim of output.claims ?? []) {
    if (!permitted.includes(claim.kind)) {
      violations.push(
        violation(
          'role_claim_authority',
          `role ${role} may not produce claim kind ${claim.kind}; permitted: ${permitted.join(', ')}`,
        ),
      );
    }

    // 'no_finding' is an honest result and needs no artifact; every other claim does.
    if (claim.kind !== 'no_finding') {
      if (!claim.evidence_ref) {
        violations.push(
          violation('claim_evidence', `claim on ${claim.subject_ref} has no evidence_ref`),
        );
      } else if (!artifactIndex.has(claim.evidence_ref)) {
        violations.push(
          violation(
            'claim_evidence_exists',
            `claim evidence_ref ${claim.evidence_ref} is not a registered artifact of this task`,
          ),
        );
      }
    }

    if (claim.kind === 'criterion_checked' && !claim.achieved_rung) {
      violations.push(
        violation(
          'claim_rung',
          `criterion_checked claim on ${claim.subject_ref} must state achieved_rung`,
        ),
      );
    }
  }

  for (const artifactId of output.artifact_refs ?? []) {
    if (!artifactIndex.has(artifactId)) {
      violations.push(
        violation('artifact_resolves', `artifact_ref ${artifactId} is not registered in this task`),
      );
    }
  }

  if (output.status === 'FAILED' && !output.error) {
    violations.push(violation('error_present', 'FAILED status requires an error object'));
  }
  if (output.status === 'SUCCEEDED' && output.error) {
    violations.push(violation('error_absent', 'SUCCEEDED status must not carry an error object'));
  }

  return violations;
}

/**
 * A manifest's semantics: path containment, digest presence, truncation honesty.
 *
 * `existsOnDisk` and `actualSha256` come from the caller because this module
 * performs no I/O; the proxy supplies them after writing the raw artifact.
 */
export function validateArtifactManifest(manifest, context = {}) {
  const violations = [];
  const { taskId, existsOnDisk, actualSha256, actualBytes } = context;

  if (taskId !== undefined && manifest.task_id !== taskId) {
    violations.push(
      violation('task_binding', `manifest task_id ${manifest.task_id} != ${taskId}`),
    );
  }

  if (!isSafeRelativePath(manifest.path)) {
    violations.push(
      violation('path_containment', `manifest path "${manifest.path}" is not a safe task-relative path`),
    );
  }

  if (existsOnDisk === false) {
    violations.push(violation('artifact_exists', `artifact file is missing at ${manifest.path}`));
  }

  if (actualSha256 !== undefined && actualSha256 !== manifest.sha256) {
    violations.push(
      violation(
        'digest_matches',
        `manifest sha256 ${manifest.sha256} does not match stored content ${actualSha256}`,
      ),
    );
  }

  if (actualBytes !== undefined && actualBytes !== manifest.bytes) {
    violations.push(
      violation('bytes_match', `manifest bytes ${manifest.bytes} != stored ${actualBytes}`),
    );
  }

  if (manifest.truncated === true) {
    if (manifest.original_bytes <= manifest.bytes) {
      violations.push(
        violation(
          'truncation_honest',
          `truncated artifact must report original_bytes (${manifest.original_bytes}) greater than stored bytes (${manifest.bytes})`,
        ),
      );
    }
  } else if (manifest.original_bytes !== manifest.bytes) {
    violations.push(
      violation(
        'truncation_honest',
        `untruncated artifact must have original_bytes == bytes (${manifest.original_bytes} != ${manifest.bytes})`,
      ),
    );
  }

  return violations;
}

/**
 * A truncated artifact cannot prove a criterion that demands completeness.
 * Such a criterion stays UNTESTED rather than becoming SATISFIED (design §8.3).
 */
export function validateEvidenceUsability(criterion, manifests) {
  const violations = [];
  for (const manifest of manifests) {
    if (manifest.truncated === true && criterion.state === 'SATISFIED') {
      violations.push(
        violation(
          'truncated_evidence',
          `criterion ${criterion.criterion_id} cannot be SATISFIED by truncated artifact ${manifest.artifact_id}`,
        ),
      );
    }
  }
  return violations;
}

/**
 * Guard invariant I4: the main Agent must never ingest raw worker output.
 * @returns {boolean} whether this artifact kind may be read into the main context
 */
export function isMainAgentIngestible(artifactKind) {
  return !MAIN_AGENT_FORBIDDEN_ARTIFACT_KINDS.includes(artifactKind);
}
