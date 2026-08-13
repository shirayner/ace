# B1 / B2 / B3 复现规格

**用途**：让修复者不必重新推导，且修完有客观验收依据。每份规格给出精确前置状态、调用序列、当前实测行为、修复后应有行为，以及一条可直接落成 `node:test` 的验收断言。

**实测环境**：Node v24.13.0，Windows 11。全部实测在仓库外副本 `/tmp/agv2-mutate/base/`（与仓库当前 `lib/` 逐字节相同）上执行，仓库内文件未修改。

**共同 fixture 约定**：以下规格中 `d(type, overrides)` 指
```js
const d = (type, o = {}) => ({
  task_id: 'goal-xxxxxxxxxx', type, actor: 'controller',
  scope_version: 1, payload: {}, artifact_refs: [], ...o,
});
```
与 `tests/fixtures/kernel-fixtures.mjs` 的 `eventDraft` 等价，可直接换用后者。

---

## B1：崩溃残留行一旦不再是末行，journal 永久不可读

**位置**：`lib/journal.mjs:120-147`（`readSegment`）、`lib/journal.mjs:348-358`（`appendLine`）
**违反**：设计 §9.2 崩溃一致性、§9.5 恢复算法；场景 J01
**严重级**：阻塞。任务从此无法恢复，且 `verifyJournal`、`readAllEvents`、`readTail` 全部抛错，连"报告 BLOCKED 并交接"这条退路也走不通。

### 精确前置状态

一个正常的两事件 segment，其后追加**一个不带换行的残留行**——这是崩溃在 `writeSync` 中途留下的形态。

`journal/segment-0001.jsonl` 内容（实测字节数）：

```
<GOAL_CREATED 的 canonical JSON>\n          <- 完整行，以 \n 结尾
<GOAL_ALIGNED 的 canonical JSON>\n          <- 完整行，以 \n 结尾
{"actor":"controller","seq":3,"type":"STEP_PLA    <- 残留：46 字节，无结尾 \n
```

- 两个完整事件后文件为 **1050 字节**。
- 残留串 `{"actor":"controller","seq":3,"type":"STEP_PLA` 为 **46 字节**（ASCII，即 46 字符）。
- 追加残留后文件为 **1096 字节**。
- 残留内容不必是这一串，唯一要求是：**不以 `\n` 结尾**，且本身不是合法 JSON。这与 `tests/journal-append.test.mjs:240` 现有 J01 测试使用的串完全一致，便于对照。

### 调用序列

```js
initTaskRoot(root);
appendEvent(root, d('GOAL_CREATED', { payload: { goal_id: 'g-000001', goal_summary: 'x' } }));
appendEvent(root, d('GOAL_ALIGNED', { actor: 'user', payload: { approved_by: 'decider:alice', residual: [] } }));

// 崩溃残留
appendFileSync(path.join(root, 'journal', 'segment-0001.jsonl'),
  '{"actor":"controller","seq":3,"type":"STEP_PLA');

// 状态 1：残留是末行 —— 现有测试覆盖到此为止
readSegment(root, 1);   // -> { events: 2, droppedPartialLine: true }   容错正确
verifyJournal(root);    // -> { valid: true, droppedPartialLine: true } 容错正确

// 状态 2：控制循环继续推进，追加下一个真实事件
appendEvent(root, d('STEP_PLANNED', { payload: { step_id: 's-000001', kind: 'ACT' } }));
```

### 当前实测行为

```
residue bytes = 46 | file bytes = 1096 (was 1050)
state 1 readSegment -> { events: 2, droppedPartialLine: true }

appendEvent threw: JOURNAL_CONFLICT / Segment 1 line 3 is not valid JSON
BUT the bytes were written anyway. file bytes now = 1616
lock still held? no (finally released)

line 3 (fused) = "{\"actor\":\"controller\",\"seq\":3,\"type\":\"STEP_PLA{\"actor\":\"controller\",\"artifact_refs\":[],\"causation_id\":null,\"correlation_" ...[565 chars]

every subsequent read is permanently broken:
  readSegment:    THROWS JOURNAL_CONFLICT
  readAllEvents:  THROWS JOURNAL_CONFLICT
  verifyJournal:  THROWS JOURNAL_CONFLICT
```

需要注意的一处比初判更严重的细节：**`appendEvent` 先成功写入，然后才抛错**。抛错点在 `lib/journal.mjs:336` 的 `readTail(taskRoot)`——那是写入完成后为返回新 tail 而做的重读。所以：

1. 新事件的字节已经落盘（1096 → 1616），
2. 调用方收到 `JOURNAL_CONFLICT`，会以为写入失败，
3. 实际上第三行已变成 `残留 + 新事件` 的熔接行，
4. 从此每次读取都抛同一个错，**没有任何代码路径能自愈**。

`readSegment` 的容错设计只认末行残留（`lines.pop()` 后判 `trailing !== ''`），一旦残留不在末尾就落进第 138 行的硬抛错分支。而 `appendLine`（第 349-358 行）用 `openSync(filePath, 'a')` 直接追加，**从不检查文件是否以 `\n` 结尾**，于是必然熔接。

### 修复后应有行为

两处都要改，只改一处不够：

1. **`appendLine` 必须修补缺失的结尾换行**：追加前检查文件末字节，若非 `\n` 则先写 `\n`。这样即使残留存在，新事件也自成一行。
   - 注意：补上换行后，残留行变成一个"完整但非法 JSON 的行"，仍会撞上 `readSegment` 第 138 行的硬抛错——所以必须同时做第 2 项。
2. **`readSegment` 必须能容忍非末尾位置的崩溃残留**。可接受的语义（任选，但需在代码注释中说明选择理由）：
   - a) 若某行非法 JSON 且其**前后行都能通过 hash 链校验相接**，判定为崩溃残留，丢弃该行并在返回值中报告（如 `droppedResidueLines: [3]`）；或
   - b) 保守方案：非末行的非法 JSON 仍视为损坏，但**不抛错**，而是返回到该行为止的前缀事件加上显式的 `truncatedAt` 标记，让恢复流程能在完好前缀上重建 checkpoint 并把余下部分作为 BLOCKED 证据交接。

   无论选哪种，硬性要求是：**`readAllEvents` / `verifyJournal` / `readTail` 在这种状态下必须返回结果而不是抛错**，否则「永不空手而归」在最需要它的时刻失效。
3. **`appendEvent` 的写入与重读必须一致**：写入成功后不应因重读失败而抛错误导调用方以为未写入。要么把 tail 重读移到写入之前并从内存推导新 tail，要么在重读失败时返回已写入的事实并附带告警。

### 验收断言

```js
test('a crash residue that is no longer the last line still leaves a readable journal (J01)', () => {
  withTask((root) => {
    appendAligned(root);
    appendFileSync(path.join(root, 'journal', 'segment-0001.jsonl'),
      '{"actor":"controller","seq":3,"type":"STEP_PLA');

    // The control loop keeps going; this must not corrupt the journal.
    appendEvent(root, eventDraft('STEP_PLANNED', { payload: { step_id: 's-001abcd', kind: 'ACT' } }));

    // The three read paths recovery depends on must all still work.
    const all = readAllEvents(root);
    assert.ok(all.events.length >= 3, 'the intact events must remain readable');
    assert.doesNotThrow(() => readTail(root));
    assert.doesNotThrow(() => verifyJournal(root));
    // And the new event must be a line of its own, not fused onto the residue.
    const lines = readFileSync(path.join(root, 'journal', 'segment-0001.jsonl'), 'utf8')
      .split('\n').filter((line) => line !== '');
    assert.ok(lines.every((line) => {
      try { JSON.parse(line); return true; } catch { return line.startsWith('{"actor":"controller","seq":3'); }
    }), 'no line may be a fusion of residue and a real event');
  });
});
```

---

## B2：`writeCheckpoint` 接受手写的 TERMINAL/DONE，I1 与 G5 在唯一持久化入口未被强制

**位置**：`lib/journal.mjs:451-460`（`writeCheckpoint`）
**违反**：I1（outcome 只能由 reducer 派生）、G5（outcome 只能由 `deriveOutcome()` 产生）
**严重级**：阻塞。假 DONE 的最短路径。

### 精确前置状态

一个只有 `GOAL_CREATED` 的 journal——没有判据、没有证据、没有 `GOAL_TERMINATED`。

```js
initTaskRoot(root);
appendEvent(root, d('GOAL_CREATED', {
  payload: { goal_id: 'g-000001', goal_summary: 'only one event in this journal' },
}));
```

伪造的 checkpoint。关键设计：**`source_cursor` 取自 `readTail(root)`，是真实游标**，因此 `verifyCursor` 无法识破。

```js
const tail = readTail(root);
const forged = {
  schema_version: 1,
  task_id: 'goal-b200000001',
  source_cursor: { segment: tail.segment, seq: tail.seq, event_hash: tail.eventHash },  // 真实
  phase: 'TERMINAL',
  outcome: { status: 'DONE', reason: null },        // <- 凭空宣布
  scope_version: 1,
  goal_summary: 'only one event in this journal',
  ledger_counts: { satisfied: 9, violated: 0, untested: 0, untestable: 0, moot: 0 },  // <- 凭空的 9
  active_step: null,
  next_action: null,
  pending_interruption: null,
  residual_count: 0,
  latest_manifest: null,
  updated_at: '2026-08-13T00:00:00.000Z',
};
```

### 调用序列

```js
writeCheckpoint(root, forged);
readCheckpoint(root);
verifyCursor(root, forged.source_cursor);
```

### 当前实测行为

```
writeCheckpoint ACCEPTED the forged TERMINAL/DONE checkpoint: 657 bytes
file on disk exists: 657 bytes
readCheckpoint().outcome = {"status":"DONE","reason":null}
verifyCursor(stored cursor) = {"valid":true,"reason":null}
journal actually contains 1 event(s): GOAL_CREATED
  -> no GOAL_TERMINATED, no CRITERION_DEFINED, no evidence.

for contrast, the reducer refuses to derive DONE from this journal:
  reduceCheckpoint -> phase=ALIGNING outcome=null next_action={"kind":"ALIGN","target":"goal","ref":null}
```

`writeCheckpoint` 只做两件事：`assertSchema` + `assertWithinBudget`。schema 允许 `phase: 'TERMINAL'` 与 `outcome.status: 'DONE'`（合法枚举值），657 字节远低于 2 KiB，于是通过。**reducer 侧的 I1 守卫（`lib/reducer.mjs:280-285`）完全被绕过，因为伪造者根本不调用 reducer。**

对比可见 reducer 本身是正确的：同一个 journal 经 `reduceCheckpoint` 得到 `ALIGNING` + `ALIGN` next_action。缺的是「持久化入口必须与 reducer 一致」这一条。

### 修复后应有行为

`writeCheckpoint` 必须拒绝任何不是当前 journal 派生结果的 checkpoint。推荐做法（按侵入性从小到大）：

1. **最小改动**：`writeCheckpoint(taskRoot, checkpoint)` 内部重新 `reduceCheckpoint(readAllEvents(taskRoot).events)`，比较 `canonicalHash`；不等则抛 `KernelError(INVARIANT_VIOLATED)`。代价是每次写 checkpoint 多一次全量 replay——对 2000 事件/段的规模可接受，且 `CHECKPOINT_REDUCED` 事件本就携带 hash 可用于短路。
2. **更强**：让 `reduceCheckpoint` 成为唯一能构造合法 checkpoint 对象的地方（返回带私有 brand 的对象），`writeCheckpoint` 拒绝任何无 brand 的入参。这同时关闭「未来某处手搓 checkpoint」的路径。
3. **必须一并覆盖的弱化点**：若只校验 `outcome`，攻击面会转移到 `ledger_counts`、`residual_count`、`phase`。比较整体 hash 才是收敛的。

注意不要引入回归：`tests/kernel-recovery.test.mjs:252` 与 `:270` 会**故意**写入游标失配的 checkpoint 与半截文件来验证恢复路径。前者若被新守卫拒绝，需要为这类测试提供显式的低层写入通道（例如把无校验的原始写入下沉为内部函数，测试直接用 `writeFileAtomic`），而不是放宽守卫。

### 验收断言

```js
test('writeCheckpoint refuses a checkpoint the journal does not derive (I1, G5)', () => {
  withTask((root) => {
    appendEvent(root, eventDraft('GOAL_CREATED', {
      payload: { goal_id: 'g-001abcd', goal_summary: 'one event only' },
    }));
    const tail = readTail(root);
    const forged = {
      schema_version: 1, task_id: TASK_ID,
      source_cursor: { segment: tail.segment, seq: tail.seq, event_hash: tail.eventHash },
      phase: 'TERMINAL', outcome: { status: 'DONE', reason: null },
      scope_version: 1, goal_summary: 'one event only',
      ledger_counts: { satisfied: 9, violated: 0, untested: 0, untestable: 0, moot: 0 },
      active_step: null, next_action: null, pending_interruption: null,
      residual_count: 0, latest_manifest: null, updated_at: FIXED_TIME,
    };
    assert.throws(() => writeCheckpoint(root, forged), (error) => {
      assert.equal(error.code, 'INVARIANT_VIOLATED');
      return true;
    });
    assert.equal(readCheckpoint(root), null, 'a rejected checkpoint must leave no file');
  });
});

test('writeCheckpoint accepts exactly what reduceCheckpoint produced', () => {
  withTask((root) => {
    appendAligned(root);
    const { checkpoint } = reduceCheckpoint(readAllEvents(root).events, { now: FIXED_TIME });
    assert.doesNotThrow(() => writeCheckpoint(root, checkpoint));  // 防止修复变成"一律拒绝"
  });
});
```

第二条 control 断言是必需的：没有它，一个无条件抛错的 `writeCheckpoint` 也能通过第一条。

---

## B3：`artifactIndex` 为空时跳过全部证据存在性检查，产出零阻塞理由的 DONE

**位置**：`lib/ledger.mjs:199-209`（`assessSatisfaction` 的 `if (artifactIndex.size === 0) break;`），经 `lib/reducer.mjs:265-276` 传导
**违反**：I5（SATISFIED 必须有存在的证据）
**严重级**：阻塞。这是唯一一条能一路走到 `GOAL_TERMINATED(DONE)` 且不留任何痕迹的假 DONE。

### 精确前置状态

`artifactIndex` 为空的构造路径很简单：**journal 中一个 `ARTIFACT_REGISTERED` 都没有**。`projectState`（`lib/reducer.mjs:114-123`）只在该事件类型上填充 `artifactIndex`，因此不追加它，索引就恒为空 `Map`。

同时判据引用了一个从不存在的 artifact：`EVIDENCE_RECORDED` 携带 `artifact_refs: ['a-NEVERREG']`。这一步不会被拦下——见 `vacuous-test-audit.md` 的 C06 条目：`appendEvent` 不向语义校验传 `knownArtifactIds`，故 `artifact_resolves` 检查被 `size > 0` 短路。

```js
initTaskRoot(root);
appendEvent(root, d('GOAL_CREATED',    { payload: { goal_id: 'g-000001', goal_summary: 'ghost evidence goal' } }));
appendEvent(root, d('GOAL_ALIGNED',    { actor: 'user', payload: { approved_by: 'decider:alice', residual: [] } }));
appendEvent(root, d('CRITERION_DEFINED', { payload: { criterion_id: 'c-000001', type: 'STATE', statement: 's', required_rung: 'E2', max_rung: 'E4' } }));
appendEvent(root, d('STEP_PLANNED',    { payload: { step_id: 's-000001', kind: 'VERIFY', completes_attainable_work: true } }));
// 关键：没有 ARTIFACT_REGISTERED
appendEvent(root, d('EVIDENCE_RECORDED', { actor: 'proxy', payload: { criterion_id: 'c-000001', rung: 'E2' }, artifact_refs: ['a-NEVERREG'] }));
appendEvent(root, d('CRITERION_UPDATED', { payload: { criterion_id: 'c-000001', state: 'SATISFIED', achieved_rung: 'E2' } }));
appendEvent(root, d('GOAL_TERMINATED',   { payload: { status: 'DONE', reason: null, residual: [] } }));
```

### 调用序列

```js
const events = readAllEvents(root).events;
projectState(events).artifactIndex;                       // 空 Map
assessSatisfaction(buildLedger(events).entries.get('c-000001'), { artifactIndex: new Map() });
reduceCheckpoint(events, { now: FIXED_TIME });
```

### 当前实测行为

```
artifactIndex.size = 0 (no ARTIFACT_REGISTERED was ever appended)
entry.evidence_refs = ["a-NEVERREG"]   <- this artifact does not exist
assessSatisfaction(entry, {artifactIndex: EMPTY})              = {"satisfiable":true,"reasons":[]}
assessSatisfaction(entry, {artifactIndex: NON-EMPTY unrelated}) = {"satisfiable":false,"reasons":["evidence a-NEVERREG is not registered"]}

reduceCheckpoint SEALED: {"status":"DONE","reason":null}
outcome.criteria[0].blocking_reasons = []
  -> DONE with zero blocking reasons on evidence that was never registered.
```

第二行是这个缺陷的本质：**同一个 entry，索引里随便放一个无关条目就能正确判为不满足；索引为空反而判为满足**。缺失得越彻底，越容易通过。

这也解释了为何 `tests/kernel-ledger.test.mjs:347` 与 `tests/outcome-derivation.test.mjs:287` 两条 I5 测试都通过：它们的 fixture 恒定提供非空 `artifactIndex`（`makeArtifactIndex([{artifact_id:'a-fixture01'}])` / `doneInput()`），从不走空索引路径。

### 修复后应有行为

`assessSatisfaction` 必须把「索引里查不到」一律判为不满足，与索引大小无关。

```js
// 修复方向
for (const artifactId of entry.evidence_refs) {
  const manifest = artifactIndex.get(artifactId);
  if (!manifest) {
    reasons.push(`evidence ${artifactId} is not registered`);
    continue;
  }
  if (manifest.truncated === true) {
    reasons.push(`evidence ${artifactId} is truncated and cannot prove completeness`);
  }
}
```

即删除 `if (artifactIndex.size === 0) break;` 这一行。删除后基线测试实测只有 2 项失败，且都是**期望值需要更新**而非新缺陷：

```
✖ evidence that is missing from the index is not satisfiable   (kernel-ledger)
✖ a criterion whose evidence vanished cannot reach DONE (I5)   (outcome-derivation)
```

（这两条在我的变异 M1 中失败，是因为我当时同时删掉了 `reasons.push`；只删 `size === 0` 那一行不会让它们失败。修复者应先只删该行跑一遍确认。）

**一并需要考虑**：`lib/semantic-validator.mjs` 的 `size === 0` / `size > 0` 短路共三处（第 186、416、437 行），机制完全相同。它们不属于 B3 的最小修复范围，但同源；建议同一次修复中一并收口，并让 `appendEvent` 从 journal 自行派生 `knownArtifactIds` 后传入语义校验，否则 C06 在写入路径仍然是空转（详见 `vacuous-test-audit.md`）。

### 验收断言

```js
test('an empty artifact index does not make ghost evidence satisfiable (I5)', () => {
  // The defect: the emptier the index, the easier the criterion. This is the
  // exact shape a task with no ARTIFACT_REGISTERED event produces.
  const entry = ledgerEntry('c-1aaaaaaa', { evidence_refs: ['a-ghost001'] });
  const { satisfiable, reasons } = assessSatisfaction(entry, { artifactIndex: new Map() });
  assert.equal(satisfiable, false);
  assert.ok(reasons.some((reason) => reason.includes('not registered')));
});

test('a journal with no ARTIFACT_REGISTERED cannot seal DONE (I5, I1)', () => {
  withTask((root) => {
    // ... the 6 appends above, without ARTIFACT_REGISTERED ...
    // The reducer's I1 guard must now refuse the DONE seal, because the ledger
    // derives PARTIAL once ghost evidence stops counting.
    assert.throws(() => reduceCheckpoint(readAllEvents(root).events, { now: FIXED_TIME }),
      /recorded DONE but the ledger derives/);
  });
});
```

第二条是端到端断言，比单测 `assessSatisfaction` 更有价值：它证明修复后 B3 的完整攻击链被 reducer 的 I1 守卫接住，而不只是某个函数返回值变了。

---

## 修复顺序建议

1. **B3 先做**：改动最小（删一行），且它是唯一能一路走到 DONE 的路径，风险最高。
2. **B2 次之**：需要决定校验策略，且要处理 `kernel-recovery.test.mjs` 里两处故意写坏 checkpoint 的测试。
3. **B1 最后**：涉及两个函数的语义决策（残留行策略），改动面最大，且需要新增至少 3 条崩溃形态的测试。

三者互不冲突：B3 在 `ledger.mjs`，B2 在 `journal.mjs` 的 checkpoint 段，B1 在 `journal.mjs` 的 segment 读写段。
