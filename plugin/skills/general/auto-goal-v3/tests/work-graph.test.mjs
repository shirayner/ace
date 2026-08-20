/**
 * The Controller–Worker work graph, driven through the real CLI.
 *
 * v3's execution contract is that the Controller schedules and subagents do the
 * work. Prose cannot hold that: "delegate every implementation item" reads as
 * satisfied by an item that was never dispatched, and "an independent reviewer"
 * reads as satisfied by the implementer reviewing itself. So the graph and the
 * delegation lifecycle are state-machine properties here, and `done` is the gate
 * that re-derives all of them from state.json rather than trusting a flag.
 *
 * Every case creates and advances items through the CLI. Where a case is about
 * a record the CLI refuses to produce (a cycle, a `reviewed` item with no
 * reviewer), it hand-edits state.json — that is the forgery `done` must catch,
 * and asserting on the schema alone would not have caught it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  accept, closeableGraph, collect, dispatch, expectFailure, expectSuccess,
  finishItem, init, item, mutateState, plan, readState, reportFor, review, run,
  statePath, verify, withRoot, writeJson,
} from './helpers/goal-cli.mjs';

/** The frozen criteria used by most cases: two, so coverage gaps are expressible. */
const TWO = ['first observable result', 'second observable result'];

function archivedState(root, suffix) {
  const archiveRoot = path.join(root, '.ace', 'tasks', 'archive');
  const found = fs.readdirSync(archiveRoot).find(name => name.endsWith(`-${suffix}`));
  assert.ok(found, `task '${suffix}' was not archived`);
  return JSON.parse(fs.readFileSync(path.join(archiveRoot, found, 'state.json'), 'utf8'));
}

function itemById(root, name, id) {
  const found = readState(root, name).tasks.find(t => t.id === id);
  assert.ok(found, `item ${id} not found in state.json`);
  return found;
}

/** Pass every frozen criterion, so only the graph decides whether `done` closes. */
function acceptAllPass(root, name) {
  const state = readState(root, name);
  return accept(root, name, reportFor(state, state.criteria.map(c => [c.id, 'PASS'])));
}

// ─── complete flow ────────────────────────────────────────────────────────────

test('complete arm: a multi-item graph advances through every lifecycle stage and closes', () => withRoot(root => {
  const state = init(root, 'multi', TWO);

  expectSuccess(plan(root, 'multi', [
    item('W1', ['C001']),
    item('W2', ['C002'], { depends_on: ['W1'], resources: { reads: ['W1.md'], writes: ['W2.md'], external: [], exclusive: [] } }),
  ]));

  // Planned is a real, distinct state: nothing has been delegated yet.
  assert.equal(itemById(root, 'multi', 'W1').lifecycle, 'planned');
  assert.equal(itemById(root, 'multi', 'W1').delegation, null);

  expectSuccess(dispatch(root, 'multi', 'W1', 'impl-a', 'inv-1'));
  assert.equal(itemById(root, 'multi', 'W1').lifecycle, 'dispatched');
  assert.equal(itemById(root, 'multi', 'W1').delegation.agent, 'impl-a');
  assert.equal(itemById(root, 'multi', 'W1').delegation.invocation, 'inv-1');

  expectSuccess(collect(root, 'multi', 'W1'));
  assert.equal(itemById(root, 'multi', 'W1').lifecycle, 'returned');
  assert.equal(itemById(root, 'multi', 'W1').delegation.self_report, 'DONE');

  expectSuccess(verify(root, 'multi', 'W1'));
  assert.equal(itemById(root, 'multi', 'W1').lifecycle, 'verified');
  assert.match(itemById(root, 'multi', 'W1').controller_verification.evidence, /controller re-ran W1/);

  expectSuccess(review(root, 'multi', 'W1', 'review-a', 'inv-2'));
  const reviewed = itemById(root, 'multi', 'W1');
  assert.equal(reviewed.lifecycle, 'reviewed');
  assert.equal(reviewed.independent_review.agent, 'review-a');
  assert.equal(reviewed.independent_review.verdict, 'PASS');
  assert.equal(reviewed.status, 'done', 'status must project the lifecycle for the ace CLI');

  finishItem(root, 'multi', 'W2');

  expectSuccess(acceptAllPass(root, 'multi'));
  expectSuccess(run(root, 'done', '--name', 'multi'));
  assert.equal(archivedState(root, 'multi').outcome, 'completed');
  assert.equal(state.tasks.length, 0, 'init must not invent work items');
}));

test('minimal arm: one atomic item covering every criterion is enough to close', () => withRoot(root => {
  const state = init(root, 'atomic', ['only criterion']);
  expectSuccess(plan(root, 'atomic', [item('W1', ['C001'])]));
  finishItem(root, 'atomic', 'W1');

  expectSuccess(accept(root, 'atomic', reportFor(state, [['C001', 'PASS']])));
  expectSuccess(run(root, 'done', '--name', 'atomic'));
  assert.equal(archivedState(root, 'atomic').outcome, 'completed');
}));

test('graph reports each item lifecycle and is machine-readable', () => withRoot(root => {
  init(root, 'inspect', TWO);
  expectSuccess(plan(root, 'inspect', [item('W1', ['C001']), item('W2', ['C002'])]));
  expectSuccess(dispatch(root, 'inspect', 'W1', 'impl-a', 'inv-1'));

  const result = run(root, 'graph', '--name', 'inspect', '--json');
  expectSuccess(result);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.items.map(i => [i.id, i.lifecycle]), [['W1', 'dispatched'], ['W2', 'planned']]);
  assert.deepEqual(payload.uncovered_criterion_ids, []);
}));

// ─── graph structure ──────────────────────────────────────────────────────────

test('empty graph: neither an unplanned goal nor an empty plan can close', () => withRoot(root => {
  init(root, 'unplanned', ['only criterion']);
  expectSuccess(acceptAllPass(root, 'unplanned'));
  expectFailure(run(root, 'done', '--name', 'unplanned'), /work graph|Work Graph/);
  assert.ok(fs.existsSync(statePath(root, 'unplanned')), 'rejected done must not archive');

  init(root, 'emptyplan', ['only criterion']);
  expectFailure(plan(root, 'emptyplan', []), /items|至少一个/);
  assert.deepEqual(readState(root, 'emptyplan').tasks, []);
}));

test('coverage: an uncovered criterion is named at plan time and blocks done', () => withRoot(root => {
  init(root, 'partialcov', TWO);

  const planned = plan(root, 'partialcov', [item('W1', ['C001'])]);
  expectSuccess(planned);
  assert.match(`${planned.stdout}\n${planned.stderr}`, /C002/, 'plan must name the uncovered criterion');

  finishItem(root, 'partialcov', 'W1');
  expectSuccess(acceptAllPass(root, 'partialcov'));
  expectFailure(run(root, 'done', '--name', 'partialcov'), /C002/);
}));

test('unknown criterion_ids are rejected at plan time and again at done', () => withRoot(root => {
  init(root, 'unknowncov', TWO);
  expectFailure(plan(root, 'unknowncov', [item('W1', ['C001', 'C999'])]), /C999/);
  assert.deepEqual(readState(root, 'unknowncov').tasks, []);

  init(root, 'forgedcov', TWO);
  expectSuccess(plan(root, 'forgedcov', [item('W1', ['C001']), item('W2', ['C002'])]));
  finishItem(root, 'forgedcov', 'W1');
  finishItem(root, 'forgedcov', 'W2');
  expectSuccess(acceptAllPass(root, 'forgedcov'));
  mutateState(root, 'forgedcov', s => { s.tasks[1].criterion_ids = ['C404']; });
  expectFailure(run(root, 'done', '--name', 'forgedcov'), /C404/);
}));

test('empty criterion_ids are rejected: an item that advances no criterion is out of scope', () => withRoot(root => {
  init(root, 'nocrit', TWO);
  expectFailure(plan(root, 'nocrit', [item('W1', []), item('W2', ['C001', 'C002'])]), /criterion_ids/);
}));

test('an item missing output, acceptance, depends_on, or resources is rejected', () => withRoot(root => {
  init(root, 'shape', ['only criterion']);
  const cases = [
    ['output', /output/],
    ['acceptance', /acceptance/],
    ['depends_on', /depends_on/],
    ['resources', /resources/],
    ['id', /id/],
  ];
  for (const [field, pattern] of cases) {
    const incomplete = item('W1', ['C001']);
    delete incomplete[field];
    expectFailure(plan(root, 'shape', [incomplete]), pattern);
  }

  // A typo'd resource key would silently declare an empty write set, which is
  // what makes two conflicting items look parallelizable.
  const typo = item('W1', ['C001'], { resources: { reads: [], write: ['a.md'], external: [], exclusive: [] } });
  expectFailure(plan(root, 'shape', [typo]), /writes|write/);
  assert.deepEqual(readState(root, 'shape').tasks, []);
}));

test('duplicate item ids are rejected — an id must identify one item', () => withRoot(root => {
  init(root, 'dupid', ['only criterion']);
  expectFailure(plan(root, 'dupid', [item('W1', ['C001']), item('W1', ['C001'])]), /W1/);
}));

test('dependency errors: missing target, self-edge, and cycles fail at plan and at done', () => withRoot(root => {
  init(root, 'depmissing', ['only criterion']);
  expectFailure(plan(root, 'depmissing', [item('W1', ['C001'], { depends_on: ['W9'] })]), /W9/);

  init(root, 'depself', ['only criterion']);
  expectFailure(plan(root, 'depself', [item('W1', ['C001'], { depends_on: ['W1'] })]), /W1/);

  init(root, 'depcycle', ['only criterion']);
  expectFailure(plan(root, 'depcycle', [
    item('W1', ['C001'], { depends_on: ['W2'] }),
    item('W2', ['C001'], { depends_on: ['W1'] }),
  ]), /环|cycle/i);
  assert.deepEqual(readState(root, 'depcycle').tasks, []);

  // Forged after the fact: done re-derives the graph instead of trusting plan.
  init(root, 'depforged', ['only criterion']);
  expectSuccess(plan(root, 'depforged', [item('W1', ['C001']), item('W2', ['C001'])]));
  finishItem(root, 'depforged', 'W1');
  finishItem(root, 'depforged', 'W2');
  expectSuccess(acceptAllPass(root, 'depforged'));
  mutateState(root, 'depforged', s => {
    s.tasks[0].depends_on = ['W2'];
    s.tasks[1].depends_on = ['W1'];
  });
  expectFailure(run(root, 'done', '--name', 'depforged'), /环|cycle/i);

  init(root, 'depgone', ['only criterion']);
  expectSuccess(plan(root, 'depgone', [item('W1', ['C001'])]));
  finishItem(root, 'depgone', 'W1');
  expectSuccess(acceptAllPass(root, 'depgone'));
  mutateState(root, 'depgone', s => { s.tasks[0].depends_on = ['W-gone']; });
  expectFailure(run(root, 'done', '--name', 'depgone'), /W-gone/);
}));

// ─── delegation lifecycle ─────────────────────────────────────────────────────

test('illegal jumps: every stage requires its predecessor', () => withRoot(root => {
  init(root, 'jumps', ['only criterion']);
  expectSuccess(plan(root, 'jumps', [item('W1', ['C001'])]));

  expectFailure(collect(root, 'jumps', 'W1'), /planned|dispatched/);
  expectFailure(verify(root, 'jumps', 'W1'), /planned|returned/);
  expectFailure(review(root, 'jumps', 'W1', 'review-a', 'inv-r'), /planned|verified/);

  expectSuccess(dispatch(root, 'jumps', 'W1', 'impl-a', 'inv-1'));
  expectFailure(dispatch(root, 'jumps', 'W1', 'impl-b', 'inv-2'), /dispatched/);
  expectFailure(verify(root, 'jumps', 'W1'), /dispatched|returned/);
  expectFailure(review(root, 'jumps', 'W1', 'review-a', 'inv-r'), /dispatched|verified/);

  expectSuccess(collect(root, 'jumps', 'W1'));
  expectFailure(review(root, 'jumps', 'W1', 'review-a', 'inv-r'), /returned|verified/);

  expectSuccess(verify(root, 'jumps', 'W1'));
  expectFailure(verify(root, 'jumps', 'W1'), /verified/);
  expectFailure(collect(root, 'jumps', 'W1'), /verified/);

  expectSuccess(review(root, 'jumps', 'W1', 'review-a', 'inv-r'));
  expectFailure(review(root, 'jumps', 'W1', 'review-b', 'inv-r2'), /reviewed/);

  // The whole point of the ladder: no single flag closes an item.
  expectFailure(run(root, 'graph', '--name', 'jumps', '--set-status', 'done'), /unrecognized|invalid|error/i);
}));

test('an item can only be dispatched once its dependencies are verified', () => withRoot(root => {
  init(root, 'depgate', TWO);
  expectSuccess(plan(root, 'depgate', [
    item('W1', ['C001']),
    item('W2', ['C002'], { depends_on: ['W1'] }),
  ]));

  expectFailure(dispatch(root, 'depgate', 'W2', 'impl-b', 'inv-b'), /W1/);
  expectSuccess(dispatch(root, 'depgate', 'W1', 'impl-a', 'inv-a'));
  expectFailure(dispatch(root, 'depgate', 'W2', 'impl-b', 'inv-b'), /W1/);
  expectSuccess(collect(root, 'depgate', 'W1'));
  expectSuccess(verify(root, 'depgate', 'W1'));
  expectSuccess(dispatch(root, 'depgate', 'W2', 'impl-b', 'inv-b'));
}));

test('identity: agent and invocation are mandatory, distinct per dispatch, and never self-reviewed', () => withRoot(root => {
  init(root, 'identity', TWO);
  expectSuccess(plan(root, 'identity', [item('W1', ['C001']), item('W2', ['C002'])]));

  expectFailure(run(root, 'dispatch', '--name', 'identity', 'W1', '--invocation', 'inv-1'), /agent/);
  expectFailure(run(root, 'dispatch', '--name', 'identity', 'W1', '--agent', 'impl-a'), /invocation/);
  expectFailure(dispatch(root, 'identity', 'W1', 'impl-a', '   '), /invocation/);
  expectFailure(dispatch(root, 'identity', 'W1', '   ', 'inv-1'), /agent/);

  expectSuccess(dispatch(root, 'identity', 'W1', 'impl-a', 'inv-1'));

  // A fresh subagent per item means a fresh invocation per item; reusing one
  // records two items as the same run, which is exactly the claim being made.
  expectFailure(dispatch(root, 'identity', 'W2', 'impl-b', 'inv-1'), /inv-1/);
  expectSuccess(dispatch(root, 'identity', 'W2', 'impl-b', 'inv-2'));

  for (const id of ['W1', 'W2']) {
    expectSuccess(collect(root, 'identity', id));
    expectSuccess(verify(root, 'identity', id));
  }

  // Implementer reviewing its own work: rejected on either identity field.
  expectFailure(review(root, 'identity', 'W1', 'impl-a', 'inv-r1'), /impl-a/);
  expectFailure(review(root, 'identity', 'W1', 'review-a', 'inv-1'), /inv-1/);
  expectFailure(run(root, 'review', '--name', 'identity', 'W1', '--agent', 'review-a',
    '--verdict', 'PASS', '--evidence', 'read it'), /invocation/);
  expectSuccess(review(root, 'identity', 'W1', 'review-a', 'inv-r1'));

  // A reviewer identity is also not reusable as an implementer identity.
  expectFailure(review(root, 'identity', 'W2', 'review-a', 'inv-r1'), /inv-r1/);
  expectSuccess(review(root, 'identity', 'W2', 'review-b', 'inv-r2'));
}));

test('a FAIL review cannot be laundered by rebuilding the graph', () => withRoot(root => {
  // A FAIL rolls the item back to `planned`, which is also the state a fresh plan
  // expects. So the "nothing has advanced" rebuild guard is open exactly when the
  // graph carries a FAIL — and a rebuild reissues the item with empty histories,
  // erasing both the FAIL and the identities that are supposed to be burnt.
  init(root, 'launder', ['only criterion']);
  expectSuccess(plan(root, 'launder', [item('W1', ['C001'])]));
  expectSuccess(dispatch(root, 'launder', 'W1', 'impl-a', 'inv-1'));
  expectSuccess(collect(root, 'launder', 'W1'));
  expectSuccess(verify(root, 'launder', 'W1'));
  assert.notEqual(review(root, 'launder', 'W1', 'review-a', 'inv-r', 'FAIL').status, 0);

  expectFailure(plan(root, 'launder', [item('W1', ['C001'])]), /W1/);

  const after = itemById(root, 'launder', 'W1');
  assert.equal(after.review_history.length, 1, 'the FAIL must survive a rebuild attempt');
  assert.equal(after.delegation_history.length, 1, 'the failed delegation must survive too');

  // The identities burnt by the failed round stay burnt: the repair must go to a
  // fresh subagent, not to the agent that already claimed DONE on this item.
  expectFailure(dispatch(root, 'launder', 'W1', 'impl-a', 'inv-1'), /inv-1/);
  // A fresh invocation is not enough to un-burn the agent. The rule the FAIL path
  // states — repair does not go back to whoever claimed DONE — is about who, and an
  // agent handed a new invocation is the same agent arguing the reviewer was wrong.
  expectFailure(dispatch(root, 'launder', 'W1', 'impl-a', 'inv-fresh'), /impl-a/);
  expectSuccess(dispatch(root, 'launder', 'W1', 'impl-c', 'inv-3'));
}));

test('a forged dangling dependency is diagnosed at dispatch, not crashed on', () => withRoot(root => {
  init(root, 'danglingdep', TWO);
  expectSuccess(plan(root, 'danglingdep', [item('W1', ['C001']), item('W2', ['C002'])]));
  mutateState(root, 'danglingdep', s => { s.tasks[1].depends_on = ['W-gone']; });

  const result = dispatch(root, 'danglingdep', 'W2', 'impl-b', 'inv-b');
  expectFailure(result, /W-gone/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Traceback|KeyError/,
    'a broken graph must produce a diagnosis, not a Python traceback');
}));

test('a FAIL review reopens the item and forces a fresh dispatch', () => withRoot(root => {
  init(root, 'failreview', ['only criterion']);
  expectSuccess(plan(root, 'failreview', [item('W1', ['C001'])]));
  expectSuccess(dispatch(root, 'failreview', 'W1', 'impl-a', 'inv-1'));
  expectSuccess(collect(root, 'failreview', 'W1'));
  expectSuccess(verify(root, 'failreview', 'W1'));

  const failed = review(root, 'failreview', 'W1', 'review-a', 'inv-r', 'FAIL');
  assert.notEqual(failed.status, 0, 'a FAIL review must not report success');
  const reopened = itemById(root, 'failreview', 'W1');
  assert.equal(reopened.lifecycle, 'planned');
  assert.equal(reopened.independent_review, null);
  assert.equal(reopened.review_history.length, 1, 'the FAIL must stay on record, not be erased');
  assert.equal(reopened.review_history[0].verdict, 'FAIL');

  expectSuccess(acceptAllPass(root, 'failreview'));
  expectFailure(run(root, 'done', '--name', 'failreview'), /W1=planned/);

  expectSuccess(dispatch(root, 'failreview', 'W1', 'impl-c', 'inv-3'));
  expectSuccess(collect(root, 'failreview', 'W1'));
  expectSuccess(verify(root, 'failreview', 'W1'));
  expectSuccess(review(root, 'failreview', 'W1', 'review-c', 'inv-r3'));
  expectSuccess(run(root, 'done', '--name', 'failreview'));
}));

// ─── done gates ───────────────────────────────────────────────────────────────

test('done rejects an item stalled at any stage before reviewed', () => withRoot(root => {
  const stages = [
    ['stalled-planned', [], 'planned'],
    ['stalled-dispatched', ['dispatch'], 'dispatched'],
    ['stalled-returned', ['dispatch', 'collect'], 'returned'],
    ['stalled-verified', ['dispatch', 'collect', 'verify'], 'verified'],
  ];
  for (const [name, steps, stage] of stages) {
    init(root, name, ['only criterion']);
    expectSuccess(plan(root, name, [item('W1', ['C001'])]));
    if (steps.includes('dispatch')) expectSuccess(dispatch(root, name, 'W1', 'impl-a', `inv-${name}`));
    if (steps.includes('collect')) expectSuccess(collect(root, name, 'W1'));
    if (steps.includes('verify')) expectSuccess(verify(root, name, 'W1'));

    expectSuccess(acceptAllPass(root, name));
    // Name the stage in the diagnosis, not just the item: `/W1/` alone would be
    // satisfied by any complaint that happens to mention W1, which is what let a
    // mutant that dropped this gate entirely still look defended.
    expectFailure(run(root, 'done', '--name', name), new RegExp(`W1=${stage}`));
    assert.ok(fs.existsSync(statePath(root, name)), `${name} must not archive`);
  }
}));

test('done rejects forged records: reviewed without delegation, verification, or reviewer', () => withRoot(root => {
  const forgeries = [
    ['forge-nodeleg', s => { s.tasks[0].delegation = null; }, /delegat|委派/i],
    ['forge-noverify', s => { s.tasks[0].controller_verification = null; }, /verif|验证/i],
    ['forge-noreview', s => { s.tasks[0].independent_review = null; }, /review|审查/i],
    ['forge-selfreview', s => {
      s.tasks[0].independent_review.agent = s.tasks[0].delegation.agent;
    }, /impl-a/],
    ['forge-blankagent', s => { s.tasks[0].delegation.agent = ''; }, /agent/],
    ['forge-stage', s => { s.tasks[0].lifecycle = 'shipped'; }, /shipped/],
    // `returned` is where the subagent's output actually lands: `collect` is the step
    // that writes summary, returned_at and the self-report. Only the dispatch half of
    // the record was re-derived, so a hand-written item could claim it was delegated
    // and verified with nothing on record saying anyone ever came back — the skipped
    // step being exactly the one that produces the work.
    ['forge-nosummary', s => { s.tasks[0].delegation.summary = ''; }, /summary/],
    ['forge-noreturn', s => { s.tasks[0].delegation.returned_at = null; }, /returned_at/],
    ['forge-noselfreport', s => { s.tasks[0].delegation.self_report = null; }, /self_report/],
    ['forge-badselfreport', s => { s.tasks[0].delegation.self_report = 'SHIPPED'; }, /SHIPPED/],
  ];

  for (const [name, forge, pattern] of forgeries) {
    init(root, name, ['only criterion']);
    expectSuccess(plan(root, name, [item('W1', ['C001'])]));
    expectSuccess(dispatch(root, name, 'W1', 'impl-a', `inv-${name}`));
    expectSuccess(collect(root, name, 'W1'));
    expectSuccess(verify(root, name, 'W1'));
    expectSuccess(review(root, name, 'W1', 'review-a', `inv-r-${name}`));
    expectSuccess(acceptAllPass(root, name));

    // The unforged record closes — so a failure below is the forgery, not the fixture.
    const good = readState(root, name);
    mutateState(root, name, forge);
    expectFailure(run(root, 'done', '--name', name), pattern);

    writeJson(statePath(root, name), good);
    expectSuccess(run(root, 'done', '--name', name));
  }
}));

test('done re-derives graph-wide identity disjointness, not just per-item', () => withRoot(root => {
  // `dispatch` and `review` enforce these across the whole graph; `done` re-derived
  // only the single-item pair. So a forgery that keeps every item's own reviewer
  // distinct still slipped through — which is the forgery a hand-edit produces.
  const forgeries = [
    // W1's reviewer is the agent that implemented W2: still a worker reviewing the
    // graph it built, which is the independence the ladder is for.
    ['forge-xrole', s => { s.tasks[0].independent_review.agent = s.tasks[1].delegation.agent; },
      /impl-agent-W2/],
    // Two items recorded as one invocation: the claim "a fresh subagent per item"
    // is false, and nothing else in state.json records that it was ever true.
    ['forge-shared-impl-inv', s => { s.tasks[1].delegation.invocation = s.tasks[0].delegation.invocation; },
      /impl-inv-W1/],
    // Two reviews recorded as one invocation: one reviewer run, two items closed.
    ['forge-shared-review-inv', s => { s.tasks[1].independent_review.invocation = s.tasks[0].independent_review.invocation; },
      /review-inv-W1/],
  ];

  for (const [name, forge, pattern] of forgeries) {
    init(root, name, TWO);
    expectSuccess(plan(root, name, [item('W1', ['C001']), item('W2', ['C002'])]));
    finishItem(root, name, 'W1');
    finishItem(root, name, 'W2');
    expectSuccess(acceptAllPass(root, name));

    const good = readState(root, name);
    mutateState(root, name, forge);
    expectFailure(run(root, 'done', '--name', name), pattern);

    // The unforged record closes, so the failure above is the forgery not the fixture.
    writeJson(statePath(root, name), good);
    expectSuccess(run(root, 'done', '--name', name));
  }
}));

test('one reviewer may review several items — independence is about roles, not headcount', () => withRoot(root => {
  init(root, 'sharedrev', TWO);
  expectSuccess(plan(root, 'sharedrev', [item('W1', ['C001']), item('W2', ['C002'])]));
  for (const id of ['W1', 'W2']) {
    expectSuccess(dispatch(root, 'sharedrev', id, `impl-${id}`, `inv-${id}`));
    expectSuccess(collect(root, 'sharedrev', id));
    expectSuccess(verify(root, 'sharedrev', id));
  }
  expectSuccess(review(root, 'sharedrev', 'W1', 'rev', 'inv-r1'));
  expectSuccess(review(root, 'sharedrev', 'W2', 'rev', 'inv-r2'));

  expectSuccess(acceptAllPass(root, 'sharedrev'));
  expectSuccess(run(root, 'done', '--name', 'sharedrev'));
  assert.equal(archivedState(root, 'sharedrev').outcome, 'completed');
}));

test('done still enforces the accept report on a fully reviewed graph', () => withRoot(root => {
  const state = init(root, 'noaccept', ['only criterion']);
  closeableGraph(root, 'noaccept', state);
  expectFailure(run(root, 'done', '--name', 'noaccept'), /accept/i);

  expectFailure(accept(root, 'noaccept', reportFor(state, [['C001', 'FAIL']])), /FAIL/);
  expectFailure(run(root, 'done', '--name', 'noaccept'), /FAIL/);
}));

test('status shows the delegation lifecycle rather than a bare pending/done flag', () => withRoot(root => {
  init(root, 'shown', TWO);
  expectSuccess(plan(root, 'shown', [item('W1', ['C001']), item('W2', ['C002'], { depends_on: ['W1'] })]));
  expectSuccess(dispatch(root, 'shown', 'W1', 'impl-a', 'inv-1'));

  const result = run(root, 'status', '--name', 'shown');
  expectSuccess(result);
  assert.match(result.stdout, /W1/);
  assert.match(result.stdout, /dispatched/);
  assert.match(result.stdout, /planned/);
  assert.match(result.stdout, /W1/);
}));
