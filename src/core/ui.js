import chalk from 'chalk';

// ─── Icons (minimal set) ────────────────────────────────────
export const icons = {
  ace:    '◆',
  check:  '✔',
  cross:  '✖',
  warn:   '⚠',
  skip:   '◇',
  dot:    '·',
  merge:  '~',
};

// ─── Colors ─────────────────────────────────────────────────
export const colors = {
  brand:   chalk.hex('#7C3AED'),
  success: chalk.hex('#10B981'),
  warning: chalk.hex('#F59E0B'),
  error:   chalk.hex('#EF4444'),
  dim:     chalk.hex('#6B7280'),
  muted:   chalk.hex('#9CA3AF'),
  white:   chalk.hex('#F9FAFB'),
  blue:    chalk.hex('#3B82F6'),
};

// ─── Screen control ─────────────────────────────────────────
export function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
}

// ─── Banner (single line) ───────────────────────────────────
export function printBanner(version) {
  console.log();
  console.log(`  ${colors.brand.bold('◆ ace')} ${colors.dim(`v${version}`)}`);
  console.log();
}

// ─── Step-by-step screen (clear + banner + previous answers) ─
export function renderScreen(version, completedSteps = []) {
  clearScreen();
  printBanner(version);
  for (const step of completedSteps) {
    console.log(step);
  }
  if (completedSteps.length > 0) console.log();
}

// ─── Step indicators ────────────────────────────────────────
export function stepDone(label, detail) {
  const d = detail ? colors.dim(` ${detail}`) : '';
  console.log(`  ${colors.success(icons.check)} ${label}${d}`);
}

export function stepMerge(label, detail) {
  const d = detail ? colors.dim(` ${detail}`) : '';
  console.log(`  ${colors.blue(icons.merge)} ${label}${d}`);
}

export function stepSkip(label, detail) {
  const d = detail ? colors.dim(` ${detail}`) : '';
  console.log(`  ${colors.muted(icons.skip)} ${colors.muted(label)}${d}`);
}

export function stepFail(label, detail) {
  const d = detail ? colors.dim(` ${detail}`) : '';
  console.log(`  ${colors.error(icons.cross)} ${label}${d}`);
}

// ─── Done messages ──────────────────────────────────────────
export function doneMessage(stats) {
  const parts = [];
  if (stats.installed > 0) parts.push(`${stats.installed} installed`);
  if (stats.merged > 0) parts.push(`${stats.merged} merged`);
  if (stats.skipped > 0) parts.push(`${stats.skipped} skipped`);

  console.log();
  console.log(`  ${colors.success(icons.check)} ${colors.success.bold('Done.')} ${colors.dim(parts.join(', '))}`);
  console.log(`  ${colors.dim(`  Run ${chalk.white('ace doctor')} to verify.`)}`);
  console.log();
}

export function doneWithErrors(stats) {
  console.log();
  console.log(`  ${colors.warning(icons.warn)} ${colors.warning.bold('Done with errors.')} ${colors.dim(`${stats.errors} failed`)}`);
  console.log(`  ${colors.dim(`  Run ${chalk.white('ace doctor')} to diagnose.`)}`);
  console.log();
}

// ─── Component labels ───────────────────────────────────────
export const componentLabels = {
  core:    'Core Config',
  rules:   'Rules',
  plugin:  'Plugin',
  hooks:   'Hooks',
  memory:  'Memory',
};
