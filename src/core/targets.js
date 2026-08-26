import path from 'path';
import os from 'os';
import { CLAUDE_DIR, AGENTS_HOME, CANONICAL_SKILLS_DIR } from './constants.js';

/**
 * Install targets: the agent tools ACE can install into.
 *
 * ── Why this shape ───────────────────────────────────────────────────────────────
 * The naive reading of "support N tools" is "write N installers". It is not: the tools
 * differ along only two axes, and everything else is shared.
 *
 *   1. Where skills are read from   → `skillsDir`
 *   2. How they have to get there   → `projection`
 *
 * Three tools (Codex, OpenCode, DeepSeek Harness) read the shared cross-agent root
 * `~/.agents/skills` natively. For them the projection is `none`: ACE writes the canonical
 * store once and all three see it. No copies, no links, no per-tool code.
 *
 * ── Why the canonical store preserves categories ─────────────────────────────────
 * Native consumers recurse under `~/.agents/skills`, so ACE installs its skills below
 * `ace-<category>/`. Claude Code and Kiro keep dedicated flat deployment paths because their
 * loaders have different constraints; those projections do not dictate the shared layout.
 *
 * ── Evidence ─────────────────────────────────────────────────────────────────────
 * Every `skillsDir` / `scanDepth` below was verified on a real machine (probe skills
 * planted in ~/.agents/skills, plus provider source and shipped binaries) rather than
 * taken from documentation. `verifiedBy` records how, so a future reader can re-check
 * instead of trusting a comment.
 */

/** Projection modes, in order of preference. */
export const PROJECTION = {
  /** Target reads the canonical store directly — nothing to do. */
  NONE: 'none',
  /** Directory link into the target's own skills dir (junction on Windows). */
  LINK: 'link',
  /** Physical copy — for targets whose loader mishandles links. */
  COPY: 'copy',
  /** Target has its own plugin registry with its own metadata files. */
  REGISTRY: 'registry',
};

export const TARGETS = {
  'claude-code': {
    label: 'Claude Code',
    // Claude Code has no ~/.agents support (still an open feature request upstream), and
    // ACE's own plugin/commands namespace (/ace:*) depends on the marketplace mechanism,
    // so this target keeps its dedicated registry path rather than sharing the store.
    home: CLAUDE_DIR,
    skillsDir: path.join(CLAUDE_DIR, 'skills'),
    instructions: path.join(CLAUDE_DIR, 'CLAUDE.md'),
    instructionRoot: '~/.claude',
    projection: PROJECTION.REGISTRY,
    scanDepth: 1,
    detect: [CLAUDE_DIR],
    verifiedBy: "ACE's existing installer + plugin cache layout",
  },

  codex: {
    label: 'Codex',
    home: path.join(os.homedir(), '.codex'),
    skillsDir: CANONICAL_SKILLS_DIR,
    instructions: path.join(os.homedir(), '.codex', 'AGENTS.md'),
    instructionRoot: '~/.codex',
    projection: PROJECTION.NONE,
    scanDepth: Infinity,
    detect: [path.join(os.homedir(), '.codex')],
    verifiedBy: 'probe: both flat and nested probes discovered, with no copy or link in ~/.codex/skills',
  },

  opencode: {
    label: 'OpenCode',
    // Note: ~/.opencode is only an npm install dir; config lives in ~/.config/opencode.
    home: path.join(os.homedir(), '.config', 'opencode'),
    skillsDir: CANONICAL_SKILLS_DIR,
    instructions: path.join(os.homedir(), '.config', 'opencode', 'AGENTS.md'),
    instructionRoot: '~/.config/opencode',
    projection: PROJECTION.NONE,
    scanDepth: Infinity,
    detect: [path.join(os.homedir(), '.config', 'opencode'), path.join(os.homedir(), '.opencode')],
    verifiedBy: 'binary: scans [".claude", ".agents"] with glob skills/**/SKILL.md, symlink:true',
  },

  'deepseek-harness': {
    label: 'DeepSeek Harness',
    home: path.join(os.homedir(), '.dsh'),
    skillsDir: CANONICAL_SKILLS_DIR,
    instructions: path.join(AGENTS_HOME, 'AGENTS.md'),
    instructionRoot: '~/.agents',
    projection: PROJECTION.NONE,
    scanDepth: Infinity,
    detect: [path.join(os.homedir(), '.dsh'), AGENTS_HOME],
    verifiedBy: 'environment evidence: nested skills under ~/.agents/skills are discovered',
  },

  kiro: {
    label: 'Kiro',
    home: path.join(os.homedir(), '.kiro'),
    skillsDir: path.join(os.homedir(), '.kiro', 'skills'),
    instructions: path.join(os.homedir(), '.kiro', 'AGENTS.md'),
    instructionRoot: '~/.kiro',
    // Kiro reads its own ~/.kiro/skills and is reported to mishandle links pointing into
    // .agents, so it gets physical copies. Correctness beats deduplication here: a link
    // the loader silently skips looks exactly like a failed install.
    projection: PROJECTION.COPY,
    scanDepth: 1,
    detect: [path.join(os.homedir(), '.kiro')],
    verifiedBy: 'directory probe: uses ~/.kiro/skills, no ~/.agents discovery',
  },
};

/** Stable display order for prompts and reports. */
export const TARGET_ORDER = [
  'claude-code',
  'codex',
  'opencode',
  'deepseek-harness',
  'kiro',
];

/** Targets that need no projection because they read the canonical store natively. */
export function nativeTargets() {
  return TARGET_ORDER.filter(id => TARGETS[id].projection === PROJECTION.NONE);
}

/**
 * Resolve target ids to their definitions, rejecting unknown ids loudly.
 *
 * A typo'd target would otherwise install nothing and report success.
 *
 * @param {string[]} ids
 * @returns {Array<{id: string} & object>}
 */
export function resolveTargets(ids) {
  return ids.map(id => {
    const target = TARGETS[id];
    if (!target) {
      throw new Error(
        `Unknown install target "${id}". Known targets: ${TARGET_ORDER.join(', ')}.`
      );
    }
    return { id, ...target };
  });
}

/**
 * Which targets look present on this machine.
 *
 * Detection drives pre-checked prompt defaults only — never a silent skip. A tool
 * installed after ACE would otherwise be excluded forever with no way to notice.
 *
 * @param {(p: string) => Promise<boolean>} exists - Path predicate (injected for tests).
 * @returns {Promise<string[]>} detected target ids in display order
 */
export async function detectTargets(exists) {
  const found = [];
  for (const id of TARGET_ORDER) {
    const paths = TARGETS[id].detect ?? [];
    for (const dir of paths) {
      if (await exists(dir)) {
        found.push(id);
        break;
      }
    }
  }
  return found;
}
