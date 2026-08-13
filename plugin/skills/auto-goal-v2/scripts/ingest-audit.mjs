/**
 * Ingestion audit: how many tokens the worker's model actually consumed.
 *
 * The trap this module exists to close: `usage.input_tokens` alone is NOT the ingested
 * amount. Measured in the spike, a session seeded with a 9 KB message and then resumed
 * reported:
 *
 *   seed    input_tokens=122  cache_read=2304  -> ingested 2426
 *   resume  input_tokens=228  cache_read=2304  -> ingested 2532
 *   fresh   input_tokens=196  cache_read=256   -> ingested  452
 *
 * Reading `input_tokens` alone makes the resumed run (228) look *smaller* than the seed
 * run (2171 in an earlier uncached probe) and hides the inherited history entirely. Cached
 * prefix tokens are still tokens the model conditioned on, so they must be counted.
 */

import { BUDGETS, COUNT_LIMITS } from '../lib/budgets.mjs';

/** Total tokens the model conditioned on, cached or not. */
export function ingestedTokens(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const fields = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
  let total = 0;
  let seen = false;
  for (const field of fields) {
    const value = usage[field];
    if (typeof value === 'number' && Number.isFinite(value)) {
      total += value;
      seen = true;
    }
  }
  return seen ? total : null;
}

/**
 * Bytes the dispatcher itself put in front of the model. Unlike token counts this is fully
 * under our control and is the quantity the design's 16 KiB launch budget is expressed in.
 */
export function injectedBytes({ systemPrompt = '', userPrompt = '', jsonSchema = '' }) {
  const parts = {
    system_prompt: Buffer.byteLength(systemPrompt, 'utf8'),
    user_prompt: Buffer.byteLength(userPrompt, 'utf8'),
    json_schema: Buffer.byteLength(jsonSchema, 'utf8'),
  };
  return { parts, total: parts.system_prompt + parts.user_prompt + parts.json_schema };
}

/**
 * Re-exported under the dispatch layer's own names so existing callers keep working, but the
 * values come from the kernel. They used to be literals here, which made every shared budget
 * exist twice with nothing tying the copies together: measured before the cross-layer pins,
 * moving 16 KiB to 64 KiB or 1 KiB to 8 KiB left the whole suite green.
 */
export const LAUNCH_BUDGET_BYTES = BUDGETS.WORKER_LAUNCH_TOTAL;
export const ENVELOPE_BUDGET_BYTES = BUDGETS.WORKER_OUTPUT_ENVELOPE;

/**
 * Pre-launch byte gate. Returns a DISPATCH_REJECTED envelope instead of throwing so the
 * caller can append it to the journal and hand a bounded object to the main agent.
 */
export function checkLaunchBudget(breakdown, limit = LAUNCH_BUDGET_BYTES) {
  if (breakdown.total <= limit) return { ok: true, bytes: breakdown.total, limit };
  return {
    ok: false,
    bytes: breakdown.total,
    limit,
    envelope: {
      schema_version: 1,
      status: 'FAILED',
      code: 'DISPATCH_REJECTED',
      reason: 'launch_payload_over_budget',
      bytes: breakdown.total,
      limit,
      parts: breakdown.parts,
      next_instruction: 'Shrink artifact slices or split the objective; worker was not started.',
    },
  };
}

/**
 * Project an arbitrary worker result onto the bounded fields the main agent may see, then
 * enforce the 1 KiB ceiling by dropping optional fields — never by string-truncating JSON
 * into something that no longer parses.
 */
export function projectEnvelope(raw, { dispatchId, artifactRef, limit = ENVELOPE_BUDGET_BYTES }) {
  const clampSummary = (text) => {
    const cap = BUDGETS.WORKER_SUMMARY;
    const buf = Buffer.from(String(text ?? ''), 'utf8');
    return buf.length <= cap ? buf.toString('utf8') : buf.subarray(0, cap).toString('utf8').replace(/�+$/, '');
  };

  let envelope = {
    schema_version: 1,
    dispatch_id: dispatchId,
    status: raw?.status ?? 'FAILED',
    summary: clampSummary(raw?.summary),
    claims: Array.isArray(raw?.claims) ? raw.claims.slice(0, COUNT_LIMITS.WORKER_OUTPUT_CLAIMS) : [],
    artifact_refs: Array.isArray(raw?.artifact_refs)
      ? raw.artifact_refs.slice(0, COUNT_LIMITS.WORKER_OUTPUT_ARTIFACT_REFS)
      : [],
    artifact_pointer: artifactRef ?? null,
  };

  const size = (obj) => Buffer.byteLength(JSON.stringify(obj), 'utf8');

  if (size(envelope) > limit) envelope = { ...envelope, claims: [] };
  if (size(envelope) > limit) envelope = { ...envelope, artifact_refs: [] };
  if (size(envelope) > limit) {
    // Last resort: code + pointer only, per design 8.3.
    envelope = {
      schema_version: 1,
      dispatch_id: dispatchId,
      status: envelope.status,
      code: 'RESULT_REJECTED',
      reason: 'envelope_over_budget',
      artifact_pointer: artifactRef ?? null,
    };
  }
  return { envelope, bytes: size(envelope), limit };
}
