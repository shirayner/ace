/**
 * Cohesion and protocol-consistency tests.
 *
 * Design refs: §5 (cohesion rules), §16 acceptance A01/A02, invariant I10.
 *
 * These tests read the protocol files as data. They exist because cohesion and
 * doc/runtime agreement are claims that decay silently: a stray `../shared` import
 * or a method pack that stops existing breaks nothing until the Skill is copied to
 * another repo, at which point it fails far from the cause.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(HERE, '..');
const PROTOCOL_DIR = path.join(SKILL_ROOT, 'protocols');
const RUNTIME_DIR = path.join(PROTOCOL_DIR, 'runtime');
const METHODS_DIR = path.join(SKILL_ROOT, 'methods');
const PACKS_DIR = path.join(METHODS_DIR, 'packs');
const TEMPLATES_DIR = path.join(SKILL_ROOT, 'templates');

import { METHOD_PACKS, SIGNALS } from '../protocols/runtime/router.mjs';
import { HARD_GATES } from '../protocols/runtime/planning-gate.mjs';
import { CRITERION_TYPE_NAMES } from '../protocols/runtime/evidence.mjs';
import { RISK_DIMENSION_NAMES } from '../protocols/runtime/risk.mjs';

/** Recursively collect files under a directory, ignoring missing directories. */
async function collect(dir, predicate) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...await collect(full, predicate));
    } else if (predicate(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const isJs = (name) => name.endsWith('.mjs');
const isMd = (name) => name.endsWith('.md');

// ------------------------------------------------------------------- cohesion

test('runtime modules import nothing from outside the skill tree (I10, A01)', async () => {
  const files = await collect(RUNTIME_DIR, isJs);
  assert.ok(files.length >= 9, `expected the runtime modules, found ${files.length}`);

  const importPattern = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+['"]([^'"]+)['"]/g;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];

      // Node built-ins are a platform dependency, not a private-file dependency.
      if (specifier.startsWith('node:')) continue;

      assert.ok(
        specifier.startsWith('./') || specifier.startsWith('../'),
        `${path.basename(file)} imports bare specifier "${specifier}" — no third-party deps allowed`,
      );

      const resolved = path.resolve(path.dirname(file), specifier);
      assert.ok(
        resolved.startsWith(SKILL_ROOT),
        `${path.basename(file)} escapes the skill tree via "${specifier}"`,
      );

      for (const forbidden of ['shared', 'auto-goal' + path.sep, 'skills' + path.sep]) {
        assert.ok(
          !path.relative(SKILL_ROOT, resolved).includes(forbidden),
          `${path.basename(file)} references forbidden path "${specifier}"`,
        );
      }
    }
  }
});

test('protocol docs reference no paths outside the skill tree (A01)', async () => {
  const docs = [
    ...await collect(PROTOCOL_DIR, isMd),
    ...await collect(METHODS_DIR, isMd),
    ...await collect(TEMPLATES_DIR, isMd),
  ];
  assert.ok(docs.length >= 12, `expected protocol docs, found ${docs.length}`);

  const forbidden = [
    '../shared',
    '../auto-goal/',
    'plugin/skills/auto-goal/',
    'ace goal',
  ];

  for (const doc of docs) {
    const text = await readFile(doc, 'utf8');
    for (const needle of forbidden) {
      assert.ok(
        !text.includes(needle),
        `${path.basename(doc)} references "${needle}" outside the skill tree`,
      );
    }
  }
});

test('every runtime module is reachable from the barrel index', async () => {
  const files = await collect(RUNTIME_DIR, isJs);
  const index = await readFile(path.join(RUNTIME_DIR, 'index.mjs'), 'utf8');

  for (const file of files) {
    const name = path.basename(file);
    if (name === 'index.mjs') continue;
    assert.ok(
      index.includes(`./${name}`),
      `${name} is not exported from index.mjs`,
    );
  }
});

// --------------------------------------------------- docs match runtime tables

test('every method pack named by the router exists on disk', async () => {
  const packs = await collect(PACKS_DIR, isMd);
  const names = new Set(packs.map((file) => path.basename(file, '.md')));

  for (const pack of METHOD_PACKS) {
    assert.ok(names.has(pack), `router names pack "${pack}" but methods/packs/${pack}.md is missing`);
  }
});

test('every method pack on disk is reachable from the router table', async () => {
  const packs = await collect(PACKS_DIR, isMd);
  for (const file of packs) {
    const name = path.basename(file, '.md');
    assert.ok(
      METHOD_PACKS.includes(name),
      `methods/packs/${name}.md is orphaned — no signal routes to it`,
    );
  }
});

test('router.md lists every signal defined in the runtime table', async () => {
  const doc = await readFile(path.join(METHODS_DIR, 'router.md'), 'utf8');
  for (const signal of SIGNALS) {
    assert.ok(doc.includes(signal.id), `router.md does not document signal ${signal.id}`);
    assert.ok(doc.includes(signal.pack), `router.md does not list pack ${signal.pack}`);
  }
});

test('risk-approval.md documents all five hard gates and all risk dimensions', async () => {
  const doc = await readFile(path.join(PROTOCOL_DIR, 'risk-approval.md'), 'utf8');
  for (const gate of HARD_GATES) {
    assert.ok(doc.includes(gate.id), `risk-approval.md missing hard gate ${gate.id}`);
  }
  for (const dimension of RISK_DIMENSION_NAMES) {
    assert.ok(doc.includes(dimension), `risk-approval.md missing risk dimension ${dimension}`);
  }
});

test('goal-model.md documents every criterion type', async () => {
  const doc = await readFile(path.join(PROTOCOL_DIR, 'goal-model.md'), 'utf8');
  for (const type of CRITERION_TYPE_NAMES) {
    assert.ok(doc.includes(type), `goal-model.md missing criterion type ${type}`);
  }
});

test('every protocol doc declares when it loads', async () => {
  const docs = await collect(PROTOCOL_DIR, isMd);
  for (const doc of docs) {
    const text = await readFile(doc, 'utf8');
    assert.ok(
      text.includes('加载时机'),
      `${path.basename(doc)} does not declare its load phase`,
    );
  }
});

test('every method pack declares its triggering signal', async () => {
  const packs = await collect(PACKS_DIR, isMd);
  for (const pack of packs) {
    const text = await readFile(pack, 'utf8');
    assert.ok(
      text.includes('命中信号'),
      `${path.basename(pack)} does not declare its triggering signal`,
    );
  }
});

// --------------------------------------------------------------- size budgets

test('protocol docs stay individually loadable (progressive disclosure)', async () => {
  const docs = [
    ...await collect(PROTOCOL_DIR, isMd),
    ...await collect(METHODS_DIR, isMd),
    ...await collect(TEMPLATES_DIR, isMd),
  ];

  // Per-file ceiling: a protocol that outgrows this is doing more than one phase's
  // work and should be split, not loaded wholesale.
  const CEILING_BYTES = 12 * 1024;

  for (const doc of docs) {
    const { size } = await stat(doc);
    assert.ok(
      size <= CEILING_BYTES,
      `${path.basename(doc)} is ${size} bytes, over the ${CEILING_BYTES} byte ceiling — split it`,
    );
  }
});
