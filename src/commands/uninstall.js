import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import {
  CLAUDE_DIR, COMPONENTS, ACE_HOME, CANONICAL_SKILLS_DIR,
  PLUGIN_CACHE_DIR, INSTALLED_PLUGINS_FILE, PLUGIN_KEY,
  KNOWN_MARKETPLACES_FILE, MARKETPLACE_DIR, MARKETPLACE_NAME,
} from '../core/constants.js';
import { readReceipt } from '../core/install-receipt.js';
import { removeProjectedPath } from '../core/projector.js';
import { removeKnownMarketplace } from '../core/merger.js';

export async function uninstallCommand(options) {
  console.log(chalk.bold('\n  ace uninstall — removing ace components\n'));

  if (!options.yes) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: 'This will remove all ace-managed files (rules, plugin, hooks). Continue?',
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

  // 1. Remove ace/rules/ directory (and legacy rules/ace/ if still present)
  const spinner1 = ora('Removing rules...').start();
  try {
    const newRulesDir = path.join(CLAUDE_DIR, 'ace', 'rules');
    const aceDir = path.join(CLAUDE_DIR, 'ace');
    const legacyRulesDir = path.join(CLAUDE_DIR, 'rules', 'ace');

    if (await fs.pathExists(newRulesDir)) {
      await fs.remove(newRulesDir);
      removed.push('ace/rules/');
    }
    // Remove ace/ parent if empty
    if (await fs.pathExists(aceDir)) {
      const remaining = await fs.readdir(aceDir);
      if (remaining.length === 0) {
        await fs.remove(aceDir);
      }
    }
    // Also clean legacy directory if still exists
    if (await fs.pathExists(legacyRulesDir)) {
      await fs.remove(legacyRulesDir);
      removed.push('rules/ace/ (legacy)');
    }

    spinner1.succeed('rules removed');
  } catch (err) {
    spinner1.fail('rules removal failed');
    errors.push({ component: 'rules', error: err.message });
  }

  // 2. Remove plugin from cache and marketplace
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

    // Remove marketplace directory
    if (await fs.pathExists(MARKETPLACE_DIR)) {
      await fs.remove(MARKETPLACE_DIR);
      removed.push('marketplace: ' + MARKETPLACE_NAME);
    }

    // Remove from known_marketplaces.json
    await removeKnownMarketplace(KNOWN_MARKETPLACES_FILE, MARKETPLACE_NAME);
    removed.push('known_marketplaces.json entry');

    spinner2.succeed('plugin removed');
  } catch (err) {
    spinner2.fail('plugin removal failed');
    errors.push({ component: 'plugin', error: err.message });
  }

  // 3. Remove hook scripts
  const spinner3 = ora('Removing hooks...').start();
  try {
    const hookFiles = [...(COMPONENTS.hooks.files || []), ...(COMPONENTS.hooks.conditional || [])];
    for (const file of hookFiles) {
      const destPath = path.join(CLAUDE_DIR, file.dest);
      if (await fs.pathExists(destPath)) {
        await fs.remove(destPath);
        removed.push(file.dest);
      }
    }
    spinner3.succeed('hooks removed');
  } catch (err) {
    spinner3.fail('hooks removal failed');
    errors.push({ component: 'hooks', error: err.message });
  }

  // 4. Remove legacy hookify rules (cleanup from older versions)
  const spinner4 = ora('Removing legacy hookify rules...').start();
  try {
    const hookifyPattern = /^hookify\.ace\..+\.local\.md$/;
    // A missing ~/.claude/ is normal now, not a fault: an install that never selected Claude
    // Code never created it. Letting readdir throw here reported two ENOENT "errors" and
    // "Uninstall completed with errors" for a uninstall that in fact removed everything
    // correctly — which would send a user hunting for damage that does not exist.
    const claudeFiles = await fs.pathExists(CLAUDE_DIR) ? await fs.readdir(CLAUDE_DIR) : [];
    let hookifyRemoved = 0;
    for (const file of claudeFiles) {
      if (hookifyPattern.test(file)) {
        await fs.remove(path.join(CLAUDE_DIR, file));
        removed.push(file);
        hookifyRemoved++;
      }
    }
    if (hookifyRemoved > 0) {
      spinner4.succeed(`legacy hookify rules removed (${hookifyRemoved})`);
    } else {
      spinner4.succeed('no legacy hookify rules found');
    }
  } catch (err) {
    spinner4.fail('legacy hookify removal failed');
    errors.push({ component: 'hookify-legacy', error: err.message });
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
      // Fallback: surgically remove ace @references and managed section
      const content = await fs.readFile(claudeMdPath, 'utf-8');
      let cleaned = content;
      // Remove the entire managed section if present
      const managedStart = '<!-- ace:managed:start -->';
      const managedEnd = '<!-- ace:managed:end -->';
      const startIdx = cleaned.indexOf(managedStart);
      const endIdx = cleaned.indexOf(managedEnd);
      if (startIdx !== -1 && endIdx !== -1) {
        cleaned = cleaned.slice(0, startIdx) + cleaned.slice(endIdx + managedEnd.length);
      }
      // Remove any remaining ace @references (legacy or new format)
      const lines = cleaned.split('\n');
      const filtered = lines.filter(line =>
        !line.includes('@~/.claude/rules/ace/') &&
        !line.includes('@~/.claude/ace/') &&
        !line.includes('hookify.ace.')
      );
      cleaned = filtered.join('\n')
        .replace(/\n## Added by ace\n*/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim() + '\n';
      if (cleaned !== content) {
        await fs.writeFile(claudeMdPath, cleaned, 'utf-8');
        removed.push('CLAUDE.md ace content (surgical)');
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

    // Clean up timestamped ace-backup files (skipped when ~/.claude/ was never created).
    const claudeDir = CLAUDE_DIR;
    const backupFiles = await fs.pathExists(claudeDir) ? await fs.readdir(claudeDir) : [];
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

  // 6. Remove everything recorded for non-Claude targets, using the install receipt.
  //
  // This cannot be re-derived from the selection: projected copies live under paths only
  // the target knows, and a link whose source is gone reads as "missing" to pathExists
  // while still occupying the name. Only a record of writes can clean both up — and
  // anything absent from the receipt is left alone rather than guessed at.
  const spinnerTargets = ora('Removing target projections...').start();
  try {
    const receipt = await readReceipt();
    if (!receipt) {
      spinnerTargets.succeed('no install receipt — nothing else recorded');
    } else {
      let count = 0;
      for (const target of receipt.targets ?? []) {
        // Claude Code's own paths are handled by the dedicated steps above.
        if (target.id === 'claude-code') continue;
        for (const recorded of target.paths ?? []) {
          await removeProjectedPath(recorded);
          count++;
        }
        removed.push(`target ${target.id} (${target.projection}, ${(target.paths ?? []).length} path(s))`);
      }

      // The canonical store is shared with other installers, so only receipt-recorded ACE
      // entries are removed — never the shared root itself. Old receipts have no
      // `canonicalSkills`, so their legacy flat paths remain supported.
      const canonicalEntries = receipt.canonicalSkills ?? [];
      const categoryDirs = new Set();
      if (canonicalEntries.length > 0) {
        for (const entry of canonicalEntries) {
          await removeProjectedPath(entry.path);
          categoryDirs.add(path.dirname(entry.path));
          count++;
        }
        for (const dir of categoryDirs) {
          if (await fs.pathExists(dir) && (await fs.readdir(dir)).length === 0) {
            await removeProjectedPath(dir);
          }
        }
      } else {
        for (const skill of receipt.skills ?? []) {
          const dir = path.join(receipt.canonicalDir ?? CANONICAL_SKILLS_DIR, skill);
          await removeProjectedPath(dir);
          count++;
        }
      }
      if ((receipt.skills ?? []).length > 0) {
        removed.push(`canonical skills: ${receipt.skills.length} removed from ${receipt.canonicalDir}`);
      }
      spinnerTargets.succeed(`target projections removed (${count} path(s))`);
    }
  } catch (err) {
    spinnerTargets.fail('target projection removal failed');
    errors.push({ component: 'targets', error: err.message });
  }

  // 7. Remove ace's own config (~/.ace/), which lives outside ~/.claude/
  const spinner6 = ora('Removing ace config...').start();
  try {
    // A surviving skills-selection.json would silently drive the next install, so an
    // uninstall that left it behind would not actually reset anything.
    if (await fs.pathExists(ACE_HOME)) {
      await fs.remove(ACE_HOME);
      removed.push('~/.ace/ (skill selection)');
      spinner6.succeed('ace config removed');
    } else {
      spinner6.succeed('no ace config found');
    }
  } catch (err) {
    spinner6.fail('ace config removal failed');
    errors.push({ component: 'ace-config', error: err.message });
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
    console.log(chalk.dim('  Note: memory/ and CLAUDE.md (without ace refs) are preserved.\n'));  } else {
    console.log(chalk.yellow('  Uninstall completed with errors.\n'));
  }
}
