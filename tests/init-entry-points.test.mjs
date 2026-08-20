/**
 * The "Next steps" note, against the selection it is supposed to describe.
 *
 * Once skills became selectable, a fixed list of slash commands in the closing note
 * became a way to teach the user commands that do not resolve: `/spec-coding` reads as a
 * broken install rather than as the deselection it actually is. So the note is derived
 * from what was installed, and these tests pin that derivation — including the empty case,
 * which is reachable (`categories: []` installs nothing) and must not print a bare prompt
 * with no command under it.
 *
 * The blurb table is also checked against the real catalog: a suggestion naming a skill
 * that no longer ships would silently never appear, which is the failure mode of a
 * hand-maintained list nobody validates.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { suggestedEntryPoints } from '../src/commands/init.js';
import { discoverCatalog, fullSelection } from '../src/core/skills-catalog.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REAL_SKILLS_DIR = path.join(REPO_ROOT, 'plugin', 'skills');

test('a deselected skill is not suggested', () => {
  const suggested = suggestedEntryPoints(['auto-goal', 'skill-creator']).map(e => e.name);

  assert.deepEqual(suggested, ['auto-goal', 'skill-creator']);
  assert.ok(
    !suggested.includes('spec-coding'),
    'suggesting an uninstalled skill teaches a slash command that does not resolve',
  );
});

test('a full install suggests more than one entry point', () => {
  const suggested = suggestedEntryPoints(['spec-coding', 'auto-goal', 'auto-goal-v2']);

  assert.deepEqual(
    suggested.map(e => e.name), ['spec-coding', 'auto-goal', 'auto-goal-v2'],
    'order follows the blurb table, so the headline skill stays first',
  );
  assert.ok(suggested.every(e => e.blurb.length > 0), 'every suggestion carries its blurb');
});

test('installing nothing suggests nothing rather than falling back to a default', () => {
  assert.deepEqual(suggestedEntryPoints([]), []);
});

test('an installed skill with no blurb is left out instead of listed bare', () => {
  assert.deepEqual(
    suggestedEntryPoints(['verify']), [],
    'the note is a starting point, not an inventory of every installed skill',
  );
});

test('every suggestable skill still exists in the shipped catalog', async () => {
  const shipped = new Set(fullSelection(await discoverCatalog(REAL_SKILLS_DIR)).skills);

  // Pass the whole catalog: whatever the table can suggest comes back, so a renamed or
  // deleted skill shows up here rather than as a suggestion that silently never prints.
  const suggestable = suggestedEntryPoints([...shipped]).map(e => e.name);

  assert.ok(suggestable.length > 0, 'premise: a full install suggests something');
  assert.deepEqual(
    suggestable.filter(name => !shipped.has(name)), [],
    'the blurb table names skills that are no longer shipped',
  );
});
