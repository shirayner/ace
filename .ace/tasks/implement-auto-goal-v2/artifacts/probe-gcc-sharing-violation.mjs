// Why did gcc exit 0xC0000043 (STATUS_SHARING_VIOLATION) with an EMPTY stderr?
//
// An empty stderr is the whole clue. A gcc that ran and disliked the source writes a diagnostic;
// this one wrote nothing and returned an NTSTATUS, so the failure is in process/file creation,
// not in compilation. Four suites each compile a stub at IMPORT time, and `node --test` imports
// them in parallel workers -- so the status quo is four concurrent gcc invocations. Each writes
// its -o into its own mkdtemp, so the OUTPUT paths cannot collide; but gcc's intermediate files
// (ccXXXXXX.s, ccXXXXXX.o) go to %TEMP%, which all four share.
//
// Three arms, so "concurrency" and "shared %TEMP%" are separated instead of conflated:
//   A: 4 concurrent, shared %TEMP%      -- reproduces the suite's conditions
//   B: 4 concurrent, per-compile %TEMP% -- same concurrency, no shared scratch space
//   C: 1 at a time,  shared %TEMP%      -- same scratch space, no concurrency
// If the fault is shared scratch, A and C differ from B. If it is concurrency as such, A and B
// are alike and C is clean. If nothing reproduces, the cause is outside this model and I say so
// rather than shipping a fix aimed at a mechanism I never demonstrated.
//
// Caveat recorded up front: the n=75 post-fix census is running while this probe runs, so the
// machine is loaded above baseline. That makes rates here NOT comparable to the census's rates.
// This probe is for the MECHANISM (which arm fails, on what file); the rate is a by-product.
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROUNDS = Number(process.argv[2] ?? 40);
const HERE = 'plugin/skills/auto-goal-v2/tests/fixtures';
const BIN_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude';

// The exact four sources the four suites compile, so the probe's load is the suite's load.
const SOURCES = [
  `${HERE}/dispatch-ghost-stub.c`,
  `${HERE}/dispatch-pipeline-stub.c`,
  `${HERE}/argv-echo-stub.c`,
  `${HERE}/stub-backend.c`,
];

const trash = [];
const scratch = (prefix) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  trash.push(d);
  return d;
};

/** One compile, resolving to a record instead of throwing, so a failure is data. */
function compile(source, { isolateTemp }) {
  const outDir = scratch('gcc-probe-out-');
  const out = join(outDir, BIN_NAME);
  const env = { ...process.env };
  if (isolateTemp) {
    const t = scratch('gcc-probe-tmp-');
    env.TMP = t;
    env.TEMP = t;
    env.TMPDIR = t;
  }
  return new Promise((res) => {
    execFile('gcc', ['-O0', '-o', out, source], { env, encoding: 'utf8' }, (error, stdout, stderr) => {
      res({
        source: source.split('/').pop(),
        ok: !error,
        // `code` is the process exit status; an NTSTATUS here is the signature we are chasing.
        code: error?.code ?? 0,
        hex: typeof error?.code === 'number' ? `0x${(error.code >>> 0).toString(16).toUpperCase()}` : null,
        stderr: (stderr ?? '').trim().slice(0, 300),
        stdout: (stdout ?? '').trim().slice(0, 200),
      });
    });
  });
}

const ARMS = [
  { key: 'A_concurrent_sharedTemp', run: () => Promise.all(SOURCES.map((s) => compile(s, { isolateTemp: false }))) },
  { key: 'B_concurrent_isolatedTemp', run: () => Promise.all(SOURCES.map((s) => compile(s, { isolateTemp: true }))) },
  {
    key: 'C_serial_sharedTemp',
    run: async () => {
      const out = [];
      for (const s of SOURCES) out.push(await compile(s, { isolateTemp: false }));
      return out;
    },
  },
];

const tally = new Map(ARMS.map((a) => [a.key, { compiles: 0, failures: [], sharing: 0, emptyStderr: 0 }]));

for (let round = 1; round <= ROUNDS; round++) {
  for (const arm of ARMS) {
    const results = await arm.run();
    const t = tally.get(arm.key);
    t.compiles += results.length;
    for (const r of results.filter((x) => !x.ok)) {
      t.failures.push({ round, ...r });
      // 0xC0000043 is the exact status the census caught. Counted separately from "any failure"
      // so a different failure mode cannot be read as a reproduction of this one.
      if ((r.code >>> 0) === 0xc0000043) t.sharing++;
      if (r.stderr === '') t.emptyStderr++;
      console.log(`round ${round} ${arm.key}: FAIL ${r.source} code=${r.code} (${r.hex}) stderr=${JSON.stringify(r.stderr)}`);
    }
  }
  if (round % 10 === 0) console.log(`-- ${round}/${ROUNDS} rounds done`);
}

console.log(`\n=== gcc failure census, ${ROUNDS} rounds x 4 compiles per arm ===`);
for (const [key, t] of tally) {
  const rate = t.failures.length / t.compiles;
  console.log(`${key}: ${t.failures.length}/${t.compiles} compiles failed (${(100 * rate).toFixed(2)}%)`
    + `; ${t.sharing} were 0xC0000043; ${t.emptyStderr} had empty stderr`);
  if (rate > 0) {
    console.log(`    n for 95% detection at this per-compile rate: ${Math.ceil(Math.log(0.05) / Math.log(1 - rate))}`);
  }
}

const A = tally.get('A_concurrent_sharedTemp');
const B = tally.get('B_concurrent_isolatedTemp');
const C = tally.get('C_serial_sharedTemp');
console.log('\n=== reading ===');
if (A.failures.length === 0 && B.failures.length === 0 && C.failures.length === 0) {
  console.log('NOTHING REPRODUCED. The concurrency+shared-%TEMP% model does not explain the census red;');
  console.log('do not ship a fix aimed at it. Next suspects: on-access AV scanning of the fresh .exe,');
  console.log('or the census loop itself competing for %TEMP% with 25 parallel test workers.');
} else {
  console.log(`A(concurrent,shared)=${A.failures.length}  B(concurrent,isolated)=${B.failures.length}  C(serial,shared)=${C.failures.length}`);
  if (A.failures.length > 0 && B.failures.length === 0) console.log('-> shared %TEMP% is implicated; per-compile TMP is the candidate fix.');
  if (A.failures.length > 0 && C.failures.length > 0) console.log('-> failures survive serialization; concurrency is NOT the whole story.');
  if (A.failures.length > 0 && B.failures.length > 0) console.log('-> isolating %TEMP% did not help; the fault is not the shared scratch dir.');
}

for (const d of trash) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
