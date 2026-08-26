/**
 * The managed section's @imports, checked against what the merge actually produces.
 *
 * A rule file referenced as plain text (`- ~/.claude/ace/rules/x.md — description`) is only a
 * path: the agent never loads it unless it decides to Read it, which in practice it does not.
 * Only an `@` reference is loaded into context. The template therefore states its always-on
 * rules as @imports, and these tests pin the two ways that silently stops working:
 *
 *   1. The cleanup pass deletes them. `extractRefs` returns bare paths while the obsolete-ref
 *      check compared them against `@`-prefixed template refs, so a live ref looked absent
 *      from the template — i.e. obsolete — and its line was dropped. Scope is narrower than it
 *      first appears: the managed section is replaced wholesale before the cleanup runs, so
 *      refs inside it always match the template and survive. Only ACE refs OUTSIDE the markers
 *      were at risk. The bug stayed invisible while the template had no @refs at all, because
 *      then the regex matched nothing and the broken comparison never ran.
 *   2. They point nowhere. Refs are rewritten from `~/.claude/` to each target's own
 *      instruction root by string match, so an import written any other way (a relative path,
 *      say) survives verbatim into `~/.codex/AGENTS.md` and dangles there.
 *
 * Both fail the same way in production — the rules quietly aren't in context — and neither
 * shows up by reading the template.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs-extra';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeClaudeMd } from '../src/core/merger.js';
import { retargetRefs } from '../src/core/instructions.js';
import { TARGETS, TARGET_ORDER } from '../src/core/targets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'CLAUDE.md');
const RULES_DIR = path.join(__dirname, '..', 'templates', 'ace', 'rules');

const template = await fs.readFile(TEMPLATE_PATH, 'utf-8');
const claudeTemplate = retargetRefs(template, '~/.claude');

/**
 * Imports are @refs that open a line, optionally behind a list marker.
 *
 * `- @~/.claude/ace/rules/x.md` is loaded by Claude Code exactly like a bare `@ref` — the
 * template states its always-on rules that way so they read as a list. A mid-sentence `@` is
 * not an import, so the marker prefix is the only thing allowed before it.
 */
function imports(content) {
  return content
    .match(/^(?:[-*]\s+)?@\S+/gm)
    ?.map(ref => ref.replace(/^[-*]\s+/, '')) ?? [];
}

function managedSection(content) {
  const start = content.indexOf('<!-- ace:managed:start -->');
  const end = content.indexOf('<!-- ace:managed:end -->');
  return start === -1 || end === -1 ? '' : content.slice(start, end);
}

test('the template declares its always-loaded rules as @imports', () => {
  const found = imports(claudeTemplate);
  assert.ok(
    found.length > 0,
    'template has no @imports — always-on rules stated as plain paths are never loaded'
  );
});

test('every declared @import lives inside the managed section', () => {
  // Outside the markers the merge cannot maintain them: ACE would neither update the paths
  // on upgrade nor clean them up on removal.
  const inManaged = imports(managedSection(claudeTemplate));
  assert.deepEqual(imports(claudeTemplate), inManaged);
});

test('every @import resolves to a shipped rule file', async () => {
  for (const ref of imports(claudeTemplate)) {
    const file = ref.replace(/^@~\/\.claude\/ace\/rules\//, '');
    assert.ok(
      await fs.pathExists(path.join(RULES_DIR, file)),
      `@import points at a file the installer does not ship: ${ref}`
    );
  }
});

test('imports survive a merge into an existing user file', () => {
  // The managed section carries a live @import, which is what an already-installed user has.
  const existing = [
    '# 交互语言（HARD RULE）',
    '',
    '始终使用中文与用户交互。',
    '',
    '<!-- ace:managed:start -->',
    '# ACE 配置',
    '',
    '@~/.claude/ace/rules/code-quality.md',
    '<!-- ace:managed:end -->',
    '',
  ].join('\n');

  const { content } = mergeClaudeMd(existing, claudeTemplate);

  assert.deepEqual(
    imports(content),
    imports(claudeTemplate),
    'merge dropped managed @imports — the rules would silently leave the context'
  );
  assert.ok(content.includes('HARD RULE'), 'merge clobbered the user section');
});

test('a merge does not report the same ref as both added and removed', () => {
  // The symptom of the bare-vs-@ mismatch: a ref present in the template was simultaneously
  // counted as new and deleted as obsolete.
  const existing = [
    '# mine',
    '',
    '<!-- ace:managed:start -->',
    '@~/.claude/ace/rules/code-quality.md',
    '<!-- ace:managed:end -->',
    '',
  ].join('\n');
  const { added, removed } = mergeClaudeMd(existing, claudeTemplate);
  const both = added.filter(ref => removed.includes(ref));
  assert.deepEqual(both, [], 'refs reported as added and removed at once');
});

test('merging is idempotent', () => {
  const existing = [
    '# mine',
    '',
    '<!-- ace:managed:start -->',
    '@~/.claude/ace/rules/code-quality.md',
    '<!-- ace:managed:end -->',
    '',
  ].join('\n');
  const once = mergeClaudeMd(existing, claudeTemplate).content;
  const twice = mergeClaudeMd(once, claudeTemplate).content;
  assert.equal(twice, once);
});

test('obsolete ACE refs are still cleaned while current imports are kept', () => {
  const existing = [
    '# mine',
    '',
    '@~/.claude/ace/rules/removed-in-a-later-version.md',
    '',
    '<!-- ace:managed:start -->',
    'old',
    '<!-- ace:managed:end -->',
    '',
  ].join('\n');

  const { content, removed } = mergeClaudeMd(existing, claudeTemplate);

  assert.ok(
    removed.includes('~/.claude/ace/rules/removed-in-a-later-version.md'),
    'stale ACE ref was not reported as removed'
  );
  assert.ok(!content.includes('removed-in-a-later-version'), 'stale ACE ref left in place');
  assert.deepEqual(imports(content), imports(claudeTemplate), 'cleanup took the live imports too');
});

test("a user's own @ref is never touched", () => {
  const existing = [
    '# mine',
    '',
    '@~/.claude/my-own-notes.md',
    '',
    '<!-- ace:managed:start -->',
    'old',
    '<!-- ace:managed:end -->',
    '',
  ].join('\n');

  const { content, removed } = mergeClaudeMd(existing, claudeTemplate);

  assert.ok(content.includes('my-own-notes.md'), 'removed a ref ACE does not own');
  assert.ok(!removed.some(ref => ref.includes('my-own-notes')));
});

test('imports are retargeted for every non-Claude target', () => {
  for (const id of TARGET_ORDER) {
    const { instructionRoot } = TARGETS[id];
    const found = imports(retargetRefs(template, instructionRoot));

    assert.equal(found.length, imports(claudeTemplate).length, `${id}: import count changed`);
    for (const ref of found) {
      assert.ok(
        ref.startsWith(`@${instructionRoot}/`),
        `${id}: import not rewritten to its instruction root — dangles at ${ref}`
      );
    }
  }
});
