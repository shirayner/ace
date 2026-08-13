/**
 * Count the deadline-test red across FULL-suite runs.
 *
 * Why full-suite and not the isolated file: the isolated suite went 8/8 green and pure CPU
 * pressure went 6/6 green, yet the red appeared in a full-suite run. `node --test` runs many
 * files concurrently and several of them compile C stubs and spawn processes -- a different
 * load shape than a busy CPU, and the one under which the red was actually seen.
 *
 * Names WHICH assertion failed each round: pooling distinct failures under one count is how a
 * flake gets attributed to the wrong mechanism.
 *
 * The first version of that naming was itself the failure it warns about. Its fallback matcher
 * was `/✖ [^\n(]{6,90}/`, which on this platform matches Node's FILE-level summary line -- an
 * absolute path -- before any per-test line, and truncates it at 90 chars. A run of four reds
 * tallied as `4x ✖ D:\...\auto-go`: one bucket, no assertion named, and four different causes
 * would have looked identical. An aggregate that cannot be decomposed back into the individual
 * events is exactly what makes two mechanisms indistinguishable at the same ratio.
 *
 * So: skip the path-shaped summary lines, collect EVERY per-test `✖` plus the assertion text,
 * and dump each red round's full output to a file so the classifier is never the only record.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROUNDS = Number(process.env.PROBE_ROUNDS ?? 8);
const LOG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-fullsuite-reds-'));
let green = 0;
const reds = [];

/** Every named failure in one run, most specific first, never a file path. */
function classify(out) {
  if (out.includes('the late bytes must still be captured as evidence')) return ['ghost deadline: raw_bytes == 0 (late bytes never landed)'];
  if (/past the \d+ \+ \d+ ms ceiling/.test(out)) return ['ghost deadline: elapsed past the ceiling'];

  // Per-test lines only. A line whose text is a path is `node --test`'s file-level roll-up,
  // which names the file and not the failure; counting it hides which assertion broke.
  const named = [...out.matchAll(/^\s*✖ (.+?)(?: \([\d.]+ms\))?$/gm)]
    .map((m) => m[1].trim())
    .filter((name) => !/^[A-Za-z]:[\\/]/.test(name) && !name.includes('\\') && !name.includes('/'));
  if (named.length) return [...new Set(named)];

  // No per-test line at all means the process died before reporting -- a load failure, a
  // syntax error in a half-written file. Say that instead of inventing an assertion.
  const bail = out.match(/^(?:Error|SyntaxError|ReferenceError)[^\n]{0,120}/m);
  return [bail ? `run aborted before any test reported: ${bail[0]}` : 'unrecognised failure (full output saved)'];
}

for (let i = 1; i <= ROUNDS; i += 1) {
  try {
    execFileSync(process.execPath, ['scripts/run-tests.mjs'], { encoding: 'utf8' });
    green += 1;
    console.log(`full ${i}  GREEN`);
  } catch (error) {
    const out = String(error.stdout ?? '') + String(error.stderr ?? '');
    const logFile = path.join(LOG_DIR, `round-${i}.txt`);
    fs.writeFileSync(logFile, out);
    const names = classify(out);
    reds.push(...names);
    console.log(`full ${i}  RED    ${names.join(' | ')}`);
    console.log(`         full output: ${logFile}`);
  }
}

console.log(`\n---> full-suite: green ${green} / red ${ROUNDS - green} of ${ROUNDS}`);
const tally = {};
for (const r of reds) tally[r] = (tally[r] ?? 0) + 1;
for (const [which, n] of Object.entries(tally)) console.log(`     ${n}x  ${which}`);
if (reds.length) console.log(`\nred rounds saved under ${LOG_DIR}`);

