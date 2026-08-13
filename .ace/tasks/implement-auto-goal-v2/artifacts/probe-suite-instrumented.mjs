/**
 * The suite and my hand-rolled probe disagree about the same parameters: the suite's deadline
 * test passes `assert.ok(audit.raw_bytes > 0)` 10/10 alone, while a direct `dispatchWorker` call
 * at what I believed were identical settings (timeoutMs=150, ACE_GHOST_DELAY_MS=450, 512 KiB)
 * observed `raw_bytes == 0` 10/10.
 *
 * Picking a winner by argument would be guessing. Instead instrument the REAL suite: copy it to
 * tmpdir, rewrite its relative imports to absolute ones so the copy still loads the real product
 * code and the real fixture, and print `raw_bytes` from inside the actual test body. The repo is
 * not modified.
 *
 * If the instrumented suite reports raw_bytes > 0 where my probe reported 0, my probe differs
 * from it in some parameter I have not noticed, and the difference is the finding.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SKILL = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'plugin', 'skills', 'auto-goal-v2');
const TESTS = path.join(SKILL, 'tests');
const posix = (p) => p.replace(/\\/g, '/');

const source = fs.readFileSync(path.join(TESTS, 'dispatch-stream-completeness.test.mjs'), 'utf8');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-suite-instr-'));

let instrumented = source
  // `../scripts/...` etc. resolve against the copy's location, so make them absolute.
  .replace(/from '(\.\.\/[^']+)'/g, (_m, rel) => `from 'file://${posix(path.join(TESTS, rel))}'`)
  // HERE would point at tmpdir; the fixture lives in the repo.
  .replace(/join\(HERE, 'fixtures'/g, `join('${posix(TESTS)}', 'fixtures'`);

const ASSERTION = "assert.ok(audit.raw_bytes > 0, 'the late bytes must still be captured as evidence');";
if (!instrumented.includes(ASSERTION)) {
  throw new Error('the assertion under investigation is no longer present verbatim; re-read the suite before trusting this probe');
}
instrumented = instrumented.replace(
  ASSERTION,
  `console.log('    [instr] raw_bytes=' + audit.raw_bytes + '  timed_out=' + audit.timed_out + '  elapsed=' + (Date.now() - started) + 'ms');\n    ${ASSERTION}`,
);

const copy = path.join(dir, 'instr.test.mjs');
fs.writeFileSync(copy, instrumented);
console.log(`instrumented copy: ${copy}\n`);

const ROUNDS = Number(process.env.PROBE_ROUNDS ?? 6);
for (let i = 1; i <= ROUNDS; i += 1) {
  try {
    const out = execFileSync(process.execPath, ['--test', '--test-name-pattern', 'a deadline still settles', copy], {
      encoding: 'utf8',
      env: { ...process.env, ACE_REQUIRE_STUB_BACKEND: '1' },
    });
    console.log(`run ${i}  GREEN  ${(out.match(/\[instr\][^\n]*/) ?? ['(no instrumentation line)'])[0]}`);
  } catch (error) {
    const out = String(error.stdout ?? '');
    console.log(`run ${i}  RED    ${(out.match(/\[instr\][^\n]*/) ?? ['(no instrumentation line)'])[0]}`);
  }
}
