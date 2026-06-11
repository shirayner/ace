import { spawnSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

const PACKAGE_NAME = '@shirayner/ace';
const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';

/**
 * Get the currently installed global version of ace.
 * Falls back to 'unknown' if detection fails.
 */
function getCurrentVersion() {
  const result = spawnSync('npm', ['list', '-g', '--depth=0', '--json', PACKAGE_NAME], {
    encoding: 'utf-8',
  });
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
  const args = ['view', PACKAGE_NAME, 'version', '--registry', registry];
  const result = spawnSync('npm', args, { encoding: 'utf-8' });
  if (result.status !== 0) return null;
  return (result.stdout || '').trim() || null;
}

/**
 * Attempt to install the package using the given registry.
 * Returns true on success, false on failure.
 */
function tryInstall(registry) {
  const result = spawnSync(
    'npm',
    ['install', '-g', PACKAGE_NAME, '--registry', registry],
    { stdio: 'inherit' },
  );
  return result.status === 0;
}

/**
 * Get the configured npm registry from user's npm config.
 */
function getUserRegistry() {
  const result = spawnSync('npm', ['config', 'get', 'registry'], { encoding: 'utf-8' });
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
}
