import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import {
  CLAUDE_DIR, COMPONENTS,
  PLUGIN_CACHE_DIR, INSTALLED_PLUGINS_FILE, PLUGIN_KEY,
} from '../core/constants.js';

export async function uninstallCommand(options) {
  console.log(chalk.bold('\n  ace uninstall — removing ace components\n'));

  if (!options.yes) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'This will remove all ace-managed files (rules, plugin, hooks, hookify rules). Continue?',
      default: false,
    }]);
    if (!confirm) {
      console.log(chalk.dim('\n  Cancelled.\n'));
      return;
    }
  }

  const removed = [];
  const skipped = [];
  const errors = [];

  // 1. Remove rules/ace/ directory
  const spinner1 = ora('Removing rules...').start();
  try {
    const rulesDir = path.join(CLAUDE_DIR, 'rules', 'ace');
    if (await fs.pathExists(rulesDir)) {
      await fs.remove(rulesDir);
      removed.push('rules/ace/');
    } else {
      skipped.push('rules/ace/ (not found)');
    }
    spinner1.succeed('rules removed');
  } catch (err) {
    spinner1.fail('rules removal failed');
    errors.push({ component: 'rules', error: err.message });
  }

  // 2. Remove plugin from cache
  const spinner2 = ora('Removing plugin...').start();
  try {
    if (await fs.pathExists(PLUGIN_CACHE_DIR)) {
      await fs.remove(PLUGIN_CACHE_DIR);
      removed.push('plugin cache: ' + PLUGIN_KEY);
    } else {
      skipped.push('plugin cache (not found)');
    }

    // Remove from installed_plugins.json
    if (await fs.pathExists(INSTALLED_PLUGINS_FILE)) {
      const data = await fs.readJson(INSTALLED_PLUGINS_FILE);
      if (data.plugins?.[PLUGIN_KEY]) {
        delete data.plugins[PLUGIN_KEY];
        await fs.writeJson(INSTALLED_PLUGINS_FILE, data, { spaces: 2 });
        removed.push('installed_plugins.json entry');
      }
    }

    spinner2.succeed('plugin removed');
  } catch (err) {
    spinner2.fail('plugin removal failed');
    errors.push({ component: 'plugin', error: err.message });
  }

  // 3. Remove hookify rules
  const spinner3 = ora('Removing hookify rules...').start();
  try {
    const hookifyFiles = COMPONENTS.hookify.files;
    for (const file of hookifyFiles) {
      const destPath = path.join(CLAUDE_DIR, file.dest);
      if (await fs.pathExists(destPath)) {
        await fs.remove(destPath);
        removed.push(file.dest);
      }
    }
    spinner3.succeed('hookify rules removed');
  } catch (err) {
    spinner3.fail('hookify rules removal failed');
    errors.push({ component: 'hookify', error: err.message });
  }

  // 4. Remove hook scripts
  const spinner4 = ora('Removing hooks...').start();
  try {
    const hookFiles = COMPONENTS.hooks.conditional;
    for (const file of hookFiles) {
      const destPath = path.join(CLAUDE_DIR, file.dest);
      if (await fs.pathExists(destPath)) {
        await fs.remove(destPath);
        removed.push(file.dest);
      }
    }
    spinner4.succeed('hooks removed');
  } catch (err) {
    spinner4.fail('hooks removal failed');
    errors.push({ component: 'hooks', error: err.message });
  }

  // 5. Restore CLAUDE.md and settings.json from pre-install backups
  const spinner5 = ora('Restoring CLAUDE.md & settings.json...').start();
  try {
    const claudeMdPath = path.join(CLAUDE_DIR, 'CLAUDE.md');
    const claudeBackup = `${claudeMdPath}.pre-ace`;
    if (await fs.pathExists(claudeBackup)) {
      await fs.copy(claudeBackup, claudeMdPath, { overwrite: true });
      await fs.remove(claudeBackup);
      removed.push('CLAUDE.md (restored pre-ace backup)');
    } else if (await fs.pathExists(claudeMdPath)) {
      // Fallback: surgically remove ace @references
      const content = await fs.readFile(claudeMdPath, 'utf-8');
      const lines = content.split('\n');
      const filtered = lines.filter(line => !line.includes('@~/.claude/rules/ace/'));
      const cleaned = filtered.join('\n')
        .replace(/\n## Added by ace\n*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() + '\n';
      if (cleaned !== content) {
        await fs.writeFile(claudeMdPath, cleaned, 'utf-8');
        removed.push('CLAUDE.md ace @references (surgical)');
      }
    }

    const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
    const settingsBackup = `${settingsPath}.pre-ace`;
    if (await fs.pathExists(settingsBackup)) {
      await fs.copy(settingsBackup, settingsPath, { overwrite: true });
      await fs.remove(settingsBackup);
      removed.push('settings.json (restored pre-ace backup)');
    } else if (await fs.pathExists(settingsPath)) {
      // Fallback: surgically remove ace entries
      const settings = await fs.readJson(settingsPath);
      let changed = false;
      if (settings.enabledPlugins?.[PLUGIN_KEY] !== undefined) {
        delete settings.enabledPlugins[PLUGIN_KEY];
        changed = true;
      }
      if (changed) {
        await fs.writeJson(settingsPath, settings, { spaces: 2 });
        removed.push('settings.json ace entries (surgical)');
      }
    }

    // Clean up timestamped ace-backup files
    const claudeDir = CLAUDE_DIR;
    const backupFiles = await fs.readdir(claudeDir);
    for (const file of backupFiles) {
      if (file.match(/\.(ace-backup\.|pre-ace)/)) {
        await fs.remove(path.join(claudeDir, file));
      }
    }

    spinner5.succeed('CLAUDE.md & settings.json restored');
  } catch (err) {
    spinner5.fail('CLAUDE.md & settings.json restore failed');
    errors.push({ component: 'restore', error: err.message });
  }

  // Summary
  console.log(chalk.bold('\n  Uninstall Summary\n'));
  if (removed.length > 0) {
    console.log(chalk.green(`  Removed (${removed.length}):`));
    removed.forEach(f => console.log(chalk.green(`    - ${f}`)));
  }
  if (skipped.length > 0) {
    console.log(chalk.dim(`  Skipped (${skipped.length}):`));
    skipped.forEach(f => console.log(chalk.dim(`    - ${f}`)));
  }
  if (errors.length > 0) {
    console.log(chalk.red(`  Errors (${errors.length}):`));
    errors.forEach(e => console.log(chalk.red(`    ! ${e.component}: ${e.error}`)));
  }

  console.log();
  if (errors.length === 0) {
    console.log(chalk.green('  ace has been uninstalled.'));
    console.log(chalk.dim('  Note: memory/ and CLAUDE.md (without ace refs) are preserved.\n'));
  } else {
    console.log(chalk.yellow('  Uninstall completed with errors.\n'));
  }
}
