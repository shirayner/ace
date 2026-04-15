import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
  CLAUDE_DIR, COMPONENTS, TEMPLATES_DIR,
  PLUGIN_CACHE_DIR, INSTALLED_PLUGINS_FILE, PLUGIN_KEY,
} from '../core/constants.js';

export async function listCommand() {
  console.log(chalk.bold('\n  ace list — installed components\n'));

  for (const [name, component] of Object.entries(COMPONENTS)) {
    const status = component.isPlugin
      ? await getPluginStatus()
      : await getComponentStatus(component);

    const icon = status === 'installed' ? chalk.green('installed')
      : status === 'partial' ? chalk.yellow(' partial')
      : chalk.dim(' missing');

    console.log(`  ${icon}  ${name} — ${component.description}`);

    if (status === 'partial' && !component.isPlugin) {
      const details = await getComponentDetails(component);
      details.missing.forEach(f => console.log(chalk.red(`           missing: ${f}`)));
    }

    if (component.isPlugin && status === 'installed') {
      const version = await getPluginVersion();
      if (version) {
        console.log(chalk.dim(`           version: ${version}  key: ${PLUGIN_KEY}`));
      }
    }
  }

  console.log();
}

async function getPluginStatus() {
  if (!await fs.pathExists(PLUGIN_CACHE_DIR)) return 'missing';
  try {
    const installed = await fs.readJson(INSTALLED_PLUGINS_FILE);
    if (installed?.plugins?.[PLUGIN_KEY]) return 'installed';
    return 'partial';
  } catch {
    return 'partial';
  }
}

async function getPluginVersion() {
  try {
    const installed = await fs.readJson(INSTALLED_PLUGINS_FILE);
    const entries = installed?.plugins?.[PLUGIN_KEY];
    if (entries && entries.length > 0) return entries[0].version;
  } catch { /* ignore */ }
  return null;
}

async function getComponentStatus(component) {
  const allPaths = [];

  if (component.rulesDir) {
    try {
      const templateDir = path.join(TEMPLATES_DIR, component.rulesDir);
      const files = await fs.readdir(templateDir);
      allPaths.push(...files.filter(f => f.endsWith('.md')).map(f => path.join(CLAUDE_DIR, component.rulesDir, f)));
    } catch { /* ignore */ }
  }

  if (component.files) {
    allPaths.push(...component.files.map(f => path.join(CLAUDE_DIR, f.dest)));
  }
  if (component.directories) {
    allPaths.push(...component.directories.map(d => path.join(CLAUDE_DIR, d)));
  }
  if (component.conditional) {
    allPaths.push(...component.conditional.map(f => path.join(CLAUDE_DIR, f.dest)));
  }

  if (allPaths.length === 0) return 'installed';

  const checks = await Promise.all(allPaths.map(p => fs.pathExists(p)));
  const existCount = checks.filter(Boolean).length;

  if (existCount === allPaths.length) return 'installed';
  if (existCount > 0) return 'partial';
  return 'missing';
}

async function getComponentDetails(component) {
  const missing = [];
  const installed = [];

  const allFiles = [];

  if (component.rulesDir) {
    try {
      const templateDir = path.join(TEMPLATES_DIR, component.rulesDir);
      const files = await fs.readdir(templateDir);
      allFiles.push(...files.filter(f => f.endsWith('.md')).map(f => path.join(component.rulesDir, f)));
    } catch { /* ignore */ }
  }

  allFiles.push(
    ...(component.files || []).map(f => f.dest),
    ...(component.directories || []),
    ...(component.conditional || []).map(f => f.dest),
  );

  for (const file of allFiles) {
    const exists = await fs.pathExists(path.join(CLAUDE_DIR, file));
    if (exists) installed.push(file);
    else missing.push(file);
  }

  return { missing, installed };
}
