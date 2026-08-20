/**
 * End-to-end: does a multi-target install actually put files where each tool reads them?
 *
 * The unit tests pin each mechanism in isolation. This one runs the real Installer against a
 * throwaway HOME and then reads the filesystem, because the failure this whole design exists
 * to avoid is precisely an installer that *reports* success for targets it never materialized
 * anything for. Verification therefore never consults the receipt to decide whether a file
 * exists — it stats the path a tool would actually open.
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

/**
 * Build a plugin+templates fixture and run a real install against a throwaway HOME.
 *
 * The install runs in a child process, not in-process: `constants.js` resolves the home
 * directory at import time, so within one process the first HOME observed is frozen for every
 * subsequent case — cache-busting the importer does not help, because its own `./constants.js`
 * specifier is unqualified and resolves to the already-loaded module. A separate process per
 * case is what actually gives each one its own HOME.
 */
async function runInstall({ targets }) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-e2e-home-'));
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-e2e-repo-'));
  scratch.push(home, repo);

  // Minimal plugin source, categorized like the real tree.
  await fs.outputJson(path.join(repo, 'plugin', '.claude-plugin', 'plugin.json'), {
    name: 'ace', version: '9.9.9', description: 'fixture',
  });
  await fs.outputJson(path.join(repo, 'package.json'), { version: '9.9.9' });
  for (const [category, name] of [['coding', 'spec-coding'], ['general', 'auto-goal']]) {
    await fs.outputFile(
      path.join(repo, 'plugin', 'skills', category, name, 'SKILL.md'),
      `---\nname: ${name}\ndescription: fixture\n---\n# ${name}\n`,
    );
  }

  // Templates: an instruction file with a ~/.claude rule reference, plus the rule itself.
  await fs.outputFile(
    path.join(repo, 'templates', 'CLAUDE.md'),
    '# Head\n\n<!-- ace:managed:start -->\n- ~/.claude/ace/rules/git.md — git rules\n<!-- ace:managed:end -->\n',
  );
  await fs.outputFile(path.join(repo, 'templates', 'ace', 'rules', 'git.md'), '# git\n');

  const prevHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      path.join(HERE, 'helpers', 'install-in-home.mjs'),
      home,
      repo,
      targets.join(','),
    ], { env: { ...process.env, HOME: home, USERPROFILE: home } });

    const result = JSON.parse(stdout);
    return { home, repo, ...result };
  } finally {
    process.env.HOME = prevHome.HOME;
    process.env.USERPROFILE = prevHome.USERPROFILE;
  }
}

test('a Codex install lands in the canonical store Codex actually reads', async () => {
  const { home, errors } = await runInstall({ targets: ['codex'] });

  assert.deepEqual(errors, []);
  const skillMd = path.join(home, '.agents', 'skills', 'spec-coding', 'SKILL.md');
  assert.ok(await fs.pathExists(skillMd), `expected ${skillMd}`);
  // Flat: the category layer must be gone, or single-level scanners see nothing.
  assert.equal(await fs.pathExists(path.join(home, '.agents', 'skills', 'coding')), false);
});

test('one canonical store serves all three native targets', async () => {
  const { home, errors, receipt } = await runInstall({
    targets: ['codex', 'opencode', 'deepseek-harness'],
  });

  assert.deepEqual(errors, []);
  for (const skill of ['spec-coding', 'auto-goal']) {
    assert.ok(await fs.pathExists(path.join(home, '.agents', 'skills', skill, 'SKILL.md')));
  }
  // The payoff: three tools, zero projected paths.
  const projected = receipt.targets.flatMap(t => t.paths.filter(p => p.includes('skills')));
  assert.deepEqual(projected, [], 'native targets must not duplicate the store');
});

test('Kiro gets real files in its own skills directory', async () => {
  const { home, errors } = await runInstall({ targets: ['kiro'] });

  assert.deepEqual(errors, []);
  const kiroSkill = path.join(home, '.kiro', 'skills', 'spec-coding', 'SKILL.md');
  assert.ok(await fs.pathExists(kiroSkill), `expected ${kiroSkill}`);
  const stat = await fs.lstat(path.join(home, '.kiro', 'skills', 'spec-coding'));
  assert.equal(stat.isSymbolicLink(), false, 'Kiro mishandles links into .agents, so copies are required');
});

test('each target gets instructions whose rule refs point at its own root', async () => {
  const { home } = await runInstall({ targets: ['codex'] });

  const agentsMd = await fs.readFile(path.join(home, '.codex', 'AGENTS.md'), 'utf-8');
  assert.match(agentsMd, /~\/\.codex\/ace\/rules\/git\.md/);
  assert.doesNotMatch(
    agentsMd, /~\/\.claude\//,
    'a ~/.claude reference inside ~/.codex/AGENTS.md points at a file Codex never reads',
  );
  // The referenced rule file has to exist, or the index dangles.
  assert.ok(await fs.pathExists(path.join(home, '.codex', 'ace', 'rules', 'git.md')));
});

test('the rule files land where the rewritten references actually point', async () => {
  // Regression: rules were written under `target.home` while references were rewritten to
  // `instructionRoot`. For DeepSeek Harness those differ — home is ~/.dsh, but instructions
  // live at ~/.agents/AGENTS.md — so every reference in the index pointed at a file that was
  // never written there. A dangling index still loads and silently resolves to nothing, so the
  // assertion has to be "the referenced path exists", not "something was written somewhere".
  const { home, errors } = await runInstall({ targets: ['deepseek-harness'] });
  assert.deepEqual(errors, []);

  const agentsMd = await fs.readFile(path.join(home, '.agents', 'AGENTS.md'), 'utf-8');
  const refs = [...agentsMd.matchAll(/~\/([^\s—)]+\.md)/g)].map(m => m[1]);
  assert.ok(refs.length > 0, 'the fixture index must reference at least one rule file');

  for (const ref of refs) {
    assert.ok(
      await fs.pathExists(path.join(home, ref)),
      `AGENTS.md references ~/${ref}, but nothing was written there`,
    );
  }
});

test('the receipt records the ace/ tree, not only its files', async () => {
  const { receipt } = await runInstall({ targets: ['codex'] });

  const codex = receipt.targets.find(t => t.id === 'codex');
  assert.ok(
    codex.paths.some(p => p.endsWith(`${path.sep}ace`)),
    'with only files recorded, uninstall removes the rules and leaves an empty ace/ behind',
  );
});

test('the receipt records real paths, so uninstall does not have to guess', async () => {
  const { receipt, home } = await runInstall({ targets: ['kiro'] });

  const kiro = receipt.targets.find(t => t.id === 'kiro');
  assert.ok(kiro, 'the target must be recorded');
  assert.deepEqual(receipt.skills.sort(), ['auto-goal', 'spec-coding']);
  // Every recorded path must exist: a receipt that lists paths it never wrote is the exact
  // unreliability this design set out to avoid.
  for (const recorded of kiro.paths) {
    assert.ok(await fs.pathExists(recorded), `receipt lists a path that was never written: ${recorded}`);
  }
  assert.ok(kiro.paths.some(p => p.startsWith(path.join(home, '.kiro'))));
});

test('installing for a non-Claude target does not touch ~/.claude', async () => {
  const { home } = await runInstall({ targets: ['codex'] });

  // Claude Code's marketplace machinery is expensive and Claude-specific; a Codex-only
  // install that still wrote it would be doing work for a tool the user did not select.
  assert.equal(
    await fs.pathExists(path.join(home, '.claude', 'plugins')), false,
    'a Codex-only install must not create Claude Code plugin state',
  );
});

test('a Claude Code install still builds the marketplace and registry', async () => {
  const { home, errors } = await runInstall({ targets: ['claude-code'] });

  assert.deepEqual(errors, []);
  assert.ok(await fs.pathExists(path.join(home, '.claude', 'plugins', 'installed_plugins.json')));
  const cached = path.join(home, '.claude', 'plugins', 'cache', 'ace-local', 'ace', '9.9.9', 'skills', 'spec-coding', 'SKILL.md');
  assert.ok(await fs.pathExists(cached), `expected flattened plugin skill at ${cached}`);
});

test('Claude Code and a native target coexist in one install', async () => {
  const { home, errors, receipt } = await runInstall({
    targets: ['claude-code', 'codex'],
  });

  assert.deepEqual(errors, []);
  assert.ok(await fs.pathExists(path.join(home, '.agents', 'skills', 'spec-coding', 'SKILL.md')));
  assert.ok(await fs.pathExists(path.join(home, '.claude', 'plugins', 'installed_plugins.json')));
  assert.deepEqual(receipt.targets.map(t => t.id).sort(), ['claude-code', 'codex']);
});
