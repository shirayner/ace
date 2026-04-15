import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { SpecInstaller } from '../core/spec-installer.js';

export async function specInitCommand(targetPath, options) {
  const targetDir = targetPath ? path.resolve(targetPath) : process.cwd();

  console.log(chalk.bold('\n  ace spec init — Initialize spec-driven workflow\n'));
  console.log(chalk.dim(`  Target: ${targetDir}`));
  if (options.force) console.log(chalk.yellow('  Force mode: existing files will be overwritten'));
  if (options.dryRun) console.log(chalk.cyan('  Dry-run mode: no changes will be made'));
  if (options.skipOpenspec) console.log(chalk.dim('  Skipping openspec CLI installation'));
  console.log();

  const installer = new SpecInstaller({
    targetDir,
    force: options.force,
    dryRun: options.dryRun,
    skipOpenspec: options.skipOpenspec,
  });

  const spinner = ora('Setting up spec workflow...').start();

  try {
    const { installed, skipped, merged, errors } = await installer.run();
    spinner.stop();

    printSummary(installed, skipped, merged, errors);
  } catch (err) {
    spinner.fail(`Unexpected error: ${err.message}`);
    process.exit(1);
  }
}

export async function specDoctorCommand(targetPath) {
  const targetDir = targetPath ? path.resolve(targetPath) : process.cwd();

  console.log(chalk.bold('\n  ace spec doctor — Checking spec workflow health\n'));
  console.log(chalk.dim(`  Target: ${targetDir}\n`));

  const installer = new SpecInstaller({ targetDir });
  const checks = await installer.doctor();

  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok).length;

  checks.forEach(c => {
    const icon = c.ok ? chalk.green('  pass') : chalk.red('  FAIL');
    console.log(`  ${icon}  ${c.name}`);
  });

  console.log(chalk.bold(`\n  ${passed} passed, ${failed} failed\n`));

  if (failed > 0) {
    console.log(chalk.yellow('  Run `ace spec init` to fix missing components.\n'));
  } else {
    console.log(chalk.green('  Spec workflow is healthy.\n'));
  }
}

export async function specUpdateCommand(targetPath, options) {
  const targetDir = targetPath ? path.resolve(targetPath) : process.cwd();

  console.log(chalk.bold('\n  ace spec update — Updating spec templates\n'));
  console.log(chalk.dim(`  Target: ${targetDir}`));
  console.log();

  const installer = new SpecInstaller({
    targetDir,
    force: true,
    skipOpenspec: true,
  });

  const spinner = ora('Updating spec templates...').start();

  try {
    // Only run template + config installation (skip openspec init)
    await installer.installTemplates();
    await installer.installConfig();
    spinner.stop();

    const { installed, skipped, merged, errors } = installer.results;
    printSummary(installed, skipped, merged, errors);
  } catch (err) {
    spinner.fail(`Unexpected error: ${err.message}`);
    process.exit(1);
  }
}

function printSummary(installed, skipped, merged, errors) {
  console.log(chalk.bold('\n  Summary\n'));

  if (installed.length > 0) {
    console.log(chalk.green(`  Installed (${installed.length}):`));
    installed.forEach(f => console.log(chalk.green(`    + ${f}`)));
  }

  if (merged.length > 0) {
    console.log(chalk.blue(`  Merged (${merged.length}):`));
    merged.forEach(m => {
      const detail = m.version ? ` (v${m.version})` : '';
      console.log(chalk.blue(`    ~ ${m.file}${detail}`));
    });
  }

  if (skipped.length > 0) {
    console.log(chalk.yellow(`  Skipped (${skipped.length}):`));
    skipped.forEach(f => console.log(chalk.yellow(`    - ${f}`)));
  }

  if (errors.length > 0) {
    console.log(chalk.red(`  Errors (${errors.length}):`));
    errors.forEach(e => console.log(chalk.red(`    ! ${e.file || e.component}: ${e.error}`)));
  }

  if (errors.length === 0) {
    console.log(chalk.green.bold('\n  Done! Spec workflow is ready.\n'));
    console.log(chalk.dim('  Use /opsx:propose to start a new change.'));
    console.log(chalk.dim('  Run `ace spec doctor` to verify.\n'));
  } else {
    console.log(chalk.yellow('\n  Completed with errors. Run `ace spec doctor` to diagnose.\n'));
  }
}
