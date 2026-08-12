# auto-goal 主 Agent 上下文减负：审计与重构方案

> 结论先行：静态证据表明，当前最主要且可直接治理的结构性风险，是 `auto-goal` 把主 Agent 同时当成协议解释器、执行器、日志汇聚器和状态协调器；本次没有真实失败 transcript，无法排除 compaction 实现本身也存在缺陷。建议先把主 Agent重构为上下文与 artifact/日志体积无关、且严格受活跃任务数预算约束的控制面，将探索、实现、验证和长内容处理强制迁移到无状态 worker。

## 1. 审计范围与限制

本次基于 `plugin/skills/auto-goal`、其直接依赖的 `plugin/shared` 协议、相关执行 skill、任务 CLI 与模板进行静态审计。没有使用真实失败 transcript，因此结论足以识别结构性缺陷和设计重构，但不能精确归因某一次 compaction 故障。

优化优先级为：**主 Agent 上下文占用最低 > 可恢复性 > 总 token/延迟 > 向后兼容**。

## 2. 核心诊断

### 2.1 上下文成本不是单点，而是三类叠加

| 成本类型 | 主要来源 | 增长特征 | 当前风险 |
|---|---|---|---|
| 固定税 | skill 全文、alignment → understanding 的传递加载，以及条件触发的 decision-log/verification 协议 | 每次任务启动或进入对应阶段时支付；条件协议仅在命中时计入 | 对齐链上限 19,627B（含条件触发的 decision-log），尚未计工具元数据 |
| 线性增长 | TaskUpdate、`state.json`、`context.md`、决策日志多处同步；恢复时全量重读 | 随轮次、任务数和叙事长度增长 | 长任务存在持续挤压控制上下文的结构性风险 |
| 无界突发 | 多 worker 回传、测试/构建完整输出、大文件经主 Agent 写入 | 单次即可显著污染 | compaction 前可能直接触顶 |

#### 静态字节口径与阶段明细

以下数字使用 Windows 文件系统 `Length` 统计 UTF-8 文件字节数；它衡量协议正文体积，不等同模型 token，也不包含系统 prompt、工具 schema、tool metadata 和对话历史。表中区分“明确强制 Read”和“条件/实现依赖”：只有前者可视为该阶段必付正文成本，后者只是潜在成本；入口 `SKILL.md` 单列为全程固定税，避免重复计入。

| 阶段 | 协议 | 字节 | 加载性质与依据 |
|---|---|---:|---|
| 全程入口 | `plugin/skills/auto-goal/SKILL.md` | 7,259 | skill 激活即进入上下文 |
| ALIGN | `alignment-protocol.md` | 4,882 | **明确强制**：`SKILL.md:32` 要求 Read |
| ALIGN | `understanding-protocol.md` | 6,935 | **明确强制**：`alignment-protocol.md:13` 传递要求 Read |
| ALIGN/决策落盘 | `decision-log-protocol.md` | 7,810 | **条件强制**：命中决策捕获时要求 Read |
| INIT | `state-template.md` | 5,121 | **实现依赖/潜在**：`SKILL.md:39` 仅写“参考”，未明确要求 Read，不能计为 INIT 必付成本 |
| EXECUTE | `context-discipline.md` + `parallel-protocol.md` | 1,491 + 1,816 | **明确强制**：入口执行原则与识别并行机会时要求 Read |
| VERIFY | `verification-protocol.md` | 2,231 | **明确强制**：完成前要求 Read；若另调用 verify skill，存在 5,272B 重复实现风险 |
| RECOVER | `references/recovery.md` | 1,507 | **条件强制**：用户要求继续时 Read，另加增长型状态文件 |
| CLOSE | `experience-protocol.md` | 1,923 | **明确强制**：交付后要求 Read |

“对齐链 19,627B”=`alignment 4,882 + understanding 6,935 + decision-log 7,810`；若把已在激活时加载的 auto-goal 入口也算入任务启动固定成本，则达到 26,886B。decision-log 是条件触发，所以不命中项目级决策时 ALIGN 下限为 11,817B。上述只是静态下界，不宣称等于真实会话总占用。

主要证据：

- `auto-goal` 首轮对齐会加载 alignment，而 alignment 再强制加载 understanding，形成未在入口索引中显式声明的传递成本：`plugin/skills/auto-goal/SKILL.md:32`、`plugin/shared/alignment-protocol.md:13`。
- 决策协议要求 AskUserQuestion 后当轮落盘，为很小的决策条目加载完整协议：`plugin/shared/decision-log-protocol.md:48-51`、`plugin/shared/decision-log-protocol.md:71-75`。
- 运行时要求同步 TaskUpdate、`state.json`、`context.md` 和项目决策，产生多个状态写入面：`plugin/skills/auto-goal/SKILL.md:166-171`。
- 探索型 worker 有 200 字限制，但实现型和 Review 型没有统一长度上限：`plugin/shared/parallel-protocol.md:25-56`。
- 验证要求主 Agent fresh 执行并完整阅读输出，与“大结果应隔离到 sub-agent”的规则冲突：`plugin/shared/verification-protocol.md:21-31`、`plugin/shared/context-discipline.md:18-24`。

### 2.2 compaction 失败是结果，不是首因

当前形成了一个失败闭环：

1. 协议和工具输出无界进入主上下文；
2. 达到阈值后 compaction 丢弃过程细节；
3. 恢复文件没有 `next_action`、有效 gate、验证证据和 artifact 索引；
4. 恢复协议重读持续增长的 `context.md`，甚至命中错误路径；
5. 主 Agent可能重新搜索、重跑验证、重载协议，使上下文再次膨胀；其实际速度需用真实 transcript 基线验证。

恢复路径模板仍指向 `.tasks/*/state.md`，实际状态位于 `.ace/tasks/{changeName}/state.json`：`templates/ace/rules/task-recovery.md:7`、`templates/ace/rules/context-hygiene.md:21`。当前 state schema 也只有任务状态和依赖，没有明确续跑指针：`plugin/shared/state-template.md:39-43`。

### 2.3 现有“上下文纪律”没有执行力

`context-discipline.md` 提出了正确的隔离、压缩、外化和预算感知，但只是软性指导；没有预算、拒收条件、工具边界或机械 gate：`plugin/shared/context-discipline.md:7-15`、`plugin/shared/context-discipline.md:18-32`。相比之下，对齐和归档有明确 HARD-GATE。结果是制造上下文的规则比保护上下文的规则更强。

另外，auto-goal 强制不同文件并行实现，而相关执行 skill 又禁止并行实现，说明调度规则不是单一真相源：`plugin/skills/auto-goal/SKILL.md:85-96`、`plugin/skills/parallel-dispatch/SKILL.md:21-27`、`plugin/skills/subagent-execute/SKILL.md:56-62`。

## 3. 根因优先级

### P0：先修正确性与可恢复性

1. **恢复路径错误**：compaction 后可能无法发现活跃任务。
2. **checkpoint 缺续跑语义**：没有 `next_action`、gate、artifact/evidence 指针和幂等 attempt。
3. **并行实现规则冲突**：同一运行时存在相反硬约束。
4. **恢复类型过滤不完整**：恢复逻辑只认 `simple`，而现存任务还可能使用兼容类型。

### P1：决定主上下文能否近似恒定

1. sub-agent 隔离从“建议”改为可机械检查的强制边界。
2. 所有 worker 使用有界、机器可校验的 envelope；超长结果拒收。
3. 验证从主 Agent迁移到独立 verifier worker。
4. 状态从 FleetView + state + context 多写，收敛为单一事件源与小型投影。
5. 将 gate 和下一步持久化，避免只存在于会话文本。
6. 增加 hook/CLI 约束，而不是继续追加自然语言规则。

### P2：降低固定税和维护成本

1. 把 alignment、understanding、decision-log 的完整协议改为按阶段加载的短契约或 CLI 操作。
2. 合并重复 state 模板和重复验证 Gate Function。
3. `context.md` 从无限追加叙事改为 artifact 索引或按阶段分片。
4. 大型 artifact 由 worker 直接写文件，禁止内容经过主 Agent。

## 4. 方案比较

| 方案 | 主上下文收益 | 可恢复性 | 工程量 | 结论 |
|---|---:|---:|---:|---|
| 只缩短 Prompt/协议 | 中 | 低 | 低 | 治标；无界回灌、多状态源和错误恢复仍在 |
| 事件溯源控制面 + 无状态 worker | 高 | 高 | 中高 | **推荐**；边界可验证，checkpoint 可重建 |
| 外部 daemon 全编排 | 极高 | 高 | 极高 | 暂不采用；可移植性和运行依赖成本过大 |

推荐第二种。它不是为了追求事件溯源本身，而是用最小机制保证：主 Agent只消费有界状态，任何长内容都通过 pointer 间接引用，压缩后可确定性恢复。

## 5. 目标架构

```text
User
  │ 对齐 / 方向性决策
  ▼
Thin Controller (主 Agent；与 artifact 体积无关，受活跃任务预算约束)
  │ dispatch bounded input envelope
  ▼
Tool Proxy / ace goal CLI（模型摄入前校验、截断、落盘）
  ├────────► Explorer Worker ──► artifacts/Tn/*
  ├────────► Implementer Worker ─► worktree + artifacts/Tn/*
  ├────────► Verifier Worker ───► evidence/Tn/*
  └────────► Disclosure Worker ─► 只提炼指定 pointer
  ▲
  │ 原始结果先落盘；仅合规 envelope (≤1KB) 返回模型
  │
checkpoint.json (≤2KB) ◄── reducer ◄── events.jsonl (唯一真相源)
```

### 5.1 主 Agent只保留五项职责

1. 与用户完成意图、范围和方向性决策对齐。
2. 读取小型 checkpoint，选择下一个 phase/task。
3. 调度 worker，并接收合规 envelope。
4. 对 BLOCKED/NEEDS_INPUT/不可逆操作进行升级处理。
5. 以摘要向用户汇报，不亲自展开日志、diff 或搜索结果。

主 Agent不再承担跨文件搜索、实现、测试、构建、完整日志阅读、长文归纳或 artifact 搬运。

### 5.2 Worker 输入契约（建议 ≤2KB）

```json
{
  "run_id": "...",
  "task_id": "T2",
  "attempt": 1,
  "phase": "EXECUTE",
  "goal": "一句话目标",
  "criteria": ["可测试标准"],
  "input_pointers": ["artifacts/T1/findings.json"],
  "allowed_paths": ["plugin/skills/auto-goal/**"],
  "budget": {"output_bytes": 1024, "artifact_bytes": 10485760}
}
```

禁止把完整历史对话或持续增长的 `context.md` 填入 worker prompt。worker 需要细节时按 pointer 自取。

### 5.3 Worker 输出契约（硬上限 ≤1KB）

```json
{
  "status": "DONE",
  "summary": "不超过 300 字",
  "evidence_pointers": ["artifacts/T2/verification.json"],
  "changed_files": ["plugin/skills/auto-goal/SKILL.md"],
  "blocker": null,
  "next_hint": "派 verifier worker"
}
```

- `status` 仅允许 `DONE | BLOCKED | NEEDS_INPUT`。
- `changed_files` 建议最多 20 项，更多时提供 manifest pointer。
- 搜索过程、完整 diff、测试日志和报告正文必须落盘。
- 不能由主 Agent在收到 Agent tool 结果后再判断超长，因为正文此时已经进入模型上下文。
- 必须通过 Tool Proxy 或 `ace goal dispatch` 在**模型摄入前**接管 worker 原始结果：先将原文写入 artifact，再做 schema/字节校验；合规则只返回 envelope，不合规则返回固定大小错误摘要并在代理层要求 worker 重写。普通 Agent tool 直接回传只允许用于已由运行时保证有界的 agent 类型。

### 5.4 单一状态源

- `events.jsonl`：追加式事实，记录对齐通过、任务派发、worker 完成、gate 通过、失败重试、归档等事件。
- `checkpoint.json`：由 reducer 生成的 ≤2KB 投影，不是第二真相源。只内联固定数量的活跃任务；其余 pending/attempt 明细放入 manifest，并在 checkpoint 中保存 pointer，防止任务数推高控制状态。
- FleetView Task 可作为 UI 投影，但不能承担恢复语义。
- `context.md` 降级为可选的人类报告，不再参与机器恢复。

建议 checkpoint 字段：

```json
{
  "seq": 42,
  "phase": "VERIFY",
  "goal_hash": "...",
  "gate": "implementation-done",
  "pending": ["T4"],
  "next_action": {"kind": "dispatch", "worker": "verifier", "task_id": "T4"},
  "attempts": {"T4": 1},
  "artifact_index": "artifacts/index.json",
  "last_evidence": "artifacts/T3/result-envelope.json"
}
```

### 5.5 阶段和恢复

状态机固定为：

```text
ALIGN → PLAN → EXECUTE → VERIFY → ARCHIVE
```

只有 gate event 能推进阶段；回退也必须成为事件。worker 以 `task_id + attempt` 幂等，lease 超时可重派；连续三次失败进入 BLOCKED。

恢复流程只做：

1. 读取 `checkpoint.json`；
2. 校验最后事件序号和 checkpoint checksum；
3. 若不一致，由 `ace goal recover` CLI 在模型外部从 `events.jsonl` 重放 reducer，只向主 Agent返回 ≤1KB 的重建摘要；
4. 执行 `next_action`；
5. 只有需要人工判断时才读取单个 result envelope。

正常恢复时主 Agent读取 checkpoint + 单 envelope；重建恢复可以扫描增长型事件日志，但扫描发生在 CLI 内部，正文不进入模型。不重读完整 `context.md`，不重放对话，不默认重跑验证。

### 5.6 主 Agent允许直接使用工具的例外

- Read：`checkpoint.json`、单个 envelope，或定位明确且不超过 80 行的冲突片段。
- Bash：只允许返回摘要的控制命令，如 `ace goal status/dispatch/transition/recover`、`git status --short`、`git diff --stat`。
- 禁止主 Agent直接执行：跨文件搜索、测试、构建、长日志读取和完整 diff。

这些边界应由 hook 或 CLI 校验，而不是仅写进 Prompt。

## 6. 具体重构路线

### Phase 0：修复恢复正确性（P0，低风险）

- 修正 `templates/ace/rules/task-recovery.md` 与 `context-hygiene.md` 的 `.tasks/*/state.md` 旧路径。
- 统一活跃任务类型识别，复用 `src/core/task-utils.js` 的兼容逻辑。
- 在现有 state schema 中临时增加 `next_action`、`gate`、`artifact_index`、`last_evidence`。
- 消除并行实现的相反硬规则，先指定唯一调度策略。

**验收**：模拟 compaction 后仅凭 state 能准确定位一个下一动作；legacy/simple 任务均能恢复。

### Phase 1：建立有界回传（最高收益，低至中风险）

- 在 `plugin/shared/parallel-protocol.md` 定义统一 JSON envelope 和字节上限。
- 在 `src/commands/goal/dispatch.js`（新增）或等价 tool proxy 中实现模型摄入前的原始结果落盘、schema 校验、截断和固定大小错误返回。
- 为 Explore/Plan/Implement/Verify/Review 全部设置摘要上限、artifact pointer 和超长拒收；拒收动作必须发生在代理层，不依赖主 Agent自律。
- 大内容由 worker 直接写 `artifacts/{task_id}/`，主 Agent不得转抄。
- 独立 verifier worker 执行测试并读取完整输出，主 Agent只接收证据摘要和 pointer。

**验收**：8 个 worker 同时完成时，回灌总量有严格上限；100MB 测试日志不会进入主上下文。

### Phase 2：重写 auto-goal 为薄控制器（高收益，中风险）

- 将 `plugin/skills/auto-goal/SKILL.md` 缩为状态机、工具边界、升级规则和恢复入口。
- alignment/decision/verification 的详细方法改成 worker 或 CLI 内部实现，入口只保留短契约。
- 主 Agent跨文件 Read/Grep/Bash 由 hook 拒绝或要求 escape reason。
- 合并重复 state 模板和重复验证协议。

**验收**：从对齐结束到归档，主 Agent只读取 checkpoint/envelope；skill 固定协议成本显著下降。

### Phase 3：事件源与 reducer（根治恢复，中高风险）

- 新增 `src/core/goal-events.js`（事件 schema、append 与校验）、`src/core/goal-reducer.js`（投影）、`src/commands/goal/*.js`（控制命令），以及任务目录内的 `events.jsonl`/`checkpoint.json`。
- 增加 `ace goal status|dispatch|transition|recover`。
- FleetView Task、旧 `state.json` 和人类报告均由事件投影或兼容层生成。
- `ace task done` 变成 terminal event 驱动的幂等归档。

**验收**：删除 checkpoint 后可从事件完全重建；任意阶段强制压缩/重启后只读 ≤2KB 即可继续。

### Phase 4：机械预算与可观测性（持续优化）

- hook 记录每阶段主 Agent输入/输出字节、worker envelope 大小、artifact 字节和恢复读取量。
- 超预算触发拒收、自动摘要或强制 dispatch。
- 建立真实任务基准集，对比旧版与新版。

## 7. 量化验收指标

建议先以“字节 + 工具行为”衡量，避免依赖不同模型 tokenizer：

| 指标 | 目标 |
|---|---:|
| 主 Agent控制状态 | `checkpoint.json ≤ 2KB` |
| 单 worker 回传 | `envelope ≤ 1KB` |
| 单 worker 输入 | `dispatch envelope ≤ 2KB` |
| 主 Agent直接读取长文件 | `0 次`；例外片段 `≤80 行` |
| 主 Agent执行测试/构建 | `0 次` |
| 测试/搜索/完整 diff 进入主上下文 | `0 字节` |
| 阶段切换后的上下文增长 | 与 artifact/日志大小无关；checkpoint 固定 2KB，任务明细通过 manifest pointer 外置 |
| 正常 compaction/restart 恢复读取量 | `≤4KB`（checkpoint + 单 envelope） |
| checkpoint 损坏后的重建回传 | CLI 可扫描完整事件日志，但向模型回传 `≤1KB` 摘要 |
| 恢复正确率 | 基准场景 `100%` 找到唯一 next_action |
| checkpoint 可重建率 | 删除投影后事件重放 `100%` 一致 |
| 8 worker 最坏回灌 | `≤8KB + tool metadata` |

基准测试至少覆盖：单任务、8 路探索、多文件实现、大型测试输出、worker 崩溃重派、验证失败回退、compaction 后恢复、归档中断重试。

## 8. 应删除、合并或替换的现有机制

- **删除/降级**：`context.md` 作为恢复必读源；主 Agent完整阅读测试输出；无界 worker 文本回传。
- **合并**：auto-goal 私有 state 模板与 shared state 模板；verification protocol 与 verify skill 中重复 Gate Function。
- **替换**：TaskUpdate + state + context 的同步状态写入，改为事件追加 + 投影。
- **替换**：自然语言“上下文纪律”，改为 schema、字节预算、hook 和 CLI gate。
- **保留**：`ace task done` 的原子化意图、探索型短摘要、决策主文件只留现行条目的渐进披露思想，但应接入新的事件与 pointer 模型。

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 并发 append 冲突 | 文件锁、单调 seq、原子 rename |
| 事件损坏 | 每事件 checksum，定期 snapshot，可验证重放 |
| hook 误拦截必要操作 | 显式 escape event，记录理由并限制一次性范围 |
| 摘要过短导致关键信息丢失 | 完整证据落盘；summary 只做路由，决策时派 disclosure worker |
| artifact 泄漏敏感信息 | 路径 allowlist、脱敏规则、生命周期清理 |
| 事件溯源工程量过大 | 先做 Phase 0/1，立即获得大部分上下文收益，再推进 Phase 3 |
| 总 token 可能上升 | 明确这是用 worker token 换主控制面稳定性；另设总预算但不牺牲隔离 |

## 10. 最终建议

不要先优化 compaction，也不要只压缩 `SKILL.md`。最优实施顺序是：

1. **先修恢复路径与 `next_action`（避免压缩后失忆）；**
2. **再实施有界 envelope 和 verifier 隔离（阻止无界内容进入）；**
3. **再把 auto-goal 变成薄控制器（稳定主上下文）；**
4. **最后引入事件源和机械预算（实现确定性恢复与长期约束）。**

其中 Phase 0 + Phase 1 是投入产出比最高的第一批改造；完整目标态则是“事件溯源控制面 + 无状态 worker”。
