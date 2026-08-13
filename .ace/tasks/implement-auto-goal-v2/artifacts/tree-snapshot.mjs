#!/usr/bin/env node
/**
 * D7 WINDOW INTEGRITY -- prove a measurement window contained no source change.
 *
 * Why this exists: team-lead ran 3 configs x 24 rounds against the v2 tree and got
 * 72/72 red, then found `scripts/dispatch-worker.mjs` had been written at 03:45:18 --
 * mid-window. The red cause migrated between rounds (`artifactIndex must be a Map`
 * early, `readManifestIndex is not defined` from round 22 on). D5 asks for repeated
 * observation; D6 asks for a mechanism premise; neither states the assumption both
 * rely on: THE THING UNDER TEST DOES NOT CHANGE WHILE YOU MEASURE IT.
 *
 * The harder half: a green reading inside a write window is just as void as a red one.
 * Red is loud, so a contaminated red gets caught. If the concurrent write lands in a
 * TEST file instead of product code, 72 green rounds read as strong evidence while
 * having tested nothing. So this snapshot is required around green runs too.
 *
 * `--run` guards the ACT of running. It does not guard the act of EXPLAINING, and that
 * is a second window: team-lead took two red tests from an intact window, then opened the
 * sources to explain them -- by which time the tree had moved to `fadd42b7115a`, and the
 * mechanism he nearly reported rested on a line that did not exist during the run that
 * produced the red. So: A COUNT MAY BE CITED FROM A CLOSED WINDOW; A MECHANISM MAY NOT.
 * Both get written into the same report and look equally sound there, which is what makes
 * the confusion cheap. `--verify` exists to make the explanation window checkable too.
 *
 * Usage:
 *   node tree-snapshot.mjs                 -> print digest + per-file mtimes
 *   node tree-snapshot.mjs --digest        -> print digest only (for shell capture)
 *   node tree-snapshot.mjs --run "<cmd>"   -> snapshot, run, snapshot; void unless equal
 *   node tree-snapshot.mjs --verify <d>    -> is the tree I am about to READ the tree
 *                                            that produced reading <d>? (strict or content)
 *
 * Digests print as `<surface>-<count>:<digest>`, e.g. `all-89:fc5b7b11d834`, and `--verify`
 * takes either form. The label exists because a bare digest does not say which sampling rule
 * produced it, and two rules' digests are indistinguishable strings in prose -- see SURFACE_POLICY.
 *
 * SNAPSHOTS ONLY, NEVER A BACKSCAN. `find -newermt <open> ! -newermt <close>` returning empty is
 * NOT equivalent evidence and decays with age: mtime records only the LAST write, so a file
 * written inside the window and written again afterwards leaves an empty result set. v2-review
 * quantified it on this tree -- blindness 0/89 immediately after close, 1/89 at +3 min, 4/89 at
 * +6.5 min, 8/89 at +28 min, monotonically increasing. The hazard is not the miss; it is that the
 * miss arrives as a CLEAN EMPTY SET, so the reader writes down "verified no writes in the window".
 * Forgetting to snapshot is loud (nothing to cite); a late backscan is silent (something to cite
 * that means nothing) -- the same shape as the F1/F2/F10 false skips, where a gate announced a
 * state whose own precondition nothing checked. A snapshot answers "what is the tree right now";
 * a backscan answers "has nobody written since", and only the first is a property of the window.
 * A backscan may still be quoted as a locating aid, with its lag from window close stated.
 *
 * `--run` is the honest form: it makes the verdict a property of the run rather than
 * something a human remembers to check afterwards.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SKILL_ROOT = path.resolve(
  import.meta.dirname, '..', '..', '..', '..',
  'plugin', 'skills', 'auto-goal-v2',
);

/**
 * The whole skill tree, because an enumerated subset is a guess about what a run depends on.
 *
 * The first spec (team-lead's) named `lib/` + `scripts/` + `tests/` -- product code and test
 * code, which sounds exhaustive and is not. It watched 46 of 89 files and left out 21 runtime
 * modules that `lib/` and `scripts/` import directly (`schemas/registry.mjs` at
 * `lib/journal.mjs:55`, `lib/artifacts.mjs:21`, `lib/reducer.mjs:18`,
 * `scripts/dispatch-worker.mjs:27`; `protocols/runtime/risk.mjs` at `lib/vocabulary.mjs:14`).
 * A rewrite there changes what the suite executes while every watched file's digest holds, so
 * the window reports INTACT and the reading is void anyway -- the exact failure D7 exists to
 * catch, reintroduced by the guard's own scope.
 *
 * Enumerating inclusions fails closed only if the enumeration is right, and nobody can keep it
 * right as the tree grows. Enumerating EXCLUSIONS fails closed by default: a new directory is
 * watched the moment it appears, and dropping one has to be an explicit, reviewable act.
 */
const EXCLUDED_DIRS = new Set(['node_modules', '.git']);

/**
 * Which sampling surface produced a digest -- carried IN the reading, not in the reader's memory.
 *
 * `fc5b7b11d834` (89 files, every file under the skill root) and `3ee4f8e4a2ec` (46 files, the
 * old `lib/`+`scripts/`+`tests/` enumeration) are both twelve hex digits, so a digest cannot say
 * which rule made it. `--verify` is safe here -- team-lead forged a 46-file ledger against the
 * real tree specifically to hit the mtime-only branch, whose 46 content hashes did match, and it
 * still exited 4 and named 43 ADDED files, because the lenient branch compares the whole list and
 * not the intersection. What is NOT safe is a human comparing two such strings in prose, which is
 * exactly the confusion that put a 46-file window's `fail 2/3` into this report as evidence.
 *
 * So the surface becomes a field of the reading: `all-89:fc5b7b11d834`. Bump `SURFACE_POLICY`
 * whenever the WALK RULE changes (not when files are added -- that moves the count, which is
 * legitimate drift and still comparable). Every printed digest carries the label, `--verify`
 * accepts it, and a claim from a different policy is refused before any comparison is attempted.
 */
const SURFACE_POLICY = 'all';

const surfaceLabel = (snap) => `${SURFACE_POLICY}-${snap.entries.length}:${snap.digest}`;

/**
 * Every file, not a filtered set. `SKILL.md`, `templates/`, and the protocol markdown are read
 * at runtime by the controller, so "is it code" is not the question -- the question is whether
 * it can differ between two runs, and any file can. The old `.(mjs|cjs|js|json|c|h)$` filter
 * was a second enumerated guess sitting behind the first one.
 */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (EXCLUDED_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Content hash AND mtime, both. Content alone would miss a touch-only change (harmless
 * but worth seeing); mtime alone would miss a same-second write, and on a fast machine
 * a concurrent agent's write can land inside one mtime tick. Together they are strict.
 */
export function snapshot() {
  const entries = [];
  const ids = [];
  for (const file of walk(SKILL_ROOT)) {
    const stat = fs.statSync(file);
    const body = fs.readFileSync(file);
    const rel2 = path.relative(SKILL_ROOT, file).replace(/\\/g, '/');
    entries.push(`${rel2} ${stat.size} ${stat.mtimeMs} ${createHash('sha256').update(body).digest('hex').slice(0, 16)}`);
    // The filesystem ID, deliberately NOT part of any entry line and NOT hashed into either
    // digest. It answers a question the digests cannot -- WHAT KIND of change happened -- and it
    // has to be captured at window OPEN, because a rename-based write (sed -i, atomic save,
    // git checkout) re-binds the path to a NEW id, so the post-window binding investigates the
    // change with the change's own answer as the key. `{bigint: true}` is load-bearing: NTFS ids
    // are 64-bit and a `Number` silently drops the low bits (measured `…303fb0` for a true
    // `…303fa9`), and a wrong id matches ZERO journal records -- an empty set that reads as
    // "nothing was written".
    ids.push(`${rel2} ${fs.statSync(file, { bigint: true }).ino.toString(16).padStart(16, '0')}`);
  }
  // A sampler that reads nothing is perfectly stable, so it passes a stability control group
  // with full marks while being blind to every change (v2-review measured this: a wrong cwd
  // yields the empty-input digest, three times identically). An empty entry set is therefore
  // not a clean tree -- it is a broken sampler, and it must fail loudly rather than digest.
  if (entries.length === 0) {
    throw new Error(`snapshot read 0 files under ${SKILL_ROOT}; a sampler that sees nothing cannot report INTACT`);
  }
  const digest = createHash('sha256').update(entries.join('\n')).digest('hex').slice(0, 12);
  // Path+content only, no mtime. A `touch` or a checkout that rewrites timestamps moves
  // `digest` while leaving every byte alone -- strict enough to void a RUN (the run may
  // have raced the write), but not a reason to forbid READING the source afterwards,
  // because the bytes on screen are the bytes that ran. `--verify` needs to tell those
  // two apart or it will cry wolf and get ignored, which is worse than not existing.
  const contentDigest = createHash('sha256')
    .update(entries.map(e => { const [p, , , h] = e.split(' '); return `${p} ${h ?? ''}`; }).join('\n'))
    .digest('hex').slice(0, 12);
  return { digest, contentDigest, entries, ids };
}

/**
 * Where `--run` leaves its file list, keyed by digest, so a later `--verify` can name the
 * files that moved instead of only saying "different". Without this the tool could say
 * "do not trust your reading" but not "here is which file betrayed you".
 */
const LEDGER_DIR = path.join(import.meta.dirname, '.snapshots');

/**
 * The ledger must live OUTSIDE the sampled tree, and that is a load-bearing property rather than
 * a coincidence of where this file sits. If `.snapshots/` were inside `SKILL_ROOT`, `recordSnapshot`
 * would itself move the digest it just recorded: an INTACT `--run` would write the ledger and
 * thereby invalidate its own reading, so `--verify` could never return anything but BROKEN. A guard
 * that voids its own observations by recording them is worse than no guard, because the failure
 * looks like a tree that is always dirty.
 *
 * team-lead measured that today's paths satisfy it (`startsWith` is false). Measuring it once is
 * not the same as keeping it true -- one relocated path reintroduces it silently -- so it is
 * asserted here, at the only place that can violate it.
 */
if (path.resolve(LEDGER_DIR).startsWith(path.resolve(SKILL_ROOT) + path.sep)) {
  throw new Error(
    `the snapshot ledger (${LEDGER_DIR}) is inside the sampled tree (${SKILL_ROOT}); ` +
    'recording a snapshot would move the digest being recorded, so every later --verify would report BROKEN',
  );
}

function recordSnapshot(snap) {
  try {
    fs.mkdirSync(LEDGER_DIR, { recursive: true });
    // The surface policy goes in the file, so a later --verify can refuse a cross-surface
    // comparison even when the caller quotes a bare digest with no label.
    fs.writeFileSync(
      path.join(LEDGER_DIR, `${snap.digest}.txt`),
      `# surface ${SURFACE_POLICY}-${snap.entries.length}\n${snap.entries.join('\n')}`,
    );
  } catch {
    /* recording is a convenience; never let it fail a measurement */
  }
}

/**
 * The window-open id bindings, in a SIDECAR file rather than the ledger.
 *
 * Not in the ledger because `loadSnapshot` takes every line after the single `# surface` header as
 * an entry, and the digest is computed over `entries.join('\n')`: an extra field on a line changes
 * the digest, and an extra header line becomes a phantom entry that `drift` reports as ADDED. So a
 * change meant to make a TOUCHED verdict explainable would have moved the very digest it explains.
 *
 * Keyed by the OPEN digest, because that is the binding a later investigation needs -- see the
 * `{bigint: true}` note in `snapshot()`. Written next to the ledger, hence also outside the sampled
 * tree (the assertion above covers both, since they share LEDGER_DIR).
 */
function recordIds(digest, ids) {
  try {
    fs.mkdirSync(LEDGER_DIR, { recursive: true });
    fs.writeFileSync(path.join(LEDGER_DIR, `${digest}.ids.txt`), ids.join('\n'));
  } catch {
    /* recording is a convenience; never let it fail a measurement */
  }
}

function loadSnapshot(digest) {
  const file = path.join(LEDGER_DIR, `${digest}.txt`);
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  // Ledgers written before the surface header exists carry none. Guessing a policy for them
  // would be inventing the very field this change adds, so report `null` and fall back to the
  // pre-label behaviour: a foreign-surface ledger loses on ADDED/REMOVED and exits 4 (team-lead
  // measured this against a forged 46-file ledger -- 43 ADDED). Fail-closed, just less articulate.
  const header = /^# surface (\S+)-(\d+)$/.exec(lines[0]);
  return header
    ? { surface: header[1], count: Number(header[2]), entries: lines.slice(1) }
    : { surface: null, count: lines.length, entries: lines };
}

/**
 * Named per-file drift between two entry lists.
 *
 * Three outcomes, not two, because `CHANGED` covers a case where the tree did NOT change.
 * A write followed by a byte-exact restore leaves size and content hash identical and moves
 * only mtime -- measured on `SKILL.md`: `6125 / 71244ccd19586f41` on both sides, mtime
 * `1786556781493` -> `1786569361262`. That is a real event worth naming (an observer entered
 * the tree under test, which is how a self-reflexive probe gets caught), but calling it
 * `CHANGED` points the reader at the opposite of the truth and voids a window whose bytes are
 * still the bytes that ran. So mtime-only drift is `TOUCHED`.
 *
 * `TOUCHED` does NOT identify which of the two causes occurred -- a write-then-restore and a
 * zero-byte `utimesSync` are identical in the snapshot, because the distinguishing information
 * is not in the file. It is in the volume: NTFS's change journal tags each record with the KIND
 * of change, and `probe-usn-distinguish.cjs` reads those bits. On the `SKILL.md` event above the
 * journal showed BASIC_INFO_CHANGE with zero DATA_* bits -- a pure touch, nobody's edit. Any
 * claim about WHICH cause fired belongs to that probe, never to this label.
 *
 * The two faces answer different questions and neither subsumes the other: the content hash
 * answers "did the bytes change", mtime answers "did someone write here". Dropping mtime
 * blinds the reflexive-probe check; letting mtime alone void a window is a false positive.
 */
function drift(beforeEntries, afterEntries) {
  const beforeMap = new Map(beforeEntries.map(e => [e.split(' ')[0], e]));
  const afterMap = new Map(afterEntries.map(e => [e.split(' ')[0], e]));
  const lines = [];
  for (const key of new Set([...beforeMap.keys(), ...afterMap.keys()])) {
    const b = beforeMap.get(key);
    const a = afterMap.get(key);
    if (b === a) continue;
    if (b === undefined) lines.push(`  ADDED   ${key}`);
    else if (a === undefined) lines.push(`  REMOVED ${key}`);
    else {
      const [, bSize, , bHash] = b.split(' ');
      const [, aSize, , aHash] = a.split(' ');
      const label = bSize === aSize && bHash === aHash ? 'TOUCHED' : 'CHANGED';
      const note = label === 'TOUCHED' ? '  (mtime only; every byte identical -- either a write that restored the bytes, or a pure touch that wrote none)' : '';
      lines.push(`  ${label} ${key}${note}\n            before: ${b.split(' ').slice(1).join(' ')}\n            after:  ${a.split(' ').slice(1).join(' ')}`);
    }
  }
  return lines;
}

function stamp() {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

const args = process.argv.slice(2);
const runAt = args.indexOf('--run');
const verifyAt = args.indexOf('--verify');

if (verifyAt !== -1) {
  // "Am I reading the tree that produced reading <digest>?" -- the second window.
  const claimedArg = args[verifyAt + 1];
  if (!claimedArg) {
    console.error('--verify needs the digest printed by the run you are about to explain');
    process.exit(2);
  }
  // Accept both `all-89:fc5b7b11d834` and a bare `fc5b7b11d834`; a bare one is a reading whose
  // surface was never recorded in the citation, which is the ambiguity this label removes.
  const labelled = /^([a-z]+)-(\d+):([0-9a-f]{12})$/.exec(claimedArg);
  const claimed = labelled ? labelled[3] : claimedArg;
  const claimedSurface = labelled ? { policy: labelled[1], count: Number(labelled[2]) } : null;
  const now = snapshot();
  const recorded = loadSnapshot(claimed);

  // Refuse a cross-surface claim BEFORE comparing anything. The comparison itself is safe (a
  // foreign ledger loses on ADDED/REMOVED), but "BROKEN" would then be reported as drift in the
  // tree when the truth is that the two readings were never commensurable. Naming the real reason
  // is the difference between the reader fixing their citation and the reader hunting a phantom write.
  const recordedSurface = recorded?.surface ?? null;
  const surfaceMismatch = (claimedSurface && claimedSurface.policy !== SURFACE_POLICY)
    || (recordedSurface !== null && recordedSurface !== SURFACE_POLICY);
  if (surfaceMismatch) {
    console.error(`READ WINDOW UNCOMPARABLE  ${stamp()}  claim surface=${claimedSurface?.policy ?? recordedSurface}  this tool samples surface=${SURFACE_POLICY}`);
    console.error('That reading came from a different sampling rule, so "same digest" and "different digest" are both meaningless here.');
    console.error('Neither the counts nor a mechanism may be transported across surfaces; re-measure on this surface.');
    process.exit(5);
  }

  if (now.digest === claimed) {
    console.log(`READ WINDOW INTACT  ${stamp()}  digest=${surfaceLabel(now)}`);
    console.log('The sources on disk are the sources that produced that reading. A mechanism read from them may be cited.');
    process.exit(0);
  }

  // Bytes equal but digest differs => only mtimes moved. The reading stands and so does
  // any mechanism read from these bytes; refusing here would train the reader to ignore
  // the tool. This branch is unreachable without a recorded snapshot to compare against.
  if (recorded) {
    const recordedContent = createHash('sha256')
      .update(recorded.entries.map(e => { const [p, , , h] = e.split(' '); return `${p} ${h ?? ''}`; }).join('\n'))
      .digest('hex').slice(0, 12);
    if (recordedContent === now.contentDigest) {
      console.log(`READ WINDOW INTACT (bytes)  ${stamp()}  digest=${surfaceLabel(now)} != ${claimed}, but every file's content hash matches`);
      console.log('Only mtimes moved. The bytes you are about to read are the bytes that ran.');
      process.exit(0);
    }
  }

  console.error(`READ WINDOW BROKEN  ${stamp()}  on disk=${surfaceLabel(now)}  reading came from=${claimed}`);
  if (recorded) {
    console.error('Files that differ between the run and the tree you are about to read:');
    for (const line of drift(recorded.entries, now.entries)) console.error(line);
  } else {
    console.error(`  (no recorded file list for ${claimed}; run --run to record one, or the digest is from another machine)`);
  }
  console.error('\nThe COUNTS from that reading remain citable -- they were measured in a closed window.');
  console.error('A MECHANISM read from the current sources may not be attributed to that reading: the');
  console.error('line you are about to quote may not have existed when those numbers were produced.');
  process.exit(4);
}

if (runAt !== -1) {
  const command = args[runAt + 1];
  if (!command) {
    console.error('--run needs a command');
    process.exit(2);
  }
  const t0 = stamp();
  const before = snapshot();
  // Capture the id bindings NOW. If this run turns out TOUCHED, the only way to tell a
  // write-then-restore from a pure touch is the volume journal, and that query needs the
  // PRE-change id -- which stops existing the moment a rename-based write lands.
  recordIds(before.digest, before.ids);
  console.log(`WINDOW OPEN  ${t0}  digest=${surfaceLabel(before)}  files=${before.entries.length}`);

  let status = 0;
  // Tee rather than `inherit`. The verdict below needs to know whether the command PRODUCED
  // anything, and `inherit` throws that fact away -- it is the one measurement that separates
  // "never started" from "ran and failed", and without it the tool can only hand the reader a
  // conditional to resolve. Live output is preserved by writing every chunk straight through, so
  // a suite still streams as it runs. Bytes are counted, not buffered: a full suite is ~40 KB
  // today, but a probe that OOMs on a chatty command would be a guard that breaks the run it
  // guards. Collected on `close`, not `exit` -- the #19 lesson: `exit` can fire while the pipes
  // still hold unread bytes, which would report 0 bytes for a command that did produce output.
  let outBytes = 0;
  let errBytes = 0;
  await new Promise((resolve) => {
    const child = spawn(command, {
      cwd: path.resolve(SKILL_ROOT, '..', '..', '..'),
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => { outBytes += chunk.length; process.stdout.write(chunk); });
    child.stderr.on('data', (chunk) => { errBytes += chunk.length; process.stderr.write(chunk); });
    child.on('error', () => { status = status || 1; });
    child.on('close', (code) => { status = code ?? 1; resolve(); });
  });

  const after = snapshot();
  const t1 = stamp();
  console.log(`WINDOW CLOSE ${t1}  digest=${surfaceLabel(after)}  files=${after.entries.length}`);

  if (before.digest === after.digest) {
    recordSnapshot(after);
    // An intact window says the tree held still; it does NOT say a reading exists. A command
    // that never started -- a mistyped path, MODULE_NOT_FOUND -- leaves the tree perfectly
    // still, which is the strongest possible INTACT and an empty reading. docs-wiring hit this
    // twice by passing a path that does not exist, and both times the guard printed
    // "reading is admissible" over nothing at all. Admissible-and-empty is the shape that gets
    // cited as "verified", so the verdict has to name it rather than leave it to the reader.
    //
    // The first fix forked on `status` alone and printed, for every nonzero exit, "If this exit
    // came from the command not starting at all, there is no reading here to cite." Measured on
    // this tree, `node no/such/path.mjs` (0 bytes out) and `node -e "process.exit(7)"` (bytes out)
    // produced BYTE-IDENTICAL verdicts -- the distinction lived in the prose and the reader was
    // handed the conditional to resolve. But it is not a matter of opinion: a command that never
    // started wrote nothing, and stdout byte count settles it. So the fork is three-way now, and
    // the "did it produce anything" question is answered by measurement rather than asked of the
    // reader. Same failure family as `(exit ${status})`: handing over the raw input to a judgement
    // is not handing over the judgement.
    const produced = outBytes + errBytes;
    let admissible;
    if (status === 0) {
      admissible = `WINDOW INTACT -- reading is admissible (the run exited 0, ${outBytes} bytes on stdout)`;
    } else if (outBytes === 0) {
      admissible = `WINDOW INTACT, BUT THERE IS NO READING HERE (exit ${status}, ZERO bytes on stdout, `
        + `${errBytes} on stderr) -- the command produced no output at all, so the still tree is `
        + 'evidence about nothing. Check that it started: a bad path or MODULE_NOT_FOUND looks '
        + 'exactly like this. Nothing from this run may be cited.';
    } else {
      admissible = `WINDOW INTACT, BUT THE RUN FAILED (exit ${status}) -- it did run and wrote `
        + `${outBytes} bytes on stdout, so a reading exists; the tree held still, so those bytes `
        + 'are citable as the output of a FAILING run. Do not cite them as a passing one.';
    }
    console.log(admissible);
    if (produced === 0 && status === 0) {
      console.log('  note: exit 0 with zero bytes on both streams -- a silent success is also an empty reading.');
    }
    // The counts are now safe to cite. Reading the sources to EXPLAIN them is a separate
    // window that this run did not guard -- so hand over the digest that gates it.
    console.log(`  before reading any source to explain this reading, run: --verify ${surfaceLabel(after)}`);
    process.exit(status);
  }

  // Name the drifted files. "Something changed" sends the next reader hunting; the
  // list tells them whose write it was and whether it could touch their conclusion.
  const lines = drift(before.entries, after.entries);

  // Bytes identical, only mtimes moved. `--verify` has told this apart from a real change since
  // it was written (see `INTACT (bytes)` above); `--run` did not, and compared the mtime-bearing
  // digest alone. So one tool gave two verdicts for one event: reading after a touch was
  // admissible, while a RUN spanning the same touch was VOID. team-lead lost two timing readings
  // to that asymmetry, then measured the cause with the volume journal -- `SKILL.md` carried
  // BASIC_INFO_CHANGE and zero DATA_* bits, i.e. no bytes were ever written. That conclusion came
  // from the JOURNAL, not from the snapshots: a byte-exact restore produces the same two hashes,
  // so this branch cannot itself distinguish the two causes and must not claim to (see below).
  //
  // The verdict is deliberately NOT `INTACT`. A touch cannot corrupt the bytes a reading was
  // computed from, so a byte-measuring reading stands; but a run whose OWN measurement is a
  // timing distribution shares the machine with whatever did the touching, and that neighbour
  // is a load source. Hence: content-level readings may be cited, timing-level readings may not.
  // Distinguishing them is the caller's judgement, and it needs the fact stated, not hidden
  // behind a pass or a fail.
  if (before.contentDigest === after.contentDigest) {
    recordSnapshot(after);
    console.log(`WINDOW TOUCHED  ${stamp()}  digest moved ${surfaceLabel(before)} -> ${surfaceLabel(after)}, but every file's content hash matches`);
    for (const line of lines) console.log(line);
    console.log('Every file\'s content hash matches, so any reading computed FROM THE BYTES stands.');
    // What the snapshots do NOT settle: identical hashes are equally consistent with a pure touch
    // (zero bytes written) and with a write followed by a byte-exact restore. This line used to
    // assert the first -- "zero bytes were written" -- which is a claim the sampler cannot support,
    // and the more dangerous of the two to get wrong: a restore means some process was mid-edit in
    // this tree, and a run that raced it may have loaded the intermediate bytes.
    console.log('NOT settled by the snapshots: whether zero bytes were written (a pure touch) or bytes');
    console.log('were written and then restored. Identical hashes look the same in both cases; the volume');
    console.log('journal tells them apart by reason bits, and the window-open file ids it needs are in:');
    console.log(`  ${path.join(LEDGER_DIR, `${before.digest}.ids.txt`)}`);
    console.log('  probe: node probe-usn-distinguish.cjs --self-test   (then query with the ids above)');
    console.log('But something else was active in this tree during the run. If this reading is a TIMING');
    console.log('measurement (latency, a percentile, a flake rate), treat it as contaminated and re-take it.');
    console.log(`  to read the sources behind this reading, run: --verify ${surfaceLabel(after)}`);
    process.exit(status);
  }

  console.error('WINDOW VIOLATED -- the tree changed mid-run; this reading is VOID:');
  for (const line of lines) console.error(line);
  console.error(`\nThe run itself exited ${status}, but that number means nothing: green and red are equally void here.`);
  process.exit(3);
}

const snap = snapshot();
if (args.includes('--digest')) {
  console.log(surfaceLabel(snap));
} else {
  console.log(`${stamp()}  digest=${surfaceLabel(snap)}  files=${snap.entries.length}`);
  for (const entry of snap.entries) console.log(`  ${entry}`);
}
