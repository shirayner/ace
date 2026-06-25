import path from 'path';
import fs from 'fs-extra';
import {
  readStateJson,
  writeStateJson,
  isoNow,
  getTasksDir,
  listActiveTasks,
} from '../core/task-utils.js';
import { archiveCommand } from './archive.js';

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Derive the display status for a task.
 * completed + no archived_at → "⚠ awaiting-archive"
 */
function displayStatus(task) {
  if (task.status === 'completed' && !task.archivedAt) {
    return '⚠ awaiting-archive';
  }
  return task.status;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/**
 * ace task list  — 列出 .ace/tasks/ 下所有活跃任务（排除 archive/）
 *
 * 若任务 status=completed 且未归档，状态列显示 "⚠ awaiting-archive" 以提醒执行归档。
 */
export async function taskListCommand() {
  const projectRoot = process.cwd();
  const tasks = await listActiveTasks(projectRoot);

  if (tasks.length === 0) {
    console.log('No active tasks found in .ace/tasks/');
    return;
  }

  const header = ['changeName', 'type', 'status', 'phase'];
  const rows = tasks.map(t => [
    t.changeName,
    t.type,
    displayStatus(t),
    t.phase,
  ]);

  // Compute column widths
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length))
  );

  const fmt = row => row.map((cell, i) => (cell || '').padEnd(widths[i])).join('  ');
  const separator = widths.map(w => '-'.repeat(w)).join('  ');

  console.log(fmt(header));
  console.log(separator);
  rows.forEach(r => console.log(fmt(r)));

  const pendingArchive = tasks.filter(t => t.status === 'completed' && !t.archivedAt);
  if (pendingArchive.length > 0) {
    console.log(`\n⚠  ${pendingArchive.length} task(s) completed but not yet archived.`);
    console.log('   Run: ace task done <changeName>  (or  ace task archive <changeName>)');
  }
}

/**
 * ace task complete <changeName>  — 标记任务为 completed
 *
 * 仅修改 state.json，不执行归档。完成后提示使用 `ace task done` 一步到位。
 */
export async function taskCompleteCommand(changeName) {
  if (!changeName) {
    console.error('Usage: ace task complete <changeName>');
    process.exit(1);
  }

  const projectRoot = process.cwd();
  const taskDir = path.join(getTasksDir(projectRoot), changeName);

  if (!await fs.pathExists(path.join(taskDir, 'state.json'))) {
    console.error(`Error: state.json not found at ${taskDir}/state.json`);
    process.exit(1);
  }

  const state = await readStateJson(taskDir);
  const now = isoNow();

  state.status = 'completed';
  state.completed_at = now;
  state.updated_at = now;

  await writeStateJson(taskDir, state);
  console.log(`✓ Task '${changeName}' marked as completed`);
  console.log(`  Next step: ace task archive ${changeName}`);
  console.log(`  Or combine: ace task done ${changeName}`);
}

/**
 * ace task done <changeName>  — 标记完成并立即归档（原子两步）
 *
 * 顺序执行：
 *   1. complete — 写入 status=completed + completed_at
 *   2. archive  — 移动目录到 .ace/tasks/archive/<date>-<changeName>/
 *
 * 任一步骤失败则中止，不执行后续步骤。
 * 这是结束一个 simple 类型任务的推荐方式，消除了「完成后忘记归档」的风险。
 */
export async function taskDoneCommand(changeName, opts = {}) {
  if (!changeName) {
    console.error('Usage: ace task done <changeName>');
    process.exit(1);
  }

  // Step 1: complete
  await taskCompleteCommand(changeName);

  // Step 2: archive (reuse existing implementation)
  await archiveCommand(changeName, { date: opts.date });
}
