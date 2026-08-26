import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import {
  CLAUDE_DIR, COMPONENTS, TEMPLATES_DIR, CANONICAL_SKILLS_DIR,
  PLUGIN_CACHE_DIR, INSTALLED_PLUGINS_FILE, PLUGIN_KEY,
  KNOWN_MARKETPLACES_FILE, MARKETPLACE_DIR, MARKETPLACE_NAME,
} from '../core/constants.js';
import { TARGETS } from '../core/targets.js';
import { readReceipt } from '../core/install-receipt.js';
import { readTargetSelection } from '../core/target-selection.js';
import { discoverCatalog, resolveSelection } from '../core/skills-catalog.js';
import { readSelection } from '../core/skills-selection.js';

export async function doctorCommand() {
  console.log(chalk.bold('\n  ace doctor — verifying installation\n'));

  const checks = [];

  // Which targets is this install even supposed to cover?
  //
  // The Claude Code checks below are specific to its plugin/marketplace mechanism, which no
  // other target uses. Running them unconditionally reported five hard failures for a
  // perfectly healthy Codex-only install — and a doctor that cries wolf on a correct install
  // trains users to ignore it, which costs more than the check is worth. Absent any recorded
  // choice, Claude Code is assumed, matching the historical single-target behaviour.
  const receipt = await readReceipt();
  const selected = await readTargetSelection()
    ?? receipt?.targets?.map(t => t.id)
    ?? ['claude-code'];
  const checksClaude = selected.includes('claude-code');

  if (checksClaude) {
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
  }

  // 4-8. Claude Code's plugin/marketplace mechanism, its settings.json wiring, and its
  // CLAUDE.md reference index. All of it is Claude-specific: no other target has a plugin
  // cache, a marketplace, or an enabledPlugins map, so none of it can be checked for them.
  if (checksClaude) {
    // 4. Check plugin installation
    const pluginInstallDir = await getPluginInstallDir();
    if (pluginInstallDir) {
      const pluginJsonPath = path.join(pluginInstallDir, '.claude-plugin', 'plugin.json');
      checks.push(await check('plugin: ace directory', Promise.resolve(true)));
      checks.push(await check('plugin: plugin.json', fs.pathExists(pluginJsonPath)));

      // Check exactly the skills the selection asks for — a hardcoded list would report
      // a deliberately deselected skill as a failure, and would miss newly added ones.
      const expected = resolveSelection(await discoverCatalog(), await readSelection());
      for (const skill of expected.skills) {
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
  }

  // 9. Verify each recorded target actually landed on disk.
  //
  // Trusting a stored "installed" flag is exactly the failure mode observed in another
  // multi-target installer on this machine: its lock file listed agents it had never
  // materialized anything for. So verification reads the filesystem, and uses lstat rather
  // than pathExists because a dangling link — the characteristic failure of a projected
  // install whose source moved — follows to a missing target and would otherwise be
  // indistinguishable from "never installed".
  if (receipt) {
    for (const target of receipt.targets ?? []) {
      if (target.id === 'claude-code') continue;
      const def = TARGETS[target.id];
      checks.push({
        name: `target ${def?.label ?? target.id}: ${target.projection}`,
        ok: true,
      });
      for (const skill of receipt.skills ?? []) {
        const canonicalEntry = receipt.canonicalSkills?.find(entry => entry.name === skill);
        const expected = target.projection === 'none'
          ? path.join(
              canonicalEntry?.path ?? path.join(receipt.canonicalDir ?? CANONICAL_SKILLS_DIR, skill),
              'SKILL.md',
            )
          : path.join(target.skillsDir, skill, 'SKILL.md');
        checks.push(await check(`${target.id}: ${skill}`, pathIsPresent(expected)));
      }

      // Every rule the instruction index points at must exist. The index is rewritten per
      // target, so a mismatch between where refs point and where files land produces an
      // index that loads cleanly and resolves to nothing — silent, and invisible to a
      // check that only asks whether some file was written.
      if (def?.instructions) {
        checks.push(...await checkInstructionRefs(target.id, def.instructions));
      }
    }
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

/**
 * Check that every `~/...md` reference in a target's instruction file resolves.
 *
 * Reported as a single aggregate check: one line per rule file would bury the summary under
 * dozens of entries per target, and the actionable fact is "N references dangle", not which.
 */
async function checkInstructionRefs(targetId, instructionsPath) {
  const home = process.env.HOME || process.env.USERPROFILE;
  try {
    const body = await fs.readFile(instructionsPath, 'utf-8');
    const refs = [...body.matchAll(/~\/([^\s—)]+\.md)/g)].map(m => m[1]);
    if (refs.length === 0) return [];

    const dangling = [];
    for (const ref of refs) {
      if (!await fs.pathExists(path.join(home, ref))) dangling.push(ref);
    }
    return [{
      name: dangling.length === 0
        ? `${targetId}: ${refs.length} instruction ref(s) resolve`
        : `${targetId}: ${dangling.length}/${refs.length} instruction ref(s) dangling (${dangling[0]}...)`,
      ok: dangling.length === 0,
    }];
  } catch {
    return [{ name: `${targetId}: instructions readable`, ok: false }];
  }
}

/**
 * Does the path exist as an entry, even a broken link?
 *
 * `fs.pathExists` follows links, so a dangling junction — a projected skill whose canonical
 * source was removed — reports false and looks identical to "never installed". `lstat`
 * distinguishes them: the name is occupied, so the install is present but broken, which is
 * the condition worth reporting.
 */
async function pathIsPresent(target) {
  try {
    await fs.lstat(target);
    // A link that resolves nowhere is present-but-broken; report it as a failure.
    return await fs.pathExists(target);
  } catch {
    return false;
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
