import path from 'path';
import fs from 'fs-extra';
import {
  readStateJson,
  writeStateJson,
  isoNow,
  getTasksDir,
} from '../core/task-utils.js';

/**
 * ace task archive <changeName> [--date YYYY-MM-DD]
 *
 * 1. Validates state.json exists and status === 'completed'
 * 2. Infers archive date (completed_at > --date flag > today)
 * 3. Writes archived_at to state.json
 * 4. Moves task directory to .ace/tasks/archive/<date>-<changeName>/
 *    Falls back to copy+rm on cross-volume scenarios
 */
export async function archiveCommand(changeName, { date: forcedDate } = {}) {
  if (!changeName) {
    console.error('Usage: ace task archive <changeName> [--date YYYY-MM-DD]');
    process.exit(1);
  }

  const projectRoot = process.cwd();
  const tasksDir = getTasksDir(projectRoot);
  const taskDir = path.join(tasksDir, changeName);

  if (!await fs.pathExists(path.join(taskDir, 'state.json'))) {
    console.error(`Error: state.json not found at ${taskDir}/state.json`);
    process.exit(1);
  }

  const state = await readStateJson(taskDir);

  if (state.status !== 'completed') {
    console.error(
      `Error: task '${changeName}' status is '${state.status}', must be 'completed' before archiving.\n` +
      `  Run: ace task complete ${changeName}`
    );
    process.exit(1);
  }

  // Determine archive date
  const archiveDate = resolveArchiveDate(forcedDate, state.completed_at);
  const archiveDirName = `${archiveDate}-${changeName}`;
  const archiveParent = path.join(tasksDir, 'archive');
  const archiveDest = path.join(archiveParent, archiveDirName);

  if (await fs.pathExists(archiveDest)) {
    console.error(`Error: archive destination already exists: ${archiveDest}`);
    process.exit(1);
  }

  // Write archived_at before moving
  const now = isoNow();
  state.archived_at = now;
  state.updated_at = now;
  await writeStateJson(taskDir, state);

  // Move (with cross-volume fallback)
  await moveWithFallback(taskDir, archiveDest);
  console.log(`✓ Task '${changeName}' archived to .ace/tasks/archive/${archiveDirName}/`);
}

function resolveArchiveDate(forcedDate, completedAt) {
  if (forcedDate && /^\d{4}-\d{2}-\d{2}$/.test(forcedDate)) {
    return forcedDate;
  }
  if (completedAt && typeof completedAt === 'string' && completedAt.length >= 10) {
    return completedAt.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

async function moveWithFallback(src, dest) {
  try {
    await fs.move(src, dest, { overwrite: false });
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-volume: copy then remove
      await fs.copy(src, dest, { overwrite: false });
      await fs.remove(src);
    } else {
      throw err;
    }
  }
}
