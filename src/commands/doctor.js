import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
  CLAUDE_DIR, COMPONENTS, TEMPLATES_DIR,
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

  // 3. Check rules (dynamically scan templates directory)
  const rulesDir = COMPONENTS.rules.rulesDir;
  if (rulesDir) {
    const templateRulesDir = path.join(TEMPLATES_DIR, rulesDir);
    try {
      const ruleFiles = await fs.readdir(templateRulesDir);
      for (const file of ruleFiles) {
        if (!file.endsWith('.md')) continue;
        checks.push(await check(`ace/rules/${file}`, fs.pathExists(path.join(CLAUDE_DIR, rulesDir, file))));
      }
    } catch {
      checks.push({ name: 'ace/rules/ directory', ok: false });
    }
  }

  // 4. Check plugin installation
  const pluginInstallDir = await getPluginInstallDir();
  if (pluginInstallDir) {
    const pluginJsonPath = path.join(pluginInstallDir, '.claude-plugin', 'plugin.json');
    checks.push(await check('plugin: ace directory', Promise.resolve(true)));
    checks.push(await check('plugin: plugin.json', fs.pathExists(pluginJsonPath)));

    const skillNames = ['auto-goal', 'ut', 'code-review', 'skill-creator', 'skill-optimize'];
    for (const skill of skillNames) {
      const skillMd = path.join(pluginInstallDir, 'skills', skill, 'SKILL.md');
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

  // 8. Validate CLAUDE.md references (both @refs and path-index style)
  try {
    const claudeMd = await fs.readFile(path.join(CLAUDE_DIR, 'CLAUDE.md'), 'utf-8');
    // Check @references (legacy format)
    const atRefs = claudeMd.match(/@~?\/?\.?claude\/[^\s)]+/g) || [];
    for (const ref of atRefs) {
      const refPath = ref.replace(/^@/, '').replace(/^~/, process.env.HOME || process.env.USERPROFILE);
      checks.push(await check(`@ref: ${path.basename(refPath)}`, fs.pathExists(refPath)));
    }
    // Check path-index style references (new format: lines starting with "- ~/.claude/...")
    const pathRefs = claudeMd.match(/(?:^|\n)-\s+(~\/.claude\/[^\s—]+)/g) || [];
    for (const match of pathRefs) {
      const refPath = match.replace(/(?:^|\n)-\s+/, '').replace(/^~/, process.env.HOME || process.env.USERPROFILE);
      checks.push(await check(`path: ${path.basename(refPath)}`, fs.pathExists(refPath)));
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

async function getPluginInstallDir() {
  // Primary: read registered path from installed_plugins.json
  try {
    const installed = await fs.readJson(INSTALLED_PLUGINS_FILE);
    const entry = installed?.plugins?.[PLUGIN_KEY];
    // entry can be an object or an array of objects
    const record = Array.isArray(entry) ? entry[entry.length - 1] : entry;
    if (record?.installPath && await fs.pathExists(record.installPath)) {
      return record.installPath;
    }
  } catch { /* fall through */ }

  // Fallback: scan cache directory for latest version
  if (!await fs.pathExists(PLUGIN_CACHE_DIR)) return null;
  const entries = await fs.readdir(PLUGIN_CACHE_DIR);
  const dirs = [];
  for (const entry of entries) {
    const full = path.join(PLUGIN_CACHE_DIR, entry);
    if (await fs.stat(full).then(s => s.isDirectory())) {
      dirs.push(full);
    }
  }
  return dirs.length > 0 ? dirs[dirs.length - 1] : null;
}

async function check(name, promise) {
  try {
    const ok = await promise;
    return { name, ok: !!ok };
  } catch {
    return { name, ok: false };
  }
}
