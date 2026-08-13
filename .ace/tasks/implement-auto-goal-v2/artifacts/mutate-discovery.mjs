#!/usr/bin/env node
/**
 * Mutation harness for the discovery guard in scripts/run-tests.mjs.
 *
 * Every mutation runs on a %TEMP% copy of the repo; the repository itself is
 * never touched. Each mutation self-checks that the tree actually changed --
 * a mutation that did nothing must report SURVIVED-VOID, never "killed",
 * because "nothing changed and the suite stayed green" proves nothing at all.
 * (This is the second time an ineffective mutation nearly got read as evidence
 * that a constraint was being enforced.)
 */
import { cpSync, mkdtempSync, readFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = path.resolve(process.argv[2] ?? '.');
const RUNNER = 'scripts/run-tests.mjs';

const MUTATIONS = [
  {
    id: 'M1',
    what: "delete auto-goal-v2's tests/ directory entirely (the skill keeps its lib/ and scripts/)",
    expect: 'RED',
    // NOTE: this one is red for the OLD reason (files.length === 0), not because of
    // the new guard -- see M1b for the attributable version. Kept to document that
    // the two failure modes are distinct.
    apply: (root) => rmSync(path.join(root, 'plugin/skills/auto-goal-v2/tests'), { recursive: true, force: true }),
  },
  {
    id: 'M1b',
    what: "delete auto-goal-v2's tests/ but leave a decoy test elsewhere, so discovery is NOT empty",
    expect: 'RED',
    note: 'Isolates the guard from the pre-existing empty-discovery check.',
    apply: (root) => {
      rmSync(path.join(root, 'plugin/skills/auto-goal-v2/tests'), { recursive: true, force: true });
      const decoy = path.join(root, 'tests');
      mkdirSync(decoy, { recursive: true });
      writeFileSync(
        path.join(decoy, 'decoy.test.mjs'),
        "import test from 'node:test';\ntest('decoy passes', () => {});\n",
        'utf8',
      );
    },
  },
  {
    id: 'M2',
    what: 'rename one test file to a non-matching extension (.spec.mjs)',
    expect: 'RED',
    apply: (root) => {
      const dir = path.join(root, 'plugin/skills/auto-goal-v2/tests');
      renameSync(path.join(dir, 'kernel-ledger.test.mjs'), path.join(dir, 'kernel-ledger.spec.mjs'));
    },
  },
  {
    id: 'M3',
    what: 'rename one test file to _test.mjs (another common convention)',
    expect: 'RED',
    apply: (root) => {
      const dir = path.join(root, 'plugin/skills/auto-goal-v2/tests');
      renameSync(path.join(dir, 'kernel-budgets.test.mjs'), path.join(dir, 'kernel-budgets_test.mjs'));
    },
  },
  {
    id: 'M4',
    what: 'rename the whole tests/ directory to __tests__/ (outside the scanned surface)',
    expect: 'RED',
    // Also red via empty discovery; M4b makes it attributable.
    apply: (root) => {
      const base = path.join(root, 'plugin/skills/auto-goal-v2');
      renameSync(path.join(base, 'tests'), path.join(base, '__tests__'));
    },
  },
  {
    id: 'M4b',
    what: 'rename tests/ to __tests__/ AND add a decoy root test so discovery is not empty',
    expect: 'RED',
    note: 'The 22 relocated files still import node:test, so guard check 2 must name them.',
    apply: (root) => {
      const base = path.join(root, 'plugin/skills/auto-goal-v2');
      renameSync(path.join(base, 'tests'), path.join(base, '__tests__'));
      const decoy = path.join(root, 'tests');
      mkdirSync(decoy, { recursive: true });
      writeFileSync(
        path.join(decoy, 'decoy.test.mjs'),
        "import test from 'node:test';\ntest('decoy passes', () => {});\n",
        'utf8',
      );
    },
  },
  {
    id: 'M5',
    what: 'add a new skill that ships runtime code but no tests/',
    expect: 'RED',
    apply: (root) => {
      const dir = path.join(root, 'plugin/skills/brand-new-skill/lib');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'thing.mjs'), 'export const thing = 1;\n', 'utf8');
    },
  },
  {
    id: 'M6-control',
    what: 'CONTROL: touch nothing but a comment in the runner (must stay green)',
    expect: 'GREEN',
    apply: (root) => {
      const file = path.join(root, RUNNER);
      const before = readFileSync(file, 'utf8');
      writeFileSync(file, `${before}\n// mutation harness control comment\n`, 'utf8');
    },
  },
  {
    id: 'M7',
    what: 'REVERSE CONTROL: disable the guard, delete tests/, AND keep discovery non-empty via a decoy',
    expect: 'GREEN',
    note: 'Must go GREEN. If it does, M1b/M4b/M5 red comes from the guard and nothing else. '
      + 'If it went red anyway, those verdicts would be unattributable.',
    apply: (root) => {
      const file = path.join(root, RUNNER);
      const before = readFileSync(file, 'utf8');
      const needle = 'function discoveryShortfalls(discovered) {\n  const shortfalls = [];';
      const after = before.replace(needle, 'function discoveryShortfalls(discovered) {\n  const shortfalls = []; return shortfalls;');
      if (after === before) throw new Error('NO-OP: guard needle not found verbatim');
      writeFileSync(file, after, 'utf8');
      rmSync(path.join(root, 'plugin/skills/auto-goal-v2/tests'), { recursive: true, force: true });
      const decoy = path.join(root, 'tests');
      mkdirSync(decoy, { recursive: true });
      writeFileSync(
        path.join(decoy, 'decoy.test.mjs'),
        "import test from 'node:test';\ntest('decoy passes', () => {});\n",
        'utf8',
      );
    },
  },
];

function run(root) {
  const res = spawnSync(process.execPath, [RUNNER], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ACE_REQUIRE_STUB_BACKEND: '0' },
  });
  return { status: res.status, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

const results = [];
for (const mutation of MUTATIONS) {
  const work = mkdtempSync(path.join(tmpdir(), 'ace-discovery-'));
  const root = path.join(work, 'repo');
  cpSync(REPO, root, {
    recursive: true,
    filter: (src) => !src.includes('node_modules') && !src.includes(`${path.sep}.git${path.sep}`),
  });

  const before = fingerprintSafe(root);
  let applyError = null;
  try {
    mutation.apply(root);
  } catch (error) {
    applyError = error.message;
  }
  const after = fingerprintSafe(root);

  let verdict;
  let detail = '';
  if (applyError) {
    verdict = 'SURVIVED-VOID';
    detail = `mutation could not be applied: ${applyError}`;
  } else if (before === after) {
    verdict = 'SURVIVED-VOID';
    detail = 'tree is byte-identical after the mutation; nothing was tested';
  } else {
    const { status, out } = run(root);
    const guardFired = out.includes('Discovery guard failed');
    if (mutation.expect === 'GREEN') {
      verdict = status === 0 && !guardFired ? 'GREEN-AS-EXPECTED' : 'CONTROL-BROKEN';
    } else if (status === 0) {
      verdict = 'SURVIVED';
    } else if (guardFired) {
      verdict = 'KILLED-BY-GUARD';
    } else {
      // Red, but for the pre-existing empty-discovery check -- says nothing
      // about the new guard.
      verdict = 'RED-OTHER-CAUSE';
    }
    detail = `exit=${status} guardFired=${guardFired}`;
    const named = out.split('\n').filter(l => l.trim().startsWith('- ')).slice(0, 3);
    if (named.length) detail += ` | ${named.map(l => l.trim()).join(' ; ')}`;
  }

  results.push({ ...mutation, verdict, detail });
  console.log(`${mutation.id.padEnd(11)} ${verdict.padEnd(28)} ${detail}`);
  rmSync(work, { recursive: true, force: true });
}

function fingerprintSafe(root) {
  const res = spawnSync(process.execPath, ['-e', `
    const fs=require('fs'),path=require('path');
    const parts=[];
    const walk=(d)=>{ if(!fs.existsSync(d))return;
      for(const n of fs.readdirSync(d).sort()){
        if(n==='node_modules'||n==='.git')continue;
        const f=path.join(d,n), st=fs.statSync(f);
        if(st.isDirectory()){parts.push('D '+f);walk(f);} else parts.push('F '+f+' '+st.size);
      }};
    walk(path.join(${JSON.stringify(root)},'plugin'));
    walk(path.join(${JSON.stringify(root)},'scripts'));
    console.log(parts.sort().join('\\n'));
  `], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return res.stdout ?? '';
}

console.log('\n--- summary ---');
for (const r of results) console.log(`${r.id}: ${r.verdict} (expect ${r.expect}) -- ${r.what}`);
