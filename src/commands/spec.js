import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as p from '@clack/prompts';
import { SpecInstaller } from '../core/spec-installer.js';
import { TeamInstaller } from '../core/team-installer.js';

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

  // ─── Team conventions initialization ───────────────
  await initTeamConventions(targetDir, options);
}

async function initTeamConventions(targetDir, options) {
  let repoUrl = options.teamRepo;

  if (!repoUrl) {
    const shouldInit = await p.confirm({
      message: 'Initialize team conventions from a Git repository?',
      initialValue: false,
    });

    if (p.isCancel(shouldInit) || !shouldInit) return;

    const urlInput = await p.text({
      message: 'Enter the Git repository URL for team conventions:',
      placeholder: 'http://git.dev.sh.ctripcorp.com/r.shi/dev-guide.git',
      validate: (value) => {
        if (!value || value.trim().length === 0) return 'URL is required';
        if (!value.match(/^(https?:\/\/|git@)/)) return 'Must be a valid git URL (https:// or git@)';
      },
    });

    if (p.isCancel(urlInput)) return;
    repoUrl = urlInput.trim();
  }

  const spinner = ora('Cloning team conventions...').start();

  try {
    const teamInstaller = new TeamInstaller({
      targetDir,
      repoUrl,
      force: options.force,
      dryRun: options.dryRun,
    });

    const results = await teamInstaller.run();
    spinner.stop();

    if (results.errors.length > 0) {
      console.log(chalk.red('\n  Team conventions errors:'));
      results.errors.forEach(e => console.log(chalk.red(`    ! ${e.error}`)));
    } else if (results.skipped.length > 0) {
      console.log(chalk.yellow('\n  Team conventions:'));
      results.skipped.forEach(s => console.log(chalk.yellow(`    - ${s}`)));
    } else if (results.installed.length > 0) {
      console.log(chalk.green('\n  Team conventions installed:'));
      results.installed.forEach(f => console.log(chalk.green(`    + ${f}`)));
    }
  } catch (err) {
    spinner.fail(`Failed to initialize team conventions: ${err.message}`);
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
