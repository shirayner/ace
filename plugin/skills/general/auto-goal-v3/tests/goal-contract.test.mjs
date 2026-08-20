/**
 * The criterion-identity and verdict-bijection contract, driven through the CLI.
 *
 * This suite's subject is the acceptance object: stable criterion IDs, a frozen
 * set fingerprint, and a verdict per criterion with no duplicates, gaps, or
 * unknown IDs. The work graph is a separate subject with its own suite
 * (`work-graph.test.mjs`); where an arm here has to reach `done`, it builds the
 * smallest closeable graph via `closeableGraph` so a graph gate cannot be
 * mistaken for a verdict gate, or vice versa.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  accept, closeableGraph, expectFailure, expectSuccess, init, readState,
  reportFor, run, statePath, withRoot, writeJson,
} from './helpers/goal-cli.mjs';

test('complete arm: every frozen criterion has one PASS and done archives completed', () => withRoot(root => {
  const state = init(root, 'complete', ['first observable result', 'second observable result']);
  assert.deepEqual(state.criteria.map(item => item.id), ['C001', 'C002']);
  assert.equal(new Set(state.criteria.map(item => item.text_sha256)).size, 2);
  assert.match(state.criteria_sha256, /^[a-f0-9]{64}$/);

  closeableGraph(root, 'complete', state);
  expectSuccess(accept(root, 'complete', reportFor(state, [['C001', 'PASS'], ['C002', 'PASS']])));
  expectSuccess(run(root, 'done', '--name', 'complete'));

  const archiveRoot = path.join(root, '.ace', 'tasks', 'archive');
  const archived = fs.readdirSync(archiveRoot).find(name => name.endsWith('-complete'));
  assert.ok(archived, 'completed task was not archived');
  const archivedState = JSON.parse(fs.readFileSync(path.join(archiveRoot, archived, 'state.json'), 'utf8'));
  assert.equal(archivedState.outcome, 'completed');
}));

test('minimal arm: one criterion is sufficient and retains stable identity', () => withRoot(root => {
  const state = init(root, 'minimal', ['only criterion']);
  assert.equal(state.criteria.length, 1);
  assert.deepEqual(state.criteria[0], {
    id: 'C001',
    text: 'only criterion',
    text_sha256: crypto.createHash('sha256').update('only criterion').digest('hex'),
  });
  assert.equal(state.completion_criteria[0], state.criteria[0].text);
}));

test('missing arm: empty init and omitted criterion both fail closed', () => withRoot(root => {
  expectFailure(run(root, 'init', '--name', 'empty', '--goal', 'no acceptance object'), /--criteria|验收对象/);

  const state = init(root, 'missing', ['first', 'second']);
  const result = accept(root, 'missing', reportFor(state, [['C001', 'PASS']]));
  expectFailure(result, /C002|没有判定/);
  assert.equal(readState(root, 'missing').accept, undefined);
}));

test('forged arm: duplicate, unknown, and wrong-set reports are rejected', () => withRoot(root => {
  const duplicateState = init(root, 'duplicate', ['only']);
  expectFailure(accept(root, 'duplicate', reportFor(duplicateState, [
    ['C001', 'PASS'], ['C001', 'PASS'],
  ])), /出现多次|duplicate/i);

  const unknownState = init(root, 'unknown', ['only']);
  expectFailure(accept(root, 'unknown', reportFor(unknownState, [['C999', 'PASS']])), /未知|C999/);

  const hashState = init(root, 'wrong-hash', ['only']);
  const wrongHash = reportFor(hashState, [['C001', 'PASS']]);
  wrongHash.criteria_sha256 = '0'.repeat(64);
  expectFailure(accept(root, 'wrong-hash', wrongHash), /criteria_sha256 不符/);
}));

test('the completion_criteria projection cannot drift from the frozen criteria', () => withRoot(root => {
  // `criteria` is the source of truth and `completion_criteria` is its projection,
  // read by the `ace` CLI and by humans. Only the frozen side was hash-guarded, so
  // the projection could be rewritten to show standards nobody ever verified — and
  // every gate would keep passing while the visible text said something else.
  const state = init(root, 'projection', ['real criterion']);
  assert.deepEqual(state.completion_criteria, ['real criterion']);

  for (const forged of [['something else entirely'], [], ['real criterion', 'smuggled extra']]) {
    const drifted = readState(root, 'projection');
    drifted.completion_criteria = forged;
    writeJson(statePath(root, 'projection'), drifted);
    expectFailure(run(root, 'criteria', '--name', 'projection'), /completion_criteria/);
  }
}));

test('done recomputes verdict tally, rejects FAIL, and archives UNVERIFIABLE only as partial', () => withRoot(root => {
  const failed = init(root, 'failed', ['must pass']);
  closeableGraph(root, 'failed', failed);
  expectFailure(accept(root, 'failed', reportFor(failed, [['C001', 'FAIL']])), /FAIL/);
  const failedState = readState(root, 'failed');
  failedState.accept.tally = { PASS: 1, FAIL: 0, UNVERIFIABLE: 0 };
  writeJson(statePath(root, 'failed'), failedState);
  expectFailure(run(root, 'done', '--name', 'failed'), /FAIL/);
  assert.ok(fs.existsSync(statePath(root, 'failed')));

  const partial = init(root, 'partial', ['cannot observe here']);
  closeableGraph(root, 'partial', partial);
  expectSuccess(accept(root, 'partial', reportFor(partial, [['C001', 'UNVERIFIABLE']])));
  expectFailure(run(root, 'done', '--name', 'partial'), /UNVERIFIABLE|--accept-partial/);
  expectSuccess(run(root, 'done', '--name', 'partial', '--accept-partial'));

  const archiveRoot = path.join(root, '.ace', 'tasks', 'archive');
  const archived = fs.readdirSync(archiveRoot).find(name => name.endsWith('-partial'));
  assert.ok(archived, 'partial task was not archived');
  const archivedState = JSON.parse(fs.readFileSync(path.join(archiveRoot, archived, 'state.json'), 'utf8'));
  assert.equal(archivedState.outcome, 'partial');
}));
