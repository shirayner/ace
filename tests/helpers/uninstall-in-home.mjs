/**
 * Child-process uninstall runner for the roundtrip test.
 *
 * Separate process for the same reason as the installer: `constants.js` freezes the home
 * directory at import time, so HOME must be set before any ACE module loads.
 *
 * Usage: node uninstall-in-home.mjs <homeDir>
 */

const [homeDir] = process.argv.slice(2);

process.env.HOME = homeDir;
process.env.USERPROFILE = homeDir;

const { uninstallCommand } = await import('../../src/commands/uninstall.js');

// `--yes` skips the interactive confirmation, which has no TTY to read here.
await uninstallCommand({ yes: true });
