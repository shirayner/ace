/**
 * Black-box driver for `scripts/goal.py`.
 *
 * Both suites drive the real CLI in a real temp project root: nothing here reads
 * or asserts the script's internals. The Python resolution below is the reason
 * this lives in one place — on Windows `python` is a shim that only resolves
 * through cmd.exe, and duplicating that per suite means one of the copies rots.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HELPER_DIR = path.dirname(fileURLToPath(import.meta.url));
export const GOAL_PY = process.env.AUTO_GOAL_V3_GOAL_PY
  || path.resolve(HELPER_DIR, '..', '..', 'scripts', 'goal.py');
export const PYTHON = process.env.PYTHON || resolvePython();

function resolvePython() {
  const launcher = process.platform === 'win32'
    ? [process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'python', '-c', 'import sys; print(sys.executable)']]
    : ['python3', ['-c', 'import sys; print(sys.executable)']];
  const result = spawnSync(launcher[0], launcher[1], {
    cwd: HELPER_DIR,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `cannot resolve Python interpreter:\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

export function run(root, ...args) {
  return spawnSync(PYTHON, [GOAL_PY, ...args, '--root', root], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
}

export function expectSuccess(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

export function expectFailure(result, pattern) {
  assert.notEqual(result.status, 0, 'command unexpectedly succeeded');
  assert.match(`${result.stdout}\n${result.stderr}`, pattern);
}

export function statePath(root, name) {
  return path.join(root, '.ace', 'tasks', name, 'state.json');
}

export function readState(root, name) {
  return JSON.parse(fs.readFileSync(statePath(root, name), 'utf8'));
}

export function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Hand-edit state.json — how a suite forges what the CLI refuses to produce. */
export function mutateState(root, name, mutate) {
  const state = readState(root, name);
  mutate(state);
  writeJson(statePath(root, name), state);
  return state;
}

export function init(root, name, criteria) {
  const args = ['init', '--name', name, '--goal', 'contract test'];
  for (const criterion of criteria) args.push('--criteria', criterion);
  const result = run(root, ...args);
  expectSuccess(result);
  return readState(root, name);
}

export function reportFor(state, verdicts) {
  return {
    criteria_sha256: state.criteria_sha256,
    verdicts: verdicts.map(([criterion_id, verdict]) => ({
      criterion_id,
      verdict,
      evidence: `observed ${criterion_id}`,
    })),
  };
}

export function accept(root, name, payload) {
  const report = path.join(root, `${name}-verdicts.json`);
  writeJson(report, payload);
  return run(root, 'accept-report', '--name', name, '--from', report);
}

export function withRoot(fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-goal-v3-contract-'));
  try {
    fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ─── Work Graph ───────────────────────────────────────────────────────────────

/** A structurally complete work item; callers override only what a case is about. */
export function item(id, criterionIds, overrides = {}) {
  return {
    id,
    title: `work item ${id}`,
    output: `${id}/output.md`,
    acceptance: `${id} output exists and states its result`,
    criterion_ids: criterionIds,
    depends_on: [],
    resources: { reads: [], writes: [`${id}.md`], external: [], exclusive: [] },
    ...overrides,
  };
}

export function plan(root, name, items, ...extra) {
  const file = path.join(root, `${name}-plan.json`);
  writeJson(file, { items });
  return run(root, 'plan', '--name', name, '--from', file, ...extra);
}

export function dispatch(root, name, id, agent, invocation, ...extra) {
  return run(root, 'dispatch', '--name', name, id,
    '--agent', agent, '--invocation', invocation, ...extra);
}

export function collect(root, name, id, selfReport = 'DONE') {
  return run(root, 'collect', '--name', name, id,
    '--self-report', selfReport, '--summary', `${id} reported ${selfReport}`);
}

export function verify(root, name, id) {
  return run(root, 'verify', '--name', name, id,
    '--evidence', `controller re-ran ${id}: output present`);
}

export function review(root, name, id, agent, invocation, verdict = 'PASS') {
  return run(root, 'review', '--name', name, id,
    '--agent', agent, '--invocation', invocation,
    '--verdict', verdict, '--evidence', `reviewer read ${id} output`);
}

/**
 * Drive one item planned → reviewed through the real transitions.
 *
 * Identities are derived from the item id so every implementer invocation is
 * globally distinct and no reviewer identity is ever an implementer identity —
 * the two properties the state machine enforces.
 */
export function finishItem(root, name, id) {
  expectSuccess(dispatch(root, name, id, `impl-agent-${id}`, `impl-inv-${id}`));
  expectSuccess(collect(root, name, id));
  expectSuccess(verify(root, name, id));
  expectSuccess(review(root, name, id, `review-agent-${id}`, `review-inv-${id}`));
}

/**
 * The smallest work graph that can close a goal: one reviewed item per goal,
 * covering every frozen criterion. Used by suites whose subject is not the graph.
 */
export function closeableGraph(root, name, state) {
  const criterionIds = state.criteria.map(c => c.id);
  expectSuccess(plan(root, name, [item('W1', criterionIds)]));
  finishItem(root, name, 'W1');
}
