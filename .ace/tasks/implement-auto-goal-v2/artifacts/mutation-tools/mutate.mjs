// Mutation harness with self-verification.
//
// Guards against the two failure modes this task hit before:
//  1. silent no-op (needle present check is NOT enough — compare before/after)
//  2. reporting "applied" when the bytes on disk never changed
//
// Usage: node mutate.mjs <baseDir> <relFile> <oldFile> <newFile>
// Exit 0 = mutation truly applied; 9 = target missing; 8 = void (no byte change).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const [baseDir, relFile, oldFile, newFile] = process.argv.slice(2);
const file = path.join(baseDir, relFile);
const before = readFileSync(file, 'utf8');
const old = readFileSync(oldFile, 'utf8');
const neu = readFileSync(newFile, 'utf8');

if (!before.includes(old)) {
  console.error(`PATCH-TARGET-MISSING ${relFile}`);
  process.exit(9);
}
const occurrences = before.split(old).length - 1;
const after = before.replace(old, neu);
if (after === before) {
  console.error(`VOID-MUTATION ${relFile} (replace produced identical bytes)`);
  process.exit(8);
}
writeFileSync(file, after, 'utf8');
const reread = readFileSync(file, 'utf8');
if (reread === before) {
  console.error(`VOID-MUTATION ${relFile} (disk unchanged after write)`);
  process.exit(8);
}
console.error(
  `APPLIED ${relFile} occurrences=${occurrences} bytes ${before.length}->${reread.length}`
);
