/**
 * Target isolation: an install must not configure tools the user did not select.
 *
 * The components `core`, `rules`, `hooks` and `memory` write `~/.claude/CLAUDE.md`,
 * `~/.claude/settings.json`, hook scripts and memory templates. None of it is read by Codex,
 * OpenCode, DeepSeek Harness or Kiro. Installing it anyway left a Codex-only user with a
 * 14-file Claude Code configuration they never asked for — which reads as ACE having installed
 * the wrong tool, and on a machine where Claude Code is deliberately absent it is worse than
 * noise: `settings.json` is a real config file with real effects if Claude Code ever runs.
 *
 * The reverse containment matters too, so both directions are asserted: selecting Claude Code
 * alone must not populate the cross-agent store either.
 *
 * These cases run the real `bin/ace.js`, not the Installer API, because the leak came from
 * `ace init` driving `prepare()`/`installComponent()` directly and bypassing `run()`. Testing
 * the API alone is what let it through the first time.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Run the real `ace init --force` against a throwaway HOME with a pinned target selection. */
async function initWithTargets(targets) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-iso-home-'));
  await fs.outputJson(path.join(home, '.ace', 'config', 'target-selection.json'), {
    version: 1, targets, updatedAt: new Date().toISOString(),
  });

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  await execFileAsync(process.execPath, [path.join(REPO, 'bin', 'ace.js'), 'init', '--force'], { env });
  return { home, env };
}

/** Every file under `dir`, relative to it — [] when the directory does not exist. */
async function filesUnder(dir) {
  if (!await fs.pathExists(dir)) return [];
  const out = [];
  const walk = async current => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(dir, full));
    }
  };
  await walk(dir);
  return out;
}

test('a Codex-only install writes nothing into ~/.claude', async () => {
  const { home } = await initWithTargets(['codex']);

  const leaked = await filesUnder(path.join(home, '.claude'));
  assert.deepEqual(
    leaked, [],
    `a Codex user got a Claude Code config they never asked for: ${leaked.slice(0, 5).join(', ')}`,
  );
});

test('a Codex-only install is still complete', async () => {
  // The isolation must come from not installing Claude's components, not from installing less:
  // a fix that suppressed the leak by skipping real work would pass the test above.
  const { home, env } = await initWithTargets(['codex']);

  const skills = await fs.readdir(path.join(home, '.agents', 'skills'));
  assert.ok(skills.length > 0, 'the canonical store must be populated');
  assert.ok(await fs.pathExists(path.join(home, '.codex', 'AGENTS.md')));
  assert.ok(await fs.pathExists(path.join(home, '.codex', 'ace', 'rules')));

  const { stdout } = await execFileAsync(
    process.execPath, [path.join(REPO, 'bin', 'ace.js'), 'doctor'], { env },
  );
  assert.match(stdout, /0 failed/, `doctor should be clean:\n${stdout}`);
});

test('a Claude-only install writes nothing into the cross-agent store', async () => {
  const { home } = await initWithTargets(['claude-code']);

  const leaked = await filesUnder(path.join(home, '.agents', 'skills'));
  assert.deepEqual(leaked, [], 'Claude Code uses its plugin cache; it must not populate ~/.agents');
  assert.ok(
    await fs.pathExists(path.join(home, '.claude', 'CLAUDE.md')),
    'the Claude Code install itself must still happen',
  );
});

test('selecting both installs both, and nothing is skipped for either', async () => {
  const { home } = await initWithTargets(['claude-code', 'codex']);

  assert.ok(await fs.pathExists(path.join(home, '.claude', 'CLAUDE.md')));
  assert.ok(await fs.pathExists(path.join(home, '.claude', 'settings.json')));
  const skills = await fs.readdir(path.join(home, '.agents', 'skills'));
  assert.ok(skills.length > 0);
  assert.ok(await fs.pathExists(path.join(home, '.codex', 'AGENTS.md')));
});

test('a Kiro-only install touches neither ~/.claude nor another tool\'s config', async () => {
  const { home } = await initWithTargets(['kiro']);

  assert.deepEqual(await filesUnder(path.join(home, '.claude')), []);
  assert.deepEqual(
    await filesUnder(path.join(home, '.codex')), [],
    'selecting Kiro must not configure Codex',
  );
  const kiroSkills = await fs.readdir(path.join(home, '.kiro', 'skills'));
  assert.ok(kiroSkills.length > 0, 'Kiro itself must be installed');
});
