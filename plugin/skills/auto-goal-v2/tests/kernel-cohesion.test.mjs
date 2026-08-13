/**
 * Cohesion tests (design §5 dependency rules; scenarios A01-A02, invariant I10).
 *
 * The kernel must be copyable, installable and deletable as one directory. These
 * tests scan the actual source rather than trusting the design: every import must
 * resolve inside the skill tree, and no third-party package may be required.
 *
 * Node's standard library is a platform dependency, not a private file
 * dependency, so `node:*` imports are permitted.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BUDGETS } from '../lib/budgets.mjs';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.dirname(TESTS_DIR);

/**
 * Everything in the tree that is not a test is runtime code, so the scanned set is
 * derived from disk instead of listed.
 *
 * The list this replaces read `['lib', 'schemas']` while `scripts/` (3 modules) and
 * `protocols/runtime/` (11) shipped unscanned: a third-party import or an import
 * escaping the skill tree in either directory left the whole suite green. A
 * hand-maintained list of what to check is itself a declaration nobody validates —
 * it stops covering whatever directory was added last, silently.
 */
const NON_RUNTIME_DIRS = new Set(['tests']);

/** Directories expected to hold runtime code. Pins the scan against re-narrowing. */
const EXPECTED_RUNTIME_DIRS = ['lib', 'protocols/runtime', 'schemas', 'scripts'];

/** Kernel test files, identified by prefix so sibling suites are not scanned. */
const KERNEL_TEST_PREFIXES = ['kernel-', 'journal-', 'outcome-'];

const IMPORT_PATTERN = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function collectFiles(dir, extensions = ['.mjs', '.js']) {
  const found = [];
  if (!existsSync(dir)) return found;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      found.push(...collectFiles(full, extensions));
    } else if (extensions.includes(path.extname(name))) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Runtime modules: every shipping `.mjs`/`.js` in the tree except the tests.
 *
 * Walking the tree, rather than consulting a list of directories, is what makes a
 * newly added runtime directory covered on the day it appears instead of on the day
 * someone remembers to extend the list.
 */
function runtimeFiles() {
  const found = [];
  for (const name of readdirSync(SKILL_ROOT)) {
    const full = path.join(SKILL_ROOT, name);
    if (!statSync(full).isDirectory() || NON_RUNTIME_DIRS.has(name)) continue;
    found.push(...collectFiles(full));
  }
  return found;
}

/** Kernel tests and their fixtures. */
function kernelTestFiles() {
  return collectFiles(path.join(SKILL_ROOT, 'tests')).filter((filePath) => {
    const relative = path.relative(path.join(SKILL_ROOT, 'tests'), filePath);
    if (relative.startsWith('fixtures')) return true;
    return KERNEL_TEST_PREFIXES.some((prefix) => path.basename(filePath).startsWith(prefix));
  });
}

/** Everything this suite is responsible for. */
function kernelSourceFiles() {
  return [...runtimeFiles(), ...kernelTestFiles()];
}

function importsOf(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const specifiers = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    specifiers.push(match[1] ?? match[2] ?? match[3]);
  }
  return specifiers;
}

test('the kernel has source files to scan', () => {
  const files = kernelSourceFiles();
  assert.ok(files.length >= 10, `expected the kernel to have files, found ${files.length}`);
});

test('the cohesion scan reaches every directory that ships runtime code', () => {
  // A scan that quietly stops covering a directory is worse than no scan: every
  // assertion below keeps passing while the thing it guards goes unexamined. This
  // test is the one that fails if the walk is ever narrowed back to a subset, and
  // it also fails if a new runtime directory appears without being acknowledged
  // here — either way the omission surfaces as a red test rather than as silence.
  const scanned = new Set(
    runtimeFiles().map((filePath) => path.dirname(path.relative(SKILL_ROOT, filePath)).split(path.sep).join('/')),
  );

  for (const dir of EXPECTED_RUNTIME_DIRS) {
    assert.ok(scanned.has(dir), `${dir}/ ships runtime code but the cohesion scan does not reach it`);
  }
  assert.deepEqual(
    [...scanned].sort(),
    [...EXPECTED_RUNTIME_DIRS].sort(),
    'a runtime directory appeared or vanished — confirm it belongs, then update EXPECTED_RUNTIME_DIRS',
  );
});

test('every import is either node: builtin or a relative path (no third-party)', () => {
  const offenders = [];
  for (const filePath of kernelSourceFiles()) {
    for (const specifier of importsOf(filePath)) {
      const allowed = specifier.startsWith('node:') || specifier.startsWith('.');
      if (!allowed) {
        offenders.push(`${path.relative(SKILL_ROOT, filePath)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `third-party or bare imports found:\n${offenders.join('\n')}`);
});

test('no relative import escapes the skill directory tree (I10, A01)', () => {
  const offenders = [];
  for (const filePath of kernelSourceFiles()) {
    for (const specifier of importsOf(filePath)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(filePath), specifier);
      const relative = path.relative(SKILL_ROOT, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) {
        offenders.push(`${path.relative(SKILL_ROOT, filePath)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `imports escaping the skill tree:\n${offenders.join('\n')}`);
});

test('every relative import resolves to a file that exists', () => {
  const missing = [];
  for (const filePath of kernelSourceFiles()) {
    for (const specifier of importsOf(filePath)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.resolve(path.dirname(filePath), specifier);
      if (!existsSync(resolved)) {
        missing.push(`${path.relative(SKILL_ROOT, filePath)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(missing, [], `unresolvable imports:\n${missing.join('\n')}`);
});

test('the runtime references neither shared/, V1, nor other skills (A01)', () => {
  const forbidden = [
    { pattern: /\.\.\/\.\.\/shared\//, label: 'a shared/ directory outside the skill' },
    { pattern: /['"][^'"]*\/auto-goal\//, label: 'the V1 auto-goal directory' },
    { pattern: /skills\/(?!auto-goal-v2)[a-z-]+\//, label: 'another skill directory' },
    { pattern: /\bace\s+goal\b/, label: 'the ace goal CLI' },
  ];

  // Runtime modules only: this suite's own scanner necessarily contains the
  // forbidden strings as patterns, and matching them there proves nothing.
  const offenders = [];
  for (const filePath of runtimeFiles()) {
    const source = readFileSync(filePath, 'utf8');
    for (const { pattern, label } of forbidden) {
      if (pattern.test(source)) {
        offenders.push(`${path.relative(SKILL_ROOT, filePath)} references ${label}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('the kernel does not import the repository root package', () => {
  // The skill must work when copied out of this repository, so it cannot rely on
  // anything the root package.json installs.
  const offenders = [];
  for (const filePath of kernelSourceFiles()) {
    for (const specifier of importsOf(filePath)) {
      if (/^(fs-extra|chalk|ora|commander|inquirer|js-yaml|deepmerge|@clack)/.test(specifier)) {
        offenders.push(`${path.relative(SKILL_ROOT, filePath)} -> ${specifier}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `repository dependencies used:\n${offenders.join('\n')}`);
});

test('schema documents reference only sibling schema files', () => {
  const schemasDir = path.join(SKILL_ROOT, 'schemas');
  const offenders = [];

  for (const name of readdirSync(schemasDir).filter((file) => file.endsWith('.schema.json'))) {
    const source = readFileSync(path.join(schemasDir, name), 'utf8');
    for (const match of source.matchAll(/"\$ref"\s*:\s*"([^"]+)"/g)) {
      const [file] = match[1].split('#');
      if (file && !existsSync(path.join(schemasDir, file))) {
        offenders.push(`${name} -> ${match[1]}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `unresolvable schema $refs:\n${offenders.join('\n')}`);
});

test('the kernel loads with no module outside its own tree (A02)', async () => {
  // Importing every kernel module proves resolution works without the repository
  // node_modules being involved; a stray dependency would fail here.
  //
  // The list is derived from disk rather than written out: a hardcoded list
  // silently stops covering whatever module was added last, which is exactly
  // what happened before `lib/recovery.mjs` was added.
  const modules = runtimeFiles().map((filePath) => {
    const relative = path.relative(TESTS_DIR, filePath).split(path.sep).join('/');
    return relative.startsWith('.') ? relative : `./${relative}`;
  });
  assert.ok(modules.length >= 25, `expected the kernel's modules, found ${modules.length}`);

  for (const specifier of modules) {
    const loaded = await import(specifier);
    assert.ok(Object.keys(loaded).length > 0, `${specifier} exported nothing`);
  }
});

test('no runtime module writes to a path outside the task root', () => {
  // Every write goes through journal.mjs helpers that resolve against the task
  // root; a direct absolute-path write would bypass containment. Scanning all
  // runtime modules and not just lib/ matters because `scripts/` is the layer that
  // actually touches the filesystem on the dispatch path.
  const offenders = [];
  for (const filePath of runtimeFiles()) {
    const source = readFileSync(filePath, 'utf8');
    // Absolute POSIX or Windows literals in a write call are the smell.
    if (/write(?:File|FileSync)\(\s*['"][/\\]/.test(source) || /write(?:File|FileSync)\(\s*['"][A-Za-z]:/.test(source)) {
      offenders.push(path.relative(SKILL_ROOT, filePath));
    }
  }
  assert.deepEqual(offenders, [], `absolute-path writes found in:\n${offenders.join('\n')}`);
});

test('SKILL.md fits the budget it declares (BUDGETS.SKILL_MD)', () => {
  // SKILL.md is the one file loaded into the main model on every invocation, so
  // its budget is a context guarantee. Nothing at runtime can enforce it — the
  // host reads the file directly — which is exactly why it is asserted here
  // against real bytes on disk. Without this the declared limit is a comment
  // that drifts silently on the next edit.
  const bytes = statSync(path.join(SKILL_ROOT, 'SKILL.md')).size;
  assert.ok(
    bytes <= BUDGETS.SKILL_MD,
    `SKILL.md is ${bytes} bytes, over the declared ${BUDGETS.SKILL_MD} byte budget by ${bytes - BUDGETS.SKILL_MD}`,
  );
});
