#!/usr/bin/env node
/**
 * #20 -- find the real mechanism behind the low-frequency red on
 * `dispatch-argv-integrity.test.mjs:102`, the precondition
 * `precondition: the stub echoed its argv into the raw artifact`.
 *
 * READ THE ASSERTION FIRST (task requirement 2). `receivedArgv()` returns
 *   argv: raw ? JSON.parse(raw).argv_echo : null
 * so `argv === null` has exactly THREE causes, and a MID-STRING truncation is not one of them:
 *
 *   (a) `audit.raw_artifact` is falsy  -> the dispatcher never wrote a raw artifact,
 *       i.e. it returned on a `launched: false` path (no backend / bad inputs / budget).
 *   (b) the artifact exists but is EMPTY -> `raw` is `''`, which is FALSY, so the ternary
 *       takes the `null` branch and `JSON.parse` is never called. This is the shape a
 *       launched-but-silent child produces, and the only one "short stdout" can reach.
 *   (c) the artifact parsed but carries no `argv_echo` key -> the bytes are some other
 *       reply, i.e. not this stub's.
 *
 * A PARTIALLY truncated artifact cannot produce this red: `JSON.parse('{"resu')` throws a
 * SyntaxError and the test then fails with THAT error, not with `notEqual(argv, null)`. So
 * the task description's headline candidate -- stdout collected short -- only explains this
 * assertion in its ZERO-byte limit, i.e. (b); every intermediate amount of truncation
 * produces a visibly different red. `dispatch-worker.mjs:481` already reads on `'close'`
 * (#19), so the `'exit'`/`'close'` distinction is no longer available as the cause either.
 *
 * This probe therefore does not just count reds -- for every dispatch it records WHICH of
 * the three shapes occurred plus the whole audit object, so a reproduction names its cause
 * instead of contributing one more frequency.
 *
 * Usage:
 *   node argv-flake-probe.mjs pair   [rounds]   two suites, same process (the reported shape)
 *   node argv-flake-probe.mjs solo   [rounds]   argv suite alone (control)
 *   node argv-flake-probe.mjs direct [rounds]   dispatchWorker in-process, audit captured
 *   node argv-flake-probe.mjs load   [rounds] [width]
 *                                            `width` concurrent dispatches per round. The
 *                                            suite is run by `node --test`, which schedules
 *                                            one process PER FILE across all 16 cores; so
 *                                            the argv suite's four tests race the sibling
 *                                            suite's stub compilations and dispatches for
 *                                            CPU. If the red is contention-driven, its cause
 *                                            is load, and load is what a 24-round serial
 *                                            loop specifically fails to reproduce.
 *   node argv-flake-probe.mjs sensitivity      prove the red detector is not blind
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const SKILL = path.join(REPO_ROOT, 'plugin', 'skills', 'auto-goal-v2');
const ARGV_SUITE = path.join(SKILL, 'tests', 'dispatch-argv-integrity.test.mjs');
const STUB_SUITE = path.join(SKILL, 'tests', 'stub-backend-rejection.test.mjs');
const PIPELINE_SUITE = path.join(SKILL, 'tests', 'dispatch-pipeline.test.mjs');

const PRECONDITION = 'precondition: the stub echoed its argv into the raw artifact';

function stamp() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

/**
 * Run node --test over `files` once and report what happened to the precondition.
 *
 * `--test-reporter=tap` is forced, and that is not cosmetic: Node 24's DEFAULT reporter
 * prints `ℹ fail 1` and `✖ name`, so a detector written against `not ok` / `# fail` sees
 * nothing and reports every round green. This probe did exactly that on its first 20 rounds
 * -- 20 green readings from a detector that could not have printed a red. A frequency
 * produced by a blind detector is worse than no frequency, so `--sensitivity` below proves
 * detection on a synthetic red before any count here is worth reading.
 *
 * `stdout` is kept whole on a red round: a frequency without the failing output is
 * a number nobody can act on, and this red's diagnosis lives in the assertion text.
 */
function runSuites(files) {
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const fail = Number(/^# fail (\d+)$/m.exec(output)?.[1] ?? -1);
  return {
    status: result.status,
    fail,
    hitPrecondition: output.includes(PRECONDITION) && /^not ok /m.test(output),
    output,
  };
}

/**
 * Prove the detector can see the red it is hunting, on a fabricated instance of it.
 *
 * Without this the probe has the shape every false skip in this task had: nothing in the
 * output distinguishes "ran and found nothing" from "could not have found anything".
 */
function sensitivity() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ace-probe-sens-'));
  const file = path.join(dir, 'synthetic.test.mjs');
  writeFileSync(file, [
    "import assert from 'node:assert/strict';",
    "import test from 'node:test';",
    "test('synthetic instance of the red under investigation', () => {",
    `  assert.notEqual(null, null, ${JSON.stringify(PRECONDITION)});`,
    '});',
    '',
  ].join('\n'));
  try {
    const outcome = runSuites([file]);
    const ok = outcome.fail === 1 && outcome.hitPrecondition && outcome.status !== 0;
    console.log(`sensitivity ${stamp()}: fail=${outcome.fail} precondition=${outcome.hitPrecondition} status=${outcome.status} -> ${ok ? 'DETECTOR SENSITIVE' : 'DETECTOR BLIND'}`);
    return ok;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Compile the argv-echo stub into a private directory and hand back a dispatch function.
 *
 * The private `mkdtempSync` prefix is deliberate and is NOT an attempt to revive the
 * "shared stub binary" attribution -- that one is already three-times falsified. It is here
 * so this probe cannot itself become the contention it is measuring.
 */
async function stubHarness() {
  // A Windows absolute path is not a valid ESM specifier; it must be a file:// URL.
  const { dispatchWorker } = await import(pathToFileURL(path.join(SKILL, 'scripts', 'dispatch-worker.mjs')).href);
  const compiler = ['gcc', 'cc', 'clang'].find((candidate) => {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!compiler) throw new Error('no C compiler; this probe cannot run (and must not report green)');

  const stubDir = mkdtempSync(path.join(tmpdir(), 'ace-probe-stub-'));
  const stubBin = path.join(stubDir, process.platform === 'win32' ? 'claude.exe' : 'claude');
  execFileSync(compiler, ['-O0', '-o', stubBin, path.join(SKILL, 'tests', 'fixtures', 'argv-echo-stub.c')], { stdio: 'pipe' });
  if (!existsSync(stubBin)) throw new Error('compiler reported success but produced no binary');

  /**
   * One dispatch, reported as the SHAPE of its outcome rather than pass/fail.
   *
   * Shapes exist because "1 fail in 24 rounds" is where this task has been stuck; the
   * distinguishing question is which of the three null-producing paths ran.
   */
  const dispatchOnce = async (dispatchId) => {
    const root = await mkdtemp(path.join(tmpdir(), 'ace-probe-task-'));
    try {
      const { envelope, audit } = await dispatchWorker({
        taskRoot: root,
        dispatchId,
        objective: 'echo my argv',
        env: { PATH: '', ACE_CLAUDE_BIN: stubBin },
      });
      let argv = null;
      let parseError = null;
      let rawBytes = null;
      if (audit.raw_artifact) {
        const raw = await readFile(path.join(root, audit.raw_artifact), 'utf8');
        rawBytes = raw.length;
        // `''` is falsy, so the suite would take the null branch without parsing; mirror
        // that exactly instead of parsing here, or the probe measures a different program.
        if (raw) {
          try {
            argv = JSON.parse(raw).argv_echo ?? null;
          } catch (error) {
            parseError = String(error.message);
          }
        }
      }
      const shape = argv !== null
        ? 'OK'
        : !audit.raw_artifact
          ? `NO_ARTIFACT launched=${audit.launched} stage=${audit.rejected_stage ?? '-'} code=${envelope.code ?? '-'}`
          : rawBytes === 0
            ? `EMPTY_ARTIFACT exit=${audit.exit_code} timedOut=${audit.timed_out} received=${audit.raw_original_bytes}`
            : parseError
              ? `UNPARSEABLE bytes=${rawBytes} err=${parseError}`
              : `NO_ARGV_ECHO bytes=${rawBytes} exit=${audit.exit_code} timedOut=${audit.timed_out}`;
      return { shape, argv, audit, envelope };
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  };

  return { dispatchOnce, cleanup: () => rmSync(stubDir, { recursive: true, force: true }) };
}

/**
 * Compile a stub and spawn it IMMEDIATELY, once per round.
 *
 * The candidate mechanism this arm exists to test: the observed failure carries
 * `exit_code: 3221225539` = `0xC0000043` STATUS_SHARING_VIOLATION with zero bytes received.
 * That is Windows refusing to open the image because another handle on the file denies
 * sharing -- and the only processes that touch a just-written `claude.exe` are the linker
 * that produced it and the real-time AV scanner that wakes on its close. Both are racing the
 * FIRST spawn against that file, which is exactly where the suite's failing assertion sits
 * (the precondition of the first test, right after the module-load compile).
 *
 * `delayMs` is the falsifier: if the mechanism is "the image is still held shortly after it
 * is written", then waiting before the first spawn must lower the rate while everything else
 * stays equal. A mechanism that is not sensitive to the delay is not this mechanism.
 */
async function freshDispatch(rounds, width, delayMs) {
  const { dispatchWorker } = await import(pathToFileURL(path.join(SKILL, 'scripts', 'dispatch-worker.mjs')).href);
  const compiler = ['gcc', 'cc', 'clang'].find((candidate) => {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!compiler) throw new Error('no C compiler; this probe cannot run (and must not report green)');

  const shapes = new Map();
  let nulls = 0;
  let total = 0;
  for (let round = 1; round <= rounds; round++) {
    // Each concurrent worker compiles its OWN binary in its OWN directory: the point is the
    // age of the image at first spawn, not any sharing between the arms.
    const results = await Promise.all(Array.from({ length: width }, async (_, index) => {
      const dir = mkdtempSync(path.join(tmpdir(), 'ace-probe-fresh-'));
      const bin = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
      try {
        execFileSync(compiler, ['-O0', '-o', bin, path.join(SKILL, 'tests', 'fixtures', 'argv-echo-stub.c')], { stdio: 'pipe' });
      } catch (error) {
        // The compiler failing under concurrency is DATA, not a probe crash: `gcc` exiting
        // with the very same 0xC0000043 says the sharing violation is a property of writing
        // and then immediately touching an image on this filesystem, not of `dispatchWorker`.
        rmSync(dir, { recursive: true, force: true });
        return { shape: `COMPILE_FAILED status=${error.status} stderr=${JSON.stringify(String(error.stderr ?? '').slice(0, 120))}`, argv: undefined, audit: null };
      }
      if (delayMs > 0) await new Promise((resolve) => { setTimeout(resolve, delayMs); });
      const root = await mkdtemp(path.join(tmpdir(), 'ace-probe-task-'));
      try {
        const { audit } = await dispatchWorker({
          taskRoot: root,
          dispatchId: `d-fresh${round}-${index}`,
          objective: 'echo my argv',
          env: { PATH: '', ACE_CLAUDE_BIN: bin },
        });
        const raw = audit.raw_artifact ? await readFile(path.join(root, audit.raw_artifact), 'utf8') : '';
        const argv = raw ? (JSON.parse(raw).argv_echo ?? null) : null;
        const shape = argv !== null ? 'OK' : `NULL exit=${audit.exit_code} bytes=${audit.raw_bytes} timedOut=${audit.timed_out}`;
        return { shape, argv, audit };
      } finally {
        await rm(root, { recursive: true, force: true });
        rmSync(dir, { recursive: true, force: true });
      }
    }));
    for (const { shape, argv, audit } of results) {
      total++;
      if (argv === null) {
        nulls++;
        console.log(`  round ${round} ${stamp()} ${shape}`);
        console.log(`    audit=${JSON.stringify(audit)}`);
      }
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    }
  }
  reportShapes(`fresh(width=${width},delay=${delayMs}ms)`, shapes, nulls, total);
  return nulls;
}

/**
 * Rate-matched control for `load`: `width` concurrent dispatches against `width` DISTINCT
 * pre-compiled images.
 *
 * Why this arm has to exist. `load` (one shared image, width 12) produced nulls; `fresh`
 * (distinct images, width 12) produced none -- which looks like "sharing the image is the
 * cause" but is not a fair comparison: `fresh` compiles inside its timing loop, so it spawns
 * far fewer children per second. The arms differ in SPAWN RATE as well as in image sharing,
 * and spawn rate is itself a candidate (image-load failures are what Windows returns when
 * process-creation resources are short). Compiling up front removes that confound: this arm
 * and `load` differ in exactly one property.
 *
 * Note what this cannot decide on its own -- see the report. It bounds a rate; it does not
 * license "concurrent spawns of one image cause the red" unless the two arms actually differ.
 */
async function distinctDispatch(rounds, width) {
  const { dispatchWorker } = await import(pathToFileURL(path.join(SKILL, 'scripts', 'dispatch-worker.mjs')).href);
  const compiler = ['gcc', 'cc', 'clang'].find((candidate) => {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  });
  if (!compiler) throw new Error('no C compiler; this probe cannot run (and must not report green)');

  // All compilation happens here, before any timing begins.
  const bins = [];
  const dirs = [];
  for (let index = 0; index < width; index++) {
    const dir = mkdtempSync(path.join(tmpdir(), 'ace-probe-distinct-'));
    const bin = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
    execFileSync(compiler, ['-O0', '-o', bin, path.join(SKILL, 'tests', 'fixtures', 'argv-echo-stub.c')], { stdio: 'pipe' });
    dirs.push(dir);
    bins.push(bin);
  }

  const shapes = new Map();
  let nulls = 0;
  let total = 0;
  try {
    for (let round = 1; round <= rounds; round++) {
      const results = await Promise.all(bins.map(async (bin, index) => {
        const root = await mkdtemp(path.join(tmpdir(), 'ace-probe-task-'));
        try {
          const { audit } = await dispatchWorker({
            taskRoot: root,
            dispatchId: `d-dist${round}-${index}`,
            objective: 'echo my argv',
            env: { PATH: '', ACE_CLAUDE_BIN: bin },
          });
          const raw = audit.raw_artifact ? await readFile(path.join(root, audit.raw_artifact), 'utf8') : '';
          const argv = raw ? (JSON.parse(raw).argv_echo ?? null) : null;
          return { shape: argv !== null ? 'OK' : `NULL exit=${audit.exit_code} bytes=${audit.raw_bytes}`, argv, audit };
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }));
      for (const { shape, argv, audit } of results) {
        total++;
        if (argv === null) {
          nulls++;
          console.log(`  round ${round} ${stamp()} ${shape}`);
          console.log(`    audit=${JSON.stringify(audit)}`);
        }
        shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
      }
    }
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
  reportShapes(`distinct(width=${width})`, shapes, nulls, total);
  return nulls;
}

function reportShapes(label, shapes, nulls, total) {
  console.log(`\n${label}: ${total} dispatches, ${nulls} null argv, ended ${stamp()}`);
  for (const [shape, count] of [...shapes].sort((a, b) => b[1] - a[1])) console.log(`  ${count}x ${shape}`);
}

/** Serial dispatches: the low-contention control. */
async function directDispatch(rounds) {
  const { dispatchOnce, cleanup } = await stubHarness();
  const shapes = new Map();
  let nulls = 0;
  try {
    for (let round = 1; round <= rounds; round++) {
      const { shape, argv, audit } = await dispatchOnce(`d-probe${round}`);
      if (argv === null) {
        nulls++;
        console.log(`  round ${round} ${stamp()} NULL  ${shape}`);
        console.log(`    audit=${JSON.stringify(audit)}`);
      }
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    }
  } finally {
    cleanup();
  }
  reportShapes('direct', shapes, nulls, rounds);
  return nulls;
}

/**
 * `width` dispatches at once, `rounds` times: the high-contention arm.
 *
 * Real concurrency, not simulated: `dispatchWorker` is awaited in parallel, so `width` real
 * children compete for pipes and cores. This is the arm a serial loop cannot express -- and
 * a serial loop is what produced the "30 rounds 0 fail" reading this task is stuck behind.
 */
async function loadDispatch(rounds, width, staggerMs = 0) {
  const { dispatchOnce, cleanup } = await stubHarness();
  const shapes = new Map();
  let nulls = 0;
  let total = 0;
  try {
    for (let round = 1; round <= rounds; round++) {
      const results = await Promise.all(
        Array.from({ length: width }, async (_, index) => {
          // `staggerMs` spreads the spawns without changing the image they share, which is the
          // only way to tell "concurrent spawns of ONE image" apart from "many spawns per
          // second". The `distinct` arm runs 2.3x slower purely because 12 separate images
          // must each be paged in, so comparing it to `load` alone cannot separate the two.
          if (staggerMs > 0) await new Promise((resolve) => { setTimeout(resolve, index * staggerMs); });
          return dispatchOnce(`d-load${round}-${index}`);
        }),
      );
      for (const { shape, argv, audit } of results) {
        total++;
        if (argv === null) {
          nulls++;
          console.log(`  round ${round} ${stamp()} NULL  ${shape}`);
          console.log(`    audit=${JSON.stringify(audit)}`);
        }
        shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
      }
    }
  } finally {
    cleanup();
  }
  reportShapes(`load(width=${width},stagger=${staggerMs}ms)`, shapes, nulls, total);
  return nulls;
}

const mode = process.argv[2] ?? 'pair';
const rounds = Number(process.argv[3] ?? 20);

if (mode === 'sensitivity') {
  process.exit(sensitivity() ? 0 : 1);
}

if (mode === 'direct') {
  const nulls = await directDispatch(rounds);
  process.exit(nulls > 0 ? 1 : 0);
}

if (mode === 'load') {
  const nulls = await loadDispatch(rounds, Number(process.argv[4] ?? 8), Number(process.argv[5] ?? 0));
  process.exit(nulls > 0 ? 1 : 0);
}

if (mode === 'fresh') {
  const nulls = await freshDispatch(rounds, Number(process.argv[4] ?? 8), Number(process.argv[5] ?? 0));
  process.exit(nulls > 0 ? 1 : 0);
}

if (mode === 'distinct') {
  const nulls = await distinctDispatch(rounds, Number(process.argv[4] ?? 8));
  process.exit(nulls > 0 ? 1 : 0);
}

const files = mode === 'solo' ? [ARGV_SUITE]
  : mode === 'trio' ? [ARGV_SUITE, STUB_SUITE, PIPELINE_SUITE]
    : [ARGV_SUITE, STUB_SUITE];

// Counting modes are gated on detection: a zero from a detector that cannot see the red is
// the same failure as the false skips this task keeps finding, and it would be reported as
// evidence. Refuse to produce the number rather than produce an unfalsifiable one.
if (!sensitivity()) {
  console.error('the detector could not see a synthetic instance of the red; no count from this run is admissible');
  process.exit(2);
}

console.log(`${mode}: ${rounds} rounds over ${files.length} file(s), started ${stamp()}`);
let reds = 0;
let preconditionHits = 0;
for (let round = 1; round <= rounds; round++) {
  const outcome = runSuites(files);
  if (outcome.fail > 0 || outcome.status !== 0) {
    reds++;
    if (outcome.hitPrecondition) preconditionHits++;
    console.log(`  round ${round} ${stamp()} RED fail=${outcome.fail} status=${outcome.status} precondition=${outcome.hitPrecondition}`);
    // The whole output, because the next reader needs the failing assertion and its
    // diff, not the fact that a number was greater than zero.
    console.log(outcome.output.split('\n').filter((line) => /^(not ok|  ---|  \.\.\.|\s+(error|code|expected|actual|operator|stack):)/.test(line)).slice(0, 40).join('\n'));
  }
}
console.log(`${mode}: ${rounds} rounds, ${reds} red, ${preconditionHits} hit the argv precondition, ended ${stamp()}`);
process.exit(reds > 0 ? 1 : 0);
