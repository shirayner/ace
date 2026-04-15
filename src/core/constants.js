import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CLAUDE_DIR = path.join(os.homedir(), '.claude');
export const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'templates');

export const PRESETS = {
  full: ['core', 'rules', 'skills', 'hooks', 'hookify', 'memory', 'commands'],
  minimal: ['core', 'rules', 'skills'],
  safe: ['core', 'rules', 'skills', 'hookify', 'memory'],
};

export const ROLES = {
  backend: {
    label: 'Backend Developer',
    description: 'Java/Go/Python backend, microservices, APIs',
    primaryLang: 'Java',
    hooks: ['java-compile-check.sh'],
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
    hooks: ['java-compile-check.sh'],
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
      { src: 'rules/thinking.md', dest: 'rules/thinking.md' },
      { src: 'rules/clean-code.md', dest: 'rules/clean-code.md' },
      { src: 'rules/code-quality.md', dest: 'rules/code-quality.md' },
      { src: 'rules/reporting.md', dest: 'rules/reporting.md' },
      { src: 'rules/task-recovery.md', dest: 'rules/task-recovery.md' },
      { src: 'rules/context-hygiene.md', dest: 'rules/context-hygiene.md' },
      { src: 'rules/memory-policy.md', dest: 'rules/memory-policy.md' },
    ],
  },
  skills: {
    description: 'AI skills (auto-goal, coding, skill-creator, skill-optimize)',
    required: true,
    directories: [
      'skills/auto-goal',
      'skills/coding',
      'skills/skill-creator',
      'skills/skill-optimize',
    ],
  },
  hooks: {
    description: 'Hook scripts (optional, role-dependent)',
    required: false,
    conditional: [
      { src: 'hooks/java-compile-check.sh', dest: 'hooks/java-compile-check.sh', roles: ['backend', 'fullstack'] },
    ],
  },
  hookify: {
    description: 'Safety guard rules (block dangerous ops, protect secrets, require verification)',
    required: false,
    files: [
      { src: 'hookify/hookify.block-dangerous-ops.local.md', dest: 'hookify.block-dangerous-ops.local.md' },
      { src: 'hookify/hookify.protect-secrets.local.md', dest: 'hookify.protect-secrets.local.md' },
      { src: 'hookify/hookify.require-verification.local.md', dest: 'hookify.require-verification.local.md' },
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
  commands: {
    description: 'Custom commands (report)',
    required: false,
    files: [
      { src: 'commands/report.md', dest: 'commands/report.md' },
    ],
  },
};
