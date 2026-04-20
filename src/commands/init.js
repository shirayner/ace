import * as p from '@clack/prompts';
import { createRequire } from 'module';
import { PRESETS, COMPONENTS } from '../core/constants.js';
import { Installer } from '../core/installer.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const componentLabels = {
  core: 'Core Config',
  rules: 'Rules',
  plugin: 'Plugin',
  hooks: 'Hooks',
  hookify: 'Safety Guards',
  memory: 'Memory',
};

export async function initCommand(options) {
  const version = pkg.version;
  const components = PRESETS['full'];

  // ─── Intro ──────────────────────────────────────────────
  p.intro(`ace v${version}`);

  // ─── Conflict detection ─────────────────────────────────
  const installer = new Installer({
    force: options.force,
    dryRun: options.dryRun,
    role: 'fullstack',
    components,
    quiet: true,
  });

  let resolutions = {};

  if (!options.force) {
    const conflicts = await installer.detectConflicts();
    const conflictKeys = Object.keys(conflicts);

    if (conflictKeys.length > 0) {
      const totalFiles = conflictKeys.reduce((sum, k) => sum + conflicts[k].files.length, 0);
      const mergeComponents = conflictKeys.filter(k => conflicts[k].hasMerge);

      if (mergeComponents.length > 0) {
        p.log.info('Safe merge: CLAUDE.md, settings.json (preserves your changes)');
      }
      if (totalFiles > 0) {
        p.log.warn(`${totalFiles} existing file(s) found`);
      }

      const action = await p.select({
        message: 'How to handle existing files?',
        options: [
          { value: 'skip', label: 'Keep & merge', hint: 'recommended' },
          { value: 'overwrite', label: 'Overwrite all', hint: 'replace with latest' },
          { value: 'cancel', label: 'Cancel' },
        ],
        initialValue: 'skip',
      });

      if (p.isCancel(action) || action === 'cancel') {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      for (const key of conflictKeys) {
        resolutions[key] = action;
      }
    }
  }

  installer.resolutions = resolutions;

  // ─── Dry-run notice ─────────────────────────────────────
  if (options.dryRun) {
    p.log.warn('dry-run — no changes will be made');
  }

  // ─── Install ────────────────────────────────────────────
  p.log.step('Installing to ~/.claude/');

  for (const componentName of components) {
    const component = COMPONENTS[componentName];
    if (!component) continue;

    const label = componentLabels[componentName] || componentName;
    const beforeInstalled = installer.results.installed.length;
    const beforeMerged = installer.results.merged.length;
    const beforeSkipped = installer.results.skipped.length;

    const s = p.spinner();
    s.start(label);

    try {
      await installer.installComponent(componentName, component);
      s.stop(label);

      const newInstalled = installer.results.installed.length - beforeInstalled;
      const newMerged = installer.results.merged.length - beforeMerged;
      const newSkipped = installer.results.skipped.length - beforeSkipped;

      if (newMerged > 0 && newInstalled === 0 && newSkipped === 0) {
        p.log.info(`${label} — merged`);
      } else if (newSkipped > 0 && newInstalled === 0 && newMerged === 0) {
        p.log.message(`${label} — unchanged`);
      } else {
        const count = newInstalled + newMerged;
        const detail = count > 0 ? `${count} file${count > 1 ? 's' : ''}` : '';
        p.log.success(`${label} — ${detail}`);
      }
    } catch (err) {
      s.stop(label);
      p.log.error(`${label} — ${err.message}`);
      installer.results.errors.push({ component: componentName, error: err.message });
    }
  }

  // ─── Summary ────────────────────────────────────────────
  const { installed, merged, skipped, errors } = installer.results;
  const parts = [];
  if (installed.length > 0) parts.push(`${installed.length} installed`);
  if (merged.length > 0) parts.push(`${merged.length} merged`);
  if (skipped.length > 0) parts.push(`${skipped.length} skipped`);

  if (errors.length === 0) {
    p.log.success(parts.join(', '));
  } else {
    p.log.warn(`${parts.join(', ')}, ${errors.length} failed`);
  }

  // ─── Next Steps ─────────────────────────────────────────
  p.note(
    [
      'Get started',
      '  1. cd <your-project> && ace spec init',
      '  2. Open Claude Code, type: /opsx:propose 创建需求提案',
      '',
      'Customize',
      '  Change role      edit ~/.claude/memory/user_profile.md',
      '  Adjust rules     edit ~/.claude/rules/ace/',
      '  Safety guards    edit ~/.claude/hookify.ace.*.local.md',
      '  Verify setup     ace doctor',
    ].join('\n'),
    'Next steps'
  );

  // ─── Outro ──────────────────────────────────────────────
  if (errors.length === 0) {
    p.outro('Done. Go to your project and run ace spec init.');
  } else {
    p.outro('Done with errors. Run ace doctor to diagnose.');
  }
}
