/**
 * Artifact manifest validation and the segmented manifest index (design §7.5).
 *
 * This module owns manifest correctness only. Streaming capture and truncation
 * belong to the proxy; the kernel's job is to refuse a manifest that misdescribes
 * what is actually on disk — wrong digest, missing file, escaped path, or a
 * truncation that is not declared.
 *
 * The index deliberately stores only id/path/hash/kind so it stays small enough
 * to load during recovery without pulling artifact content anywhere near a model.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { BUDGETS, SOFT_LIMITS, assertWithinBudget } from './budgets.mjs';
import { sha256Bytes } from './canonical.mjs';
import { KERNEL_CODES, KernelError } from './errors.mjs';
import { resolveRealPathWithinRoot, isSafeRelativePath } from './paths.mjs';
import { assertSchema, validateSchema } from './schema-validator.mjs';
import { getSchema, SCHEMA_IDS } from '../schemas/registry.mjs';
import { validateArtifactManifest, assertNoViolations } from './semantic-validator.mjs';
import { writeFileAtomic } from './journal.mjs';

const MANIFEST_DIR = 'manifests';
const INDEX_FILE = 'manifests/index.jsonl';

export function manifestPaths(taskRoot) {
  return {
    manifestDir: path.join(taskRoot, MANIFEST_DIR),
    indexPath: path.join(taskRoot, INDEX_FILE),
  };
}

/** Manifest file name for a given journal seq, per design §7.2's naming. */
export function manifestRelativePath(seq) {
  return `${MANIFEST_DIR}/manifest-${seq}.json`;
}

/**
 * Validate a manifest against schema, budget, path containment and disk truth.
 *
 * @param {string} taskRoot absolute task root
 * @param {object} manifest candidate manifest
 * @param {object} [options]
 * @param {boolean} [options.verifyContent] re-hash the file (default true)
 * @returns {{manifest: object, actualBytes: number, actualSha256: string, softLimitExceeded: boolean}}
 * @throws {SchemaValidationError|SemanticValidationError|KernelError}
 */
export function verifyManifest(taskRoot, manifest, options = {}) {
  const { verifyContent = true } = options;

  assertSchema(manifest, getSchema(SCHEMA_IDS.ARTIFACT_MANIFEST));
  assertWithinBudget(
    JSON.stringify(manifest),
    BUDGETS.ARTIFACT_MANIFEST,
    'ARTIFACT_MANIFEST',
    { artifact_id: manifest.artifact_id },
  );

  // Path containment resolves through symlinks: a forged path must not be able
  // to point the control plane at a file outside the task root.
  const absolutePath = resolveRealPathWithinRoot(taskRoot, manifest.path);

  const stats = statSync(absolutePath);
  const actualBytes = stats.size;

  let actualSha256;
  if (verifyContent) {
    if (actualBytes > BUDGETS.ARTIFACT) {
      throw new KernelError(
        KERNEL_CODES.BUDGET_EXCEEDED,
        `Artifact ${manifest.artifact_id} is ${actualBytes} bytes, exceeding the ${BUDGETS.ARTIFACT} byte hard limit`,
        { artifact_id: manifest.artifact_id, bytes: actualBytes, limit: BUDGETS.ARTIFACT },
      );
    }
    actualSha256 = sha256Bytes(readFileSync(absolutePath));
  }

  const violations = validateArtifactManifest(manifest, {
    taskId: manifest.task_id,
    existsOnDisk: true,
    actualSha256,
    actualBytes,
  });
  assertNoViolations(`artifact manifest ${manifest.artifact_id}`, violations);

  return {
    manifest,
    actualBytes,
    actualSha256: actualSha256 ?? manifest.sha256,
    softLimitExceeded: actualBytes > SOFT_LIMITS.ARTIFACT,
  };
}

/** Write a verified manifest to its own file and append it to the index. */
export function registerManifest(taskRoot, manifest, seq) {
  const verified = verifyManifest(taskRoot, manifest);

  const relativePath = manifestRelativePath(seq);
  writeFileAtomic(path.join(taskRoot, relativePath), `${JSON.stringify(manifest, null, 2)}\n`);
  appendIndexEntry(taskRoot, manifest);

  return { manifestPath: relativePath, ...verified };
}

/** Index rows carry pointers only — never artifact content. */
function appendIndexEntry(taskRoot, manifest) {
  const { indexPath } = manifestPaths(taskRoot);
  const entry = {
    artifact_id: manifest.artifact_id,
    path: manifest.path,
    sha256: manifest.sha256,
    kind: manifest.kind,
    truncated: manifest.truncated,
  };
  const existing = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  writeFileAtomic(indexPath, `${existing}${JSON.stringify(entry)}\n`);
}

/** Load the manifest index as artifact_id -> pointer row. */
export function readManifestIndex(taskRoot) {
  const { indexPath } = manifestPaths(taskRoot);
  const index = new Map();
  if (!existsSync(indexPath)) return index;

  for (const line of readFileSync(indexPath, 'utf8').split('\n')) {
    if (line.length === 0) continue;
    const entry = JSON.parse(line);
    index.set(entry.artifact_id, entry);
  }
  return index;
}

/**
 * Re-verify every indexed artifact during recovery (design §9.5 step 4).
 *
 * Missing or altered evidence invalidates any conclusion built on it, so the
 * result is reported per artifact rather than as a single pass/fail.
 *
 * @returns {{valid: string[], invalid: Array<{artifact_id: string, reason: string}>}}
 */
export function verifyArtifactIntegrity(taskRoot, index = readManifestIndex(taskRoot)) {
  const valid = [];
  const invalid = [];

  for (const [artifactId, entry] of index) {
    if (!isSafeRelativePath(entry.path)) {
      invalid.push({ artifact_id: artifactId, reason: 'unsafe path in index' });
      continue;
    }

    let absolutePath;
    try {
      absolutePath = resolveRealPathWithinRoot(taskRoot, entry.path);
    } catch (error) {
      invalid.push({ artifact_id: artifactId, reason: error.message });
      continue;
    }

    const actual = sha256Bytes(readFileSync(absolutePath));
    if (actual !== entry.sha256) {
      invalid.push({ artifact_id: artifactId, reason: 'content digest no longer matches manifest' });
      continue;
    }
    valid.push(artifactId);
  }

  return { valid, invalid };
}

/** Non-throwing manifest shape check, for callers collecting many defects. */
export function checkManifestShape(manifest) {
  const schemaResult = validateSchema(manifest, getSchema(SCHEMA_IDS.ARTIFACT_MANIFEST));
  if (!schemaResult.valid) return schemaResult;
  const violations = validateArtifactManifest(manifest, { taskId: manifest.task_id });
  return {
    valid: violations.length === 0,
    violations: violations.map((entry) => ({
      path: entry.invariant,
      rule: 'semantic',
      message: entry.message,
    })),
  };
}
