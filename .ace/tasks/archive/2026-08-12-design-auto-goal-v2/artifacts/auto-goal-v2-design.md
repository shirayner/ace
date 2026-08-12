# auto-goal-v2 设计方案

> 状态：待评审设计稿  
> 日期：2026-08-12  
> 范围：本文件只定义设计，不创建 `auto-goal-v2` 实现。

## 0. 结论

`auto-goal-v2` 应是一个**完全内聚、领域无关、证据驱动的目标控制器**，而不是扩写版任务清单。它采用：

1. **薄主 Agent**：只做用户对齐、方向决策、读取小型 checkpoint、调度、处理中断和有界汇报。
2. **有界事实日志**：append-only journal 记录已发生事实，小型 checkpoint 是可重建投影；不采用完整 Event Sourcing/CQRS。
3. **无状态 worker**：worker 只接收显式、有界 input envelope，不继承完整会话或主 Agent 历史。
4. **模型摄入前 Tool Proxy**：所有 worker 原始结果先落盘，再经结构、语义、路径和字节校验；主 Agent 只能收到有界 envelope。
5. **Goal/Mandate 分离**：目标描述期望世界差量，Mandate 描述 Agent 的能力与授权；只执行两者交集，剩余范围必须显式交接。
6. **判据台账决定终态**：`DONE` 由确定性 reducer 推导，模型无权自行宣布完成。
7. **信号驱动理解**：问题从当前未决决策动态派生，不使用固定问卷，不把可查事实推给用户。
8. **内聚率 100%**：所有私有协议、schema、脚本、模板、测试夹具均在 `plugin/skills/auto-goal-v2/` 内；运行时不引用 `shared/`、V1 或其他 Skill 私有文件。

---

## 1. 目标、非目标与验收边界

### 1.1 设计目标

- 接受任意领域的通用目标，并在能力、授权、安全和可验证性边界内持续推进。
- 将“做了某动作”与“目标已达成”严格分开。
- 主 Agent 正常运行时不读取长文件、完整搜索结果、完整 diff、构建日志或 worker 原文。
- 进程中断后，只读有界 checkpoint 和必要事件即可恢复唯一下一步。
- 输入与输出两端都设硬预算；超限作为一等事件，不以盲目重试掩盖。
- 对不可直接执行、不可完全观测、主观判断或延迟效果目标给出诚实降级和 residual 交接物。
- Skill 可独立复制、安装、升级和删除。

### 1.2 非目标

- 不做通用工作流引擎、分布式事务系统或完整 CQRS 平台。
- 不保证任何目标都能达到 `DONE`；多数跨系统、主观或延迟目标的正确终态可能是 `PARTIAL` 或 `UNVERIFIABLE`。
- 不保存模型思维链；journal 只保存可审计事实。
- 不把 planner 输出当状态、事实或完成证据。
- 不让多个 worker 共享可变内存。
- 不默认使用多 Agent；单 worker 足够时不并行。
- 不通过 `ace goal`、外部 daemon 或目录外共享协议提供核心能力。
- 本轮不实现目录、脚本或 schema。

### 1.3 威胁模型

| 威胁 | 结构性防线 |
|---|---|
| worker 长输出先进入主模型 | Tool Proxy 在模型摄入前落盘、校验、裁剪，只返回 envelope |
| worker 继承长会话导致启动失败 | clean-context dispatch；input envelope 超限即 `DISPATCH_REJECTED` |
| 动作成功被误报为目标成功 | E0–E5 证据阶梯；E1 不足以证明状态或效果 |
| 模型自行缩小范围后报 DONE | `scope_version` + decider 明确批准 + reducer 检查范围事件 |
| 有凭证但无授权 | Access 与 Authority 分离；副作用前 approval guard |
| journal 被模型文本污染或无限增长 | 固定 schema、逐行硬上限、segment rollover、禁止原始日志入 journal |
| 恢复时重复外部副作用 | idempotency key、effect intent/result 两阶段记录、恢复时先查结果 |
| checkpoint 漂移 | checkpoint 只由 reducer 从 journal 派生，并记录 source cursor/hash |
| worker 伪造 artifact/evidence 路径 | Proxy 做路径规范化、根目录约束、存在性和摘要校验 |
| structured output 形状正确但语义错误 | 独立 semantic validator 校验枚举、引用、状态转移和证据等级 |
| 并发 worker 写坏状态 | worker 不写控制面；只有 controller/proxy 单写者追加事件 |
| 不可逆或外部动作未经批准 | 风险维度评估 + scoped approval + delta re-approval |
| 负向全称判据制造假 DONE | 强制改写为有界检查面，不能声明“绝无问题” |
| 主观目标由 Agent 自评 | `Judgment/Knowledge` 的 acceptor 不能默认是 Agent |

---

## 2. 核心概念模型

### 2.1 Goal：与 Agent 无关的世界差量

```yaml
goal:
  goal_id: g-001
  intent: "世界将变成什么样，而不是要执行什么动作"
  subject: "唯一可解析的作用对象"
  principals:
    owner: "目标归属者"
    decider: "可改变范围或批准取舍者"
    acceptor: "有权判定完成者"
  criteria: [criterion_id]
  constraints: [constraint_id]
  scope:
    in: []
    out: []
    deferred: []
    external_dependencies: []
  horizon: "目标成立的时间窗口"
  scope_version: 1
```

约束：

- `intent` 必须描述结果差量；若输入只是方案，先反推其目标。
- `scope.in` 与 `scope.out` 同权；缺少任一项不得进入执行。
- `scope_version` 只能通过已获 decider 同意的 `SCOPE_CHANGED` 事件递增。
- `owner`、`decider`、`acceptor` 可以是同一主体，但功能位不可省略。

### 2.2 Mandate：Agent 当前能合法做到什么

```yaml
mandate:
  effectors: []       # 改变目标物的工具、API、文件系统或人类中介
  access: []          # 凭证与通路
  authority: []       # 针对此目标和动作的授权
  competence: []      # 可胜任范围与已知限制
  observations: []    # 可独立读回的世界状态
  safety_boundaries: []
  expires_at: null
```

```text
attainable = goal ∩ mandate
residual   = goal \ mandate
```

若 `residual` 非空：

- 规划期就披露，不得执行到最后才静默降级；
- 给出责任人、下一动作、所需输入和验收方式；
- 若需把目标重定向到“可达前缀 + 交接物”，必须由 decider 批准；
- 即使可达前缀全部完成，原始目标终态最多为 `PARTIAL`。

### 2.3 三轴画像

每个目标都评估：

- **Reachability**：是否有合法效应器改变目标物；
- **Observability**：动作后能否独立读回；
- **Decidability**：判据是否有客观真值条件。

三轴决定证据上限和追问方向，而不是创建不同领域的固定流水线。

### 2.4 Criterion 类型

| 类型 | 定义 | 默认判定权 | 证据上限 |
|---|---|---|---|
| `STATE` | 某时点世界命题 | Agent 可判 | E2–E4 |
| `BEHAVIOR` | 激励下的响应 | Agent 可判 | E3 |
| `ARTIFACT_PROPERTY` | 产物的明文可核查属性 | Agent 可判 | E3/E4 |
| `JUDGMENT` | 依赖人的评价 | acceptor | E4 |
| `EFFECT` | 延迟或统计性世界效果 | 指标所有者 | E5 |
| `KNOWLEDGE` | 用户理解发生变化 | 用户/考核者 | E4 |
| `NEGATIVE` | 声称某事未发生 | 仅可有界检查 | 有界 E3 |

规则：

- 未分类 criterion 不得执行。
- 模糊词必须量化，或显式降级为 `JUDGMENT`。
- `EFFECT` 超出会话窗口时，只能转为经同意的代理指标或 `deferred`。
- `NEGATIVE` 必须列出检查面，例如“在 A/B/C 中未发现 X”。
- V2 不允许通过“用户预授权代理 rubric”把 `JUDGMENT/KNOWLEDGE` 自动转成 Agent 自验；rubric 只能验证产物属性，不能替代最终 acceptor 判断。

### 2.5 证据阶梯

| 等级 | 含义 | 能证明什么 |
|---|---|---|
| E0 | 模型断言 | 什么都不能证明 |
| E1 | 行动痕迹 | 证明动作被尝试/执行 |
| E2 | 独立读回 | 证明某时点状态 |
| E3 | 对读回结果做机械检验 | 证明明文规则满足 |
| E4 | 外部权威确认 | 判定权在位 |
| E5 | 世界效果度量 | 目标差量真实发生 |

外部系统“请求成功”通常只是 E1；没有独立查询、回执或权威确认时不得上舍入。

### 2.6 风险到最低证据等级的确定性映射

风险不是由工具名决定，而由五维描述：

- `reversibility`: `easy | costly | impossible`
- `externality`: `private | shared | public`
- `blast_radius`: `one | bounded_many | unbounded`
- `undo_window`: `available | short | none`
- `detectability`: `loud | observable | silent`

先按 criterion 类型设置基线，再逐条提升：

```text
baseline:
  STATE=E2, BEHAVIOR=E3, ARTIFACT_PROPERTY=E3,
  JUDGMENT=E4, EFFECT=E5, KNOWLEDGE=E4, NEGATIVE=E3

raise to at least E4 if:
  externality != private OR reversibility == impossible
  OR blast_radius == unbounded OR detectability == silent

cap by criterion.max_rung.
if required_rung > max_rung => UNTESTABLE during planning.
```

这是保守的首版规则。它不假装量化概率；实施后可基于真实案例校准，但任何放宽都必须新增回归测试。

---

## 3. 目标理解：信号路由而非固定问卷

### 3.1 临时 Frontier

每轮从当前 Goal、Mandate、criterion ledger 和未决决策重新派生 Frontier。问题只有同时满足以下条件才可进入：

1. 未决；
2. 前置决策已解决；
3. 答案会实质改变范围、风险、计划或判据；
4. 答案只能由 principal 提供，不能由 Agent 查证。

Frontier 是瞬时计算结果，**禁止写入 journal、checkpoint 或长期清单**。用户回答后旧 Frontier 立即失效。

### 3.2 信号 → 方法包

| 可观察信号 | 方法 | 更新目标 |
|---|---|---|
| 输入是方案或动作 | 差量重写 + 有界 5 Whys | `intent` |
| 目标/主体歧义 | 指称消解、现状与目标对照 | `subject/scope` |
| 规则密集或组合多 | 决策表、正例/反例、半成功状态 | criteria |
| 存在模糊词 | 六类歧义扫描：名词/动词/数量/时间/权限/状态与例外 | criteria/constraints |
| `JUDGMENT` | 尽早交付小样，向 acceptor 获取判定 | evidence contract |
| 高爆炸半径 | 先枚举确切目标集 | approval scope |
| 领域不熟 | 先查既有标准、先例和事实 | assumptions/evidence |
| 有人工补偿或影子流程 | 还原现状流程，寻找隐含风控职责 | constraints |
| 假设承重 | Steel-man → Attack Defeater | assumption status |
| 能力或授权不明 | Mandate 探针 | attainable/residual |

方法包按命中信号条件加载；未命中的知识不进入当前上下文。

### 3.3 提问规则

仅当下式两项同时成立才问用户：

```text
不确定性 × 猜错代价 > 提问成本
且答案只在 principal 手中
```

- 每次中断只解决一个承重决策；一个问题可含 2–3 个互斥选项、推荐项和取舍。
- 可查事实由 worker 查，不把用户当搜索引擎。
- 未问槽位登记为 assumption，并写 defeat condition。
- 惊讶测试兜底：用户此刻看到该决定会惊讶，则必须问。
- 追问在以下情况停止：已定位可度量结果；已定位真实任务；继续追问只进入不影响当前决策的上层战略；原请求已被证明只是方案并已重定义问题。

### 3.4 唯一对齐产物

进入规划前生成五段式 Goal Alignment Card：

1. 目标差量；
2. 本轮范围与非目标；
3. 关键假设、约束及 Mandate 缺口；
4. criteria 与所需证据等级；
5. residual、风险和批准点。

需要用户确认时，只接受明确的 `批准当前 goal/scope_version` 或 `拒绝并修正`。沉默、“继续”、带条件同意、执行者自行推断均不算批准。

---

## 4. 架构与职责边界

```text
User
  │ alignment / approval / input
  ▼
Main Agent (thin controller)
  │ bounded checkpoint + bounded envelopes only
  ▼
Skill scripts (control plane, single writer)
  ├─ dispatcher: builds clean worker input
  ├─ proxy: captures raw worker output before model ingestion
  ├─ validators: schema + semantic + budget + path
  ├─ journal: append factual events
  ├─ reducer: derives checkpoint and terminal state
  └─ artifact store: raw outputs, evidence, manifests
        ▲
        │ explicit envelope, no inherited conversation
        ▼
Stateless workers (explore / act / verify / summarize)
```

### 4.1 主 Agent

允许：

- 读取 `checkpoint.json`（≤2 KiB）和单个 envelope（≤1 KiB）；
- 生成对齐卡并处理用户决策；
- 选择短步方向和 worker 类型；
- 调用 dispatcher/proxy；
- 对 `BLOCKED/NEEDS_INPUT` 做决策；
- 输出有界状态摘要。

禁止：

- 直接读取 worker 原文、完整日志、完整 diff、搜索全集或大型 artifact；
- 亲自执行长输出验证并把输出读入上下文；
- 直接写 journal/checkpoint；
- 根据叙述自行宣布 `DONE`；
- 在收到超限结果后才尝试压缩。

### 4.2 Worker

- 每次调用无状态；只接收 input envelope 引用的最小 artifact slice。
- 不读取主会话历史、不读取整个任务目录、不修改控制面。
- 只能把产物写到 dispatcher 分配的工作目录。
- 输出必须符合 worker output schema；原始 stdout/stderr 由 Proxy 捕获。
- 一个 worker 只承担一种角色：`DISCOVER | PLAN_STEP | ACT | VERIFY | SUMMARIZE`。

### 4.3 单写者与并行裁决

- journal、manifest 和 checkpoint 只有控制面脚本可写。
- 默认串行短步执行。
- 仅当依赖测试成立才并行：若 A 的结果完全不同，B 的执行方式仍不改变。
- 涉及外部副作用、相同目标集、同一 artifact 或顺序判据时禁止并行。
- 并行收益估计不覆盖协调和 token 成本时退回串行。

---

## 5. 完全内聚目录设计

```text
plugin/skills/auto-goal-v2/
├─ SKILL.md                         # 薄入口、硬门禁、状态机与加载索引
├─ protocols/
│  ├─ alignment.md                  # Frontier、对齐卡、确认语义
│  ├─ goal-model.md                 # Goal/Mandate/criterion/evidence
│  ├─ dispatch.md                   # clean-context worker 契约
│  ├─ verification.md               # verifier 与证据规则
│  ├─ recovery.md                   # journal/checkpoint 恢复流程
│  └─ risk-approval.md              # 风险维度和批准门
├─ methods/
│  ├─ router.md                     # 信号路由表，唯一真相源
│  └─ packs/
│     ├─ outcome-reframing.md
│     ├─ ambiguity.md
│     ├─ decision-table.md
│     ├─ examples-defeaters.md
│     ├─ current-flow.md
│     └─ judgment-sampling.md
├─ schemas/
│  ├─ goal.schema.json
│  ├─ criterion.schema.json
│  ├─ journal-event.schema.json
│  ├─ checkpoint.schema.json
│  ├─ worker-input.schema.json
│  ├─ worker-output.schema.json
│  ├─ artifact-manifest.schema.json
│  └─ interruption.schema.json
├─ templates/
│  ├─ alignment-card.md
│  ├─ worker-prompts.md
│  └─ handoff.md
├─ scripts/
│  ├─ dispatch.mjs                    # 组装并验证输入，启动 clean worker
│  ├─ proxy.mjs                       # 捕获原文并返回有界 envelope
│  ├─ validate-schema.mjs
│  ├─ validate-semantics.mjs
│  ├─ append-event.mjs
│  ├─ reduce-checkpoint.mjs
│  ├─ derive-outcome.mjs
│  ├─ rotate-journal.mjs
│  └─ lib/                            # 仅本 Skill 使用的纯函数
└─ tests/
   ├─ fixtures/
   ├─ schemas/
   ├─ semantics/
   ├─ budgets/
   ├─ recovery/
   ├─ proxy/
   └─ integration/
```

依赖规则：

- 上述文件只允许相对引用目录树内部路径。
- Node.js 标准库属于平台依赖，不属于私有文件依赖；首版脚本统一使用 Node.js ESM，避免 Node/Python 双运行时。
- 禁止 `../shared`、`../auto-goal`、其他 Skill 路径和 `ace goal`。
- 仓库提供的通用工具能力可以由运行环境调用，但 V2 的语义协议和校验逻辑不能依赖目录外文件。

### 5.1 `SKILL.md` 骨架与渐进加载

```markdown
---
name: auto-goal-v2
description: ...
---

# HARD GATES
- 未对齐 goal/scope_version，不执行。
- 未分类 criteria 或 evidence contract 不完整，不执行。
- 副作用未通过 capability/risk/approval guard，不执行。
- worker 必须经 dispatch/proxy；不得直收长结果。
- outcome 只能由 derive-outcome.mjs 产生。

# Entry
1. 检测新任务或恢复
2. 只读 checkpoint
3. 按 phase 加载一个协议
4. 执行一个短步
5. 追加事实事件并重新 reduce
6. 处理唯一 next_action

# Conditional reads
- ALIGNING -> protocols/alignment.md + 命中的 method pack
- PLANNING -> protocols/goal-model.md + risk-approval.md
- EXECUTING -> protocols/dispatch.md
- VERIFYING -> protocols/verification.md
- RECOVERING -> protocols/recovery.md
```

`SKILL.md` 目标 ≤6 KiB；它只保留不可破坏规则和路由，不复制各协议正文。

---

## 6. 状态机与端到端生命周期

### 6.1 Phase

```text
NEW
 → ALIGNING
 → PLANNING
 → EXECUTING
 ↔ NEEDS_INPUT
 → VERIFYING
 → TERMINAL

任意非终态 → BLOCKED
进程重启 → RECOVERING → 最近合法非终态
```

`NEEDS_INPUT` 是可恢复中断 phase；`BLOCKED` 是终态 outcome。为避免“状态”和“结果”混淆，checkpoint 分别保存 `phase` 与 `outcome`。

### 6.2 生命周期

1. **Intake**：创建 task root、journal segment 和空 checkpoint。
2. **Understand**：信号路由、事实查证、Frontier、Defeater。
3. **Align**：生成对齐卡；必要时获得 `scope_version` 批准。
4. **Plan one step**：只规划下一个可验证短步；做 Mandate、风险、批准和证据可达性检查。
5. **Dispatch**：构造 ≤2 KiB input envelope；Proxy 检查启动总载荷，超限则拒绝。
6. **Act**：worker 产出 artifact 或副作用事实；控制面追加事件。
7. **Verify**：独立 verifier 读取 artifact 原文，主 Agent只收证据 envelope。
8. **Reduce**：从 journal 推导 checkpoint、ledger 和唯一 `next_action`。
9. **Interrupt or continue**：需要用户钥匙则生成单决策 interruption；否则执行下一短步。
10. **Derive outcome**：纯函数根据 ledger、constraints、scope 与 residual 得出终态。
11. **Seal**：写最终 manifest 和 handoff，journal 追加 `GOAL_TERMINATED`；不依赖 ACE CLI 归档。

### 6.3 Transition guards

| 转换 | 必须满足 |
|---|---|
| `NEW→ALIGNING` | task root 与首事件已持久化 |
| `ALIGNING→PLANNING` | Goal 完整；in/out 明确；criteria 已分类；必要批准已记录 |
| `PLANNING→EXECUTING` | next step 唯一；Mandate 可达；evidence contract 可达；副作用 guard 通过 |
| `EXECUTING→VERIFYING` | 声称产物存在；manifest 已登记；原始输出已由 Proxy 处理 |
| `VERIFYING→EXECUTING` | 尚有未满足判据，且下一步合法可达 |
| `*→NEEDS_INPUT` | 命名输入可由 principal 提供，提供后可原样恢复 |
| `*→BLOCKED` | 当前计划必须改变，或 constraint 违反且不能安全恢复 |
| `VERIFYING→TERMINAL` | `derive-outcome` 成功，必填 handoff 字段齐全 |

---

## 7. 控制面数据契约

所有 JSON 使用 UTF-8、无 BOM。字节限制按序列化后的 UTF-8 实际字节计算，不按字符数或 token 估算。

### 7.1 Journal event

```json
{
  "schema_version": 1,
  "event_id": "01J...",
  "task_id": "goal-...",
  "segment": 1,
  "seq": 42,
  "occurred_at": "2026-08-12T14:30:00.000Z",
  "type": "WORKER_RESULT_ACCEPTED",
  "actor": "controller|user|worker:<id>|proxy",
  "causation_id": "event-id-or-null",
  "correlation_id": "dispatch-or-approval-id",
  "idempotency_key": "stable-key-or-null",
  "scope_version": 2,
  "payload": {},
  "artifact_refs": ["artifact-id"],
  "prev_event_hash": "sha256:...",
  "event_hash": "sha256:..."
}
```

约束：

- 每行一个完整 JSON event，硬上限 **4 KiB/event**；超限 payload 必须转 artifact pointer。
- `seq` 在 task 内严格递增；单写者持有锁并原子追加。
- `event_hash` 覆盖规范化 event（不含自身）和 `prev_event_hash`，用于发现截断/篡改，不作为安全签名。
- journal 不记录 reasoning、完整 prompt、stdout/stderr、diff 或长摘要。

核心事件：

```text
GOAL_CREATED, GOAL_ALIGNED, SCOPE_CHANGE_PROPOSED, SCOPE_CHANGED,
ASSUMPTION_RECORDED, ASSUMPTION_DEFEATED, CRITERION_DEFINED,
MANDATE_ASSESSED, APPROVAL_REQUESTED, APPROVAL_GRANTED,
APPROVAL_REJECTED, STEP_PLANNED, DISPATCH_REJECTED,
WORKER_DISPATCHED, WORKER_RESULT_ACCEPTED, WORKER_RESULT_REJECTED,
ARTIFACT_REGISTERED, EFFECT_INTENDED, EFFECT_OBSERVED,
EVIDENCE_RECORDED, CRITERION_UPDATED, INPUT_REQUESTED,
INPUT_RECEIVED, CHECKPOINT_REDUCED, SEGMENT_ROLLED,
GOAL_TERMINATED
```

明确不设通用 `STATE_SET` 事件，避免绕过语义校验。

### 7.2 Checkpoint

```json
{
  "schema_version": 1,
  "task_id": "goal-...",
  "source_cursor": {"segment": 2, "seq": 87, "event_hash": "sha256:..."},
  "phase": "EXECUTING",
  "outcome": null,
  "scope_version": 2,
  "goal_summary": "<=240 bytes",
  "ledger_counts": {"satisfied": 2, "violated": 0, "untested": 1, "untestable": 0},
  "active_step": {"step_id": "s-4", "kind": "VERIFY", "status": "ready"},
  "next_action": {"kind": "DISPATCH", "target": "verify", "ref": "dispatch-spec-id"},
  "pending_interruption": null,
  "residual_count": 1,
  "latest_manifest": "manifests/manifest-87.json",
  "updated_at": "2026-08-12T14:30:00.000Z"
}
```

- 硬上限 **2 KiB**。
- 不保存历史列表、Frontier、完整 Goal、完整 ledger 或叙事过程。
- `next_action` 必须唯一；0 个或多个均为 reducer 错误。
- 用临时文件 + fsync + atomic rename 更新；checkpoint 丢失时可由 journal 重建。

### 7.3 Worker input envelope

```json
{
  "schema_version": 1,
  "dispatch_id": "d-...",
  "task_id": "goal-...",
  "role": "VERIFY",
  "objective": "单一、可判定的任务描述",
  "scope": {"include": [], "exclude": []},
  "constraints": [],
  "inputs": [
    {"artifact_id": "a-...", "path": "artifacts/...", "slice": {"kind": "lines", "start": 1, "end": 120}, "sha256": "..."}
  ],
  "expected_output": {"schema": "schemas/worker-output.schema.json", "max_envelope_bytes": 1024},
  "write_root": "work/d-.../",
  "deadline": null
}
```

- envelope JSON 硬上限 **2 KiB**。
- 所有注入文本（envelope + prompt template + artifact slices）合计硬上限 **16 KiB**；默认 artifact slice 合计 ≤12 KiB。
- 禁止注入聊天历史、主 Agent transcript、整个 task 目录、未声明文件或其他 Skill 正文。
- 超限、引用失效、slice 越界或 hash 不符：不启动 worker，追加 `DISPATCH_REJECTED`。

### 7.4 Worker output envelope

```json
{
  "schema_version": 1,
  "dispatch_id": "d-...",
  "status": "SUCCEEDED|BLOCKED|NEEDS_INPUT|FAILED",
  "summary": "有界事实摘要",
  "claims": [
    {"kind": "artifact_created|fact_found|criterion_checked", "subject_ref": "...", "result": "...", "evidence_ref": "a-..."}
  ],
  "artifact_refs": ["a-..."],
  "suggested_next_action": {"kind": "...", "reason": "..."},
  "error": null
}
```

- 进入主模型的规范化 envelope 硬上限 **1 KiB**。
- `summary` ≤400 UTF-8 bytes，claims 最多 3 条，artifact refs 最多 4 条。
- worker 可产生任意大小原始输出，但原文只能进入 artifact store；超出 artifact 硬限制则流式截断并标记。
- worker 的 `suggested_next_action` 只是建议，不能直接改变状态。

### 7.5 Artifact manifest

```json
{
  "schema_version": 1,
  "artifact_id": "a-...",
  "task_id": "goal-...",
  "dispatch_id": "d-...",
  "kind": "raw_output|report|evidence|diff|log|handoff",
  "path": "artifacts/objects/sha256-prefix/name",
  "media_type": "text/plain",
  "bytes": 12345,
  "sha256": "...",
  "created_at": "...",
  "producer": "worker:...|proxy|controller",
  "truncated": false,
  "original_bytes": 12345,
  "retention": "task",
  "evidence_for": ["criterion-id"],
  "redaction": {"applied": false, "policy": null}
}
```

- 单 manifest ≤2 KiB；manifest index 只保存 id/path/hash/kind，分段存储。
- 路径必须是 task root 下的规范化相对路径，禁止 `..`、绝对路径、symlink 逃逸。
- 默认单 artifact 软告警 1 MiB、硬上限 8 MiB；超过 8 MiB 流式保留首尾和统计信息，`truncated=true`。二进制或领域必要的大文件必须在 dispatch 前获得显式例外预算，仍不得进入主模型。

### 7.6 Interruption / 错误

```json
{
  "schema_version": 1,
  "kind": "NEEDS_INPUT",
  "code": "APPROVAL_REQUIRED",
  "question": "只包含一个决策",
  "why_blocking": "...",
  "options": [{"id": "approve", "label": "...", "tradeoff": "..."}],
  "recommended_option": "approve",
  "required_from": "decider",
  "resume_token": "opaque-stable-id",
  "default_if_no_response": "NO_ACTION",
  "expires_at": null
}
```

错误分类：

- `DISPATCH_REJECTED`：输入预算、路径或 schema 不合法，worker 未启动。
- `RESULT_REJECTED`：输出 schema/语义不合法；原文已落盘但不进入主模型。
- `ARTIFACT_LIMIT_EXCEEDED`：artifact 被截断，不能充当要求完整性的证据。
- `STALE_SCOPE`：worker 结果基于旧 `scope_version`，只能登记为 artifact，不得更新 ledger。
- `APPROVAL_REQUIRED` / `ACCESS_REQUIRED` / `ACCEPTOR_REQUIRED`：可由 principal 提供，进入 `NEEDS_INPUT`。
- `PLAN_INVALIDATED`：新事实使当前计划失效，终态 `BLOCKED(reason=plan_change_required)` 或重新对齐。
- `INVARIANT_VIOLATED`：constraint 或控制面不变量失败；停止副作用并优先回滚。

---

## 8. Tool Proxy 与 clean-context 调度协议

### 8.1 调度命令边界

概念接口：

```text
node scripts/dispatch.mjs --task-root <root> --spec <dispatch.json>
```

`dispatch.mjs` 必须：

1. 规范化 task root 和所有引用路径；
2. 校验 input envelope schema；
3. 校验 role、scope_version、artifact hash 和 slice；
4. 渲染固定 worker prompt；
5. 计算 envelope、模板、slice 和总注入字节；
6. 创建仅包含显式载荷的 clean worker 上下文；
7. 预算超限时在启动前返回固定 `DISPATCH_REJECTED` envelope；
8. 启动 worker 时把 stdout/stderr 直接管道给 `proxy.mjs`，不能先返回主 Agent。

运行环境若无法保证“无历史启动”，该 worker backend 不合格；不得退化为普通 Agent 调用并声称隔离。

### 8.2 输出摄入前处理顺序

Proxy 必须按固定顺序执行，顺序不可交换：

```text
CAPTURE STREAM
  → RAW ARTIFACT WRITE
  → HASH + MANIFEST
  → JSON PARSE / EXTRACT
  → SCHEMA VALIDATE
  → SEMANTIC VALIDATE
  → PATH + EVIDENCE VALIDATE
  → BYTE VALIDATE
  → NORMALIZE / TRUNCATE ENVELOPE
  → APPEND ACCEPTED OR REJECTED EVENT
  → RETURN ≤1 KiB TO MAIN MODEL
```

关键语义：

- 原始输出无论成功或失败都先落盘，保留诊断证据。
- schema 失败时不得让“看起来合理”的摘要进入主模型；只返回固定拒收码、artifact pointer 和修复动作。
- 截断的是**规范化 envelope**；原文不靠字符串截断伪装成合法 JSON。
- semantic validator 至少检查：dispatch id 匹配、枚举合法、artifact 存在、引用属于本 task、scope 未过期、claim 有 evidence、角色有权产生该 claim。
- 主 Agent 返回固定三段：`status + bounded summary/error code + artifact pointer/next instruction`。

### 8.3 超限处理

- 输入超限：不启动；记录实际字节与各组成项，建议缩小 slice 或拆分任务。
- 输出 envelope 超限：Proxy 重新投影固定字段；仍超限则 claims 清零，仅返回 code 和 pointer。
- artifact 超限：流式截断并记录 `original_bytes`；若验证要求完整性，则 criterion 保持 `UNTESTED`。
- 同一 dispatch 因相同原因连续拒绝两次后，禁止自动重试，转 `BLOCKED` 或请求方向决策。

---

## 9. Journal、恢复、并发与幂等

### 9.1 有界 journal

- 单 segment 软告警 **512 KiB**，硬上限 **1 MiB** 或 **2,000 events**，先到者触发 rollover。
- rollover 前 reducer 生成 checkpoint 和 segment seal（最后 seq/hash、checkpoint hash、下段编号）。
- 新段首事件 `SEGMENT_ROLLED` 引用上一段 seal。
- 正常恢复读取 checkpoint ≤2 KiB，再读取 cursor 后事件；cursor 后事件正常目标 ≤2 KiB，硬上限 16 KiB。超过则先由 reducer 离线压缩投影，主 Agent不读取事件正文。
- 历史 segment 不删除；它们是审计事实，但不进入正常模型上下文。

### 9.2 Crash consistency

追加事件：

1. 获取 task 单写锁；
2. 校验 expected last seq/hash；
3. 写完整 JSONL 行到临时追加缓冲；
4. flush/fsync；
5. 更新 cursor；
6. 释放锁。

checkpoint：临时文件写入、fsync、atomic rename。若 event 已追加但 checkpoint 未更新，恢复时从 cursor 重放 reducer；若临时文件残留则忽略。

### 9.3 外部副作用

外部副作用不能靠重放 journal 恢复。协议：

1. 追加 `EFFECT_INTENDED`，包含 scoped approval ref、精确目标集、idempotency key；
2. 调用效应器；
3. 独立读回或查询幂等结果；
4. 追加 `EFFECT_OBSERVED`，记录 E1/E2/E4 证据；
5. 崩溃恢复若只见 intent：先查询世界或幂等键，禁止直接重做。

无法查询且动作非幂等时，转 `NEEDS_INPUT` 或 `UNVERIFIABLE`，不能猜测。

### 9.4 并发

- task 级 journal 单写锁；worker 可并行读独立 artifact。
- dispatch 捕获 `scope_version` 和输入 hashes；接收时执行乐观并发检查。
- stale result 保存为 artifact 并追加拒收事件，不更新 criterion ledger。
- 相同 idempotency key 的已接受事件返回原结果，不重复执行。

### 9.5 恢复算法

```text
1. 定位 task root；验证路径和权限。
2. 读取 checkpoint（≤2 KiB），验证其 cursor/hash。
3. 若缺失或失配，由 sealed segments + active segment 运行 reducer 重建。
4. 验证 active artifact refs 的存在和 hash；缺失则标为证据失效。
5. 检查悬空 EFFECT_INTENDED；先观测世界，禁止盲重放。
6. 重新派生唯一 next_action。
7. 若所需输入可由 principal 提供 → NEEDS_INPUT；计划必须改变 → BLOCKED。
8. 返回有界恢复 envelope，不把 journal 原文交给主 Agent。
```

---

## 10. Approval、安全与不可逆动作

### 10.1 Approval record

批准必须绑定：

```text
action kind × exact target set × scope_version × risk summary × time window
```

记录用户原意、枚举后的目标集、批准者、失效条件。批准不跨目标、不跨实例传递。

### 10.2 Delta re-approval

执行前重新计算实际动作风险。以下任一变化必须重新批准：

- 目标集扩大或身份改变；
- 从私域变成共享/公开；
- 可逆性降低；
- 爆炸半径上升；
- 撤销窗口缩短；
- 错误从显性变成静默；
- `scope_version` 改变。

### 10.3 中断前不变量

在等待用户输入前：

- 不开始不可回滚副作用；
- 已开始的可逆步骤必须处于自洽状态；
- interruption payload 可序列化且只含一个决策；
- 明确不回复时默认动作，默认必须是 `NO_ACTION` 或安全回滚。

---

## 11. Criterion ledger 与终态纯函数

### 11.1 Ledger

```json
{
  "criterion_id": "c-1",
  "scope_version": 2,
  "type": "STATE",
  "required_rung": "E2",
  "max_rung": "E4",
  "achieved_rung": "E2",
  "state": "SATISFIED",
  "evidence_refs": ["a-..."],
  "checked_at": "...",
  "acceptor_ref": null
}
```

状态：`SATISFIED | VIOLATED | UNTESTED | UNTESTABLE | MOOT`。

### 11.2 Outcome

V2 对外采用五种 outcome status，其中 `DONE / PARTIAL / BLOCKED / UNVERIFIABLE` 是可 seal 的终态，`NEEDS_INPUT` 是持久化、可恢复的中断态。它们共用同一套 reducer 和报告契约，但只有前四种会产生 `GOAL_TERMINATED`。不单设 `FAILED`；明确失败、方案证伪或尝试穷尽归入：

```text
BLOCKED(reason = FALSIFIED | EXHAUSTED | PLAN_CHANGE_REQUIRED)
```

理由：`FAILED` 不能提供额外恢复语义，反而会与 `BLOCKED`、`VIOLATED` 重叠；具体失败性质由 reason 保留。若计划虽失效但控制器已能确定合法替代计划，则回到 `PLANNING`，不得滥用 `BLOCKED`。

```text
if constraint violated or delivered state incoherent:
    BLOCKED
else if a named principal-provided key can resume same plan:
    NEEDS_INPUT          # phase/interruption，不是终态 seal
else if any in-scope criterion is VIOLATED:
    BLOCKED(reason=FALSIFIED)
else if any criterion is UNTESTED due to unfinished attainable work:
    PARTIAL
else if any criterion cannot reach required_rung after highest available evidence:
    UNVERIFIABLE
else if approved scope is narrower than original goal or residual non-empty:
    PARTIAL
else if every in-scope criterion is SATISFIED at required_rung
        and evidence refs valid and scope_version approved:
    DONE
else:
    BLOCKED(reason=INVARIANT_VIOLATED)
```

`UNVERIFIABLE` 只允许在已取得最高可得证据后使用；尚未尽责验证是 `UNTESTED`，不能借此结束。

### 11.3 终态必带字段

| 终态 | 必带内容 |
|---|---|
| `DONE` | scope version；逐 criterion 证据指针与等级；constraints 结果 |
| `PARTIAL` | coherent 已完成集；未完成集；residual；责任人与 next action |
| `BLOCKED` | reason；缺口；尝试；为何必须改计划；安全状态/回滚结果 |
| `UNVERIFIABLE` | 已达最高等级；上限原因；谁能最终判定；已有产物 |
| `NEEDS_INPUT` | 单一问题；所需主体；恢复 token；默认安全动作（作为中断） |

所有结果都必须有 handoff；永不空手而归。

---

## 12. 上下文与存储预算

| 对象 | 硬上限 | 处理方式 |
|---|---:|---|
| `SKILL.md` | 6 KiB | 超出则拆协议，不扩大入口 |
| checkpoint | 2 KiB | reducer 失败，不截断语义字段 |
| worker input envelope | 2 KiB | dispatch 拒绝 |
| worker 总启动载荷 | 16 KiB | dispatch 前拒绝 |
| worker output envelope | 1 KiB | Proxy 投影；仍超限则固定错误 envelope |
| journal event | 4 KiB | payload 转 artifact |
| active journal segment | 1 MiB / 2,000 events | rollover |
| 正常恢复给主模型的总载荷 | 4 KiB | 后台 reducer 后再返回 |
| 单 artifact（默认） | 8 MiB | 流式截断；完整性证据失效 |
| 主 Agent直读长文件 | 0 次 | 必须经 worker/proxy |
| 测试/搜索/完整 diff 原文进主上下文 | 0 bytes | artifact + envelope |

预算选择依据：沿用已验证的 checkpoint≤2 KiB、envelope≤1 KiB、dispatch≤2 KiB、恢复≤4 KiB基线；对 worker 启动增加 16 KiB总载荷硬门，直接覆盖本轮“继承上下文导致 Prompt is too long”的真实反例。具体 token 数不作为门禁，因为模型和编码不同。

---

## 13. 跨领域行为示例

| 目标 | 主要判据 | 正确行为 |
|---|---|---|
| 重构模块使其可测 | `BEHAVIOR + NEGATIVE` | 测试 E3；负向检查限定范围；可到 DONE |
| 市场调研并给建议 | `ARTIFACT_PROPERTY + JUDGMENT` | 来源覆盖可到 E3；建议质量等 acceptor E4，否则 UNVERIFIABLE |
| 写一封有说服力的信 | `JUDGMENT` | 先小样获取风格判断；写完不等于被认可 |
| 整理 3000 个文件 | `STATE + NEGATIVE` | 执行前枚举目标集并批准；完成后计数和独立读回 |
| 取消外部订阅 | `STATE` | 请求成功只是 E1；需状态读回/回执，否则 UNVERIFIABLE |
| 让房东修锅炉 | `EFFECT + JUDGMENT` | 交付可达沟通前缀和交接物；原目标 PARTIAL |
| 学懂分布式共识 | `KNOWLEDGE` | 材料不是学会证据；由用户自评/测验确认 |

---

## 14. 与 V1 及输入材料的取舍

### 14.1 保留但重做

| 机制 | V2 处理 |
|---|---|
| HARD-GATE 与 terminal-state 句式 | 作为入口不可破坏约束，同时用于上下文保护 |
| 惊讶测试 | 作为提问兜底 |
| Defeater | 保留 Steel-man → Attack，结果结构化 |
| 依赖测试 | 成为唯一并行判据之一 |
| 决策复刻铁律 | 只记录会改变目标复刻结果的决策 |
| “无发现也必须告知” | worker envelope 可明确 `no_finding`，禁止编造 |
| 五段式对齐卡 | 从需求领域抽象为 Goal Alignment Card |
| Frontier 不持久化 | 保留并升级为硬约束 |

### 14.2 调整

- 固定十步澄清法 → 槽位敏感度 + 信号方法路由。
- Event Sourcing → 有界事实 journal + 可重建 checkpoint。
- “测试命令验证” → criterion 类型 + E0–E5 evidence contract。
- “至少 3 个任务” → 一个可验证短步；任务数量由目标形状决定。
- 主 Agent fresh RUN/READ → 独立 verifier 读取原文，主 Agent只收证据投影。
- prompt 中要求 worker 简短 → Proxy 在摄入前实施强制字节门。
- `ace task done` → Skill 内 `GOAL_TERMINATED` + sealed manifest，不依赖外部 CLI。

### 14.3 否决

- 完整 CQRS、事件迁移平台和“重放外部世界”。
- V1 四写状态面和无界 `context.md`。
- 多个 Skill 对并行策略各自定义真相。
- 将所有方法论全文加载后再在 prompt 内用 `[IF]` 跳过。
- Agent 自造 rubric 验收主观质量。
- 仅靠 JSON schema 宣称输出可信。
- 仅限制 worker 输出，不限制启动输入。
- 为 DRY 把私有协议移入目录外 `shared/`。

---

## 15. 实施路线

### Phase 1：纯数据内核

- 完成 schemas、semantic validators、journal append、reducer、outcome 纯函数。
- 用 fixture 覆盖合法/非法转移、scope version 和 evidence rung。
- 不接真实 worker 或副作用。

### Phase 2：Proxy 与隔离调度

- 实现流式 capture、artifact store、manifest、字节门和固定拒收 envelope。
- 建立 clean-context backend 适配层；证明聊天历史未注入。
- 注入超长输入、恶意路径、伪造 evidence 和超长输出测试。

### Phase 3：理解与批准协议

- 实现信号 router、Frontier 派生、对齐卡、risk/approval guard。
- 用不同领域 fixture 验证不产生固定问卷和软件偏见。

### Phase 4：恢复与副作用

- 实现 segment rollover、checkpoint 重建、悬空 effect intent 恢复和幂等查询。
- 故障注入覆盖每个持久化边界。

### Phase 5：Skill 编排与渐进披露

- 写薄 `SKILL.md` 和条件协议。
- 运行静态依赖扫描、入口体积测量和 transcript 实测。
- 以 V1/V2 并存方式灰度，不迁移 V1 任务。

### Phase 6：评估与校准

- 建立跨领域 gold scenarios 和“假 DONE”对抗集。
- 测量主 Agent实际摄入量，而非只看文件大小。
- 只有在回归数据支持时才调整风险→evidence 和预算。

---

## 16. 验收测试矩阵

| ID | 场景 | 预期 |
|---|---|---|
| A01 | 扫描 V2 内全部相对 Markdown/脚本引用 | 无 `shared/`、V1、其他 Skill 私有文件；内聚率 100% |
| A02 | 删除目录外 shared 后运行全套测试 | V2 不受影响 |
| C01 | checkpoint 序列化为 2049 bytes | reducer 拒绝，不静默截断 |
| C02 | input envelope 2049 bytes | `DISPATCH_REJECTED`，worker 未启动 |
| C03 | 总启动载荷 16385 bytes | 启动前拒绝，记录组成字节 |
| C04 | worker 输出 10 MiB | 原文流式受控落盘；主模型只收到 ≤1 KiB envelope |
| C05 | worker 返回非法 JSON | `RESULT_REJECTED`；原文 pointer 可诊断，正文不进模型 |
| C06 | JSON 合 schema 但 artifact 不存在 | semantic validation 失败 |
| C07 | path 含 `../` 或 symlink 逃逸 | 拒绝且不访问根外文件 |
| C08 | worker 基于旧 scope version 返回成功 | artifact 保留，ledger 不更新 |
| J01 | event 写入后 checkpoint 前崩溃 | 恢复重放 reducer，next action 唯一 |
| J02 | checkpoint 临时文件写一半崩溃 | 忽略临时文件，从 journal 重建 |
| J03 | segment 达 1 MiB | seal + rollover；hash 链连续 |
| J04 | 两个 writer 同 seq 竞争 | 只有一个成功，另一个重读 cursor |
| E01 | 只有外部 API 200 响应 | 只记 E1，不判 STATE satisfied |
| E02 | 外部查询读回已生效 | 达 E2，按 required rung 更新 |
| E03 | 悬空 `EFFECT_INTENDED` 后恢复 | 先查询/idempotency，不重复副作用 |
| E04 | `JUDGMENT` 无 acceptor | 最高 UNVERIFIABLE，不自评 DONE |
| E05 | `NEGATIVE` 写成“没有任何问题” | 规划拒绝，要求限定检查面 |
| O01 | 全 criteria 满足且证据等级足够 | reducer 唯一得出 DONE |
| O02 | 静默缩范围但部分判据满足 | 不得 DONE；PARTIAL 或阻止 scope 变更 |
| O03 | coherent 子集完成、residual 明确 | PARTIAL + handoff |
| O04 | 计划被反证必须改变 | BLOCKED(reason=FALSIFIED/PLAN_CHANGE_REQUIRED) |
| O05 | 用户提供批准后可原计划恢复 | NEEDS_INPUT，带单问题和 resume token |
| O06 | 尚未运行可用验证却声称不可验证 | 不允许 UNVERIFIABLE，保持 UNTESTED |
| R01 | 高爆炸半径批量操作未枚举目标集 | approval guard 阻止执行 |
| R02 | 已批准 10 个目标，实际变 11 个 | delta re-approval |
| R03 | 有 access 无 authority | NEEDS_INPUT，不执行 |
| U01 | 输入仅为“做批量导入” | 先重写世界差量，不直接实现方案 |
| U02 | 可查事实缺失 | 分派 discovery worker，不询问用户 |
| U03 | 一轮包含多个相互依赖问题 | 只发最上游承重决策 |
| U04 | 旧 Frontier 在回答后仍被保存 | 测试失败 |
| X01 | 软件、调研、写作、文件、外部系统、线下、学习七类样例 | 均使用同一状态机，不硬套代码验证 |
| X02 | worker backend 默认继承主会话 | backend 判定不合格，拒绝调度 |
| X03 | 主 Agent尝试直接读取 raw artifact | 协议测试失败，必须经 summarize/proxy |
| X04 | 完整测试日志、搜索结果或 diff 返回主模型 | 摄入审计为 0 bytes，否则失败 |
| X05 | 正常恢复路径 | 主 Agent总读取 ≤4 KiB |

### 16.1 实测要求

静态文件大小只是初筛。实现验收必须从真实 transcript 统计：

- Skill 激活注入字节/token；
- 单次 worker 启动实际载荷；
- worker 原始结果进入主模型的字节数；
- 正常恢复主模型摄入量；
- 拒收路径是否真的在模型摄入前发生。

不能以 `SKILL.md` 大小代替 transcript 实测。

---

## 17. 可机械检查的不变量

```text
I1  outcome == DONE 只能来自 derive-outcome.mjs。
I2  scope_version 变化必须存在 decider 批准的 SCOPE_CHANGED。
I3  worker 不可写 journal/checkpoint/manifest index。
I4  主 Agent不可接收 raw_output artifact 内容。
I5  accepted claim 必须引用存在且 hash 匹配的 evidence。
I6  EFFECT_INTENDED 无匹配 observation 时不可盲重放。
I7  checkpoint.cursor 必须指向已验证 event hash。
I8  next_action 在所有非终态 checkpoint 中恰好一个。
I9  Judgment/Knowledge 无 acceptor evidence 时不可 SATISFIED。
I10 V2 私有运行时引用不得逃出 auto-goal-v2 目录树。
I11 DISPATCH_REJECTED 不得产生 WORKER_DISPATCHED。
I12 stale scope result 不得更新 ledger。
I13 Frontier 不得出现在任何持久化 schema。
I14 E1 不得满足要求 E2+ 的 criterion。
I15 所有终态都有 residual/handoff 字段，即使 residual 为空。
```

---

## 18. 未决但不阻塞本设计的问题

1. 16 KiB worker 启动硬门和 8 MiB artifact 默认上限需在实现期通过 transcript 与领域样例校准；只能收紧或经评审放宽。
2. clean-context backend 的具体 Claude Code/API 适配接口需做 capability spike；若平台无法提供摄入前拦截，V2 不应以普通 Agent 调用降级上线。
3. 风险到 evidence 的首版映射刻意保守；后续可增加分层策略，但不能降低 `JUDGMENT/KNOWLEDGE` 的判定权边界。
4. task 目录最终的长期保留/清理策略属于宿主运维策略；V2 只负责 seal 和 manifest，不把外部归档机制作为正确性依赖。

这些问题影响实现参数或平台适配，不改变架构边界。

---

## 19. 评审结论

本设计对 V1 的核心问题给出一一对应的结构性解法：

- 角色混淆 → 薄主控 + 单职责 worker；
- 上下文软建议 → 输入/输出双端硬预算与 Proxy；
- 回传无界 → 摄入前落盘和有界 envelope；
- 恢复语义缺失 → event cursor、checkpoint、唯一 next action；
- 并行冲突 → 单一依赖测试和默认串行；
- 多写漂移 → journal 单一事实源 + 派生投影；
- 软件工程偏见 → Goal/Mandate、criterion 类型和证据阶梯；
- 假 DONE → ledger 纯函数终态；
- 私有依赖外溢 → 100% Skill 目录内聚。

因此，`auto-goal-v2` 可以进入实现评审；但在 clean-context backend 和摄入前 Proxy 通过实测前，不应声明架构已落地。
