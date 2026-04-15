import fs from 'fs-extra';
import yaml from 'js-yaml';

const SYSTEM_FIELDS = ['schema', 'version', 'context'];

/**
 * Merge spec config.yaml: system fields overwrite, user fields preserve, rules merge.
 */
export function mergeSpecConfig(existing, template) {
  const merged = { ...existing };

  for (const field of SYSTEM_FIELDS) {
    if (template[field] !== undefined) {
      merged[field] = template[field];
    }
  }

  if (template.rules) {
    merged.rules = { ...(existing.rules || {}), ...template.rules };
  }

  return merged;
}

/**
 * Read, merge, and write config.yaml with backup.
 * Returns { merged: true, version } or { merged: false, reason }.
 */
export async function mergeSpecConfigFile(existingPath, templatePath, backupDir) {
  const existingContent = await fs.readFile(existingPath, 'utf-8');
  const templateContent = await fs.readFile(templatePath, 'utf-8');

  const existing = yaml.load(existingContent);
  const template = yaml.load(templateContent);
  const merged = mergeSpecConfig(existing, template);

  if (backupDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${existingPath}.ace-backup.${timestamp}`;
    await fs.copy(existingPath, backupPath);
  }

  await fs.writeFile(existingPath, yaml.dump(merged, { lineWidth: -1 }), 'utf-8');
  return { merged: true, version: merged.version };
}
