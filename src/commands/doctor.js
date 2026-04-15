import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { CLAUDE_DIR, COMPONENTS } from '../core/constants.js';

export async function doctorCommand() {
  console.log(chalk.bold('\n  ace doctor — verifying installation\n'));

  const checks = [];

  // 1. Check ~/.claude/ exists
  checks.push(await check('~/.claude/ directory', fs.pathExists(CLAUDE_DIR)));

  // 2. Check core files
  checks.push(await check('CLAUDE.md', fs.pathExists(path.join(CLAUDE_DIR, 'CLAUDE.md'))));
  checks.push(await check('settings.json', fs.pathExists(path.join(CLAUDE_DIR, 'settings.json'))));

  // 3. Check rules
  const ruleFiles = COMPONENTS.rules.files;
  for (const file of ruleFiles) {
    checks.push(await check(`rules/${path.basename(file.dest)}`, fs.pathExists(path.join(CLAUDE_DIR, file.dest))));
  }

  // 4. Check skills
  const skillDirs = COMPONENTS.skills.directories;
  for (const dir of skillDirs) {
    const skillMd = path.join(CLAUDE_DIR, dir, 'SKILL.md');
    checks.push(await check(dir, fs.pathExists(skillMd)));
  }

  // 5. Check memory
  checks.push(await check('memory/MEMORY.md', fs.pathExists(path.join(CLAUDE_DIR, 'memory', 'MEMORY.md'))));

  // 6. Validate settings.json structure
  try {
    const settings = await fs.readJson(path.join(CLAUDE_DIR, 'settings.json'));
    checks.push({ name: 'settings.json valid JSON', ok: true });

    const hasHooks = settings?.permissions?.hooks;
    checks.push({ name: 'settings.json has hooks config', ok: !!hasHooks });

    const hasMemoryDir = settings?.autoMemoryDirectory;
    checks.push({ name: 'settings.json has autoMemoryDirectory', ok: !!hasMemoryDir });
  } catch {
    checks.push({ name: 'settings.json parseable', ok: false });
  }

  // 7. Validate CLAUDE.md @references
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

async function check(name, promise) {
  try {
    const ok = await promise;
    return { name, ok: !!ok };
  } catch {
    return { name, ok: false };
  }
}
