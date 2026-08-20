/**
 * The context budget auto-goal-v3 declares, measured against the files on disk.
 *
 * v3's whole reason for existing is that v2 cost more context than it saved, so
 * "SKILL.md ≤ 6 KiB, peak ingestion ≤ 20 KB" is a load-bearing property rather
 * than a style note. A declared budget with nobody measuring it drifts silently:
 * each edit adds a few hundred bytes of prose that reads like an improvement, and
 * the limit is only discovered as exceeded once the skill is already too expensive
 * to load. This suite makes that drift fail here.
 *
 * Two things are deliberate:
 *
 *   1. Bytes, not characters. Every heading in this skill is Chinese, where one
 *      character is three UTF-8 bytes — a `.length` check would report a third of
 *      the real cost and pass a file twice over budget.
 *   2. Peak, not total. The five phases each load one reference, so what the model
 *      holds at once is SKILL.md plus the single largest reference, not the sum of
 *      the directory. Summing would price a cost nobody pays and push toward
 *      fewer-but-bigger references, which is the wrong direction.
 *
 * `scripts/` is excluded because a script is executed by Bash, not read into the
 * transcript. That exclusion is itself asserted below, so removing it has to be a
 * deliberate edit rather than a side effect.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** SKILL.md is loaded on every invocation, so it is the one file always paid for. */
const SKILL_MD_BUDGET = 6 * 1024;

/** SKILL.md plus the largest single reference — what is held at once at worst. */
const PEAK_INGESTION_BUDGET = 20 * 1024;

/**
 * Directories whose contents never enter the transcript.
 *
 * `scripts/` is run, not read. `tests/` is this file's own home and is never
 * loaded by the skill at all.
 */
const NON_INGESTED_DIRS = new Set(['scripts', 'tests']);

function utf8Bytes(file) {
  return fs.statSync(file).size;
}

/**
 * Every file the model could be asked to read, as `{ rel, bytes }`.
 *
 * Derived from the tree rather than from a list of reference names: a new
 * `templates/` or `rules/` directory is priced the day it lands, without anyone
 * remembering to extend this suite.
 */
function ingestibleFiles(dir = SKILL_DIR, prefix = '') {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (NON_INGESTED_DIRS.has(rel)) continue;
      found.push(...ingestibleFiles(path.join(dir, entry.name), rel));
    } else {
      found.push({ rel, bytes: utf8Bytes(path.join(dir, entry.name)) });
    }
  }
  return found;
}

test('SKILL.md fits the always-loaded budget', () => {
  const bytes = utf8Bytes(path.join(SKILL_DIR, 'SKILL.md'));
  assert.ok(
    bytes <= SKILL_MD_BUDGET,
    `SKILL.md is ${bytes} bytes, over the ${SKILL_MD_BUDGET}-byte budget by ${bytes - SKILL_MD_BUDGET}. `
    + 'Move detail into a phase reference instead of raising the limit — SKILL.md is paid on every invocation.',
  );
});

test('peak ingestion — SKILL.md plus the largest reference — fits the budget', () => {
  const skillMd = utf8Bytes(path.join(SKILL_DIR, 'SKILL.md'));
  const others = ingestibleFiles().filter(file => file.rel !== 'SKILL.md');
  assert.ok(others.length > 0, 'no reference files found — the phase references are missing');

  const largest = others.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  const peak = skillMd + largest.bytes;
  assert.ok(
    peak <= PEAK_INGESTION_BUDGET,
    `peak ingestion is ${peak} bytes (SKILL.md ${skillMd} + ${largest.rel} ${largest.bytes}), `
    + `over the ${PEAK_INGESTION_BUDGET}-byte budget by ${peak - PEAK_INGESTION_BUDGET}. `
    + `Split ${largest.rel} so each phase loads only what it needs.`,
  );
});

test('the byte counts are UTF-8, not character counts', () => {
  // Guards the measurement itself: this skill is written in Chinese, so a
  // character-count implementation would pass files roughly 3x over budget.
  const skillMdPath = path.join(SKILL_DIR, 'SKILL.md');
  const text = fs.readFileSync(skillMdPath, 'utf8');
  assert.ok(
    utf8Bytes(skillMdPath) > text.length,
    'SKILL.md has no multi-byte characters, so this suite cannot tell a byte count '
    + 'from a character count — check that utf8Bytes still measures bytes.',
  );
});

test('scripts/ is excluded from ingestion on purpose', () => {
  // goal.py is larger than the whole peak budget. It is excluded because Bash
  // executes it and only its stdout reaches the transcript. Asserting the fact
  // keeps a future edit from quietly folding it in and blowing the budget, and
  // keeps someone from "fixing" the exclusion without knowing why it is there.
  const scriptsDir = path.join(SKILL_DIR, 'scripts');
  assert.ok(fs.existsSync(scriptsDir), 'scripts/ is missing — goal.py is required by the ACCEPT gate');
  assert.ok(
    NON_INGESTED_DIRS.has('scripts'),
    'scripts/ must stay out of the ingestion measurement — it is executed, not read',
  );
  assert.ok(
    !ingestibleFiles().some(file => file.rel.startsWith('scripts/')),
    'a scripts/ file was counted as ingestible',
  );
});
