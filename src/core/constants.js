import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

/**
 * The cross-agent skill root used by recursive consumers such as Codex and OpenCode.
 * `$DSH_AGENTS_HOME` is retained for compatibility with users who relocated this shared root.
 */
export const AGENTS_HOME = path.resolve(
  process.env.DSH_AGENTS_HOME || path.join(os.homedir(), '.agents')
);
export const CANONICAL_SKILLS_DIR = path.join(AGENTS_HOME, 'skills');

/** DeepSeek Harness' private root. Its skill loader only scans direct child directories. */
export const DSH_HOME = path.resolve(
  process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
);
export const DSH_SKILLS_DIR = path.join(DSH_HOME, 'skills');

// ace's own global config lives outside ~/.claude/ so it survives Claude Code resets
export const ACE_HOME = path.join(os.homedir(), '.ace');
export const ACE_CONFIG_DIR = path.join(ACE_HOME, 'config');
export const SKILLS_SELECTION_FILE = path.join(ACE_CONFIG_DIR, 'skills-selection.json');

export const PLUGIN_NAME = 'ace';
export const MARKETPLACE_NAME = 'ace-local';
export const PLUGIN_SRC_DIR = path.join(__dirname, '..', '..', 'plugin');
export const PLUGIN_SKILLS_SRC_DIR = path.join(PLUGIN_SRC_DIR, 'skills');
export const PLUGIN_CACHE_DIR = path.join(CLAUDE_DIR, 'plugins', 'cache', MARKETPLACE_NAME, PLUGIN_NAME);
export const INSTALLED_PLUGINS_FILE = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
export const KNOWN_MARKETPLACES_FILE = path.join(CLAUDE_DIR, 'plugins', 'known_marketplaces.json');
export const MARKETPLACE_DIR = path.join(CLAUDE_DIR, 'plugins', 'marketplaces', MARKETPLACE_NAME);
export const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

export const PRESETS = {
  full: ['core', 'rules', 'plugin', 'memory'],
  minimal: ['core', 'rules', 'plugin'],
  safe: ['core', 'rules', 'plugin', 'memory'],
};

export const ROLES = {
  backend: {
    label: 'Backend Developer',
    description: 'Java/Go/Python backend, microservices, APIs',
    primaryLang: 'Java',
    hooks: ['ace.java-compile-check.sh'],
  },
  frontend: {
    label: 'Frontend Developer',
    description: 'React/Vue/TypeScript, Web UI, SPA/SSR',
    primaryLang: 'TypeScript',
    hooks: [],
  },
  client: {
    label: 'Client Developer',
    description: 'iOS/Android/Flutter, mobile apps',
    primaryLang: 'Kotlin/Swift',
    hooks: [],
  },
  fullstack: {
    label: 'Fullstack Developer',
    description: 'Full-stack development, frontend + backend',
    primaryLang: 'TypeScript + Java',
    hooks: ['ace.java-compile-check.sh'],
  },
};

// Spec (project-level) constants
export const OPENSPEC_TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates', 'openspec');
export const SPEC_TEMPLATE_FILES = [
  'dimensions.md',
];

/**
 * Patterns for files owned by ACE - these are overwritten directly on init without prompting.
 * Used to identify ACE-owned content in ace/ and hooks/.
 */
export const ACE_OWNED_PATTERNS = [
  /^ace\/rules\//,          // ace/rules/*.md (v2.0+)
  /^rules\/ace\//,          // rules/ace/*.md (legacy, for migration detection)
  /^hooks\/ace\./,          // hooks/ace.*.sh
];

/**
 * Check if a file path (relative to ~/.claude/) is owned by ACE.
 * @param {string} relativePath - Path like 'rules/ace/thinking.md' or 'hooks/ace.java-compile-check.sh'
 * @returns {boolean}
 */
export function isAceOwnedFile(relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  return ACE_OWNED_PATTERNS.some(pattern => pattern.test(normalized));
}

/**
 * Check if an @reference path is owned by ACE.
 *
 * The instruction-root prefix is stripped generically rather than matched against
 * `~/.claude/` alone: the same rules are now referenced from per-tool instruction files
 * (`~/.codex/AGENTS.md`, `~/.agents/AGENTS.md`, ...), and a prefix-specific test would
 * silently stop recognizing ACE's own refs there — leaving obsolete refs uncleaned.
 *
 * @param {string} refPath - Reference like '@~/.claude/ace/rules/thinking.md' or '~/.codex/ace/rules/thinking.md'
 * @returns {boolean}
 */
export function isAceOwnedRef(refPath) {
  // Strip a leading '@' and any '~/.<tool>/' instruction-root prefix.
  const relativePath = refPath
    .replace(/^@/, '')
    .replace(/^~\/\.[^/]+\//, '');
  return isAceOwnedFile(relativePath);
}

/**
 * Skill categories — presentation metadata only.
 *
 * Category membership is NOT listed here: it comes from the directory layout
 * `plugin/skills/<category>/<skill>/SKILL.md`, so adding a skill means adding
 * one directory rather than editing a list that can drift out of sync.
 * See `skills-catalog.js` for discovery.
 *
 * Keys must match the directory names under `plugin/skills/`.
 * `recommended: true` categories are pre-checked on a fresh install.
 */
export const SKILL_CATEGORIES = {
  coding: {
    label: 'Coding',
    description: 'Spec-driven development, review, testing, requirements & design',
    recommended: true,
  },
  general: {
    label: 'General',
    description: 'Open-ended goal orchestration and research',
    recommended: true,
  },
  meta: {
    label: 'Meta',
    description: 'Authoring and optimizing skills themselves',
    recommended: true,
  },
  docs: {
    label: 'Docs',
    description: 'Document workflows and image generation',
    recommended: true,
  },
};

/** Category display order for interactive prompts. */
export const SKILL_CATEGORY_ORDER = ['coding', 'general', 'meta', 'docs'];

export const COMPONENTS = {
  core: {
    description: 'Core config (CLAUDE.md + settings.json)',
    required: true,
    files: [
      { src: 'CLAUDE.md', dest: 'CLAUDE.md', merge: 'claude-md' },
      { src: 'settings.json', dest: 'settings.json', merge: 'settings-json' },
    ],
  },
  rules: {
    description: 'Cognitive & code quality rules',
    required: true,
    rulesDir: 'ace/rules',
  },
  plugin: {
    description: 'Ace plugin (skills grouped by category: coding, general, meta, docs; commands: report)',
    required: true,
    isPlugin: true,
  },
  hooks: {
    description: 'Hook scripts (safety guards + compile checks)',
    required: false,
    files: [],
    conditional: [],
  },
  memory: {
    description: 'Global memory templates',
    required: false,
    files: [
      { src: 'memory/MEMORY.md', dest: 'memory/MEMORY.md', merge: 'skip-existing' },
    ],
    roleTemplates: true,
  },
};
