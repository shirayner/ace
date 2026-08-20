/**
 * The flattening deploy: categorized source in, flat plugin out.
 *
 * Claude Code discovers skills at `skills/<skill>/SKILL.md` and does not recurse, so the
 * category layer that exists for readability in the repo must be gone by the time the
 * plugin lands. Two things therefore have to hold:
 *
 *   1. Selected skills arrive one level down, not two — otherwise nothing is discovered.
 *   2. Deselected skills are absent from the destination, not merely unregistered — absence
 *      is the whole mechanism by which a deselected skill stays off.
 *
 * A stale-file check covers the third failure mode: deselecting a skill you previously
 * installed has to actually remove it, or the choice is cosmetic on every machine that
 * ever had it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { Installer } from '../src/core/installer.js';

/**
 * A minimal plugin source tree: shared infrastructure plus categorized skills.
 * Mirrors the real layout closely enough that the copy filter is exercised for real.
 */
async function fixturePluginSrc() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-plugin-src-'));

  await fs.outputJson(path.join(root, '.claude-plugin', 'plugin.json'), {
    name: 'ace', version: '9.9.9', description: 'fixture',
  });
  await fs.outputFile(path.join(root, 'agents', 'some-agent.md'), '# agent\n');
  await fs.outputFile(path.join(root, 'commands', 'report.md'), '# report\n');
  await fs.outputFile(path.join(root, 'shared', 'alignment-protocol.md'), '# shared\n');

  // The second category is deliberately one with no metadata: every shipped category is
  // recommended, so an undeclared one is the only thing a default install leaves out.
  const skills = {
    coding: ['spec-coding', 'code-review'],
    'not-declared-anywhere': ['skill-creator'],
  };
  for (const [category, names] of Object.entries(skills)) {
    for (const name of names) {
      await fs.outputFile(path.join(root, 'skills', category, name, 'SKILL.md'), `# ${name}\n`);
      await fs.outputFile(path.join(root, 'skills', category, name, 'references', 'r.md'), '# ref\n');
    }
  }
  return root;
}

/** Deploy `skills` from a fixture source into a fresh destination directory. */
async function deploy(skills, { into } = {}) {
  const pluginSrcDir = await fixturePluginSrc();
  const destDir = into ?? await fs.mkdtemp(path.join(os.tmpdir(), 'ace-plugin-dest-'));
  const installer = new Installer({ pluginSrcDir });
  await installer.deployPlugin(destDir, skills);
  return { destDir, installer };
}

test('a selected skill lands one level down, where Claude Code looks', async () => {
  const { destDir } = await deploy(['spec-coding']);

  assert.ok(
    await fs.pathExists(path.join(destDir, 'skills', 'spec-coding', 'SKILL.md')),
    'skills/<skill>/SKILL.md is the only path that is discovered',
  );
  assert.equal(
    await fs.pathExists(path.join(destDir, 'skills', 'coding')), false,
    'the category directory must not survive the copy — a nested SKILL.md is invisible',
  );
});

test('a skill keeps its own subdirectories', async () => {
  const { destDir } = await deploy(['spec-coding']);

  assert.ok(await fs.pathExists(path.join(destDir, 'skills', 'spec-coding', 'references', 'r.md')));
});

test('a deselected skill is absent from the destination, not merely unregistered', async () => {
  const { destDir } = await deploy(['spec-coding']);

  assert.equal(
    await fs.pathExists(path.join(destDir, 'skills', 'code-review')), false,
    'absence is the mechanism; a copied-but-unregistered skill would still be discoverable',
  );
  assert.deepEqual(
    (await fs.readdir(path.join(destDir, 'skills'))).sort(), ['spec-coding'],
  );
});

test('skills from different categories flatten into the same directory', async () => {
  const { destDir } = await deploy(['spec-coding', 'skill-creator']);

  assert.deepEqual(
    (await fs.readdir(path.join(destDir, 'skills'))).sort(),
    ['skill-creator', 'spec-coding'],
  );
});

test('shared infrastructure outside skills/ is copied wholesale', async () => {
  const { destDir } = await deploy(['spec-coding']);

  // Sibling `../../shared/` references inside a skill only resolve because the flattened
  // skill sits at skills/<skill>/ and shared/ sits at the plugin root.
  for (const rel of [
    ['.claude-plugin', 'plugin.json'],
    ['agents', 'some-agent.md'],
    ['commands', 'report.md'],
    ['shared', 'alignment-protocol.md'],
  ]) {
    assert.ok(await fs.pathExists(path.join(destDir, ...rel)), `${rel.join('/')} is missing`);
  }
});

test('selecting nothing still leaves a skills/ directory', async () => {
  const { destDir } = await deploy([]);

  assert.equal(await fs.pathExists(path.join(destDir, 'skills')), true);
  assert.deepEqual(await fs.readdir(path.join(destDir, 'skills')), []);
});

test('deselecting a previously installed skill removes it', async () => {
  const { destDir } = await deploy(['spec-coding', 'code-review']);
  assert.ok(await fs.pathExists(path.join(destDir, 'skills', 'code-review')), 'setup');

  await deploy(['spec-coding'], { into: destDir });

  assert.equal(
    await fs.pathExists(path.join(destDir, 'skills', 'code-review')), false,
    'without a clean first, a deselection would be cosmetic on any machine that had it',
  );
});

test('a skill name absent from the catalog is reported, not silently skipped', async () => {
  const { installer } = await deploy(['spec-coding', 'skill-that-does-not-exist']);

  assert.deepEqual(
    installer.results.errors.map(e => e.error),
    ['Skill not found in catalog: skill-that-does-not-exist'],
  );
});

test('a null selection resolves to the recommended categories of the source tree', async () => {
  const pluginSrcDir = await fixturePluginSrc();
  const installer = new Installer({ pluginSrcDir });

  const skills = await installer.resolveSkillsToInstall();

  assert.deepEqual(
    skills.sort(), ['code-review', 'spec-coding'],
    'coding is recommended; an undeclared category is not, so skill-creator stays out',
  );
});

test('a stored selection naming a vanished skill is reported as skipped', async () => {
  const pluginSrcDir = await fixturePluginSrc();
  const installer = new Installer({
    pluginSrcDir,
    skillSelection: { categories: ['coding'], skills: ['spec-coding', 'renamed-away'] },
  });

  const skills = await installer.resolveSkillsToInstall();

  assert.deepEqual(skills, ['spec-coding']);
  assert.deepEqual(
    installer.results.skipped, ['skill:renamed-away (no longer in catalog)'],
    'a selection outlives the catalog it was written against; the drop must be visible',
  );
});
