// What does a *directory as backend* actually produce, end to end? Four readings, measured.
//
// The failing test asserts `typeof audit.spawn_error === 'string'` and gets
// `{"backend":null,"launched":false}` -- the `resolveBackend` early-return audit, which has no
// `spawn_error` field at all. So the test's stated premise ("the child gets a pid, so
// `resolveBackend` passes it through") is false on this platform. But WHICH step refuses it, and
// whether any input can reach the `child.on('error')` path, are separate questions. Guessing
// either one is how this defect got written; this probe answers both before anything is edited.
import { mkdirSync, mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveBackend } from '../../../../plugin/skills/auto-goal-v2/scripts/backend-resolve.mjs';
import { dispatchWorker } from '../../../../plugin/skills/auto-goal-v2/scripts/dispatch-worker.mjs';

const BIN = process.platform === 'win32' ? 'claude.exe' : 'claude';

async function dispatch(label, bin) {
  const root = await mkdtemp(join(tmpdir(), 'ace-probe-'));
  try {
    // resolveBackend first, in isolation: it is the step that decides whether a spawn happens.
    const resolved = resolveBackend({ PATH: '', ACE_CLAUDE_BIN: bin });
    let outcome;
    try {
      const { envelope, audit } = await dispatchWorker({
        taskRoot: root,
        dispatchId: 'd-probe01',
        objective: 'probe',
        env: { PATH: '', ACE_CLAUDE_BIN: bin },
      });
      outcome = {
        threw: false,
        status: envelope.status,
        reason: envelope.reason ?? null,
        code: envelope.code ?? null,
        launched: audit.launched,
        // The distinction the test cares about: is the key even PRESENT, vs present-and-null?
        spawn_error_present: 'spawn_error' in audit,
        spawn_error: audit.spawn_error ?? null,
        exit_code: 'exit_code' in audit ? audit.exit_code : '(absent)',
      };
    } catch (error) {
      outcome = { threw: true, message: String(error.message).slice(0, 120) };
    }
    console.log(`${label}\n  resolveBackend -> ${resolved ? JSON.stringify(resolved) : 'null'}\n  dispatch -> ${JSON.stringify(outcome)}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// 1. A directory named like the binary -- what the failing test uses.
const dirCase = join(mkdtempSync(join(tmpdir(), 'ace-dir-')), BIN);
mkdirSync(dirCase, { recursive: true });
await dispatch('[1] directory as backend (the failing test\'s input)', dirCase);

// 2. A path that does not exist at all -- the other pre-spawn refusal.
await dispatch('[2] nonexistent path', join(tmpdir(), 'ace-does-not-exist', BIN));

// 3. A real FILE that is not a valid executable image. This is the interesting one: `isFile`
//    passes it, so it SHOULD reach spawn and fail there -- i.e. the only input that can actually
//    populate `spawn_error`. If this is what produces it, the test's fix is to use this input.
const junkDir = mkdtempSync(join(tmpdir(), 'ace-junk-'));
const junkFile = join(junkDir, BIN);
writeFileSync(junkFile, 'not an executable image at all\n');
try { chmodSync(junkFile, 0o755); } catch { /* windows */ }
await dispatch('[3] real file, not a valid executable image', junkFile);

// 4. A file with an executable name but zero bytes -- a second non-image shape, in case [3]
//    happens to be interpreted as a script by the platform.
const emptyDir = mkdtempSync(join(tmpdir(), 'ace-empty-'));
const emptyFile = join(emptyDir, BIN);
writeFileSync(emptyFile, '');
try { chmodSync(emptyFile, 0o755); } catch { /* windows */ }
await dispatch('[4] zero-byte file with the backend name', emptyFile);
