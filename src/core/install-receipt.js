import fs from 'fs-extra';
import path from 'path';
import { ACE_CONFIG_DIR } from './constants.js';

const RECEIPT_SCHEMA_VERSION = 1;
export const RECEIPT_FILE = path.join(ACE_CONFIG_DIR, 'install-receipt.json');

/**
 * The install receipt: what ACE actually wrote, and where.
 *
 * `skills-selection.json` records *what* the user chose. That is not enough to undo an
 * install. Once there are multiple targets, plus links and copies, the set of paths on disk
 * is no longer derivable from the selection:
 *
 *   - A target the user has since deselected still has files from the previous run.
 *   - A projected copy lives outside the canonical store, under a path only the target knows.
 *   - A link whose source was removed becomes dangling, and a dangling link is invisible to
 *     the "does the skill exist" checks that drive `doctor`.
 *
 * So uninstall must be driven by a record of writes, not by re-deriving intent. Anything
 * absent from the receipt is treated as not ours and left alone — reconstructing ownership
 * by guessing at paths is how an uninstaller deletes a user's own files.
 */

/**
 * Read the receipt, or null when there is no usable one.
 *
 * A future schema version reads as null rather than throwing: an older ACE must not
 * delete paths recorded in a format it cannot interpret.
 *
 * @returns {Promise<{targets: object[], paths: string[]}|null>}
 */
export async function readReceipt() {
  try {
    const data = await fs.readJson(RECEIPT_FILE);
    if (data?.version !== RECEIPT_SCHEMA_VERSION) return null;
    if (!Array.isArray(data.targets)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Record an install.
 *
 * @param {{targets: Array<{id: string, projection: string, skillsDir: string, paths: string[]}>,
 *          skills: string[], canonicalSkills?: Array<{name: string, category: string, path: string}>,
 *          canonicalDir: string}} install
 */
export async function writeReceipt(install) {
  await fs.ensureDir(ACE_CONFIG_DIR);
  await fs.writeJson(RECEIPT_FILE, {
    version: RECEIPT_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    canonicalDir: install.canonicalDir,
    skills: install.skills,
    canonicalSkills: install.canonicalSkills ?? [],
    targets: install.targets,
  }, { spaces: 2 });
}

/** Remove the receipt (uninstall). */
export async function clearReceipt() {
  await fs.remove(RECEIPT_FILE);
}

/** Path shown to users in summaries and doctor output. */
export function receiptFileLabel() {
  return path.join('~', '.ace', 'config', 'install-receipt.json').replace(/\\/g, '/');
}
