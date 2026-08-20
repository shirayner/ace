#!/usr/bin/env node
/**
 * Test runner for the whole repo: root `tests/` plus every `plugin/skills/<category>/<skill>/tests/`.
 *
 * Why a script instead of `node --test <dir>`: the two forms of `node --test`
 * that would cover these directories each fail on a Node version we support.
 * A directory positional is rejected from Node 22 on (positionals became globs),
 * and glob positionals are not understood by Node 18. Explicit file paths are
 * the only form every supported version accepts, so we discover them here.
 *
 * Discovering the files ourselves means discovery can shrink, and a suite that is
 * never discovered looks exactly like a suite that passed. Two structural guards
 * close that gap before the run starts (see `discoveryShortfalls`):
 *
 *   1. A skill that ships runtime code must have at least one discovered test.
 *   2. A file that imports `node:test` must be discoverable.
 *
 * Both are derived from the tree, so a new skill is covered the day it lands.
 * Neither is a remembered count -- a numeric floor would be one more declaration
 * nobody updates. The run also prints what it found and the values of the
 * `ACE_*` variables the suites gate on, so a CI log states those facts instead
 * of leaving them to be inferred.
 *
 * Usage:
 *   node scripts/run-tests.mjs               # all discovered test files
 *   node scripts/run-tests.mjs auto-goal-v2  # only paths containing a filter
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_FILE_PATTERN = /\.test\.(mjs|cjs|js)$/;
const CODE_FILE_PATTERN = /\.(mjs|cjs|js)$/;
/** A file that pulls in the test runner is claiming to be a test. */
const TEST_IMPORT_PATTERN = /['"]node:test['"]/;
/** Env values that must never be echoed even when the name is worth reporting. */
const SECRET_NAME_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i;

/** Directories that hold test files: root tests/ and each skill's tests/. */
function testRoots() {
  const roots = [path.join(REPO_ROOT, 'tests')];
  for (const skill of skillDirs()) roots.push(path.join(skill, 'tests'));
  return roots.filter(isDirectory);
}

/**
 * Absolute paths of every skill directory.
 *
 * Skills live at `plugin/skills/<category>/<skill>/`, so the walk goes two levels
 * deep and keeps only directories that actually carry a SKILL.md. Deriving the set
 * from that marker rather than from depth alone means a category directory holding
 * shared assets never gets mistaken for a skill.
 */
function skillDirs() {
  const skillsDir = path.join(REPO_ROOT, 'plugin', 'skills');
  const found = [];
  for (const category of readDirNames(skillsDir)) {
    for (const skill of readDirNames(path.join(skillsDir, category))) {
      const dir = path.join(skillsDir, category, skill);
      if (fs.existsSync(path.join(dir, 'SKILL.md'))) found.push(dir);
    }
  }
  return found;
}

function readDirNames(dir) {
  if (!isDirectory(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name);
}

function isDirectory(target) {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

/** Collect test files under `dir`, recursively, sorted for a stable run order. */
function collectTestFiles(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectTestFiles(full));
    } else if (TEST_FILE_PATTERN.test(entry.name)) {
      found.push(full);
    }
  }
  return found.sort();
}

function toRepoPath(file) {
  return path.relative(REPO_ROOT, file).split(path.sep).join('/');
}

/** Every `.mjs`/`.cjs`/`.js` file under `dir`, recursively. */
function collectCodeFiles(dir) {
  const found = [];
  if (!isDirectory(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...collectCodeFiles(full));
    else if (CODE_FILE_PATTERN.test(entry.name)) found.push(full);
  }
  return found;
}

/** Skills that ship executable code, and therefore owe the runner a test suite. */
function skillsWithRuntimeCode() {
  return skillDirs().filter(dir => {
    const testsPrefix = `${toRepoPath(path.join(dir, 'tests'))}/`;
    return collectCodeFiles(dir)
      .some(file => !toRepoPath(file).startsWith(testsPrefix));
  });
}

/**
 * Reasons the discovered set is smaller than the tree says it should be.
 *
 * Both checks are derived from the tree rather than from a remembered number.
 * A floor like `files.length >= 21` would be one more hand-maintained
 * declaration: it goes stale the moment a skill is added, and nobody who adds
 * one remembers to raise it. These two go the other way -- a new skill with code
 * is required to have tests the day it lands, and a test file that stops being
 * discoverable is named out loud instead of silently dropping out of the run.
 */
function discoveryShortfalls(discovered) {
  const shortfalls = [];

  // 1. Code without a suite. This is what makes "a skill's tests/ vanished"
  //    fail instead of quietly reporting one fewer file.
  for (const skill of skillsWithRuntimeCode()) {
    const prefix = `${toRepoPath(path.join(skill, 'tests'))}/`;
    if (!discovered.some(file => file.startsWith(prefix))) {
      shortfalls.push(
        `${toRepoPath(skill)}/ ships runtime code but no test file was discovered under ${prefix}`,
      );
    }
  }

  // 2. A file that imports node:test but does not match TEST_FILE_PATTERN. This
  //    is what makes a renamed extension (`.spec.mjs`, `_test.mjs`) fail rather
  //    than silently leave the run.
  const discoveredSet = new Set(discovered);
  for (const dir of searchRoots()) {
    for (const file of collectCodeFiles(dir)) {
      const rel = toRepoPath(file);
      if (discoveredSet.has(rel)) continue;
      if (!TEST_IMPORT_PATTERN.test(fs.readFileSync(file, 'utf8'))) continue;
      shortfalls.push(`${rel} imports node:test but is not discoverable (needs a .test.mjs/.cjs/.js name under a tests/ directory)`);
    }
  }

  return shortfalls;
}

/** Where an undiscoverable test could plausibly hide: alongside the code it tests. */
function searchRoots() {
  return [path.join(REPO_ROOT, 'tests'), ...skillDirs()].filter(isDirectory);
}

/**
 * Print the facts a CI log otherwise forces a human to infer: what was found,
 * and the values of the variables that decide whether suites skip or enforce.
 */
function reportEnvironment(discovered, files) {
  const gateNames = collectGateNames(discovered);
  console.log(`Node ${process.version} on ${process.platform}/${process.arch}`);
  console.log(`Discovered ${discovered.length} test file(s); running ${files.length}`);
  for (const file of files) console.log(`  ${file}`);
  console.log('Test-gating environment:');
  for (const name of gateNames) {
    const raw = process.env[name];
    const shown = SECRET_NAME_PATTERN.test(name)
      ? (raw === undefined ? '<unset>' : '<redacted>')
      : (raw === undefined ? '<unset>' : JSON.stringify(raw));
    console.log(`  ${name}=${shown}`);
  }
  console.log('');
}

/** The ACE_* variables the suites themselves read, harvested from their source. */
function collectGateNames(discovered) {
  const names = new Set();
  for (const rel of discovered) {
    const source = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    for (const match of source.matchAll(/process\.env\.(ACE_[A-Z0-9_]+)/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

const filters = process.argv.slice(2);
const discovered = testRoots().flatMap(collectTestFiles).map(toRepoPath);
const files = discovered
  .filter(file => filters.length === 0 || filters.some(f => file.includes(f)));

// State the facts first, so even a run that dies below leaves them in the log.
reportEnvironment(discovered, files);

// Checked against the tree rather than a remembered count, and checked before the
// run so a shrunken surface cannot hide behind a green TAP. This comes before the
// empty-discovery check below because it explains WHY discovery came up short --
// "auto-goal-v2 ships code but has no tests" is actionable where "no test files
// found" only says the obvious.
const shortfalls = discoveryShortfalls(discovered);
if (shortfalls.length > 0) {
  console.error('Discovery guard failed - some tests would not have run:');
  for (const shortfall of shortfalls) console.error(`  - ${shortfall}`);
  console.error('\nA test that is never discovered is indistinguishable from a passing one.');
  process.exit(1);
}

if (files.length === 0) {
  const scope = filters.length > 0 ? ` matching ${filters.join(', ')}` : '';
  console.error(`No test files${scope} found under tests/ or plugin/skills/*/*/tests/.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
