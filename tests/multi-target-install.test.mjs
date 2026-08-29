/**
 * Multi-target install: one canonical store, per-target projection.
 *
 * The load-bearing claims are behavioural, not cosmetic, so each is pinned here:
 *
 *   1. The canonical store preserves categories under ACE-owned namespaces such as
 *      `ace-coding/` and `ace-general/`, preventing a large flat list from polluting the
 *      shared root while leaving other installers' entries untouched.
 *   2. A `none` target needs no projection — that is the entire reason the canonical root is
 *      `~/.agents/skills` rather than a private ACE directory.
 *   3. The store is SHARED with other installers, so pruning must not touch foreign entries.
 *   4. A receipt records real paths, because uninstall cannot re-derive them.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  writeCanonicalStore, projectToTarget, findProjectionConflicts, linkDir,
} from '../src/core/projector.js';
import { PROJECTION, resolveTargets, detectTargets, TARGETS, nativeTargets } from '../src/core/targets.js';
import { retargetRefs } from '../src/core/instructions.js';

/** Temp dirs created by this file, removed after the run. */
const scratch = [];
after(async () => {
  await Promise.all(scratch.map(dir => fs.remove(dir).catch(() => {})));
});

async function fixtureSource() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-canon-src-'));
  scratch.push(root);
  const skills = { coding: ['spec-coding', 'code-review'], general: ['auto-goal'] };
  for (const [category, names] of Object.entries(skills)) {
    for (const name of names) {
      await fs.outputFile(path.join(root, category, name, 'SKILL.md'), `# ${name}\n`);
      await fs.outputFile(path.join(root, category, name, 'references', 'r.md'), '# ref\n');
    }
  }
  const index = new Map([
    ['spec-coding', 'coding'], ['code-review', 'coding'], ['auto-goal', 'general'],
  ]);
  return { root, index };
}

async function tmpDir(tag) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `ace-${tag}-`));
  scratch.push(dir);
  return dir;
}

test('the canonical store groups skills under ACE-prefixed category directories', async () => {
  const { root, index } = await fixtureSource();
  const destDir = await tmpDir('canon');

  await writeCanonicalStore({ destDir, skillsSrcDir: root, skills: ['spec-coding'], index });

  assert.ok(
    await fs.pathExists(path.join(destDir, 'ace-coding', 'spec-coding', 'SKILL.md')),
    'categorized scanners should discover ace-coding/<skill>/SKILL.md',
  );
  assert.equal(
    await fs.pathExists(path.join(destDir, 'spec-coding')), false,
    'the shared root should not contain ACE skills as a flat list',
  );
});

test('skills from different categories stay in separate ACE namespaces', async () => {
  const { root, index } = await fixtureSource();
  const destDir = await tmpDir('canon');

  await writeCanonicalStore({ destDir, skillsSrcDir: root, skills: ['spec-coding', 'auto-goal'], index });

  assert.deepEqual((await fs.readdir(destDir)).sort(), ['ace-coding', 'ace-general']);
  assert.ok(await fs.pathExists(path.join(destDir, 'ace-general', 'auto-goal', 'SKILL.md')));
});

test('a skill keeps its own subdirectories', async () => {
  const { root, index } = await fixtureSource();
  const destDir = await tmpDir('canon');

  await writeCanonicalStore({ destDir, skillsSrcDir: root, skills: ['spec-coding'], index });

  assert.ok(await fs.pathExists(path.join(destDir, 'ace-coding', 'spec-coding', 'references', 'r.md')));
});

test('foreign entries in the shared store are left alone', async () => {
  const { root, index } = await fixtureSource();
  const destDir = await tmpDir('canon');
  // The cross-agent root is shared with other installers (the `skills` CLI keeps its tree
  // there). Wiping the directory would delete skills ACE never owned.
  await fs.outputFile(path.join(destDir, 'someone-elses-skill', 'SKILL.md'), '# theirs\n');

  await writeCanonicalStore({ destDir, skillsSrcDir: root, skills: ['spec-coding'], index });

  assert.ok(
    await fs.pathExists(path.join(destDir, 'someone-elses-skill', 'SKILL.md')),
    'ACE shares ~/.agents/skills; deleting unrecognized entries would destroy other tools\' installs',
  );
});

test('a deselected skill is removed, not merely left unregistered', async () => {
  const { root, index } = await fixtureSource();
  const destDir = await tmpDir('canon');

  await writeCanonicalStore({ destDir, skillsSrcDir: root, skills: ['spec-coding', 'code-review'], index });
  assert.ok(await fs.pathExists(path.join(destDir, 'ace-coding', 'code-review')), 'setup');

  await writeCanonicalStore({ destDir, skillsSrcDir: root, skills: ['spec-coding'], index });
  assert.equal(
    await fs.pathExists(path.join(destDir, 'ace-coding', 'code-review')), false,
    'the ACE-owned category directory is rebuilt so deselection removes stale skills',
  );
});

test('writing the categorized store removes legacy flat ACE entries', async () => {
  const { root, index } = await fixtureSource();
  const destDir = await tmpDir('canon');
  await fs.outputFile(path.join(destDir, 'spec-coding', 'SKILL.md'), '# legacy flat copy\n');

  await writeCanonicalStore({ destDir, skillsSrcDir: root, skills: ['spec-coding'], index });

  assert.equal(await fs.pathExists(path.join(destDir, 'spec-coding')), false);
  assert.ok(await fs.pathExists(path.join(destDir, 'ace-coding', 'spec-coding', 'SKILL.md')));
});

test('an unknown skill name is reported, not silently skipped', async () => {
  const { root, index } = await fixtureSource();
  const destDir = await tmpDir('canon');
  const errors = [];

  await writeCanonicalStore({
    destDir, skillsSrcDir: root, skills: ['nope'], index, onError: e => errors.push(e),
  });

  assert.deepEqual(errors, ['Skill not found in catalog: nope']);
});

test('a native target needs no projection at all', async () => {
  const [codex] = resolveTargets(['codex']);
  const canonicalDir = await tmpDir('canon');

  const result = await projectToTarget({ target: codex, canonicalDir, skills: ['spec-coding'] });

  assert.equal(result.mode, PROJECTION.NONE);
  assert.deepEqual(result.paths, [], 'Codex reads ~/.agents/skills directly — copying would duplicate for nothing');
});

test('only recursive consumers read the canonical store natively', () => {
  assert.deepEqual(nativeTargets().sort(), ['codex', 'opencode']);
  for (const id of nativeTargets()) {
    assert.equal(TARGETS[id].skillsDir, TARGETS.codex.skillsDir, `${id} shares the canonical root`);
  }
});

test('DeepSeek Harness uses a protected flat copy target', () => {
  assert.equal(TARGETS['deepseek-harness'].projection, PROJECTION.COPY);
  assert.equal(TARGETS['deepseek-harness'].scanDepth, 1);
  assert.equal(TARGETS['deepseek-harness'].protectExistingSkills, true);
  assert.notEqual(TARGETS['deepseek-harness'].skillsDir, TARGETS.codex.skillsDir);
});

test('a copy target materializes real files in its own skills dir', async () => {
  const { root, index } = await fixtureSource();
  const canonicalDir = await tmpDir('canon');
  await writeCanonicalStore({ destDir: canonicalDir, skillsSrcDir: root, skills: ['spec-coding'], index });

  const skillsDir = await tmpDir('kiro');
  const target = { ...TARGETS['kiro'], id: 'kiro', skillsDir };

  const result = await projectToTarget({ target, canonicalDir, skills: ['spec-coding'], index });

  assert.equal(result.mode, PROJECTION.COPY);
  assert.ok(
    await fs.pathExists(path.join(skillsDir, 'spec-coding', 'SKILL.md')),
    'Kiro reads its own dir and mishandles links into .agents, so it gets real files',
  );
});

test('a protected target reports every unowned skill before projection', async () => {
  const skillsDir = await tmpDir('protected');
  await fs.outputFile(path.join(skillsDir, 'spec-coding', 'SKILL.md'), '# theirs\n');
  await fs.outputFile(path.join(skillsDir, 'auto-goal', 'SKILL.md'), '# theirs\n');
  const target = { ...TARGETS['deepseek-harness'], skillsDir };

  const conflicts = await findProjectionConflicts({
    target, skills: ['spec-coding', 'auto-goal'], previousPaths: [],
  });

  assert.deepEqual(conflicts.sort(), [
    path.join(skillsDir, 'auto-goal'), path.join(skillsDir, 'spec-coding'),
  ].sort());
});

test('a protected target updates owned skills and removes deselected owned skills', async () => {
  const { root, index } = await fixtureSource();
  const canonicalDir = await tmpDir('canon');
  await writeCanonicalStore({
    destDir: canonicalDir, skillsSrcDir: root, skills: ['spec-coding', 'auto-goal'], index,
  });
  const skillsDir = await tmpDir('dsh');
  const target = { ...TARGETS['deepseek-harness'], skillsDir };
  const previousPaths = [
    path.join(skillsDir, 'spec-coding'), path.join(skillsDir, 'auto-goal'),
  ];
  await fs.outputFile(path.join(previousPaths[0], 'SKILL.md'), '# old\n');
  await fs.outputFile(path.join(previousPaths[1], 'SKILL.md'), '# old\n');

  await projectToTarget({
    target, canonicalDir, skills: ['spec-coding'], index, previousPaths,
  });

  assert.match(await fs.readFile(path.join(previousPaths[0], 'SKILL.md'), 'utf8'), /spec-coding/);
  assert.equal(await fs.pathExists(previousPaths[1]), false);
  assert.ok(await fs.pathExists(path.join(previousPaths[0], 'references', 'r.md')));
});

test('Kiro is a copy target, not a link target', () => {
  // A link Kiro silently skips is indistinguishable from a failed install, so correctness
  // beats deduplication here.
  assert.equal(TARGETS['kiro'].projection, PROJECTION.COPY);
});

test('linking falls back to a copy rather than failing the install', async () => {
  const src = await tmpDir('link-src');
  await fs.outputFile(path.join(src, 'SKILL.md'), '# s\n');
  const dest = path.join(await tmpDir('link-dest'), 'linked');

  const mode = await linkDir(src, dest);

  assert.ok(['link', 'copy'].includes(mode));
  assert.ok(
    await fs.pathExists(path.join(dest, 'SKILL.md')),
    'however it got there, the skill has to be readable — a refused install is worse than duplicated bytes',
  );
});

test('rule references are retargeted to the tool that will read them', () => {
  const body = '- ~/.claude/ace/rules/git.md — commit rules\n';

  assert.equal(
    retargetRefs(body, '~/.codex'),
    '- ~/.codex/ace/rules/git.md — commit rules\n',
    'copied verbatim into ~/.codex/AGENTS.md, a ~/.claude path points at a file Codex never reads',
  );
  assert.equal(retargetRefs(body, '~/.claude'), body, 'the Claude target is unchanged');
});

test('an unknown target id fails loudly instead of installing nothing', () => {
  assert.throws(() => resolveTargets(['not-a-tool']), /Unknown install target "not-a-tool"/);
});

test('detection reports only tools whose directory is present', async () => {
  const present = new Set([TARGETS['kiro'].detect[0]]);

  const found = await detectTargets(async dir => present.has(dir));

  assert.deepEqual(found, ['kiro']);
});
