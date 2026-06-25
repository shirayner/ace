import { spawnSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

const PACKAGE_NAME = '@shirayner/ace';
const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';

/** Shared options for non-interactive npm calls: capture stdout/stderr, work on Windows. */
const NPM_CAPTURE_OPTS = {
  encoding: 'utf-8',
  shell: true,
  windowsHide: true,
};

/**
 * Get the currently installed global version of ace.
 * Falls back to 'unknown' if detection fails.
 */
function getCurrentVersion() {
  const result = spawnSync(
    `npm list -g --depth=0 --json ${PACKAGE_NAME}`,
    NPM_CAPTURE_OPTS,
  );
  try {
    const data = JSON.parse(result.stdout || '{}');
    const deps = data.dependencies || {};
    return deps[PACKAGE_NAME]?.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Query the latest published version from npm registry.
 * Returns null on failure.
 */
function fetchLatestVersion(registry) {
  const result = spawnSync(
    `npm view ${PACKAGE_NAME} version --registry ${registry}`,
    NPM_CAPTURE_OPTS,
  );
  if (result.status !== 0) return null;
  return (result.stdout || '').trim() || null;
}

/**
 * Attempt to install the package using the given registry.
 * Streams npm output directly to the terminal.
 * Returns true on success, false on failure.
 */
function tryInstall(registry) {
  const result = spawnSync(
    `npm install -g ${PACKAGE_NAME} --registry ${registry}`,
    { stdio: 'inherit', shell: true, windowsHide: true },
  );
  return result.status === 0;
}

/**
 * Run `ace init --force` to sync the latest templates and rules.
 * Uses the globally installed ace binary so the freshly upgraded version is used.
 */
function runInit() {
  const aceCmd = process.platform === 'win32' ? 'ace.cmd' : 'ace';
  const result = spawnSync(
    `${aceCmd} init --force`,
    { stdio: 'inherit', shell: true, windowsHide: true },
  );
  return result.status === 0;
}

/**
 * Get the configured npm registry from user's npm config.
 */
function getUserRegistry() {
  const result = spawnSync('npm config get registry', NPM_CAPTURE_OPTS);
  return (result.stdout || '').trim() || OFFICIAL_REGISTRY;
}

export async function upgradeCommand(options) {
  console.log(chalk.bold('\n  ace upgrade — upgrade to the latest version\n'));

  // 1. Detect current version
  const currentVersion = getCurrentVersion();
  console.log(chalk.dim(`  Current version : ${currentVersion}`));

  // 2. Query latest version (try user registry first, then official)
  const spinner = ora('Checking latest version...').start();
  const userRegistry = getUserRegistry();

  let latestVersion = fetchLatestVersion(userRegistry);
  if (!latestVersion) {
    spinner.text = 'Retrying with official registry...';
    latestVersion = fetchLatestVersion(OFFICIAL_REGISTRY);
  }

  if (!latestVersion) {
    spinner.fail('Failed to fetch latest version from npm.');
    console.log(chalk.red('\n  Could not reach npm registry. Check your network and try again.\n'));
    process.exit(1);
  }

  spinner.succeed(`Latest version  : ${latestVersion}`);

  // 3. Check if already up to date
  if (currentVersion === latestVersion && !options.force) {
    console.log(chalk.green('\n  Already up to date.\n'));
    return;
  }

  const upgradeLabel = currentVersion === 'unknown'
    ? `install ${latestVersion}`
    : `${currentVersion} → ${latestVersion}`;

  // 4. Confirm with user
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: `Upgrade ace (${upgradeLabel})?`,
    default: true,
  }]);

  if (!confirm) {
    console.log(chalk.dim('\n  Cancelled.\n'));
    return;
  }

  console.log();

  // 5. Install — try user registry first, fallback to official registry
  let installed = false;

  if (userRegistry !== OFFICIAL_REGISTRY) {
    console.log(chalk.dim(`  Trying registry: ${userRegistry}`));
    installed = tryInstall(userRegistry);

    if (!installed) {
      console.log(chalk.yellow(`\n  Registry ${userRegistry} failed. Falling back to official registry...`));
      console.log(chalk.dim(`  Trying registry: ${OFFICIAL_REGISTRY}\n`));
      installed = tryInstall(OFFICIAL_REGISTRY);
    }
  } else {
    console.log(chalk.dim(`  Using registry: ${OFFICIAL_REGISTRY}`));
    installed = tryInstall(OFFICIAL_REGISTRY);
  }

  // 6. Verify and report result
  console.log();
  if (!installed) {
    console.log(chalk.red('  Upgrade failed. Both registries returned errors.\n'));
    console.log(chalk.dim(`  Manual fallback: npm install -g ${PACKAGE_NAME} --registry=${OFFICIAL_REGISTRY}\n`));
    process.exit(1);
  }

  const newVersion = getCurrentVersion();
  if (newVersion === latestVersion) {
    console.log(chalk.green(`  Upgraded successfully to ${newVersion}\n`));
  } else {
    console.log(chalk.yellow(`  Install completed, but version check returned: ${newVersion}`));
    console.log(chalk.dim('  (This may be normal if ace was already at the target version.)\n'));
  }

  // 7. Sync latest templates and rules via `ace init --force`
  console.log(chalk.bold('  Syncing latest templates and rules...\n'));
  const initOk = runInit();
  if (!initOk) {
    console.log(chalk.yellow('\n  ace init encountered an error. Run `ace init --force` manually to finish syncing.\n'));
  }
}
