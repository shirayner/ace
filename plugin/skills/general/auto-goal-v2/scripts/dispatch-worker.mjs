/**
 * Clean-context worker dispatch.
 *
 * Ordering is the whole point (protocols/dispatch.md §3): the raw stream is captured, written
 * to an artifact and registered in the manifest index BEFORE anything is parsed, and the main
 * agent only ever receives the projected envelope. The raw text is never a return value of
 * this module — callers get a path.
 *
 *   CAPTURE -> RAW ARTIFACT WRITE -> HASH + MANIFEST -> JSON PARSE / EXTRACT
 *   -> SCHEMA VALIDATE -> SEMANTIC VALIDATE -> PATH + EVIDENCE VALIDATE
 *   -> BYTE VALIDATE -> NORMALIZE ENVELOPE -> RETURN <=1 KiB
 *
 * The steps are not interchangeable. Schema proves shape, semantics proves meaning
 * (dispatch.md §3: "schema 只保证形状不保证语义"), and both run after the raw bytes are
 * already on disk so that a rejection is still diagnosable.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, normalize, relative, resolve, sep } from 'node:path';

import { readManifestIndex, registerManifest } from '../lib/artifacts.mjs';
import { BUDGETS } from '../lib/budgets.mjs';
import { canonicalize, sha256Bytes } from '../lib/canonical.mjs';
import { validateSchema } from '../lib/schema-validator.mjs';
import { validateWorkerOutput } from '../lib/semantic-validator.mjs';
import { getSchema, SCHEMA_IDS } from '../schemas/registry.mjs';
import { assertIsolatedArgs, buildArgs, cleanEnv, resolveBackend } from './backend-resolve.mjs';
import {
  checkLaunchBudget,
  ingestedTokens,
  injectedBytes,
  projectEnvelope,
} from './ingest-audit.mjs';

/**
 * What the worker is told about its own bounds.
 *
 * The summary cap is interpolated from the kernel budget, not written as prose. A worker told
 * "<=400 bytes" while `projectEnvelope` clamped at some other number would be instructed to
 * overrun its own envelope, and the mismatch would surface as silently trimmed summaries rather
 * than an error. This was the fourth copy of `WORKER_SUMMARY` and the one a hand-written list
 * missed — a literal hiding inside a string sent to a model.
 */
export const WORKER_SYSTEM_PROMPT = [
  'You are a bounded worker with no tools and no conversation history.',
  'You receive one objective and only the material inlined with it.',
  'Never ask for more context; report what the given material does or does not support.',
  'Reply with a single JSON object and no prose, no markdown fence:',
  `{"status":"SUCCEEDED|BLOCKED|NEEDS_INPUT|FAILED","summary":"<=${BUDGETS.WORKER_SUMMARY} bytes of fact","claims":[],"artifact_refs":[]}`,
].join('\n');

/** Reject `..`, absolute paths and separator tricks before touching the filesystem. */
export function safeRelativePath(taskRoot, candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    throw new Error('DISPATCH_REJECTED: empty path');
  }
  if (isAbsolute(candidate) || /^[a-zA-Z]:/.test(candidate)) {
    throw new Error(`DISPATCH_REJECTED: absolute path not allowed: ${candidate}`);
  }
  const root = resolve(taskRoot);
  const target = resolve(root, normalize(candidate));
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`DISPATCH_REJECTED: path escapes task root: ${candidate}`);
  }
  return { absolute: target, relative: rel.split(sep).join('/') };
}

/**
 * How long a killed child is given to close its pipes before the dispatch settles anyway.
 *
 * Used by every kill path, and the wait buys diagnostics rather than a result: a killed
 * dispatch is rejected either way (deadline breached, or capture cap crossed), but whatever the
 * worker managed to write still reaches the raw artifact, which is the whole reason §3 puts the
 * raw write before any parsing. The budget exists so that a helper process holding the
 * inherited stdout cannot turn a kill into an unbounded wait: the dispatch settles within
 * `timeoutMs + CLOSE_GRACE_MS` regardless of what that helper does.
 *
 * The exact value is arbitrary within an order of magnitude — long enough for a local pipe to
 * drain, short enough to stay a bound. It shares its number with
 * `COUNT_LIMITS.JOURNAL_SEGMENT_EVENTS` and is registered in the I10 cross-layer literal
 * registry as a `coincidence` for that reason: milliseconds of drain grace and a count of
 * events per journal segment are unrelated concepts, so retuning either one must leave the
 * other alone. The first version of this constant picked a different number to make the guard
 * quiet, which is the one resolution the guard must never accept — a budget whose value is
 * chosen to avoid a collision detector has stopped being chosen on its merits, and the
 * detector has become a noise filter.
 *
 * Time budgets live at this layer, not in `lib/budgets.mjs`: that module declares byte and
 * count ceilings ("every limit is measured in real UTF-8 bytes"), and the dispatch deadline
 * (`timeoutMs`) is already a parameter here. This is exported so tests assert against the
 * constant instead of restating it.
 */
export const CLOSE_GRACE_MS = 2000;

/**
 * Bounded byte collector for one child stream.
 *
 * Two defects it exists to prevent:
 *
 * 1. Decoding per chunk (`text += chunk`) splits any multi-byte UTF-8 character that
 *    straddles a pipe-chunk boundary into replacement characters. Chinese text and emoji
 *    are the common cases. The stored artifact, its byte count and its sha256 would then
 *    all describe something the worker never wrote — and sha256 is the root of every
 *    later integrity check. So bytes are kept as bytes and decoded once, at the end.
 * 2. Unbounded accumulation lets a runaway worker exhaust the dispatcher's heap. The
 *    limit is enforced while reading, not after.
 */
function boundedCollector(limitBytes) {
  const chunks = [];
  let stored = 0;
  let received = 0;
  let overflowed = false;

  return {
    /** @returns {boolean} true when this chunk crossed the limit and the child must be killed */
    push(chunk) {
      received += chunk.length;
      if (overflowed) return false; // already killed; drop late chunks instead of growing
      if (received > limitBytes) {
        overflowed = true;
        const room = limitBytes - stored;
        if (room > 0) {
          chunks.push(chunk.subarray(0, room));
          stored += room;
        }
        return true;
      }
      chunks.push(chunk);
      stored += chunk.length;
      return false;
    },
    get overflowed() {
      return overflowed;
    },
    /** Bytes seen on the wire, including what was dropped. A lower bound after the kill. */
    get received() {
      return received;
    },
    buffer() {
      return Buffer.concat(chunks);
    },
  };
}

/**
 * Which captured stream becomes the raw artifact.
 * `receivedBytes` is what crossed the wire, which exceeds `buffer.length` after a cap kill;
 * the manifest needs both to declare truncation honestly.
 */
function pickRawStream(captured) {
  if (captured.stdout.length > 0) {
    return { buffer: captured.stdout, receivedBytes: captured.stdoutReceived };
  }
  if (captured.stderr.length > 0) {
    return { buffer: captured.stderr, receivedBytes: captured.stderrReceived };
  }
  if (captured.spawnError !== null) {
    const buffer = Buffer.from(captured.spawnError, 'utf8');
    return { buffer, receivedBytes: buffer.length };
  }
  return { buffer: Buffer.alloc(0), receivedBytes: 0 };
}

/**
 * Build the input envelope the worker is contracted to receive (dispatch.md §2).
 *
 * Why this object exists at all: §2 declares an "input envelope JSON" with a 2 KiB hard
 * limit, but the dispatcher used to write the bare `objective` string to stdin. The budget
 * therefore had nothing to measure — not a missing gate but a missing object. Two concrete
 * consequences, both reachable: a 1.9 KB objective passed the 16 KiB launch gate while
 * violating the 400-byte objective ceiling the schema declares, and the worker was never
 * told which role it was playing even though the dispatcher rejects its claims on exactly
 * that basis afterwards.
 *
 * `scope`, `constraints`, `inputs` and `expected_output` are schema-required, so a caller
 * that supplies none still yields a complete, valid envelope rather than an excuse to skip
 * validation.
 */
export function buildWorkerInput({
  dispatchId,
  taskId,
  role,
  objective,
  scope = undefined,
  constraints = undefined,
  inputs = undefined,
  scopeVersion = undefined,
  maxEnvelopeBytes = BUDGETS.WORKER_OUTPUT_ENVELOPE,
  deadline = null,
}) {
  const envelope = {
    schema_version: 1,
    dispatch_id: dispatchId,
    task_id: taskId,
    role,
    objective,
    scope: {
      include: scope?.include ?? [],
      exclude: scope?.exclude ?? [],
    },
    constraints: constraints ?? [],
    inputs: inputs ?? [],
    expected_output: {
      schema: `schemas/${SCHEMA_IDS.WORKER_OUTPUT}`,
      max_envelope_bytes: maxEnvelopeBytes,
    },
    // The worker has `--tools ''` and cannot write, so the write root is the dispatch's own
    // slot: a declared ceiling, not a granted capability.
    write_root: `work/${dispatchId}/`,
    deadline,
  };
  if (scopeVersion !== undefined) envelope.scope_version = scopeVersion;
  return envelope;
}

/**
 * Serialize the envelope and gate it on real bytes.
 *
 * Canonical form is what gets measured and what gets written: measuring one serialization
 * and sending another would make the gate an estimate. `canonicalize` also sorts keys, so
 * the bytes a worker receives are reproducible across dispatcher versions.
 */
export function measureWorkerInput(envelope) {
  const serialized = canonicalize(envelope);
  return { serialized, bytes: Buffer.byteLength(serialized, 'utf8') };
}

function rejection({ dispatchId, code, reason, artifactPointer }) {
  // A rejected result carries no summary: unconstrained worker text must never reach the
  // main model wearing the shape of a fact (dispatch.md §3).
  return {
    schema_version: 1,
    dispatch_id: dispatchId,
    status: 'FAILED',
    code,
    reason,
    artifact_pointer: artifactPointer,
  };
}

/**
 * Pick the rejection reason for a structural defect.
 *
 * A named reason for the most common defect is worth more to the caller than a generic
 * "schema invalid"; the full violation list lands in the audit either way.
 */
function schemaRejectionReason(violations) {
  const statusEnum = violations.some((v) => v.path === 'status' && (v.rule === 'enum' || v.rule === 'required'));
  return statusEnum ? 'invalid_status_enum' : 'worker_output_schema_invalid';
}

/**
 * Spawn a clean worker and return only bounded data.
 *
 * @param {object} options
 * @param {string} options.taskRoot absolute task root; the worker's cwd and path ceiling
 * @param {string} options.dispatchId id this result must bind to
 * @param {string} options.objective the single decidable task. Wrapped in the §2 input
 *   envelope, which is schema-validated and byte-gated at 2 KiB before any spawn; the
 *   envelope's canonical JSON is what reaches the worker's stdin.
 * @param {string} [options.taskId] goal task id. Required to register a provenance manifest:
 *   a manifest states which task an artifact belongs to, and that cannot be invented for a
 *   dispatch that never declared one. When absent the manifest step is skipped and
 *   `audit.manifest_skipped` says so, rather than writing an unattributable index row.
 * @param {string|null} [options.role] worker role from WORKER_ROLES. Defaults to `null`,
 *   which permits ZERO claim kinds — an undeclared role is entitled to nothing. Defaulting
 *   to a concrete role such as DISCOVER would silently grant fact_found/artifact_created
 *   authority to every caller that forgot to state one, which is the failure this gate
 *   exists to prevent.
 * @param {number} [options.maxRawBytes] hard cap on captured stdout/stderr, default
 *   `BUDGETS.ARTIFACT` (8 MiB) — the same ceiling `verifyManifest` refuses to hash beyond,
 *   so the capture limit and the artifact limit cannot disagree.
 * @returns {Promise<{envelope: object, audit: object}>} `envelope` is <=1 KiB and safe to
 *   hand to the main model. Raw output is reachable only via `audit.raw_artifact`.
 */
export async function dispatchWorker({
  taskRoot,
  dispatchId,
  objective,
  taskId = null,
  role = null,
  scope = undefined,
  constraints = undefined,
  inputs = undefined,
  dispatchScopeVersion = undefined,
  currentScopeVersion = undefined,
  artifactIndex = undefined,
  systemPrompt = WORKER_SYSTEM_PROMPT,
  model = process.env.ACE_WORKER_MODEL || undefined,
  jsonSchema = undefined,
  rawDir = 'artifacts/raw',
  maxRawBytes = BUDGETS.ARTIFACT,
  timeoutMs = 120000,
  env = process.env,
}) {
  const backend = resolveBackend(env);
  if (!backend) {
    return {
      envelope: {
        schema_version: 1,
        dispatch_id: dispatchId,
        status: 'FAILED',
        code: 'DISPATCH_REJECTED',
        reason: 'no_clean_context_backend',
        next_instruction: 'Install the Claude Code native binary or set ACE_CLAUDE_BIN.',
      },
      audit: { backend: null, launched: false },
    };
  }

  // INPUT ENVELOPE: build -> total launch gate -> schema validate -> envelope byte gate,
  // all before any spawn (§2). The worker's user prompt IS this envelope: `-p` with no prompt
  // argument reads stdin, so whatever goes on stdin is what the model conditions on. Sending a
  // bare objective left `role`, `write_root` and `expected_output` unstated while the
  // dispatcher still judged the reply against them.
  //
  // Gate order is deliberate. A grossly oversized payload violates every budget at once, and
  // the coarsest one carries the most actionable message ("shrink or split"), so the 16 KiB
  // total is reported first. The schema then catches shape and per-field byte caps, and the
  // 2 KiB envelope ceiling is checked on the exact bytes that would have been written.
  const workerInput = buildWorkerInput({
    dispatchId,
    taskId,
    role,
    objective,
    scope,
    constraints,
    inputs,
    scopeVersion: dispatchScopeVersion,
  });

  let input;
  try {
    input = measureWorkerInput(workerInput);
  } catch (error) {
    // Canonicalization refuses undefined/NaN/cyclic values. That is a caller defect, and it
    // must surface as a refusal rather than as a half-written stdin.
    return {
      envelope: {
        schema_version: 1,
        dispatch_id: dispatchId,
        status: 'FAILED',
        code: 'DISPATCH_REJECTED',
        reason: 'worker_input_not_serializable',
        next_instruction: 'Pass JSON-representable dispatch inputs; worker was not started.',
      },
      audit: {
        backend: backend.bin,
        launched: false,
        rejected_stage: 'input_serialize',
        input_error: String(error.message),
      },
    };
  }

  const breakdown = injectedBytes({ systemPrompt, userPrompt: input.serialized, jsonSchema: jsonSchema ?? '' });
  const gate = checkLaunchBudget(breakdown);
  if (!gate.ok) {
    // Worker never starts: the oversized payload never reaches any model.
    return {
      envelope: { ...gate.envelope, dispatch_id: dispatchId },
      audit: { backend: backend.bin, launched: false, injected: breakdown, rejected_stage: 'launch_budget' },
    };
  }

  const inputShape = validateSchema(workerInput, getSchema(SCHEMA_IDS.WORKER_INPUT));
  if (!inputShape.valid) {
    return {
      envelope: {
        schema_version: 1,
        dispatch_id: dispatchId,
        status: 'FAILED',
        code: 'DISPATCH_REJECTED',
        reason: 'worker_input_schema_invalid',
        next_instruction: 'Fix the dispatch inputs named in audit.input_violations; worker was not started.',
      },
      audit: {
        backend: backend.bin,
        launched: false,
        rejected_stage: 'input_schema',
        input_violations: inputShape.violations,
      },
    };
  }

  if (input.bytes > BUDGETS.WORKER_INPUT_ENVELOPE) {
    // Rejected before launch, not truncated after: a clipped envelope is not a smaller
    // request, it is an invalid one (§2, invariant I11 — no WORKER_DISPATCHED follows).
    return {
      envelope: {
        schema_version: 1,
        dispatch_id: dispatchId,
        status: 'FAILED',
        code: 'DISPATCH_REJECTED',
        reason: 'worker_input_over_budget',
        bytes: input.bytes,
        limit: BUDGETS.WORKER_INPUT_ENVELOPE,
        next_instruction: 'Shrink the objective, scope or inputs; worker was not started.',
      },
      audit: {
        backend: backend.bin,
        launched: false,
        rejected_stage: 'input_budget',
        input_bytes: input.bytes,
        input_limit: BUDGETS.WORKER_INPUT_ENVELOPE,
      },
    };
  }

  const args = buildArgs({ systemPrompt, model, jsonSchema });
  assertIsolatedArgs(args);

  const started = Date.now();
  const captured = await new Promise((res) => {
    /**
     * Why `spawn` is inside a try/catch, and why the catch resolves instead of rethrowing.
     *
     * "The backend resolved but cannot be launched" is ONE event, and `spawn` reports it in two
     * different ways depending on the platform and the failure:
     *
     *   - asynchronously, via `child.on('error')` — a POSIX `EACCES` on a non-executable file
     *   - synchronously, by THROWING out of `spawn()` itself — measured on win32:
     *       a zero-byte file with an .exe name  -> throws `spawn EFTYPE`
     *       a real file that is not a PE image  -> throws `spawn UNKNOWN`
     *
     * Left uncaught, the synchronous shape escapes this promise as a rejection, so the same
     * conceptual failure yields an audit carrying `spawn_error` on one platform and no audit at
     * all on another. Every downstream reader — the reducer, the raw-artifact write, any failing
     * assertion — then has to special-case the host it happens to be running on, and a caller on
     * win32 loses the diagnostic entirely: a thrown `Error` never reaches `pickRawStream`.
     *
     * Note this is NOT the unresolvable-backend case. A directory or a missing path is refused
     * earlier by `resolveBackend`'s `isFile` check and returns `DISPATCH_REJECTED` with
     * `launched: false` before any spawn is attempted; those inputs never arrive here.
     */
    let child;
    try {
      child = spawn(backend.bin, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false, // never a shell: objective text is untrusted
        cwd: resolve(taskRoot),
        env: cleanEnv(env),
      });
    } catch (error) {
      // No child exists, so there are no streams to drain and no timers to clear: resolve the
      // same shape the async path resolves, with empty captures and no exit code.
      res({
        code: null,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        stdoutReceived: 0,
        stderrReceived: 0,
        overflowed: false,
        timedOut: false,
        spawnError: String(error.message),
      });
      return;
    }
    const out = boundedCollector(maxRawBytes);
    const err = boundedCollector(maxRawBytes);
    let timedOut = false;
    let spawnError = null;
    let settled = false;
    // Assigned below, cleared by `settle`. Declared here so `settle` never reads them from the
    // temporal dead zone, whatever order the child's events arrive in.
    let timer = null;
    let graceTimer = null;

    /**
     * Snapshot the collectors and resolve, at most once.
     *
     * Read on `'close'`, never on `'exit'`. Node fires `'exit'` when the child process
     * terminates and explicitly does NOT promise the stdio pipes have been drained by then;
     * `'close'` is the event that means every stdio stream is finished. Snapshotting the
     * buffers synchronously inside an `'exit'` handler can therefore capture a short — or
     * empty — stdout, which this pipeline then reports as `cli_output_unparseable`: a
     * successful worker rejected at random, with a raw artifact whose sha256 faithfully
     * describes the truncation instead of the reply.
     *
     * The at-most-once guard is what lets three independent paths all be allowed to settle
     * without a late one overwriting the snapshot the caller already holds.
     */
    const settle = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      res({
        code,
        stdout: out.buffer(),
        stderr: err.buffer(),
        stdoutReceived: out.received,
        stderrReceived: err.received,
        overflowed: out.overflowed || err.overflowed,
        timedOut,
        spawnError,
      });
    };

    /**
     * SIGKILL the child and stop owing its stream unbounded patience.
     *
     * Every kill site goes through here, because the reason for the grace budget is the same in
     * all of them: `kill` signals only the process the dispatcher spawned. A helper that
     * inherited stdout survives it and keeps the pipe open, so `'close'` may never arrive for a
     * stream no live child owns any more. Once the dispatcher has decided to kill — deadline
     * breached or capture cap crossed — the outcome is already a rejection, so continuing to
     * wait can only add delay, never change the answer.
     *
     * The wait is not zero: the raw artifact is written before any parsing (§3), so the bytes
     * that are still in flight are worth a bounded moment to keep the rejection diagnosable.
     */
    const killAndBound = () => {
      child.kill('SIGKILL');
      if (graceTimer === null) graceTimer = setTimeout(() => settle(null), CLOSE_GRACE_MS);
    };

    // Bytes stay bytes until the whole stream is in hand: see boundedCollector.
    child.stdout.on('data', (chunk) => { if (out.push(chunk)) killAndBound(); });
    child.stderr.on('data', (chunk) => { if (err.push(chunk)) killAndBound(); });
    timer = setTimeout(() => {
      timedOut = true;
      killAndBound();
    }, timeoutMs);
    child.on('error', (error) => {
      spawnError = String(error.message);
      // Only a child that never spawned settles here (`pid` is undefined in exactly that
      // case): Node does not promise `'close'` after every `'error'`, and without this the
      // promise could hang. A spawned child that merely failed a later `kill` still has
      // output in flight and must be read on `'close'` like any other -- settling here would
      // reintroduce the very truncation this handler sits next to.
      if (child.pid === undefined) settle(null);
    });
    child.on('close', (code) => { settle(code); });
    // Killing the child mid-write closes its stdin; that EPIPE is expected, not a defect.
    child.stdin.on('error', () => {});
    child.stdin.write(input.serialized);
    child.stdin.end();
  });

  // CAPTURE -> RAW ARTIFACT WRITE -> HASH, before any parsing.
  // The raw artifact records whichever stream actually carries diagnostic value: stdout if
  // the worker said anything at all, else stderr, else the spawn failure itself.
  const raw = pickRawStream(captured);
  const rawBuffer = raw.buffer;
  const originalBytes = raw.receivedBytes;
  const digest = sha256Bytes(rawBuffer);
  const { absolute, relative: relPath } = safeRelativePath(taskRoot, join(rawDir, `${dispatchId}-${digest.slice(0, 12)}.raw`));
  await mkdir(join(resolve(taskRoot), rawDir), { recursive: true });
  // Written as bytes: a re-encode here would undo the point of collecting bytes.
  await writeFile(absolute, rawBuffer);

  const audit = {
    backend: backend.bin,
    backend_via: backend.via,
    launched: true,
    exit_code: captured.code,
    // The spawn failure itself, when there was one, and null otherwise. `exit_code` alone cannot
    // carry this: a child that never launched has no exit code, so the two states "never spawned"
    // and "spawned, wrote nothing, exited 0" both reduce to a shape a reader has to guess at.
    // `pickRawStream` already falls back to this text for the raw artifact; the audit is where a
    // caller looks for it, and a test that reds on missing bytes needs to tell those states apart.
    spawn_error: captured.spawnError ?? null,
    timed_out: captured.timedOut,
    duration_ms: Date.now() - started,
    injected: breakdown,
    input_bytes: input.bytes,
    input_limit: BUDGETS.WORKER_INPUT_ENVELOPE,
    raw_artifact: relPath,
    raw_bytes: rawBuffer.length,
    raw_original_bytes: originalBytes,
    raw_truncated: originalBytes > rawBuffer.length,
    raw_sha256: digest,
    manifest: null,
    manifest_skipped: null,
    rejected_stage: null,
    violations: null,
    worker_ingested_tokens: null,
    session_id: null,
  };

  // HASH + MANIFEST, still before parsing: the rejection paths below must also leave a
  // registered, verifiable piece of evidence behind (dispatch.md §3, §6).
  if (taskId === null || taskId === undefined) {
    audit.manifest_skipped = 'no_task_id';
  } else {
    try {
      const manifest = {
        schema_version: 1,
        artifact_id: `raw-${dispatchId}`,
        task_id: taskId,
        dispatch_id: dispatchId,
        kind: 'raw_output',
        path: relPath,
        media_type: 'text/plain',
        bytes: rawBuffer.length,
        sha256: digest,
        created_at: new Date().toISOString(),
        producer: `worker:${role ?? 'unattributed'}`,
        truncated: audit.raw_truncated,
        original_bytes: originalBytes,
        retention: 'task',
      };
      // The manifest file name normally carries the journal seq of ARTIFACT_REGISTERED;
      // no journal is appended here, so the dispatch id keeps names unique and traceable.
      const registered = registerManifest(resolve(taskRoot), manifest, dispatchId);
      audit.manifest = registered.manifestPath;
    } catch (error) {
      audit.rejected_stage = 'manifest';
      audit.violations = [{ invariant: 'manifest_registers', message: String(error.message) }];
      return {
        envelope: rejection({
          dispatchId,
          code: 'RESULT_REJECTED',
          reason: 'manifest_registration_failed',
          artifactPointer: relPath,
        }),
        audit,
      };
    }
  }

  if (captured.timedOut) {
    // A breached deadline is a rejection even when the bytes happen to parse.
    //
    // This gate exists because collecting on `'close'` rather than `'exit'` made a new outcome
    // reachable: the child is SIGKILLed at the deadline, but a writer that inherited its stdout
    // can keep writing, so a complete and valid reply may still land afterwards. Accepting it
    // would make `timeoutMs` advisory -- a worker could exceed any deadline and still be
    // believed, and the audit would say `timed_out: true` beside a SUCCEEDED envelope.
    //
    // The raw artifact is already written and registered above, so the late bytes stay
    // diagnosable; only their promotion to a result is refused.
    audit.rejected_stage = 'timeout';
    return {
      envelope: rejection({
        dispatchId,
        code: 'RESULT_REJECTED',
        reason: 'worker_timeout',
        artifactPointer: relPath,
      }),
      audit,
    };
  }

  if (captured.overflowed) {
    // Truncated output cannot stand as a complete reply, and dispatch.md §6 has a distinct
    // code for it precisely because the artifact survives but cannot prove completeness.
    audit.rejected_stage = 'capture';
    return {
      envelope: rejection({
        dispatchId,
        code: 'ARTIFACT_LIMIT_EXCEEDED',
        reason: 'raw_output_over_limit',
        artifactPointer: relPath,
      }),
      audit,
    };
  }

  // JSON PARSE / EXTRACT. One decode of the complete buffer, never per chunk.
  // A timed-out dispatch never reaches here: the gate above claims that case, so the reason
  // below no longer needs to distinguish it.
  let cliResult = null;
  try {
    cliResult = JSON.parse(captured.stdout.toString('utf8'));
  } catch {
    audit.rejected_stage = 'parse';
    return {
      envelope: rejection({
        dispatchId,
        code: 'RESULT_REJECTED',
        reason: 'cli_output_unparseable',
        artifactPointer: relPath,
      }),
      audit,
    };
  }

  audit.worker_ingested_tokens = ingestedTokens(cliResult?.usage);
  audit.session_id = cliResult?.session_id ?? null;

  if (!cliResult || typeof cliResult !== 'object') {
    audit.rejected_stage = 'parse';
    return {
      envelope: rejection({
        dispatchId,
        code: 'RESULT_REJECTED',
        reason: 'cli_output_unparseable',
        artifactPointer: relPath,
      }),
      audit,
    };
  }

  // The worker's own answer is a JSON string inside the CLI envelope; a fenced or chatty
  // reply is a rejection, not something to salvage into a plausible-looking summary.
  let workerOutput = null;
  try {
    workerOutput = JSON.parse(String(cliResult.result ?? '').trim());
  } catch {
    audit.rejected_stage = 'parse';
    return {
      envelope: rejection({
        dispatchId,
        code: 'RESULT_REJECTED',
        reason: 'worker_output_not_json',
        artifactPointer: relPath,
      }),
      audit,
    };
  }

  // Bind the two fields the dispatcher owns and the worker is not asked for. Binding is
  // fill-if-absent, never overwrite: a worker that states a *different* dispatch_id must
  // still fail the semantic dispatch_binding check rather than have it papered over.
  const candidate = workerOutput !== null && typeof workerOutput === 'object' && !Array.isArray(workerOutput)
    ? {
        ...workerOutput,
        schema_version: workerOutput.schema_version ?? 1,
        dispatch_id: workerOutput.dispatch_id ?? dispatchId,
        claims: workerOutput.claims ?? [],
        artifact_refs: workerOutput.artifact_refs ?? [],
      }
    : workerOutput;

  // SCHEMA VALIDATE — shape only. Covers the status enum, the 400-byte summary ceiling,
  // claim/artifact_ref counts and shapes, and rejects unknown properties.
  const shape = validateSchema(candidate, getSchema(SCHEMA_IDS.WORKER_OUTPUT));
  if (!shape.valid) {
    audit.rejected_stage = 'schema';
    audit.violations = shape.violations;
    return {
      envelope: rejection({
        dispatchId,
        code: 'RESULT_REJECTED',
        reason: schemaRejectionReason(shape.violations),
        artifactPointer: relPath,
      }),
      audit,
    };
  }

  // SEMANTIC VALIDATE — meaning. A schema-valid result can still be out of bounds: bound
  // to the wrong dispatch, computed under a superseded scope, claiming a kind this role has
  // no authority over (a DISCOVER worker declaring a criterion checked), or asserting
  // something with no evidence behind it.
  //
  // The artifact index is read from the task root rather than accepted as an optional
  // argument. `validateWorkerOutput` refuses an absent index outright — an index nobody
  // supplied cannot confirm any reference, and treating it as empty is exactly how the
  // evidence check used to short-circuit itself (B3). Deriving it here means a caller cannot
  // forget it, and the index is authoritative because the MANIFEST step above just wrote to it.
  const violations = validateWorkerOutput(candidate, {
    dispatchId,
    role,
    dispatchScopeVersion,
    currentScopeVersion,
    artifactIndex: artifactIndex ?? readManifestIndex(resolve(taskRoot)),
  });
  if (violations.length > 0) {
    audit.rejected_stage = 'semantic';
    audit.violations = violations;
    const stale = violations.some((v) => v.invariant === 'stale_scope');
    return {
      envelope: rejection({
        dispatchId,
        // dispatch.md §6: a stale-scope result keeps its artifact but must not score.
        code: stale ? 'STALE_SCOPE' : 'RESULT_REJECTED',
        reason: stale ? 'result_scope_stale' : 'worker_output_semantic_invalid',
        artifactPointer: relPath,
      }),
      audit,
    };
  }

  // BYTE VALIDATE / NORMALIZE ENVELOPE — the last step, and the only one that shrinks.
  const { envelope, bytes } = projectEnvelope(candidate, { dispatchId, artifactRef: relPath });
  audit.envelope_bytes = bytes;
  return { envelope, audit };
}
