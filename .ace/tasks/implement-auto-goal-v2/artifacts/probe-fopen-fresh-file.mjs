// Round 57: the stub emitted ZERO bytes -- raw artifact `e3b0c44298fc` is sha256(""). Why?
//
// The stub's own code has a path that produces exactly that observation:
//
//     char *file_bytes = read_file(reply_file, &file_len);
//     if (file_bytes == NULL) return 0;      // <- no stdout, no stderr, exit 0
//
// A failed `fopen` and a genuinely empty reply are therefore BYTE-IDENTICAL to the dispatcher:
// both give empty stdout, empty stderr, exit 0, which the pipeline then reports as
// `cli_output_unparseable`. So the red names the symptom and destroys the cause. That is an
// instrument defect independent of whether fopen is what actually failed in round 57.
//
// This probe asks the empirical half: can `fopen` on a just-written temp file transiently fail
// on this machine? Round 9's gcc died with 0xC0000043 (STATUS_SHARING_VIOLATION) on a freshly
// created .exe -- the same shape of fault, which is why "a new file is briefly unopenable here"
// is the hypothesis rather than a guess pulled from nowhere.
//
// The stub is compiled to a temp dir and given a PATCHED source that reports fopen failure on
// stderr with a non-zero exit. Two things are measured at once:
//   - does the failure happen at all, and at what rate
//   - would the loud version have NAMED it (the fix's value, demonstrated rather than asserted)
// The repo's copy is untouched: the n=75 census is running against it, and editing a file it is
// sampling would silently change what those rounds measured.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROUNDS = Number(process.argv[2] ?? 300);
const SRC = 'plugin/skills/auto-goal-v2/tests/fixtures/dispatch-pipeline-stub.c';
const BIN_NAME = process.platform === 'win32' ? 'claude.exe' : 'claude';

// The patch under test: name the failure instead of returning 0 quietly. Two sites, because
// `read_stdin` can fail the same silent way.
const original = readFileSync(SRC, 'utf8');
const LOUD_SITE = `    char *file_bytes = read_file(reply_file, &file_len);
    free(stdin_bytes);
    if (file_bytes == NULL) return 0;`;
if (!original.includes(LOUD_SITE)) throw new Error('stub source shape changed; probe is stale');
const patched = original.replace(
  LOUD_SITE,
  `    char *file_bytes = read_file(reply_file, &file_len);
    free(stdin_bytes);
    if (file_bytes == NULL) {
      fprintf(stderr, "stub: cannot read ACE_STUB_REPLY_FILE %s: %s\\n", reply_file, strerror(errno));
      return 42;
    }`,
).replace('#include <string.h>', '#include <string.h>\n#include <errno.h>');

const work = mkdtempSync(join(tmpdir(), 'ace-fopen-probe-'));
const loudSrc = join(work, 'loud-stub.c');
writeFileSync(loudSrc, patched);
const loudBin = join(work, BIN_NAME);
execFileSync('gcc', ['-O0', '-o', loudBin, loudSrc], { stdio: 'pipe' });

// A reply big enough to match B4's shape (~86 KB), so the read is not a single trivial block.
const REPLY = Buffer.from('需求理解与澄清并对齐目标'.repeat(2400), 'utf8');

const stats = { rounds: 0, empty: 0, named: 0, otherFail: 0, shortRead: 0 };
const incidents = [];

for (let i = 1; i <= ROUNDS; i++) {
  // Recreate the suite's exact sequence: fresh mkdtemp, write the reply, immediately spawn a
  // process that opens it. The gap between write and open is what the hypothesis is about, so
  // nothing is inserted between them.
  const replyDir = mkdtempSync(join(tmpdir(), 'ace-pipeline-reply-'));
  const replyFile = join(replyDir, 'reply.bin');
  writeFileSync(replyFile, REPLY);

  const r = spawnSync(loudBin, [], {
    input: Buffer.from('{"objective":"probe"}'),
    env: { ...process.env, ACE_STUB_REPLY_FILE: replyFile },
    maxBuffer: 1 << 28,
  });
  stats.rounds++;

  const outLen = r.stdout?.length ?? 0;
  const errText = (r.stderr ?? Buffer.alloc(0)).toString('utf8').trim();

  if (outLen === 0) {
    stats.empty++;
    // The point of the patch: an empty stdout that ALSO carries a reason is diagnosable.
    if (errText !== '' || r.status !== 0) stats.named++;
    incidents.push({ round: i, kind: 'empty_stdout', status: r.status, stderr: errText.slice(0, 200) });
    console.log(`round ${i}: EMPTY stdout status=${r.status} stderr=${JSON.stringify(errText.slice(0, 200))}`);
  } else if (outLen !== REPLY.length) {
    stats.shortRead++;
    incidents.push({ round: i, kind: 'short_read', got: outLen, want: REPLY.length, status: r.status });
    console.log(`round ${i}: SHORT read got=${outLen} want=${REPLY.length} status=${r.status}`);
  } else if (r.status !== 0) {
    stats.otherFail++;
    console.log(`round ${i}: full output but status=${r.status} stderr=${JSON.stringify(errText.slice(0, 200))}`);
  }

  rmSync(replyDir, { recursive: true, force: true });
  if (i % 50 === 0) console.log(`-- ${i}/${ROUNDS}`);
}

console.log(`\n=== fopen-on-fresh-file census, n=${stats.rounds} ===`);
console.log(`empty stdout:  ${stats.empty}  (of those, ${stats.named} carried a reason thanks to the loud patch)`);
console.log(`short reads:   ${stats.shortRead}`);
console.log(`other non-zero exits: ${stats.otherFail}`);
const rate = stats.empty / stats.rounds;
if (rate > 0) {
  console.log(`per-dispatch empty rate ${(100 * rate).toFixed(2)}%; n for 95% detection: ${Math.ceil(Math.log(0.05) / Math.log(1 - rate))}`);
} else {
  console.log('NOT REPRODUCED at this n. The fopen hypothesis is unconfirmed: it stays a hypothesis,');
  console.log('and the stub patch is justified as instrumentation (it makes the next occurrence');
  console.log('attributable), NOT as a demonstrated fix for round 57.');
}
writeFileSync(
  '.ace/tasks/implement-auto-goal-v2/artifacts/probe-fopen-fresh-file.jsonl',
  incidents.map((x) => JSON.stringify(x)).join('\n') + (incidents.length ? '\n' : ''),
);
rmSync(work, { recursive: true, force: true });
if (readFileSync(SRC, 'utf8') !== original) throw new Error('repo stub source was modified; it must not be');
console.log('repo stub source untouched (verified byte-for-byte)');
