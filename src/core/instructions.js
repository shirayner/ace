import fs from 'fs-extra';
import path from 'path';
import { mergeClaudeMd } from './merger.js';

/**
 * Project the instruction file (CLAUDE.md / AGENTS.md) into a target.
 *
 * ── Why this is not just a file copy ─────────────────────────────────────────────
 * The template's rule index is written against `~/.claude/ace/rules/...`. Copied verbatim
 * into `~/.codex/AGENTS.md`, every one of those lines points at a path that tool never
 * reads — the instructions would load but silently reference nothing. The paths have to be
 * rewritten to the target's own instruction root, which is why each target declares one.
 *
 * ── Why the rules travel with it ─────────────────────────────────────────────────
 * The rule files are the payload the index points at. Writing the index without the files
 * produces the same dangling-reference failure from the other direction, so both move
 * together or neither does.
 *
 * The marker-based merge is reused unchanged: it already preserves everything outside
 * ACE's managed section, which is what makes writing into a file the user also edits safe.
 */

/** Rewrite `~/.claude/...` rule references to the target's instruction root. */
export function retargetRefs(content, instructionRoot) {
  if (instructionRoot === '~/.claude') return content;
  return content.replace(/~\/\.claude\//g, `${instructionRoot}/`);
}

/**
 * Install instructions + rules into one target.
 *
 * @param {object} args
 * @param {object} args.target - Resolved target definition.
 * @param {string} args.templatesDir
 * @param {string} args.rulesDir - Relative rules dir, e.g. 'ace/rules'.
 * @returns {Promise<{paths: string[], merged: boolean}>}
 */
export async function installInstructions({ target, templatesDir, rulesDir = 'ace/rules' }) {
  const paths = [];

  // Rules land beside the instruction file that references them, derived from the same path
  // rather than from `target.home`. Those two differ for real targets — DeepSeek Harness
  // reads `~/.agents/AGENTS.md` while its home is `~/.dsh` — and using `home` here put the
  // rules somewhere the rewritten references did not point, producing exactly the dangling
  // index this function exists to avoid. Deriving both from one value makes them agree by
  // construction instead of by coincidence.
  const instructionsRoot = path.dirname(target.instructions);
  const srcRules = path.join(templatesDir, rulesDir);
  const destRules = path.join(instructionsRoot, rulesDir);
  if (await fs.pathExists(srcRules)) {
    await fs.ensureDir(destRules);
    for (const file of await fs.readdir(srcRules)) {
      if (!file.endsWith('.md')) continue;
      const body = await fs.readFile(path.join(srcRules, file), 'utf-8');
      const dest = path.join(destRules, file);
      await fs.writeFile(dest, retargetRefs(body, target.instructionRoot), 'utf-8');
      paths.push(dest);
    }
  }

  // 2. Instruction file, retargeted and merged into whatever the user already has.
  const srcInstructions = path.join(templatesDir, 'CLAUDE.md');
  if (!await fs.pathExists(srcInstructions)) return { paths, merged: false };

  const template = retargetRefs(
    await fs.readFile(srcInstructions, 'utf-8'),
    target.instructionRoot,
  );

  await fs.ensureDir(path.dirname(target.instructions));
  let merged = false;
  if (await fs.pathExists(target.instructions)) {
    const existing = await fs.readFile(target.instructions, 'utf-8');
    const result = mergeClaudeMd(existing, template);
    if (result.content !== existing) {
      await fs.writeFile(target.instructions, result.content, 'utf-8');
      merged = true;
    }
  } else {
    await fs.writeFile(target.instructions, template, 'utf-8');
  }
  paths.push(target.instructions);

  // The `ace/` tree is recorded as a unit, not just its files. Recording only files leaves the
  // now-empty `~/.codex/ace/rules/` behind on uninstall, and a stray ACE directory in a tool's
  // config is indistinguishable from a partial install to anyone inspecting it later.
  const aceRoot = path.join(instructionsRoot, rulesDir.split(/[\\/]/)[0]);
  paths.push(aceRoot);

  return { paths, merged };
}
