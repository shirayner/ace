/**
 * The contract table must stay true to the source (protocols/runtime-contract.md).
 *
 * The table lets the main agent call a runtime module without reading it —
 * measured at ~11k tokens per run of implementation files that no longer need to
 * enter context. A drifted row silently revokes that saving: the documented call
 * fails and the agent reads the source to recover. These tests fail on drift
 * instead, in both directions (a name invented in the table, and an export
 * withdrawn from the source).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseContractTable, exportedNames, contractMismatches, CONTRACT_FILE } from '../lib/contract-table.mjs';

const SKILL_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('every export named in the contract table is exported by its module', () => {
  const mismatches = contractMismatches(SKILL_ROOT);
  assert.deepEqual(mismatches, [], mismatches.join('\n'));
});

test('the table covers the modules the hard gates name, so G5 stays callable', () => {
  const rows = parseContractTable(readFileSync(path.join(SKILL_ROOT, CONTRACT_FILE), 'utf8'));
  const covered = new Set(rows.map((row) => row.module));
  for (const required of ['lib/outcome.mjs', 'lib/journal.mjs', 'lib/reducer.mjs', 'scripts/dispatch-worker.mjs', 'scripts/backend-resolve.mjs']) {
    assert.ok(covered.has(required), `contract table omits ${required}, forcing the agent to read it`);
  }
});

test('SKILL.md points at the contract instead of inlining it, keeping its byte budget', () => {
  const skill = readFileSync(path.join(SKILL_ROOT, 'SKILL.md'), 'utf8');
  assert.match(skill, /protocols\/runtime-contract\.md/, 'SKILL.md must route the agent to the contract file');
  assert.ok(!skill.includes('| `lib/outcome.mjs`'), 'the contract table must not be inlined back into SKILL.md');
});

test('the checker rejects a name absent from the source, rather than passing vacuously', () => {
  const invented = exportedNames('export function realOne() {}\n');
  assert.ok(invented.has('realOne'));
  assert.ok(!invented.has('inventedOne'), 'exportedNames must not report names the source lacks');
});

test('withdrawing an export from the source is detected as drift', () => {
  const withExport = exportedNames('export function isSealable(status) {}\n');
  const withoutExport = exportedNames('function isSealable(status) {}\n');
  assert.ok(withExport.has('isSealable'));
  assert.ok(!withoutExport.has('isSealable'), 'a non-exported declaration must not count as an export');
});

test('a table that parses to nothing fails loudly instead of reporting success', () => {
  assert.throws(() => parseContractTable('# contract\n\nno table section here\n'), /契约表/);
});
