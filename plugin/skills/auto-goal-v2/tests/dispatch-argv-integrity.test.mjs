/**
 * Does `dispatchWorker` really spawn without a shell?
 *
 * `shell: false` is the one dispatch property that cannot be observed from the dispatcher's
 * own return value. A shell joins the argv array into a single command line and the child
 * re-splits it, so the argument boundaries the parent built are destroyed — but the parent
 * sees the same envelope either way. Only the child can report what it actually received.
 *
 * Measured difference on this platform (probe, before this test existed), for the real fixed
 * argv plus a multi-line `--system-prompt`:
 *
 *   shell: false -> argc 12, empty-string args preserved, prompt intact in one argv slot
 *   shell: true  -> argc 11, both `''` args vanish, prompt split at whitespace into "line"/"one"
 *
 * So argc alone separates the two, and the prompt round-trip pins the stronger property: the
 * untrusted text reaching the worker is never handed to a command interpreter. `--tools ''` is
 * what makes the worker toolless; if a shell eats that `''`, the flag silently binds to the
 * next token and the isolation guarantee is gone. That is the defect this file exists to catch.
 *
 * Requires a C compiler, for the same reason as `dispatch-pipeline.test.mjs`: the observation
 * has to be made from inside a real child process. The skip is decided at module load so a
 * suite that does not run is reported as skipped rather than as passing tests.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';

import { buildArgs } from '../scripts/backend-resolve.mjs';
import { dispatchWorker, WORKER_SYSTEM_PROMPT } from '../scripts/dispatch-worker.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const STUB_SOURCE = join(HERE, 'fixtures', 'argv-echo-stub.c');

/** A shim cannot be spawned without a shell, so the stub must be a native binary. */
const STUB_BINARY_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude';

function findCompiler() {
  for (const candidate of ['gcc', 'cc', 'clang']) {
    try {
      execFileSync(candidate, ['--version'], { stdio: 'ignore' });
      return candidate;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

const { options: STUB_OPTIONS, bin: stubBin, dir: stubDir } = (() => {
  const compiler = findCompiler();
  if (!compiler) {
    return { options: { skip: 'no C compiler (gcc/cc/clang) available to build the argv-echo stub' } };
  }
  const dir = mkdtempSync(join(tmpdir(), 'ace-argv-stub-'));
  const bin = join(dir, STUB_BINARY_NAME);
  execFileSync(compiler, ['-O0', '-o', bin, STUB_SOURCE], { stdio: 'pipe' });
  if (!existsSync(bin)) {
    throw new Error(`${compiler} reported success but produced no binary at ${bin}`);
  }
  return { options: {}, bin, dir };
})();

// A missing toolchain is an environment fact and skips; in CI it must be a hard failure,
// or this file would quietly stop testing anything. Same switch as the other stub suites.
if (STUB_OPTIONS.skip && process.env.ACE_REQUIRE_STUB_BACKEND === '1') {
  throw new Error(`ACE_REQUIRE_STUB_BACKEND=1 but the argv-echo stub is unavailable: ${STUB_OPTIONS.skip}`);
}

after(async () => {
  if (stubDir) await rm(stubDir, { recursive: true, force: true });
});

/** Dispatch against the echo stub and return the argv the child actually received. */
async function receivedArgv(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ace-argv-task-'));
  try {
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-argv01',
      objective: 'echo my argv',
      env: { PATH: '', ACE_CLAUDE_BIN: stubBin },
      ...overrides,
    });
    // The stub reports argv in the CLI envelope beside `result`; the dispatcher keeps the raw
    // bytes as an artifact, so read them back instead of spawning the stub a second time.
    const raw = audit.raw_artifact ? await readFile(join(root, audit.raw_artifact), 'utf8') : null;
    return { envelope, audit, argv: raw ? JSON.parse(raw).argv_echo : null };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * Windows STATUS_* codes that mean the image never got to run its first instruction.
 *
 * These are not exit codes the stub can produce: it returns 0 or a small integer. They come from
 * the loader, and every one of them means the process was created and then destroyed before
 * `main`, so it echoed nothing and there is no argv to read. Observed here, under the two suites
 * racing for the same compiled artifact:
 *
 *   0xC0000043 = 3221225539  STATUS_SHARING_VIOLATION      the .exe was open for writing
 *   0xC0000142 = 3221225794  STATUS_DLL_INIT_FAILED        loader gave up
 *   0xC0000135 = 3221225781  STATUS_DLL_NOT_FOUND          named for the family, not seen here
 *
 * Decimal, because that is what `spawn` surfaces and therefore what a failing run prints.
 */
const IMAGE_NEVER_RAN = new Set([3221225539, 3221225794, 3221225781]);

/**
 * Why this exists instead of `assert.notEqual(argv, null)` at each of the three call sites.
 *
 * `argv === null` has two causes with opposite meanings, and the bare assertion reported the
 * wrong one. The flake it produced (~1 run in 12, full suite only) was the compiled stub being
 * unloadable while a sibling suite rebuilt the same path -- an environment fact. The assertion
 * said the argv contract was broken, which sent the investigation at `buildArgs`.
 *
 * The tempting fix -- retry, or relax the assertion -- is the one to refuse: this is the only
 * channel that can observe a shell in the spawn path, so anything that lowers its alarm rate
 * hardens the defect it exists to catch. What is wrong is the DIAGNOSIS, not the sensitivity.
 * So both cases still fail the test; they just no longer claim to be the same finding.
 *
 * The split is a reading, not a guess: an image that never reached `main` cannot have written
 * anything, so `exit_code` in the loader set AND zero captured bytes is the environment case.
 * `exit_code === 0` with no argv is the contract case and must stay red -- a clean exit that
 * echoed nothing is exactly the shell-in-the-path symptom.
 */
function assertArgvObserved({ argv, audit }) {
  if (argv !== null) return argv;

  const exitCode = audit?.exit_code;
  const bytes = audit?.raw_bytes ?? 0;
  if (IMAGE_NEVER_RAN.has(exitCode) && bytes === 0) {
    assert.fail(
      `the argv-echo stub never reached main (exit_code ${exitCode} = 0x${(exitCode >>> 0).toString(16).toUpperCase()}, `
      + `${bytes} bytes captured), so no argv could be echoed. This is an ENVIRONMENT failure, not an argv-contract `
      + 'failure: the image was unloadable, usually because another suite was rebuilding the same stub path. '
      + 'Nothing about the spawn contract may be concluded from this run -- re-run the file alone to get a reading.',
    );
  }
  assert.fail(
    `the stub echoed no argv into the raw artifact (exit_code ${exitCode}, ${bytes} bytes captured). `
    + 'The exit code is not in the loader-failure set, so the image did run: a process that ran and echoed '
    + 'nothing is the shell-in-the-spawn-path symptom this file exists to catch. Treat as a CONTRACT failure.',
  );
}

test('the worker is spawned without a shell: argv boundaries survive intact', STUB_OPTIONS, async () => {
  const { envelope, argv, audit } = await receivedArgv();

  assertArgvObserved({ argv, audit });
  assert.equal(envelope.status, 'SUCCEEDED', 'control: the stub reply is accepted end to end');

  const expected = buildArgs({ systemPrompt: WORKER_SYSTEM_PROMPT, model: undefined, jsonSchema: undefined });
  // Exact equality is the assertion. A shell would drop the two `''` arguments and split
  // the multi-line system prompt, so any interpreter in the path breaks this deep-equal.
  assert.deepEqual(argv.argv, expected);
  assert.equal(argv.argc, expected.length + 1, 'argc counts argv[0]; nothing was added or lost');
});

test('the toolless flag keeps its empty-string value, which a shell would swallow', STUB_OPTIONS, async () => {
  const { argv, audit } = await receivedArgv();
  assertArgvObserved({ argv, audit });

  // `--tools ''` and `--setting-sources ''` are the isolation-critical pair: each must be
  // followed by its own empty argument, not by the next flag.
  for (const flag of ['--tools', '--setting-sources']) {
    const at = argv.argv.indexOf(flag);
    assert.notEqual(at, -1, `${flag} is present`);
    assert.equal(argv.argv[at + 1], '', `${flag} is followed by an empty argument, not by a flag`);
  }
});

test('a system prompt carrying shell metacharacters reaches the worker verbatim', STUB_OPTIONS, async () => {
  // The prompt is the untrusted-text channel in the strongest sense: under `shell: true`
  // these characters would be interpreted by the interpreter rather than passed through.
  const hostile = 'line one && echo pwned > out.txt; rm -rf . | cat "quoted" $HOME %PATH%\nsecond line';
  const { argv, audit } = await receivedArgv({ systemPrompt: hostile });

  assertArgvObserved({ argv, audit });
  const at = argv.argv.indexOf('--system-prompt');
  assert.notEqual(at, -1);
  assert.equal(argv.argv[at + 1], hostile, 'the prompt arrived as exactly one unmodified argument');
});

test('X02 integration: an isolation-defeating model value is refused before any spawn', STUB_OPTIONS, async () => {
  // `assertIsolatedArgs` has good unit tests, but nothing asserted it is actually CALLED on
  // the dispatch path -- removing the call from `dispatchWorker` kept the whole suite green.
  // `model` is the reachable injection point: it flows from `ACE_WORKER_MODEL`, an external
  // string, straight into argv, so `--resume` there would resume the caller's session and
  // hand the worker the very history the clean-context guarantee excludes.
  const root = await mkdtemp(join(tmpdir(), 'ace-argv-x02-'));
  try {
    await assert.rejects(
      () => dispatchWorker({
        taskRoot: root,
        dispatchId: 'd-argv02',
        objective: 'should never run',
        model: '--resume',
        env: { PATH: '', ACE_CLAUDE_BIN: stubBin },
      }),
      /INVARIANT_VIOLATED.*--resume/,
    );
    // The refusal must precede the spawn, so no raw artifact can exist for this dispatch.
    await assert.rejects(readFile(join(root, 'artifacts/raw')), /ENOENT|EISDIR/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
