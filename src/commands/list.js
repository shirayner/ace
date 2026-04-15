import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { CLAUDE_DIR, COMPONENTS } from '../core/constants.js';

export async function listCommand() {
  console.log(chalk.bold('\n  ace list — installed components\n'));

  for (const [name, component] of Object.entries(COMPONENTS)) {
    const status = await getComponentStatus(component);
    const icon = status === 'installed' ? chalk.green('installed')
      : status === 'partial' ? chalk.yellow(' partial')
      : chalk.dim(' missing');

    console.log(`  ${icon}  ${name} — ${component.description}`);

    // Show details for partial status
    if (status === 'partial') {
      const details = await getComponentDetails(component);
      details.missing.forEach(f => console.log(chalk.red(`           missing: ${f}`)));
    }
  }

  console.log();
}

async function getComponentStatus(component) {
  const allPaths = [];

  if (component.files) {
    allPaths.push(...component.files.map(f => path.join(CLAUDE_DIR, f.dest)));
  }
  if (component.directories) {
    allPaths.push(...component.directories.map(d => path.join(CLAUDE_DIR, d)));
  }
  if (component.conditional) {
    allPaths.push(...component.conditional.map(f => path.join(CLAUDE_DIR, f.dest)));
  }

  if (allPaths.length === 0) return 'installed';

  const checks = await Promise.all(allPaths.map(p => fs.pathExists(p)));
  const existCount = checks.filter(Boolean).length;

  if (existCount === allPaths.length) return 'installed';
  if (existCount > 0) return 'partial';
  return 'missing';
}

async function getComponentDetails(component) {
  const missing = [];
  const installed = [];

  const allFiles = [
    ...(component.files || []).map(f => f.dest),
    ...(component.directories || []),
    ...(component.conditional || []).map(f => f.dest),
  ];

  for (const file of allFiles) {
    const exists = await fs.pathExists(path.join(CLAUDE_DIR, file));
    if (exists) installed.push(file);
    else missing.push(file);
  }

  return { missing, installed };
}
