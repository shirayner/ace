#!/usr/bin/env node
/**
 * Inventory every invariant `lib/semantic-validator.mjs` can emit, grouped by the
 * function that emits it, and cross-check which are asserted anywhere in `tests/`.
 *
 * Task #14 item C asks for a three-way split — reachable+covered, reachable+uncovered,
 * structurally unreachable — because "uncovered" and "unreachable" read identically in a
 * report. This script supplies the mechanical half (who emits what, who asserts what);
 * reachability per subject is a source judgement and belongs in the report, not here.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SKILL = path.resolve(
  import.meta.dirname, '..', '..', '..', '..', 'plugin', 'skills', 'auto-goal-v2',
);
const VALIDATOR = path.join(SKILL, 'lib', 'semantic-validator.mjs');

/** Invariant names emitted per function, by scanning `violation(` call sites. */
function emitters() {
  const lines = fs.readFileSync(VALIDATOR, 'utf8').split('\n');
  const byFn = new Map();
  let fn = '(module)';
  lines.forEach((line, i) => {
    const decl = line.match(/^(?:export )?function (\w+)/);
    if (decl) fn = decl[1];
    if (!line.includes('violation(')) return;
    // The name is the first string argument, which may sit on a following line.
    const window = lines.slice(i, i + 3).join(' ');
    const name = window.match(/violation\(\s*'([a-z_]+)'/);
    if (!name) return;
    if (!byFn.has(fn)) byFn.set(fn, new Set());
    byFn.get(fn).add(name[1]);
  });
  return byFn;
}

/** Every invariant name mentioned anywhere under `tests/`, with the files that mention it. */
function assertedInTests(names) {
  const hits = new Map(names.map((n) => [n, new Set()]));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const body = fs.readFileSync(full, 'utf8');
      for (const name of names) {
        if (body.includes(`'${name}'`) || body.includes(`"${name}"`)) {
          hits.get(name).add(path.relative(SKILL, full).replace(/\\/g, '/'));
        }
      }
    }
  };
  walk(path.join(SKILL, 'tests'));
  return hits;
}

const byFn = emitters();
const all = [...new Set([...byFn.values()].flatMap((s) => [...s]))].sort();
const hits = assertedInTests(all);

console.log(`validator digest: ${createHash('sha256').update(fs.readFileSync(VALIDATOR)).digest('hex').slice(0, 12)}`);
console.log(`\n== invariants by emitting function ==`);
for (const [fn, set] of [...byFn].sort()) {
  console.log(`\n${fn} (${set.size})`);
  for (const name of [...set].sort()) {
    const where = hits.get(name);
    const mark = where.size === 0 ? 'NOT ASSERTED IN tests/' : [...where].join(', ');
    console.log(`  ${name.padEnd(24)} ${mark}`);
  }
}

const orphans = all.filter((n) => hits.get(n).size === 0);
console.log(`\n== summary ==`);
console.log(`unique invariants: ${all.length}`);
console.log(`asserted somewhere in tests/: ${all.length - orphans.length}`);
console.log(`never named in tests/: ${orphans.length}`);
if (orphans.length) console.log(`  ${orphans.join('\n  ')}`);
