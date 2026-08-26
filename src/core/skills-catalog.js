import fs from 'fs-extra';
import path from 'path';
import {
  PLUGIN_SKILLS_SRC_DIR, SKILL_CATEGORIES, SKILL_CATEGORY_ORDER,
} from './constants.js';

/**
 * Discover the skill catalog from the source layout `plugin/skills/<category>/<skill>/SKILL.md`.
 *
 * The directory tree is the single source of truth for category membership; `SKILL_CATEGORIES`
 * only supplies display metadata. Categories present on disk but missing from the metadata are
 * still returned (with a fallback label) so a newly added directory never silently disappears.
 *
 * @param {string} [skillsDir] - Override the source skills directory (for tests).
 * @returns {Promise<Array<{key: string, label: string, description: string, recommended: boolean, skills: string[]}>>}
 */
export async function discoverCatalog(skillsDir = PLUGIN_SKILLS_SRC_DIR) {
  if (!await fs.pathExists(skillsDir)) return [];

  const categoryNames = (await fs.readdir(skillsDir, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);

  const catalog = [];
  for (const key of sortByDisplayOrder(categoryNames)) {
    const skills = await listSkillsIn(path.join(skillsDir, key));
    if (skills.length === 0) continue;

    const meta = SKILL_CATEGORIES[key];
    catalog.push({
      key,
      label: meta?.label ?? key,
      description: meta?.description ?? '',
      recommended: meta?.recommended ?? false,
      skills,
    });
  }
  return catalog;
}

/**
 * Index a catalog as `{ skillName: category }`, failing loudly on duplicates.
 *
 * Selection and slash-command surfaces identify skills by name, so duplicate names would be
 * ambiguous even though the canonical filesystem layout preserves categories.
 *
 * @param {Array} catalog - Result of discoverCatalog().
 * @returns {Map<string, string>} skill name → category key
 * @throws {Error} if the same skill name appears in more than one category
 */
export function indexSkills(catalog) {
  const index = new Map();
  for (const category of catalog) {
    for (const skill of category.skills) {
      const existing = index.get(skill);
      if (existing) {
        throw new Error(
          `Duplicate skill name "${skill}" in categories "${existing}" and "${category.key}". `
          + 'Skill names must be globally unique.'
        );
      }
      index.set(skill, category.key);
    }
  }
  return index;
}

/**
 * Resolve a stored/derived selection into the concrete skills to install.
 *
 * Unknown categories and skills in the selection are dropped rather than failing: a stored
 * selection outlives the catalog it was written against, and a renamed skill should not
 * break `ace init --force`.
 *
 * @param {Array} catalog - Result of discoverCatalog().
 * @param {{categories?: string[], skills?: string[]}|null} selection - null selects everything recommended.
 * @returns {{categories: string[], skills: string[], dropped: string[]}}
 */
export function resolveSelection(catalog, selection) {
  if (!selection) return recommendedSelection(catalog);

  const byKey = new Map(catalog.map(category => [category.key, category]));
  const chosenCategories = (selection.categories ?? []).filter(key => byKey.has(key));

  // No explicit skill list means "everything in the chosen categories".
  const explicit = selection.skills ? new Set(selection.skills) : null;

  const skills = [];
  for (const key of chosenCategories) {
    for (const skill of byKey.get(key).skills) {
      if (!explicit || explicit.has(skill)) skills.push(skill);
    }
  }

  const available = new Set(skills);
  const dropped = explicit
    ? [...explicit].filter(skill => !available.has(skill))
    : [];

  return { categories: chosenCategories, skills, dropped };
}

/** Selection covering every category marked `recommended`. */
export function recommendedSelection(catalog) {
  const recommended = catalog.filter(category => category.recommended);
  return {
    categories: recommended.map(category => category.key),
    skills: recommended.flatMap(category => category.skills),
    dropped: [],
  };
}

/** Selection covering every discovered skill. */
export function fullSelection(catalog) {
  return {
    categories: catalog.map(category => category.key),
    skills: catalog.flatMap(category => category.skills),
    dropped: [],
  };
}

// ─── Helpers ───────────────────────────────────────────

/** Known categories first in declared order, then any extras alphabetically. */
function sortByDisplayOrder(names) {
  const known = SKILL_CATEGORY_ORDER.filter(key => names.includes(key));
  const extra = names.filter(name => !SKILL_CATEGORY_ORDER.includes(name)).sort();
  return [...known, ...extra];
}

/** Directories directly under `categoryDir` that contain a SKILL.md. */
async function listSkillsIn(categoryDir) {
  const entries = await fs.readdir(categoryDir, { withFileTypes: true });
  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (await fs.pathExists(path.join(categoryDir, entry.name, 'SKILL.md'))) {
      skills.push(entry.name);
    }
  }
  return skills.sort();
}
