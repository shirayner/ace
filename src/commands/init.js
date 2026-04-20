import inquirer from 'inquirer';
import ora from 'ora';
import { createRequire } from 'module';
import { PRESETS, ROLES, COMPONENTS } from '../core/constants.js';
import { Installer } from '../core/installer.js';
import {
  printBanner, renderScreen,
  doneMessage, doneWithErrors,
  colors, icons, componentLabels,
} from '../core/ui.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

function formatStep(label, value) {
  return `  ${colors.success(icons.check)} ${colors.dim(label)} ${colors.dim('·')} ${colors.white(value)}`;
}

export async function initCommand(options) {
  const version = pkg.version;
  let role = 'fullstack';
  let preset = options.preset;
  const completedSteps = [];

  // ─── Step 1: Role ──────────────────────────────────────────
  if (options.interaction !== false) {
    renderScreen(version);

    const result = await inquirer.prompt([{
      type: 'list',
      name: 'role',
      message: 'Role',
      choices: Object.entries(ROLES).map(([key, val]) => ({
        name: `${colors.white(val.label)}  ${colors.dim(val.description)}`,
        value: key,
        short: val.label,
      })),
      default: 'fullstack',
      prefix: colors.brand('?'),
    }]);

    role = result.role;
    completedSteps.push(formatStep('Role', ROLES[role].label));
  }

  const components = PRESETS[preset];
  if (!components) {
    console.error(`  ${colors.error(icons.cross)} Unknown preset: ${preset}. Use: ${Object.keys(PRESETS).join(', ')}`);
    process.exit(1);
  }

  // ─── Step 2: Conflicts (conditional) ───────────────────────
  const installer = new Installer({
    force: options.force,
    dryRun: options.dryRun,
    role,
    components,
    quiet: true,
  });

  let resolutions = {};

  if (!options.force && options.interaction !== false) {
    const conflicts = await installer.detectConflicts();
    const conflictKeys = Object.keys(conflicts);

    if (conflictKeys.length > 0) {
      const totalFiles = conflictKeys.reduce((sum, k) => sum + conflicts[k].files.length, 0);

      renderScreen(version, completedSteps);
      console.log(`  ${colors.warning(icons.warn)} ${totalFiles} existing file(s) found`);
      console.log();

      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: 'How to handle?',
        choices: [
          {
            name: `${colors.white('Keep existing')}  ${colors.dim('merge compatible, skip rest')}`,
            value: 'skip',
            short: 'Keep',
          },
          {
            name: `${colors.warning('Overwrite all')}  ${colors.dim('replace with latest')}`,
            value: 'overwrite',
            short: 'Overwrite',
          },
        ],
        default: 'skip',
        prefix: colors.brand('?'),
      }]);

      for (const key of conflictKeys) {
        resolutions[key] = action;
      }

      completedSteps.push(
        formatStep('Conflicts', action === 'skip' ? 'Keep existing' : 'Overwrite all')
      );
    }
  }

  installer.resolutions = resolutions;

  // ─── Step 3: Install ───────────────────────────────────────
  if (options.interaction !== false) {
    renderScreen(version, completedSteps);
  } else {
    printBanner(version);
  }

  if (options.dryRun) {
    console.log(`  ${colors.dim('dry-run — no changes will be made')}`);
    console.log();
  }

  for (const componentName of components) {
    const component = COMPONENTS[componentName];
    if (!component) continue;

    const label = componentLabels[componentName] || componentName;
    const beforeInstalled = installer.results.installed.length;
    const beforeMerged = installer.results.merged.length;
    const beforeSkipped = installer.results.skipped.length;

    const spinner = ora({
      text: label,
      indent: 2,
      color: 'magenta',
    }).start();

    try {
      await installer.installComponent(componentName, component);

      const newInstalled = installer.results.installed.length - beforeInstalled;
      const newMerged = installer.results.merged.length - beforeMerged;
      const newSkipped = installer.results.skipped.length - beforeSkipped;

      if (newMerged > 0 && newInstalled === 0 && newSkipped === 0) {
        spinner.stopAndPersist({
          symbol: colors.blue(icons.merge),
          text: `${label} ${colors.dim('merged')}`,
        });
      } else if (newSkipped > 0 && newInstalled === 0 && newMerged === 0) {
        spinner.stopAndPersist({
          symbol: colors.muted(icons.skip),
          text: `${colors.muted(label)} ${colors.dim('unchanged')}`,
        });
      } else {
        const count = newInstalled + newMerged;
        const detail = count > 0 ? ` ${count} file${count > 1 ? 's' : ''}` : '';
        spinner.stopAndPersist({
          symbol: colors.success(icons.check),
          text: `${label}${colors.dim(detail)}`,
        });
      }
    } catch (err) {
      spinner.stopAndPersist({
        symbol: colors.error(icons.cross),
        text: `${label} ${colors.dim(err.message)}`,
      });
      installer.results.errors.push({ component: componentName, error: err.message });
    }
  }

  // ─── Summary ────────────────────────────────────────────────
  const { installed, merged, skipped, errors } = installer.results;

  if (errors.length === 0) {
    doneMessage({
      installed: installed.length,
      merged: merged.length,
      skipped: skipped.length,
    });
  } else {
    doneWithErrors({ errors: errors.length });
  }
}
