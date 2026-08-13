/**
 * Bounded recovery read surface (design §9.1, §9.5 step 8, §12).
 *
 * Recovery is where the main Agent is most tempted to read everything: the
 * checkpoint, every event since it, and "just to be safe" the payloads too. The
 * declared budget for that entire surface is `BUDGETS.RECOVERY_TOTAL` (4 KiB).
 * This module is the only place that assembles that surface, so the budget has
 * exactly one enforcement point instead of being a rule everyone remembers.
 *
 * The division of labour comes straight from §9.1: the reducer reads the whole
 * journal offline — it needs every event to fold correctly — and only the
 * envelope that leaves this module is budgeted. Event bodies never appear in it.
 */

import { BUDGETS, utf8Bytes } from './budgets.mjs';
import { KernelError, PROTOCOL_CODES } from './errors.mjs';
import { readAllEvents, readCheckpoint, readEventsAfter, verifyCursor } from './journal.mjs';
import { reduceCheckpoint } from './reducer.mjs';

/**
 * Rows are capped by count as well as by bytes so a tail of 2,000 tiny events
 * cannot produce a 2,000-element array that only later gets thrown away.
 */
const MAX_TAIL_ROWS = 20;

/** Type histogram keys, most frequent first; the rest fold into `other`. */
const MAX_TYPE_KEYS = 6;

/** Serialized size of the envelope as the main Agent would see it. */
function measure(envelope) {
  // Measured pretty-printed, which is the upper bound of how it gets rendered.
  return utf8Bytes(`${JSON.stringify(envelope, null, 2)}\n`);
}

/**
 * Bounded histogram of event types in the tail.
 * Counts are facts about the journal; they are not event bodies.
 */
function summarizeTypes(events) {
  const counts = new Map();
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const kept = ranked.slice(0, MAX_TYPE_KEYS);
  const rest = ranked.slice(MAX_TYPE_KEYS);

  const summary = Object.fromEntries(kept);
  if (rest.length > 0) {
    summary.other = rest.reduce((total, [, count]) => total + count, 0);
  }
  return summary;
}

/**
 * One row per tail event: identity only, never payload.
 *
 * This is the mechanical form of "主 Agent 不读取事件正文" (§9.1). A row cannot
 * carry a body because the projection has no field for one.
 */
function tailRows(events) {
  return events.slice(-MAX_TAIL_ROWS).map((event) => ({
    seq: event.seq,
    type: event.type,
    actor: event.actor,
  }));
}

/**
 * Raw bytes of the cursor tail as it sits in the journal.
 * Compared against `RECOVERY_EVENT_TAIL` to decide whether rows are affordable
 * at all, before their projected size is even considered.
 */
function rawTailBytes(events) {
  let bytes = 0;
  for (const event of events) bytes += utf8Bytes(`${JSON.stringify(event)}\n`);
  return bytes;
}

/**
 * Assemble the tail projection at a given fidelity.
 * @param {'rows'|'histogram'|'counts'} fidelity how much detail to include
 */
function projectTail(events, fidelity, { rawBytes, compressed }) {
  const included = fidelity === 'rows' ? Math.min(events.length, MAX_TAIL_ROWS) : 0;

  const tail = {
    event_count: events.length,
    included_count: included,
    omitted_count: events.length - included,
    complete: included === events.length,
    raw_bytes: rawBytes,
    reducer_compressed: compressed,
    fidelity,
  };

  if (fidelity === 'rows') tail.rows = tailRows(events);
  if (fidelity !== 'counts') tail.types = summarizeTypes(events);
  return tail;
}

/**
 * Build the recovery envelope for a task root.
 *
 * Over-budget behaviour is **degrade and disclose, never throw**. The reasoning,
 * because it differs from every other budget in this kernel:
 *
 * - A long cursor tail is a *legitimate* state — it only means a lot happened
 *   since the last checkpoint. The oversized checkpoint of C01 and the oversized
 *   launch payload of C03 are different: those are a defect and a caller choice
 *   respectively, and both are fixable by whoever triggered them. Nobody can
 *   "fix" a journal that legitimately grew, and §9.1 forbids deleting segments
 *   because they are audit facts.
 * - Throwing here would be unrecoverable rather than retryable: every later
 *   recovery attempt reads the same journal and throws again, stranding the task
 *   with no next step. That is the one outcome the control loop must never
 *   produce.
 * - §9.1 prescribes the alternative directly: "超过则先由 reducer 离线压缩投影".
 *   Compression, not rejection.
 *
 * What makes degradation safe rather than a silent lie is disclosure: `complete`,
 * `omitted_count` and `fidelity` state exactly how much was withheld, and
 * `omitted_detail` names where the rest lives. Silent truncation is the failure
 * mode this guards against; *declared* truncation is the fix.
 *
 * The one genuine throw is the floor check: if even counts-only cannot fit, the
 * checkpoint itself is over budget, which is a defect and not a journal state.
 * That path is unreachable through the normal writers — `writeCheckpoint()` and
 * `reduceCheckpoint()` both gate at 2 KiB — and a hand-edited oversized
 * checkpoint file is rejected as unusable below, then rebuilt from the journal.
 *
 * @param {string} taskRoot task directory
 * @param {object} [options]
 * @param {string} [options.now] timestamp override for deterministic tests
 * @param {number} [options.limitBytes] budget override; production callers omit it
 *   and get `BUDGETS.RECOVERY_TOTAL`. It exists so the gate's boundary and its
 *   floor throw are reachable from tests without a contrived 4 KiB checkpoint.
 * @returns {{envelope: object, bytes: number}}
 */
export function buildRecoveryEnvelope(taskRoot, options = {}) {
  const limitBytes = options.limitBytes ?? BUDGETS.RECOVERY_TOTAL;
  const { events: allEvents } = readAllEvents(taskRoot);
  const stored = readCheckpoint(taskRoot);

  // An oversized stored checkpoint is treated exactly like a corrupt one: it is
  // not trustworthy input, and the journal can always rebuild it (§9.2). This is
  // what keeps the floor check below unreachable for real journals.
  const storedUsable =
    stored !== null && measure(stored) <= BUDGETS.CHECKPOINT && stored.source_cursor
      ? verifyCursor(taskRoot, stored.source_cursor).valid
      : false;

  let checkpoint = stored;
  let checkpointSource = 'stored';
  let cursorReason = null;

  if (!storedUsable) {
    if (allEvents.length === 0) {
      throw new KernelError(
        PROTOCOL_CODES.INVARIANT_VIOLATED,
        'Cannot build a recovery envelope: no usable checkpoint and an empty journal',
        { taskRoot },
      );
    }
    checkpoint = reduceCheckpoint(allEvents, options).checkpoint;
    checkpointSource = 'rebuilt';
    cursorReason =
      stored === null ? 'checkpoint absent or unreadable' : 'stored checkpoint unusable; rebuilt from journal';
  }

  // The tail is what the checkpoint does not yet account for. A rebuilt
  // checkpoint folded every event by construction, so its tail is empty.
  const tailRead = checkpointSource === 'rebuilt'
    ? { events: [], reason: null }
    : readEventsAfter(taskRoot, checkpoint.source_cursor);
  const tailEvents = tailRead.events ?? [];

  const rawBytes = rawTailBytes(tailEvents);
  // §9.1: past the 16 KiB hard cap the reducer compresses offline and the main
  // Agent does not see event rows at all, however small their projection is.
  const compressed = rawBytes > BUDGETS.RECOVERY_EVENT_TAIL;

  const base = {
    schema_version: 1,
    task_id: checkpoint.task_id,
    checkpoint,
    checkpoint_source: checkpointSource,
    cursor_note: cursorReason ?? tailRead.reason,
    next_action: checkpoint.next_action,
    phase: checkpoint.phase,
  };

  const ladder = compressed ? ['histogram', 'counts'] : ['rows', 'histogram', 'counts'];
  let envelope = null;
  let bytes = 0;

  for (const fidelity of ladder) {
    const candidate = { ...base, tail: projectTail(tailEvents, fidelity, { rawBytes, compressed }) };
    if (!candidate.tail.complete) {
      // A task-relative pointer, not an absolute path: the envelope is budgeted,
      // and where the journal lives is already known to whoever holds the root.
      candidate.tail.omitted_detail = `${candidate.tail.omitted_count} event(s) not shown; full facts remain in journal/`;
    }
    envelope = candidate;
    bytes = measure(candidate);
    if (bytes <= limitBytes) return { envelope, bytes };
  }

  throw new KernelError(
    PROTOCOL_CODES.INVARIANT_VIOLATED,
    `Recovery envelope is ${bytes} bytes at its minimum fidelity, over the ${limitBytes} byte budget: the checkpoint itself is oversized`,
    { bytes, limit: limitBytes, checkpointBytes: measure(checkpoint) },
  );
}

/** Byte size of an assembled envelope — for callers auditing their own ingestion. */
export function recoveryEnvelopeBytes(envelope) {
  return measure(envelope);
}
