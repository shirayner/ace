/**
 * The producer half of the `ACE_REQUIRE_STUB_BACKEND` contract.
 *
 * `plugin/skills/general/auto-goal-v2/tests/stub-gate-cohesion.test.mjs` pins the CONSUMER
 * side: every read is a strict `=== '1'`. That alone does not make the contract safe,
 * because it says nothing about what CI actually sends. A wiring of
 * `ACE_REQUIRE_STUB_BACKEND: true` satisfies every consumer assertion and still turns
 * enforcement off, reporting the stub suites as `skipped` on a green run.
 *
 * So both ends are gated: the readers must recognise the literal, and the workflow must
 * only ever send a literal the readers recognise. A contract checked at one end only is
 * the「声明了却无人校验」defect class with an extra step.
 *
 * This lives at repository level rather than inside the skill because `.github/` is
 * outside the skill tree, and invariant I10 forbids the skill's own suites from reaching
 * out of it. The dependency direction is the honest one: the repository may look at its
 * skills; a skill may not look at its repository.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOW_DIR = path.join(REPO_ROOT, '.github', 'workflows');
const GATE_VARIABLE = 'ACE_REQUIRE_STUB_BACKEND';

/**
 * Values the readers act on. `'1'` enforces; everything else is inert, so only values
 * a human would MISREAD as enforcement are dangerous. `'0'` is the deliberate off
 * switch and the only inert value allowed to appear -- it reads as off, and is off.
 */
const RECOGNISED_LITERALS = new Set(["'1'", "'0'", '1', '0', '"1"', '"0"']);

function workflowSources() {
  if (!existsSync(WORKFLOW_DIR)) return [];
  return readdirSync(WORKFLOW_DIR)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map(name => ({
      rel: `.github/workflows/${name}`,
      source: readFileSync(path.join(WORKFLOW_DIR, name), 'utf8'),
    }));
}

/**
 * The literals a `${{ }}` expression can actually EVALUATE TO, as opposed to every
 * literal it mentions.
 *
 * `${{ matrix.os == 'windows-latest' && '0' || '1' }}` mentions three strings, but
 * `'windows-latest'` is a comparison operand and can never be the result -- flagging it
 * would be a false positive that pressures the next reader to loosen the gate.
 * GitHub's `&&`/`||` return the operand rather than a boolean (the same semantics the
 * §3.5 audit established), so the candidate results are the operands of the top-level
 * `&&`/`||` chain, with any `==`/`!=`/`<`/`>` comparison dropped.
 *
 * Deliberately narrow: an expression shaped in a way this cannot decompose yields an
 * empty list and is reported as undeterminable, not passed. A gate that guesses at
 * shapes it does not understand is worse than one that admits it cannot tell.
 */
function evaluableLiterals(expression) {
  const inner = expression.replace(/^\$\{\{/, '').replace(/\}\}$/, '');
  return inner
    .split(/&&|\|\|/)
    .map(operand => operand.trim())
    .filter(operand => !/[=!<>]=?/.test(operand))
    .filter(operand => /^'[^']*'$|^"[^"]*"$/.test(operand));
}

test(`every workflow assignment of ${GATE_VARIABLE} sends a literal the readers recognise`, () => {
  const sources = workflowSources();
  assert.ok(sources.length > 0, 'no workflow files found; this gate would be vacuous');

  const offenders = [];
  let assignments = 0;

  for (const { rel, source } of sources) {
    // `\r` is stripped per line: the workflow files are CRLF here, and an `$`-anchored
    // match silently found nothing until this was fixed. A gate that quietly matches
    // zero lines is the vacuous-assertion shape, so the assignment count is checked below.
    source.split('\n').map(line => line.replace(/\r$/, '')).forEach((line, index) => {
      const match = line.match(new RegExp(`${GATE_VARIABLE}\\s*:\\s*(.+)$`));
      if (!match) return;
      assignments += 1;
      const value = match[1].trim();

      // A `${{ }}` expression can only be judged by the literals it can yield. A bare
      // value is judged directly. Anything else -- a variable reference, a function
      // call -- is unresolvable here and is reported rather than waved through.
      const literals = value.includes('${{') ? evaluableLiterals(value) : [value];
      if (literals.length === 0) {
        offenders.push(`${rel}:${index + 1}: cannot determine which literals this yields: ${value}`);
        return;
      }
      for (const literal of literals) {
        if (!RECOGNISED_LITERALS.has(literal)) {
          offenders.push(`${rel}:${index + 1}: ${literal} is not a literal the readers act on (in: ${value})`);
        }
      }
    });
  }

  assert.deepEqual(offenders, [], [
    `${GATE_VARIABLE} is read with a strict \`=== '1'\` comparison, so only '1' enforces.`,
    'These assignments send something else, which reads as "on" to a human and as "off"',
    'to the code -- the stub suites would report skipped on a green run:',
    ...offenders,
  ].join('\n'));

  assert.ok(assignments > 0, `no workflow assigns ${GATE_VARIABLE}; the CI enforcement wiring is gone`);
});

test('the consumer-side gate that this test partners with still exists', () => {
  // Two halves of one contract. If the consumer gate is deleted, this file alone would
  // keep passing while the premise it depends on ("readers are strict") goes unchecked --
  // a green light guarding nothing. Naming the partner makes that deletion visible.
  const partner = path.join(
    REPO_ROOT, 'plugin', 'skills', 'general', 'auto-goal-v2', 'tests', 'stub-gate-cohesion.test.mjs',
  );
  assert.ok(existsSync(partner), `${path.relative(REPO_ROOT, partner)} is missing: the reader-side half of this contract is ungated`);
});
