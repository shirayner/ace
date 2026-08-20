/**
 * Append-only journal: single-writer append, hash chain, segment rollover
 * (design §7.1, §9.1, §9.2, §9.4).
 *
 * Crash consistency relies on ordering, not transactions:
 *   1. take the task write lock
 *   2. verify the expected last seq/hash
 *   3. write one complete JSONL line
 *   4. fsync
 *   5. release
 *
 * An event appended without its checkpoint update is the expected crash state;
 * recovery replays the reducer from the cursor. A half-written checkpoint temp
 * file is ignored. The chain hash detects truncation and tampering; it is not a
 * security signature.
 */

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';

import { BUDGETS, COUNT_LIMITS, SOFT_LIMITS, assertWithinBudget, utf8Bytes } from './budgets.mjs';
import {
  GENESIS_HASH,
  canonicalHash,
  canonicalize,
  sealEvent,
  verifyChain,
  verifyEventHash,
} from './canonical.mjs';
import {
  JournalConflictError,
  JournalLockedError,
  KERNEL_CODES,
  KernelError,
  PROTOCOL_CODES,
} from './errors.mjs';
import { newEventId, isoTimestamp } from './identity.mjs';
import { reduceCheckpoint } from './reducer.mjs';
import { assertSchema } from './schema-validator.mjs';
import { getSchema, SCHEMA_IDS } from '../schemas/registry.mjs';
import { assertNoViolations, validateEventSemantics } from './semantic-validator.mjs';

const JOURNAL_DIR = 'journal';
const LOCK_FILE = 'journal/.write-lock';
const CHECKPOINT_FILE = 'checkpoint.json';
const SEAL_SUFFIX = '.seal.json';

const LOCK_TIMEOUT_MS = 5000;
const LOCK_RETRY_MS = 25;
const LOCK_STALE_MS = 60_000;

/** Layout of a task's control-plane files. */
export function journalPaths(taskRoot) {
  return {
    journalDir: path.join(taskRoot, JOURNAL_DIR),
    lockPath: path.join(taskRoot, LOCK_FILE),
    checkpointPath: path.join(taskRoot, CHECKPOINT_FILE),
  };
}

function segmentFileName(segment) {
  return `segment-${String(segment).padStart(4, '0')}.jsonl`;
}

function sealFileName(segment) {
  return `segment-${String(segment).padStart(4, '0')}${SEAL_SUFFIX}`;
}

function segmentPath(taskRoot, segment) {
  return path.join(taskRoot, JOURNAL_DIR, segmentFileName(segment));
}

function sealPath(taskRoot, segment) {
  return path.join(taskRoot, JOURNAL_DIR, sealFileName(segment));
}

/** Create the journal directory tree. Idempotent. */
export function initTaskRoot(taskRoot) {
  mkdirSync(path.join(taskRoot, JOURNAL_DIR), { recursive: true });
  return journalPaths(taskRoot);
}

/** Segment numbers present on disk, ascending. */
export function listSegments(taskRoot) {
  const { journalDir } = journalPaths(taskRoot);
  if (!existsSync(journalDir)) return [];
  return readdirSync(journalDir)
    .filter((name) => /^segment-\d{4}\.jsonl$/.test(name))
    .map((name) => Number.parseInt(name.slice('segment-'.length, -'.jsonl'.length), 10))
    .sort((a, b) => a - b);
}

/** Highest segment number, or 0 when the journal is empty. */
export function activeSegment(taskRoot) {
  const segments = listSegments(taskRoot);
  return segments.length === 0 ? 0 : segments[segments.length - 1];
}

/**
 * Parse one segment's events.
 *
 * Two crash shapes are tolerated, both of which are "a `writeSync` that did not
 * finish", not corruption:
 *
 *   1. a trailing partial line — the crash was the last thing that happened;
 *   2. a partial line that is no longer last — the control loop kept appending
 *      after the crash, so the residue is now in the middle of the file.
 *
 * Case 2 is only recognised when the intact events around the bad line still link
 * hash-to-hash, i.e. the chain proves nothing real was lost there. Under that
 * condition the residue is dropped and reported. A bad line that does not sit in
 * an unbroken chain is still an explicit error, because then we genuinely cannot
 * tell a lost event from a garbled one, and guessing would be worse than saying so.
 *
 * "Bad" means unparseable *or* parseable but not shaped like an event: a torn write
 * can stop at a syntactically complete point (`{"actor":"controller"}`), and
 * admitting that as an event would put a record with no seq and no hash into the
 * chain — worse than dropping it, because the chain then reports itself broken.
 *
 * @returns {{events: object[], droppedPartialLine: boolean, droppedResidueLines: number[]}}
 */
export function readSegment(taskRoot, segment) {
  const filePath = segmentPath(taskRoot, segment);
  if (!existsSync(filePath)) return { events: [], droppedPartialLine: false, droppedResidueLines: [] };

  const content = readFileSync(filePath, 'utf8');
  if (content.length === 0) return { events: [], droppedPartialLine: false, droppedResidueLines: [] };

  const lines = content.split('\n');
  // A complete append always ends with '\n', so the final element is then ''.
  const trailing = lines.pop();
  const droppedPartialLine = trailing !== '';

  const events = [];
  const droppedResidueLines = [];
  for (const [index, line] of lines.entries()) {
    if (line.length === 0) continue;

    const parsed = parseEventLine(line);
    if (parsed.event) {
      events.push(parsed.event);
      continue;
    }
    if (isCrashResidue(taskRoot, segment, lines, index, events)) {
      droppedResidueLines.push(index + 1);
      continue;
    }
    throw new KernelError(
      KERNEL_CODES.JOURNAL_CONFLICT,
      `Segment ${segment} line ${index + 1} is not valid JSON`,
      { segment, line: index + 1, reason: parsed.reason },
    );
  }

  return { events, droppedPartialLine, droppedResidueLines };
}

/**
 * One line as an event record, or the reason it is not one.
 *
 * The shape check is deliberately minimal — the three chain fields and nothing
 * else. Verifying hashes here would swallow tampering that `verifyChain` exists to
 * report; the question at this level is only "is this a record or is it debris".
 */
function parseEventLine(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch (cause) {
    return { event: null, reason: cause.message };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { event: null, reason: 'line is not a JSON object' };
  }
  for (const field of ['seq', 'event_hash', 'prev_event_hash']) {
    if (value[field] === undefined) {
      return { event: null, reason: `line has no ${field} and is not an event record` };
    }
  }
  return { event: value, reason: null };
}

/**
 * Whether a bad line is crash residue the chain has already healed over.
 *
 * The evidence is the next event record: it must chain from whatever came before
 * the bad line. If it does, nothing went missing at this position — a torn write
 * did, and the chain says so.
 *
 * At the start of a segment the predecessor is not in this file, so it is taken
 * from the previous segment's seal (or genesis for segment 1). Skipping the link
 * check there instead would make a lost first event indistinguishable from residue.
 *
 * Deliberately no self-hash check on the surviving event: whether its own hash
 * holds is `verifyChain`'s question, and answering it here would turn a tampered
 * event into a throw from `readSegment` — losing the diagnosis that `verifyJournal`
 * would otherwise report, in exchange for a guard the chain link already provides.
 */
function isCrashResidue(taskRoot, segment, lines, index, eventsSoFar) {
  const next = nextParsedEvent(lines, index + 1);
  if (!next) return false;
  const previous = eventsSoFar.at(-1);
  const expectedPrevHash = previous
    ? previous.event_hash
    : previousSegmentHash(taskRoot, segment);
  return next.prev_event_hash === expectedPrevHash;
}

/** The hash the first event of `segment` must chain from. */
function previousSegmentHash(taskRoot, segment) {
  if (segment <= 1) return GENESIS_HASH;
  return readSeal(taskRoot, segment - 1)?.last_event_hash ?? null;
}

/**
 * The next event record after `from`, or null when the immediately following line
 * is not one. Two adjacent bad lines are not a single torn write, so they are not
 * treated as residue — one crash produces one incomplete line.
 */
function nextParsedEvent(lines, from) {
  for (let index = from; index < lines.length; index += 1) {
    if (lines[index].length === 0) continue;
    return parseEventLine(lines[index]).event;
  }
  return null;
}

/** Every event across all segments, in append order. */
export function readAllEvents(taskRoot) {
  const events = [];
  let droppedPartialLine = false;
  const droppedResidueLines = [];
  for (const segment of listSegments(taskRoot)) {
    const result = readSegment(taskRoot, segment);
    events.push(...result.events);
    droppedPartialLine = droppedPartialLine || result.droppedPartialLine;
    for (const line of result.droppedResidueLines) droppedResidueLines.push({ segment, line });
  }
  return { events, droppedPartialLine, droppedResidueLines };
}

/**
 * Chain tail: the seq/hash a new append must build on.
 * Crosses segment boundaries so the chain is continuous over rollovers.
 */
export function readTail(taskRoot) {
  const segments = listSegments(taskRoot);
  if (segments.length === 0) {
    return { segment: 1, seq: 0, eventHash: GENESIS_HASH, eventCount: 0, bytes: 0 };
  }

  const segment = segments[segments.length - 1];
  const { events } = readSegment(taskRoot, segment);
  const filePath = segmentPath(taskRoot, segment);
  const bytes = existsSync(filePath) ? statSync(filePath).size : 0;

  if (events.length === 0) {
    // Freshly rolled, still empty: continue from the previous segment's seal.
    const previousSeal = segment > 1 ? readSeal(taskRoot, segment - 1) : null;
    return {
      segment,
      seq: previousSeal?.last_seq ?? 0,
      eventHash: previousSeal?.last_event_hash ?? GENESIS_HASH,
      eventCount: 0,
      bytes,
    };
  }

  const last = events[events.length - 1];
  return {
    segment,
    seq: last.seq,
    eventHash: last.event_hash,
    eventCount: events.length,
    bytes,
  };
}

/** A sealed segment's record, or null when unsealed. */
export function readSeal(taskRoot, segment) {
  const filePath = sealPath(taskRoot, segment);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

/**
 * Acquire the task write lock via exclusive create.
 *
 * `wx` is atomic on both POSIX and Windows, so two processes cannot both win. A
 * lock older than LOCK_STALE_MS is treated as abandoned by a crashed writer.
 */
function acquireLock(taskRoot) {
  const { lockPath } = journalPaths(taskRoot);
  mkdirSync(path.dirname(lockPath), { recursive: true });

  const startedAt = Date.now();
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx');
      writeSync(fd, JSON.stringify({ pid: process.pid, acquired_at: isoTimestamp() }));
      fsyncSync(fd);
      closeSync(fd);
      return lockPath;
    } catch (cause) {
      if (cause.code !== 'EEXIST') throw cause;

      const age = Date.now() - safeMtimeMs(lockPath);
      if (age > LOCK_STALE_MS) {
        rmSync(lockPath, { force: true });
        continue;
      }
      if (Date.now() - startedAt > LOCK_TIMEOUT_MS) {
        throw new JournalLockedError(lockPath, Date.now() - startedAt);
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
}

function releaseLock(lockPath) {
  rmSync(lockPath, { force: true });
}

function safeMtimeMs(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return Date.now();
  }
}

/** Busy-wait; the lock is held for a single small append, so this stays brief. */
function sleepSync(milliseconds) {
  const until = Date.now() + milliseconds;
  while (Date.now() < until) {
    // Intentionally empty: Atomics.wait needs a SharedArrayBuffer worker setup
    // that would outweigh a sub-millisecond wait on a same-process lock.
  }
}

/** A task begins here; only an approved SCOPE_CHANGED may move it (invariant I2). */
const INITIAL_SCOPE_VERSION = 1;

/**
 * The reference and scope facts the semantic gate checks an append against.
 *
 * Derived from the chain rather than passed in. A caller-supplied context is a
 * second, hand-maintained copy of what the journal already states: the next
 * caller that forgets a key silently disables the reference and scope gates, and
 * because a skipped check produces no violation, nothing goes red. Deriving it
 * means there is one source and no way to forget.
 *
 * `currentScopeVersion` starts at 1 for an empty journal because a task begins at
 * scope version 1 by definition — a first event claiming a higher one is claiming
 * an approval that no SCOPE_CHANGED ever recorded.
 *
 * The type-to-fact mapping mirrors `projectState`: an artifact exists once
 * ARTIFACT_REGISTERED names it, and only GOAL_CREATED/SCOPE_CHANGED set the
 * version. Two projections of one journal must not disagree about either.
 */
export function deriveSemanticContext(priorEvents) {
  const knownEventIds = new Set();
  const knownArtifactIds = new Set();
  let currentScopeVersion = INITIAL_SCOPE_VERSION;

  for (const event of priorEvents) {
    knownEventIds.add(event.event_id);
    if (event.type === 'ARTIFACT_REGISTERED' && event.payload?.artifact_id !== undefined) {
      knownArtifactIds.add(event.payload.artifact_id);
    }
    if (event.type === 'GOAL_CREATED' || event.type === 'SCOPE_CHANGED') {
      currentScopeVersion = event.scope_version;
    }
  }

  return { knownArtifactIds, knownEventIds, currentScopeVersion };
}

/**
 * Append one factual event.
 *
 * @param {string} taskRoot absolute task root
 * @param {object} draft event without seq/segment/hash/id/timestamp fields
 * @param {object} [options]
 * @param {number} [options.expectedSeq] optimistic concurrency guard
 * @param {string} [options.expectedEventHash] optimistic concurrency guard
 * @returns {{event: object, tail: object, rolloverRecommended: boolean}}
 */
export function appendEvent(taskRoot, draft, options = {}) {
  // A leftover `semanticContext:` would be dropped in silence, and the caller
  // would go on believing it had supplied the facts the gate runs on.
  if ('semanticContext' in options) {
    throw new KernelError(
      PROTOCOL_CODES.INVARIANT_VIOLATED,
      'appendEvent derives its semantic context from the journal; a caller-supplied semanticContext would be a second, forgettable declaration of the same facts',
      { taskRoot, offeredKeys: Object.keys(options.semanticContext ?? {}) },
    );
  }

  const { expectedSeq, expectedEventHash } = options;
  const lockPath = acquireLock(taskRoot);

  try {
    const tail = readTail(taskRoot);

    if (expectedSeq !== undefined && expectedSeq !== tail.seq) {
      throw new JournalConflictError(
        `Journal moved: expected last seq ${expectedSeq}, found ${tail.seq}`,
        { expectedSeq, actualSeq: tail.seq },
      );
    }
    if (expectedEventHash !== undefined && expectedEventHash !== tail.eventHash) {
      throw new JournalConflictError(
        'Journal moved: expected last event hash does not match',
        { expectedEventHash, actualEventHash: tail.eventHash },
      );
    }

    const segment = tail.segment === 0 ? 1 : tail.segment;
    const event = sealEvent(
      {
        schema_version: 1,
        event_id: draft.event_id ?? newEventId(),
        task_id: draft.task_id,
        segment,
        seq: tail.seq + 1,
        occurred_at: draft.occurred_at ?? isoTimestamp(),
        type: draft.type,
        actor: draft.actor,
        causation_id: draft.causation_id ?? null,
        correlation_id: draft.correlation_id ?? null,
        idempotency_key: draft.idempotency_key ?? null,
        scope_version: draft.scope_version,
        payload: draft.payload ?? {},
        artifact_refs: draft.artifact_refs ?? [],
      },
      tail.eventHash,
    );

    assertSchema(event, getSchema(SCHEMA_IDS.JOURNAL_EVENT));

    // The chain so far is the only admissible source of "what already exists".
    const { events: priorEvents } = readAllEvents(taskRoot);
    const violations = validateEventSemantics(event, {
      taskId: draft.task_id,
      expectedSeq: tail.seq + 1,
      expectedSegment: segment,
      ...deriveSemanticContext(priorEvents),
    });
    assertNoViolations(`journal event ${event.type}`, violations);

    // A serialized event over 4 KiB means its payload belongs in an artifact.
    const line = `${canonicalize(event)}\n`;
    assertWithinBudget(line, BUDGETS.JOURNAL_EVENT, 'JOURNAL_EVENT', { type: event.type });

    // An idempotency key already accepted returns the original event unchanged.
    if (event.idempotency_key) {
      const existing = findByIdempotencyKey(taskRoot, event.idempotency_key);
      if (existing) {
        return { event: existing, tail: readTail(taskRoot), rolloverRecommended: false, deduplicated: true };
      }
    }

    const { repairedNewline } = appendLine(segmentPath(taskRoot, segment), line);

    // The new tail is derived from what was just written, not re-read. A re-read
    // that threw would tell the caller the append failed when the bytes are
    // already on disk — the one lie an append-only log must never tell. It is also
    // exact: the tail is this event, and the segment grew by this line.
    const newTail = {
      segment,
      seq: event.seq,
      eventHash: event.event_hash,
      eventCount: tail.eventCount + 1,
      bytes: tail.bytes + utf8Bytes(line) + (repairedNewline ? 1 : 0),
    };
    return {
      event,
      tail: newTail,
      rolloverRecommended: shouldRollover(newTail),
      deduplicated: false,
    };
  } finally {
    releaseLock(lockPath);
  }
}

/**
 * One complete line, then fsync. A reader either sees the whole event or none.
 *
 * If the file does not end with '\n' the previous append was torn by a crash. The
 * missing newline is written first, so the new event becomes a line of its own
 * instead of being fused onto the residue. Without this, appending after a crash
 * turns a droppable partial line into an unparseable complete one — a single event
 * that permanently poisons every later read of the segment.
 */
function appendLine(filePath, line) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const repairNewline = endsWithoutNewline(filePath);
  const fd = openSync(filePath, 'a');
  try {
    writeSync(fd, repairNewline ? `\n${line}` : line, null, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  return { repairedNewline: repairNewline };
}

/** Whether the file exists, is non-empty, and its last byte is not '\n'. */
function endsWithoutNewline(filePath) {
  if (!existsSync(filePath)) return false;
  const { size } = statSync(filePath);
  if (size === 0) return false;

  const fd = openSync(filePath, 'r');
  try {
    const tail = Buffer.alloc(1);
    // '\n' is 0x0A and cannot occur as a UTF-8 continuation byte, so a single-byte
    // read is unambiguous regardless of what multibyte sequence precedes it.
    readSync(fd, tail, 0, 1, size - 1);
    return tail[0] !== 0x0a;
  } finally {
    closeSync(fd);
  }
}

/** Whether the active segment has reached a rollover trigger (byte or count). */
export function shouldRollover(tail) {
  return tail.bytes >= BUDGETS.JOURNAL_SEGMENT || tail.eventCount >= COUNT_LIMITS.JOURNAL_SEGMENT_EVENTS;
}

/** Whether the active segment crossed the advisory soft threshold. */
export function exceedsSegmentSoftLimit(tail) {
  return tail.bytes >= SOFT_LIMITS.JOURNAL_SEGMENT;
}

function findByIdempotencyKey(taskRoot, idempotencyKey) {
  const { events } = readAllEvents(taskRoot);
  return events.find((event) => event.idempotency_key === idempotencyKey) ?? null;
}

/**
 * Seal the active segment and open the next one.
 *
 * Order matters: the seal is written and fsynced first, then `SEGMENT_ROLLED`
 * becomes the new segment's first event referencing it. A crash between the two
 * leaves a sealed segment with no successor, which recovery can continue from.
 *
 * @returns {{seal: object, newSegment: number, rolledEvent: object}}
 */
export function rollSegment(taskRoot, { taskId, scopeVersion, checkpointHash = null }) {
  const lockPath = acquireLock(taskRoot);
  let seal;
  let newSegment;

  try {
    const tail = readTail(taskRoot);
    if (tail.seq === 0) {
      throw new JournalConflictError('Cannot roll an empty journal', { taskRoot });
    }

    seal = {
      schema_version: 1,
      task_id: taskId,
      segment: tail.segment,
      last_seq: tail.seq,
      last_event_hash: tail.eventHash,
      event_count: tail.eventCount,
      bytes: tail.bytes,
      checkpoint_hash: checkpointHash,
      next_segment: tail.segment + 1,
      sealed_at: isoTimestamp(),
    };

    writeFileAtomic(sealPath(taskRoot, tail.segment), `${JSON.stringify(seal, null, 2)}\n`);

    newSegment = tail.segment + 1;
    // Create the file so listSegments/activeSegment see the new segment even if
    // the process dies before SEGMENT_ROLLED lands.
    const newSegmentPath = segmentPath(taskRoot, newSegment);
    mkdirSync(path.dirname(newSegmentPath), { recursive: true });
    if (!existsSync(newSegmentPath)) writeFileSync(newSegmentPath, '');
  } finally {
    releaseLock(lockPath);
  }

  const { event: rolledEvent } = appendEvent(taskRoot, {
    task_id: taskId,
    type: 'SEGMENT_ROLLED',
    actor: 'controller',
    scope_version: scopeVersion,
    payload: {
      previous_segment: seal.segment,
      seal_hash: canonicalHash(seal),
      last_seq: seal.last_seq,
    },
  });

  return { seal, newSegment, rolledEvent };
}

/** Temp file, fsync, atomic rename — the checkpoint is never partially visible. */
export function writeFileAtomic(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const fd = openSync(tempPath, 'w');
  try {
    writeSync(fd, content, null, 'utf8');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tempPath, filePath);
  return filePath;
}

/**
 * Persist a checkpoint after schema, budget and derivation validation.
 *
 * The derivation gate is what makes I1/G5 real. The reducer refuses to derive an
 * outcome the ledger does not support, but that guard only binds callers who go
 * through the reducer — and a forged TERMINAL/DONE checkpoint written straight to
 * disk simply does not. Since `readCheckpoint()` is trusted by recovery, this is
 * the only other place the invariant can be enforced.
 */
export function writeCheckpoint(taskRoot, checkpoint) {
  assertSchema(checkpoint, getSchema(SCHEMA_IDS.CHECKPOINT));
  const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`;
  assertWithinBudget(serialized, BUDGETS.CHECKPOINT, 'CHECKPOINT', {
    task_id: checkpoint.task_id,
  });
  assertDerivedFromJournal(taskRoot, checkpoint);
  const { checkpointPath } = journalPaths(taskRoot);
  writeFileAtomic(checkpointPath, serialized);
  return { path: checkpointPath, bytes: utf8Bytes(serialized), hash: canonicalHash(checkpoint) };
}

/**
 * Reject any checkpoint the current journal does not reduce to.
 *
 * The comparison is on the whole document's canonical hash, not on `outcome`
 * alone: checking only the verdict would move the forgery one field over, to
 * `ledger_counts`, `phase` or `residual_count`, all of which the Agent reads and
 * acts on. Only a whole-document comparison converges.
 *
 * `updated_at` is the one field taken from the candidate rather than derived,
 * because it records when the reduction was persisted and carries no claim about
 * the goal. Everything else must match what the journal says.
 *
 * A verified cursor is deliberately not accepted as a substitute: a forger can
 * copy a real cursor out of `readTail()`, so `verifyCursor()` reports valid on a
 * checkpoint whose every other field is invented.
 */
function assertDerivedFromJournal(taskRoot, checkpoint) {
  const { events } = readAllEvents(taskRoot);

  let derived;
  try {
    ({ checkpoint: derived } = reduceCheckpoint(events, { now: checkpoint.updated_at }));
  } catch (cause) {
    throw new KernelError(
      PROTOCOL_CODES.INVARIANT_VIOLATED,
      `Checkpoint cannot be derived from this journal: ${cause.message}`,
      { task_id: checkpoint.task_id, eventCount: events.length, reason: cause.message },
    );
  }

  const derivedHash = canonicalHash(derived);
  if (derivedHash === canonicalHash(checkpoint)) return;

  throw new KernelError(
    PROTOCOL_CODES.INVARIANT_VIOLATED,
    'Checkpoint does not match what the journal reduces to; only a derived checkpoint may be persisted',
    {
      task_id: checkpoint.task_id,
      eventCount: events.length,
      derivedHash,
      offeredHash: canonicalHash(checkpoint),
      divergingFields: divergingFieldNames(derived, checkpoint),
    },
  );
}

/** Field names that differ, for a bounded diagnosis without dumping either document. */
function divergingFieldNames(derived, offered) {
  const names = new Set([...Object.keys(derived), ...Object.keys(offered)]);
  return [...names].filter((name) => canonicalize(derived[name] ?? null) !== canonicalize(offered[name] ?? null));
}

/**
 * Read the checkpoint, or null when absent or unreadable.
 * Never throws on a corrupt file: recovery rebuilds from the journal instead.
 */
export function readCheckpoint(taskRoot) {
  const { checkpointPath } = journalPaths(taskRoot);
  if (!existsSync(checkpointPath)) return null;
  try {
    return JSON.parse(readFileSync(checkpointPath, 'utf8'));
  } catch {
    return null;
  }
}

/** Remove abandoned `*.tmp-*` files left by an interrupted atomic write. */
export function cleanStaleTempFiles(taskRoot) {
  const removed = [];
  for (const dir of [taskRoot, path.join(taskRoot, JOURNAL_DIR)]) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.includes('.tmp-')) continue;
      const filePath = path.join(dir, name);
      unlinkSync(filePath);
      removed.push(filePath);
    }
  }
  return removed;
}

/**
 * Verify the whole chain across segments, including cross-segment links.
 * @returns {{valid: boolean, brokenAtIndex: number|null, reason: string|null, eventCount: number, droppedPartialLine: boolean, droppedResidueLines: Array<{segment: number, line: number}>}}
 */
export function verifyJournal(taskRoot) {
  const { events, droppedPartialLine, droppedResidueLines } = readAllEvents(taskRoot);
  const result = verifyChain(events);
  return { ...result, eventCount: events.length, droppedPartialLine, droppedResidueLines };
}

/** Events strictly after a cursor — the normal recovery read path. */
export function readEventsAfter(taskRoot, cursor) {
  const { events } = readAllEvents(taskRoot);
  const index = events.findIndex(
    (event) => event.seq === cursor.seq && event.event_hash === cursor.event_hash,
  );
  if (index < 0) {
    return { events: null, reason: 'cursor not found in journal' };
  }
  return { events: events.slice(index + 1), reason: null };
}

/** Re-verify a cursor against the journal before trusting a checkpoint (I7). */
export function verifyCursor(taskRoot, cursor) {
  const { events } = readAllEvents(taskRoot);
  const match = events.find((event) => event.seq === cursor.seq);
  if (!match) return { valid: false, reason: `no event with seq ${cursor.seq}` };
  if (match.event_hash !== cursor.event_hash) {
    return { valid: false, reason: `event ${cursor.seq} hash does not match cursor` };
  }
  if (match.segment !== cursor.segment) {
    return { valid: false, reason: `event ${cursor.seq} is in segment ${match.segment}, cursor says ${cursor.segment}` };
  }
  const selfCheck = verifyEventHash(match);
  if (!selfCheck.valid) return { valid: false, reason: 'cursor event fails its own hash check' };
  return { valid: true, reason: null };
}
