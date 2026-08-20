/**
 * The skill catalog and the selection it resolves to.
 *
 * Source layout groups skills by category (`plugin/skills/<category>/<skill>/`) while the
 * install is flat, so two facts have to hold or the install silently breaks: names must be
 * globally unique across categories (a duplicate would overwrite at the destination), and a
 * stored selection written against an older catalog must degrade rather than throw.
 *
 * The catalog tests run against fixture trees so they assert the discovery rules themselves;
 * the real `plugin/skills/` tree is checked separately at the bottom, because that is where a
 * regression would actually land.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  discoverCatalog, indexSkills, resolveSelection, recommendedSelection, fullSelection,
} from '../src/core/skills-catalog.js';
import { SKILL_CATEGORIES } from '../src/core/constants.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL_SKILLS_DIR = path.join(REPO_ROOT, 'plugin', 'skills');

/** Build a throwaway `skills/` tree: `{ category: [skillName, ...] }`. */
function fixtureTree(spec, { withoutSkillMd = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-catalog-'));
  for (const [category, skills] of Object.entries(spec)) {
    for (const skill of skills) {
      const dir = path.join(root, category, skill);
      fs.mkdirSync(dir, { recursive: true });
      if (!withoutSkillMd.includes(skill)) {
        fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${skill}\n`);
      }
    }
  }
  return root;
}

test('discovery reads category membership from the directory tree', async () => {
  const root = fixtureTree({ coding: ['b-skill', 'a-skill'], meta: ['m-skill'] });

  const catalog = await discoverCatalog(root);

  assert.deepEqual(
    catalog.map(c => [c.key, c.skills]),
    [['coding', ['a-skill', 'b-skill']], ['meta', ['m-skill']]],
    'categories follow the declared display order; skills sort alphabetically',
  );
});

test('a directory without a SKILL.md is not a skill', async () => {
  const root = fixtureTree(
    { coding: ['real-skill', 'shared-assets'] },
    { withoutSkillMd: ['shared-assets'] },
  );

  const catalog = await discoverCatalog(root);

  assert.deepEqual(catalog[0].skills, ['real-skill']);
});

test('a category on disk but absent from the metadata is still offered', async () => {
  const root = fixtureTree({ 'brand-new': ['x'] });
  assert.equal(SKILL_CATEGORIES['brand-new'], undefined, 'fixture premise: not declared');

  const catalog = await discoverCatalog(root);

  assert.deepEqual(catalog.map(c => c.key), ['brand-new'], 'a new directory must not vanish');
  assert.equal(catalog[0].label, 'brand-new', 'falls back to the directory name');
  assert.equal(catalog[0].recommended, false, 'undeclared categories are not pre-checked');
});

test('an empty category is dropped rather than offered as a choice', async () => {
  const root = fixtureTree({ coding: ['x'] });
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });

  const catalog = await discoverCatalog(root);

  assert.deepEqual(catalog.map(c => c.key), ['coding']);
});

test('a missing skills directory yields an empty catalog, not a throw', async () => {
  assert.deepEqual(await discoverCatalog(path.join(os.tmpdir(), 'ace-does-not-exist')), []);
});

test('the same skill name in two categories fails loudly', () => {
  const catalog = [
    { key: 'coding', skills: ['shared-name'] },
    { key: 'meta', skills: ['shared-name'] },
  ];

  assert.throws(
    () => indexSkills(catalog),
    /Duplicate skill name "shared-name"/,
    'skills install flat, so a duplicate would silently overwrite at the destination',
  );
});

test('a null selection installs the recommended categories', async () => {
  // Every shipped category is recommended, so the excluded case has to come from an
  // undeclared category — which is never pre-checked, and is what a brand-new directory
  // looks like before anyone adds its metadata.
  const root = fixtureTree({ coding: ['a'], 'not-declared-anywhere': ['x'] });
  const catalog = await discoverCatalog(root);

  const resolved = resolveSelection(catalog, null);

  assert.deepEqual(resolved, recommendedSelection(catalog));
  assert.deepEqual(
    resolved.categories, ['coding'],
    'coding is recommended; a category with no metadata is not',
  );
  assert.deepEqual(resolved.skills, ['a']);
});

test('a stored selection naming a vanished skill drops it instead of failing', async () => {
  const root = fixtureTree({ coding: ['still-here'] });
  const catalog = await discoverCatalog(root);

  const resolved = resolveSelection(catalog, {
    categories: ['coding', 'category-that-was-removed'],
    skills: ['still-here', 'skill-that-was-renamed'],
  });

  assert.deepEqual(resolved.skills, ['still-here']);
  assert.deepEqual(resolved.categories, ['coding'], 'unknown categories are dropped');
  assert.deepEqual(
    resolved.dropped, ['skill-that-was-renamed'],
    'dropped skills are reported so the caller can tell the user rather than silently shrink',
  );
});

test('a chosen category with no explicit skill list installs all of its skills', async () => {
  const root = fixtureTree({ coding: ['a', 'b'] });
  const catalog = await discoverCatalog(root);

  const resolved = resolveSelection(catalog, { categories: ['coding'] });

  assert.deepEqual(resolved.skills, ['a', 'b']);
});

test('a skill outside every chosen category is not installed', async () => {
  const root = fixtureTree({ coding: ['a'], meta: ['m'] });
  const catalog = await discoverCatalog(root);

  const resolved = resolveSelection(catalog, { categories: ['coding'], skills: ['a', 'm'] });

  assert.deepEqual(resolved.skills, ['a'], 'category membership bounds the skill list');
  assert.deepEqual(resolved.dropped, ['m']);
});

test('selecting no category installs nothing', async () => {
  const root = fixtureTree({ coding: ['a'] });
  const catalog = await discoverCatalog(root);

  assert.deepEqual(resolveSelection(catalog, { categories: [], skills: [] }).skills, []);
});

// ─── The real tree ─────────────────────────────────────

test('every skill in the shipped tree has a globally unique name', async () => {
  const catalog = await discoverCatalog(REAL_SKILLS_DIR);

  assert.ok(catalog.length > 0, 'the shipped catalog must not be empty');
  assert.doesNotThrow(() => indexSkills(catalog));
});

test('every shipped category is declared in the metadata', async () => {
  const catalog = await discoverCatalog(REAL_SKILLS_DIR);

  const undeclared = catalog.filter(c => !SKILL_CATEGORIES[c.key]).map(c => c.key);
  assert.deepEqual(
    undeclared, [],
    'a category with no metadata installs with a bare directory name and is never recommended',
  );
});

test('the shipped tree recommends at least one category', async () => {
  const catalog = await discoverCatalog(REAL_SKILLS_DIR);

  assert.ok(
    recommendedSelection(catalog).skills.length > 0,
    'a fresh install resolves a null selection to the recommended set; empty means installing nothing',
  );
});

test('no shipped skill directory is nested deeper than one category level', async () => {
  const catalog = await discoverCatalog(REAL_SKILLS_DIR);
  const known = new Set(fullSelection(catalog).skills);

  // A SKILL.md three levels down would be a skill the catalog cannot see, and the
  // installer copies by catalog, so it would silently never install.
  const orphans = [];
  for (const category of fs.readdirSync(REAL_SKILLS_DIR, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    for (const skill of fs.readdirSync(path.join(REAL_SKILLS_DIR, category.name), { withFileTypes: true })) {
      if (!skill.isDirectory() || known.has(skill.name)) continue;
      const nested = path.join(REAL_SKILLS_DIR, category.name, skill.name);
      if (containsSkillMd(nested)) orphans.push(path.relative(REAL_SKILLS_DIR, nested));
    }
  }

  assert.deepEqual(orphans, [], 'these hold a SKILL.md the catalog cannot discover');
});

function containsSkillMd(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && containsSkillMd(full)) return true;
    if (entry.name === 'SKILL.md') return true;
  }
  return false;
}
