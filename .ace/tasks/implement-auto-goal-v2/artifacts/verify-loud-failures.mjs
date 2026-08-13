// Do the two changes have power, or are they unreachable code that only looks like a fix?
//
// Neither change is asserted by any test -- and that is the point of this harness. A loud stub
// and a retrying compile only matter WHEN THE FAILURE HAPPENS, and neither failure reproduces on
// demand (480 gcc compiles and 300 fopen rounds, zero failures). So the ordinary mutation
// question ("does the suite go red?") is the wrong one: there is nothing to make red. The right
// question is whether the new code, when the failure IS injected, produces the diagnosis it
// claims to. So the failures are injected artificially and the OUTPUT is read.
//
// F1: the stub cannot open its reply file. Before: empty stdout, empty stderr, exit 0 --
//     `cli_output_unparseable` over sha256(""). After: stderr names the path and errno, and the
//     dispatcher's `pickRawStream` promotes that text into the raw artifact. The claim under test
//     is the LAST part -- that the reason actually reaches the artifact a human reads -- because
//     that is the step I reasoned about rather than measured.
// F2: the compiler fails every time (a deliberately broken .c). The retry must NOT convert this
//     into a skip or a green: a broken fixture has to stay loud, and it must remain distinguishable
//     from the transient case. Checks the thrown text carries the compiler's diagnostics.
// F3: the compiler fails ONCE and then succeeds. The retry must absorb it and register all tests.
//     This is the transient case the census hit; without it, 22 tests vanish behind one anonymous
//     failure at <file>:1:1.
//
// F2/F3 use a wrapper `gcc` on PATH that fails a chosen number of times, so "transient" and
// "permanent" differ only in the injected count -- not in two separately-written scenarios.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, chmodSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dispatchWorker } from '../../../../plugin/skills/auto-goal-v2/scripts/dispatch-worker.mjs';

const BIN_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude';
const FIXTURES = 'plugin/skills/auto-goal-v2/tests/fixtures';
const SUITE = 'plugin/skills/auto-goal-v2/tests/dispatch-stream-completeness.test.mjs';
const trash = [];
const scratch = (p) => { const d = mkdtempSync(join(tmpdir(), p)); trash.push(d); return d; };
let failures = 0;
const verdict = (ok, label, detail) => {
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`);
};

// ---------------------------------------------------------------- F1: the loud stub
console.log('\n=== F1: a reply file that cannot be opened ===');
{
  const dir = scratch('mut-stub-');
  const bin = join(dir, BIN_NAME);
  spawnSync('gcc', ['-O0', '-o', bin, `${FIXTURES}/dispatch-pipeline-stub.c`], { stdio: 'pipe' });

  // A path that cannot be opened, with no directory to create it in -- the plainest possible
  // fopen failure, so the probe is about the REPORTING and not about racing a real file.
  const missing = join(scratch('mut-noent-'), 'no-such-subdir', 'reply.bin');
  const root = await mkdtemp(join(tmpdir(), 'mut-task-'));
  try {
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-mut-fopen',
      objective: 'trigger the unreadable reply file',
      env: { PATH: '', ACE_CLAUDE_BIN: bin, ACE_STUB_REPLY_FILE: missing },
    });
    const raw = readFileSync(join(root, audit.raw_artifact), 'utf8');
    console.log(`    exit_code=${audit.exit_code} raw_bytes=${audit.raw_bytes} status=${envelope.status}`);
    console.log(`    raw artifact: ${JSON.stringify(raw.slice(0, 200))}`);

    // The pre-fix observation was raw_bytes === 0 over sha256(""). Anything else means the
    // failure now leaves evidence.
    verdict(audit.raw_bytes > 0, 'the failure is no longer zero bytes', `raw_bytes=${audit.raw_bytes}`);
    verdict(/ACE_STUB_REPLY_FILE/.test(raw), 'the raw artifact names the failing variable');
    verdict(raw.includes('reply.bin'), 'the raw artifact names the path it could not open');
    verdict(/errno/.test(raw), 'the raw artifact carries errno, so the OS reason survives');
    verdict(audit.exit_code !== 0, 'the exit code marks a failure', `exit_code=${audit.exit_code}`);
    // Still a rejection: making the stub loud must not turn a broken run into a success.
    verdict(envelope.status === 'FAILED', 'the dispatch is still rejected, not accepted');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ------------------------------------------------- F2/F3: permanent vs transient compile failure
//
// A wrapper named `gcc` earlier on PATH than the real one. It counts its invocations in a file and
// fails while the count is below a threshold, so the same wrapper serves both arms.
//
// The wrapper must be a real .exe, NOT a .cmd shim. First attempt used `gcc.cmd`, and the baseline
// arm caught it: `invocations=0`, i.e. the shim was never run. `findCompiler` calls `execFileSync`
// without a shell, and on win32 that cannot execute a .cmd at all (verified: ENOENT). PATHEXT is a
// shell feature, not a CreateProcess one. So the shim was invisible, `findCompiler` fell through to
// the real gcc.exe, and all three arms were measuring an uninjected suite -- the F0 baseline exists
// precisely to refuse that result instead of reporting the two arms as if they had run.
//
// The .exe wrapper then broke pass-through for a second, unrelated reason, and F0 caught that too
// (every compile failed at fail_first=0). `gcc.exe` is a DRIVER: it locates cc1/as/ld relative to
// its own image as derived from argv[0]. Forwarding argv verbatim left argv[0] == "gcc", a bare
// name the driver re-resolves through PATH -- where the wrapper's own directory now sits first --
// so the real gcc computed its toolchain root as the wrapper's temp dir and died with
// `cannot execute 'cc1'`. Overwriting argv[0] with the real path fixes it; see
// probe-gcc-wrapper-argv0.mjs, which isolates that single line across two arms.
function compilerHarness(failFirstN) {
  const dir = scratch('mut-fakegcc-');
  const counter = join(dir, 'count');
  writeFileSync(counter, '0');
  const realGcc = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['gcc'], { encoding: 'utf8' })
    .stdout.trim().split(/\r?\n/)[0];

  if (process.platform === 'win32') {
    // Compiled with the real gcc, then placed ahead of it on PATH.
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

  /* --version must always succeed and must NOT be counted: it is findCompiler probing for a
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

  /* An NTSTATUS-shaped status with an EMPTY stderr: the exact census signature. */
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
      `[ "$1" = "--version" ] && exec "$MUT_REAL_GCC" --version`,
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
      PATH: `${dir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
      MUT_REAL_GCC: realGcc,
      MUT_COUNTER: counter,
      MUT_FAIL_FIRST: String(failFirstN),
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

// Baseline: the wrapper must be transparent when it never fails, or the two arms below measure
// the wrapper instead of the retry. `SUITE_CASES` is read from this same baseline rather than
// hard-coded, so the later arms compare against what the file actually contains.
console.log('\n=== F0: the injected compiler is transparent when it does not fail ===');
const baseline = runSuiteWith(0);
const SUITE_CASES = baseline.pass;
{
  console.log(`    invocations=${baseline.invocations} pass=${baseline.pass} fail=${baseline.fail} skipped=${baseline.skipped}`);
  verdict(baseline.invocations === 1, 'the wrapper IS on PATH and a succeeding compile runs once',
    `invocations=${baseline.invocations}`);
  verdict(baseline.fail === 0 && baseline.pass > 0, 'the full suite runs through the wrapper', `pass=${baseline.pass}`);
}

console.log('\n=== F3: ONE transient compile failure (the census case) ===');
{
  const r = runSuiteWith(1);
  console.log(`    invocations=${r.invocations} pass=${r.pass} fail=${r.fail} skipped=${r.skipped}`);
  verdict(r.invocations === 2, 'the failure was retried exactly once', `invocations=${r.invocations}`);
  verdict(r.fail === 0, 'a transient failure no longer reds the file', `fail=${r.fail}`);
  verdict(r.pass === SUITE_CASES, 'every case still registers -- none lost to an import-time death',
    `pass=${r.pass} vs baseline ${SUITE_CASES}`);
  verdict(r.skipped === 0, 'and they are not silently skipped instead', `skipped=${r.skipped}`);
}

console.log('\n=== F2: a PERMANENTLY failing compiler (a broken fixture) ===');
{
  const r = runSuiteWith(99);
  const named = /could not build/.test(r.out);
  const carriesStatus = /status=/.test(r.out);
  console.log(`    invocations=${r.invocations} pass=${r.pass} fail=${r.fail} skipped=${r.skipped} status=${r.status}`);
  verdict(r.invocations === 3, 'all attempts are used before giving up', `invocations=${r.invocations}`);
  verdict(r.status !== 0, 'a broken fixture stays RED -- it is not skipped into green');
  verdict(r.pass < SUITE_CASES, 'the cases do not report as passing', `pass=${r.pass}`);
  verdict(named, 'the error names the build failure');
  verdict(carriesStatus, 'the error carries the exit status, so transient and broken are separable');
}

// The temp dirs the retry creates must not pile up: a leak here would be a new defect.
console.log('\n=== F4: the retry leaves no orphaned stub dirs ===');
{
  const before = readdirSync(tmpdir()).filter((n) => n.startsWith('ace-ghost-stub-')).length;
  runSuiteWith(2);
  const after = readdirSync(tmpdir()).filter((n) => n.startsWith('ace-ghost-stub-')).length;
  console.log(`    ace-ghost-stub-* dirs before=${before} after=${after}`);
  verdict(after <= before, 'discarded attempts are cleaned up', `before=${before} after=${after}`);
}

for (const d of trash) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
