/**
 * `ace doctor` must be honest about the install it is actually looking at.
 *
 * A doctor that reports failures for a correct install is worse than no doctor: it trains
 * users to ignore it, so the one time it reports a real problem they skip past that too. The
 * original version ran Claude Code's plugin/marketplace/settings checks unconditionally and
 * reported five hard failures for a perfectly healthy Codex-only install.
 *
 * The opposite error matters just as much — a doctor that passes everything verifies nothing —
 * so each case here pairs "clean install reports clean" with "broken install is caught".
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
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');

/** Install into a throwaway HOME, then run the real `ace doctor` against it. */
async function installThenDoctor({ targets, breakIt }) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-doc-home-'));
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), 'ace-doc-repo-'));

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

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  await execFileAsync(process.execPath, [
    path.join(HERE, 'helpers', 'install-in-home.mjs'), home, repo, targets.join(','),
  ], { env });

  // Record the chosen targets the way `ace init` would, so doctor scopes its checks.
  await fs.outputJson(path.join(home, '.ace', 'config', 'target-selection.json'), {
    version: 1, targets, updatedAt: new Date().toISOString(),
  });

  if (breakIt) await breakIt(home);

  // doctor exits non-zero on failures, so a rejection still has to yield its output.
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync(process.execPath, [
      path.join(REPO, 'bin', 'ace.js'), 'doctor',
    ], { env }));
  } catch (err) {
    stdout = err.stdout ?? '';
  }

  const summary = stdout.match(/(\d+) passed, (\d+) failed/);
  assert.ok(summary, `doctor produced no summary line:\n${stdout}`);
  return {
    home,
    passed: Number(summary[1]),
    failed: Number(summary[2]),
    failures: [...stdout.matchAll(/FAIL\s+(.+)/g)].map(m => m[1].trim()),
  };
}

test('a healthy Codex-only install reports no failures', async () => {
  const { passed, failed, failures } = await installThenDoctor({ targets: ['codex'] });

  assert.deepEqual(
    failures, [],
    'Claude Code plugin/marketplace checks do not apply to Codex and must not be reported as failures',
  );
  assert.equal(failed, 0);
  assert.ok(passed > 0, 'a doctor that checks nothing is not passing, it is silent');
});

test('a healthy multi-target install reports no failures', async () => {
  const { failed, failures } = await installThenDoctor({
    targets: ['codex', 'deepseek-harness', 'kiro'],
  });

  assert.deepEqual(failures, []);
  assert.equal(failed, 0);
});

test('a missing skill in the canonical store is caught', async () => {
  const { failed, failures } = await installThenDoctor({
    targets: ['codex'],
    breakIt: home => fs.remove(path.join(home, '.agents', 'skills', 'spec-coding')),
  });

  assert.ok(failed > 0, 'a deleted skill must not pass');
  assert.ok(
    failures.some(f => f.includes('spec-coding')),
    `expected a spec-coding failure, got: ${JSON.stringify(failures)}`,
  );
});

test('a missing projected copy is caught for a copy target', async () => {
  const { failures } = await installThenDoctor({
    targets: ['kiro'],
    breakIt: home => fs.remove(path.join(home, '.kiro', 'skills', 'auto-goal')),
  });

  assert.ok(
    failures.some(f => f.includes('kiro') && f.includes('auto-goal')),
    `expected a kiro/auto-goal failure, got: ${JSON.stringify(failures)}`,
  );
});

test('a dangling instruction reference is caught', async () => {
  // The bug this pins: rules written somewhere other than where the rewritten index points.
  // The index still parses, so only resolving the references detects it.
  const { failures } = await installThenDoctor({
    targets: ['codex'],
    breakIt: home => fs.remove(path.join(home, '.codex', 'ace', 'rules', 'git.md')),
  });

  assert.ok(
    failures.some(f => f.includes('dangling')),
    `expected a dangling-ref failure, got: ${JSON.stringify(failures)}`,
  );
});
