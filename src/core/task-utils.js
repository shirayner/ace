import fs from 'fs-extra';
import path from 'path';

/**
 * Read state.json with backward-compat: 'name' field falls back to 'changeName'.
 */
export async function readStateJson(taskDir) {
  const statePath = path.join(taskDir, 'state.json');
  const state = await fs.readJson(statePath);
  if (!state.changeName && state.name) {
    state.changeName = state.name;
  }
  return state;
}

export async function writeStateJson(taskDir, state) {
  const statePath = path.join(taskDir, 'state.json');
  await fs.writeJson(statePath, state, { spaces: 2 });
}

export function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function getTasksDir(projectRoot) {
  return path.join(projectRoot, '.ace', 'tasks');
}

/**
 * Extract current phase from a state object regardless of type.
 */
function extractPhase(state) {
  const type = state.type;
  if (type === 'spec' && state.spec) return state.spec.phase || 'unknown';
  if (type === 'spechub') return state.currentPhase || 'unknown';
  // simple types (auto-goal stored under 'simple' or legacy 'goal'/'analysis'/'review')
  const block = state.simple || state.goal || state.analysis || state.review;
  return block?.phase || 'unknown';
}

/**
 * Scan .ace/tasks/ for active tasks, skipping the archive/ subdirectory.
 * Returns array of { changeName, type, status, phase }.
 */
export async function listActiveTasks(projectRoot) {
  const tasksDir = getTasksDir(projectRoot);
  if (!await fs.pathExists(tasksDir)) return [];

  const entries = await fs.readdir(tasksDir);
  const tasks = [];

  for (const entry of entries) {
    if (entry === 'archive' || entry.startsWith('.')) continue;
    const taskDir = path.join(tasksDir, entry);
    const stat = await fs.stat(taskDir).catch(() => null);
    if (!stat || !stat.isDirectory()) continue;

    const statePath = path.join(taskDir, 'state.json');
    if (!await fs.pathExists(statePath)) continue;

    try {
      const state = await fs.readJson(statePath);
      tasks.push({
        changeName: state.changeName || state.name || entry,
        type: state.type || 'unknown',
        status: state.status || 'unknown',
        phase: extractPhase(state),
        archivedAt: state.archived_at || null,
      });
    } catch {
      // skip malformed state.json
    }
  }

  return tasks;
}
