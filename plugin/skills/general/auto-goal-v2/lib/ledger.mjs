/**
 * Criterion ledger: a deterministic projection of criterion events (design §11.1).
 *
 * The ledger is the only input to the terminal-state decision, so it must be
 * derivable from the journal alone. It records what evidence was actually
 * obtained — never what a model asserted.
 *
 * Two rules deserve attention because they are where false DONE is born:
 *   - E1 (action trace) never satisfies a criterion needing E2+ (invariant I14).
 *   - JUDGMENT/KNOWLEDGE cannot be SATISFIED without external acceptor evidence
 *     (invariant I9); the Agent may not appoint itself acceptor.
 */

import {
  CRITERION_STATES,
  EXTERNAL_ACCEPTOR_TYPES,
  RUNG_CEILING,
  deriveRequiredRung,
  rungIndex,
  rungSatisfies,
} from './vocabulary.mjs';
import { ReducerError } from './errors.mjs';

/** Empty ledger. */
export function emptyLedger() {
  return { entries: new Map(), scopeVersion: 1 };
}

/**
 * Build the ledger by folding criterion-related events in order.
 *
 * Events under a superseded scope_version are ignored for scoring, which is how
 * stale worker results are kept as artifacts without moving the ledger (I12).
 *
 * @param {object[]} events full journal, append order
 * @returns {{entries: Map<string, object>, scopeVersion: number}}
 */
export function buildLedger(events) {
  const entries = new Map();
  let scopeVersion = 1;

  for (const event of events) {
    if (event.type === 'SCOPE_CHANGED') {
      scopeVersion = event.scope_version;
      // A scope change does not retroactively invalidate entries; the reducer
      // compares each entry's scope_version against the current one instead.
      continue;
    }

    switch (event.type) {
      case 'CRITERION_DEFINED':
        entries.set(event.payload.criterion_id, defineEntry(event, scopeVersion));
        break;

      case 'EVIDENCE_RECORDED':
        applyEvidence(entries, event, scopeVersion);
        break;

      case 'CRITERION_UPDATED':
        applyUpdate(entries, event, scopeVersion);
        break;

      default:
        break;
    }
  }

  return { entries, scopeVersion };
}

function defineEntry(event, scopeVersion) {
  const { payload } = event;
  const type = payload.type;
  const ceiling = RUNG_CEILING[type];
  if (!ceiling) {
    throw new ReducerError(`CRITERION_DEFINED carries unknown criterion type "${type}"`, {
      criterion_id: payload.criterion_id,
      event_id: event.event_id,
    });
  }

  const maxRung = payload.max_rung ?? ceiling;
  const required = payload.required_rung;

  return {
    criterion_id: payload.criterion_id,
    scope_version: event.scope_version ?? scopeVersion,
    type,
    statement: payload.statement ?? '',
    required_rung: required,
    max_rung: maxRung,
    achieved_rung: 'E0',
    // A criterion whose requirement outruns its ceiling is UNTESTABLE from the
    // moment it is defined; that must be visible during planning, not at the end.
    state: rungIndex(required) > rungIndex(maxRung) ? 'UNTESTABLE' : 'UNTESTED',
    evidence_refs: [],
    check_surface: payload.check_surface ?? [],
    checked_at: null,
    acceptor_ref: payload.acceptor_ref ?? null,
    risk: payload.risk ?? null,
    in_scope: payload.in_scope !== false,
  };
}

function requireEntry(entries, criterionId, event) {
  const entry = entries.get(criterionId);
  if (!entry) {
    throw new ReducerError(`${event.type} references unknown criterion "${criterionId}"`, {
      criterion_id: criterionId,
      event_id: event.event_id,
    });
  }
  return entry;
}

/**
 * Record evidence. The achieved rung only ever moves up — a later weaker
 * observation cannot erase a stronger one already obtained.
 */
function applyEvidence(entries, event, currentScopeVersion) {
  const entry = requireEntry(entries, event.payload.criterion_id, event);

  // Evidence produced under a stale scope must not move the ledger (I12).
  if (event.scope_version !== undefined && event.scope_version < currentScopeVersion) {
    return;
  }

  const rung = event.payload.rung;
  if (rungIndex(rung) < 0) {
    throw new ReducerError(`EVIDENCE_RECORDED carries unknown rung "${rung}"`, {
      criterion_id: entry.criterion_id,
      event_id: event.event_id,
    });
  }

  if (rungIndex(rung) > rungIndex(entry.achieved_rung)) {
    entry.achieved_rung = rung;
  }
  for (const artifactId of event.artifact_refs) {
    if (!entry.evidence_refs.includes(artifactId)) entry.evidence_refs.push(artifactId);
  }
  entry.checked_at = event.occurred_at;
  if (event.payload.acceptor_ref) entry.acceptor_ref = event.payload.acceptor_ref;
  if (event.payload.check_surface) entry.check_surface = event.payload.check_surface;
}

function applyUpdate(entries, event, currentScopeVersion) {
  const entry = requireEntry(entries, event.payload.criterion_id, event);

  if (event.scope_version !== undefined && event.scope_version < currentScopeVersion) {
    return;
  }

  const state = event.payload.state;
  if (!CRITERION_STATES.includes(state)) {
    throw new ReducerError(`CRITERION_UPDATED carries unknown state "${state}"`, {
      criterion_id: entry.criterion_id,
      event_id: event.event_id,
    });
  }

  entry.state = state;
  entry.checked_at = event.occurred_at;
  if (event.payload.achieved_rung && rungIndex(event.payload.achieved_rung) > rungIndex(entry.achieved_rung)) {
    entry.achieved_rung = event.payload.achieved_rung;
  }
  if (event.payload.in_scope !== undefined) entry.in_scope = event.payload.in_scope;
  if (event.payload.acceptor_ref !== undefined) entry.acceptor_ref = event.payload.acceptor_ref;
}

/**
 * Whether a criterion's recorded evidence actually earns SATISFIED.
 *
 * Called by the outcome reducer on every entry, so a `CRITERION_UPDATED` event
 * claiming SATISFIED without adequate evidence cannot slip through.
 *
 * @param {object} entry ledger entry
 * @param {object} [options]
 * @param {Map<string, object>} [options.artifactIndex] artifact_id -> manifest
 * @param {string[]} [options.agentIdentities] names that mean "the Agent itself"
 * @returns {{satisfiable: boolean, reasons: string[]}}
 */
export function assessSatisfaction(entry, options = {}) {
  const { artifactIndex = new Map(), agentIdentities = ['agent', 'controller', 'self'] } = options;
  const reasons = [];

  if (!rungSatisfies(entry.achieved_rung, entry.required_rung)) {
    reasons.push(
      `achieved ${entry.achieved_rung} < required ${entry.required_rung}`,
    );
  }

  if (entry.evidence_refs.length === 0) {
    reasons.push('no evidence references');
  }

  // Evidence must still exist and be whole. A truncated artifact cannot prove a
  // criterion; a missing one silently invalidates a past conclusion.
  //
  // An absent artifact index is not an excuse to skip the check. A journal with no
  // ARTIFACT_REGISTERED event produces an empty index, so treating "empty" as
  // "unknown, assume fine" made total evidence loss the easiest path to DONE
  // (invariant I5). Lookup failure is unsatisfiable regardless of index size.
  for (const artifactId of entry.evidence_refs) {
    const manifest = artifactIndex.get(artifactId);
    if (!manifest) {
      reasons.push(`evidence ${artifactId} is not registered`);
      continue;
    }
    if (manifest.truncated === true) {
      reasons.push(`evidence ${artifactId} is truncated and cannot prove completeness`);
    }
  }

  if (EXTERNAL_ACCEPTOR_TYPES.includes(entry.type)) {
    if (!entry.acceptor_ref) {
      reasons.push(`${entry.type} criterion has no external acceptor`);
    } else if (agentIdentities.includes(String(entry.acceptor_ref).toLowerCase())) {
      reasons.push(`${entry.type} criterion names the Agent as acceptor`);
    }
  }

  if (entry.type === 'NEGATIVE' && (entry.check_surface ?? []).length === 0) {
    reasons.push('NEGATIVE criterion has no bounded check surface');
  }

  return { satisfiable: reasons.length === 0, reasons };
}

/**
 * Whether the highest attainable evidence has been reached.
 *
 * This separates UNVERIFIABLE (ceiling reached, still short of the requirement)
 * from UNTESTED (verification simply not done yet) — the guard against using
 * UNVERIFIABLE as an excuse (design §11.2, scenario O06).
 */
export function hasExhaustedEvidence(entry) {
  return rungIndex(entry.achieved_rung) >= rungIndex(entry.max_rung);
}

/** Counts for the checkpoint's bounded ledger summary. */
export function countStates(ledger) {
  const counts = { satisfied: 0, violated: 0, untested: 0, untestable: 0, moot: 0 };
  for (const entry of ledger.entries.values()) {
    switch (entry.state) {
      case 'SATISFIED': counts.satisfied += 1; break;
      case 'VIOLATED': counts.violated += 1; break;
      case 'UNTESTED': counts.untested += 1; break;
      case 'UNTESTABLE': counts.untestable += 1; break;
      case 'MOOT': counts.moot += 1; break;
      default: break;
    }
  }
  return counts;
}

/** In-scope entries at the current scope version, MOOT excluded. */
export function inScopeEntries(ledger) {
  return [...ledger.entries.values()].filter(
    (entry) => entry.in_scope !== false && entry.state !== 'MOOT',
  );
}

/**
 * Recompute a criterion's required rung from its type and risk.
 * Used at planning time to expose an unreachable requirement early.
 */
export function planRequiredRung(type, risk) {
  return deriveRequiredRung(type, risk ?? {});
}
