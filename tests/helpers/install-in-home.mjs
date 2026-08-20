/**
 * Child-process install runner for the multi-target e2e test.
 *
 * `constants.js` resolves `os.homedir()` at import time, so a single process can only ever
 * observe one HOME no matter how imports are cache-busted: the first load wins and every
 * later case silently inspects the first case's directories. Each case therefore gets its own
 * process, with HOME set before any ACE module is loaded.
 *
 * Usage: node install-in-home.mjs <homeDir> <repoDir> <target,...> [component,...]
 * Components default to `plugin` alone; pass the full list to exercise the same path
 * `ace init` drives, which is the only way a ~/.claude write from a non-Claude install shows up.
 * Prints the receipt plus collected errors as JSON on stdout.
 */

import path from 'path';

const [homeDir, repoDir, targetList, componentList] = process.argv.slice(2);

process.env.HOME = homeDir;
process.env.USERPROFILE = homeDir;

const { Installer } = await import('../../src/core/installer.js');
const { readReceipt } = await import('../../src/core/install-receipt.js');
const { COMPONENTS } = await import('../../src/core/constants.js');

const components = componentList ? componentList.split(',') : ['plugin'];

const installer = new Installer({
  components,
  quiet: true,
  targets: targetList.split(','),
  pluginSrcDir: path.join(repoDir, 'plugin'),
  skillSelection: { categories: ['coding', 'general'], skills: ['spec-coding', 'auto-goal'] },
});
installer.templatesDir = path.join(repoDir, 'templates');

// Mirror `ace init`: prepare, then install each component individually.
await installer.prepare();
for (const name of components) {
  const component = COMPONENTS[name];
  if (!component) continue;
  await installer.installComponent(name, component);
}

process.stdout.write(JSON.stringify({
  errors: installer.results.errors,
  installed: installer.results.installed,
  skipped: installer.results.skipped,
  receipt: await readReceipt(),
}));
