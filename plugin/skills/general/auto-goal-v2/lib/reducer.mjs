/**
 * Checkpoint reducer: journal -> bounded checkpoint (design §7.2, §9.5).
 *
 * The checkpoint is a derived projection, never an independently written state
 * file. That is what prevents drift: it always carries the cursor and hash of the
 * event it was computed from, so a stale checkpoint is detectable.
 *
 * It must fit 2 KiB and carry exactly one next_action while non-terminal
 * (invariant I8). Zero or several is a reducer failure, not a truncation problem.
 */

import { BUDGETS, utf8Bytes } from './budgets.mjs';
import { canonicalHash } from './canonical.mjs';
import { ReducerError } from './errors.mjs';
import { buildLedger, countStates, inScopeEntries } from './ledger.mjs';
import { deriveOutcome, isSealable } from './outcome.mjs';
import { assertSchema } from './schema-validator.mjs';
import { getSchema, SCHEMA_IDS } from '../schemas/registry.mjs';
import { isoTimestamp } from './identity.mjs';

/**
 * Fold the journal into the facts the checkpoint needs.
 *
 * Everything here is bounded: ids, counts and the latest pointer of each kind.
 * No history lists, no Frontier, no full goal and no narrative (design §7.2).
 */
export function projectState(events) {
  const state = {
    taskId: null,
    goalSummary: null,
    phase: 'NEW',
    scopeVersion: 1,
    originalScopeVersion: 1,
    scopeApproved: false,
    aligned: false,
    activeStep: null,
    pendingInterruption: null,
    residual: [],
    constraints: [],
    latestManifest: null,
    artifactIndex: new Map(),
    danglingEffects: new Map(),
    openDispatches: new Map(),
    terminated: null,
    deliveredStateCoherent: true,
    attainableWorkComplete: true,
    lastEvent: null,
    consecutiveRejections: new Map(),
  };

  for (const event of events) {
    state.lastEvent = event;
    state.taskId = state.taskId ?? event.task_id;

    switch (event.type) {
      case 'GOAL_CREATED':
        state.goalSummary = event.payload.goal_summary;
        state.scopeVersion = event.scope_version;
        state.originalScopeVersion = event.scope_version;
        state.constraints = event.payload.constraints ?? [];
        state.phase = 'ALIGNING';
        break;

      case 'GOAL_ALIGNED':
        state.aligned = true;
        state.scopeApproved = true;
        state.phase = 'PLANNING';
        if (event.payload.residual) state.residual = event.payload.residual;
        break;

      case 'SCOPE_CHANGED':
        state.scopeVersion = event.scope_version;
        state.scopeApproved = true;
        break;

      case 'MANDATE_ASSESSED':
        if (event.payload.residual) state.residual = event.payload.residual;
        break;

      case 'STEP_PLANNED':
        state.activeStep = {
          step_id: event.payload.step_id,
          kind: event.payload.kind,
          status: 'ready',
        };
        state.phase = 'EXECUTING';
        state.attainableWorkComplete = event.payload.completes_attainable_work === true;
        break;

      case 'WORKER_DISPATCHED':
        state.openDispatches.set(event.payload.dispatch_id, {
          role: event.payload.role,
          scopeVersion: event.scope_version,
          stepId: event.payload.step_id ?? null,
        });
        if (state.activeStep) state.activeStep.status = 'dispatched';
        break;

      case 'DISPATCH_REJECTED':
        bumpRejection(state, event.payload.dispatch_id, event.payload.code);
        break;

      case 'WORKER_RESULT_ACCEPTED':
        state.openDispatches.delete(event.payload.dispatch_id);
        state.consecutiveRejections.delete(event.payload.dispatch_id);
        if (state.activeStep) state.activeStep.status = 'awaiting_verification';
        state.phase = 'VERIFYING';
        break;

      case 'WORKER_RESULT_REJECTED':
        bumpRejection(state, event.payload.dispatch_id, event.payload.code ?? 'RESULT_REJECTED');
        break;

      case 'ARTIFACT_REGISTERED':
        state.artifactIndex.set(event.payload.artifact_id, {
          artifact_id: event.payload.artifact_id,
          kind: event.payload.kind ?? 'raw_output',
          sha256: event.payload.sha256,
          truncated: event.payload.truncated === true,
          path: event.payload.path ?? null,
        });
        if (event.payload.manifest_path) state.latestManifest = event.payload.manifest_path;
        break;

      case 'EFFECT_INTENDED':
        state.danglingEffects.set(event.event_id, {
          action_kind: event.payload.action_kind,
          target_set: event.payload.target_set,
          idempotency_key: event.idempotency_key,
        });
        break;

      case 'EFFECT_OBSERVED':
        state.danglingEffects.delete(event.payload.intent_event_id);
        break;

      case 'INPUT_REQUESTED':
        state.pendingInterruption = {
          code: event.payload.code,
          resume_token: event.payload.resume_token,
          required_from: event.payload.required_from ?? 'user',
        };
        state.phase = 'NEEDS_INPUT';
        break;

      case 'INPUT_RECEIVED':
        if (state.pendingInterruption?.resume_token === event.payload.resume_token) {
          state.pendingInterruption = null;
          state.phase = event.payload.resume_phase ?? 'PLANNING';
        }
        break;

      case 'CHECKPOINT_REDUCED':
        if (event.payload.manifest_path) state.latestManifest = event.payload.manifest_path;
        break;

      case 'GOAL_TERMINATED':
        state.terminated = { status: event.payload.status, reason: event.payload.reason ?? null };
        state.phase = 'TERMINAL';
        break;

      default:
        break;
    }

    if (event.payload?.delivered_state_coherent === false) {
      state.deliveredStateCoherent = false;
    }
  }

  return state;
}

function bumpRejection(state, dispatchId, code) {
  const key = `${dispatchId}:${code}`;
  state.consecutiveRejections.set(key, (state.consecutiveRejections.get(key) ?? 0) + 1);
}

/**
 * The single next action for a non-terminal state (invariant I8).
 *
 * The order encodes the lifecycle: unblock the world, then align, then plan, then
 * dispatch, then verify, then decide. Exactly one branch may match.
 */
export function deriveNextAction(state) {
  if (state.terminated) return null;

  // A dangling effect intent must be resolved by observation before anything
  // else; blind replay of an external side effect is forbidden (invariant I6).
  if (state.danglingEffects.size > 0) {
    const [intentEventId] = state.danglingEffects.keys();
    return { kind: 'DISPATCH', target: 'verify', ref: intentEventId };
  }

  if (state.pendingInterruption) {
    return {
      kind: 'ASK_USER',
      target: state.pendingInterruption.required_from,
      ref: state.pendingInterruption.resume_token,
    };
  }

  if (!state.goalSummary) return { kind: 'ALIGN', target: 'intake', ref: null };
  if (!state.aligned) return { kind: 'ALIGN', target: 'goal', ref: null };

  if (state.openDispatches.size > 0) {
    const [dispatchId] = state.openDispatches.keys();
    return { kind: 'REDUCE', target: 'await_result', ref: dispatchId };
  }

  if (!state.activeStep) return { kind: 'PLAN', target: 'next_step', ref: null };

  if (state.activeStep.status === 'ready') {
    return { kind: 'DISPATCH', target: state.activeStep.kind.toLowerCase(), ref: state.activeStep.step_id };
  }

  if (state.activeStep.status === 'awaiting_verification') {
    return { kind: 'DERIVE_OUTCOME', target: 'ledger', ref: state.activeStep.step_id };
  }

  return { kind: 'PLAN', target: 'next_step', ref: state.activeStep.step_id };
}

/**
 * Reduce a journal to a validated checkpoint.
 *
 * @param {object[]} events full journal in append order
 * @param {object} [options]
 * @param {string} [options.now] timestamp override for deterministic tests
 * @returns {{checkpoint: object, state: object, ledger: object, outcome: object|null, bytes: number, hash: string}}
 */
export function reduceCheckpoint(events, options = {}) {
  if (events.length === 0) {
    throw new ReducerError('Cannot reduce an empty journal', {});
  }

  const state = projectState(events);
  const ledger = buildLedger(events);
  const last = state.lastEvent;

  if (!state.taskId) {
    throw new ReducerError('Journal contains no task_id', { eventCount: events.length });
  }
  if (!state.goalSummary) {
    throw new ReducerError('Journal has no GOAL_CREATED event carrying goal_summary', {
      eventCount: events.length,
    });
  }

  const terminal = state.phase === 'TERMINAL';
  const nextAction = deriveNextAction(state);

  if (!terminal && !nextAction) {
    throw new ReducerError('Non-terminal checkpoint has no next_action', { phase: state.phase });
  }
  if (terminal && nextAction) {
    throw new ReducerError('Terminal checkpoint must not carry a next_action', {
      phase: state.phase,
      nextAction,
    });
  }

  let outcomeResult = null;
  if (terminal) {
    outcomeResult = deriveOutcome({
      ledger,
      scopeVersion: state.scopeVersion,
      scopeApproved: state.scopeApproved,
      originalScopeVersion: state.originalScopeVersion,
      constraints: state.constraints,
      deliveredStateCoherent: state.deliveredStateCoherent,
      residual: state.residual,
      pendingInterruption: state.pendingInterruption,
      attainableWorkComplete: state.attainableWorkComplete,
      artifactIndex: state.artifactIndex,
    });

    // The sealed status in the journal must equal what the reducer derives; a
    // divergence means someone wrote an outcome the ledger does not support (I1).
    if (state.terminated && state.terminated.status !== outcomeResult.status) {
      throw new ReducerError(
        `GOAL_TERMINATED recorded ${state.terminated.status} but the ledger derives ${outcomeResult.status}`,
        { recorded: state.terminated, derived: outcomeResult.status },
      );
    }
    if (!isSealable(outcomeResult.status)) {
      throw new ReducerError(`${outcomeResult.status} is not a sealable terminal outcome`, {
        status: outcomeResult.status,
      });
    }
  }

  const checkpoint = {
    schema_version: 1,
    task_id: state.taskId,
    source_cursor: { segment: last.segment, seq: last.seq, event_hash: last.event_hash },
    phase: state.phase,
    outcome: terminal
      ? { status: outcomeResult.status, reason: outcomeResult.reason }
      : null,
    scope_version: state.scopeVersion,
    goal_summary: truncateToBytes(state.goalSummary, BUDGETS.GOAL_SUMMARY),
    ledger_counts: countStates(ledger),
    active_step: state.activeStep,
    next_action: nextAction,
    pending_interruption: state.pendingInterruption,
    residual_count: state.residual.length,
    latest_manifest: state.latestManifest,
    updated_at: options.now ?? isoTimestamp(),
  };

  assertSchema(checkpoint, getSchema(SCHEMA_IDS.CHECKPOINT));

  const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`;
  const bytes = utf8Bytes(serialized);
  if (bytes > BUDGETS.CHECKPOINT) {
    // Semantic fields are never trimmed to fit; an oversized checkpoint is a
    // reducer defect (scenario C01).
    throw new ReducerError(
      `Checkpoint is ${bytes} bytes, exceeding the ${BUDGETS.CHECKPOINT} byte hard limit`,
      { bytes, limit: BUDGETS.CHECKPOINT, task_id: state.taskId },
    );
  }

  return {
    checkpoint,
    state,
    ledger,
    outcome: outcomeResult,
    bytes,
    hash: canonicalHash(checkpoint),
    inScopeCriterionCount: inScopeEntries(ledger).length,
  };
}

/** Trim a summary on a UTF-8 boundary, never mid-codepoint. */
function truncateToBytes(text, maxBytes) {
  if (utf8Bytes(text) <= maxBytes) return text;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const bytes = encoder.encode(text).slice(0, maxBytes);
  // A trailing partial sequence decodes to U+FFFD, which we then drop.
  return decoder.decode(bytes).replace(/�+$/, '');
}
