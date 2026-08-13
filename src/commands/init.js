import * as p from '@clack/prompts';
import path from 'path';
import fs from 'fs-extra';
import { createRequire } from 'module';
import { PRESETS, COMPONENTS, CLAUDE_DIR, TEMPLATES_DIR, isAceOwnedFile } from '../core/constants.js';
import { Installer } from '../core/installer.js';
import { mergeClaudeMd } from '../core/merger.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const componentLabels = {
  core: 'Core Config',
  rules: 'Rules',
  plugin: 'Plugin',
  hooks: 'Hooks',
  memory: 'Memory',
};

export async function initCommand(options) {
  const version = pkg.version;
  const components = PRESETS['full'];

  p.intro(`ace v${version}`);

  const installer = new Installer({
    force: options.force,
    dryRun: options.dryRun,
    role: 'fullstack',
    components,
    quiet: true,
  });

  let resolutions = {};

  // ─── Conflict detection with categorized preview ───
  if (!options.force) {
    const preview = await buildInstallPreview(installer, components);
    const hasExisting = preview.merge.length > 0 || preview.skip.length > 0 || preview.conflict.length > 0;

    if (hasExisting) {
      // Show safe merge section
      if (preview.merge.length > 0) {
        const mergeLines = preview.merge.map(m => `  ${m.dest} — ${m.detail}`);
        p.log.info(['Safe merge:', ...mergeLines].join('\n'));
      }

      // Show auto-skip section
      if (preview.skip.length > 0) {
        const skipLines = preview.skip.map(s => `  ${s} — preserves your data`);
        p.log.message(['Auto-skip:', ...skipLines].join('\n'));
      }

      // Show conflict section — overwrite by default
      if (preview.conflict.length > 0) {
        const conflictLines = preview.conflict.map(f => `  ${f}`);
        p.log.warn([`${preview.conflict.length} existing file(s) will be overwritten:`, ...conflictLines].join('\n'));

        for (const componentName of components) {
          resolutions[componentName] = 'overwrite';
        }
      }
    }
  }

  installer.resolutions = resolutions;

  if (options.dryRun) {
    p.log.warn('dry-run — no changes will be made');
  }

  // ─── Install with single spinner ───────────────────
  const s = p.spinner();
  const componentResults = [];

  s.start('Installing...');

  // Prepare: migrate legacy directory structure if needed
  if (!options.dryRun) {
    await installer.prepare();
  }

  for (const componentName of components) {
    const component = COMPONENTS[componentName];
    if (!component) continue;

    const label = componentLabels[componentName] || componentName;
    s.message(`Installing ${label}...`);

    const beforeInstalled = installer.results.installed.length;
    const beforeMerged = installer.results.merged.length;
    const beforeSkipped = installer.results.skipped.length;

    try {
      await installer.installComponent(componentName, component);
      componentResults.push({
        label,
        installed: installer.results.installed.length - beforeInstalled,
        merged: installer.results.merged.length - beforeMerged,
        skipped: installer.results.skipped.length - beforeSkipped,
        error: null,
      });
    } catch (err) {
      componentResults.push({
        label,
        installed: installer.results.installed.length - beforeInstalled,
        merged: installer.results.merged.length - beforeMerged,
        skipped: installer.results.skipped.length - beforeSkipped,
        error: err.message,
      });
      installer.results.errors.push({ component: componentName, error: err.message });
    }
  }

  s.stop('Installed to ~/.claude/');

  // ─── Summary table ─────────────────────────────────
  p.log.message(formatSummaryTable(componentResults));

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

  // ─── Next Steps ────────────────────────────────────
  p.note(
    [
      'Get started',
      '  1. cd <your-project>',
      '  2. Open Claude Code and type:',
      '       /spec-coding   spec-driven development',
      '       /auto-goal     general purpose tasks',
      '       /auto-goal-v2  evidence-driven goal controller',
      '',
      'Customize',
      '  Change role    edit ~/.claude/memory/user_profile.md',
      '  Adjust rules   edit ~/.claude/ace/rules/',
      '  Verify setup   ace doctor',
    ].join('\n'),
    'Next steps'
  );

  if (errors.length === 0) {
    p.outro('Done. Start using /ace:spec-coding or /ace:spechub-coding in your project.');
  } else {
    p.outro('Done with errors. Run ace doctor to diagnose.');
  }
}

// ─── Helpers ───────────────────────────────────────────

/**
 * Scan target directory and categorize existing files by handling strategy.
 */
async function buildInstallPreview(installer, components) {
  const preview = { merge: [], skip: [], conflict: [] };

  for (const componentName of components) {
    const component = COMPONENTS[componentName];
    if (!component || component.isPlugin) continue;

    if (component.files) {
      for (const file of component.files) {
        const destPath = path.join(installer.targetDir, file.dest);
        if (await fs.pathExists(destPath)) {
          if (file.merge === 'claude-md' || file.merge === 'settings-json') {
            preview.merge.push({ src: file.src, dest: file.dest, strategy: file.merge });
          } else if (file.merge === 'skip-existing') {
            preview.skip.push(file.dest);
          } else {
            preview.conflict.push(file.dest);
          }
        }
      }
    }

    if (component.rulesDir) {
      const srcDir = path.join(installer.templatesDir, component.rulesDir);
      const destDir = path.join(installer.targetDir, component.rulesDir);
      if (await fs.pathExists(srcDir)) {
        const files = (await fs.readdir(srcDir)).filter(f => f.endsWith('.md'));
        for (const f of files) {
          const relativePath = path.join(component.rulesDir, f).replace(/\\/g, '/');
          // ACE-owned files are overwritten directly, not shown as conflicts
          if (await fs.pathExists(path.join(destDir, f)) && !isAceOwnedFile(relativePath)) {
            preview.conflict.push(relativePath);
          }
        }
      }
    }

    if (component.conditional) {
      for (const file of component.conditional) {
        if (file.roles?.includes(installer.role)) {
          const destPath = path.join(installer.targetDir, file.dest);
          // ACE-owned files are overwritten directly, not shown as conflicts
          if (await fs.pathExists(destPath) && !isAceOwnedFile(file.dest)) {
            preview.conflict.push(file.dest);
          }
        }
      }
    }
  }

  // Enrich merge files with detail
  for (const item of preview.merge) {
    if (item.strategy === 'claude-md') {
      try {
        const existing = await fs.readFile(path.join(installer.targetDir, item.dest), 'utf-8');
        const template = await fs.readFile(path.join(installer.templatesDir, item.src), 'utf-8');
        const { content } = mergeClaudeMd(existing, template);
        item.detail = content !== existing ? 'will update managed section' : 'up to date';
      } catch {
        item.detail = 'will merge';
      }
    } else if (item.strategy === 'settings-json') {
      item.detail = 'merges permissions & plugins';
    }
  }

  return preview;
}

/**
 * Format component results into an aligned summary table.
 */
function formatSummaryTable(results) {
  const maxLen = Math.max(...results.map(r => r.label.length));
  return results.map(r => {
    const padded = r.label.padEnd(maxLen);
    if (r.error) return `\u25A0 ${padded}  ${r.error}`;
    if (r.merged > 0 && r.installed === 0 && r.skipped === 0) return `\u25C6 ${padded}  merged`;
    if (r.skipped > 0 && r.installed === 0 && r.merged === 0) return `\u2502 ${padded}  unchanged`;
    const count = r.installed + r.merged;
    return `\u25C6 ${padded}  ${count} file${count > 1 ? 's' : ''}`;
  }).join('\n');
}
