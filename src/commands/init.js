import chalk from 'chalk';
import inquirer from 'inquirer';
import { createRequire } from 'module';
import { PRESETS, ROLES, COMPONENTS } from '../core/constants.js';
import { Installer } from '../core/installer.js';
import {
  printBanner, sectionHeader, stepDone, stepSkip, stepFail,
  fileEntry, summaryBox, doneMessage, doneWithErrors, separator,
  conflictHeader, conflictFile,
  colors, icons, componentIcons, componentLabels,
} from '../core/ui.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

export async function initCommand(options) {
  // ─── Banner ──────────────────────────────────────────────────────
  printBanner(pkg.version);

  let role = 'fullstack';
  let preset = options.preset;

  // ─── Interactive prompts ─────────────────────────────────────────
  if (options.interaction !== false) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'role',
        message: `${icons.gear}  Your primary role?`,
        choices: Object.entries(ROLES).map(([key, val]) => ({
          name: `${colors.white(val.label)} ${colors.dim('—')} ${colors.muted(val.description)}`,
          value: key,
          short: val.label,
        })),
        default: 'fullstack',
        prefix: colors.brand('?'),
      },
      {
        type: 'list',
        name: 'preset',
        message: `${icons.package}  Installation scope?`,
        choices: [
          {
            name: `${colors.white('Full')} ${colors.dim('—')} ${colors.muted('All components (rules, plugin, hooks, safety guards, memory)')}`,
            value: 'full',
            short: 'Full',
          },
          {
            name: `${colors.white('Safe')} ${colors.dim('—')} ${colors.muted('Core + rules + plugin + safety guards + memory')}`,
            value: 'safe',
            short: 'Safe',
          },
          {
            name: `${colors.white('Minimal')} ${colors.dim('—')} ${colors.muted('Core + rules + plugin only')}`,
            value: 'minimal',
            short: 'Minimal',
          },
        ],
        default: 'full',
        prefix: colors.brand('?'),
      },
    ]);
    role = answers.role;
    preset = answers.preset;
  }

  const components = PRESETS[preset];
  if (!components) {
    console.error(colors.error(`  ${icons.cross} Unknown preset: ${preset}. Available: ${Object.keys(PRESETS).join(', ')}`));
    process.exit(1);
  }

  // ─── Config summary ──────────────────────────────────────────────
  console.log();
  console.log(`  ${colors.dim('│')}  ${colors.dim('Role')}     ${colors.white(ROLES[role].label)}`);
  console.log(`  ${colors.dim('│')}  ${colors.dim('Preset')}   ${colors.white(preset)}`);
  console.log(`  ${colors.dim('│')}  ${colors.dim('Scope')}    ${components.map(c => componentLabels[c] || c).join(colors.dim(', '))}`);
  if (options.force) {
    console.log(`  ${colors.dim('│')}  ${colors.warning(`${icons.warn} Force mode — existing files will be overwritten`)}`);
  }
  if (options.dryRun) {
    console.log(`  ${colors.dim('│')}  ${colors.accent(`${icons.info} Dry-run mode — no changes will be made`)}`);
  }

  // ─── Conflict detection & category confirmation ──────────────────
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
      console.log();
      sectionHeader(icons.warn, 'Existing files detected');
      console.log(`  ${colors.dim('│')}  ${colors.muted('Some files already exist. Choose how to handle each category:')}`);
      console.log(`  ${colors.dim('│')}  ${colors.muted(`CLAUDE.md ${icons.arrowR} always smart-merge (append new refs only)`)}`);
      console.log(`  ${colors.dim('│')}  ${colors.muted(`settings.json ${icons.arrowR} always deep-merge (preserve your settings)`)}`);

      for (const componentName of conflictKeys) {
        const { files } = conflicts[componentName];
        const icon = componentIcons[componentName] || icons.file;
        const label = componentLabels[componentName] || componentName;

        conflictHeader(label, icon, files.length);
        for (const f of files) {
          conflictFile(f.replace(/\\/g, '/'));
        }
      }

      console.log();
      const conflictAnswers = await inquirer.prompt(
        conflictKeys.map((componentName) => {
          const icon = componentIcons[componentName] || icons.file;
          const label = componentLabels[componentName] || componentName;
          const count = conflicts[componentName].files.length;
          return {
            type: 'list',
            name: componentName,
            message: `${icon}  ${label} (${count} files)`,
            choices: [
              {
                name: `${colors.muted('Skip')} ${colors.dim('— keep existing files')}`,
                value: 'skip',
                short: 'Skip',
              },
              {
                name: `${colors.warning('Overwrite')} ${colors.dim('— replace with ace templates')}`,
                value: 'overwrite',
                short: 'Overwrite',
              },
            ],
            default: 'skip',
            prefix: colors.brand('?'),
          };
        })
      );

      resolutions = conflictAnswers;
    }
  }

  // Apply resolutions to installer
  installer.resolutions = resolutions;

  // ─── Installation ────────────────────────────────────────────────
  console.log();
  sectionHeader(icons.rocket, 'Installing components');

  for (const componentName of components) {
    const component = COMPONENTS[componentName];
    if (!component) continue;

    const icon = componentIcons[componentName] || icons.file;
    const label = componentLabels[componentName] || componentName;

    const beforeInstalled = installer.results.installed.length;
    const beforeMerged = installer.results.merged.length;
    const beforeSkipped = installer.results.skipped.length;

    try {
      await installer.installComponent(componentName, component);
      const newInstalled = installer.results.installed.length - beforeInstalled;
      const newMerged = installer.results.merged.length - beforeMerged;
      const newSkipped = installer.results.skipped.length - beforeSkipped;

      const parts = [];
      if (newInstalled > 0) parts.push(colors.success(`${newInstalled} installed`));
      if (newMerged > 0) parts.push(colors.blue(`${newMerged} merged`));
      if (newSkipped > 0) parts.push(colors.muted(`${newSkipped} skipped`));
      const detail = parts.length > 0 ? ` ${colors.dim('—')} ${parts.join(colors.dim(', '))}` : '';

      stepDone(`${icon}  ${label}${detail}`);
    } catch (err) {
      stepFail(`${icon}  ${label} ${colors.dim('—')} ${colors.error(err.message)}`);
      installer.results.errors.push({ component: componentName, error: err.message });
    }
  }

  const { installed, skipped, merged, errors } = installer.results;

  // ─── Detailed file list ──────────────────────────────────────────
  if (installed.length > 0 || merged.length > 0 || skipped.length > 0) {
    separator();
    sectionHeader(icons.file, 'File details');
    for (const f of installed) fileEntry('install', f.replace(/\\/g, '/'));
    for (const m of merged) {
      const detail = m.added ? ` (${m.added.length} refs)` : '';
      fileEntry('merge', `${m.file.replace(/\\/g, '/')}${detail}`);
    }
    for (const f of skipped) fileEntry('skip', f.replace(/\\/g, '/'));
    for (const e of errors) fileEntry('error', `${(e.file || e.component).replace(/\\/g, '/')}: ${e.error}`);
  }

  // ─── Summary ─────────────────────────────────────────────────────
  summaryBox({
    installed: installed.length,
    merged: merged.length,
    skipped: skipped.length,
    errors: errors.length,
  });

  if (errors.length === 0) {
    doneMessage();
  } else {
    doneWithErrors();
  }
}
