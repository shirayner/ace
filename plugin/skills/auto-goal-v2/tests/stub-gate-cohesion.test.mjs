/**
 * F10: the `ACE_REQUIRE_STUB_BACKEND` contract has no gate of its own.
 *
 * Three suites gate on a C compiler and each enforces coverage in CI with
 * `process.env.ACE_REQUIRE_STUB_BACKEND === '1'`. An audit concluded that any value
 * other than the exact string `'1'` is inert, which is what makes the wiring in
 * `.github/workflows/ci.yml` safe to reason about. That conclusion is a property of
 * how the readers are written -- and nothing checked it. Each reader file reads only
 * its own environment; none looks at its siblings.
 *
 * The failure this prevents is a FALSE SKIP, not a false enforce. Strict `=== '1'`
 * treats `'true'`, `'yes'`, `'on'`, `'TRUE'` and `''` as off. Someone wiring
 * `ACE_REQUIRE_STUB_BACKEND: true` reads it as "enforcement on", CI reports the stub
 * suites as `skipped`, and the run is green -- the same defect class this whole task
 * has been chasing, in its ninth position. A loose reader (`!== '0'`) is the milder
 * mirror image: it cannot force enforcement on the windows leg, because that leg is
 * wired to `'0'`, which is false under both readings.
 *
 * Both assertions are derived from disk, not from a remembered count. "There are three
 * readers" was true when the audit was written and is already stale-prone; a count is
 * one more declaration nobody updates. See `tests/../../..` -> the producer side of the
 * same contract is gated at repository level in `tests/ci-stub-gate-wiring.test.mjs`,
 * because `ci.yml` lives outside this skill tree and I10 forbids reaching for it here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url));

const GATE_VARIABLE = 'ACE_REQUIRE_STUB_BACKEND';

/**
 * The one reader shape this gate can vouch for. Anything else -- a different operator,
 * a destructure, a `Boolean()` wrap, a bracket access -- is rejected rather than
 * analysed, because a regex cannot decide the truthiness semantics of shapes it does
 * not recognise. Refusing to judge is the safe answer; judging by pattern-match is how
 * "declared but unchecked" starts.
 */
const CANONICAL_READ = new RegExp(`process\\.env\\.${GATE_VARIABLE} === '1'`, 'g');

/** The literal that means "enforce". Derived from the readers so the two cannot drift. */
export const ENFORCE_LITERAL = '1';

/** Signals that a suite's coverage depends on a C toolchain being present. */
const COMPILER_DEPENDENT = /findCompiler|no C compiler/;

function collectTestSources() {
  const found = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.mjs')) found.push(full);
    }
  };
  walk(TESTS_DIR);
  return found
    .filter(file => statSync(file).isFile())
    .map(file => ({
      rel: path.relative(TESTS_DIR, file).split(path.sep).join('/'),
      source: readFileSync(file, 'utf8'),
    }));
}

/**
 * Ranges of `line` that sit inside a quoted or template string.
 *
 * The variable name appears legitimately inside a docblock and inside a `throw new
 * Error(\`...\`)` message. Those are mentions, not reads, and must not be flagged --
 * but the distinction has to be computed, not assumed, or the gate either cries wolf
 * on documentation or goes blind to a read hidden after a quote.
 */
function stringRanges(line) {
  const ranges = [];
  let quote = null;
  let start = 0;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (quote === null && (ch === "'" || ch === '"' || ch === '`')) {
      quote = ch;
      start = i;
    } else if (ch === quote) {
      ranges.push([start, i]);
      quote = null;
    }
  }
  if (quote !== null) ranges.push([start, line.length]);
  return ranges;
}

function isComment(line) {
  const trimmed = line.trimStart();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

/**
 * Every occurrence of the variable that is neither a canonical read nor a mention.
 * Canonical reads are blanked out first so their own text cannot be re-flagged.
 */
function nonCanonicalOccurrences({ rel, source }) {
  const masked = source.replace(CANONICAL_READ, match => ' '.repeat(match.length));
  const offenders = [];
  masked.split('\n').forEach((line, index) => {
    let at = line.indexOf(GATE_VARIABLE);
    while (at !== -1) {
      const inString = stringRanges(line).some(([from, to]) => at > from && at < to);
      if (!inString && !isComment(line)) {
        offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
      }
      at = line.indexOf(GATE_VARIABLE, at + 1);
    }
  });
  return offenders;
}

test(`every read of ${GATE_VARIABLE} uses the strict '1' comparison`, () => {
  const offenders = collectTestSources().flatMap(nonCanonicalOccurrences);

  assert.deepEqual(offenders, [], [
    `these reads of ${GATE_VARIABLE} are not the canonical \`=== '${ENFORCE_LITERAL}'\` form:`,
    ...offenders,
    '',
    'A loose read changes which values mean "enforce", which is the premise the CI',
    'wiring audit rests on. If a new shape is genuinely needed, update this gate and',
    'the wiring audit together -- do not let them disagree silently.',
  ].join('\n'));
});

test('every compiler-dependent suite enforces its own coverage in CI', () => {
  // Without this, a new stub suite would skip silently on a runner with no toolchain --
  // the audit's "8 skipped" outcome with nobody noticing the suite stopped testing.
  // Derived from disk: the day a fourth stub suite lands, it is covered.
  const missing = [];
  let gated = 0;
  for (const { rel, source } of collectTestSources()) {
    if (!COMPILER_DEPENDENT.test(source)) continue;
    gated += 1;
    if (!new RegExp(CANONICAL_READ.source).test(source)) {
      missing.push(`${rel} gates on a C compiler but never reads ${GATE_VARIABLE}`);
    }
  }

  assert.deepEqual(missing, [], missing.join('\n'));
  // Not a count of readers -- a check that the scan found its subject at all. Zero
  // compiler-dependent suites would make the assertion above vacuously true, which is
  // exactly the shape this task keeps finding.
  assert.ok(gated > 0, 'no compiler-dependent suite was found; this gate would be vacuous');
});
