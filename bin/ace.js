#!/usr/bin/env node

import { createRequire } from 'module';
import { Command } from 'commander';
import { initCommand } from '../src/commands/init.js';
import { doctorCommand } from '../src/commands/doctor.js';
import { listCommand } from '../src/commands/list.js';
import { uninstallCommand } from '../src/commands/uninstall.js';
import { upgradeCommand } from '../src/commands/upgrade.js';
import { taskListCommand, taskCompleteCommand, taskDoneCommand } from '../src/commands/task.js';
import { archiveCommand } from '../src/commands/archive.js';

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

const task = program
  .command('task')
  .description('Manage ACE task lifecycle (.ace/tasks/)');

task
  .command('list')
  .description('List all active tasks in .ace/tasks/')
  .action(taskListCommand);

task
  .command('complete <changeName>')
  .description('Mark a task as completed (sets status=completed, writes completed_at)')
  .action(taskCompleteCommand);

task
  .command('archive <changeName>')
  .description('Archive a completed task to .ace/tasks/archive/<date>-<changeName>/')
  .option('--date <YYYY-MM-DD>', 'Force a specific archive date')
  .action((changeName, opts) => archiveCommand(changeName, { date: opts.date }));

task
  .command('done <changeName>')
  .description('Mark a task as completed AND archive it in one step (recommended)')
  .option('--date <YYYY-MM-DD>', 'Force a specific archive date')
  .action((changeName, opts) => taskDoneCommand(changeName, { date: opts.date }));

program.parse();
