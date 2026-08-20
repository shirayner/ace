import fs from 'fs-extra';
import path from 'path';
import { ACE_CONFIG_DIR } from './constants.js';

const TARGET_SCHEMA_VERSION = 1;
const TARGET_SELECTION_FILE = path.join(ACE_CONFIG_DIR, 'target-selection.json');

/**
 * Which agent tools the user installs into.
 *
 * Stored separately from the skill selection for the same reason that one exists at all:
 * `ace upgrade` and `ace init --force` must reinstall what the user chose, not re-derive it.
 * Re-detecting tools on every upgrade would quietly add targets the user had declined.
 *
 * @returns {Promise<string[]|null>} null when there is no stored choice
 */
export async function readTargetSelection() {
  try {
    const data = await fs.readJson(TARGET_SELECTION_FILE);
    if (data?.version !== TARGET_SCHEMA_VERSION) return null;
    if (!Array.isArray(data.targets)) return null;
    return data.targets;
  } catch {
    return null;
  }
}

/** @param {string[]} targets */
export async function writeTargetSelection(targets) {
  await fs.ensureDir(ACE_CONFIG_DIR);
  await fs.writeJson(TARGET_SELECTION_FILE, {
    version: TARGET_SCHEMA_VERSION,
    targets,
    updatedAt: new Date().toISOString(),
  }, { spaces: 2 });
}

/** Path shown to users in summaries and doctor output. */
export function targetSelectionFileLabel() {
  return path.join('~', '.ace', 'config', 'target-selection.json').replace(/\\/g, '/');
}
