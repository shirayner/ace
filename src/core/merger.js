import fs from 'fs-extra';
import path from 'path';
import deepmerge from 'deepmerge';

/**
 * Merge CLAUDE.md: append missing @references from template into existing file.
 * Preserves all existing content, only adds new @references.
 */
export function mergeClaudeMd(existingContent, templateContent) {
  const existingRefs = extractRefs(existingContent);
  const templateRefs = extractRefs(templateContent);

  const missingRefs = templateRefs.filter(ref => !existingRefs.includes(ref));

  if (missingRefs.length === 0) {
    return { content: existingContent, added: [] };
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
  };
}

function extractRefs(content) {
  const refPattern = /@~?\/?\.?claude\/[^\s)]+/g;
  const matches = content.match(refPattern) || [];
  return matches.map(ref => ref.replace(/^@/, ''));
}

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
