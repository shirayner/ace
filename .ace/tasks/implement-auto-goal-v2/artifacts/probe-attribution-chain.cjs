/**
 * Check whether the `SKILL.md` attribution chain actually closes.
 *
 * The chain under test: "SKILL.md's mtime moves are pure touches by some `utimesSync(Date)`
 * caller, because (i) every mtime it took this session is an integral millisecond, (ii) only
 * `utimesSync(Date)` produces integral milliseconds, and (iii) the USN journal shows only
 * BASIC_INFO_CHANGE with zero DATA_* bits."
 *
 * Each leg is checkable against data already on this disk, so none of it needs to be argued:
 *
 *   L1  Are the mtimes integral? -> read every historical snapshot, full precision.
 *   L2  Is integral-ms a signature of `utimesSync`? -> perform each candidate write and look.
 *   L3  Does the journal reach back far enough to cover the moves? -> compare its earliest
 *       record's wall clock against each move, and count EVENTS rather than records.
 *
 * Why this exists as a probe and not as a paragraph: the original chain was built on a clue I
 * reported from a SINGLE sample ("the mtime is an integral millisecond") while simultaneously
 * declaring the cause unknown. The 11 snapshots that refute it were already on disk. An
 * unfalsified clue adopted downstream as a premise is worse than an explicit "unknown",
 * because it reads as settled. So the refutation has to be re-runnable, not narrated.
 *
 * Reports PASS/FAIL per leg and exits non-zero if any leg fails, so it can be re-run after
 * anyone claims the chain is closed.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SNAP_DIR = path.join(__dirname, '.snapshots');
const SKILL_MD = path.resolve(__dirname, '..', '..', '..', '..', 'plugin', 'skills', 'auto-goal-v2', 'SKILL.md');
const VOLUME = 'D:';
const failures = [];

const isIntegral = (ms) => ms - Math.floor(ms) === 0;

// ---------------------------------------------------------------- L1: are they integral?
console.log('=== L1: every SKILL.md mtime on record, at full precision ===');
const seen = new Map();
for (const file of fs.readdirSync(SNAP_DIR).filter((f) => f.endsWith('.txt'))) {
  const line = fs
    .readFileSync(path.join(SNAP_DIR, file), 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('SKILL.md '));
  if (!line) continue;
  const [, size, mtime, hash] = line.split(/\s+/);
  if (!seen.has(mtime)) seen.set(mtime, { size, hash, digest: file.replace('.txt', '') });
}

const mtimes = [...seen.keys()].map(Number).sort((a, b) => a - b);
for (const ms of mtimes) {
  const meta = seen.get(String(ms));
  const frac = ms - Math.floor(ms);
  console.log(
    `  ${String(ms).padEnd(22)} ${(isIntegral(ms) ? 'INTEGER' : `sub-ms .${String(frac.toFixed(4)).slice(2)}`).padEnd(14)}` +
      ` local ${new Date(ms).toLocaleString('sv-SE')}  size ${meta.size}  hash ${meta.hash}`,
  );
}
const integralCount = mtimes.filter(isIntegral).length;
console.log(`\n  ${mtimes.length} distinct mtimes, ${integralCount} integral, ${mtimes.length - integralCount} sub-ms`);

// The content question is separate from the mtime question, and it is the one that matters
// for whether a mechanism read from this file may be cited.
const hashes = new Set([...seen.values()].map((v) => v.hash));
console.log(`  distinct content hashes across all snapshots: ${hashes.size} (${[...hashes].join(', ')})`);

if (integralCount === mtimes.length) {
  console.log('  L1 PASS -- "all integral" holds, leg (i) of the chain stands');
} else {
  failures.push(`L1: "all mtimes are integral" is false -- ${mtimes.length - integralCount} of ${mtimes.length} carry sub-ms fractions`);
  console.log(`  L1 FAIL -- leg (i) does not hold for ${mtimes.length - integralCount} of ${mtimes.length} moves`);
}

// ------------------------------------------- L2: is integral-ms a signature of utimesSync?
console.log('\n=== L2: which writers produce integral-ms mtimes ===');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ace-mtime-fingerprint-'));
const probeWriter = (label, fn) => {
  const file = path.join(scratch, label.replace(/\W+/g, '_'));
  fs.writeFileSync(file, 'x');
  fn(file);
  const ms = fs.statSync(file).mtimeMs;
  console.log(`  ${label.padEnd(36)} ${String(ms).padEnd(22)} ${isIntegral(ms) ? 'INTEGER' : 'sub-ms'}`);
  return isIntegral(ms);
};

probeWriter('writeFileSync', () => {});
const utimesDateIntegral = probeWriter('utimesSync(new Date)', (f) => {
  const d = new Date();
  fs.utimesSync(f, d, d);
});
// The second argument is not restricted to a Date. Epoch seconds as a float carry sub-ms
// resolution, and that is the case the fingerprint claim overlooks.
const utimesFloatIntegral = probeWriter('utimesSync(epoch float w/ fraction)', (f) => {
  const t = Date.now() / 1000 + 0.4414;
  fs.utimesSync(f, t, t);
});
fs.rmSync(scratch, { recursive: true, force: true });

if (utimesDateIntegral && !utimesFloatIntegral) {
  failures.push(
    'L2: integral-ms is NOT a signature of utimesSync -- utimesSync with a fractional epoch ' +
      'produces sub-ms mtimes, so neither "integral => utimesSync" nor "sub-ms => not utimesSync" holds',
  );
  console.log('\n  L2 FAIL -- integral-ms tracks the ARGUMENT (`new Date` has ms resolution), not the CALLER.');
  console.log('  Both directions leak: utimesSync can produce sub-ms, and it is not the only integral producer.');
} else {
  console.log('\n  L2 PASS -- utimesSync produced integral ms regardless of argument shape');
}

// --------------------------------------- L3: does the journal cover the moves it is cited for?
console.log('\n=== L3: USN journal coverage vs the moves being attributed ===');
const REASONS = [
  [0x00000001, 'DATA_OVERWRITE'],
  [0x00000002, 'DATA_EXTEND'],
  [0x00000004, 'DATA_TRUNCATION'],
  [0x00000100, 'FILE_CREATE'],
  [0x00000200, 'FILE_DELETE'],
  [0x00008000, 'BASIC_INFO_CHANGE'],
  [0x80000000, 'CLOSE'],
];
const decode = (m) => REASONS.filter(([b]) => (m & b) === b).map(([, n]) => n).join('|') || `0x${m.toString(16)}`;

/** `fsutil` localises labels, so read the timestamp positionally by shape, never by label. */
const stamp = (chunk) => /:\s*(\d{4}\/\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}:\d{2})/.exec(chunk)?.[1] ?? '?';

// The real file's MFT reference. Matching on the NAME instead counts every `cpSync` copy that
// each mutation harness makes in tmpdir -- hundreds of records for a file nobody touched.
const fileIdRaw = execFileSync('fsutil', ['file', 'queryfileid', SKILL_MD], { encoding: 'latin1' });
const fileRef = /([0-9a-f]{16})\s*$/i.exec(fileIdRaw.trim())?.[1];
console.log(`  real SKILL.md MFT ref: ${fileRef}`);

const journal = execFileSync('fsutil', ['usn', 'readjournal', VOLUME, 'startusn=0'], {
  encoding: 'latin1',
  maxBuffer: 1 << 28,
});
const chunks = journal.split(/\r?\n\r?\n/).filter((c) => /Usn\s*:/.test(c));

let earliest = Infinity;
for (const c of chunks) {
  const u = Number(/Usn\s*:\s*(\d+)/.exec(c)[1]);
  if (u < earliest) earliest = u;
}
const earliestChunk = chunks.find((c) => Number(/Usn\s*:\s*(\d+)/.exec(c)[1]) === earliest);
const earliestStamp = stamp(earliestChunk);
console.log(`  journal holds ${chunks.length} records; earliest is usn ${earliest} at ${earliestStamp} (local)`);

const rows = [];
for (const c of chunks) {
  if (!/SKILL\.md/i.test(c)) continue;
  if (fileRef && !c.toLowerCase().includes(fileRef.toLowerCase())) continue;
  const masks = [...c.matchAll(/(0x[0-9a-f]{8}):/gi)].map((m) => Number(BigInt(m[1])) >>> 0);
  rows.push({ usn: /Usn\s*:\s*(\d+)/.exec(c)[1], ts: stamp(c), reason: masks.length ? decode(masks[0]) : null });
}

console.log(`\n  records for the REAL SKILL.md: ${rows.length}`);
for (const r of rows) console.log(`    usn ${r.usn}  ${r.ts}  ${r.reason ?? '(unparsed)'}`);

// Records are not events: one operation emits several (the change, then CLOSE). Counting
// records as events silently overstates how much of the history the journal explains.
const events = new Set(rows.map((r) => r.ts));
console.log(`  distinct EVENT timestamps: ${events.size} (records != events)`);

const earliestMs = new Date(earliestStamp.replace(/\//g, '-').replace(' ', 'T')).getTime();
let covered = 0;
console.log('\n  move-by-move coverage:');
for (const ms of mtimes) {
  const within = ms >= earliestMs;
  if (within) covered += 1;
  console.log(
    `    ${new Date(ms).toLocaleString('sv-SE')}  ${(isIntegral(ms) ? 'INTEGER' : 'sub-ms').padEnd(8)}` +
      `  ${within ? 'WITHIN journal' : 'BEFORE journal -- no record can exist'}`,
  );
}

const unparsed = rows.filter((r) => r.reason === null).length;
const anyData = rows.some((r) => /DATA_/.test(r.reason ?? ''));

if (unparsed > 0) {
  failures.push(`L3: ${unparsed} of ${rows.length} records had no readable reason mask -- the probe cannot classify them`);
  console.log(`\n  L3 INCONCLUSIVE -- ${unparsed} records unreadable; "no DATA_* bits" and "parsed nothing" look alike`);
} else if (covered < mtimes.length) {
  failures.push(
    `L3: the journal covers only ${covered} of ${mtimes.length} mtime moves (earliest record ${earliestStamp}); ` +
      `"zero DATA_* bits" is established for ${covered}, not for the rest`,
  );
  console.log(`\n  L3 FAIL -- ${mtimes.length - covered} of ${mtimes.length} moves predate the journal window.`);
  console.log(`  Zero-DATA_* therefore holds for ${covered} move(s) only. The rest have no evidence either way.`);
} else {
  console.log(`\n  L3 PASS -- all ${mtimes.length} moves fall inside the journal window`);
}
console.log(`  (DATA_* bits seen on the real file: ${anyData ? 'YES' : 'no'})`);

// ------------------------------------------------------------------------------- verdict
console.log('\n=== verdict ===');
if (failures.length === 0) {
  console.log('  chain CLOSED: every leg holds on this machine.');
} else {
  console.log(`  chain NOT closed -- ${failures.length} leg(s) fail:`);
  for (const f of failures) console.log(`    - ${f}`);
  console.log('\n  What survives regardless: SKILL.md\'s content hash is identical in every');
  console.log('  snapshot, so whatever moved the mtime never changed a byte. A mechanism read');
  console.log('  from that file may still be cited; only the CAUSE is open.');
}
process.exit(failures.length === 0 ? 0 : 1);
