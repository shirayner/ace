import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import {
  CLAUDE_DIR, TEMPLATES_DIR, COMPONENTS, isAceOwnedFile,
  PLUGIN_SRC_DIR, PLUGIN_CACHE_DIR, INSTALLED_PLUGINS_FILE,
  KNOWN_MARKETPLACES_FILE, MARKETPLACE_DIR, MARKETPLACE_NAME,
  PLUGIN_KEY, PLUGIN_NAME, CANONICAL_SKILLS_DIR,
} from './constants.js';
import { resolveTargets, PROJECTION } from './targets.js';
import {
  writeCanonicalStore, projectToTarget, findProjectionConflicts,
} from './projector.js';
import { installInstructions } from './instructions.js';
import { readReceipt, writeReceipt } from './install-receipt.js';
import { discoverCatalog, indexSkills, resolveSelection } from './skills-catalog.js';
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
    // { categories: string[], skills: string[] } — null installs the recommended set
    this.skillSelection = options.skillSelection || null;
    // Plugin source root; overridable so tests can deploy from a fixture tree
    this.pluginSrcDir = options.pluginSrcDir || PLUGIN_SRC_DIR;
    // Install targets. Defaults to Claude Code alone so an existing call site — and the
    // upgrade path of a user who installed before multi-target existed — behaves exactly
    // as before; opting into more tools is an explicit choice.
    this.targets = options.targets || ['claude-code'];
    this.canonicalDir = options.canonicalDir || CANONICAL_SKILLS_DIR;
    // Records what was written where, for uninstall.
    this.receipt = { targets: [], skills: [], canonicalSkills: [], canonicalDir: this.canonicalDir };
  }


  /** Categorized skills directory inside the plugin source. */
  get skillsSrcDir() {
    return path.join(this.pluginSrcDir, 'skills');
  }


  /**
   * Detect conflicts for all components before installation.
   * Returns: { componentName: { files: [...conflicting dest paths], hasMerge: bool } }
   */
  async detectConflicts() {
    const conflicts = {};

    // Every non-plugin component writes into ~/.claude/, which is not touched at all when
    // Claude Code is unselected. Reporting those files as conflicts would ask the user to
    // resolve overwrites that are never going to happen.
    if (!this.includesClaudeCode) return conflicts;

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

  /**
   * Is Claude Code among the selected targets?
   *
   * The `core`, `rules`, `hooks` and `memory` components all write into `~/.claude/` — its
   * `CLAUDE.md`, its `settings.json`, its hook scripts. None of that is read by any other
   * tool, so installing it for a Codex-only user creates a Claude Code configuration they
   * never asked for and would reasonably read as ACE having installed the wrong thing.
   * Per-target instructions and rules are delivered by `installInstructions` instead.
   */
  get includesClaudeCode() {
    return this.targets.includes('claude-code');
  }

  async run() {
    if (!this.dryRun) {
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
    // No-op when Claude Code is unselected: this creates ~/.claude/ and its ace/ layout,
    // and nothing else reads them. Guarding here rather than at the call sites means a
    // caller that drives the installer directly — `ace init` does — cannot bypass it.
    if (!this.includesClaudeCode) return;

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
  }

  async installComponent(name, component) {
    if (component.isPlugin) {
      await this.installPlugin();
      return;
    }

    // Every non-plugin component writes into ~/.claude/ — CLAUDE.md, settings.json, hook
    // scripts, memory templates — none of which any other tool reads. Installing them for a
    // Codex-only user would leave behind a Claude Code configuration they never asked for.
    // Guarded here, at the single method that performs the writes, so the direct-drive path
    // used by `ace init` is covered too.
    if (!this.includesClaudeCode) {
      this.results.skipped.push(`${name} (Claude Code not selected)`);
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
    const pluginJsonPath = path.join(this.pluginSrcDir, '.claude-plugin', 'plugin.json');
    if (!await fs.pathExists(pluginJsonPath)) {
      this.results.errors.push({ component: 'plugin', error: 'Plugin source not found' });
      return;
    }

    // Use package.json version as single source of truth, sync to plugin.json
    const pkgJsonPath = path.join(this.pluginSrcDir, '..', 'package.json');
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

    const skills = await this.resolveSkillsToInstall();
    const targets = resolveTargets(this.targets);
    const wantsClaude = targets.some(t => t.projection === PROJECTION.REGISTRY);
    const sharedTargets = targets.filter(t => t.projection !== PROJECTION.REGISTRY);

    if (this.dryRun) {
      if (wantsClaude) {
        !this.quiet && console.log(chalk.cyan(`  [dry-run] Would create marketplace ${MARKETPLACE_NAME}`));
        !this.quiet && console.log(chalk.cyan(`  [dry-run] Would install plugin ${PLUGIN_KEY} v${version} to ${destDir}`));
      }
      !this.quiet && console.log(chalk.cyan(`  [dry-run] Would install ${skills.length} skill(s): ${skills.join(', ')}`));
      if (sharedTargets.length > 0) {
        !this.quiet && console.log(chalk.cyan(`  [dry-run] Would write canonical store ${this.canonicalDir}`));
        for (const target of sharedTargets) {
          !this.quiet && console.log(chalk.cyan(`  [dry-run] ${target.label}: projection ${target.projection}`));
        }
      }
      if (wantsClaude) {
        !this.quiet && console.log(chalk.cyan(`  [dry-run] Would update ${INSTALLED_PLUGINS_FILE}`));
      }
      this.results.installed.push(`plugin:${PLUGIN_KEY} v${version}`);
      return;
    }

    if (wantsClaude) {
      // 1. Setup local marketplace (directory + marketplace.json + known_marketplaces.json)
      await this.setupMarketplace(pluginJson, skills);

      // 2. Deploy plugin to cache (clean first to remove stale files)
      await this.deployPlugin(destDir, skills);

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
      this.receipt.targets.push({
        id: 'claude-code',
        projection: PROJECTION.REGISTRY,
        skillsDir: destDir,
        paths: [destDir, MARKETPLACE_DIR],
      });
    }

    if (sharedTargets.length > 0) {
      await this.installSharedSkills(sharedTargets, skills);
    }

    this.receipt.skills = skills;
    await writeReceipt(this.receipt);
  }

  /**
   * Write the canonical store once, then project it into the non-Claude targets.
   *
   * Targets whose projection is `none` are satisfied by the store alone — that is why
   * `~/.agents/skills` is the canonical root rather than a private ACE directory.
   */
  async installSharedSkills(targets, skills) {
    const index = indexSkills(await this.getCatalog());
    const previousReceipt = await readReceipt();
    const previousTargets = new Map(
      (previousReceipt?.targets ?? []).map(target => [target.id, target]),
    );

    const conflicts = [];
    for (const target of targets) {
      conflicts.push(...await findProjectionConflicts({
        target,
        skills,
        previousPaths: previousTargets.get(target.id)?.paths ?? [],
      }));
    }
    if (conflicts.length > 0) {
      throw new Error(`Skill projection conflicts:\n${conflicts.map(file => `- ${file}`).join('\n')}`);
    }

    const { dir, entries } = await writeCanonicalStore({
      destDir: this.canonicalDir,
      skillsSrcDir: this.skillsSrcDir,
      skills,
      index,
      onError: error => this.results.errors.push({ component: 'plugin', error }),
    });
    this.receipt.canonicalSkills = entries;

    this.results.installed.push(`skills:${skills.length} → ${dir}`);

    for (const target of targets) {
      try {
        const { mode, paths } = await projectToTarget({
          target,
          canonicalDir: dir,
          skills,
          index,
          previousPaths: previousTargets.get(target.id)?.paths ?? [],
        });

        // Rules and the index that references them are only useful together, so the
        // instruction layer is installed alongside the skills for the same target.
        const instructions = await installInstructions({
          target,
          templatesDir: this.templatesDir,
          rulesDir: COMPONENTS.rules.rulesDir,
        });

        this.receipt.targets.push({
          id: target.id,
          projection: mode,
          skillsDir: target.skillsDir,
          paths: [...paths, ...instructions.paths],
        });
        this.results.installed.push(
          mode === PROJECTION.NONE
            ? `target:${target.id} (reads ${dir} natively)`
            : `target:${target.id} (${mode}, ${paths.length} skill(s))`
        );
        if (instructions.merged) {
          this.results.merged.push({ file: `${target.id}:${path.basename(target.instructions)}` });
        }
      } catch (err) {
        this.results.errors.push({ component: `target:${target.id}`, error: err.message });
      }
    }
  }

  async setupMarketplace(pluginJson, skills) {
    // 1. Deploy plugin files to marketplace directory (clean first to remove stale files)
    await this.deployPlugin(MARKETPLACE_DIR, skills);

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
      source: { source: 'directory', path: MARKETPLACE_DIR },
      installLocation: MARKETPLACE_DIR,
      lastUpdated: new Date().toISOString(),
    };
    await mergeKnownMarketplaces(KNOWN_MARKETPLACES_FILE, MARKETPLACE_NAME, marketplaceEntry);

    this.results.merged.push({ file: 'plugins/known_marketplaces.json' });
  }

  /**
   * Copy the plugin into `destDir`, flattening the selected skills.
   *
   * Source layout groups skills by category (`plugin/skills/<category>/<skill>/`) for
   * readability, but Claude Code only discovers `skills/<skill>/SKILL.md` one level deep,
   * so the category layer is dropped on the way out. Unselected skills are not copied at
   * all — the destination is the installed surface, so absence is what disables them.
   *
   * @param {string} destDir - Destination plugin root.
   * @param {string[]} skills - Skill names to install (already resolved from the selection).
   */
  async deployPlugin(destDir, skills) {
    await fs.remove(destDir);
    await fs.ensureDir(destDir);

    // Everything outside skills/ is shared infrastructure (agents, commands, shared protocols)
    const skillsSrcDir = this.skillsSrcDir;
    await fs.copy(this.pluginSrcDir, destDir, {
      overwrite: true,
      filter: src => src !== skillsSrcDir && !src.startsWith(skillsSrcDir + path.sep),
    });

    const index = indexSkills(await this.getCatalog());
    const destSkillsDir = path.join(destDir, 'skills');
    await fs.ensureDir(destSkillsDir);

    for (const skill of skills) {
      const category = index.get(skill);
      if (!category) {
        this.results.errors.push({ component: 'plugin', error: `Skill not found in catalog: ${skill}` });
        continue;
      }
      await fs.copy(
        path.join(skillsSrcDir, category, skill),
        path.join(destSkillsDir, skill),
        { overwrite: true }
      );
    }
  }

  /** Discover the catalog once per installer run. */
  async getCatalog() {
    if (!this._catalog) this._catalog = await discoverCatalog(this.skillsSrcDir);
    return this._catalog;
  }

  /**
   * Resolve the configured selection into concrete skill names.
   * A null selection installs the recommended categories.
   */
  async resolveSkillsToInstall() {
    const catalog = await this.getCatalog();
    const resolved = resolveSelection(catalog, this.skillSelection);
    for (const skill of resolved.dropped) {
      this.results.skipped.push(`skill:${skill} (no longer in catalog)`);
    }
    return resolved.skills;
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

    // Shell scripts must use LF — Mac/Linux bash cannot parse CRLF
    if (destPath.endsWith('.sh')) {
      const content = await fs.readFile(srcPath, 'utf-8');
      await fs.writeFile(destPath, content.replace(/\r\n/g, '\n'), { mode: 0o755 });
    } else {
      await fs.copy(srcPath, destPath);
    }

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
    const { merged } = mergeSettingsJson(existing, template);

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
