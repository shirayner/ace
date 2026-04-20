import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import yaml from 'js-yaml';
import { OPENSPEC_TEMPLATES_DIR, SPEC_TEMPLATE_FILES } from './constants.js';
import { mergeSpecConfig } from './yaml-merger.js';
import { backupFile } from './merger.js';

export class SpecInstaller {
  constructor(options = {}) {
    this.targetDir = options.targetDir || process.cwd();
    this.templatesDir = OPENSPEC_TEMPLATES_DIR;
    this.force = options.force || false;
    this.dryRun = options.dryRun || false;
    this.skipOpenspec = options.skipOpenspec || false;
    this.results = { installed: [], skipped: [], merged: [], errors: [] };
  }

  get openspecDir() {
    return path.join(this.targetDir, 'openspec');
  }

  async run() {
    await this.ensureOpenspecCli();
    await this.runOpenspecInit();
    await this.installTemplates();
    await this.installConfig();
    return this.results;
  }

  async ensureOpenspecCli() {
    if (this.skipOpenspec) return;

    if (this.isOpenspecInstalled()) {
      this.results.skipped.push('@fission-ai/openspec (already installed)');
      return;
    }

    if (this.dryRun) {
      this.results.installed.push('@fission-ai/openspec (npm global)');
      return;
    }

    try {
      execSync('npm install -g @fission-ai/openspec', { stdio: 'pipe' });
      this.results.installed.push('@fission-ai/openspec (npm global)');
    } catch (err) {
      this.results.errors.push({
        component: 'openspec-cli',
        error: `Failed to install @fission-ai/openspec: ${err.message}. Use --skip-openspec to skip.`,
      });
    }
  }

  isOpenspecInstalled() {
    try {
      execSync('openspec --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async runOpenspecInit() {
    if (this.skipOpenspec) return;

    if (this.dryRun) {
      this.results.installed.push('openspec/ (via openspec init)');
      return;
    }

    if (!this.isOpenspecInstalled()) return;

    try {
      execSync('openspec init', { cwd: this.targetDir, stdio: 'inherit' });
      this.results.installed.push('openspec/ (via openspec init)');
    } catch (err) {
      this.results.errors.push({
        component: 'openspec-init',
        error: `openspec init failed: ${err.message}`,
      });
    }
  }

  async installTemplates() {
    for (const file of SPEC_TEMPLATE_FILES) {
      const srcPath = path.join(this.templatesDir, file);
      const destPath = path.join(this.openspecDir, 'templates', file);

      if (!await fs.pathExists(srcPath)) {
        this.results.errors.push({ file, error: 'Template not found' });
        continue;
      }

      const exists = await fs.pathExists(destPath);
      if (exists && !this.force) {
        this.results.skipped.push(`openspec/templates/${file}`);
        continue;
      }

      if (this.dryRun) {
        this.results.installed.push(`openspec/templates/${file}`);
        continue;
      }

      await fs.ensureDir(path.dirname(destPath));
      await fs.copy(srcPath, destPath, { overwrite: this.force });
      this.results.installed.push(`openspec/templates/${file}`);
    }
  }

  async installConfig() {
    const srcPath = path.join(this.templatesDir, 'config.yaml');
    const destPath = path.join(this.openspecDir, 'config.yaml');

    if (!await fs.pathExists(srcPath)) {
      this.results.errors.push({ file: 'config.yaml', error: 'Template not found' });
      return;
    }

    const exists = await fs.pathExists(destPath);

    if (exists && !this.force) {
      // Merge: system fields overwrite, user fields preserve
      if (this.dryRun) {
        this.results.merged.push({ file: 'openspec/config.yaml' });
        return;
      }

      const existingContent = await fs.readFile(destPath, 'utf-8');
      const templateContent = await fs.readFile(srcPath, 'utf-8');
      const existing = yaml.load(existingContent);
      const template = yaml.load(templateContent);
      const merged = mergeSpecConfig(existing, template);

      await backupFile(destPath);
      await fs.writeFile(destPath, yaml.dump(merged, { lineWidth: -1 }), 'utf-8');
      this.results.merged.push({ file: 'openspec/config.yaml', version: merged.version });
      return;
    }

    if (this.dryRun) {
      this.results.installed.push('openspec/config.yaml');
      return;
    }

    await fs.ensureDir(path.dirname(destPath));
    await fs.copy(srcPath, destPath);
    this.results.installed.push('openspec/config.yaml');
  }

  async doctor() {
    const checks = [];

    // 1. Node.js version
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1));
    checks.push({ name: 'Node.js >= 18', ok: major >= 18 });

    // 2. openspec CLI
    checks.push({ name: '@fission-ai/openspec CLI', ok: this.isOpenspecInstalled() });

    // 3. openspec/ directory
    checks.push({ name: 'openspec/ directory', ok: await fs.pathExists(this.openspecDir) });

    // 4. config.yaml
    const configPath = path.join(this.openspecDir, 'config.yaml');
    const configExists = await fs.pathExists(configPath);
    checks.push({ name: 'openspec/config.yaml', ok: configExists });

    if (configExists) {
      try {
        const config = yaml.load(await fs.readFile(configPath, 'utf-8'));
        checks.push({ name: 'config.yaml has schema field', ok: !!config?.schema });
        checks.push({ name: `config.yaml version: ${config?.version || 'unknown'}`, ok: !!config?.version });
      } catch {
        checks.push({ name: 'config.yaml valid YAML', ok: false });
      }
    }

    // 5. Required template files
    for (const file of SPEC_TEMPLATE_FILES) {
      const filePath = path.join(this.openspecDir, 'templates', file);
      checks.push({
        name: `template: ${file}`,
        ok: await fs.pathExists(filePath),
      });
    }

    // 6. Git
    try {
      execSync('git --version', { stdio: 'pipe' });
      checks.push({ name: 'Git available', ok: true });
    } catch {
      checks.push({ name: 'Git available', ok: false });
    }

    return checks;
  }
}
