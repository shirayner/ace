#!/usr/bin/env node
/**
 * Mutation verification for the F10 gates (reader side + producer side).
 *
 * Rules this harness obeys, all learned the hard way on this task:
 *   - Self-check that the file really changed. Byte-identical before/after means the
 *     mutation was a no-op and the run tested nothing -- verdict SURVIVED-VOID, never
 *     "killed" (D3 / no-op self-check).
 *   - Attribute the red. A red run only counts if the GATE'S OWN assertion produced it;
 *     otherwise the verdict is RED-OTHER-CAUSE and says nothing about the gate.
 *   - Include a reverse control. With the gate's assertion neutered, the same mutation
 *     must go GREEN. Without this, "red" might come from anywhere.
 *   - Run on a copy. The repository is never mutated.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');

const READER_GATE = 'plugin/skills/auto-goal-v2/tests/stub-gate-cohesion.test.mjs';
const WIRING_GATE = 'tests/ci-stub-gate-wiring.test.mjs';
const ARGV_READER = 'plugin/skills/auto-goal-v2/tests/dispatch-argv-integrity.test.mjs';
const CI_WORKFLOW = '.github/workflows/ci.yml';

/** Marker text proving a specific gate assertion fired, not merely that the run was red. */
const READER_MARKER = 'are not the canonical';
const COVERAGE_MARKER = 'gates on a C compiler but never reads';
const WIRING_MARKER = 'is not a literal the readers act on';
const MISSING_WIRING_MARKER = 'the CI enforcement wiring is gone';
const VACUOUS_MARKER = 'this gate would be vacuous';
const PARTNER_MARKER = 'the reader-side half of this contract is ungated';

function edit(root, rel, apply) {
  const file = path.join(root, rel);
  const before = readFileSync(file, 'utf8');
  const after = apply(before);
  writeFileSync(file, after);
  return before !== after;
}

const MUTATIONS = [
  {
    id: 'N1',
    what: `${ARGV_READER}: strict \`=== '1'\` -> loose \`!== '0'\``,
    expect: 'RED',
    marker: READER_MARKER,
    apply: root => edit(root, ARGV_READER, s =>
      s.replace("process.env.ACE_REQUIRE_STUB_BACKEND === '1'", "process.env.ACE_REQUIRE_STUB_BACKEND !== '0'")),
  },
  {
    id: 'N2',
    what: `${ARGV_READER}: strict comparison -> \`Boolean(env)\` wrap`,
    expect: 'RED',
    marker: READER_MARKER,
    apply: root => edit(root, ARGV_READER, s =>
      s.replace("process.env.ACE_REQUIRE_STUB_BACKEND === '1'", 'Boolean(process.env.ACE_REQUIRE_STUB_BACKEND)')),
  },
  {
    id: 'N3',
    what: 'a compiler-gated suite drops its enforcement switch entirely',
    expect: 'RED',
    marker: COVERAGE_MARKER,
    apply: root => edit(root, ARGV_READER, s =>
      s.replace(
        /if \(STUB_OPTIONS\.skip && process\.env\.ACE_REQUIRE_STUB_BACKEND === '1'\) \{[\s\S]*?\n\}/,
        'if (false) {\n  /* enforcement removed */\n}',
      )),
  },
  {
    id: 'N4',
    what: `${CI_WORKFLOW}: windows leg wired to \`'true'\` (reads as on, behaves as off)`,
    expect: 'RED',
    marker: WIRING_MARKER,
    apply: root => edit(root, CI_WORKFLOW, s => s.replace("&& '0' || '1'", "&& 'true' || '1'")),
  },
  {
    id: 'N5',
    what: `${CI_WORKFLOW}: enforcement value \`'1'\` -> \`'yes'\``,
    expect: 'RED',
    marker: WIRING_MARKER,
    apply: root => edit(root, CI_WORKFLOW, s => s.replace("&& '0' || '1'", "&& '0' || 'yes'")),
  },
  {
    id: 'N6',
    what: `${CI_WORKFLOW}: the whole assignment deleted (wiring silently gone)`,
    expect: 'RED',
    marker: MISSING_WIRING_MARKER,
    apply: root => edit(root, CI_WORKFLOW, s => s.replace(/^.*ACE_REQUIRE_STUB_BACKEND:.*$/m, '')),
  },
  {
    id: 'N7',
    what: 'the reader-side gate file is deleted (producer gate must notice)',
    expect: 'RED',
    marker: PARTNER_MARKER,
    apply: root => {
      rmSync(path.join(root, READER_GATE));
      return true;
    },
  },
  {
    id: 'N8-control',
    what: 'control: a comment appended to the reader gate',
    expect: 'GREEN',
    apply: root => edit(root, READER_GATE, s => `${s}\n// control mutation\n`),
  },
  {
    id: 'N9-noop',
    what: 'no-op self-check: apply() changes nothing',
    expect: 'RED',
    marker: READER_MARKER,
    apply: () => false,
  },
  {
    id: 'N10-reverse',
    what: 'reverse control: BOTH reader-gate assertions neutered, then N1 applied -- must go GREEN',
    expect: 'GREEN',
    apply: root => {
      // Both of the reader gate's assertions have to be disabled, not just the first.
      // The initial version neutered only the canonical-form check and came back
      // CONTROL-BROKEN, because N1 also removes the canonical read that the
      // coverage assertion looks for. "The gate" means every assertion in it; a
      // reverse control that leaves one live does not establish what it claims.
      const needles = [
        ['const offenders = collectTestSources().flatMap(nonCanonicalOccurrences);', 'const offenders = [];'],
        ['      missing.push(`${rel} gates on a C compiler but never reads ${GATE_VARIABLE}`);', '      void rel;'],
      ];
      for (const [needle, replacement] of needles) {
        const changed = edit(root, READER_GATE, s => s.replace(needle, replacement));
        if (!changed) throw new Error(`NO-OP: reader-gate needle not found verbatim: ${needle.slice(0, 48)}`);
      }
      edit(root, ARGV_READER, s =>
        s.replace("process.env.ACE_REQUIRE_STUB_BACKEND === '1'", "process.env.ACE_REQUIRE_STUB_BACKEND !== '0'"));
      return true;
    },
  },
];

function runGates(root) {
  const result = spawnSync(
    process.execPath,
    ['--test', WIRING_GATE, READER_GATE].filter(rel => rel),
    { cwd: root, encoding: 'utf8', env: { ...process.env, ACE_REQUIRE_STUB_BACKEND: '0' } },
  );
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function freshCopy() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ace-f10-mut-'));
  for (const rel of ['plugin', 'scripts', 'tests', '.github', 'package.json']) {
    try {
      cpSync(path.join(REPO_ROOT, rel), path.join(root, rel), { recursive: true });
    } catch { /* optional path */ }
  }
  return root;
}

/**
 * Directory fingerprint: proves the mutation actually altered the tree.
 *
 * Content hash, not size. A size-only fingerprint reported N1 (`=== '1'` -> `!== '0'`)
 * as SURVIVED-VOID because the two spellings are the same byte length -- the self-check
 * was itself blind to exactly the class of mutation most worth testing. Any
 * same-length edit would have been silently scored as "nothing changed".
 */
function fingerprint(root) {
  return execFileSync(process.execPath, ['-e', `
    const fs=require('fs'),p=require('path'),c=require('crypto');const out=[];
    (function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
      const f=p.join(d,e.name);if(e.isDirectory())w(f);
      else out.push(p.relative(process.argv[1],f)+' '+c.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0,16));}})(process.argv[1]);
    console.log(out.join('\\n'));
  `, root], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

const rows = [];
for (const mutation of MUTATIONS) {
  const root = freshCopy();
  let verdict;
  let detail = '';
  try {
    const before = fingerprint(root);
    let applyError = null;
    try {
      mutation.apply(root);
    } catch (error) {
      applyError = error.message;
    }
    const after = fingerprint(root);

    if (applyError) {
      verdict = 'SURVIVED-VOID';
      detail = `mutation could not be applied: ${applyError}`;
    } else if (before === after) {
      verdict = 'SURVIVED-VOID';
      detail = 'tree is byte-identical after the mutation; nothing was tested';
    } else {
      const { status, out } = runGates(root);
      const fired = mutation.marker ? out.includes(mutation.marker) : false;
      if (mutation.expect === 'GREEN') {
        verdict = status === 0 ? 'GREEN-AS-EXPECTED' : 'CONTROL-BROKEN';
        if (status !== 0) detail = out.split('\n').filter(l => l.startsWith('✖')).slice(0, 2).join(' | ');
      } else if (status === 0) {
        verdict = 'SURVIVED';
      } else if (fired) {
        verdict = 'KILLED-BY-GATE';
        detail = out.split('\n').find(l => l.includes(mutation.marker))?.trim().slice(0, 130) ?? '';
      } else {
        verdict = 'RED-OTHER-CAUSE';
        detail = out.split('\n').filter(l => l.startsWith('✖')).slice(0, 2).join(' | ');
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  rows.push({ ...mutation, verdict, detail });
  console.log(`${mutation.id.padEnd(12)} ${verdict.padEnd(18)} ${mutation.what}`);
  if (detail) console.log(`${' '.repeat(31)}${detail}`);
}

const bad = rows.filter(r =>
  (r.expect === 'RED' && r.verdict !== 'KILLED-BY-GATE') ||
  (r.expect === 'GREEN' && r.verdict !== 'GREEN-AS-EXPECTED'));

// N9 is expected to come back SURVIVED-VOID: it is the harness testing itself.
const realBad = bad.filter(r => !(r.id === 'N9-noop' && r.verdict === 'SURVIVED-VOID'));
console.log(realBad.length === 0
  ? '\nAll mutations attributable; no-op self-check behaved correctly.'
  : `\nUNEXPECTED: ${realBad.map(r => `${r.id}=${r.verdict}`).join(', ')}`);
