/**
 * Uninstall roundtrip: install for several targets, then prove nothing of ours is left.
 *
 * This is the claim the receipt exists to support. Uninstall cannot re-derive what to remove
 * from the selection — projected copies live under per-target paths, and a link whose source is
 * gone reads as "missing" while still occupying its name. So the receipt is the only record,
 * and the two failure modes worth testing are opposite:
 *
 *   - too little: ACE's files survive in a target directory (orphans, dangling links)
 *   - too much:   a foreign skill in the SHARED canonical store gets deleted
 *
 * The second is the dangerous one: `~/.agents/skills` is shared with other installers, so an
 * over-eager uninstall destroys skills ACE never owned.
 */

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Temp dirs created by this file, removed after the run. */
const scratch = [];
after(async () => {
  await Promise.all(scratch.map(dir => fs.remove(dir).catch(() => {})));
});

/** Run install then uninstall in separate processes, each with its own HOME. */
async function roundtrip({ targets, seedForeign = false }) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-rt-home-'));
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-rt-repo-'));
  scratch.push(home, repo);

  await fs.outputJson(path.join(repo, 'plugin', '.claude-plugin', 'plugin.json'), {
    name: 'ace', version: '9.9.9', description: 'fixture',
  });
  await fs.outputJson(path.join(repo, 'package.json'), { version: '9.9.9' });
  for (const [category, name] of [['coding', 'spec-coding'], ['general', 'auto-goal']]) {
    await fs.outputFile(
      path.join(repo, 'plugin', 'skills', category, name, 'SKILL.md'),
      `---\nname: ${name}\n---\n# ${name}\n`,
    );
  }
  await fs.outputFile(
    path.join(repo, 'templates', 'CLAUDE.md'),
    '# Head\n\n<!-- ace:managed:start -->\n- ~/.claude/ace/rules/git.md\n<!-- ace:managed:end -->\n',
  );
  await fs.outputFile(path.join(repo, 'templates', 'ace', 'rules', 'git.md'), '# git\n');

  const foreign = path.join(home, '.agents', 'skills', 'someone-elses-skill', 'SKILL.md');
  if (seedForeign) await fs.outputFile(foreign, '# theirs\n');

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  await execFileAsync(process.execPath, [
    path.join(HERE, 'helpers', 'install-in-home.mjs'), home, repo, targets.join(','),
  ], { env });

  const { stdout: uninstallOut } = await execFileAsync(process.execPath, [
    path.join(HERE, 'helpers', 'uninstall-in-home.mjs'), home,
  ], { env });

  return { home, foreign, uninstallOut };
}

test('uninstalling a non-Claude install reports no errors', async () => {
  // ~/.claude/ legitimately never exists when Claude Code was not selected, so the steps that
  // scan it must treat absence as "nothing to do". They used to let ENOENT escape, which
  // printed two errors and "completed with errors" after a textbook-clean uninstall — sending
  // the user to look for damage that was never there.
  const { uninstallOut } = await roundtrip({ targets: ['codex', 'kiro'] });

  assert.doesNotMatch(uninstallOut, /ENOENT/, `uninstall reported ENOENT:\n${uninstallOut}`);
  assert.doesNotMatch(uninstallOut, /completed with errors/, uninstallOut);
});

test('uninstall removes projected copies from a target directory', async () => {
  const { home } = await roundtrip({ targets: ['kiro'] });

  assert.equal(
    await fs.pathExists(path.join(home, '.kiro', 'skills', 'spec-coding')), false,
    'a surviving copy is an orphan: the tool keeps loading a skill ACE no longer manages',
  );
});

test('uninstall removes DeepSeek Harness flat copies', async () => {
  const { home } = await roundtrip({ targets: ['deepseek-harness'] });

  for (const skill of ['spec-coding', 'auto-goal']) {
    assert.equal(
      await fs.pathExists(path.join(home, '.dsh', 'skills', skill)), false,
      `${skill} survived in the DeepSeek Harness skills directory`,
    );
  }
});

test('uninstall removes ACE skills from the canonical store', async () => {
  const { home } = await roundtrip({ targets: ['codex', 'deepseek-harness'] });

  for (const skill of ['spec-coding', 'auto-goal']) {
    const category = skill === 'spec-coding' ? 'ace-coding' : 'ace-general';
    assert.equal(
      await fs.pathExists(path.join(home, '.agents', 'skills', category, skill)), false,
      `${skill} survived in the shared store`,
    );
  }
  for (const category of ['ace-coding', 'ace-general']) {
    assert.equal(
      await fs.pathExists(path.join(home, '.agents', 'skills', category)), false,
      `${category} survived after its skills were removed`,
    );
  }
});

test('uninstall leaves another installer\'s skills in the shared store alone', async () => {
  const { foreign } = await roundtrip({ targets: ['codex'], seedForeign: true });

  assert.ok(
    await fs.pathExists(foreign),
    '~/.agents/skills is shared; removing unrecognized entries would delete skills ACE never installed',
  );
});

test('uninstall does not delete the shared store directory itself', async () => {
  const { home } = await roundtrip({ targets: ['codex'] });

  // Other tools' installs depend on the directory existing; ACE owns entries, not the root.
  assert.ok(await fs.pathExists(path.join(home, '.agents', 'skills')));
});

test('uninstall leaves no ACE directory behind in a target config', async () => {
  const { home } = await roundtrip({ targets: ['codex', 'kiro'] });

  // A stray `~/.codex/ace/` is indistinguishable from a partial install to anyone who looks
  // later, so removing the rule files is not enough — the tree has to go with them.
  for (const rel of [['.codex', 'ace'], ['.kiro', 'ace']]) {
    assert.equal(
      await fs.pathExists(path.join(home, ...rel)), false,
      `${rel.join('/')} survived uninstall`,
    );
  }
});

test('uninstall clears the receipt, so a reinstall starts clean', async () => {
  const { home } = await roundtrip({ targets: ['kiro'] });

  assert.equal(
    await fs.pathExists(path.join(home, '.ace', 'config', 'install-receipt.json')), false,
    'a surviving receipt would make the next uninstall retrace paths that are already gone',
  );
});
