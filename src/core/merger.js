import fs from 'fs-extra';
import path from 'path';
import deepmerge from 'deepmerge';
import { isAceOwnedRef } from './constants.js';

/**
 * Marker constants for ACE-managed sections in CLAUDE.md
 */
const ACE_MANAGED_START = '<!-- ace:managed:start -->';
const ACE_MANAGED_END = '<!-- ace:managed:end -->';

/**
 * Merge CLAUDE.md using marker-based section replacement.
 *
 * Strategy:
 * 1. If both existing and template have ace:managed markers, replace the section
 *    between markers with template content, while preserving content outside markers.
 * 2. Clean up any ACE-owned references outside the managed section (obsolete refs).
 * 3. If markers are missing or incomplete, fall back to append-only strategy for
 *    backward compatibility.
 *
 * @param {string} existingContent - Current CLAUDE.md content
 * @param {string} templateContent - Template CLAUDE.md content
 * @returns {{content: string, added: string[], removed: string[]}} Merged content and change list
 */
export function mergeClaudeMd(existingContent, templateContent) {
  // Check if both files have complete marker sections
  const existingHasMarkers = hasCompleteMarkers(existingContent);
  const templateHasMarkers = hasCompleteMarkers(templateContent);

  if (existingHasMarkers && templateHasMarkers) {
    return mergeWithMarkers(existingContent, templateContent);
  }

  // Fall back to legacy append strategy
  return mergeWithAppend(existingContent, templateContent);
}

/**
 * Check if content has both start and end markers.
 */
function hasCompleteMarkers(content) {
  const hasStart = content.includes(ACE_MANAGED_START);
  const hasEnd = content.includes(ACE_MANAGED_END);
  return hasStart && hasEnd;
}

/**
 * Merge using marker-based section replacement.
 * Replaces content between ace:managed markers and cleans up obsolete ACE refs.
 */
function mergeWithMarkers(existingContent, templateContent) {
  // Extract the managed section from template
  const templateManaged = extractManagedSection(templateContent);

  // Get all ACE-owned refs from template (these are the current/active ones)
  const templateRefs = extractRefs(templateManaged);

  // Replace the managed section in existing content
  let result = replaceManagedSection(existingContent, templateManaged);

  // Clean up any obsolete ACE refs outside the managed section
  // This includes old @~/.claude/rules/ace/ refs AND hookify @refs
  const removed = [];
  const lines = result.split('\n');
  const cleanedLines = lines.map(line => {
    const refs = extractRefs(line);
    const hasObsoleteAceRef = refs.some(ref => {
      if (isAceOwnedRef(ref)) {
        const refWithAt = `@${ref}`;
        if (!templateRefs.includes(refWithAt)) {
          removed.push(ref);
          return true;
        }
      }
      return false;
    });

    // Also remove lines with hookify @ references (these should not be in CLAUDE.md)
    const hasHookifyRef = refs.some(ref => /hookify\.ace\./.test(ref));
    if (hasHookifyRef) {
      const refBare = refs.find(ref => /hookify\.ace\./.test(ref));
      if (refBare) removed.push(refBare);
      return null;
    }

    return hasObsoleteAceRef ? null : line;
  }).filter(line => line !== null);

  result = cleanedLines.join('\n');

  // Clean up empty "## Added by ace" section if all its refs were removed
  result = result.replace(/\n## Added by ace\n*(?=\n|$)/g, '\n');
  // Normalize multiple blank lines
  result = result.replace(/\n{3,}/g, '\n\n');

  // Get the new refs that were added (in the managed section)
  const existingRefs = extractRefs(existingContent);
  const added = templateRefs
    .map(ref => ref.replace(/^@/, ''))
    .filter(ref => !existingRefs.includes(ref));

  return { content: result, added, removed };
}

/**
 * Extract content between ace:managed markers.
 */
function extractManagedSection(content) {
  const startIdx = content.indexOf(ACE_MANAGED_START);
  const endIdx = content.indexOf(ACE_MANAGED_END);

  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    return content;
  }

  return content.slice(startIdx, endIdx + ACE_MANAGED_END.length);
}

/**
 * Replace the managed section in existing content with new managed content.
 */
function replaceManagedSection(existingContent, newManagedContent) {
  const startIdx = existingContent.indexOf(ACE_MANAGED_START);
  const endIdx = existingContent.indexOf(ACE_MANAGED_END);

  if (startIdx === -1 || endIdx === -1) {
    return existingContent;
  }

  const before = existingContent.slice(0, startIdx);
  const after = existingContent.slice(endIdx + ACE_MANAGED_END.length);

  // Normalize whitespace: ensure single newline separation
  return before.trimEnd() + '\n' + newManagedContent + '\n' + after.trimStart();
}

/**
 * Legacy merge strategy: append missing @references from template.
 * Used for backward compatibility when markers are not present.
 */
function mergeWithAppend(existingContent, templateContent) {
  const existingRefs = extractRefs(existingContent);
  const templateRefs = extractRefs(templateContent);

  // Filter out ACE-owned refs from existing (we'll add current ones from template)
  // This provides some cleanup even in legacy mode
  const userRefs = existingRefs.filter(ref => !isAceOwnedRef(ref));
  const templateRefsBare = templateRefs.map(ref => ref.replace(/^@/, ''));

  // Find refs in template but not in user's refs
  const missingRefs = templateRefsBare.filter(ref => !userRefs.includes(ref));

  if (missingRefs.length === 0) {
    return { content: existingContent, added: [], removed: [] };
  }

  // Append missing references at the end with a section marker
  const additions = missingRefs.map(ref => {
    const line = findRefLine(templateContent, ref);
    return line || `- @${ref}`;
  });

  const appendSection = [
    '',
    '## Added by ace',
    ...additions,
    '',
  ].join('\n');

  return {
    content: existingContent.trimEnd() + '\n' + appendSection,
    added: missingRefs,
    removed: [],
  };
}

/**
 * Extract @reference paths from content.
 */
function extractRefs(content) {
  const refPattern = /@~?\/?\.?claude\/[^\s)]+/g;
  const matches = content.match(refPattern) || [];
  return matches;
}

/**
 * Find the full line containing a reference.
 */
function findRefLine(content, ref) {
  const lines = content.split('\n');
  return lines.find(line => line.includes(ref));
}

/**
 * Deep merge settings.json: add hooks, plugins, keep existing permissions.
 * Uses array-append strategy for hooks (deduplicated by matcher).
 */
export function mergeSettingsJson(existing, template) {
  const merged = deepmerge(existing, template, {
    arrayMerge: mergeHooksArrays,
    customMerge: (key) => {
      // For these keys, template should not override existing
      if (key === 'model' || key === 'theme' || key === 'locale') {
        return (a, _b) => a;
      }
      return undefined;
    },
  });

  return merged;
}

/**
 * Custom array merge for hooks: deduplicate by matcher field.
 */
function mergeHooksArrays(target, source) {
  const result = [...target];
  for (const item of source) {
    const exists = target.some(t =>
      t.matcher === item.matcher &&
      JSON.stringify(t.hooks) === JSON.stringify(item.hooks)
    );
    if (!exists) {
      result.push(item);
    }
  }
  return result;
}

/**
 * Merge installed_plugins.json: add or update the ace plugin entry.
 */
export async function mergeInstalledPlugins(filePath, pluginKey, entry) {
  let data = { version: 2, plugins: {} };
  if (await fs.pathExists(filePath)) {
    data = await fs.readJson(filePath);
  }
  data.plugins[pluginKey] = [entry];
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, data, { spaces: 2 });
}

/**
 * Merge known_marketplaces.json: add or update the marketplace entry.
 */
export async function mergeKnownMarketplaces(filePath, marketplaceName, entry) {
  let data = {};
  if (await fs.pathExists(filePath)) {
    data = await fs.readJson(filePath);
  }
  data[marketplaceName] = entry;
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, data, { spaces: 2 });
}

/**
 * Remove a marketplace entry from known_marketplaces.json.
 */
export async function removeKnownMarketplace(filePath, marketplaceName) {
  if (!await fs.pathExists(filePath)) return;
  const data = await fs.readJson(filePath);
  delete data[marketplaceName];
  await fs.writeJson(filePath, data, { spaces: 2 });
}

/**
 * Check if a file or directory exists at the target path.
 */
export async function conflictCheck(targetPath) {
  return fs.pathExists(targetPath);
}

/**
 * Create a backup of the target file before modifying.
 */
export async function backupFile(filePath) {
  if (await fs.pathExists(filePath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.ace-backup.${timestamp}`;
    await fs.copy(filePath, backupPath);
    return backupPath;
  }
  return null;
}

/**
 * Save a pre-install snapshot (.pre-ace) for uninstall restore.
 * Only creates the snapshot if one doesn't already exist (first install).
 */
export async function backupPreInstall(filePath) {
  const snapshotPath = `${filePath}.pre-ace`;
  if (await fs.pathExists(filePath) && !await fs.pathExists(snapshotPath)) {
    await fs.copy(filePath, snapshotPath);
    return snapshotPath;
  }
  return null;
}
