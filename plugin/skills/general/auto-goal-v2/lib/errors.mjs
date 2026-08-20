/**
 * Explicit error taxonomy for the auto-goal-v2 kernel.
 *
 * Every rejection carries a stable machine code so the control plane can append a
 * factual event and return a bounded envelope without inspecting message text.
 * Codes marked (design §7.6) are protocol-visible; the rest are kernel-internal.
 */

/** Protocol-visible rejection codes (design §7.6). */
export const PROTOCOL_CODES = Object.freeze({
  DISPATCH_REJECTED: 'DISPATCH_REJECTED',
  RESULT_REJECTED: 'RESULT_REJECTED',
  ARTIFACT_LIMIT_EXCEEDED: 'ARTIFACT_LIMIT_EXCEEDED',
  STALE_SCOPE: 'STALE_SCOPE',
  APPROVAL_REQUIRED: 'APPROVAL_REQUIRED',
  ACCESS_REQUIRED: 'ACCESS_REQUIRED',
  ACCEPTOR_REQUIRED: 'ACCEPTOR_REQUIRED',
  PLAN_INVALIDATED: 'PLAN_INVALIDATED',
  INVARIANT_VIOLATED: 'INVARIANT_VIOLATED',
});

/** Kernel-internal rejection codes. */
export const KERNEL_CODES = Object.freeze({
  SCHEMA_INVALID: 'SCHEMA_INVALID',
  SEMANTIC_INVALID: 'SEMANTIC_INVALID',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  CANONICALIZATION_FAILED: 'CANONICALIZATION_FAILED',
  JOURNAL_CONFLICT: 'JOURNAL_CONFLICT',
  JOURNAL_LOCKED: 'JOURNAL_LOCKED',
  HASH_MISMATCH: 'HASH_MISMATCH',
  PATH_ESCAPE: 'PATH_ESCAPE',
  REDUCER_FAILED: 'REDUCER_FAILED',
  NOT_INITIALIZED: 'NOT_INITIALIZED',
});

export class KernelError extends Error {
  /**
   * @param {string} code stable machine code from PROTOCOL_CODES or KERNEL_CODES
   * @param {string} message human-readable diagnosis, never the offending raw payload
   * @param {object} [details] structured, bounded diagnostic fields
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }

  /** Bounded, serializable projection — safe to place in a rejection envelope. */
  toEnvelope() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class SchemaValidationError extends KernelError {
  /** @param {Array<{path: string, rule: string, message: string}>} violations */
  constructor(schemaId, violations) {
    super(
      KERNEL_CODES.SCHEMA_INVALID,
      `Schema validation failed for ${schemaId}: ${violations.length} violation(s)`,
      { schemaId, violations },
    );
    this.violations = violations;
  }
}

export class SemanticValidationError extends KernelError {
  /** @param {Array<{invariant: string, message: string}>} violations */
  constructor(subject, violations) {
    super(
      KERNEL_CODES.SEMANTIC_INVALID,
      `Semantic validation failed for ${subject}: ${violations.length} violation(s)`,
      { subject, violations },
    );
    this.violations = violations;
  }
}

export class BudgetExceededError extends KernelError {
  constructor({ budget, actualBytes, limitBytes, composition }) {
    super(
      KERNEL_CODES.BUDGET_EXCEEDED,
      `Budget ${budget} exceeded: ${actualBytes} > ${limitBytes} bytes`,
      { budget, actualBytes, limitBytes, composition },
    );
  }
}

export class JournalConflictError extends KernelError {
  constructor(message, details) {
    super(KERNEL_CODES.JOURNAL_CONFLICT, message, details);
  }
}

export class JournalLockedError extends KernelError {
  constructor(lockPath, waitedMs) {
    super(KERNEL_CODES.JOURNAL_LOCKED, `Journal write lock is held: ${lockPath}`, {
      lockPath,
      waitedMs,
    });
  }
}

export class HashMismatchError extends KernelError {
  constructor(message, details) {
    super(KERNEL_CODES.HASH_MISMATCH, message, details);
  }
}

export class PathEscapeError extends KernelError {
  constructor(message, details) {
    super(KERNEL_CODES.PATH_ESCAPE, message, details);
  }
}

export class ReducerError extends KernelError {
  constructor(message, details) {
    super(KERNEL_CODES.REDUCER_FAILED, message, details);
  }
}
