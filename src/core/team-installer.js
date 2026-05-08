import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export class TeamInstaller {
  constructor(options = {}) {
    this.targetDir = options.targetDir || process.cwd();
    this.repoUrl = options.repoUrl;
    this.force = options.force || false;
    this.dryRun = options.dryRun || false;
    this.results = { installed: [], skipped: [], errors: [] };
  }

  get teamDir() {
    return path.join(this.targetDir, '.claude', 'rules', 'team');
  }

  async run() {
    if (!this.repoUrl) return this.results;

    const tempDir = path.join(os.tmpdir(), `ace-team-${Date.now()}`);

    try {
      await this.cloneRepo(tempDir);
      await this.copyFiles(tempDir);
    } finally {
      await fs.remove(tempDir);
    }

    return this.results;
  }

  async cloneRepo(tempDir) {
    if (this.dryRun) {
      this.results.installed.push(`git clone ${this.repoUrl} (dry-run)`);
      return;
    }

    try {
      execSync(`git clone --depth 1 "${this.repoUrl}" "${tempDir}"`, {
        stdio: 'pipe',
        timeout: 60000,
      });
    } catch (err) {
      const msg = err.stderr ? err.stderr.toString().trim() : err.message;
      this.results.errors.push({
        component: 'team-clone',
        error: `Failed to clone ${this.repoUrl}: ${msg}`,
      });
      throw err;
    }
  }

  async copyFiles(tempDir) {
    if (this.dryRun) {
      this.results.installed.push(`.claude/rules/team/ (from ${this.repoUrl})`);
      return;
    }

    if (!await fs.pathExists(tempDir)) return;

    const exists = await fs.pathExists(this.teamDir);
    if (exists && !this.force) {
      this.results.skipped.push('.claude/rules/team/ (already exists, use --force to overwrite)');
      return;
    }

    if (exists) {
      await fs.remove(this.teamDir);
    }

    await fs.ensureDir(this.teamDir);
    await this._copyRecursive(tempDir, this.teamDir);
  }

  async _copyRecursive(srcDir, destDir) {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git') continue;

      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        await fs.ensureDir(destPath);
        await this._copyRecursive(srcPath, destPath);
      } else {
        await fs.copy(srcPath, destPath);
        const relative = path.relative(this.teamDir, destPath).replace(/\\/g, '/');
        this.results.installed.push(`.claude/rules/team/${relative}`);
      }
    }
  }
}
