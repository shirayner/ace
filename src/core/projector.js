import fs from 'fs-extra';
import path from 'path';
import { PROJECTION } from './targets.js';

/**
 * Write the canonical flat skill store, then project it into targets that need copies.
 *
 * ── The flattening happens here, once ────────────────────────────────────────────
 * Source is `plugin/skills/<category>/<skill>/`; the store is `<skill>/`. The category
 * layer is a source-tree convenience: DeepSeek Harness and Claude Code only scan one level,
 * so a nested SKILL.md is invisible to them. Flattening once up front means every target
 * reads the same layout and no target needs its own flattening step.
 *
 * ── Why absence, not registration, disables a skill ──────────────────────────────
 * The store is rebuilt from scratch each run. A deselected skill is *removed*, not merely
 * unregistered — otherwise deselecting something you previously installed would be
 * cosmetic on every machine that ever had it.
 */

/**
 * Rebuild the canonical store at `destDir` from the categorized source.
 *
 * @param {object} args
 * @param {string} args.destDir - Canonical skills directory.
 * @param {string} args.skillsSrcDir - Categorized source (`plugin/skills`).
 * @param {string[]} args.skills - Skill names to install.
 * @param {Map<string,string>} args.index - skill name → category.
 * @param {(msg: string) => void} [args.onError]
 * @returns {Promise<{written: string[], dir: string}>}
 */
export async function writeCanonicalStore({ destDir, skillsSrcDir, skills, index, onError }) {
  // Prune only ACE's own entries: the cross-agent store is shared with other installers
  // (the `skills` CLI keeps its own tree there), so wiping the directory would delete
  // skills ACE never owned.
  await pruneManagedSkills(destDir, skills);
  await fs.ensureDir(destDir);

  const written = [];
  for (const skill of skills) {
    const category = index.get(skill);
    if (!category) {
      onError?.(`Skill not found in catalog: ${skill}`);
      continue;
    }
    const dest = path.join(destDir, skill);
    await fs.remove(dest);
    await fs.copy(path.join(skillsSrcDir, category, skill), dest, { overwrite: true });
    written.push(dest);
  }
  return { written, dir: destDir };
}

/**
 * Project the canonical store into one target.
 *
 * `none` targets read the store natively, so projecting them is a no-op by construction —
 * that is the whole payoff of choosing `~/.agents/skills` as the canonical root.
 *
 * @returns {Promise<{mode: string, paths: string[]}>}
 */
export async function projectToTarget({ target, canonicalDir, skills }) {
  if (target.projection === PROJECTION.NONE) {
    return { mode: PROJECTION.NONE, paths: [] };
  }
  if (target.projection === PROJECTION.REGISTRY) {
    // Claude Code is handled by the plugin/marketplace path in the installer, which owns
    // its cache dir and registry files. Nothing to project here.
    return { mode: PROJECTION.REGISTRY, paths: [] };
  }

  await fs.ensureDir(target.skillsDir);
  const paths = [];

  for (const skill of skills) {
    const src = path.join(canonicalDir, skill);
    const dest = path.join(target.skillsDir, skill);
    if (!await fs.pathExists(src)) continue;

    await fs.remove(dest);
    if (target.projection === PROJECTION.LINK) {
      await linkDir(src, dest);
    } else {
      await fs.copy(src, dest, { overwrite: true });
    }
    paths.push(dest);
  }

  return { mode: target.projection, paths };
}

/**
 * Link a directory, degrading to a copy rather than failing the install.
 *
 * On Windows a directory symlink needs elevation or developer mode, so `junction` is tried
 * first — it needs neither. If linking is unavailable entirely (restrictive policy, or a
 * filesystem that has no link concept) a copy still produces a working install; refusing to
 * install at all would be a worse outcome than duplicated bytes.
 */
export async function linkDir(src, dest) {
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  try {
    await fs.symlink(src, dest, type);
    return 'link';
  } catch {
    try {
      await fs.copy(src, dest, { overwrite: true });
      return 'copy';
    } catch (err) {
      throw new Error(`could not link or copy ${src} → ${dest}: ${err.message}`);
    }
  }
}

/**
 * Remove ACE-managed skill entries that are no longer selected.
 *
 * Identifying "managed" by the current selection alone is not sufficient across runs, so
 * the caller passes the full desired set and anything stale is dropped by the receipt-driven
 * cleanup instead. Here we only clear entries we are about to rewrite, which keeps the
 * shared directory's foreign entries untouched.
 */
async function pruneManagedSkills(destDir, skills) {
  if (!await fs.pathExists(destDir)) return;
  for (const skill of skills) {
    await fs.remove(path.join(destDir, skill));
  }
}

/**
 * Remove a recorded path, tolerating a dangling link.
 *
 * `fs.pathExists` follows links, so a dangling junction reports false while still occupying
 * the name — checking before removing would leave exactly the entries an uninstall exists to
 * clear. `fs.remove` is already idempotent, so it is called unconditionally.
 */
export async function removeProjectedPath(target) {
  await fs.remove(target);
}
