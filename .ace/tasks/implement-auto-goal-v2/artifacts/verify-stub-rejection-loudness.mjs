// Does `stub-backend-rejection.test.mjs` still go quiet when gcc refuses?
//
// That file used to fold two different facts into one skip: `catch -> skip: 'stub backend failed
// to compile: …'`. Reproduced on THIS machine, which has gcc -- 1 full-suite run in 12 skipped all
// 8 C05 cases and still printed `fail 0`, exit 0. So the failure DOES reproduce here, unlike the
// ghost-stub case, but only stochastically (~8%), which is too rare to use as an acceptance signal.
// It is injected instead, and the OUTPUT is read rather than the exit code alone.
//
// The arms differ only in how many times the injected compiler fails, so "transient" and
// "permanent" cannot differ by scenario:
//
//   F0 (fail 0)  baseline. The wrapper must be TRANSPARENT: proven executed (invocations > 0) and
//                the suite behaving as if uninjected. Without this arm, a wrapper that never runs
//                produces the same green as a working retry -- measured twice on the sibling
//                harness, once from .cmd being unexecutable by execFileSync and once from argv[0].
//   F3 (fail 1)  the transient case. The retry must absorb it: all cases register, none skipped.
//   F2 (fail 99) a broken fixture. Must stay RED and carry the compiler's status, never a skip.
//   F4 (fail 2)  the discarded attempts must not leak temp dirs.
//
// Expected case counts are read from the F0 baseline, never hard-coded: a literal would rot the
// day a case is added, and it is the comparison against the file's real content that matters.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SUITE = 'plugin/skills/auto-goal-v2/tests/stub-backend-rejection.test.mjs';
/** The prefix `buildStub` uses for each attempt's scratch dir, checked for leaks in F4. */
const STUB_DIR_PREFIX = 'ace-stub-backend-';
const IS_WIN = process.platform === 'win32';

const trash = [];
const scratch = (p) => { const d = mkdtempSync(join(tmpdir(), p)); trash.push(d); return d; };
let failures = 0;
const verdict = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`);
};

/**
 * A `gcc` that fails its first N compiles, placed ahead of the real one on PATH.
 *
 * Two win32-specific details, both learned by measurement on the sibling harness:
 *  - it must be a real `.exe`. `execFileSync` does not go through a shell, so a `.cmd` shim is
 *    simply not executable (ENOENT) and the injection silently does nothing.
 *  - `argv[0]` must be overwritten with the real absolute path. `gcc.exe` is a driver that locates
 *    cc1/as/ld relative to its own image; forwarding argv unchanged makes it re-resolve `gcc` via
 *    PATH, find the wrapper dir first, and die with `cannot execute 'cc1'`.
 */
function compilerHarness(failFirstN) {
  const dir = scratch('mut-stubgcc-');
  const counter = join(dir, 'count');
  writeFileSync(counter, '0');
  const realGcc = spawnSync(IS_WIN ? 'where' : 'which', ['gcc'], { encoding: 'utf8' })
    .stdout.trim().split(/\r?\n/)[0];
  if (!realGcc) throw new Error('no real gcc on PATH: this harness injects around one, it cannot replace it');

  if (IS_WIN) {
    const src = join(dir, 'wrapper.c');
    writeFileSync(src, `
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <process.h>

int main(int argc, char **argv) {
  const char *real = getenv("MUT_REAL_GCC");
  const char *counter = getenv("MUT_COUNTER");
  long fail_first = strtol(getenv("MUT_FAIL_FIRST"), NULL, 10);

  /* Without this the driver looks for cc1 next to the wrapper and cannot compile at all. */
  argv[0] = (char *)real;

  /* --version must always succeed and must NOT be counted: that is findCompiler probing for a
     compiler, not the compile under test. Counting it would shift every arm by one. */
  if (argc > 1 && strcmp(argv[1], "--version") == 0) {
    return (int)_spawnv(_P_WAIT, real, (const char * const *)argv);
  }

  long n = 0;
  FILE *f = fopen(counter, "r");
  if (f) { if (fscanf(f, "%ld", &n) != 1) n = 0; fclose(f); }
  n++;
  f = fopen(counter, "w");
  if (f) { fprintf(f, "%ld\\n", n); fclose(f); }

  /* An NTSTATUS-shaped status with an EMPTY stderr: the exact signature observed in the wild
     (0xC0000043), which is what the new code must tell apart from a compiler diagnostic.
     Its cause was not established — the two-suites-racing theory was measured and ruled out
     (120 concurrent builds into fresh dirs, 0 failures) — so the signature is injected here
     rather than provoked, and the retry is justified by the signature alone. */
  if (n <= fail_first) return -1073741757;

  int rc = (int)_spawnv(_P_WAIT, real, (const char * const *)argv);
  if (rc == -1) fprintf(stderr, "wrapper: cannot spawn %s: %s\\n", real, strerror(errno));
  return rc;
}
`);
    const exe = join(dir, 'gcc.exe');
    const built = spawnSync(realGcc, ['-O0', '-o', exe, src], { encoding: 'utf8' });
    if (built.status !== 0) throw new Error(`could not build the wrapper: ${built.stderr}`);
  } else {
    // `exec "$MUT_REAL_GCC"` already sets argv[0] to the real path, so POSIX needs no equivalent.
    const shim = join(dir, 'gcc');
    writeFileSync(shim, [
      '#!/bin/sh',
      '[ "$1" = "--version" ] && exec "$MUT_REAL_GCC" --version',
      'n=$(cat "$MUT_COUNTER"); n=$((n+1)); echo "$n" > "$MUT_COUNTER"',
      '[ "$n" -le "$MUT_FAIL_FIRST" ] && exit 3',
      'exec "$MUT_REAL_GCC" "$@"',
    ].join('\n'));
    chmodSync(shim, 0o755);
  }
  return { dir, counter, realGcc };
}

function runSuiteWith(failFirstN) {
  const { dir, counter, realGcc } = compilerHarness(failFirstN);
  const r = spawnSync(process.execPath, ['--test', SUITE], {
    encoding: 'utf8',
    maxBuffer: 1 << 28,
    env: {
      ...process.env,
      PATH: `${dir}${IS_WIN ? ';' : ':'}${process.env.PATH}`,
      MUT_REAL_GCC: realGcc,
      MUT_COUNTER: counter,
      MUT_FAIL_FIRST: String(failFirstN),
      // Left unset on purpose: this harness must prove the DEFAULT mode is loud. Enforcement
      // already fires on any skip, so setting it would hide whether the retry does anything.
      ACE_REQUIRE_STUB_BACKEND: '',
    },
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  return {
    out,
    status: r.status,
    invocations: Number(readFileSync(counter, 'utf8').trim()),
    pass: Number(/^[ℹ#]\s*pass\s+(\d+)\s*$/m.exec(out)?.[1] ?? -1),
    fail: Number(/^[ℹ#]\s*fail\s+(\d+)\s*$/m.exec(out)?.[1] ?? -1),
    skipped: Number(/^[ℹ#]\s*skipped\s+(\d+)\s*$/m.exec(out)?.[1] ?? -1),
  };
}

console.log('\n=== F0: the injected compiler is transparent when it does not fail ===');
const baseline = runSuiteWith(0);
const SUITE_CASES = baseline.pass;
{
  console.log(`    invocations=${baseline.invocations} pass=${baseline.pass} fail=${baseline.fail} skipped=${baseline.skipped}`);
  verdict(baseline.invocations === 1, 'the wrapper IS on PATH and a succeeding compile runs it exactly once',
    `invocations=${baseline.invocations}`);
  verdict(baseline.fail === 0 && baseline.pass > 0, 'the suite runs green through the wrapper', `pass=${baseline.pass} fail=${baseline.fail}`);
  verdict(baseline.skipped === 0, 'and nothing is skipped when the compiler works', `skipped=${baseline.skipped}`);
}

console.log('\n=== F3: ONE transient compile failure (the reproduced case) ===');
{
  const r = runSuiteWith(1);
  console.log(`    invocations=${r.invocations} pass=${r.pass} fail=${r.fail} skipped=${r.skipped}`);
  verdict(r.invocations === 2, 'the failure was retried exactly once', `invocations=${r.invocations}`);
  verdict(r.fail === 0, 'a transient refusal does not red the file', `fail=${r.fail}`);
  verdict(r.pass === SUITE_CASES, 'every C05 case still registers', `pass=${r.pass} vs baseline ${SUITE_CASES}`);
  verdict(r.skipped === 0, 'and none are silently skipped -- the defect this fixes', `skipped=${r.skipped}`);
}

console.log('\n=== F2: a PERMANENTLY failing compiler (a broken fixture) ===');
{
  const r = runSuiteWith(99);
  console.log(`    invocations=${r.invocations} pass=${r.pass} fail=${r.fail} skipped=${r.skipped} status=${r.status}`);
  verdict(r.invocations === 3, 'all attempts are used before giving up', `invocations=${r.invocations}`);
  verdict(r.status !== 0, 'a broken fixture stays RED instead of skipping into green', `status=${r.status}`);
  verdict(r.pass < SUITE_CASES, 'the cases do not report as passing', `pass=${r.pass}`);
  verdict(r.skipped !== SUITE_CASES, 'and they are not reported as skipped either', `skipped=${r.skipped}`);
  verdict(/could not build/.test(r.out), 'the error names the build failure');
  verdict(/status=/.test(r.out), 'the error carries the exit status, so transient and broken stay separable');
}

console.log('\n=== F4: the retry leaves no orphaned stub dirs ===');
{
  const before = readdirSync(tmpdir()).filter((n) => n.startsWith(STUB_DIR_PREFIX)).length;
  runSuiteWith(2);
  const after = readdirSync(tmpdir()).filter((n) => n.startsWith(STUB_DIR_PREFIX)).length;
  console.log(`    ${STUB_DIR_PREFIX}* dirs before=${before} after=${after}`);
  verdict(after <= before, 'discarded attempts are cleaned up', `before=${before} after=${after}`);
}

for (const d of trash) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
