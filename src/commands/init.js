import chalk from 'chalk';
import inquirer from 'inquirer';
import { PRESETS, ROLES } from '../core/constants.js';
import { Installer } from '../core/installer.js';

export async function initCommand(options) {
  console.log(chalk.bold('\n  ace - AI Coding Environment\n'));

  let role = 'fullstack';
  let preset = options.preset;

  // Interactive mode
  if (options.interaction !== false) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'role',
        message: 'What is your primary role?',
        choices: Object.entries(ROLES).map(([key, val]) => ({
          name: `${val.label} — ${val.description}`,
          value: key,
        })),
        default: 'fullstack',
      },
      {
        type: 'list',
        name: 'preset',
        message: 'Installation scope?',
        choices: [
          { name: 'Full — All components (rules, skills, hooks, safety guards, memory)', value: 'full' },
          { name: 'Safe — Core + rules + skills + safety guards + memory', value: 'safe' },
          { name: 'Minimal — Core + rules + skills only', value: 'minimal' },
        ],
        default: 'full',
      },
    ]);
    role = answers.role;
    preset = answers.preset;
  }

  const components = PRESETS[preset];
  if (!components) {
    console.error(chalk.red(`Unknown preset: ${preset}. Available: ${Object.keys(PRESETS).join(', ')}`));
    process.exit(1);
  }

  console.log(chalk.dim(`\n  Role: ${ROLES[role].label}`));
  console.log(chalk.dim(`  Preset: ${preset}`));
  console.log(chalk.dim(`  Components: ${components.join(', ')}`));
  if (options.force) console.log(chalk.yellow('  Force mode: existing files will be overwritten'));
  if (options.dryRun) console.log(chalk.cyan('  Dry-run mode: no changes will be made'));
  console.log();

  const installer = new Installer({
    force: options.force,
    dryRun: options.dryRun,
    role,
    components,
  });

  const results = installer.run();

  // Wait for async
  const { installed, skipped, merged, errors } = await results;

  // Summary
  console.log(chalk.bold('\n  Installation Summary\n'));

  if (installed.length > 0) {
    console.log(chalk.green(`  Installed (${installed.length}):`));
    installed.forEach(f => console.log(chalk.green(`    + ${f}`)));
  }

  if (merged.length > 0) {
    console.log(chalk.blue(`  Merged (${merged.length}):`));
    merged.forEach(m => {
      const detail = m.added ? ` (added ${m.added.length} refs)` : '';
      console.log(chalk.blue(`    ~ ${m.file}${detail}`));
    });
  }

  if (skipped.length > 0) {
    console.log(chalk.yellow(`  Skipped (${skipped.length}) — already exist:`));
    skipped.forEach(f => console.log(chalk.yellow(`    - ${f}`)));
  }

  if (errors.length > 0) {
    console.log(chalk.red(`  Errors (${errors.length}):`));
    errors.forEach(e => console.log(chalk.red(`    ! ${e.file || e.component}: ${e.error}`)));
  }

  if (errors.length === 0) {
    console.log(chalk.green.bold('\n  Done! Your AI coding environment is ready.\n'));
    console.log(chalk.dim('  Run `ace doctor` to verify the installation.'));
  } else {
    console.log(chalk.yellow('\n  Completed with errors. Run `ace doctor` to diagnose.\n'));
  }
}
