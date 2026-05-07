import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  CLAUDE_DIR, TEMPLATES_DIR, COMPONENTS, isAceOwnedFile,
  PLUGIN_SRC_DIR, PLUGIN_CACHE_DIR, INSTALLED_PLUGINS_FILE,
  KNOWN_MARKETPLACES_FILE, MARKETPLACE_DIR, MARKETPLACE_NAME,
  PLUGIN_KEY, PLUGIN_NAME,
} from './constants.js';
import { mergeClaudeMd, mergeSettingsJson, mergeInstalledPlugins, mergeKnownMarketplaces, conflictCheck, backupFile, backupPreInstall } from './merger.js';

export class Installer {
  constructor(options = {}) {
    this.targetDir = CLAUDE_DIR;
    this.templatesDir = TEMPLATES_DIR;
    this.force = options.force || false;
    this.dryRun = options.dryRun || false;
    this.role = options.role || 'fullstack';
    this.components = options.components || [];
    this.results = { installed: [], skipped: [], merged: [], errors: [] };
    // Per-component resolution: { componentName: 'overwrite' | 'skip' }
    this.resolutions = options.resolutions || {};
    // Suppress inline console.log when caller handles UI
    this.quiet = options.quiet || false;
  }

  /**
   * Detect conflicts for all components before installation.
   * Returns: { componentName: { files: [...conflicting dest paths], hasMerge: bool } }
   */
  async detectConflicts() {
    const conflicts = {};

    for (const componentName of this.components) {
      const component = COMPONENTS[componentName];
      if (!component) continue;

      // Plugin always overwrites — no conflict prompt needed
      if (component.isPlugin) continue;

      const conflicting = [];
      let hasMerge = false;

      // Check rulesDir files
      if (component.rulesDir) {
        const srcDir = path.join(this.templatesDir, component.rulesDir);
        if (await fs.pathExists(srcDir)) {
          const files = await fs.readdir(srcDir);
          for (const file of files) {
            if (!file.endsWith('.md')) continue;
            const destPath = path.join(this.targetDir, component.rulesDir, file);
            if (await fs.pathExists(destPath)) {
              conflicting.push(path.join(component.rulesDir, file));
            }
          }
        }
      }

      // Check recursiveDir files (ACE-owned, no conflict prompt)
      // Skip conflict detection — these are always overwritten via ACE_OWNED_PATTERNS

      // Check regular files
      if (component.files) {
        for (const file of component.files) {
          const destPath = path.join(this.targetDir, file.dest);
          if (await fs.pathExists(destPath)) {
            if (file.merge === 'claude-md' || file.merge === 'settings-json') {
              hasMerge = true;
            } else if (file.merge !== 'skip-existing') {
              conflicting.push(file.dest);
            }
          }
        }
      }

      // Check conditional files
      if (component.conditional) {
        for (const file of component.conditional) {
          if (file.roles && file.roles.includes(this.role)) {
            const destPath = path.join(this.targetDir, file.dest);
            if (await fs.pathExists(destPath)) {
              conflicting.push(file.dest);
            }
          }
        }
      }

      if (conflicting.length > 0) {
        conflicts[componentName] = { files: conflicting, hasMerge };
      }
    }

    return conflicts;
  }

  async run() {
    if (!this.dryRun) {
      await fs.ensureDir(this.targetDir);
      await this.prepare();
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

  /**
   * Prepare the target directory: migrate legacy structure and ensure new layout.
   * Call this before installComponent() if not using run().
   */
  async prepare() {
    await fs.ensureDir(this.targetDir);
    await this.migrateFromLegacy();
    await this.ensureAceStructure();
  }

  /**
   * Migrate from legacy directory structure (rules/ace/) to new (ace/rules/).
   * Only runs if old directory exists.
   */
  async migrateFromLegacy() {
    const legacyDir = path.join(this.targetDir, 'rules', 'ace');
    const newDir = path.join(this.targetDir, 'ace', 'rules');

    if (!await fs.pathExists(legacyDir)) return;

    // Move contents from legacy to new location
    await fs.ensureDir(newDir);
    const files = await fs.readdir(legacyDir);
    for (const file of files) {
      const src = path.join(legacyDir, file);
      const dest = path.join(newDir, file);
      await fs.move(src, dest, { overwrite: true });
    }

    // Remove empty legacy directory
    await fs.remove(legacyDir);
    // Clean up parent if empty
    const rulesParent = path.join(this.targetDir, 'rules');
    if (await fs.pathExists(rulesParent)) {
      const remaining = await fs.readdir(rulesParent);
      if (remaining.length === 0) {
        await fs.remove(rulesParent);
      }
    }

    this.results.merged.push({ file: 'ace/rules/ (migrated from rules/ace/)' });
  }

  /**
   * Ensure the ace/ namespace directory structure exists.
   */
  async ensureAceStructure() {
    await fs.ensureDir(path.join(this.targetDir, 'ace', 'rules'));
    await fs.ensureDir(path.join(this.targetDir, 'ace', 'team'));
  }

  async installComponent(name, component) {
    if (component.isPlugin) {
      await this.installPlugin();
      return;
    }

    if (component.rulesDir) {
      await this.installRulesDir(component.rulesDir, name);
    }

    if (component.recursiveDir) {
      await this.installRecursiveDir(component.recursiveDir, name);
    }

    if (component.files) {
      for (const file of component.files) {
        await this.installFile(file, name);
      }
    }

    if (component.conditional) {
      for (const file of component.conditional) {
        if (file.roles && file.roles.includes(this.role)) {
          await this.installFile(file, name);
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

    // Use package.json version as single source of truth, sync to plugin.json
    const pkgJsonPath = path.join(PLUGIN_SRC_DIR, '..', 'package.json');
    const pluginJson = await fs.readJson(pluginJsonPath);
    if (await fs.pathExists(pkgJsonPath)) {
      const pkgJson = await fs.readJson(pkgJsonPath);
      if (pkgJson.version && pkgJson.version !== pluginJson.version) {
        pluginJson.version = pkgJson.version;
        await fs.writeJson(pluginJsonPath, pluginJson, { spaces: 2 });
      }
    }
    const version = pluginJson.version || '0.0.0';
    const destDir = path.join(PLUGIN_CACHE_DIR, version);

    if (this.dryRun) {
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would create marketplace ${MARKETPLACE_NAME}`));
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would install plugin ${PLUGIN_KEY} v${version} to ${destDir}`));
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would update ${INSTALLED_PLUGINS_FILE}`));
      this.results.installed.push(`plugin:${PLUGIN_KEY} v${version}`);
      return;
    }

    // 1. Setup local marketplace (directory + marketplace.json + known_marketplaces.json)
    await this.setupMarketplace(pluginJson);

    // 2. Copy plugin to cache
    await fs.ensureDir(path.dirname(destDir));
    await fs.copy(PLUGIN_SRC_DIR, destDir, { overwrite: true });

    // 3. Register in installed_plugins.json
    const pluginEntry = {
      scope: 'user',
      installPath: destDir,
      version,
      installedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };
    await mergeInstalledPlugins(INSTALLED_PLUGINS_FILE, PLUGIN_KEY, pluginEntry);

    this.results.installed.push(`plugin:${PLUGIN_KEY} v${version}`);
    this.results.merged.push({ file: 'plugins/installed_plugins.json' });
  }

  async setupMarketplace(pluginJson) {
    // 1. Copy plugin files to marketplace directory
    await fs.ensureDir(MARKETPLACE_DIR);
    await fs.copy(PLUGIN_SRC_DIR, MARKETPLACE_DIR, { overwrite: true });

    // 2. Create marketplace.json alongside the existing plugin.json
    const marketplaceJson = {
      name: MARKETPLACE_NAME,
      owner: pluginJson.author || { name: 'unknown' },
      plugins: [
        {
          name: pluginJson.name,
          source: './',
          description: pluginJson.description || '',
          version: pluginJson.version || '0.0.0',
        },
      ],
    };
    const marketplaceJsonPath = path.join(MARKETPLACE_DIR, '.claude-plugin', 'marketplace.json');
    await fs.ensureDir(path.dirname(marketplaceJsonPath));
    await fs.writeJson(marketplaceJsonPath, marketplaceJson, { spaces: 2 });

    // 3. Register in known_marketplaces.json
    const marketplaceEntry = {
      source: { source: 'local' },
      installLocation: MARKETPLACE_DIR,
      lastUpdated: new Date().toISOString(),
    };
    await mergeKnownMarketplaces(KNOWN_MARKETPLACES_FILE, MARKETPLACE_NAME, marketplaceEntry);

    this.results.merged.push({ file: 'plugins/known_marketplaces.json' });
  }

  async installRulesDir(rulesDir, componentName) {
    const srcDir = path.join(this.templatesDir, rulesDir);
    if (!await fs.pathExists(srcDir)) {
      this.results.errors.push({ file: rulesDir, error: 'Rules directory not found' });
      return;
    }
    const files = await fs.readdir(srcDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      await this.installFile({
        src: path.join(rulesDir, file),
        dest: path.join(rulesDir, file),
      }, componentName);
    }
  }

  async installRecursiveDir(dir, componentName) {
    const srcDir = path.join(this.templatesDir, dir);
    if (!await fs.pathExists(srcDir)) {
      this.results.errors.push({ file: dir, error: 'Directory not found in templates' });
      return;
    }
    await this._walkAndInstall(srcDir, dir, componentName);
  }

  async _walkAndInstall(baseDir, relativeBase, componentName) {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      const srcRel = path.join(relativeBase, entry.name);
      if (entry.isDirectory()) {
        await this._walkAndInstall(path.join(baseDir, entry.name), srcRel, componentName);
      } else if (entry.name.endsWith('.md')) {
        await this.installFile({ src: srcRel, dest: srcRel }, componentName);
      }
    }
  }

  async installFile(fileSpec, componentName) {
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
      // ACE-owned files are always overwritten (no user prompt needed)
      if (isAceOwnedFile(fileSpec.dest)) {
        // fall through to install (overwrite)
      } else if (fileSpec.merge === 'claude-md') {
        await this.mergeClaudeMdFile(srcPath, destPath, fileSpec);
        return;
      } else if (fileSpec.merge === 'settings-json') {
        await this.mergeSettingsJsonFile(srcPath, destPath, fileSpec);
        return;
      } else {
        // Check per-component resolution
        const resolution = this.resolutions[componentName];
        if (resolution === 'overwrite') {
          // fall through to install
        } else {
          // default: skip
          this.results.skipped.push(fileSpec.dest);
          return;
        }
      }
    }

    if (this.dryRun) {
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would install: ${fileSpec.dest}`));
      this.results.installed.push(fileSpec.dest);
      return;
    }

    if (exists && fileSpec.merge) {
      await backupPreInstall(destPath);
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
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would install directory: ${dir}`));
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
    const { content, added, removed } = mergeClaudeMd(existing, template);

    // Skip if content is unchanged (no refs added/removed, managed section identical)
    if (content === existing) {
      this.results.skipped.push(fileSpec.dest);
      return;
    }

    if (this.dryRun) {
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would merge CLAUDE.md`));
      this.results.merged.push({ file: fileSpec.dest, added });
      return;
    }

    await backupPreInstall(destPath);
    await backupFile(destPath);
    await fs.writeFile(destPath, content, 'utf-8');
    this.results.merged.push({ file: fileSpec.dest, added, removed });
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
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would merge settings.json`));
      this.results.merged.push({ file: fileSpec.dest });
      return;
    }

    await backupPreInstall(destPath);
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
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would install user profile template for role: ${this.role}`));
      this.results.installed.push('memory/user_profile.md');
      return;
    }

    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(templatePath, destPath);
    this.results.installed.push('memory/user_profile.md');
  }
}
