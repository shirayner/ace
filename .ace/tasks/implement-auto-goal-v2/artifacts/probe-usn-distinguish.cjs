/**
 * Can a mid-window byte change be told apart from a pure `touch` AFTER the fact?
 *
 * The premise this probe was built to test: that the two causes behind a `TOUCHED` verdict --
 *   (甲) write, then restore the original bytes;
 *   (乙) `utimesSync` only, zero bytes written;
 * are "in principle" indistinguishable, because first/last snapshots are byte-identical in both.
 * That is true of SNAPSHOTS, and false as a claim about the world: NTFS records a per-volume
 * change journal whose `Reason` flags name the KIND of change. The field is not unobtainable --
 * it is merely not in the snapshot, which is a different claim with a different fix.
 *
 * WHAT THIS PROBE MAY AND MAY NOT CONCLUDE. Three independent failure modes were found in its
 * first version, all of them biased toward answering 甲 -- that is, toward agreeing with whatever
 * a VOID verdict already implied, which is the direction a reviewer is least likely to question:
 *
 *   1. SCOPE. Attribution by basename. The journal is per-VOLUME, and this volume holds 1376
 *      files named `SKILL.md`; the 89 basenames in the guarded surface are unique only within
 *      that surface, while the evidence comes from the whole volume. Every mutation harness
 *      `cpSync`s the tree into tmpdir, so same-named copies are the normal case, not the corner.
 *      => attribute by file ID, never by name.
 *
 *   2. TIME. A file ID is not stable across a rename-based write. `sed -i`, most editors' atomic
 *      save, and `git checkout` do not edit in place: they write a temp file and rename it over
 *      the target, so a NEW ID is born carrying `FILE_CREATE|DATA_EXTEND` even when the bytes
 *      written are identical to the old ones. Querying with the ID observed AFTER the window
 *      therefore reports 甲 for a byte-identical rename. The path->ID binding is itself one of
 *      the things under observation, so using the post-change binding to investigate the change
 *      is taking the answer as the key.
 *      => the ID must be captured when the window OPENS, and queried with that one.
 *
 *   3. PRECISION. `fs.statSync(p).ino` returns a `Number`; NTFS IDs are 64-bit and lose the low
 *      bits past 53 (measured: `…303fb0` for a true `…303fa9`). A wrong ID matches ZERO records,
 *      and zero records print as "nothing was written" -- a silent empty set that looks like a
 *      finding.
 *      => `{bigint: true}`, zero-padded to 16 hex digits.
 *
 * Also: the journal is BOUNDED. Records roll off (measured: ~32 MB quota, ~1 MB per full suite
 * run, so roughly 31 runs of history). An event older than the earliest record is not "clean" --
 * it is unobservable, and the two must never print the same. This probe reports the coverage
 * boundary before any verdict, because that check is what separates "no DATA_* bits" from "no
 * records at all". Attributing four out of five events this way is exactly the mistake that
 * produced a wrong, confidently-stated attribution chain earlier in this task.
 *
 * Reason bits (winioctl.h):
 *   0x00000001 DATA_OVERWRITE   0x00000002 DATA_EXTEND   0x00000004 DATA_TRUNCATION
 *   0x00000100 FILE_CREATE      0x00000200 FILE_DELETE   0x00008000 BASIC_INFO_CHANGE
 *   0x00001000 RENAME_OLD_NAME  0x00002000 RENAME_NEW_NAME              0x80000000 CLOSE
 *
 * `fsutil` localises its labels, so nothing here is parsed by label -- records are split on the
 * `Usn :` field and read positionally/by hex value. A probe that greps a translated string is a
 * probe that reports "no evidence" on a non-English machine.
 *
 * Usage:  node probe-usn-distinguish.cjs [--self-test] [<file>...]
 *   --self-test  run the built-in falsification cases (scratch files, verifies the probe itself)
 *   <file>...    classify these paths; IDs are captured now, so this answers "what happened to
 *                them since this instant" only in combination with --self-test's discipline.
 */
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const VOLUME = 'D:';

const REASONS = [
  [0x00000001, 'DATA_OVERWRITE'],
  [0x00000002, 'DATA_EXTEND'],
  [0x00000004, 'DATA_TRUNCATION'],
  [0x00000010, 'NAMED_DATA_OVERWRITE'],
  [0x00000100, 'FILE_CREATE'],
  [0x00000200, 'FILE_DELETE'],
  [0x00000800, 'SECURITY_CHANGE'],
  [0x00001000, 'RENAME_OLD_NAME'],
  [0x00002000, 'RENAME_NEW_NAME'],
  [0x00008000, 'BASIC_INFO_CHANGE'],
  [0x80000000, 'CLOSE'],
];

const DATA_BITS = /DATA_(OVERWRITE|EXTEND|TRUNCATION)/;

const decode = (mask) => REASONS.filter(([bit]) => (mask & bit) === bit).map(([, n]) => n).join('|')
  || `0x${mask.toString(16)}`;

/**
 * The 64-bit NTFS file ID as the journal prints it: 16 lowercase hex digits, zero-padded.
 *
 * `{bigint: true}` is load-bearing, not stylistic -- see failure mode 3 in the header. The
 * padding matters too: the journal prints a fixed 32-digit field (16 significant), so an
 * unpadded needle silently fails to match records for low-numbered IDs.
 */
function fileId(target) {
  return fs.statSync(target, { bigint: true }).ino.toString(16).padStart(16, '0');
}

/**
 * A USN as printed by fsutil, which is not consistent about radix: `queryjournal` prints
 * `0x0000000e16223400` while `readjournal` prints `60500891376` for the same number. Accepting
 * only one of the two is how the first version came to pass `startusn=undefined` to every read.
 */
const parseUsn = (s) => BigInt(/^0x/i.test(s) ? s : s.replace(/^0+(?=\d)/, ''));

/**
 * Journal head, read POSITIONALLY -- by line order, never by label.
 *
 * This machine prints the labels in Chinese (`下一个 Usn`), so a probe keyed on the English text
 * reports "could not read the journal" and every verdict downstream degrades to INCONCLUSIVE.
 * The line ORDER is a property of fsutil, not of the display language: journal ID, first USN,
 * next USN. Only the first three lines are consumed, so the later size/increment fields (also
 * hex, also 8+ digits) cannot be mistaken for USNs -- which a whole-output regex did do.
 */
function journalBounds() {
  const out = execFileSync('fsutil', ['usn', 'queryjournal', VOLUME], { encoding: 'latin1' });
  const values = out.split(/\r?\n/)
    .map((line) => /:\s*(0x[0-9a-f]+|\d+)\s*(?:\(|$)/i.exec(line)?.[1])
    .filter(Boolean);
  if (values.length < 3) throw new Error(`unparseable queryjournal output: ${out.slice(0, 200)}`);
  return { journalId: values[0], firstUsn: parseUsn(values[1]), nextUsn: parseUsn(values[2]) };
}

/**
 * Records for `idHex` since `startUsn`, newest last, with reasons decoded and timestamps kept.
 *
 * Attribution is by file ID (failure mode 1), and the ID is supplied by the caller rather than
 * re-derived here, so that a caller who captured it at window-open gets the pre-change binding
 * (failure mode 2).
 */
function recordsForId(startUsn, idHex) {
  let out;
  try {
    out = execFileSync(
      'fsutil',
      ['usn', 'readjournal', VOLUME, `startusn=${startUsn}`],
      { encoding: 'latin1', maxBuffer: 1 << 28 },
    );
  } catch (error) {
    return { error: String(error.message).slice(0, 200), rows: [] };
  }
  // `readjournal` records carry three MASK fields, each printed as `0xNNNNNNNN: <localised text>`
  // in a fixed order: reason, file attributes, source info. So the reason is the first
  // hex-followed-by-colon in the record -- positional, and immune to the label translation that
  // makes every text match useless here.
  //
  // The first version of this parser guessed a different shape and returned `reason: null` for
  // every record, then printed "NOT distinguishable" -- a probe reporting its own breakage as a
  // finding about the world. Hence the explicit null-accounting in every verdict below.
  const rows = [];
  for (const chunk of out.split(/\r?\n\r?\n/)) {
    // Each record carries TWO 32-hex-digit IDs, in fixed order: the file's own, then its
    // PARENT's. A substring search over the whole chunk therefore also matches records about
    // sibling files that merely share our file's parent directory -- failure mode 1 again, one
    // level up, and again biased toward 甲 (a busy directory always has DATA_* traffic). So take
    // the FIRST such field positionally and require an exact tail match on it.
    const ids = [...chunk.matchAll(/\b([0-9a-f]{32})\b/gi)].map((m) => m[1].toLowerCase());
    if (ids.length === 0 || ids[0].slice(-16) !== idHex) continue;
    const masks = [...chunk.matchAll(/(0x[0-9a-f]{8}):/gi)].map((m) => Number(BigInt(m[1])) >>> 0);
    rows.push({
      usn: /Usn\s*:\s*(\d+)/.exec(chunk)?.[1] ?? '?',
      reason: masks.length ? decode(masks[0]) : null,
      when: /(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/.exec(chunk)?.[1] ?? '?',
      name: chunk.split(/\r?\n/).map((l) => l.split(/\s*:\s*/)[1]).find((v) => v && /\S\.\S/.test(v)) ?? '?',
    });
  }
  return { error: null, rows };
}

/**
 * The WRONG attribution, implemented deliberately: records whose filename field contains `name`.
 *
 * This exists only so the self-test can demonstrate that basename attribution gives a different
 * -- and wrong -- answer on the same journal data. Keeping it as its own function is what makes
 * the control honest: once `recordsForId` began requiring an exact 32-hex match, passing a
 * basename to it could never match anything, so the control would have printed "no DATA_* seen by
 * name" for the trivial reason that it searched for a filename among ID digits. A control that
 * passes because it tests nothing is the same failure this whole probe is about.
 */
function recordsForName(startUsn, name) {
  let out;
  try {
    out = execFileSync('fsutil', ['usn', 'readjournal', VOLUME, `startusn=${startUsn}`], {
      encoding: 'latin1', maxBuffer: 1 << 28,
    });
  } catch {
    return [];
  }
  const rows = [];
  for (const chunk of out.split(/\r?\n\r?\n/)) {
    // Filename is the second field of a record, positionally -- the label is localised.
    const fields = chunk.split(/\r?\n/).map((l) => l.split(/\s*:\s*/).slice(1).join(':').trim());
    if (!fields[1] || !fields[1].toLowerCase().includes(name.toLowerCase())) continue;
    const masks = [...chunk.matchAll(/(0x[0-9a-f]{8}):/gi)].map((m) => Number(BigInt(m[1])) >>> 0);
    rows.push({ reason: masks.length ? decode(masks[0]) : null });
  }
  return rows;
}

/**
 * One pass over the journal, indexed by file id -- for callers with MANY ids to attribute.
 *
 * `recordsForId` re-reads the whole journal per id, which is fine for one file and quadratic for a
 * sidecar: 89 ids x ~36 MB is minutes of work to answer a question one read can answer. Same
 * parsing rules as `recordsForId` (positional masks, first 32-hex field only, exact 16-digit tail).
 */
function indexJournal(startUsn) {
  let out;
  try {
    out = execFileSync('fsutil', ['usn', 'readjournal', VOLUME, `startusn=${startUsn}`], {
      encoding: 'latin1', maxBuffer: 1 << 28,
    });
  } catch (error) {
    return { error: String(error.message).slice(0, 200), byId: new Map() };
  }
  const byId = new Map();
  for (const chunk of out.split(/\r?\n\r?\n/)) {
    const ids = [...chunk.matchAll(/\b([0-9a-f]{32})\b/gi)].map((m) => m[1].toLowerCase());
    if (ids.length === 0) continue;
    const key = ids[0].slice(-16);
    const masks = [...chunk.matchAll(/(0x[0-9a-f]{8}):/gi)].map((m) => Number(BigInt(m[1])) >>> 0);
    const row = {
      usn: /Usn\s*:\s*(\d+)/.exec(chunk)?.[1] ?? '?',
      reason: masks.length ? decode(masks[0]) : null,
      when: /(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/.exec(chunk)?.[1] ?? '?',
      name: chunk.split(/\r?\n/).map((l) => l.split(/\s*:\s*/).slice(1).join(':').trim()).find((v) => v && /\S\.\S/.test(v)) ?? '?',
    };
    if (byId.has(key)) byId.get(key).push(row); else byId.set(key, [row]);
  }
  return { error: null, byId };
}

/**
 * 甲 / 乙 / INCONCLUSIVE from already-collected rows. Shared by `--query` and `classify` so the
 * two cannot drift apart -- one of them silently disagreeing with the other is the kind of split
 * that makes a diagnostic untrustworthy without ever looking broken.
 */
function verdictFrom(rows, coveredFrom) {
  const unparsed = rows.filter((r) => r.reason === null).length;
  if (unparsed > 0) return `INCONCLUSIVE -- ${unparsed}/${rows.length} records had no readable reason mask; this says the probe cannot read the journal, not that nothing happened.`;
  if (rows.length === 0) return `INCONCLUSIVE -- zero records. Either nothing touched it, or the event predates the journal's earliest record (${coveredFrom}). These are NOT the same and this probe cannot separate them.`;
  if (rows.some((r) => DATA_BITS.test(r.reason ?? ''))) return '甲 -- DATA_* bits present: bytes were written (a byte-identical restore still shows these).';
  if (rows.some((r) => /BASIC_INFO_CHANGE/.test(r.reason ?? ''))) return '乙 -- BASIC_INFO_CHANGE with zero DATA_* bits: timestamps only, no bytes written.';
  return '(records exist but neither DATA_* nor BASIC_INFO_CHANGE -- read the rows)';
}

/**
 * 甲 / 乙 / INCONCLUSIVE for one file, plus the evidence the verdict rests on.
 *
 * `idAtOpen` is the caller's window-open binding. If the file's ID differs NOW, that is itself
 * the positive signature of a rename-based write -- more direct than any reason bit -- so it is
 * reported as its own outcome rather than folded into 甲 or 乙.
 */
function classify({ label, idAtOpen, target, startUsn, coveredFrom }) {
  const idNow = fs.existsSync(target) ? fileId(target) : null;
  const renamed = idNow !== null && idNow !== idAtOpen;
  const { error, rows } = recordsForId(startUsn, idAtOpen);

  let verdict;
  if (error) verdict = `INCONCLUSIVE (journal read failed: ${error})`;
  else if (renamed) verdict = '甲-RENAME -- the path was re-bound to a NEW file ID: a rename-based write (sed -i, atomic save, checkout). Bytes may still be identical.';
  else verdict = verdictFrom(rows, coveredFrom);

  return { label, target, idAtOpen, idNow, rows, verdict };
}

function report(result) {
  console.log(`\n  ${result.label}`);
  console.log(`    id at open : ${result.idAtOpen}`);
  if (result.idNow !== result.idAtOpen) console.log(`    id NOW     : ${result.idNow}   <-- CHANGED: rename-based write`);
  for (const r of result.rows) console.log(`    usn ${r.usn}  ${r.when}  ${r.name}  ${r.reason}`);
  console.log(`    records: ${result.rows.length}`);
  console.log(`    => ${result.verdict}`);
}

// ---------------------------------------------------------------------------------------------

const args = process.argv.slice(2);
const bounds = journalBounds();

// The coverage boundary, printed BEFORE any verdict. "No DATA_* bits" and "no records at all"
// are different facts, and only the boundary tells them apart; four of five events in the
// SKILL.md investigation fell outside it, which is why that attribution chain was wrong.
//
// Read from `firstUsn` with a deliberately small buffer and KEEP THE PARTIAL PREFIX: the oldest
// record's timestamp is in the first few hundred bytes, while the full journal is ~36 MB, so any
// buffer that fits the whole thing wastes seconds and any buffer that does not raises ENOBUFS.
// The first version treated that ENOBUFS as failure and printed `earliest: unknown` -- discarding
// 16 MB of perfectly good stdout, and degrading the one check that distinguishes "clean" from
// "unobservable" into a shrug. A truncated read is the NORMAL case here, not an error.
const earliest = (() => {
  const r = spawnSync('fsutil', ['usn', 'readjournal', VOLUME, `startusn=${bounds.firstUsn}`], {
    encoding: 'latin1', maxBuffer: 1 << 16, timeout: 20000,
  });
  const found = /(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/.exec(r.stdout ?? '')?.[1];
  if (found) return found;
  return `unknown (readjournal gave no timestamp: status=${r.status} err=${r.error?.code ?? 'none'})`;
})();

console.log('=== journal coverage ===');
console.log(`  volume ${VOLUME}  firstUsn ${bounds.firstUsn}  nextUsn ${bounds.nextUsn}`);
console.log(`  earliest record: ${earliest} (local)`);
console.log('  ANY event before that timestamp is UNOBSERVABLE here -- not "clean". The journal is');
console.log('  bounded (~32 MB quota, ~1 MB per full suite run) and rolls off oldest-first.');

const targets = args.filter((a) => !a.startsWith('--'));

if (args.includes('--self-test')) {
  // Falsification for the probe itself: four causes with KNOWN answers, including the two that
  // fooled the first version. A diagnostic tool with no self-test is a claim, not a measurement.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-usn-selftest-'));
  const cases = [
    {
      label: '甲: write different bytes, then restore the originals',
      expect: /^甲 /,
      act: (p) => { const o = fs.readFileSync(p); fs.writeFileSync(p, Buffer.concat([o, Buffer.from('\nMID-WINDOW BYTES\n')])); fs.writeFileSync(p, o); },
    },
    {
      label: '乙: pure touch, zero bytes written',
      expect: /^乙 /,
      act: (p) => { const t = new Date(Date.now() + 5000); fs.utimesSync(p, t, t); },
    },
    {
      // The case that produced a wrong 甲 before: bytes never change, but the ID does.
      label: '甲-RENAME: rename-based write, bytes byte-identical (sed -i shape)',
      expect: /^甲-RENAME/,
      act: (p) => { const o = fs.readFileSync(p); const tmp = `${p}.tmp`; fs.writeFileSync(tmp, o); fs.renameSync(tmp, p); },
    },
    {
      label: 'control: nothing at all happens',
      expect: /^INCONCLUSIVE -- zero records/,
      act: () => {},
    },
  ];

  console.log('\n=== self-test (scratch files; known answers) ===');
  const outcomes = [];
  for (const [i, c] of cases.entries()) {
    const target = path.join(dir, `case-${i}-SKILL.md`);
    fs.writeFileSync(target, 'baseline bytes\n');
    const idAtOpen = fileId(target);          // captured BEFORE the act -- failure mode 2
    const startUsn = journalBounds().nextUsn; // mark AFTER creation, so setup is excluded
    c.act(target);
    const result = classify({ label: c.label, idAtOpen, target, startUsn, coveredFrom: earliest });
    report(result);
    const ok = c.expect.test(result.verdict);
    console.log(`    self-test: ${ok ? 'AS EXPECTED' : `MISMATCH -- expected ${c.expect}`}`);
    outcomes.push(ok);
  }

  // A decoy with the SAME basename in an unsampled location, written-and-restored, while the
  // real file is only touched. Attribution by basename answers 甲 here (wrong, and wrong in the
  // direction that agrees with VOID); attribution by ID answers 乙.
  console.log('\n=== scope check: same basename elsewhere on the volume ===');
  const real = path.join(dir, 'real', 'SKILL.md');
  const decoy = path.join(dir, 'decoy', 'SKILL.md');
  for (const p of [real, decoy]) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'baseline bytes\n'); }
  const realId = fileId(real);
  const mark = journalBounds().nextUsn;
  const t = new Date(Date.now() + 5000);
  fs.utimesSync(real, t, t);                                    // real file: 乙
  const o = fs.readFileSync(decoy);
  fs.writeFileSync(decoy, Buffer.concat([o, Buffer.from('X')]));
  fs.writeFileSync(decoy, o);                                   // decoy: 甲
  const byId = classify({ label: `real file, attributed by ID (${realId})`, idAtOpen: realId, target: real, startUsn: mark, coveredFrom: earliest });
  report(byId);
  const byName = recordsForName(mark, 'SKILL.md')   // deliberately the WRONG key -- see recordsForName
    .some((r) => DATA_BITS.test(r.reason ?? ''));
  console.log(`\n    by ID   -> ${/^乙 /.test(byId.verdict) ? '乙 (correct)' : `${byId.verdict} (UNEXPECTED)`}`);
  console.log(`    by name -> ${byName ? '甲 (WRONG -- the decoy\'s writes were attributed to the real file)' : 'no DATA_* seen by name'}`);
  outcomes.push(/^乙 /.test(byId.verdict));

  fs.rmSync(dir, { recursive: true, force: true });
  const failed = outcomes.filter((o) => !o).length;
  console.log(`\n=== self-test: ${outcomes.length - failed}/${outcomes.length} as expected ===`);
  if (failed) console.log('  A probe whose self-test fails may not be cited for anything.');
  process.exit(failed ? 1 : 0);
}

if (args.includes('--query')) {
  // Attribute an event using an id captured EARLIER -- the case the header calls failure mode 2,
  // and the only mode that can answer "what already happened". `tree-snapshot.mjs --run` records
  // these at window open into `.snapshots/<digest>.ids.txt`; without such a record a rename-based
  // write is unattributable after the fact, because the pre-change binding is gone.
  //
  // `startusn` is NOT free-form: it must land on a record boundary or fsutil fails with error 87
  // ("parameter is incorrect"), which is why this reads from `firstUsn` -- a boundary by
  // construction -- and filters in JS rather than letting the caller invent an offset.
  const pairs = args.filter((a) => !a.startsWith('--'));
  if (pairs.length === 0) {
    console.log('\n--query needs "<label> <idhex>" pairs, or a path to a *.ids.txt sidecar.');
    process.exit(2);
  }
  const wanted = [];
  for (const arg of pairs) {
    if (fs.existsSync(arg) && fs.statSync(arg).isFile()) {
      for (const line of fs.readFileSync(arg, 'utf8').split(/\r?\n/)) {
        const [name, id] = line.trim().split(/\s+/);
        if (id && /^[0-9a-f]{16}$/i.test(id)) wanted.push({ name, id: id.toLowerCase() });
      }
    } else if (/^[0-9a-f]{16}$/i.test(arg)) {
      wanted.push({ name: arg, id: arg.toLowerCase() });
    } else {
      console.log(`  (skipping ${arg}: neither a readable file nor a 16-hex id)`);
    }
  }
  console.log(`\n=== attributing ${wanted.length} recorded id(s) -- ONE journal pass ===`);
  const { error: indexError, byId } = indexJournal(bounds.firstUsn);
  if (indexError) {
    console.log(`  INCONCLUSIVE (journal read failed: ${indexError})`);
    process.exit(1);
  }
  let attributed = 0;
  for (const { name, id } of wanted) {
    const rows = byId.get(id) ?? [];
    if (rows.length === 0) continue;   // untouched files are the overwhelming majority; stay quiet
    attributed++;
    console.log(`\n  ${name}  (id ${id})`);
    for (const r of rows) console.log(`    usn ${r.usn}  ${r.when}  ${r.name}  ${r.reason}`);
    console.log(`    => ${verdictFrom(rows, earliest)}`);
  }
  console.log(`\n  ${attributed} of ${wanted.length} recorded id(s) had journal records; the rest had none.`);
  console.log(`  Reminder: "none" means untouched OR older than ${earliest}. Those are different facts.`);
  process.exit(0);
}

if (targets.length === 0) {
  console.log('\nNo targets given. Pass file paths, or --self-test to falsify the probe itself.');
  console.log('NOTE: IDs are captured NOW, so a rename that already happened cannot be attributed');
  console.log('retroactively -- the pre-change binding is gone. Capture at window-open to avoid this.');
  process.exit(2);
}

console.log('\n=== classifying the given targets ===');
console.log('  (IDs captured now; startusn = journal head now. This answers "what happens next",');
console.log('   not "what already happened" -- for the latter the ID had to be captured earlier.)');
const startUsn = bounds.nextUsn;
for (const target of targets) {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) { console.log(`\n  ${target}\n    (no such file)`); continue; }
  report(classify({ label: target, idAtOpen: fileId(abs), target: abs, startUsn, coveredFrom: earliest }));
}
