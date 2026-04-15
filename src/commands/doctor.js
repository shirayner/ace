import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
  CLAUDE_DIR, COMPONENTS,
  PLUGIN_CACHE_DIR, INSTALLED_PLUGINS_FILE, PLUGIN_KEY,
  KNOWN_MARKETPLACES_FILE, MARKETPLACE_DIR, MARKETPLACE_NAME,
} from '../core/constants.js';

export async function doctorCommand() {
  console.log(chalk.bold('\n  ace doctor — verifying installation\n'));

  const checks = [];

  // 1. Check ~/.claude/ exists
  checks.push(await check('~/.claude/ directory', fs.pathExists(CLAUDE_DIR)));

  // 2. Check core files
  checks.push(await check('CLAUDE.md', fs.pathExists(path.join(CLAUDE_DIR, 'CLAUDE.md'))));
  checks.push(await check('settings.json', fs.pathExists(path.join(CLAUDE_DIR, 'settings.json'))));

  // 3. Check rules (in ace/ namespace subdirectory)
  const ruleFiles = COMPONENTS.rules.files;
  for (const file of ruleFiles) {
    checks.push(await check(`rules/ace/${path.basename(file.dest)}`, fs.pathExists(path.join(CLAUDE_DIR, file.dest))));
  }

  // 4. Check plugin installation
  const pluginVersions = await getPluginVersionDirs();
  if (pluginVersions.length > 0) {
    const latestDir = pluginVersions[pluginVersions.length - 1];
    const pluginJsonPath = path.join(latestDir, '.claude-plugin', 'plugin.json');
    checks.push(await check('plugin: ace directory', Promise.resolve(true)));
    checks.push(await check('plugin: plugin.json', fs.pathExists(pluginJsonPath)));

    const skillNames = ['auto-goal', 'coding', 'skill-creator', 'skill-optimize'];
    for (const skill of skillNames) {
      const skillMd = path.join(latestDir, 'skills', skill, 'SKILL.md');
      checks.push(await check(`plugin: skill ace:${skill}`, fs.pathExists(skillMd)));
    }
  } else {
    checks.push({ name: 'plugin: ace directory', ok: false });
  }

  // 5. Check installed_plugins.json registration
  try {
    const installed = await fs.readJson(INSTALLED_PLUGINS_FILE);
    const hasAce = !!installed?.plugins?.[PLUGIN_KEY];
    checks.push({ name: 'installed_plugins.json has ace', ok: hasAce });
  } catch {
    checks.push({ name: 'installed_plugins.json has ace', ok: false });
  }

  // 5b. Check marketplace registration
  checks.push(await check('marketplace directory', fs.pathExists(MARKETPLACE_DIR)));
  checks.push(await check('marketplace.json', fs.pathExists(path.join(MARKETPLACE_DIR, '.claude-plugin', 'marketplace.json'))));
  try {
    const known = await fs.readJson(KNOWN_MARKETPLACES_FILE);
    const hasMarketplace = !!known?.[MARKETPLACE_NAME];
    checks.push({ name: 'known_marketplaces.json has ace-local', ok: hasMarketplace });
  } catch {
    checks.push({ name: 'known_marketplaces.json has ace-local', ok: false });
  }

  // 6. Check memory
  checks.push(await check('memory/MEMORY.md', fs.pathExists(path.join(CLAUDE_DIR, 'memory', 'MEMORY.md'))));

  // 7. Validate settings.json structure
  try {
    const settings = await fs.readJson(path.join(CLAUDE_DIR, 'settings.json'));
    checks.push({ name: 'settings.json valid JSON', ok: true });

    const hasHooks = settings?.permissions?.hooks;
    checks.push({ name: 'settings.json has hooks config', ok: !!hasHooks });

    const hasMemoryDir = settings?.autoMemoryDirectory;
    checks.push({ name: 'settings.json has autoMemoryDirectory', ok: !!hasMemoryDir });

    const aceEnabled = settings?.enabledPlugins?.[PLUGIN_KEY] === true;
    checks.push({ name: 'settings.json has ace plugin enabled', ok: aceEnabled });
  } catch {
    checks.push({ name: 'settings.json parseable', ok: false });
  }

  // 8. Validate CLAUDE.md @references
  try {
    const claudeMd = await fs.readFile(path.join(CLAUDE_DIR, 'CLAUDE.md'), 'utf-8');
    const refs = claudeMd.match(/@~?\/?\.?claude\/[^\s)]+/g) || [];
    for (const ref of refs) {
      const refPath = ref.replace(/^@/, '').replace(/^~/, process.env.HOME || process.env.USERPROFILE);
      checks.push(await check(`@ref: ${path.basename(refPath)}`, fs.pathExists(refPath)));
    }
  } catch {
    checks.push({ name: 'CLAUDE.md readable', ok: false });
  }

  // Summary
  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok).length;

  console.log();
  checks.forEach(c => {
    const icon = c.ok ? chalk.green('  pass') : chalk.red('  FAIL');
    console.log(`  ${icon}  ${c.name}`);
  });

  console.log(chalk.bold(`\n  ${passed} passed, ${failed} failed\n`));

  if (failed > 0) {
    console.log(chalk.yellow('  Run `ace init` to fix missing components.\n'));
  } else {
    console.log(chalk.green('  All checks passed. Environment is healthy.\n'));
  }
}

async function getPluginVersionDirs() {
  if (!await fs.pathExists(PLUGIN_CACHE_DIR)) return [];
  const entries = await fs.readdir(PLUGIN_CACHE_DIR);
  const dirs = [];
  for (const entry of entries) {
    const full = path.join(PLUGIN_CACHE_DIR, entry);
    if (await fs.stat(full).then(s => s.isDirectory())) {
      dirs.push(full);
    }
  }
  return dirs;
}

async function check(name, promise) {
  try {
    const ok = await promise;
    return { name, ok: !!ok };
  } catch {
    return { name, ok: false };
  }
}
