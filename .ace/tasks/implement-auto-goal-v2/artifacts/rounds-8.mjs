// 8 full-suite rounds through the CANONICAL entry point, to prove #23's flake is gone.
//
// Two harness mistakes are baked out here, both of which produced a confident wrong reading:
//
//   1. `--run` uses `shell: true`, which is cmd.exe on this machine, so a `for i in 1 2 3` loop
//      exited instantly with 0 bytes on stdout. tree-snapshot's three-way verdict caught it
//      ("THERE IS NO READING HERE"); a two-way INTACT/VOID guard would have reported a still tree
//      over nothing at all.
//   2. `node --test <dir>` does not run this suite -- it reports the directory itself as one
//      failing test in 75 ms. The suite has an entry point (`scripts/run-tests.mjs`, what
//      `npm test` and CI call) and a round that does not use it measures nothing. Any harness
//      that reinvents the invocation is testing its own guess.
//
// So the counts are parsed from the reporter's actual output (`ℹ pass 494`, not `# pass`), and a
// round whose counts cannot be parsed is a FAILED round, never a silent `?`.
import { spawnSync } from 'node:child_process';

const ROUNDS = 8;
let reds = 0;

const count = (out, field) => new RegExp(`^[ℹ#]\\s*${field}\\s+(\\d+)\\s*$`, 'm').exec(out)?.[1];

for (let i = 1; i <= ROUNDS; i++) {
  const r = spawnSync(process.execPath, ['scripts/run-tests.mjs'], {
    encoding: 'utf8', maxBuffer: 1 << 28,
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const pass = count(out, 'pass');
  const fail = count(out, 'fail');

  // A round that exits nonzero OR whose counts are unreadable is RED. Treating an unparseable
  // round as `?` and moving on is how eight vacuous rounds came to print as a result earlier.
  const red = r.status !== 0 || fail === undefined || fail !== '0';
  if (red) {
    reds++;
    console.log(`ROUND ${i}: RED  exit=${r.status} pass=${pass ?? 'unparsed'} fail=${fail ?? 'unparsed'}`);
    const detail = out.split('\n')
      .filter((l) => /^not ok |✖ |raw_bytes|airborne|grace budget|AssertionError|Error:/.test(l))
      .slice(0, 25);
    for (const line of detail) console.log(`    ${line.trim()}`);
  } else {
    console.log(`ROUND ${i}: green  pass=${pass} fail=${fail}`);
  }
}

console.log(`\n${ROUNDS - reds}/${ROUNDS} rounds green`);
process.exit(reds ? 1 : 0);
