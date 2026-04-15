import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  CLAUDE_DIR, TEMPLATES_DIR, COMPONENTS,
  PLUGIN_SRC_DIR, PLUGIN_CACHE_DIR, INSTALLED_PLUGINS_FILE, PLUGIN_KEY,
} from './constants.js';
import { mergeClaudeMd, mergeSettingsJson, mergeInstalledPlugins, conflictCheck, backupFile } from './merger.js';

export class Installer {
  constructor(options = {}) {
    this.targetDir = CLAUDE_DIR;
    this.templatesDir = TEMPLATES_DIR;
    this.force = options.force || false;
    this.dryRun = options.dryRun || false;
    this.role = options.role || 'fullstack';
    this.components = options.components || [];
    this.results = { installed: [], skipped: [], merged: [], errors: [] };
  }

  async run() {
    if (!this.dryRun) {
      await fs.ensureDir(this.targetDir);
    }

    for (const componentName of this.components) {
      const component = COMPONENTS[componentName];
      if (!component) continue;

      const spinner = ora(`Installing ${componentName}...`).start();

      try {
        await this.installComponent(componentName, component);
        spinner.succeed(`${componentName} installed`);
      } catch (err) {
        spinner.fail(`${componentName} failed: ${err.message}`);
        this.results.errors.push({ component: componentName, error: err.message });
      }
    }

    return this.results;
  }

  async installComponent(name, component) {
    if (component.isPlugin) {
      await this.installPlugin();
      return;
    }

    if (component.files) {
      for (const file of component.files) {
        await this.installFile(file);
      }
    }

    if (component.conditional) {
      for (const file of component.conditional) {
        if (file.roles && file.roles.includes(this.role)) {
          await this.installFile(file);
        }
      }
    }

    if (component.directories) {
      for (const dir of component.directories) {
        await this.installDirectory(dir);
      }
    }

    if (component.roleTemplates) {
      await this.installRoleTemplate();
    }
  }

  async installPlugin() {
    const pluginJsonPath = path.join(PLUGIN_SRC_DIR, '.claude-plugin', 'plugin.json');
    if (!await fs.pathExists(pluginJsonPath)) {
      this.results.errors.push({ component: 'plugin', error: 'Plugin source not found' });
      return;
    }

    const pluginJson = await fs.readJson(pluginJsonPath);
    const version = pluginJson.version || '0.0.0';
    const destDir = path.join(PLUGIN_CACHE_DIR, version);

    if (this.dryRun) {
      console.log(chalk.cyan(`  [dry-run] Would install plugin ${PLUGIN_KEY} v${version} to ${destDir}`));
      console.log(chalk.cyan(`  [dry-run] Would update ${INSTALLED_PLUGINS_FILE}`));
      this.results.installed.push(`plugin:${PLUGIN_KEY} v${version}`);
      return;
    }

    await fs.ensureDir(path.dirname(destDir));
    await fs.copy(PLUGIN_SRC_DIR, destDir, { overwrite: true });
    this.results.installed.push(`plugin:${PLUGIN_KEY} v${version}`);

    const pluginEntry = {
      scope: 'user',
      installPath: destDir,
      version,
      installedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    await mergeInstalledPlugins(INSTALLED_PLUGINS_FILE, PLUGIN_KEY, pluginEntry);
    this.results.merged.push({ file: 'plugins/installed_plugins.json' });
  }

  async installFile(fileSpec) {
    const srcPath = path.join(this.templatesDir, fileSpec.src);
    const destPath = path.join(this.targetDir, fileSpec.dest);

    if (!await fs.pathExists(srcPath)) {
      this.results.errors.push({ file: fileSpec.src, error: 'Template file not found' });
      return;
    }

    const exists = await conflictCheck(destPath);

    if (exists && fileSpec.merge === 'skip-existing') {
      this.results.skipped.push(fileSpec.dest);
      return;
    }

    if (exists && !this.force) {
      if (fileSpec.merge === 'claude-md') {
        await this.mergeClaudeMdFile(srcPath, destPath, fileSpec);
        return;
      }
      if (fileSpec.merge === 'settings-json') {
        await this.mergeSettingsJsonFile(srcPath, destPath, fileSpec);
        return;
      }
      this.results.skipped.push(fileSpec.dest);
      return;
    }

    if (this.dryRun) {
      console.log(chalk.cyan(`  [dry-run] Would install: ${fileSpec.dest}`));
      this.results.installed.push(fileSpec.dest);
      return;
    }

    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(srcPath, destPath);
    this.results.installed.push(fileSpec.dest);
  }

  async installDirectory(dir) {
    const srcPath = path.join(this.templatesDir, dir);
    const destPath = path.join(this.targetDir, dir);

    if (!await fs.pathExists(srcPath)) {
      this.results.errors.push({ file: dir, error: 'Template directory not found' });
      return;
    }

    const exists = await conflictCheck(destPath);

    if (exists && !this.force) {
      this.results.skipped.push(dir);
      return;
    }

    if (this.dryRun) {
      console.log(chalk.cyan(`  [dry-run] Would install directory: ${dir}`));
      this.results.installed.push(dir);
      return;
    }

    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(srcPath, destPath, { overwrite: this.force });
    this.results.installed.push(dir);
  }

  async mergeClaudeMdFile(srcPath, destPath, fileSpec) {
    const existing = await fs.readFile(destPath, 'utf-8');
    const template = await fs.readFile(srcPath, 'utf-8');
    const { content, added } = mergeClaudeMd(existing, template);

    if (added.length === 0) {
      this.results.skipped.push(fileSpec.dest);
      return;
    }

    if (this.dryRun) {
      console.log(chalk.cyan(`  [dry-run] Would merge CLAUDE.md, adding ${added.length} references`));
      this.results.merged.push({ file: fileSpec.dest, added });
      return;
    }

    await backupFile(destPath);
    await fs.writeFile(destPath, content, 'utf-8');
    this.results.merged.push({ file: fileSpec.dest, added });
  }

  async mergeSettingsJsonFile(srcPath, destPath, fileSpec) {
    const existing = await fs.readJson(destPath);
    const template = await fs.readJson(srcPath);
    const merged = mergeSettingsJson(existing, template);

    if (JSON.stringify(existing) === JSON.stringify(merged)) {
      this.results.skipped.push(fileSpec.dest);
      return;
    }

    if (this.dryRun) {
      console.log(chalk.cyan(`  [dry-run] Would merge settings.json`));
      this.results.merged.push({ file: fileSpec.dest });
      return;
    }

    await backupFile(destPath);
    await fs.writeJson(destPath, merged, { spaces: 2 });
    this.results.merged.push({ file: fileSpec.dest });
  }

  async installRoleTemplate() {
    const templatePath = path.join(this.templatesDir, 'memory', 'roles', `${this.role}.md`);
    const destPath = path.join(this.targetDir, 'memory', 'user_profile.md');

    if (await conflictCheck(destPath)) {
      this.results.skipped.push('memory/user_profile.md');
      return;
    }

    if (!await fs.pathExists(templatePath)) {
      this.results.errors.push({ file: `memory/roles/${this.role}.md`, error: 'Role template not found' });
      return;
    }

    if (this.dryRun) {
      console.log(chalk.cyan(`  [dry-run] Would install user profile template for role: ${this.role}`));
      this.results.installed.push('memory/user_profile.md');
      return;
    }

    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(templatePath, destPath);
    this.results.installed.push('memory/user_profile.md');
  }
}
