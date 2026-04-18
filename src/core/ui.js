import chalk from 'chalk';

// ─── Icons ───────────────────────────────────────────────────────────
export const icons = {
  ace:       '◆',
  check:     '✔',
  cross:     '✖',
  arrow:     '▶',
  arrowR:    '→',
  dot:       '●',
  circle:    '○',
  warn:      '⚠',
  info:      'ℹ',
  skip:      '◇',
  merge:     '⇄',
  folder:    '▸',
  shield:    '🛡',
  gear:      '⚙',
  rocket:    '🚀',
  sparkles:  '✨',
  package:   '📦',
  file:      '📄',
  brain:     '🧠',
  hook:      '🪝',
  guard:     '🔒',
  memory:    '💾',
  plug:      '🔌',
};

// ─── Colors ──────────────────────────────────────────────────────────
export const colors = {
  brand:    chalk.hex('#7C3AED'),   // vibrant purple
  accent:   chalk.hex('#06B6D4'),   // cyan
  success:  chalk.hex('#10B981'),   // emerald
  warning:  chalk.hex('#F59E0B'),   // amber
  error:    chalk.hex('#EF4444'),   // red
  dim:      chalk.hex('#6B7280'),   // gray
  muted:    chalk.hex('#9CA3AF'),   // light gray
  white:    chalk.hex('#F9FAFB'),   // near white
  blue:     chalk.hex('#3B82F6'),   // blue
};

// ─── ASCII Banner ────────────────────────────────────────────────────
export function printBanner(version) {
  const purple = colors.brand;
  const dim = colors.dim;

  console.log();
  console.log(purple('    ╔═══╗  ╔═══╗  ╔═══╗'));
  console.log(purple('    ╠═══╣  ║     ╠═══╝'));
  console.log(purple('    ║   ║  ╚═══╝  ╚═══╗'));
  console.log();
  console.log(`    ${purple.bold('ace')} ${dim(`v${version}`)} ${dim('— AI Coding Environment')}`);
  console.log();
}

// ─── Section Header ──────────────────────────────────────────────────
export function sectionHeader(icon, title) {
  console.log(`  ${icon}  ${colors.white.bold(title)}`);
}

// ─── Step indicator ──────────────────────────────────────────────────
export function stepStart(label) {
  process.stdout.write(`  ${colors.dim('│')}\n`);
  process.stdout.write(`  ${colors.brand(icons.dot)}  ${label}\n`);
}

export function stepDone(label) {
  process.stdout.write(`  ${colors.success(icons.check)}  ${label}\n`);
}

export function stepSkip(label) {
  process.stdout.write(`  ${colors.muted(icons.skip)}  ${colors.muted(label)}\n`);
}

export function stepWarn(label) {
  process.stdout.write(`  ${colors.warning(icons.warn)}  ${label}\n`);
}

export function stepFail(label) {
  process.stdout.write(`  ${colors.error(icons.cross)}  ${label}\n`);
}

// ─── File list (compact) ─────────────────────────────────────────────
export function fileEntry(action, filePath) {
  const prefix = {
    install:  `  ${colors.success('+')}`,
    merge:    `  ${colors.blue('~')}`,
    skip:     `  ${colors.muted('-')}`,
    overwrite:`  ${colors.warning('!')}`,
    error:    `  ${colors.error('✖')}`,
  };
  const color = {
    install:  colors.success,
    merge:    colors.blue,
    skip:     colors.muted,
    overwrite:colors.warning,
    error:    colors.error,
  };
  console.log(`${prefix[action] || '   '} ${(color[action] || colors.dim)(filePath)}`);
}

// ─── Summary Box ─────────────────────────────────────────────────────
export function summaryBox(stats) {
  const { installed, merged, skipped, errors } = stats;

  console.log();
  console.log(`  ${colors.dim('╭─────────────────────────────────────╮')}`);
  console.log(`  ${colors.dim('│')}  ${colors.white.bold('Installation Summary')}              ${colors.dim('│')}`);
  console.log(`  ${colors.dim('├─────────────────────────────────────┤')}`);

  if (installed > 0) {
    console.log(`  ${colors.dim('│')}  ${colors.success(icons.check)} ${colors.success(`${installed} installed`)}${pad(installed, 'installed')}${colors.dim('│')}`);
  }
  if (merged > 0) {
    console.log(`  ${colors.dim('│')}  ${colors.blue(icons.merge)} ${colors.blue(`${merged} merged`)}${pad(merged, 'merged')}${colors.dim('│')}`);
  }
  if (skipped > 0) {
    console.log(`  ${colors.dim('│')}  ${colors.muted(icons.skip)} ${colors.muted(`${skipped} skipped`)}${pad(skipped, 'skipped')}${colors.dim('│')}`);
  }
  if (errors > 0) {
    console.log(`  ${colors.dim('│')}  ${colors.error(icons.cross)} ${colors.error(`${errors} errors`)}${pad(errors, 'errors')}${colors.dim('│')}`);
  }

  console.log(`  ${colors.dim('╰─────────────────────────────────────╯')}`);
}

function pad(count, label) {
  const text = `${count} ${label}`;
  const total = 33;
  const spaces = total - text.length - 4; // 4 = icon + spaces
  return ' '.repeat(Math.max(1, spaces));
}

// ─── Final message ───────────────────────────────────────────────────
export function doneMessage() {
  console.log();
  console.log(`  ${icons.rocket} ${colors.success.bold('Your AI coding environment is ready.')}`);
  console.log(`  ${colors.dim(`Run ${chalk.white('ace doctor')} to verify the installation.`)}`);
  console.log();
}

export function doneWithErrors() {
  console.log();
  console.log(`  ${icons.warn} ${colors.warning.bold('Completed with errors.')}`);
  console.log(`  ${colors.dim(`Run ${chalk.white('ace doctor')} to diagnose.`)}`);
  console.log();
}

// ─── Separator ───────────────────────────────────────────────────────
export function separator() {
  console.log(`  ${colors.dim('│')}`);
}

// ─── Conflict prompt helpers ─────────────────────────────────────────
export function conflictHeader(componentName, icon, fileCount) {
  console.log();
  console.log(`  ${colors.warning(icons.warn)}  ${icon}  ${colors.white.bold(componentName)} — ${colors.warning(`${fileCount} file(s) already exist`)}`);
}

export function conflictFile(filePath) {
  console.log(`       ${colors.dim(icons.arrowR)} ${colors.muted(filePath)}`);
}

// ─── Component icons ─────────────────────────────────────────────────
export const componentIcons = {
  core:    icons.gear,
  rules:   icons.brain,
  plugin:  icons.plug,
  hooks:   icons.hook,
  hookify: icons.guard,
  memory:  icons.memory,
};

export const componentLabels = {
  core:    'Core Config',
  rules:   'Rules',
  plugin:  'Plugin',
  hooks:   'Hooks',
  hookify: 'Safety Guards',
  memory:  'Memory',
};
