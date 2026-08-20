/**
 * Signal routing, Frontier derivation and cross-domain generality tests.
 *
 * Acceptance IDs from design §16: U01, U02, U03, U04, X01, I13.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SIGNALS,
  METHOD_PACKS,
  route,
  deriveFrontier,
  worthAsking,
  assertNotPersisted,
} from '../protocols/runtime/router.mjs';
import { criteriaGate } from '../protocols/runtime/criteria-gate.mjs';
import { partitionGoal } from '../protocols/runtime/mandate.mjs';
import { deriveRequiredRung } from '../protocols/runtime/risk.mjs';

// -------------------------------------------------------------- signal routing

test('no signals fired loads no method packs (§3.2)', () => {
  const result = route({
    intentIsAction: false,
    subjectResolvable: true,
    scopeDefined: true,
    ruleCount: 0,
    vagueTerms: [],
    criterionTypes: ['STATE'],
    blastRadius: 'one',
    domainFamiliar: true,
    manualWorkaround: false,
    loadBearingAssumptions: [],
    mandateAssessed: true,
    mandateGaps: [],
  });
  assert.deepEqual(result.fired, []);
  assert.deepEqual(result.packs, []);
});

test('a solution-shaped input routes to outcome reframing (U01)', () => {
  const result = route({ inputIsSolution: true });
  assert.ok(result.fired.some((s) => s.id === 'INPUT_IS_SOLUTION'));
  assert.ok(result.packs.includes('outcome-reframing'));
  assert.equal(result.fired.find((s) => s.id === 'INPUT_IS_SOLUTION').updates, 'intent');
});

test('judgment criteria route to early sampling, not to self-rubric', () => {
  const result = route({ criterionTypes: ['ARTIFACT_PROPERTY', 'JUDGMENT'] });
  assert.ok(result.packs.includes('judgment-sampling'));
});

test('high blast radius routes to target enumeration (R01 companion)', () => {
  assert.ok(route({ blastRadius: 'bounded_many' }).packs.includes('target-enumeration'));
  assert.ok(route({ blastRadius: 'unbounded' }).packs.includes('target-enumeration'));
  assert.ok(!route({ blastRadius: 'one' }).packs.includes('target-enumeration'));
});

test('packs are deduplicated when several signals share one', () => {
  const result = route({ subjectResolvable: false, vagueTerms: ['快', '合理'] });
  const ambiguityCount = result.packs.filter((p) => p === 'ambiguity').length;
  assert.equal(ambiguityCount, 1);
  assert.equal(result.fired.length, 2, 'both signals still reported');
});

test('every signal names an existing pack and a goal field it updates', () => {
  for (const signal of SIGNALS) {
    assert.ok(METHOD_PACKS.includes(signal.pack), signal.id);
    assert.ok(signal.updates && signal.updates.length > 0, signal.id);
    assert.equal(typeof signal.test, 'function', signal.id);
  }
});

// ------------------------------------------------------------ Frontier derivation

test('a checkable fact is delegated to a worker, never asked of the user (U02)', () => {
  const result = deriveFrontier({
    candidates: [
      {
        id: 'q-1',
        question: '当前表里有多少条记录？',
        agentCanCheck: true,
        uncertainty: 0.9,
        costOfWrong: 10,
        costOfAsking: 1,
      },
    ],
  });
  assert.equal(result.admitted.length, 0);
  assert.equal(result.delegated.length, 1);
  assert.equal(result.delegated[0].suggestedDispatch, 'DISCOVER');
});

test('only the most upstream load-bearing decision is asked (U03)', () => {
  const result = deriveFrontier({
    candidates: [
      {
        id: 'q-upstream',
        question: '本轮目标是降低录入成本还是提高数据质量？',
        uncertainty: 0.8,
        costOfWrong: 10,
        costOfAsking: 1,
      },
      {
        id: 'q-downstream',
        question: '导入失败时是否整批回滚？',
        depends_on: ['q-upstream'],
        uncertainty: 0.8,
        costOfWrong: 10,
        costOfAsking: 1,
      },
    ],
  });
  assert.equal(result.next.id, 'q-upstream');
  assert.equal(result.admitted.length, 1);
  assert.equal(result.deferred[0].reason, 'PREREQUISITE_UNRESOLVED');
  assert.deepEqual(result.deferred[0].blockedBy, ['q-upstream']);
});

test('a downstream question is admitted once its prerequisite resolves', () => {
  const result = deriveFrontier({
    candidates: [
      {
        id: 'q-downstream',
        question: '导入失败时是否整批回滚？',
        depends_on: ['q-upstream'],
        uncertainty: 0.8,
        costOfWrong: 10,
        costOfAsking: 1,
      },
    ],
    resolved: ['q-upstream'],
  });
  assert.equal(result.next.id, 'q-downstream');
});

test('a question below the ask threshold becomes a logged assumption (§3.3)', () => {
  const result = deriveFrontier({
    candidates: [
      {
        id: 'q-cheap',
        question: '日志时区用 UTC 吗？',
        uncertainty: 0.2,
        costOfWrong: 1,
        costOfAsking: 3,
        defeatCondition: '用户报告时间显示与本地不符',
      },
    ],
  });
  assert.equal(result.admitted.length, 0);
  assert.equal(result.assumptions.length, 1);
  assert.equal(result.assumptions[0].defeatCondition, '用户报告时间显示与本地不符');
});

test('the surprise test overrides the arithmetic (§3.3)', () => {
  assert.equal(worthAsking({ uncertainty: 0.1, costOfWrong: 1, costOfAsking: 100 }), false);
  assert.equal(
    worthAsking({ uncertainty: 0.1, costOfWrong: 1, costOfAsking: 100, surprising: true }),
    true,
  );

  const result = deriveFrontier({
    candidates: [
      {
        id: 'q-surprise',
        question: '要删除历史数据以腾出空间吗？',
        uncertainty: 0.1,
        costOfWrong: 1,
        costOfAsking: 100,
        surprising: true,
      },
    ],
  });
  assert.equal(result.next.id, 'q-surprise');
  assert.equal(result.admitted[0].surpriseTest, true);
});

test('a question that changes no decision is dropped', () => {
  const result = deriveFrontier({
    candidates: [
      {
        id: 'q-idle',
        question: '你们团队多少人？',
        changesDecision: false,
        uncertainty: 0.9,
        costOfWrong: 9,
        costOfAsking: 1,
      },
    ],
  });
  assert.equal(result.admitted.length, 0);
  assert.equal(result.deferred[0].reason, 'DOES_NOT_CHANGE_DECISION');
});

test('an answered question does not reappear in the next Frontier', () => {
  const candidates = [
    { id: 'q-1', question: 'A?', uncertainty: 0.9, costOfWrong: 9, costOfAsking: 1 },
  ];
  assert.equal(deriveFrontier({ candidates }).admitted.length, 1);
  assert.equal(deriveFrontier({ candidates, resolved: ['q-1'] }).admitted.length, 0);
});

test('Frontier keys must never appear in persisted state (I13, U04)', () => {
  const cleanCheckpoint = {
    schema_version: 1,
    task_id: 'goal-1',
    phase: 'EXECUTING',
    next_action: { kind: 'DISPATCH', target: 'verify' },
  };
  assert.equal(assertNotPersisted(cleanCheckpoint).clean, true);

  const leaked = {
    ...cleanCheckpoint,
    pending_questions: [{ id: 'q-1' }],
  };
  const result = assertNotPersisted(leaked);
  assert.equal(result.clean, false);
  assert.deepEqual(result.violations, ['pending_questions']);

  const nested = { schema_version: 1, payload: { frontier: { admitted: [] } } };
  const nestedResult = assertNotPersisted(nested);
  assert.equal(nestedResult.clean, false);
  assert.ok(nestedResult.violations.includes('payload.frontier'));
});

// ------------------------------------------------- cross-domain generality (X01)

/**
 * The seven domains from design §13 / generic-goal-model §8 must all run through the
 * same machinery with different parameters. A test that only exercised software
 * goals would let a code-shaped assumption pass unnoticed — which is the specific
 * bias this design set out to remove.
 */
const DOMAIN_CASES = [
  {
    name: '软件：重构模块使其可测',
    criteria: [
      {
        criterion_id: 'c-1',
        type: 'BEHAVIOR',
        statement: '模块在给定输入下返回既有输出',
        stimulus: '运行测试套件',
        risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
      },
      {
        criterion_id: 'c-2',
        type: 'NEGATIVE',
        statement: '在 A/B/C 三个调用点未发现行为变化',
        check_surface: ['A', 'B', 'C'],
        risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
      },
    ],
    mandate: { effector: ['fs'], competence: ['refactor'], observation: ['test-run'] },
    expectedMaxOutcome: 'DONE',
    expectAdmissible: true,
  },
  {
    name: '调研：市场调研并给建议',
    criteria: [
      {
        criterion_id: 'c-1',
        type: 'ARTIFACT_PROPERTY',
        statement: '覆盖 5 家竞品且每条结论有出处',
        risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
      },
      {
        criterion_id: 'c-2',
        type: 'JUDGMENT',
        statement: '建议对决策有帮助',
        acceptor_ref: 'user:owner',
        risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
      },
    ],
    mandate: { effector: ['fs'], competence: ['research'], observation: ['read'] },
    expectedMaxOutcome: 'DONE',
    expectAdmissible: true,
  },
  {
    name: '写作：写一封有说服力的信',
    criteria: [
      {
        criterion_id: 'c-1',
        type: 'JUDGMENT',
        statement: '收信人认为这封信得体且有说服力',
        acceptor_ref: 'user:owner',
        risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
      },
    ],
    mandate: { effector: ['fs'], competence: ['writing'], observation: ['read'] },
    expectedMaxOutcome: 'DONE',
    expectAdmissible: true,
    expectedRung: 'E4',
  },
  {
    name: '批量文件：整理 3000 个文件',
    criteria: [
      {
        criterion_id: 'c-1',
        type: 'STATE',
        statement: '3000 个文件均位于按年份划分的目录中',
        risk: { reversibility: 'costly', externality: 'private', blast_radius: 'bounded_many', undo_window: 'short', detectability: 'observable' },
      },
    ],
    mandate: { effector: ['fs'], competence: ['move'], observation: ['listdir'], authority: ['bulk-approved'] },
    expectedMaxOutcome: 'DONE',
    expectAdmissible: true,
    expectedRung: 'E2',
  },
  {
    name: '外部系统：取消订阅',
    criteria: [
      {
        criterion_id: 'c-1',
        type: 'STATE',
        statement: '账户订阅状态为已取消',
        risk: { reversibility: 'costly', externality: 'shared', blast_radius: 'one', undo_window: 'short', detectability: 'observable' },
      },
    ],
    // No effector for the vendor site, and no way to read state back.
    mandate: { competence: ['browse'] },
    expectedMaxOutcome: 'PARTIAL',
    expectAdmissible: true,
    expectedRung: 'E4',
  },
  {
    name: '线下：让房东修锅炉',
    criteria: [
      {
        criterion_id: 'c-1',
        type: 'EFFECT',
        statement: '锅炉恢复正常供暖',
        within_horizon: false,
        proxy_metric: '房东确认已派维修（声明为代理指标）',
        acceptor_ref: 'user:tenant',
        risk: { reversibility: 'easy', externality: 'shared', blast_radius: 'one', undo_window: 'available', detectability: 'observable' },
      },
    ],
    mandate: { effector: [], competence: ['drafting'] },
    expectedMaxOutcome: 'PARTIAL',
    expectAdmissible: true,
  },
  {
    name: '学习：学懂分布式共识',
    criteria: [
      {
        criterion_id: 'c-1',
        type: 'KNOWLEDGE',
        statement: '用户能独立复述并应用共识算法的安全性论证',
        acceptor_ref: 'user:owner',
        risk: { reversibility: 'easy', externality: 'private', blast_radius: 'one', undo_window: 'available', detectability: 'loud' },
      },
    ],
    mandate: { effector: ['fs'], competence: ['teaching'] },
    expectedMaxOutcome: 'DONE',
    expectAdmissible: true,
    expectedRung: 'E4',
  },
];

test('all seven domains pass through the same gates without code-shaped assumptions (X01)', () => {
  for (const domainCase of DOMAIN_CASES) {
    const gate = criteriaGate(domainCase.criteria);
    assert.equal(
      gate.admissible,
      domainCase.expectAdmissible,
      `${domainCase.name}: ${JSON.stringify(gate.blockers)}`,
    );

    const partition = partitionGoal({
      criteria: domainCase.criteria.map((c) => ({
        ...c,
        requires: c.type === 'STATE' ? ['effector', 'competence', 'observation'] : ['effector', 'competence'],
      })),
      mandate: domainCase.mandate,
    });
    assert.equal(
      partition.maxOutcome,
      domainCase.expectedMaxOutcome,
      `${domainCase.name} max outcome`,
    );

    if (domainCase.expectedRung) {
      const requirement = deriveRequiredRung({
        type: domainCase.criteria[0].type,
        risk: domainCase.criteria[0].risk,
      });
      assert.equal(
        requirement.required,
        domainCase.expectedRung,
        `${domainCase.name} required rung`,
      );
    }
  }
});

test('the offline goal keeps a non-empty residual that must be disclosed', () => {
  const boiler = DOMAIN_CASES.find((c) => c.name.startsWith('线下'));
  const partition = partitionGoal({
    criteria: boiler.criteria.map((c) => ({ ...c, requires: ['effector', 'competence'] })),
    mandate: boiler.mandate,
  });
  assert.equal(partition.disclosureRequired, true);
  assert.equal(partition.residual.length, 1);
  assert.ok(partition.residual[0].gaps.includes('effector'));
});

test('the external-system goal cannot self-certify: no observation means no E2 read-back', () => {
  const subscription = DOMAIN_CASES.find((c) => c.name.startsWith('外部系统'));
  const partition = partitionGoal({
    criteria: subscription.criteria.map((c) => ({
      ...c,
      requires: ['effector', 'competence', 'observation'],
    })),
    mandate: subscription.mandate,
  });
  assert.equal(partition.maxOutcome, 'PARTIAL');
  const gaps = partition.residual[0].gaps;
  assert.ok(gaps.includes('effector'));
  assert.ok(gaps.includes('observation'));
  assert.ok(partition.residual[0].onMissing.includes('UNVERIFIABLE'));
});
