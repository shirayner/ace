/**
 * Per-function control audit: for each function that appears in a rejection
 * assertion (`assert.throws(() => fn(...))`, `assert.equal(fn(...), false)`,
 * `validateSchema(...).valid === false`), does ANY test in the same file also
 * assert its accept side? A whole group with no accept side would also pass
 * against an implementation that rejects unconditionally.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const TESTS = 'D:/Users/r.shi/work-space/incubator-mess/requirement-agent-skill/ace/plugin/skills/auto-goal-v2/tests';

const SKIP = new Set(['capability-live.test.mjs']);

for (const file of readdirSync(TESTS).filter((f) => f.endsWith('.test.mjs')).sort()) {
  if (SKIP.has(file)) continue;
  const text = readFileSync(join(TESTS, file), 'utf8');

  // Functions named inside a rejection assertion.
  const rejected = new Set();
  for (const m of text.matchAll(/assert\.(?:throws|rejects)\(\s*(?:async\s*)?\(\)\s*=>\s*([A-Za-z_$][\w$]*)\(/g)) rejected.add(m[1]);
  for (const m of text.matchAll(/assert\.equal\(\s*([A-Za-z_$][\w$]*)\([^;]*?,\s*false[,)]/gs)) rejected.add(m[1]);
  for (const m of text.matchAll(/assert\.equal\(\s*([A-Za-z_$][\w$]*)\([^;]*?\)\.valid,\s*false/gs)) rejected.add(m[1]);

  // Functions named in an accept assertion.
  const accepted = new Set();
  for (const m of text.matchAll(/assert\.doesNotThrow\(\s*(?:async\s*)?\(\)\s*=>\s*([A-Za-z_$][\w$]*)\(/g)) accepted.add(m[1]);
  for (const m of text.matchAll(/assert\.equal\(\s*([A-Za-z_$][\w$]*)\([^;]*?,\s*true[,)]/gs)) accepted.add(m[1]);
  for (const m of text.matchAll(/assert\.equal\(\s*([A-Za-z_$][\w$]*)\([^;]*?\)\.valid,\s*true/gs)) accepted.add(m[1]);
  // A bare successful call at statement level counts as an accept probe.
  for (const m of text.matchAll(/(?:const|let)\s+[\w{},:\s]+=\s*(?:await\s+)?([A-Za-z_$][\w$]*)\(/g)) accepted.add(m[1]);

  const uncontrolled = [...rejected].filter((fn) => !accepted.has(fn));
  if (uncontrolled.length > 0) console.log(`${file}: NO ACCEPT SIDE for -> ${uncontrolled.join(', ')}`);
}
