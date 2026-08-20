/**
 * Resolve a spawnable clean-context worker backend.
 *
 * Windows constraint discovered by spike: `claude.cmd` / `claude.ps1` shims cannot be
 * spawned without `shell: true` (Node throws EINVAL), and `shell: true` would reintroduce
 * argument-quoting and injection hazards on a path that carries untrusted objective text.
 * So a shim is only ever used as a *pointer* to its sibling native binary; if that binary
 * is missing, the shim is not accepted.
 */

import { existsSync, statSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

const SHIM_RE = /\.(cmd|bat|ps1)$/i;

function isFile(candidate) {
  try {
    return existsSync(candidate) && statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function nativeBinaryName() {
  return process.platform === 'win32' ? 'claude.exe' : 'claude';
}

/** Map a shim path to the native binary the shim would exec. */
function nativeSiblingOf(shimPath) {
  const sibling = join(
    dirname(shimPath),
    'node_modules',
    '@anthropic-ai',
    'claude-code',
    'bin',
    nativeBinaryName(),
  );
  return isFile(sibling) ? sibling : null;
}

function* candidatePaths(env) {
  if (env.ACE_CLAUDE_BIN) yield env.ACE_CLAUDE_BIN;

  const extensions = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (env.PATH || '').split(delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) yield join(dir, `claude${extension}`);
  }

  // Last resort: the path of the CLI that launched the calling session.
  if (env.CLAUDE_CODE_EXECPATH) yield env.CLAUDE_CODE_EXECPATH;
}

/**
 * @returns {{bin: string, via: 'explicit'|'path'|'shim'|'execpath', shim?: string}|null}
 */
export function resolveBackend(env = process.env) {
  for (const candidate of candidatePaths(env)) {
    if (!isFile(candidate)) continue;

    if (SHIM_RE.test(candidate)) {
      const native = nativeSiblingOf(candidate);
      if (native) return { bin: native, via: 'shim', shim: candidate };
      continue; // A shim we cannot spawn directly is not a usable backend.
    }

    if (candidate === env.ACE_CLAUDE_BIN) return { bin: candidate, via: 'explicit' };
    if (candidate === env.CLAUDE_CODE_EXECPATH) return { bin: candidate, via: 'execpath' };
    return { bin: candidate, via: 'path' };
  }
  return null;
}

/**
 * Environment for a clean worker.
 *
 * Two independent jobs, both required:
 *
 * 1. Drop the parent session's identity vars. `CLAUDE_CODE_SESSION_ID` /
 *    `CLAUDE_CODE_CHILD_SESSION` would otherwise let the child associate itself with the
 *    caller's session.
 * 2. Drop `ANTHROPIC_AUTH_TOKEN`. Spike finding: when both it and `ANTHROPIC_API_KEY` are
 *    present, the auth token wins and, if it belongs to a different gateway than
 *    `ANTHROPIC_BASE_URL`, every request 401s and the CLI silently retries 11 times with
 *    backoff — which reads as a hang, not as an auth failure. Removing it makes the
 *    credential unambiguous.
 */
export function cleanEnv(env = process.env) {
  const stripped = [
    'ANTHROPIC_AUTH_TOKEN',
    'CLAUDECODE',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_EXECPATH',
  ];
  const next = { ...env };
  for (const key of stripped) delete next[key];
  return next;
}

/**
 * Fixed argv for an isolated, tool-less, history-free worker.
 *
 * Every flag is load-bearing:
 *   --bare                    skip CLAUDE.md, skills, plugins, hooks, MCP, auto-memory.
 *                             Spike: 170 ingested tokens with it vs 2498 without.
 *   --no-session-persistence  nothing on disk to later `--resume` into.
 *   --setting-sources ''      user/project/local settings cannot re-add context or tools.
 *   --tools ''                worker is a pure text transform; it cannot read or write.
 *   --output-format json      machine-parseable envelope with a usage block to audit.
 *   --system-prompt           replaces the default agent prompt with the worker contract.
 *
 * Absent by design: --resume, --continue, --session-id, --fork-session, --add-dir.
 */
export function buildArgs({ systemPrompt, model, jsonSchema, maxTurns = 1 }) {
  const args = [
    '-p',
    '--bare',
    '--no-session-persistence',
    '--setting-sources',
    '',
    '--tools',
    '',
    '--output-format',
    'json',
  ];
  if (systemPrompt) args.push('--system-prompt', systemPrompt);
  if (model) args.push('--model', model);
  if (jsonSchema) args.push('--json-schema', jsonSchema);
  if (maxTurns) args.push('--max-turns', String(maxTurns));
  return args;
}

/** Flags that would defeat isolation. Used to assert argv in tests and at dispatch time. */
export const FORBIDDEN_ARGS = Object.freeze([
  '--resume',
  '-r',
  '--continue',
  '-c',
  '--session-id',
  '--fork-session',
  '--teleport',
  '--add-dir',
]);

export function assertIsolatedArgs(args) {
  const violations = args.filter((arg) => FORBIDDEN_ARGS.includes(arg));
  if (violations.length > 0) {
    throw new Error(`INVARIANT_VIOLATED: isolation-defeating args present: ${violations.join(', ')}`);
  }
  for (const required of ['--bare', '--no-session-persistence', '--tools']) {
    if (!args.includes(required)) {
      throw new Error(`INVARIANT_VIOLATED: missing required isolation arg: ${required}`);
    }
  }
  return true;
}
