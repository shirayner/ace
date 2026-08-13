# auto-goal-v2 验收追踪台账

> 生成日期：2026-08-13
> 被验对象：`plugin/skills/auto-goal-v2/`
> 验收清单来源：`.ace/tasks/archive/2026-08-12-design-auto-goal-v2/artifacts/auto-goal-v2-design.md` §16 验收测试矩阵（37 项，权威编号 A01–A02、C01–C08、J01–J04、E01–E05、O01–O06、R01–R03、U01–U04、X01–X05）；不变量编号取自同文档 §17（I1–I15）。

## 数据来源与边界

- **离线自动化**：`node scripts/run-tests.mjs`，结果 `tests 501 / pass 496 / fail 0 / skipped 5`。5 个 skipped 全部是 `tests/capability-live.test.mjs` 中需 `ACE_LIVE_SPIKE=1` 的 live 用例。历史基线 `.ace/tasks/implement-auto-goal-v2/artifacts/baseline-test.tap` 为 `tests 371 / pass 366 / fail 0 / skipped 5`；两次均零失败，差额来自基线之后新增的用例（其中相当一部分是为消除空转测试与补行为性负例而加）。
- **稳定性**：单次全绿不足以判定无 flake。`artifacts/census-postfix.mjs` 连跑 75 轮全量测试并按测试名记账，结论见 `artifacts/census-postfix.jsonl` 与本文件「稳定性判定」节。**该 census 的前一版（`flake-census.jsonl`，24 轮）已作废**：它在 07:28 结束，而它要判定的修复在 07:30-07:32 才落盘，其两个红（round 2 detached-writer cap、round 17 B5）描述的是已不存在的树。两份日志刻意分文件，避免修复前的红被读成修复后的存活、或修复后的绿继承修复前的样本量。

- **live 实测**：`.ace/tasks/implement-auto-goal-v2/artifacts/capability-live.tap`（5/5 pass，真实 backend、真实 token）与 `capability-evidence.md`（单次 dispatch 的字节/token 实测）。**本次未重跑 live 测试**（会产生真实费用），live 结论一律引用既有 tap 与证据文件。
- 表中所有 `文件:行号` 均相对 `plugin/skills/auto-goal-v2/`，行号对应本次核对时的工作树状态。
- 状态语义：`COVERED` 有离线自动化断言或实测证据文件；`COVERED-LIVE` 仅由 `ACE_LIVE_SPIKE=1` 的真实 live 测试覆盖，离线无等效断言；`BY-DESIGN` 由结构或协议文档强制、无可执行断言；`UNCOVERED` 无支撑。

## 验收追踪表

| ID | 判据 | 状态 | 证据 |
|---|---|---|---|
| A01 | V2 内全部相对引用不含 `shared/`、V1、其他 Skill 私有文件 | COVERED | `tests/kernel-cohesion.test.mjs:118`（runtime 源码扫描四类禁用模式）、`:89`（无相对 import 逃出目录树）；`tests/control-cohesion.test.mjs:56`（runtime 模块 import 扫描）、`:91`（≥12 份协议/pack/模板文档正文扫描） |
| A02 | 删除目录外 shared 后 V2 不受影响 | COVERED | `tests/kernel-cohesion.test.mjs:170`（逐个 import 全部 14 个 kernel/schema 模块，任何外部依赖会在此解析失败）、`:140`（不 import 仓库根 package）。注：`plugin/shared/` 仍存在于仓库中，**物理删除实验未执行**；覆盖靠的是静态引用扫描 + 模块解析实证，而非删除后重跑 |
| C01 | checkpoint 2049 bytes 被拒绝、不静默截断 | COVERED | `tests/kernel-budgets.test.mjs:60`（断言 actualBytes=2049 / limitBytes=2048 并抛 `BudgetExceededError`）；`tests/journal-append.test.mjs:385`、`:416`；`tests/kernel-reducer.test.mjs:413`（每个 reduce 结果 ≤2 KiB） |
| C02 | input envelope 2049 bytes → `DISPATCH_REJECTED`，worker 未启动 | COVERED | `tests/kernel-budgets.test.mjs:74`（2049 bytes 拒收）；`tests/backend-isolation.test.mjs:162`（`envelope.code='DISPATCH_REJECTED'`、`audit.launched=false`、未写 artifact）；`tests/dispatch-pipeline.test.mjs:949`（经真实 `dispatchWorker` 端到端：`rejected_stage='input_budget'`、`envelope.bytes > limit`、未启动） |
| C02b | envelope 是**被构造的真实对象**，不只是有门禁——worker stdin 收到的就是它的规范化 JSON | COVERED | 结构：`scripts/dispatch-worker.mjs:314` `buildWorkerInput()` → `:327` `measureWorkerInput()` → `:359` `validateSchema(…, getSchema(SCHEMA_IDS.WORKER_INPUT))` → `:379` 2 KiB 字节门 → `:493` `child.stdin.write(input.serialized)`，三道门全在 spawn 之前（I11）。断言：`tests/dispatch-pipeline.test.mjs:887`（stub 回显 stdin，实收对象逐字段断言 + 重新过 schema + `audit.input_bytes` 等于回显字节的规范化长度）、`:919`（objective 1900 B → `input_schema` / `objective maxBytes`）、`:979`（规范化字节在 limit 与 limit+1 两点上实测）、`:1005`（`role`/`task_id` 显式 `null` 合法、enum 外 role 被拒）。变异：7/7 KILLED（含 `D_bare_objective`——两道门原样保留、仅 stdin 改回裸 objective，仍被 `:887` 捕获），见本文件「#16 变异判定」 |
| C03 | 总启动载荷 16385 bytes 在启动前拒绝并记录组成字节 | COVERED | `tests/kernel-budgets.test.mjs:82`（actual=16385/limit=16384，composition 三项逐项断言）；`tests/backend-isolation.test.mjs:95`（`checkLaunchBudget` 返回 `DISPATCH_REJECTED` 且带 parts）；`capability-evidence.md`「Pre-ingestion budget proof」：17000 字节 objective → 17395 字节载荷 → `audit.launched=false`，未启动进程 |
| C04 | worker 输出 10 MiB：原文受控落盘，主模型只收 ≤1 KiB envelope | COVERED | 离线 `tests/backend-isolation.test.mjs:112`（50000 字节 summary + 40 claims 投影后 ≤1 KiB 且仍可 `JSON.parse`）；live `capability-live.tap` 第 4 行 `✔ C04: a huge worker output reaches disk but not the return value`（`tests/capability-live.test.mjs:75`：envelope ≤1 KiB、raw 只能经 `audit.raw_artifact` 从磁盘读到、`raw_bytes > envelopeBytes`） |
| C05 | worker 返回非法 JSON → `RESULT_REJECTED`，原文 pointer 可诊断且正文不进模型 | COVERED-LIVE | `capability-live.tap` 第 5 行 `✔ C05: a non-JSON worker reply is rejected rather than summarised`（`tests/capability-live.test.mjs:98`：`status=FAILED`、`code=RESULT_REJECTED`、`artifact_pointer` 存在、断言 envelope 中**不含** `summary` 字段）。离线无等效断言：`scripts/dispatch-worker.mjs:151/170/185` 的三条拒收分支（`cli_output_unparseable`、`worker_output_not_json`、`invalid_status_enum`）没有对应的离线单元测试 |
| C06 | JSON 合 schema 但 artifact 不存在 → 语义校验失败 | COVERED | `tests/kernel-artifacts.test.mjs:198`（manifest 指向不存在文件被拒）、`:174`（digest 不匹配被拒）；`tests/kernel-semantics.test.mjs:550`、`:328`（引用未注册 artifact 被拒）、`:480`（claim 引用未注册 artifact 被拒） |
| C07 | path 含 `../` 或 symlink 逃逸 → 拒绝且不访问根外文件 | COVERED | `tests/kernel-artifacts.test.mjs:84`（`resolveWithinRoot` 拒逃逸）、`:127`（指向根外的真实 symlink 被拒）、`:208`（逃逸路径在 touch 文件前即被拒）；`tests/backend-isolation.test.mjs:135`（`../`、绝对路径、盘符、空串五类全拒）；`tests/kernel-schemas.test.mjs:224`（worker input 的 write_root/input path 逃逸被拒）；`tests/kernel-semantics.test.mjs:563` |
| C08 | worker 基于旧 scope version 返回成功 → artifact 保留、ledger 不更新 | COVERED | `tests/kernel-ledger.test.mjs:249` `evidence recorded under a superseded scope does not move the ledger (C08, I12)`；`tests/kernel-semantics.test.mjs:443` `a result computed under a stale scope is flagged (C08, I12)` |
| J01 | event 写入后 checkpoint 前崩溃 → 重放 reducer，next action 唯一 | COVERED | `tests/journal-append.test.mjs:469` `an event appended without its checkpoint leaves a replayable journal (J01)`、`:234`（尾部半行被丢弃并上报，不当作 corruption）；`tests/kernel-reducer.test.mjs:145` `every non-terminal checkpoint names exactly one next action (I8)`（同文件头声明 scenario J01） |
| J02 | checkpoint 临时文件写一半崩溃 → 忽略临时文件，从 journal 重建 | COVERED | `tests/journal-append.test.mjs:448`（损坏 checkpoint 读作 null 以触发重建）、`:456`（孤立 temp 文件被忽略且可清理） |
| J03 | segment 达 1 MiB → seal + rollover，hash 链连续 | COVERED | `tests/journal-append.test.mjs:259`（字节与事件数双触发条件）、`:267` `rollSegment seals the segment and continues the chain across it (J03)`；`tests/kernel-canonical.test.mjs`（文件头声明 scenario J03，全文件为规范序列化与 hash 链断言） |
| J04 | 两个 writer 同 seq 竞争 → 只有一个成功，另一个重读 cursor | COVERED | `tests/journal-append.test.mjs:197` `only one of two writers claiming the same seq wins (J04)`、`:167`（基于 stale tail 的 append 被乐观并发拒绝） |
| E01 | 只有外部 API 200 响应 → 只记 E1，不判 STATE satisfied | COVERED | `tests/kernel-ledger.test.mjs:338` `E1 is not satisfiable for an E2 requirement (E01, I14)`；`tests/kernel-semantics.test.mjs:50`；`tests/outcome-derivation.test.mjs:206` `an external-system goal stuck at E1 does not become DONE (E01)`；`tests/control-protocol.test.mjs:50` |
| E02 | 外部查询读回已生效 → 达 E2，按 required rung 更新 | COVERED | `tests/kernel-semantics.test.mjs:59` `an independent read-back at E2 satisfies a STATE criterion (E02)` |
| E03 | 悬空 `EFFECT_INTENDED` 后恢复 → 先查询/idempotency，不重复副作用 | COVERED | `tests/kernel-reducer.test.mjs:260` `a dangling effect intent must be observed before anything else (I6, E03)`；`lib/semantic-validator.mjs:274` 强制 `EFFECT_INTENDED` 必带 `idempotency_key`；状态机 guard `RECOVERING->EXECUTING` 要求 `danglingEffectsResolved`（`protocols/runtime/state-machine.mjs:77`） |
| E04 | `JUDGMENT` 无 acceptor → 最高 UNVERIFIABLE，不自评 DONE | COVERED | `tests/control-protocol.test.mjs:254` `JUDGMENT without a reachable acceptor is untestable; Agent cannot self-accept (E04, I9)`；`tests/kernel-ledger.test.mjs:374`；`tests/kernel-semantics.test.mjs:116`；跨层一致性 `tests/kernel-layer-consistency.test.mjs:153` |
| E05 | `NEGATIVE` 写成"没有任何问题" → 规划拒绝，要求限定检查面 | COVERED | `tests/control-protocol.test.mjs:233` `universal NEGATIVE phrasing is rejected, bounded surface accepted (E05)`；`tests/kernel-semantics.test.mjs:98`；`tests/kernel-ledger.test.mjs:411`（无限定检查面则不可满足） |
| O01 | 全 criteria 满足且证据等级足够 → reducer 唯一得出 DONE | COVERED | `tests/outcome-derivation.test.mjs:38` `all criteria satisfied at their required rung yields DONE (O01)`；`tests/kernel-reducer.test.mjs:326` `a terminal journal derives its outcome from the ledger (O01, I1)` |
| O02 | 静默缩范围但部分判据满足 → 不得 DONE，PARTIAL 或阻止 scope 变更 | COVERED | `tests/outcome-derivation.test.mjs:240` `a narrowed scope caps the outcome at PARTIAL (O02)`；`tests/control-protocol.test.mjs:489` `silently dropped criteria cap the outcome at PARTIAL (O02)`、`:460`（`scope_version` 仅经 decider 批准单步递增，I2） |
| O03 | coherent 子集完成、residual 明确 → PARTIAL + handoff | COVERED | `tests/outcome-derivation.test.mjs:224` `a non-empty residual caps the outcome at PARTIAL (O03)`；`tests/control-protocol.test.mjs:357`、`:386`（handoff 必带 residual/owner/next action/acceptance，I15） |
| O04 | 计划被反证必须改变 → BLOCKED(FALSIFIED/PLAN_CHANGE_REQUIRED) | COVERED | `tests/outcome-derivation.test.mjs:118` `a falsified in-scope criterion yields BLOCKED(FALSIFIED) (O04)`；`tests/control-protocol.test.mjs:508`（BLOCKED 是 outcome 而非 phase） |
| O05 | 用户提供批准后可原计划恢复 → NEEDS_INPUT，带单问题和 resume token | COVERED | `tests/outcome-derivation.test.mjs:86` `a principal-held key yields NEEDS_INPUT with a resume token (O05)`；`tests/kernel-reducer.test.mjs:242` `an answered interruption resumes the same plan (O05)`；`tests/approval-guard.test.mjs:233`（单决策 interruption 形状合法） |
| O06 | 尚未运行可用验证却声称不可验证 → 不允许 UNVERIFIABLE，保持 UNTESTED | COVERED | `tests/outcome-derivation.test.mjs:147` `an untested criterion with verification still available is not UNVERIFIABLE (O06)`；`tests/kernel-ledger.test.mjs:435` `hasExhaustedEvidence separates a reached ceiling from untried verification (O06)` |
| R01 | 高爆炸半径批量操作未枚举目标集 → approval guard 阻止执行 | COVERED | `tests/approval-guard.test.mjs:356` `high blast radius without an enumerated target set is blocked (R01)`；`tests/control-protocol.test.mjs:186`（`bounded_many` 必须枚举，`unbounded` 不可枚举）；`tests/routing-frontier.test.mjs:55`（高爆炸半径路由到 target-enumeration pack，标注 "R01 companion"） |
| R02 | 已批准 10 个目标、实际变 11 个 → delta re-approval | COVERED | `tests/approval-guard.test.mjs:99` `10 approved targets becoming 11 forces re-approval (R02)`；`tests/kernel-identity.test.mjs:84`（多出一个目标即不同 action，须重新 key） |
| R03 | 有 access 无 authority → NEEDS_INPUT，不执行 | COVERED | `tests/approval-guard.test.mjs:405` `mandate gap a principal can close recommends NEEDS_INPUT (R03)`；`tests/control-protocol.test.mjs:320` `access and authority are orthogonal: credentials are not permission (R03)` |
| U01 | 输入仅为"做批量导入" → 先重写世界差量，不直接实现方案 | COVERED | `tests/routing-frontier.test.mjs:43` `a solution-shaped input routes to outcome reframing (U01)`；`tests/control-protocol.test.mjs:409` `action-phrased intent is rejected with a rewrite instruction (U01)` |
| U02 | 可查事实缺失 → 分派 discovery worker，不询问用户 | COVERED | `tests/routing-frontier.test.mjs:78` `a checkable fact is delegated to a worker, never asked of the user (U02)` |
| U03 | 一轮包含多个相互依赖问题 → 只发最上游承重决策 | COVERED | `tests/routing-frontier.test.mjs:96` `only the most upstream load-bearing decision is asked (U03)`；`tests/approval-guard.test.mjs:251` `one interruption carries exactly one decision (U03)` |
| U04 | 旧 Frontier 在回答后仍被保存 → 测试失败 | COVERED | `tests/routing-frontier.test.mjs:205` `Frontier keys must never appear in persisted state (I13, U04)`；`tests/routing-frontier.test.mjs:197`「an answered question does not reappear in the next Frontier」 |
| X01 | 软件/调研/写作/文件/外部系统/线下/学习七类样例走同一状态机，不硬套代码验证 | COVERED | `tests/routing-frontier.test.mjs:362` `all seven domains pass through the same gates without code-shaped assumptions (X01)`，配套「the offline goal keeps a non-empty residual」「the external-system goal cannot self-certify」 |
| X02 | worker backend 默认继承主会话 → backend 判定不合格，拒绝调度 | COVERED | 离线 `tests/backend-isolation.test.mjs:39` `X02: argv that would inherit the caller session is rejected`（`--resume` 触发 `INVARIANT_VIOLATED`；缺隔离 flag 亦拒）、`:45`（`cleanEnv` 剥离父会话身份与冲突 token）、`:145`（无 backend → `DISPATCH_REJECTED(no_clean_context_backend)`，`launched=false`）；live `capability-live.tap` 第 2 行 `✔ the worker has no access to the caller conversation`、第 3 行 `✔ worker ingestion stays near the floor`（实测 299 tokens，见 `capability-evidence.md`；继承历史的会话实测 >2400） |
| X03 | 主 Agent 尝试直接读取 raw artifact → 协议测试失败，必须经 summarize/proxy | COVERED | `tests/kernel-semantics.test.mjs:602` `raw worker output is not main-agent ingestible (I4)`（`raw_output`/`log`/`diff` 判否，`report`/`evidence`/`handoff` 判是，对应 `lib/vocabulary.mjs:192`）；`tests/kernel-artifacts.test.mjs:251`（manifest index 行只含 5 个指针字段，不含正文）。**范围说明**：断言的是分类谓词与索引形状；"尝试读取即失败"这一层由结构强制——`dispatchWorker` 只把 `audit.raw_artifact` 作为路径返回，原文从不是任何函数返回值（`protocols/control-loop.md:52`），无用例模拟一次越权读取 |
| X04 | 完整测试日志、搜索结果或 diff 返回主模型 → 摄入审计为 0 bytes | COVERED-LIVE | live `capability-live.tap` 第 4 行（`tests/capability-live.test.mjs:86-94`：真实 backend 的大输出下 envelope ≤1 KiB，原文只在磁盘上、须显式 `readFile` 才能拿到）；离线侧 `scripts/ingest-audit.mjs:77` `projectEnvelope` 逐级丢弃 claims/artifact_refs 而非截断 JSON（`tests/backend-isolation.test.mjs:112`），`log`/`diff` 由 I4 判否。**范围说明**：设计原文的"摄入审计为 0 bytes"这一具体计量口径未实现——审计字段是 `audit.envelope_bytes` 与 `audit.raw_bytes`，没有统计"原文进入主模型字节数"的 0 值计数器 |
| X05 | 正常恢复路径主 Agent 总读取 ≤4 KiB | COVERED | 本行原判 UNCOVERED（实现缺口），已按下文「要覆盖需要什么」的两步补齐并复核。实现侧：`lib/recovery.mjs:140` `buildRecoveryEnvelope()` 是恢复读取面的唯一出口——checkpoint 与 cursor 后事件尾部合成单一返回值，`:141` 以 `BUDGETS.RECOVERY_TOTAL` 为门禁，超预算时逐级降 fidelity（rows → counts-only）而非静默截断，并用 `omitted_count`/`fidelity`/`omitted_detail` 声明withheld 量；连 counts-only 都放不下时抛 `INVARIANT_VIOLATED`（视为缺陷而非 journal 状态）。测试侧：`tests/kernel-recovery.test.mjs:62`（正常路径实测字节 ≤ 预算且 `next_action` 唯一，I8）、`:85`（上报字节数是实测而非估算）、`:121`（40 条长尾被投影并声明 withheld）、`:141`（超 `RECOVERY_EVENT_TAIL` 16 KiB 走 reducer 压缩、不返回任何 event 行）、`:159`（刚好在 raw cap 之下仍保留行——压缩路径的控制组）、`:189`（大量小事件由行数而非仅字节封顶）、`:173`（尾行只带 identity，不带 payload）、`:323`（预算边界两点：恰好等于时 fidelity=rows，少 1 字节即降级）、`:348`（floor 抛错而非越界）。均为离线用例，不需真实 backend |

## 统计

| 状态 | 计数 | 编号 |
|---|---|---|
| COVERED | 36 | A01, A02, C01, C02, C02b, C03, C04, C06, C07, C08, E01, E02, E03, E04, E05, J01, J02, J03, J04, O01, O02, O03, O04, O05, O06, R01, R02, R03, U01, U02, U03, U04, X01, X02, X03, X05 |
| COVERED-LIVE | 2 | C05, X04 |
| BY-DESIGN | 0 | — |
| UNCOVERED | 0 | — |
| **合计** | **38** | 设计 §16 矩阵 37 项一一对应，无遗漏编号；C02b 为 #16 追加项（矩阵原文把 envelope 只写成字节门，未把"对象被真实构造"列为独立判据） |

## 未覆盖项与原因

### X05：正常恢复路径主 Agent 总读取 ≤4 KiB —— 已从 UNCOVERED 补齐为 COVERED

**保留本节的原因。** 这是本次验收中唯一一项初判 UNCOVERED 的场景，且成因是实现缺口而非验证困难。留下原始判据与补齐过程，是为了让「声明了预算却无人消费」这一类缺陷的发现路径可复查——删掉它，台账就只剩一片全绿，看不出这项曾经是假的。

**当初为什么没覆盖。** `BUDGETS.RECOVERY_TOTAL` 被定义、被常量测试断言、被 `protocols/recovery.md` 写成规则，但没有任何函数消费它。恢复读取路径由 `lib/journal.mjs` 的 `readEventsAfter()` 与 `readCheckpoint()` 组成，两者都不对累计字节做门禁；`protocols/recovery.md:40` 所说"超过硬上限时先由 reducer 离线压缩投影"当时只存在于文档中，没有对应的投影函数或调用点。因此该项既缺执行期强制，也缺断言——`tests/kernel-budgets.test.mjs:46` 断言的是常量自身等于 4 KiB，属于「声明 ≠ 生效」。

**补齐后的状态（两步都已落地，见 X05 行证据）。**

1. **实现侧**：新增 `lib/recovery.mjs`，`buildRecoveryEnvelope()` 成为恢复读取面的唯一出口，把 checkpoint 与 cursor 后事件的投影合成单一返回值，并在返回前对合成体以 `RECOVERY_TOTAL` 门禁。超预算不静默截断而是逐级降 fidelity 并声明 withheld 量；floor 放不下时抛 `INVARIANT_VIOLATED`。
2. **测试侧**：`tests/kernel-recovery.test.mjs` 以实测 UTF-8 字节断言（非估算），覆盖正常路径、40 条长尾投影、超 16 KiB reducer 压缩路径及其控制组、行数封顶、预算边界两点、floor 抛错。全部离线，无 backend 依赖与费用。

**遗留的一处不对称**（不影响本项判定，已单列为低优先级任务）：`RECOVERY_EVENT_TAIL`（16 KiB）与 `RECOVERY_TOTAL`（4 KiB）的关系由 `tests/kernel-recovery.test.mjs:366` 断言，但两者都只作用于 `buildRecoveryEnvelope` 一个调用点；若将来出现第二条恢复读取路径，它不会自动继承这道门禁。

### 两项需要注意的范围限制（已计入 COVERED/COVERED-LIVE，但判据未被逐字满足）

- **X03**：断言覆盖的是"raw 类 artifact 不可被主 Agent 摄入"这一分类规则与"索引只存指针"这一形状，而"主 Agent 发起一次越权读取则协议测试失败"没有对应用例。若要逐字满足，需要一个把 `raw_output` artifact 内容喂给主 Agent 摄入路径的负向用例，断言其被 `isMainAgentIngestible` 拦下。
- **X04**：设计要求的计量口径是"摄入审计为 0 bytes"，实现给出的是 `audit.envelope_bytes` 与 `audit.raw_bytes` 两个正向计量。实质结论（原文不回主模型）已由 C04 的离线 + live 双侧证据支撑；若要逐字满足，需在 audit 中新增一个"raw 内容进入主模型字节数"的显式计数器并断言其为 0。
- **A02**：判据是"删除目录外 shared 后运行全套测试"，实际证据是静态引用扫描 + 全模块 import 解析；`plugin/shared/` 未被真实删除。若要逐字满足，可在 CI 中以临时重命名 `plugin/shared/` 的方式跑一遍全套测试。

### 未在本次核对中重跑的部分

`capability-live.test.mjs` 的 5 个用例（含 C05 的唯一证据、X02 与 X04 的 live 证据）本次**未重跑**，按任务约束未设置 `ACE_LIVE_SPIKE=1`。它们在 `capability-live.tap` 中记录为 5/5 pass、耗时 106.7s。这意味着 C05 目前的可核查性依赖一份历史 tap 而非可随时重放的离线断言——补一个用 stub backend 注入非 JSON stdout 的离线用例即可把 C05 从 COVERED-LIVE 提升为 COVERED，且不产生费用。

## #16 变异判定：input envelope 的三道门与被门禁的对象

判定窗口 D7 digest `all-89:891c21fa1bf6`（89/89 文件），`--run` 与 `--verify` 两侧均 INTACT，故计数与机制同源可引用。窗口内全套：tests 496 / pass 491 / fail 0 / skipped 5（5 个 skip 全为 `ACE_LIVE_SPIKE=1` live 用例）。变异器 `mutate-task14.mjs`，全部跑在 `%TEMP%` 副本上，配对控制组与变异体取自同一次 `cpSync`，判定只按**新增失败用例名的集合差**，故既有红或 flake 不会被误记为 kill。

任务 #16 的三条证据在本树上均不成立：`SCHEMA_IDS.WORKER_INPUT` 在 `scripts/dispatch-worker.mjs:359` 有生产 `getSchema()` 调用；stdin 写的是 `input.serialized`（`:493`）而非裸 objective；`maxBytes` 关键字在 `lib/schema-validator.mjs:101` 真实实现。反例实测已被拒：objective 1900 B → `worker_input_schema_invalid` / `rejected_stage='input_schema'` / `launched=false`，违规项 `{path:'objective', rule:'maxBytes', message:'1900 UTF-8 bytes > 400'}`。

但「门存在且测试通过」正是本任务族反复出现的空转形态，故不以读源码结案，逐门双向变异：

| 变异 | 方向 | 内容哈希迁移 | 新增失败 | 判定 |
|---|---|---|---|---|
| `D_input_schema_OPEN` | OPEN | 2812ac56d655cdee → 7d1b7c717cefde49 | 1 | KILLED（`§2: an objective past the schema ceiling is refused before any spawn`） |
| `D_input_schema_SHUT` | SHUT | 2812ac56d655cdee → 8588babc77fd7683 | 43 | KILLED by positive case（4 个 control 用例在内） |
| `D_input_budget_OPEN` | OPEN | 2812ac56d655cdee → 0d24c862ce1d62ce | 1 | KILLED（`§2: an envelope past 2 KiB is refused before any spawn`） |
| `D_input_budget_SHUT` | SHUT | 2812ac56d655cdee → 22339d5ac02dffbc | 42 | KILLED by positive case（4 个 control 用例在内） |
| `D_bare_objective` | BYPASS | 2812ac56d655cdee → 20497b800ecbdfa2 | 1 | KILLED（`§2: the worker receives the envelope, not a bare objective`） |
| `D_role_dropped` | FIELD | 2812ac56d655cdee → d6624588a59ef129 | 2 | KILLED |
| `D_write_root_wrong` | FIELD | 2812ac56d655cdee → 454be2b3e1c1671e | 1 | KILLED |

`D_bare_objective` 是这批里唯一直接对应 #16 缺陷形态的变异，也是唯一无法用翻转门条件构造的：它把两道门原样保留（envelope 照旧构造、校验、计量，两门自己的测试全部照旧通过），只把 `child.stdin.write(input.serialized)` 改回 `child.stdin.write(objective)`。若套件在此保持绿，那就是「门禁守着一个没人投递的对象」——#16 描述的那个缺陷，而任何翻转门条件的变异都发现不了它。它被 `:887` 那条回显用例捕获，因此「被门禁的对象确实是载荷」这一点有断言，不靠结构自觉。

两个 FIELD 变异回答另一个问题：schema 拦不住的字段级错误有没有人盯。`role` 与 `task_id` 都是 required-but-nullable，所以把 `role` 悄悄改成 `null` 是**合法输入**，没有形状错误可抓；`write_root` 改指另一个 dispatch 的 slot 也仍是合法相对路径。两者都被杀，说明覆盖面到了字段语义一层，而不止于「解析通过且 schema valid」。

### 反例：三道输入门互不蕴含，任一道都不能替另一道背书

团队派工给的原始反例（总载荷 2200 B 过 16 KiB 总门、而 objective 单独 1900 B 超 400 B 字段上限）在当前树上已被 schema 门吃掉，不再可复现。下面三条是在 digest `all-89:891c21fa1bf6` 上实测的替代反例，覆盖三个不同方向——每条都有**恰好一道门反对、另两道放行**，故三道门两两互不蕴含。字节数取自 `dispatch_id='d-env-indep'` / `task_id='goal-dispatch-pipeline'`，与下述测试用例所用的构造逐字节一致（envelope 里 `dispatch_id` 出现两次、`task_id` 一次，故换 id 会整体平移十几字节；早先一版表格用的是另一组 id）：

| 构造 | 16 KiB 总门 | schema 门 | 2 KiB envelope 门 |
|---|---|---|---|
| [A] 每个字段都合法：objective 400 B + 16 条 120 B constraints + 各 16 条 100 B include/exclude | PASS（6491 B，**余量 9893 B**） | PASS（逐字段全合法） | **REJECT**（6096 B > 2048） |
| [C] objective 401 B（字段上限 +1） | PASS（1117 B） | **REJECT**（`objective:maxBytes`） | PASS（722 B） |
| [D] `role: "ADMIN"`，整体仅 319 B | PASS（714 B） | **REJECT**（`role:enum`） | PASS（319 B） |

[A] 的方向与派工里那条正相反：那条是「细门抓、粗门漏」，[A] 是**粗门与 schema 门都放行、只有 envelope 门拦住**，且被拒时距 16 KiB 还剩 9893 B 余量。这证明 2 KiB 门不是 16 KiB 门的下界推论——单字段全合法而组装后超限，是 schema 在语法上无法表达的约束（它没有「所有字段序列化后的总字节」这个概念）。

[C] 与 [D] 反过来证明 schema 门不可被字节门替代：401 B 的 objective 只比字段上限多 1 B，整个 envelope 才 722 B，两道字节门永远看不见它；`role: "ADMIN"` 更极端——它是**语义**越界而非体积越界，整体 319 B，任何字节门在原理上都无法发现。注意 [C] 必须用 401 B 而非派工里的 1900 B：1900 B 的 objective 会让 envelope 涨到 2189 B，连 2 KiB 门也一起拒，那就成了两道门同时反对，无法证明 schema 门的独占必要性。这个区别是构造反例时的实质要点，不是措辞讲究。

**这三条反例本身已被一条能红的断言守住**，不再只是台账里的一段实测记录：`tests/dispatch-pipeline.test.mjs:1089` 的 `§2: the three input gates are pairwise non-implying, each row objected to by exactly one`，逐行断言三道门的三个裁决（`objector` 那道 REJECT、另两道 PASS），并额外断言 [A] 被拒时距 16 KiB 仍有 >4 KiB 余量。

为什么必须新开一条而不能靠既有的三条拒绝用例：`dispatchWorker` 的三道门是顺序短路的，第一道反对就返回，所以「另两道本会放行」在它身上原理上不可观测——既有用例各自只看得到一个裁决，这与「三道门全都反对」完全一致，而后者下任意删两道门套件仍全绿。故该用例绕开 `dispatchWorker`，按产品自身的顺序与 `WORKER_SYSTEM_PROMPT` 直接调用 `checkLaunchBudget` / `validateSchema` / envelope 字节比较三道门。[A] 的构造已抽成 `fieldLegalButFatPayload()`，与 2 KiB 门那条用例共用，避免两处各存一份而漂移。

变异验证 5/5 全杀（每次只改一处产品代码，跑完即还原，`git diff` 已确认树干净）：

| 变异 | 拆掉的辨别力 | 结果 |
|---|---|---|
| M1 `worker-input.schema.json` `objective.maxBytes` 400→4000 | schema 门失去 [C] | 红（另带 1 条既有用例） |
| M2 `role.enum` 增加 `"ADMIN"` | schema 门失去 [D] | 红（另带 1 条既有用例） |
| M3 `BUDGETS.WORKER_INPUT_ENVELOPE` 2 KiB→16 KiB | envelope 门退化成总门 | 红（另带 1 条既有用例） |
| M4 `BUDGETS.WORKER_LAUNCH_TOTAL` 16 KiB→2 KiB | 名义上的总门下压 | **仅此一条红**，报 `[A] must clear the launch budget with room to spare (6491 of 2048 B used)` |
| M4' `ingest-audit.mjs:46` `LAUNCH_BUDGET_BYTES` 16 KiB→2 KiB | 真实总门塌到 envelope 门上 | 红，报 `expected only the envelope gate to object, but launch returned REJECT (launch 6491 B, envelope 6096 B)` |

M4 与 M4' 必须分开做，这个区别本身是一处发现：`checkLaunchBudget` 读的是 `ingest-audit.mjs:46` 自己的 `LAUNCH_BUDGET_BYTES`，**不是** `BUDGETS.WORKER_LAUNCH_TOTAL`——两个常量靠 `kernel-layer-consistency.test.mjs:379` 钉等值（该文件 `:212` 已把它登记为 `pinned-below`）。所以改 `BUDGETS` 那一侧动不了真实门禁：M4 之所以红，是余量断言在防「[A] 只是勉强挤过粗门」这个弱化读法，而 M4' 才是总门本身被拆时该报的话。M4 只杀这一条（fail 1），说明整个套件里只有它在守「粗门不是细门的推论」。

复现探针：`.ace/tasks/implement-auto-goal-v2/artifacts/probe-gate-independence.mjs`（打印完整 3×3 裁决表与余量，任一行不止一道门反对即判台账主张为假）。


### 消费端：envelope 的 JSON 就是 LLM 的 user prompt，且从未被真实 backend 消费过

派工要求「读过消费端再定 ①/②」，因为若 worker 侧（是个 LLM，不是解析器）拿到 JSON 反而更差，② 才是对的。读的结果：

- `buildArgs`（`scripts/backend-resolve.mjs:116`）里 `-p` **不带 prompt 参数**，故 CLI 从 stdin 读 user prompt。也就是说 envelope 的规范化 JSON **就是**模型条件化的那段文本，不存在「JSON 交给解析器、objective 交给模型」这种分层。
- `WORKER_SYSTEM_PROMPT`（`scripts/dispatch-worker.mjs:36-42`）写的是 "You receive one objective and only the material inlined with it"，**从未告知 worker stdin 上是一个 JSON 信封**，也没说明 `scope` / `constraints` / `write_root` 各字段该如何理解。system prompt 与实际载荷形状之间存在描述缺口。
- **决定性事实：没有任何真实 backend 消费过 envelope。** `tests/capability-live.test.mjs` mtime 16:52、`capability-live.tap` 16:59，而 `schemas/worker-input.schema.json` 19:27、`scripts/dispatch-worker.mjs` 21:00 —— 那 5 个 live 用例（含 C05 唯一证据、X02/X04 的 live 证据）跑的是**裸 objective 时代**的代码。内容侧交叉印证：该文件里的调用仍是 `objective: 'Set status SUCCEEDED and summary exactly FLOOR.'` 这类裸字符串写法。

结论：**①/② 的抉择前提目前无证据支撑**。①（构造真实 envelope）已经落地并被 7/7 变异证明是活的，但「LLM 收到 JSON 信封后能否照样正确作答」这一问只有 live 重跑能回答，而现存 tap 回答的是另一个版本的问题。这不构成 ① 的反驳，只说明它缺一份消费端确证——把 `ACE_LIVE_SPIKE=1` 重跑一次即可补上，同时 C05/X02/X04 三项的 live 证据也需要一并重取，因为它们的 tap 同样出自旧载荷形状。

### 遗留：`deadline` 字段恒为 null（弱一档，不属于 #16 的定性）

`worker-input.schema.json` 声明了 `deadline`（nullable timestamp），`buildWorkerInput` 支持该入参（`scripts/dispatch-worker.mjs:182`、`:203`），但 `dispatchWorker` 在 `:314` 的调用点从不传它——实测构造出的 envelope 中 `deadline` 恒为 `null`，而 `timeoutMs`（默认 120000）是它真会据以 SIGKILL 的截止期。也就是说 worker 不被告知自己的时间预算。

**这不是 #16 那一级的缺陷，权重要如实标注**：`deadline` 既不在 schema 的 `required` 列表内，也是显式 `nullable`，因此 `null` 是**协议允许的合法值**；`protocols/dispatch.md` 通篇只要求「超时是拒收」（§3 那条），从未要求把截止期写进 envelope 告知 worker。所以现状是「schema 预留了字段、生产路径未使用」，属于合法未使用，而非「协议声明的对象从未被构造」。归档于此以免下一次审计把它重新当作阻塞项发现，也以免把它当作 #16 未收口的证据。

要用起来只需在 `:314` 的调用点补 `deadline: new Date(Date.now() + timeoutMs).toISOString()`（须匹配 `common.schema.json#/$defs/timestamp` 的 `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$`），并加一条断言 envelope 中的 deadline 与 `timeoutMs` 一致的用例。改动落在 `scripts/dispatch-worker.mjs`，该文件归 pipeline-fix，故未擅自改。

## 稳定性判定与最后一处缺陷：spawn 失败的观察形状因平台而异

### 缺陷本体

`dispatch-stream-completeness.test.mjs` 的 `a spawn failure names itself in the audit` 在 75 轮 census 中 **22/22 全红**——不是 flake，是确定性破损。断言拿到的是 `{"backend":null,"launched":false}`，即 `resolveBackend` 的前置拒绝审计，其中**根本没有 `spawn_error` 这个字段**。

红的原因是测试自己注释里写下的前提为假。它写：「目录作为 backend 会拿到 pid，所以 `resolveBackend` 会放它过去」。实测（`artifacts/probe-spawn-error-taxonomy.mjs`，四个输入）：

| 输入 | `resolveBackend` | dispatch 结果 |
|---|---|---|
| 目录 | `null`（`isFile` 拒绝） | 前置 `DISPATCH_REJECTED`，`launched:false`，**无** `spawn_error` 字段 |
| 不存在的路径 | `null` | 同上 |
| 真实文件、非可执行映像 | 通过 `isFile` | `spawn` **同步抛** `spawn UNKNOWN` |
| 零字节文件 | 通过 `isFile` | `spawn` **同步抛** `spawn EFTYPE` |

即：目录在任何 spawn 之前就被拒，压根不可能产出 spawn 失败；而唯一能走到 spawn 的输入（非映像文件），在 win32 上让 `spawn()` **同步抛异常**（单独复现确认：`spawn()` 未返回、无 pid、无 `'error'` 事件）。

### 为什么修产品代码而不是改断言

「backend 已解析但无法启动」是**一个事件**，`spawn` 却有两种报法：POSIX 上异步 `child.on('error')`（如 `EACCES`），win32 上同步抛。同步那支未被捕获时会作为 promise rejection 逃出，于是**同一个失败在一个平台产出带 `spawn_error` 的审计、在另一个平台完全没有审计**。下游每个读者（reducer、raw artifact 落盘、任何失败断言）都得按宿主平台分支；win32 上诊断信息直接丢失——抛出的 `Error` 永远到不了 `pickRawStream`。

修法：`scripts/dispatch-worker.mjs:407` 把 `spawn` 包进 try/catch，catch 里 `res({...spawnError: String(error.message)})`，与异步支解析出完全相同的 capture 形状。两个平台此后只有一种可观察结果。

### 连带发现：邻测的断言把旧 bug 编码成了契约

修完后失败转移到同文件 `an unspawnable backend terminates the dispatch` —— 它断言 `audit.launched === false`。这条断言正是旧 bug 的化石：捕获之前，同步抛意味着根本没有审计，所以它只见过异步支。`launched: true` 才是正确读数（backend 已解析、启动已尝试），`launched: false` 专属于前置拒绝这个**不同状态**。该测试原先还写了「刻意不钉失败形状，否则是在钉平台错误分类而非 dispatcher 契约」——这个顾虑对旧代码成立，对新代码已过期：形状现在由 dispatcher 保证。同时它的 `if (rejected) return` 提前返回是一处空转洞：走到那支就什么都没断言而通过。两处一并收口。

新增控制组 `control: an unresolvable backend is refused before any spawn and carries no spawn_error`，用原来那个目录输入钉住分类的另一半（`launched:false`、`backend:null`、`spawn_error` 字段**不存在**）。没有它，`dispatchWorker` 将来给不可解析的 backend 编造一个 `spawn_error` 也不会有人发现。

### 变异验证（`artifacts/mutate-spawn-error.mjs`）

测试与产品同时改动，正是「修复=把断言改成迎合现状」的高危场景，故逐条拆辨别力：

| 变异 | 拆掉的东西 | 结果 |
|---|---|---|
| M1 删掉 `spawn` 外的 try/catch | 恢复平台相关形状 | **KILLED**（两条测试同时红） |
| M2 保留 catch 但 `spawnError: null` | 捕获了异常却丢掉原因 | **KILLED**（两条测试同时红） |

脚本自检变异确实改动了文件（no-op replace 直接抛错），并在结束时校验源码逐字节还原。

### 全量与稳定性

- 全量：`tests 501 / pass 496 / fail 0 / skipped 5`（skipped 全为 `ACE_LIVE_SPIKE=1` live 用例）。
- census：见 `artifacts/census-postfix.jsonl`（75 轮，本节结论以该文件为准）。作废的 24 轮旧 census 见「数据来源与边界」一节的说明。
