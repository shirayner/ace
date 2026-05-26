import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

export const PLUGIN_NAME = 'ace';
export const MARKETPLACE_NAME = 'ace-local';
export const PLUGIN_SRC_DIR = path.join(__dirname, '..', '..', 'plugin');
export const PLUGIN_CACHE_DIR = path.join(CLAUDE_DIR, 'plugins', 'cache', MARKETPLACE_NAME, PLUGIN_NAME);
export const INSTALLED_PLUGINS_FILE = path.join(CLAUDE_DIR, 'plugins', 'installed_plugins.json');
export const KNOWN_MARKETPLACES_FILE = path.join(CLAUDE_DIR, 'plugins', 'known_marketplaces.json');
export const MARKETPLACE_DIR = path.join(CLAUDE_DIR, 'plugins', 'marketplaces', MARKETPLACE_NAME);
export const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

export const PRESETS = {
  full: ['core', 'rules', 'plugin', 'hooks', 'scripts', 'memory'],
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
  /^scripts\/statusline/,   // scripts/statusline*
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
 * @param {string} refPath - Reference path like '@~/.claude/rules/ace/thinking.md' or '~/.claude/hooks/ace.java-compile-check.sh'
 * @returns {boolean}
 */
export function isAceOwnedRef(refPath) {
  // Remove the @~/.claude/ or ~/.claude/ prefix if present
  const relativePath = refPath.replace(/^@?~\/\.claude\//, '');
  return isAceOwnedFile(relativePath);
}

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
    description: 'Ace plugin (skills: auto-goal, ut, code-review, skill-creator, skill-optimize; commands: report)',
    required: true,
    isPlugin: true,
  },
  hooks: {
    description: 'Hook scripts (safety guards + compile checks)',
    required: false,
    files: [
      { src: 'hooks/ace.bash-guard.sh', dest: 'hooks/ace.bash-guard.sh' },
      { src: 'hooks/ace.content-guard.sh', dest: 'hooks/ace.content-guard.sh' },
      { src: 'hooks/ace.file-guard.sh', dest: 'hooks/ace.file-guard.sh' },
      { src: 'hooks/ace.stop-verify.sh', dest: 'hooks/ace.stop-verify.sh' },
    ],
    conditional: [
      { src: 'hooks/ace.java-compile-check.sh', dest: 'hooks/ace.java-compile-check.sh', roles: ['backend', 'fullstack'] },
    ],
  },
  scripts: {
    description: 'Utility scripts (status line)',
    required: false,
    files: [
      { src: 'scripts/statusline-command.sh', dest: 'scripts/statusline-command.sh' },
      { src: 'scripts/statusline.py', dest: 'scripts/statusline.py' },
    ],
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
