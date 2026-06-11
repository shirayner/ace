#!/usr/bin/env node

import { createRequire } from 'module';
import { Command } from 'commander';
import { initCommand } from '../src/commands/init.js';
import { doctorCommand } from '../src/commands/doctor.js';
import { listCommand } from '../src/commands/list.js';
import { uninstallCommand } from '../src/commands/uninstall.js';
import { specInitCommand, specDoctorCommand, specUpdateCommand } from '../src/commands/spec.js';
import { upgradeCommand } from '../src/commands/upgrade.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const program = new Command();

program
  .name('ace')
  .description('AI Coding Environment - One command to set up your Claude Code harness')
  .version(pkg.version);

program
  .command('init')
  .description('Initialize AI coding environment')
  .option('-f, --force', 'Overwrite existing files', false)
  .option('--dry-run', 'Show what would be done without making changes', false)
  .action(initCommand);

program
  .command('doctor')
  .description('Verify installation integrity')
  .action(doctorCommand);

program
  .command('list')
  .description('List installed components and their status')
  .action(listCommand);

program
  .command('uninstall')
  .description('Remove all ace-managed components')
  .option('-y, --yes', 'Skip confirmation prompt', false)
  .action(uninstallCommand);

program
  .command('upgrade')
  .description('Upgrade ace to the latest version')
  .option('-f, --force', 'Force reinstall even if already up to date', false)
  .action(upgradeCommand);

const spec = program
  .command('spec')
  .description('Manage spec-driven development workflow (project-level)');

spec
  .command('init [path]')
  .description('Initialize spec workflow in a project')
  .option('-f, --force', 'Overwrite existing configuration', false)
  .option('--dry-run', 'Preview without making changes', false)
  .option('--skip-openspec', 'Skip openspec CLI installation', false)
  .option('--team-repo <url>', 'Git repository URL for team conventions')
  .action(specInitCommand);

spec
  .command('doctor [path]')
  .description('Check spec workflow health')
  .action(specDoctorCommand);

spec
  .command('update [path]')
  .description('Update spec templates to latest version')
  .action(specUpdateCommand);

program.parse();
