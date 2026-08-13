// Why the injected `gcc.exe` wrapper broke pass-through, and which line fixes it.
//
// The mutation harness needs a compiler it can make fail on demand. A `gcc.cmd` shim was
// invisible (execFileSync without a shell cannot run .cmd), so the wrapper became a real .exe
// that re-spawns the real gcc. With that, the baseline arm -- fail_first=0, i.e. the wrapper
// must be completely transparent -- still showed every compile FAILING (invocations=3, pass=0).
//
// Hypothesis: argv[0]. `gcc.exe` is a driver, not a compiler; it locates cc1/as/ld relative to
// its OWN image, derived from argv[0] via make_relative_prefix. The wrapper forwarded argv
// verbatim, so argv[0] was "gcc" -- a bare name the driver resolves through PATH, where the
// wrapper's own directory now sits FIRST. The real gcc therefore computed its toolchain root as
// the wrapper's temp dir, which has no lib/gcc, and could not execute its own backend.
//
// Two arms, differing in ONE line, so the diagnosis is attributable rather than argued:
//   A: argv[0] forwarded as-is ("gcc")     -- the suspected break
//   B: argv[0] replaced with the real path -- the proposed fix
// Each compiles a trivial .c through the wrapper with the wrapper's dir first on PATH.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const realGcc = spawnSync('where', ['gcc'], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0];
console.log(`real gcc: ${realGcc}\n`);

// `_spawnv` inherits the environment, so the wrapper needs no argument plumbing of its own.
const WRAPPER = (keepArgv0) => `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>
#include <process.h>

int main(int argc, char **argv) {
  const char *real = getenv("MUT_REAL_GCC");
  ${keepArgv0 ? '/* arm A: forward argv untouched */' : 'argv[0] = (char *)real; /* arm B: the fix */'}
  int rc = (int)_spawnv(_P_WAIT, real, (const char * const *)argv);
  if (rc == -1) fprintf(stderr, "wrapper: _spawnv failed: %s\\n", strerror(errno));
  return rc;
}
`;

for (const [label, keepArgv0] of [['A  argv[0]="gcc" (as invoked)', true], ['B  argv[0]=real gcc path', false]]) {
  const dir = mkdtempSync(join(tmpdir(), 'probe-argv0-'));
  const src = join(dir, 'wrapper.c');
  writeFileSync(src, WRAPPER(keepArgv0));
  const exe = join(dir, 'gcc.exe');
  const built = spawnSync(realGcc, ['-O0', '-o', exe, src], { encoding: 'utf8' });
  if (built.status !== 0) throw new Error(`wrapper build failed: ${built.stderr}`);

  const tsrc = join(dir, 't.c');
  writeFileSync(tsrc, 'int main(void){return 0;}\n');
  const r = spawnSync('gcc', ['-O0', '-o', join(dir, 't.exe'), tsrc], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${dir};${process.env.PATH}`, MUT_REAL_GCC: realGcc },
  });
  console.log(`=== arm ${label} ===`);
  console.log(`  status=${r.status} error=${r.error?.code ?? '-'}`);
  console.log(`  stderr=${JSON.stringify((r.stderr ?? '').slice(0, 300))}`);
  console.log(`  => the transparent wrapper ${r.status === 0 ? 'WORKS' : 'is BROKEN'}\n`);
  rmSync(dir, { recursive: true, force: true });
}
