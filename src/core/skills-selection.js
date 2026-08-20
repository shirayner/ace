import fs from 'fs-extra';
import path from 'path';
import { ACE_CONFIG_DIR, SKILLS_SELECTION_FILE } from './constants.js';

const SELECTION_SCHEMA_VERSION = 1;

/**
 * Read the persisted skill selection from ~/.ace/config/skills-selection.json.
 *
 * Returns null when no usable selection exists — missing file, unreadable JSON, or a
 * future schema version. Callers treat null as "no prior choice" and fall back to the
 * recommended set, which is what a fresh install does.
 *
 * @returns {Promise<{categories: string[], skills: string[]}|null>}
 */
export async function readSelection() {
  try {
    const data = await fs.readJson(SKILLS_SELECTION_FILE);
    if (data?.version !== SELECTION_SCHEMA_VERSION) return null;
    if (!Array.isArray(data.categories) || !Array.isArray(data.skills)) return null;
    return { categories: data.categories, skills: data.skills };
  } catch {
    return null;
  }
}

/**
 * Persist the skill selection so `ace init --force` and `ace upgrade` reinstall the same
 * set instead of silently restoring skills the user deselected.
 *
 * @param {{categories: string[], skills: string[]}} selection
 */
export async function writeSelection(selection) {
  await fs.ensureDir(ACE_CONFIG_DIR);
  await fs.writeJson(SKILLS_SELECTION_FILE, {
    version: SELECTION_SCHEMA_VERSION,
    categories: selection.categories,
    skills: selection.skills,
    updatedAt: new Date().toISOString(),
  }, { spaces: 2 });
}

/** Path shown to users in summaries and doctor output. */
export function selectionFileLabel() {
  return path.join('~', '.ace', 'config', 'skills-selection.json').replace(/\\/g, '/');
}
