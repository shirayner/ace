/**
 * Which files in the skill tree moved in the last N seconds? A LOCATING AID, NOT WINDOW EVIDENCE.
 *
 * Written because a read window closed on me mid-edit (`f1713d5c3280` -> `4abd9e4f2717`) and per
 * D7 其七 the honest response is to NAME the drifted files, not to say "something changed". A
 * digest difference alone cannot tell me whether the drift could touch a mechanism I just cited;
 * the file list can.
 *
 * WHAT THIS CANNOT DO -- team-lead's correction, and the reason for every guard below.
 *
 * An empty result over a window has two readings that are indistinguishable in the output: nobody
 * wrote during the window, or somebody wrote during it and wrote again afterwards. mtime records
 * only the LAST write, so the second history erases itself. v2-review quantified the decay on this
 * tree: blindness 0/89 at the moment of close, 1/89 at +3 min, 4/89 at +6.5 min, 8/89 at +28 min,
 * monotonically increasing and never shrinking.
 *
 * The danger is not the miss. It is that the miss arrives as a clean empty set, which reads as
 * confirmation: forgetting to take a snapshot leaves nothing to cite, whereas a late backscan
 * hands you "no writes in the window" to write down. That is the fourth shape of the false skip --
 * F1/F2/F10 were gates announcing "not applicable here", this one is a scan announcing "nobody
 * wrote here", and in both the announced state's own precondition is checked by nothing.
 *
 * So: window integrity comes from `tree-snapshot.mjs --run` (snapshots taken INSIDE the window, one
 * at each edge). That is a difference in kind, not in rigour -- a snapshot answers "what is the
 * tree right now", a backscan answers "has nobody written since", and the second answer rots.
 *
 * This tool therefore refuses to be quoted as verification: it prints its own lag behind any window
 * close you name, and states the measured blindness at that lag.
 *
 *   node recent-writes.mjs [windowSeconds] [--closed-at <ISO|epochMs>]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..', '..', '..', 'plugin', 'skills', 'auto-goal-v2');

const args = process.argv.slice(2);
const closedAtArg = args.includes('--closed-at') ? args[args.indexOf('--closed-at') + 1] : null;
const WINDOW_S = Number(args.find(a => /^\d+$/.test(a)) ?? 1200);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const now = Date.now();
const files = walk(ROOT);
const hits = [];
for (const file of files) {
  const age = (now - fs.statSync(file).mtimeMs) / 1000;
  if (age < WINDOW_S) hits.push([age, path.relative(ROOT, file).replace(/\\/g, '/')]);
}
hits.sort((a, b) => a[0] - b[0]);
for (const [age, rel] of hits) console.log(`${String(Math.round(age)).padStart(5)}s ago  ${rel}`);
console.log(`\n${hits.length} of ${files.length} file(s) written in the last ${WINDOW_S}s`);

/**
 * Blindness measured by v2-review on this tree, as (lag seconds -> files whose in-window write is
 * no longer visible). Interpolation would invent precision these four points do not have, so the
 * nearest measured point at or below the lag is reported, and anything past the last point is
 * reported as "at least" -- the curve is monotone, so that bound holds.
 */
const DECAY = [[0, 0], [180, 1], [390, 4], [1680, 8]];

if (closedAtArg) {
  const closedMs = /^\d+$/.test(closedAtArg) ? Number(closedAtArg) : Date.parse(closedAtArg);
  if (Number.isNaN(closedMs)) {
    console.error(`\n--closed-at could not be parsed: ${closedAtArg}`);
    process.exit(2);
  }
  const lagS = Math.round((now - closedMs) / 1000);
  const [point, blind] = DECAY.filter(([s]) => s <= lagS).at(-1) ?? DECAY[0];
  const bound = lagS > DECAY.at(-1)[0] ? 'at least ' : '';
  console.log(`\nBACKSCAN, LAGGING WINDOW CLOSE BY ${lagS}s.`);
  console.log(`At this lag the measured blindness is ${bound}${blind}/89 files (nearest measured point: +${point}s).`);
  console.log('Cite this as "backscan at <time>, lagging close by ' + lagS + 's", never as "window verified".');
} else {
  console.log('\nNo --closed-at given, so this output has NO stated lag and cannot be cited against any window.');
  console.log('Window integrity comes from `tree-snapshot.mjs --run`; this list only helps name suspects.');
}

/**
 * Not every write here is a product change. v2-review saw `schemas/registry.mjs` written at
 * 04:29:10 and inferred somebody was editing product code; it was team-lead's own sensitivity
 * probe appending one byte and restoring it, mtime identical to the millisecond. Part of "the tree
 * is moving" is other people looking at it, and that fact is not recorded anywhere in the tree.
 * Worth stating on every run, and worth most on a flake hunt, where observer disturbance is the
 * easiest thing in the world to read as signal.
 */
console.log('Before reporting any name above as a product change, ask whether it is somebody\'s probe:');
console.log('a byte-appended-then-restored file shows as written here and as TOUCHED (bytes identical) in tree-snapshot.');
