/**
 * Task-root path containment (design §7.5, threat "worker forges artifact paths").
 *
 * A string pattern can reject `..` and absolute paths, but only the filesystem
 * can answer whether a symlink leads outside the root. Both layers are needed:
 * the schema rejects the obvious, these functions reject the real.
 */

import { realpathSync } from 'node:fs';
import path from 'node:path';
import { PathEscapeError } from './errors.mjs';

/** Forward-slash form, which is what manifests and envelopes store. */
export function toPosix(relativePath) {
  return relativePath.split(path.sep).join('/');
}

/**
 * Structural check on a declared relative path.
 * Mirrors the `relativePath` schema fragment so callers can gate before parsing.
 */
export function isSafeRelativePath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) return false;
  if (candidate.includes('\0')) return false;
  if (candidate.includes('\\')) return false;
  if (path.posix.isAbsolute(candidate) || path.win32.isAbsolute(candidate)) return false;
  if (/^[A-Za-z]:/.test(candidate)) return false;
  return !candidate.split('/').includes('..');
}

/**
 * Resolve a relative path against the task root, refusing anything that escapes.
 *
 * Lexical resolution only — use `resolveRealPathWithinRoot` when the target
 * exists and symlink escape matters.
 *
 * @param {string} taskRoot absolute task root
 * @param {string} relativePath declared relative path
 * @returns {string} absolute path inside the root
 * @throws {PathEscapeError}
 */
export function resolveWithinRoot(taskRoot, relativePath) {
  if (!path.isAbsolute(taskRoot)) {
    throw new PathEscapeError('taskRoot must be an absolute path', { taskRoot });
  }
  if (!isSafeRelativePath(relativePath)) {
    throw new PathEscapeError('Path is not a safe task-relative path', { relativePath });
  }

  const rootResolved = path.resolve(taskRoot);
  const target = path.resolve(rootResolved, relativePath);
  if (!isInside(rootResolved, target)) {
    throw new PathEscapeError('Path resolves outside the task root', {
      relativePath,
      taskRoot: rootResolved,
    });
  }
  return target;
}

/**
 * Resolve through symlinks and confirm the real target stays inside the root.
 * Both root and target must exist; a missing target is itself a rejection.
 */
export function resolveRealPathWithinRoot(taskRoot, relativePath) {
  const target = resolveWithinRoot(taskRoot, relativePath);

  let realRoot;
  try {
    realRoot = realpathSync(path.resolve(taskRoot));
  } catch (cause) {
    throw new PathEscapeError('Task root does not exist or is not readable', {
      taskRoot,
      reason: cause.code,
    });
  }

  let realTarget;
  try {
    realTarget = realpathSync(target);
  } catch (cause) {
    throw new PathEscapeError('Path does not exist or is not readable', {
      relativePath,
      reason: cause.code,
    });
  }

  if (!isInside(realRoot, realTarget)) {
    throw new PathEscapeError('Path escapes the task root through a symlink', {
      relativePath,
      taskRoot: realRoot,
    });
  }
  return realTarget;
}

/**
 * Whether `target` is the root itself or below it.
 * Compares path segments so `/root-evil` is not treated as inside `/root`.
 */
export function isInside(root, target) {
  const relative = path.relative(root, target);
  if (relative === '') return true;
  if (path.isAbsolute(relative)) return false;
  return !relative.split(path.sep).includes('..');
}

/** Content-addressed artifact location: `artifacts/objects/<2-hex>/<digest><ext>`. */
export function artifactObjectPath(sha256, extension = '') {
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw new PathEscapeError('artifact object path requires a lowercase hex sha256', { sha256 });
  }
  if (extension && !/^\.[A-Za-z0-9]{1,8}$/.test(extension)) {
    throw new PathEscapeError('artifact extension must be a short alphanumeric suffix', {
      extension,
    });
  }
  return `artifacts/objects/${sha256.slice(0, 2)}/${sha256}${extension}`;
}
