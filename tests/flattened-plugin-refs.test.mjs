/**
 * The relative references that survive flattening, checked against the flattened result.
 *
 * Skills reach each other and the plugin's shared protocols with plain relative paths:
 * `../<sibling-skill>/SKILL.md` and `../../shared/<file>.md`. Those paths are written for
 * the FLAT layout the plugin installs as, not for the categorized source tree — in the repo
 * they are off by one level, and no test that resolves them against the source would tell
 * the truth about what ships.
 *
 * So this suite deploys the real plugin the way `ace init` does and resolves every relative
 * reference against the destination. That makes the flattening's central claim checkable:
 * dropping the category layer is exactly what puts these paths back in agreement.
 *
 * A dangling reference is a skill that reads a file which is not there — the Read simply
 * fails mid-run, which is the expensive way to discover a moved directory.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Installer } from '../src/core/installer.js';
import { discoverCatalog, fullSelection } from '../src/core/skills-catalog.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLUGIN_SRC = path.join(REPO_ROOT, 'plugin');

/** Relative markdown/SKILL references of the form `../x/y.md`, as written inside a skill. */
const RELATIVE_REF = /(?<![\w./-])(\.\.\/[A-Za-z0-9._/-]+\.md)/g;

/** Deploy every shipped skill into a temp directory, flattened, exactly as init does. */
async function deployAllSkills() {
  const catalog = await discoverCatalog(path.join(PLUGIN_SRC, 'skills'));
  const destDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-flat-refs-'));
  const installer = new Installer({ pluginSrcDir: PLUGIN_SRC });
  await installer.deployPlugin(destDir, fullSelection(catalog).skills);
  return destDir;
}

/** Every `.md` file under `dir`, recursively. */
async function markdownFiles(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await markdownFiles(full));
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found;
}

/**
 * Collect references that do not resolve, as `<file>:<line> -> <ref>`.
 *
 * `{skill_dir}/…` is resolved against the skill root rather than the containing file:
 * the placeholder is substituted with the skill's own directory, so a reference written in
 * `spec-coding/phases/apply.md` as `{skill_dir}/../x` means `skills/x`, not `spec-coding/x`.
 */
async function danglingRefs(skillsDir) {
  const dangling = [];
  for (const file of await markdownFiles(skillsDir)) {
    const skillRoot = path.join(skillsDir, path.relative(skillsDir, file).split(path.sep)[0]);
    const lines = (await fs.readFile(file, 'utf-8')).split('\n');
    lines.forEach((line, i) => {
      for (const { ref, base } of relativeRefsIn(line, { file, skillRoot })) {
        if (fs.existsSync(path.resolve(base, ref))) continue;
        dangling.push(`${path.relative(skillsDir, file).split(path.sep).join('/')}:${i + 1} -> ${ref}`);
      }
    });
  }
  return dangling.sort();
}

/** Relative refs on one line, each paired with the directory it resolves against. */
function relativeRefsIn(line, { file, skillRoot }) {
  const refs = [];
  for (const [, ref] of line.matchAll(/\{skill_dir\}\/(\.\.\/[A-Za-z0-9._/-]+\.md)/g)) {
    refs.push({ ref, base: skillRoot });
  }
  const withoutPlaceholders = line.replace(/\{skill_dir\}\/\S+/g, '');
  for (const [, ref] of withoutPlaceholders.matchAll(RELATIVE_REF)) {
    refs.push({ ref, base: path.dirname(file) });
  }
  return refs;
}

test('every relative reference resolves once the plugin is flattened', async () => {
  const destDir = await deployAllSkills();

  assert.deepEqual(
    await danglingRefs(path.join(destDir, 'skills')), [],
    'these skills would fail their Read at runtime',
  );
});

test('sibling-skill references reach an actual sibling after flattening', async () => {
  const destDir = await deployAllSkills();
  const skillsDir = path.join(destDir, 'skills');

  // `../<skill>/SKILL.md` only means "a sibling skill" because the category layer is gone.
  // In the source tree the same path points at a category directory instead.
  const siblingRefs = [];
  for (const file of await markdownFiles(skillsDir)) {
    for (const [, ref] of (await fs.readFile(file, 'utf-8')).matchAll(/\.\.\/([a-z0-9-]+)\/SKILL\.md/g)) {
      siblingRefs.push({ from: file, target: ref });
    }
  }

  assert.ok(siblingRefs.length > 0, 'premise: some skill points at a sibling skill');
  const installed = new Set(await fs.readdir(skillsDir));
  const broken = siblingRefs
    .filter(r => !installed.has(r.target))
    .map(r => `${path.relative(skillsDir, r.from).split(path.sep).join('/')} -> ${r.target}`);

  assert.deepEqual(broken, [], 'named skills are not installed under that name');
});

test('shared-protocol references reach the plugin root after flattening', async () => {
  const destDir = await deployAllSkills();
  const skillsDir = path.join(destDir, 'skills');

  // `../../shared/x.md` from skills/<skill>/SKILL.md lands on <plugin>/shared/x.md. The
  // extra category level in the source tree is precisely what this depends on being gone.
  const sharedRefs = new Set();
  for (const file of await markdownFiles(skillsDir)) {
    for (const [, name] of (await fs.readFile(file, 'utf-8')).matchAll(/\.\.\/\.\.\/shared\/([a-z0-9-]+\.md)/g)) {
      sharedRefs.add(name);
    }
  }

  assert.ok(sharedRefs.size > 0, 'premise: some skill loads a shared protocol');
  const missing = [...sharedRefs]
    .filter(name => !fs.existsSync(path.join(destDir, 'shared', name)))
    .sort();

  assert.deepEqual(missing, [], 'referenced shared protocols are not shipped');
});
