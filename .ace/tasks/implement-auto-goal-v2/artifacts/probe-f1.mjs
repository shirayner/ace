import { mkdtemp, rm } from 'node:fs/promises';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { pathToFileURL } from 'node:url';

const SKILL = 'D:/Users/r.shi/work-space/incubator-mess/requirement-agent-skill/ace/plugin/skills/auto-goal-v2';
const u = (rel) => pathToFileURL(`${SKILL}/${rel}`).href;
const { resolveBackend } = await import(u('scripts/backend-resolve.mjs'));
const { dispatchWorker } = await import(u('scripts/dispatch-worker.mjs'));
const { LAUNCH_BUDGET_BYTES } = await import(u('scripts/ingest-audit.mjs'));

// ---- F1 reproduction: the current test's env (default process.env) on a no-backend machine
const noBackendEnv = { PATH: '' };
console.log('PREMISE resolveBackend({PATH:""}) =', JSON.stringify(resolveBackend(noBackendEnv)));

async function dispatch(env, label) {
  const root = await mkdtemp(join(tmpdir(), 'agv2-f1-'));
  try {
    const { envelope, audit } = await dispatchWorker({
      taskRoot: root,
      dispatchId: 'd-big',
      objective: 'q'.repeat(LAUNCH_BUDGET_BYTES + 1),
      ...(env === undefined ? {} : { env }),
    });
    console.log(`${label}: reason=${envelope.reason} backend=${audit.backend} launched=${audit.launched}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// (a) what the CI runner effectively does: no backend on the machine
await dispatch(noBackendEnv, 'F1 no-backend env  ');

// (b) proposed fix: a deterministic native backend that the budget gate rejects before spawn
console.log('PREMISE process.execPath =', process.execPath);
const withBackend = { PATH: '', ACE_CLAUDE_BIN: process.execPath };
console.log('PREMISE resolveBackend(withBackend) =', JSON.stringify(resolveBackend(withBackend)));
await dispatch(withBackend, 'F1 proposed fix env');

// ---- Item 6: a real claude.cmd with no native sibling must not be accepted
const shimDir = mkdtempSync(join(tmpdir(), 'agv2-shim-'));
const shim = join(shimDir, 'claude.cmd');
writeFileSync(shim, '@echo off\r\n');
console.log('\nPREMISE shim exists at', shim);
console.log('shim via ACE_CLAUDE_BIN  ->', JSON.stringify(resolveBackend({ PATH: '', ACE_CLAUDE_BIN: shim })));
console.log('shim via PATH           ->', JSON.stringify(resolveBackend({ PATH: shimDir })));
await rm(shimDir, { recursive: true, force: true });
