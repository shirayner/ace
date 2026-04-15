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
export const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

export const PRESETS = {
  full: ['core', 'rules', 'plugin', 'hooks', 'hookify', 'memory'],
  minimal: ['core', 'rules', 'plugin'],
  safe: ['core', 'rules', 'plugin', 'hookify', 'memory'],
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
    files: [
      { src: 'rules/ace/thinking.md', dest: 'rules/ace/thinking.md' },
      { src: 'rules/ace/clean-code.md', dest: 'rules/ace/clean-code.md' },
      { src: 'rules/ace/code-quality.md', dest: 'rules/ace/code-quality.md' },
      { src: 'rules/ace/reporting.md', dest: 'rules/ace/reporting.md' },
      { src: 'rules/ace/task-recovery.md', dest: 'rules/ace/task-recovery.md' },
      { src: 'rules/ace/context-hygiene.md', dest: 'rules/ace/context-hygiene.md' },
      { src: 'rules/ace/memory-policy.md', dest: 'rules/ace/memory-policy.md' },
    ],
  },
  plugin: {
    description: 'Ace plugin (skills: auto-goal, coding, skill-creator, skill-optimize; commands: report)',
    required: true,
    isPlugin: true,
  },
  hooks: {
    description: 'Hook scripts (optional, role-dependent)',
    required: false,
    conditional: [
      { src: 'hooks/ace.java-compile-check.sh', dest: 'hooks/ace.java-compile-check.sh', roles: ['backend', 'fullstack'] },
    ],
  },
  hookify: {
    description: 'Safety guard rules (block dangerous ops, protect secrets, require verification)',
    required: false,
    files: [
      { src: 'hookify/ace.hookify.block-dangerous-ops.local.md', dest: 'ace.hookify.block-dangerous-ops.local.md' },
      { src: 'hookify/ace.hookify.protect-secrets.local.md', dest: 'ace.hookify.protect-secrets.local.md' },
      { src: 'hookify/ace.hookify.require-verification.local.md', dest: 'ace.hookify.require-verification.local.md' },
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
