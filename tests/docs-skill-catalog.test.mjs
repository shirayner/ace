/**
 * The documented skill catalog, against the tree it documents.
 *
 * `docs/architecture.md` lists every category with its skills and whether it installs by
 * default. That table is the thing a contributor reads to find out where a skill lives, and
 * it is hand-maintained — so adding, renaming, or recategorizing a skill silently makes the
 * docs wrong, in the direction of describing a layout that no longer exists.
 *
 * These tests make the drift fail here instead of misleading someone later. They compare
 * against `discoverCatalog` and `SKILL_CATEGORIES`, the same sources the installer uses, so
 * the docs are checked against the install behaviour rather than against a second list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverCatalog } from '../src/core/skills-catalog.js';
import { SKILL_CATEGORIES } from '../src/core/constants.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHITECTURE_DOC = path.join(REPO_ROOT, 'docs', 'architecture.md');

/**
 * The category rows of the skills table, as `{ category, defaultInstall, skills }`.
 *
 * Rows are `| <category> | <✅ or —> | <comma-separated skills> |`. Parsing only the rows
 * whose first cell names a declared category keeps this from picking up the other tables in
 * the same document.
 */
async function documentedRows() {
  const text = await fs.readFile(ARCHITECTURE_DOC, 'utf-8');
  const rows = [];
  for (const line of text.split('\n')) {
    const cells = line.split('|').map(c => c.trim());
    if (cells.length < 5) continue;
    const [, category, defaultInstall, skills] = cells;
    if (!SKILL_CATEGORIES[category]) continue;
    rows.push({
      category,
      defaultInstall: defaultInstall === '✅',
      skills: skills.split(',').map(s => s.trim()).filter(Boolean),
    });
  }
  return rows;
}

test('the documented table lists every shipped category', async () => {
  const rows = await documentedRows();
  const catalog = await discoverCatalog(path.join(REPO_ROOT, 'plugin', 'skills'));

  assert.ok(rows.length > 0, 'premise: the table was found and parsed');
  assert.deepEqual(
    rows.map(r => r.category).sort(),
    catalog.map(c => c.key).sort(),
    'a category present on disk but absent from the docs is one nobody can find',
  );
});

test('each documented category lists exactly its own skills', async () => {
  const rows = await documentedRows();
  const catalog = await discoverCatalog(path.join(REPO_ROOT, 'plugin', 'skills'));
  const onDisk = new Map(catalog.map(c => [c.key, c.skills]));

  for (const row of rows) {
    assert.deepEqual(
      row.skills.sort(), [...onDisk.get(row.category)].sort(),
      `docs/architecture.md misdescribes the ${row.category} category`,
    );
  }
});

test('the documented default-install marks match the recommended flags', async () => {
  const rows = await documentedRows();

  for (const row of rows) {
    assert.equal(
      row.defaultInstall, SKILL_CATEGORIES[row.category].recommended === true,
      `${row.category}: the docs and SKILL_CATEGORIES disagree on what a fresh install gets`,
    );
  }
});
