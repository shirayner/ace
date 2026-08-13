# auto-goal-v2 独立代码审查

> 审查者：独立审查 Agent（非实现者）
> 日期：2026-08-13
> 范围：`plugin/skills/auto-goal-v2/`（lib/ 13、protocols/runtime/ 11、scripts/ 3、schemas/、tests/）
> 设计真相源：`.ace/tasks/archive/2026-08-12-design-auto-goal-v2/artifacts/auto-goal-v2-design.md`
> 测试基线：`node scripts/run-tests.mjs auto-goal-v2` → 383 tests / 378 pass / 0 fail / 5 skipped（5 个 skip 均为 live 或 symlink 门控）

## 结论

**不可交付。** 数据内核（lib/）的纯函数质量高、终态推导确实是唯一 DONE 来源；但存在 5 个阻塞级缺陷：journal 在崩溃后**永久不可读**（与设计声称的"可恢复"相反）、`writeCheckpoint()` 是绕过 reducer 手写任意 DONE 的完整旁路、I5（证据必须存在）在 reducer 主路径上根本没有生效、worker stdout 多字节分片被破坏、且 `scripts/`（调度面）与 `lib/`（控制面）从未互相 import——设计 §8.2 要求的"落盘→校验→追加事件→返回 envelope"顺序在代码里只实现了前一半，没有任何代码把 worker 结果写进 journal。

---

## 阻塞级问题

### B1. 崩溃后 journal 永久不可读，且下一次 append 会把损坏固化

**位置**：`lib/journal.mjs:120-147`（`readSegment`）、`lib/journal.mjs:349-358`（`appendLine`）

`readSegment` 只在**最后一行**没有 `\n` 时把它当作"崩溃残留"丢弃（第 129-130 行）。但 `appendLine` 用 `openSync(filePath,'a')` 追加，不会先补断行。所以崩溃残留的半行在下一次 append 后不再是最后一行，变成一条被"熔接"的中间行，进入第 133-144 行的 `JSON.parse` 分支，**抛 KernelError**。

失效场景（已实测复现）：

```
输入：journal 含 2 条正常事件；进程在第 3 条 append 的 write 中途崩溃，
      留下残留 '{"schema_version":1,"seq":3,"partial'（无 \n）
步骤1：readSegment → droppedPartialLine=true，2 条事件，正常（符合设计 §9.2）
步骤2：恢复流程调用 appendEvent 追加下一条事实事件
错误结果：appendEvent 内部 readTail → readSegment 抛
      KernelError: Segment 1 line 3 is not valid JSON
      磁盘上第 2 行变成 '{"partial{"actor":"controller",...}'（残留与新事件熔接）
      此后 readAllEvents / verifyJournal / readTail / reduceCheckpoint
      全部永久抛错——journal 无法读、无法追加、无法重建 checkpoint。
```

这直接推翻设计 §9.2「若 event 已追加但 checkpoint 未更新，恢复时从 cursor 重放 reducer」和 §9.5 步骤 3「由 sealed segments + active segment 运行 reducer 重建」：重建路径本身抛异常。J01 场景（`event 写入后 checkpoint 前崩溃 → 恢复重放 reducer`）在测试里只验证了"崩溃后立即读"（`tests/journal-append.test.mjs:245-247`），没有验证"崩溃后继续写"，所以测试全绿。

修复方向：`appendLine` 在 open 后先 stat/读尾字节，若文件非空且不以 `\n` 结尾，先截断到最后一个 `\n`（或补写 `\n` 使残留成为独立坏行并被显式隔离），再追加。

### B2. `writeCheckpoint()` 是手写任意终态（含 DONE）的完整旁路，I1 未被机械强制

**位置**：`lib/journal.mjs:451-460`

设计 I1「outcome == DONE 只能来自 derive-outcome」和 SKILL.md G5 都把这条列为硬门禁。但 `writeCheckpoint` 只做两件事：`assertSchema` + 2 KiB 预算。它**不检查 checkpoint 是否由 reducer 产生**、不校验 `source_cursor` 是否与 journal 一致、不重算 outcome。而 `checkpoint.schema.json:49` 的 outcome.status 枚举本身就允许 `DONE`。

失效场景（已实测复现）：

```
输入：一个只有 GOAL_CREATED（goal_summary='nothing was actually verified'）
      的 journal，零 criteria、零 evidence
构造：手写 checkpoint 对象 {phase:'TERMINAL', outcome:{status:'DONE',reason:null},
      ledger_counts:{satisfied:9,...}, next_action:null, ...}
      source_cursor 填真实的最后一条事件（因此 verifyCursor 返回 valid:true）
调用：writeCheckpoint(root, forged)
错误结果：ACCEPTED，写入 638 bytes；readCheckpoint(root).outcome === {status:'DONE'}
      verifyCursor 也报 valid:true，因为 cursor 指向的确是真事件——
      cursor 校验证明不了 outcome 是派生的。
```

`reduceCheckpoint` 内部的 I1 防线（`lib/reducer.mjs:280-285`，比对 GOAL_TERMINATED 与派生结果）是真实有效的（已实测：DONE seal 会被拒），但它只在**走 reducer 时**生效。`writeCheckpoint` 作为公开导出且是唯一的落盘入口，绕开了它。主 Agent 只读 `checkpoint.json`，所以伪造的 DONE 会被直接消费。

修复方向：`writeCheckpoint` 只接受 `reduceCheckpoint()` 的返回结构（携带 hash/来源标记），或在写入前用 journal 重算一次并比对 outcome + cursor hash。

### B3. I5 在 reducer 主路径上未生效：不存在的 evidence 仍可推出 DONE

**位置**：`lib/ledger.mjs:199-209`（`assessSatisfaction`）、`lib/reducer.mjs:265-276`

`assessSatisfaction` 用 `if (artifactIndex.size === 0) break;`（第 200 行）在索引为空时**跳过整个 evidence 存在性检查**。而 `reducer.mjs` 传入的 `artifactIndex` 来自 `projectState` 的 `state.artifactIndex`，只由 `ARTIFACT_REGISTERED` 事件填充（`reducer.mjs:114-121`）。一条从未注册任何 artifact 的 journal ⇒ 索引为空 ⇒ 所有 evidence_ref 一律视为有效。

失效场景（已实测复现）：

```
输入：journal = GOAL_CREATED, GOAL_ALIGNED(approved_by),
      CRITERION_DEFINED(c-1, STATE, required E2),
      EVIDENCE_RECORDED(c-1, rung E2, artifact_refs:['a-NEVER-REGISTERED']),
      CRITERION_UPDATED(c-1, SATISFIED),
      GOAL_TERMINATED(DONE)
      —— 全程零 ARTIFACT_REGISTERED
调用：reduceCheckpoint(events)
错误结果：checkpoint.outcome = {status:'DONE', reason:null}
      criteria 投影里 blocking_reasons: [] ——一个纯凭空引用的 artifact id
      被当成合格证据，DONE 成立。
```

同一个 `size === 0` 短路在 `semantic-validator.mjs:186`、`:416`、`:437` 重复出现三次，所以 event 追加期的 `artifact_resolves` 检查在同样条件下也一并失效——即"任务开头的所有事件都免检"。

`tests/outcome-derivation.test.mjs:322` 那条 `a criterion whose evidence vanished cannot reach DONE (I5)` 之所以通过，是因为它的 fixture **显式传入了非空 artifactIndex**。它验证的是"索引非空时能发现幽灵引用"，恰好回避了索引为空这个真实的默认路径。

修复方向：把"索引为空"与"引用不存在"区分开——空索引应意味着**没有任何 artifact 存在**，因此任何非空 evidence_refs 都必须失败；或改为显式 `strict` 开关，且 reducer 侧固定为 strict。

### B4. worker stdout 在多字节字符边界被破坏，原文 artifact 与 sha256 都是错的

**位置**：`scripts/dispatch-worker.mjs:105-106`

`stdout += chunk` 对 Buffer 做隐式 `toString()`，即**每个 chunk 独立按 UTF-8 解码**。管道分片边界不保证落在 codepoint 边界上，跨分片的多字节字符会各自解成 U+FFFD。

失效场景（已实测复现同一表达式）：

```
输入：worker 输出含中文，'需求理解与澄清'（21 bytes），
      管道在第 4 字节处分片（'需'完整，'求'被拆成 2+1）
错误结果：累积得到 '需<FFFD><FFFD><FFFD>理解与澄清'
      写入 raw artifact 的是被污染的文本；
      audit.raw_bytes = 27（真实 21）；raw_sha256 是污染后内容的摘要。
```

三重后果：(1) 设计 §8.2 要求"原始输出先落盘保留诊断证据"——落盘的已不是原文；(2) 若污染落在 JSON 结构字符附近，`JSON.parse` 失败会被误报成 `cli_output_unparseable`（worker 其实输出了合法 JSON）；(3) sha256 是污染内容的摘要，`verifyManifest` 的 digest 校验会与真实产出永久不符。本项目面向中文场景，触发概率不低。

修复方向：收集 `Buffer` 数组，`Buffer.concat` 后一次性 `toString('utf8')`；或对 stream 设 `setEncoding('utf8')`（Node 的 StringDecoder 会跨 chunk 保留残字节）。

顺带：该 `stdout` 累积**无任何字节上限**（对比设计 §7.5 的 8 MiB artifact 硬限与"流式截断"要求）。一个失控 worker 的 10 MiB 输出会全量进入 Node 堆——C04 场景要求的"流式受控落盘"并未实现，只是"全量缓存后落盘"。

### B5. `scripts/`（调度面）与 `lib/`（控制面）从未连接，§8.2 的摄入前流水线只实现了一半

**位置**：`scripts/dispatch-worker.mjs:14-20`（只 import 同目录两个模块）、`lib/journal.mjs:271`（`appendEvent` 唯一的非测试调用者是 `lib/journal.mjs:420` 自己的 `rollSegment`）

实测：`lib/`、`protocols/`、`schemas/` 中**没有任何文件** import `scripts/`；`scripts/` 中**没有任何文件** import `lib/`。全仓库不存在 CLI 入口（无 `process.argv`、无 `import.meta.main`、无 shebang）。

设计 §8.2 规定固定不可交换的顺序：

```
CAPTURE → RAW WRITE → HASH + MANIFEST → PARSE → SCHEMA → SEMANTIC
→ PATH+EVIDENCE → BYTE → NORMALIZE → APPEND ACCEPTED/REJECTED EVENT → RETURN ≤1 KiB
```

`dispatchWorker` 实现了 CAPTURE → RAW WRITE → HASH → PARSE → 状态枚举 → NORMALIZE → RETURN。缺失的每一环都是承重的：

- **MANIFEST**：`registerManifest`/`verifyManifest`（`lib/artifacts.mjs`）从未被调用。raw artifact 直接写到 `artifacts/raw/`，不进 manifest 索引、不进 `artifactIndex`。这与 B3 复合：worker 产出的证据永远不会被注册，于是 `artifactIndex` 永远为空，于是证据存在性检查永远被短路。
- **SEMANTIC VALIDATE**：`validateWorkerOutput`（`semantic-validator.mjs:369`）从未被非测试代码调用。dispatch id 匹配、role 有权产生该 claim、stale scope、claim 必须有 evidence——设计 §8.2 明确列举的这批检查在真实调度路径上全部不执行。dispatch-worker 只检查了 `status` 枚举（第 178-191 行）。
- **APPEND EVENT**：没有任何代码追加 `WORKER_DISPATCHED`、`DISPATCH_REJECTED`、`WORKER_RESULT_ACCEPTED/REJECTED`、`ARTIFACT_REGISTERED`。`ingest-audit.mjs:52` 的注释写"Returns a DISPATCH_REJECTED envelope **so the caller can append it to the journal**"——那个 caller 不存在。

失效场景：

```
输入：主 Agent 按 SKILL.md 控制循环执行一个短步，
      调用 dispatchWorker 得到 envelope{status:'SUCCEEDED', claims:[...]}
错误结果：journal 里没有任何该次调度的痕迹（无 WORKER_DISPATCHED、
      无 WORKER_RESULT_ACCEPTED、无 ARTIFACT_REGISTERED）；
      随后 reduceCheckpoint 看到的 openDispatches 为空、artifactIndex 为空、
      activeStep 状态不推进 → deriveNextAction 恒定返回
      {kind:'PLAN',target:'next_step'}（reducer.mjs:211）。
      控制循环无法前进：worker 干了活，控制面认为什么都没发生。
```

即 I11（DISPATCH_REJECTED 不得产生 WORKER_DISPATCHED）、I3（worker 不可写控制面）目前是**空真**——没有任何路径写这些事件，所以也没什么可违反。设计 §15 的 Phase 1（纯数据内核）与 Phase 2（Proxy 与隔离调度）各自完成了，但两者之间的接线是缺失的一环，而不变量恰好活在接线处。

---

## 非阻塞问题

### N1. I2（scope_version 只能经批准的 SCOPE_CHANGED 递增）默认不生效

`lib/journal.mjs:314-319` 把 `currentScopeVersion` 放在可选的 `semanticContext` 里；`semantic-validator.mjs:194` 是 `if (currentScopeVersion !== undefined)`。由于 `appendEvent` 没有任何非测试调用者传它，实测可以直接追加 `scope_version: 7` 而无任何 SCOPE_CHANGED：

```
输入：GOAL_CREATED(sv=1) 后追加 CRITERION_DEFINED(sv=7)
结果：ACCEPTED，scope_version 跳到 7，无 approved_by、无 SCOPE_CHANGED
```

检查逻辑本身写得正确（`:196-216` 的 scope_monotonic / scope_approved / scope_stable 三条都对），问题在于它是**opt-in 而非默认**。降级为非阻塞是因为 B5 未接线时这条路径尚无生产调用者；接线时必须让 `appendEvent` 自己从 journal 推导 `currentScopeVersion`，而不是等调用者传。

### N2. I12 只挡"更旧"的 scope，同 version 的迟到结果不挡

`lib/ledger.mjs:124` 与 `:150` 用 `event.scope_version < currentScopeVersion` 判定 stale，而 `currentScopeVersion` 是**折叠到当前事件时**的值。因此事件顺序决定结果：证据先记、SCOPE_CHANGED 后到时，该证据不被视为 stale（实测 `buildLedger` 保留 `state=SATISFIED, achieved=E2`，entry.scope_version=1 而 ledger.scopeVersion=2）。

不判为阻塞级：这是设计 §9.4 的正确语义（"dispatch 捕获 scope_version，接收时执行乐观并发检查"——检查发生在接收时，历史事实不追溯失效），且实测终态确实降级为 PARTIAL（`outcome.mjs:160` 的 `scopeVersion > originalScopeVersion` 兜住了），DONE seal 会被 `reducer.mjs:280` 拒绝。但 `inScopeEntries`（`ledger.mjs:254`）名字承诺"当前 scope 版本的 in-scope 条目"，实际完全不看 `entry.scope_version`——命名与行为不一致，且注释（`ledger.mjs:45-46`）说"reducer 会比对每个 entry 的 scope_version"，而 reducer 里并没有这段比对。属于知识表达不一致，易在后续修改中被误信。

### N3. `state.consecutiveRejections` 是死状态，§8.3 的"连续两次拒绝禁止自动重试"未实现

`lib/reducer.mjs:48/100/111/174-177` 维护了 `consecutiveRejections`，但 `deriveNextAction`（`:185-222`）从不读它，checkpoint 也不含该字段。设计 §8.3「同一 dispatch 因相同原因连续拒绝两次后，禁止自动重试，转 BLOCKED 或请求方向决策」因此没有任何强制点。同时 `bumpRejection` 用 `${dispatchId}:${code}` 做 key，而 `WORKER_RESULT_ACCEPTED` 分支（`:105`）删的是 `state.consecutiveRejections.delete(event.payload.dispatch_id)`——不带 `:code` 后缀，**永远删不掉任何键**。测试 `kernel-reducer.test.mjs:455` 只断言计数递增到 1，没有断言清零，所以这个键不匹配的 bug 未被发现。

### N4. `isMainAgentIngestible`（I4）只有测试调用者

`semantic-validator.mjs:539` 的 I4 守卫函数，非测试代码零调用。I4 目前完全靠 SKILL.md 的散文约束主 Agent 行为，没有机械阻断——设计 §17 把它列为"可机械检查的不变量"。X03（主 Agent 尝试直接读 raw artifact → 协议测试失败）没有对应实现。

### N5. `sleepSync` 忙等会阻塞事件循环

`lib/journal.mjs:252-258` 用 `while (Date.now() < until) {}` 自旋，最长 5 秒（`LOCK_TIMEOUT_MS`）。注释解释为"锁只持有一次小 append，所以很短"，但锁竞争者恰恰是在**别人持锁时**自旋，此时整个 Node 进程（含任何在途 async worker 的 I/O 回调）被完全冻结。`Atomics.wait` 在主线程受限，但 `execSync('sleep')` 或把 append 改为 async 都可行。Windows/Unix 行为一致，但对同时管理 async `dispatchWorker` 的控制器影响不小。

### N6. 陈旧锁清理有竞态

`lib/journal.mjs:226-230`：判定 `age > LOCK_STALE_MS` 后 `rmSync` 再 `continue`。两个进程可同时判定陈旧、同时删除、同时创建成功（第二个删掉的是第一个刚建的锁）。设计 §9.4 要求"两个 writer 同 seq 竞争 → 只有一个成功"。缓解项是 `expectedSeq/expectedEventHash` 乐观检查，但那是可选参数，且同样没有生产调用者传入。J04 测试验证的是乐观检查逻辑，不是锁的互斥性。

### N7. 命名与目录偏离设计 §5，且两处 `deriveRequiredRung` 名称冲突

设计 §5 列的脚本名是 `dispatch.mjs / proxy.mjs / validate-schema.mjs / append-event.mjs / reduce-checkpoint.mjs / derive-outcome.mjs / rotate-journal.mjs`，实现是 `scripts/{backend-resolve,dispatch-worker,ingest-audit}.mjs` + `lib/*.mjs`。改名本身可接受（且 SKILL.md G5 已同步指向 `lib/outcome.mjs`），但 `protocols/control-loop.md` 与 SKILL.md 引用的是函数名而非文件名，形成两套命名口径。

另外 `lib/vocabulary.mjs:269` 与 `protocols/runtime/risk.mjs:124` 都导出 `deriveRequiredRung`，签名不同（前者 `(type, risk)`，后者 `({type, risk, maxRung})`），返回结构也不同（`attainable` vs `untestable`、`raisedBy` vs `escalations`）。前者是后者的适配器（注释已说明意图），但同名不同签名在同一 skill 内是 surprise 源。

### N8. `RISK_DIMENSIONS` 与三份 rung 表在两处重复定义

`lib/vocabulary.mjs:114-120` 与 `protocols/runtime/risk.mjs:18-24` 各定义一份 `RISK_DIMENSIONS`；`RUNG_BASELINE`/`RUNG_CEILING`（`vocabulary.mjs:92-111`）与 `protocols/runtime/evidence.mjs` 的 criterion 描述符也是两份。`vocabulary.mjs:11` 注释说"由 kernel 测试钉住"（`tests/kernel-layer-consistency.test.mjs` 确实在钉），但这是用测试补偿 DRY 违反，而非消除它——知识仍表达了两次。

### N9. `lib/artifacts.mjs` → `lib/journal.mjs` 的依赖只为一个工具函数

`artifacts.mjs:23` import `writeFileAtomic`，使 artifact 层依赖 journal 层。`writeFileAtomic` 是纯文件工具（`journal.mjs:436`），与 journal 语义无关，放在 journal 里让分层图多了一条不必要的边。

### N10. `appendIndexEntry` 是 O(n²) 全量重写

`lib/artifacts.mjs:117-118`：每登记一个 artifact，读入整个 `manifests/index.jsonl` 再整体 `writeFileAtomic` 重写。设计只要求索引"分段存储"，追加即可。长任务下每次登记的成本随已有条目线性增长。同时该函数不持锁——与 journal 的单写者约定不一致（设计 §4.3 把 manifest 与 journal 并列为"只有控制面脚本可写"）。

### N11. `schema-validator.mjs` 的 `anyOf` 不合并子句冲突

`schema-validator.mjs:170-177`：`anyOf` 分支独立求值，只看是否有一支通过。但 `anyOf` 与同级 `type`/`required` 同时出现时，同级关键字已在前面独立报过错，`anyOf` 通过也不会撤销——语义正确，只是错误信息会同时列出"anyOf 全不匹配"与具体子句错误，诊断噪声较大。可接受，记录待观察。

### N12. `dispatch-worker.mjs` 的 `safeRelativePath` 与 `lib/paths.mjs` 重复实现

`scripts/dispatch-worker.mjs:31-45` 自己实现了一遍路径遏制，而 `lib/paths.mjs:22-59` 已有 `isSafeRelativePath`/`resolveWithinRoot`，且后者更严（拒 `\0`、拒反斜杠、拒 `path.win32.isAbsolute`）。前者用 `/^[a-zA-Z]:/` 挡盘符、`rel.startsWith('..')` 挡逃逸——`startsWith('..')` 会把合法的 `..foo` 目录名误判为逃逸（弱化的假阳性，非安全洞）；但反斜杠形式 `..\\outside` 在 POSIX 上不会被 `normalize` 处理成父目录，实测在 Windows 上被 `resolve` 正确挡住。两份实现的差异是 B5 未接线的直接产物。

### N13. 术语与语言混杂

`protocols/runtime/*.mjs` 的 `blockers[].detail`/`fix` 是中文（面向用户，合理），但 `lib/*.mjs` 的 violation message 全英文（`semantic-validator.mjs` 通篇）。两者都可能出现在同一份呈现给用户的 blocker 列表里。

---

## 验证通过项

### 1. 内聚性 —— **通过**（I10 成立）

- 全量扫描非测试 `.mjs` 的 import 清单：只有 `./`、`../schemas/`、`../protocols/runtime/` 三种相对形式，以及 `node:fs|path|crypto|url|child_process|fs/promises`。零第三方依赖、零 bare specifier（`grep "^import .* from '[^n.]"` 无输出）。
- `grep -rn "shared/|auto-goal/|ace goal"` 在非测试代码里零命中；仅命中 SKILL.md:125 的禁令文本、`approval.mjs:121` 的注释词组"private → shared/public"，以及 cohesion 测试自身的黑名单常量（`tests/kernel-cohesion.test.mjs:118-123`、`tests/control-cohesion.test.mjs:101-103`）。
- 唯一跨层引用 `lib/vocabulary.mjs:14 → ../protocols/runtime/risk.mjs`，仍在目录树内，且有注释说明为何 risk→evidence 策略归 runtime 所有。
- 目录树内的跨目录 import 只有 `lib/ → ../schemas/registry.mjs`，属设计 §5 允许的内部相对引用。
- A01/A02 由 `tests/kernel-cohesion.test.mjs` + `tests/control-cohesion.test.mjs` 覆盖且通过。

### 2. clean-context 硬阻塞 —— **通过**

- `resolveBackend()` 返回 null 时，`dispatch-worker.mjs:69-81` 立即返回 `{code:'DISPATCH_REJECTED', reason:'no_clean_context_backend'}`，`audit.launched=false`，**函数内此后无任何 spawn 路径**（唯一 `spawn` 在第 95 行，位于该 early return 之后）。无 fallback、无软降级分支。
- shim 处理是真防线而非注释：`backend-resolve.mjs:61-65`，`.cmd/.bat/.ps1` 只能作为指向 native sibling 的指针；找不到 sibling 就 `continue`（不接受）。`shell: false` 在第 98 行硬编码，注释说明 objective 文本不可信。
- `assertIsolatedArgs`（`:147-158`）双向检查：8 个 FORBIDDEN_ARGS 任一出现即抛，且 `--bare/--no-session-persistence/--tools` 三个必需项缺一即抛。在 `dispatch-worker.mjs:91` 于 spawn 前调用。
- `cleanEnv`（`:88-100`）剥离 6 个变量，`tests/backend-isolation.test.mjs:45-69` 逐个断言未泄漏且保留 `ANTHROPIC_API_KEY`。
- 实测 `resolveBackend({PATH:'', ACE_CLAUDE_BIN:'<missing>.cmd'})` 返回 null（`tests/backend-isolation.test.mjs:77-80`）。

### 3. 摄入前预算 —— **spawn 前门禁通过；envelope 投影通过；但原文全量入堆（见 B4 附注）**

- 顺序确实正确：`dispatch-worker.mjs:83-88` 的 `checkLaunchBudget` 在第 95 行 `spawn` **之前**，`!gate.ok` 直接 return 且 `audit.launched=false`。`tests/backend-isolation.test.mjs:162-177` 断言了 16 KiB+1 的 objective 不 launch 且**不创建 artifacts/raw 目录**（证明连落盘都没发生）。
- 预算按真实 UTF-8 字节：`ingest-audit.mjs:37-44` 用 `Buffer.byteLength(...,'utf8')`；`tests/backend-isolation.test.mjs:107-110` 用 `'需求'`→6 bytes 钉住。
- `projectEnvelope`（`ingest-audit.mjs:77-109`）逐级降级：先 clamp summary 到 400 字节（第 80 行在 400 字节处切并剥掉尾部 U+FFFD，实测不产生坏 UTF-8）、claims 截 3、refs 截 4；仍超限则依次清空 claims、清空 refs；最后退化为 `code + pointer only`——**从不字符串截断 JSON**，设计 §8.3 的要求被逐条实现。
- 大输出确实只留 pointer：`dispatchWorker` 的返回值里 raw 文本不可达，只有 `audit.raw_artifact` 相对路径。`tests/backend-isolation.test.mjs:112-127` 用 50000 字节 summary + 40 claims + 30 refs 验证 envelope ≤1 KiB 且仍可 `JSON.parse`。
- `ingestedTokens`（`:18-31`）正确把 `cache_read_input_tokens` 计入——这是 spike 里"resume 看起来比 seed 小"的陷阱，测试用真实数字（228+2304 vs 196+256）钉住，并额外断言朴素指标会给出反向结论。这条是我认为质量最高的一处设计。

### 4. 单写者与纯函数 —— **journal append-only 通过；reducer 纯性通过；checkpoint 派生性失败（B2）**

- append-only：`appendLine`（`journal.mjs:349-358`）只用 `openSync(...,'a')` + `fsyncSync`；全文件无 `'w'` 模式写 segment 的路径（`writeFileSync(newSegmentPath,'')` 在 `:415` 仅用于创建空文件，且有 `existsSync` 保护）。
- 单写者：`validateEventSemantics`（`semantic-validator.mjs:173-177`）硬拒 `actor.startsWith('worker:')`，且该检查在 `appendEvent` 内**无条件**执行（`journal.mjs:314-320`，不依赖可选 context）。I3 在此点上是真强制。
- 哈希链：`sealEvent`/`verifyChain`（`canonical.mjs:122-188`）检查 prev 链接、自哈希、seq 严格递增三项，跨 segment 通过 seal 延续（`journal.mjs:176-186` 空段回退读上一段 seal）。
- `canonicalize` 严格拒绝 `undefined/NaN/Infinity/function/bigint/symbol/循环引用/非 plain object`（`canonical.mjs:33-76`），排序键保证跨进程同摘要——比 `JSON.stringify` 严，方向正确。
- `lib/reducer.mjs` 纯性：全文件零 `node:fs` import（唯一 IO 相关 import 是 `schemas/registry.mjs`，其读文件发生在模块加载期而非调用期）。`projectState`/`deriveNextAction`/`reduceCheckpoint` 无隐藏可变状态；`options.now` 提供了时间注入以保证确定性。`tests/outcome-derivation.test.mjs` 有专门的"同输入同结论"与"不修改传入 ledger/residual"两条断言，均通过。
- `deriveOutcome` 纯性更强：`lib/outcome.mjs` 只 import `./ledger.mjs`，零 IO。
- checkpoint 原子性：`writeFileAtomic`（`journal.mjs:436-448`）temp + fsync + rename；`cleanStaleTempFiles`（`:477-489`）清残留；`readCheckpoint`（`:466-474`）对损坏文件返回 null 而不抛，让恢复走 journal 重建——J02 语义正确。
- **但**"checkpoint 总是派生而非手写"不成立，见 B2。

### 5. 终态推导 —— **deriveOutcome 是唯一 DONE 产地且顺序正确；I8 通过；I15 部分通过**

- `grep "'DONE'"` 全量：仅 `outcome.mjs:176` 一处**构造**终态 DONE。其余命中都不是终态构造——`vocabulary.mjs:50`/`state-machine.mjs:27,30`/`checkpoint.schema.json:49` 是枚举清单，`goal-shape.mjs:176`/`mandate.mjs:143` 是 `maxOutcome`（规划期的"最好情况上限"提示，不写 checkpoint、不产生 outcome 对象）。
- 仲裁顺序与设计 §11.2 逐条对应（`outcome.mjs:83-192`）：constraint → incoherent → NEEDS_INPUT → FALSIFIED → attainable 未完 → stillTestable → unreachable → scope/residual → DONE → INVARIANT_VIOLATED 兜底。
- 关键正确决策：第 133 行的 `unsatisfied` 用 `assessment.satisfiable` 而**不信** `entry.state` 标签——一条被 `CRITERION_UPDATED` 标成 SATISFIED 但证据不足的判据会被当成短板处理。实测覆盖：`tests/outcome-derivation.test.mjs` 的 "a criterion marked SATISFIED on inadequate evidence cannot reach DONE" 与 "...by the Agent as acceptor... (I9)" 均通过。
- `allSatisfied` 要求 `assessed.length > 0`（第 172 行）——空台账不能真空 DONE，有专门测试。
- O06 防线：`hasExhaustedEvidence`（`ledger.mjs:233-235`）把 UNVERIFIABLE 与 UNTESTED 分开，`stillTestable` 优先返回 PARTIAL；测试 "an untested criterion with verification still available is not UNVERIFIABLE" 通过。
- I8：`reduceCheckpoint:253-261` 双向强制——非终态无 next_action 抛 `ReducerError`，终态有 next_action 也抛。`deriveNextAction` 是有序 if 链，结构上保证至多一个返回。
- I1 在 reducer 路径上是真的：`reducer.mjs:280-285` 比对 GOAL_TERMINATED 记录值与派生值，实测 DONE seal 在 ledger 只支持 PARTIAL 时被拒（错误信息："GOAL_TERMINATED recorded DONE but the ledger derives PARTIAL"）。这是一条设计里没明写、实现补上的好防线。
- I15：`outcome()`（`:207-218`）无条件展开 `base`（含 `residual`），所有终态必带 residual 字段；`missingTerminalFields`（`:229-242`）按状态检查必填项。`semantic-validator.mjs:327-331` 额外要求 GOAL_TERMINATED 的 payload.residual 存在（即使为空）。测试 "every outcome carries residual, even when empty (I15)" 通过。**扣分点**：`missingTerminalFields` 只有测试调用者，reduceCheckpoint 不调它——I15 在 seal 路径上靠 semantic validator 的 payload 检查兜（那条是真强制），但 outcome 对象自身的必填项无运行时门禁（见 N4 同类问题）。

### 6. 路径与注入安全 —— **通过**（除 N12 的重复实现）

- `lib/paths.mjs:22-29` 的 `isSafeRelativePath` 拒：非字符串/空串、`\0`、任何反斜杠、POSIX 与 win32 两种绝对路径、`^[A-Za-z]:` 盘符、任何 `..` 路径段。
- `isInside`（`:101-106`）按**路径段**比较，注释明确指出这防的是 `/root-evil` 被误判为 `/root` 内部——这是字符串前缀比较的经典漏洞，此处避开了。
- 符号链接是真校验而非字符串检查：`resolveRealPathWithinRoot`（`:65-95`）对 root 与 target 双向 `realpathSync` 后再 `isInside`，且**目标不存在本身即拒绝**。`verifyManifest`（`artifacts.mjs:63`）走的是这个 real-path 版本。C07 有测试且在支持 symlink 的平台上真实执行（不支持时 `t.skip` 并说明原因，不假装跑过 —— `kernel-artifacts.test.mjs:141-143`）。
- manifest digest 防伪造：`verifyManifest`（`artifacts.mjs:50-94`）重新 `readFileSync` + `sha256Bytes` 实算，交给 `validateArtifactManifest`（`semantic-validator.mjs:480-493`）比对 sha256 **与** bytes 两项；伪造 digest 无法通过，因为比较基准来自磁盘而非 manifest 自述。truncated 一致性双向检查（`:495-511`）：声明 truncated 则 original_bytes 必须 > bytes，未声明则必须相等——两边都堵，无法用"谎报未截断"绕过。
- 8 MiB artifact 硬限在 hash 前检查（`artifacts.mjs:70-77`），避免为超限文件先读满内存。
- `artifactObjectPath`（`paths.mjs:109-119`）对 sha256 与扩展名都用白名单正则，实测 `artifactObjectPath(digest,'../../etc')` 抛 `PathEscapeError`。
- `verifyArtifactIntegrity`（`artifacts.mjs:143-170`）在恢复期逐个重算摘要，按 artifact 分别报告 valid/invalid 而非整体 pass/fail——设计 §9.5 步骤 4 的"缺失则标为证据失效"语义正确。
- schema 层与文件系统层双防：`common.schema.json` 的 `relativePath` 片段 + `isSafeRelativePath` + `realpathSync`，`paths.mjs:1-7` 的注释准确描述了为何两层都必要。

### 7. 测试质量 —— **总体验真实行为，无 mock 同义反复；但有三处覆盖假象**

真实性证据：

- 无任何 mocking 框架、无 stub、无 `mock.fn`（全量 grep 无命中）。所有 IO 测试用 `mkdtemp` 建真实临时目录、写真实文件、读真实内容。
- 崩溃场景不用杀进程而是**写出崩溃会留下的确切磁盘状态**（`journal-append.test.mjs:1-6` 注释说明），确定性且可复现——方法论正确。
- X02-X05 没有被离线单测冒充：`capability-live.test.mjs:22-23` 用 `ACE_LIVE_SPIKE` 门控，未设时 `skip` 并给出明确提示字符串，5 个 skip 全部诚实上报（不是静默 pass）。离线的 `backend-isolation.test.mjs` 只断言它**能**离线断言的部分（argv 组装、env 剥离、字节门、路径遏制、投影），把"worker 真的看不到会话历史"和"真实大输出只走磁盘"留给 live 测试。`capability-live.test.mjs:57-73` 的 ingestion floor 断言用实测双区间（隔离 170-530 vs 继承 >2400）取 1500 作阈值并说明留白理由——这是有判别力的断言，不是同义反复。
- `resolveBackend()` 在无 backend 环境返回 null 时测试 `return` 跳过而非假通过（`backend-isolation.test.mjs:73`）。
- 反例导向：多条测试专门验证"错误的做法会被拒"，如 "a rejected result must not carry a plausible summary"（`capability-live.test.mjs:110`）、"the naive metric inverts the comparison, which is exactly why we do not use it"（`:88-90`）。

覆盖假象（每条都对应上文一个真实缺陷）：

- `outcome-derivation.test.mjs:322` 的 I5 测试传入非空 artifactIndex，掩盖了 B3 的空索引短路——测试通过而不变量在生产路径失效。
- `journal-append.test.mjs:245-247` 的崩溃测试只验证"崩溃后读"，未验证"崩溃后继续 append"，掩盖 B1。J01 场景要求的是"恢复重放 reducer，next action 唯一"，而恢复必然包含继续写。
- `kernel-reducer.test.mjs:455` 只断言拒绝计数递增到 1，未断言接受后清零，掩盖 N3 的 key 不匹配 bug。

另：验收矩阵中 C01/C02/C03/C04/C05/C06/C07/C08、J01-J04、E01-E05、O01-O06、R01-R03、U01-U04、X01 都能在测试名里定位到对应断言（测试命名带场景 ID，是好实践）；X02 在离线侧只覆盖 argv 断言，X03/X04/X05 无实现对应物（见 N4、B5）。

---

## 未能核查项

1. **X02-X05 的 live 行为**（worker 真实无会话历史、真实大输出只落盘、恢复实际摄入 ≤4 KiB）：按任务约束未设 `ACE_LIVE_SPIKE`，未花费真实 token。这些是设计 §16.1 明确要求"必须从真实 transcript 统计"的项，也是 §18 第 2 条未决问题的核心。审查只能确认**测试代码的断言设计是合理的**，不能确认断言实际通过。设计 §19 的结论句"在 clean-context backend 和摄入前 Proxy 通过实测前，不应声明架构已落地"仍然成立。

2. **Skill 激活的真实注入字节**：`SKILL.md` 静态 4.4 KB（≤6 KiB 预算），但设计 §16.1 要求 transcript 实测而非文件大小。本次未做 transcript 测量。

3. **Node 18 兼容性**：`package.json` 声明 `node >= 18`，本机 v24.13.0。逐项静态核查未发现 18 不支持的 API（`Array.prototype.at` 18+、`structuredClone` 未使用、`node:test` 18.13+ 的 `t.skip` 已用、`Buffer.subarray` 一直有）；但**未在 Node 18 实机运行测试套件**，无法排除 `node:test` 行为差异（例如 18 早期版本的 test skip 报告格式）。

4. **Windows/Unix 锁互斥的实际竞态**：N6 是通过代码路径推导的（判定陈旧→删除→重建之间无原子性），未构造真实双进程并发实验证实。`openSync(...,'wx')` 本身的原子性在两平台都成立，问题只出在陈旧锁清理分支。

5. **`methods/packs/*.md` 与 `protocols/*.md` 正文质量**：本次按任务优先级聚焦可执行代码与承重不变量，10 个 method pack 和 7 份协议文档只核查了被 SKILL.md 路由表引用的文件名是否存在（全部存在）与 `router.mjs` 的信号→pack 映射是否指向真实文件（`tests/routing-frontier.test.mjs` 有 "every signal names an existing pack" 断言并通过），未逐字审查方法论内容是否与设计 §3.2 一致。
