# Auto Goal v3 深度诊断与重构蓝图

## 结论

用户的直觉基本成立：**v1 的核心抽象比 v3 更稳健**。原因不是 v1 功能更多或文本更短，而是 v1 主要表达跨目标成立的工作流不变量，把具体认知方法下沉到共享协议；v3 则把“决策树 → Frontier → 叶子拆分”这一种方法升级成了所有开放目标的本体模型。

v3 也有真实进步：它明确区分可查事实与用户意图，引入问题依赖排序、可证伪假设、独立 verifier 和 `UNVERIFIABLE`。问题在于这些能力被绑在一个过强的树模型上，而最重要的验收闭环只停留在提示词层，未被机械协议守住。

一句话概括：

> **v1 是“通用不变量 + 可替换协议”；v3 是“单一认知模型 + 很多正确局部规则”，并且把严格性放错了层。**

---

## 1. v1 的核心抽象

v1 的真正内核不是某种任务树，而是六个不变量：

1. **先理解和对齐，再产生副作用**：修改前必须有用户确认，见 `plugin/skills/general/auto-goal/SKILL.md:20-32`。
2. **先定义完成，再执行**：完成标准先于工作展开，见 `plugin/skills/general/auto-goal/SKILL.md:73-79`。
3. **按依赖关系调度工作**：可并行工作并行，有依赖则串行，见 `plugin/skills/general/auto-goal/SKILL.md:83-101`。
4. **用新鲜证据验证，不用执行叙述宣告完成**：见 `plugin/shared/verification-protocol.md:1-40`。
5. **状态、结论和项目决策外化**：任务状态、上下文与跨任务决策各有位置，见 `plugin/skills/general/auto-goal/SKILL.md:132-172`。
6. **完成包含关闭生命周期**：验证、归档、经验提取是结束协议，见 `plugin/skills/general/auto-goal/SKILL.md:105-154`。

其抽象层次是：

```text
Goal
  ├─ Understanding contract
  ├─ Alignment gate
  ├─ Work dependency graph
  ├─ Verification gate
  └─ Durable lifecycle
```

v1 不规定目标必须长成树、问题必须按某种分类、产出必须来自树叶。因此它能覆盖软件交付、研究、学习、排障、方案比较等不同拓扑。

### v1 为什么显得更“科学”

不是因为它用了更多术语，而是因为它更接近科学方法的层次分离：

- **事实与假设分开**：UNKNOWN 需要探索或转入澄清，见 `plugin/shared/understanding-protocol.md:42-69`。
- **主动找反证**：Steel-man 后搜索 rebutting / undercutting defeater，见 `plugin/shared/understanding-protocol.md:72-99`。
- **结论必须有观测证据**：验证必须 fresh run，并读完整输出，见 `plugin/shared/verification-protocol.md:21-40`。
- **方法可替换**：理解、对齐、并行、验证是协议边界，不是唯一数据结构。

但 v1 并非没有问题：`新洞察 ≥1`、`假设 ≥2` 等质量门槛是未经校准的代理指标（`plugin/shared/understanding-protocol.md:132-151`）；共享协议级联加载也增加上下文成本；验证仍主要依赖模型遵循提示词，缺少 criterion identity 的机械闭环。重构不应简单回退 v1，而应保留它的抽象层次并补上契约。

---

## 2. v3 的核心模型与控制流

v3 把流程固定为：

```text
UNDERSTAND → GRILL → ALIGN → EXECUTE → ACCEPT
```

并引入三个核心数据结构或方法：

1. **决策树**：节点是待定决策，边是取值，叶是具体行为，见 `plugin/skills/general/auto-goal-v3/SKILL.md:43-52`。
2. **Frontier**：选取祖先已解决、影响计划且只能由用户回答的问题，见 `plugin/skills/general/auto-goal-v3/SKILL.md:54-65`。
3. **叶子派发**：按决策树叶子拆子目标，再主要按写入文件集合判断并行性，见 `plugin/skills/general/auto-goal-v3/SKILL.md:77-85` 和 `references/dispatch.md:5-39`。

状态脚本 `goal.py` 承担目录、state、任务、树快照、verdict 聚合和归档；语义判断刻意留给模型，见 `scripts/goal.py:1-13`。

这条路线相对 v2 去掉“模型先理解语义、脚本再重实现语义”的双重付费是正确的。但“脚本不做语义判断”被扩大成了“脚本不守语义对象的身份与完整性”，这是两回事。

---

## 3. 按严重度排序的问题

## P0 — 验收标准与 verdict 没有身份绑定，独立验收可被伪造结构穿透

### 证据

`init` 允许零条完成标准，只打印警告但成功返回（`scripts/goal.py:82-120`）。

`accept-report` 只检查：

- verdict 数量等于标准数量；
- verdict 值属于三个枚举；
- evidence 非空。

见 `scripts/goal.py:220-260`。

它不检查：

- criterion 是否非空；
- verdict `id` 是否唯一；
- `id` 是否对应某条 criterion；
- 是否每条 criterion 恰好被覆盖一次；
- criterion 是否仍是 ALIGN 时用户确认的原文；
- verifier 是否真的收到过该 criterion。

### 变异实跑

已实跑确认：

1. `goal.py init` 使用 0 个 `--criteria` 仍成功；
2. 对多条标准提交完全不绑定标准、且重复 `id=999` 的 PASS verdict，`accept-report` 仍成功聚合。

因此当前门禁证明的是：

> “存在若干条长得像 verdict 的 JSON。”

它没有证明：

> “用户确认的每条完成标准都有且仅有一条现场证据判定。”

### 影响链

```text
ALIGN 确认标准
  → init 可丢失/省略标准
  → verifier 输出可错位或重复
  → accept-report 仅按数组位置展示
  → tally 全 PASS
  → done 允许归档
  → 系统对用户声称完成
```

这是最高严重度，因为 v3 将“独立验收”作为核心进步，但实现允许它静默失去验收对象。

### 根因

把“语义判断不进脚本”误解成了“契约完整性也不进脚本”。脚本不应判断证据是否足够，但必须机械保证 criterion 集合的**非空、稳定身份、双射覆盖和不可静默漂移**。

---

## P1 — 把决策树当通用目标本体，抽象过拟合

### 证据

v3 强制：节点是决策、边是取值、叶是行为，并要求树深至少 2（`references/grill.md:5-27`）；执行又强制从叶子拆任务（`references/dispatch.md:5-16`）。

### 为什么不成立

开放目标不只有树拓扑：

- **研究目标**通常是“假设 → 实验 → 更新假设”的循环；
- **排障目标**是证据逐步更新后验概率，不是预先枚举互斥分支；
- **学习目标**是能力图或知识依赖 DAG；
- **工程目标**常有跨分支共享约束，决策之间是 DAG；
- **探索性目标**的可选项本身要靠实验才能生成，建树时并不存在。

树要求每个节点单父、分支互斥。现实中的权限、容量、兼容性、时序等约束会同时作用于多个决策。强行树化只有三种结果：复制节点、丢失交叉约束，或把“话题”伪装成决策。

“树深 ≥2”尤其不是质量证据。一个目标可能只有一个真正方向性决策；为了过自检而制造第二层，反而增加虚假复杂度。

### 影响链

```text
所有目标必须树化
  → 非树关系被扭曲/复制
  → Frontier 基于错误祖先关系
  → 问题顺序或选项框架错误
  → 叶子不等于独立交付物
  → 拆分和派发继承错误结构
```

### 正确定位

“决策树”应是**可选视图/启发式**，只在存在明显互斥方案和条件分支时使用。通用内核只需要“未决项及其依赖关系”，其最弱充分结构是 DAG，不是树。

---

## P1 — Frontier 是好调度规则，却被绑死在坏数据模型上

Frontier 的四个条件本身有价值：未决、前置已定、答案会改变行动、只能由用户提供（`SKILL.md:54-65`）。它有效避免固定问卷和把用户当搜索引擎。

问题是 Frontier 不需要决策树才能成立。它只需要：

```text
Uncertainty {
  id, kind, depends_on, owner, impact, status
}
```

其中 `kind` 可以是 decision、fact、assumption、risk、hypothesis；`owner` 可以是 user、agent、environment。v3 把一个通用的“就绪队列选择器”误写成了树的专属概念，导致好机制不能独立复用。

---

## P1 — “唯一判据是写入面”对并行安全作了错误的充分性声明

`references/dispatch.md:18-29` 声称独立性的唯一判据是写入文件集合。

写入面无交集只排除了文本合并冲突，不能排除：

- B 读取 A 将修改的 API/schema/config；
- 两个任务修改不同文件但共同改变同一行为契约；
- 两者操作同一数据库、队列、远程环境、生成目录或 git index；
- 测试、构建、端口、临时目录等共享资源冲突；
- 集成顺序本身影响正确性。

因此它最多是一个强信号，不是“唯一判据”。v1 的抽象问题“如果 A 的结果完全不同，B 的执行方式会变吗？”（`plugin/shared/parallel-protocol.md:7-12`）更接近真实语义依赖。

正确模型应是资源冲突 + 信息依赖：

```text
parallel(A, B) iff
  no dependency edge
  and conflict(resources(A), resources(B)) == false
```

资源至少包含 reads、writes、external side effects、exclusive runtime resources。

---

## P1 — 状态单一真相源名义上存在，运行时实际分裂

`SKILL.md:105-113` 要求“状态变更走 goal.py，不手写 state.json”，但实际存在三套状态：

1. `goal.py` 管理的 `.ace/tasks/.../state.json`；
2. Claude Code TaskCreate/TaskUpdate 的 UI task 状态；
3. 模型脑内的阶段、Frontier、假设、决策树和证据状态。

`goal.py` 没有 phase、decision、assumption、criterion 更新命令；`context.md` 和项目决策日志仍由模型直接写；TaskCreate 后也没有自动同步进 state。所谓“走 goal.py”只覆盖部分字段，无法成为单一真相源。

决策树快照还是可选的 Markdown copy（`scripts/goal.py:197-215`），脚本无法检查它与任务、问题、标准是否一致。恢复时读到的是多个可能漂移的投影。

正确做法不是把所有模型判断塞进脚本，而是明确：

- **规范状态**：criterion identity、work item identity、状态迁移、归档；
- **叙事产物**：分析过程、树视图、研究笔记；
- **UI 投影**：TaskCreate/TaskUpdate，可丢弃并重建。

只有第一类必须机械一致。

---

## P2 — 方法论规则过度绝对化，代理指标被当成目标

典型条目：

- 树深必须 ≥2（`references/grill.md:24-27`）；
- 多步或外部副作用目标必须问“半成功探针”（`SKILL.md:29-30`）；
- ≥2 个不同文件就强制并行（`SKILL.md:79-83`）；
- TaskCreate 必须拆成 ≥3 项（`SKILL.md:75`）。

这些都可能是有用启发式，但不是跨目标不变量：

- 风险已由既有事务规范决定时，重复问半成功会浪费用户回合；
- 两个文件可能强语义耦合；
- 一个目标可能只有两个自然工作单元；
- 一个高质量问题模型可能只有一层。

科学性不等于规则可计数。真正科学的规则应该能说明触发条件、观测量、失败条件和适用边界。v3 多处使用固定阈值代替这些内容。

---

## P2 — 分阶段加载降低峰值，但没有形成真正可验证的上下文预算

### 静态测量

当前文件实测字节：

- v1 `SKILL.md`：7,259 B；共享协议集合（理解、对齐、并行、验证、上下文、经验、决策、state）：32,209 B；静态唯一文本约 39.5 KB。
- v3 `SKILL.md`：6,028 B；最大单份 reference `grill.md`：7,336 B；声明的单阶段峰值为 13,364 B；三份私有 reference + decision protocol 的静态唯一文本约 30.8 KB。

因此，从静态依赖包络看，v3 确实比 v1 收敛；分阶段加载也是正确方向。

### 不能外推的结论

静态文件大小不等于真实 transcript 注入量。重复 Read、协议级联、subagent prompt、tool result 和恢复重读都会放大。此前 v2 的 1,002,190 字符实测只能证明 v2 的级联加载失败，**不能作为 v3 相对 v1 更省的直接证据**。

目前没有同一 host、同一任务语料、同一工具策略下 v1/v3 的 transcript A/B 数据。因此只能下“静态包络更小”的结论，不能下“真实上下文成本已更低”的结论。

### 结构性问题

v3 为了守 `SKILL.md ≤ 6 KiB` 已用到 6,028/6,144 B，余量仅 116 B。预算若没有仓库测试门禁，下次编辑会静默超标。更重要的是，预算应测真实摄入，而不是只守源码体积。

---

## 4. v3 中应保留、合并、下沉、删除的能力

## 保留为内核不变量

- 修改前显式 ALIGN 门禁；
- “可查事实”和“只有用户知道”分流；
- 完成标准先于执行；
- 假设显式化，并记录 defeat condition；
- fresh evidence，不用执行者叙述宣告完成；
- verifier 与执行过程隔离；
- `PASS / FAIL / UNVERIFIABLE` 三态；
- 状态与产物持久化；
- 决策日志、恢复与归档生命周期；
- 三次同向失败后质疑前提。

## 合并

- `UNDERSTAND + GRILL` 合并为 **DISCOVER loop**：查事实、更新不确定项、只在 frontier 有用户所有项时提问；GRILL 不是独立业务阶段，只是 Discover 的一种动作。
- `ACCEPT + archive/experience` 合并为 **VERIFY/CLOSE**，但验证判定和生命周期关闭保持两个明确 gate。
- v1 understanding protocol 与 v3 grill 中重复的 UNKNOWN、Defeater、Socratic 内容合并为一份最小 clarification contract。

## 下沉为可选策略/Playbook

- 决策树：仅用于互斥方案和条件分支；
- Frontier：保留为不确定项 DAG 的 ready selector，而非树概念；
- 苏格拉底六问：作为问题生成器；
- 半成功探针：由“存在部分提交风险/不可逆副作用”触发；
- 按叶子拆分：仅用于树适用时；
- 写入面检查：并行冲突检测的一项输入；
- Defeater 搜索力度：按风险分级，而非所有任务相同。

## 删除

- “所有开放目标都必须是决策树”；
- “树深 ≥2”；
- “子目标必须来自树叶”；
- “写入面是并行独立性的唯一判据”；
- 固定 `≥3 tasks`、`≥2 files` 等被当成正确性门禁的数量阈值；
- 多处重复的口号和同义硬规则；
- `goal.py tree` 作为内核命令——树应是普通 artifact，不是生命周期状态。

---

## 5. 更小的重构内核

建议用四个契约和四阶段状态机，而不是再发明一个更复杂的目标模型。

## 5.1 四阶段

```text
DISCOVER → ALIGN → EXECUTE → VERIFY/CLOSE
```

- **DISCOVER**：建立 Goal Contract；查可查事实；维护 uncertainty DAG；按 frontier 选择向用户提问或自行探索。
- **ALIGN**：展示并确认 Goal Contract。确认后冻结 criterion identity。
- **EXECUTE**：从 Work Graph 选 ready items；按依赖和资源冲突调度；每项产生可独立检查的产物。
- **VERIFY/CLOSE**：独立 verifier 对冻结 criteria 逐条取证；机械校验双射；无 FAIL 才允许关闭，UNVERIFIABLE 只能以 PARTIAL 语义交付。

GRILL、决策树、并行不是阶段，而是阶段内部可替换策略。

## 5.2 Goal Contract

```json
{
  "outcome": "要造成的可观察世界差量",
  "scope": {"in": [], "out": []},
  "criteria": [
    {"id": "C001", "text": "...", "text_sha256": "..."}
  ],
  "assumptions": [
    {"id": "A001", "claim": "...", "defeat_when": "...", "status": "open|supported|refuted"}
  ],
  "unknowns": [
    {"id": "U001", "kind": "fact|decision|risk|hypothesis", "owner": "agent|user|environment", "depends_on": [], "impact": "..."}
  ]
}
```

它不规定 unknowns 是树；树、表、研究循环都只是其视图。

## 5.3 Work Graph

```json
{
  "id": "W001",
  "goal": "...",
  "outputs": ["..."],
  "criterion_ids": ["C001"],
  "depends_on": [],
  "resources": {
    "reads": [],
    "writes": [],
    "external": [],
    "exclusive": []
  },
  "status": "pending|running|done|blocked"
}
```

并行判据是“无依赖 + 无资源冲突”，不是文件数量阈值。

## 5.4 Evidence Ledger

verifier 返回：

```json
{
  "criteria_sha256": "冻结标准集合的 hash",
  "verdicts": [
    {
      "criterion_id": "C001",
      "verdict": "PASS",
      "evidence": [{"kind": "command", "source": "npm test", "observed": "529 pass, 0 fail"}]
    }
  ]
}
```

脚本只做机械保证：

1. criteria 非空；
2. ID 唯一且稳定；
3. report hash 等于冻结集合；
4. report 的 criterion IDs 与 state 中 IDs 完全相等；
5. 每条恰好一个 verdict；
6. verdict/evidence 结构合法；
7. FAIL 阻止关闭；UNVERIFIABLE 使最终交付状态为 partial，而非 completed。

脚本仍然**不判断证据内容是否真的证明标准**。这保持“模型做语义、程序守契约”的正确边界。

## 5.5 最小文件布局

```text
auto-goal/
├─ SKILL.md                 # 四阶段 + 硬不变量 + 路由
├─ references/
│  ├─ discover-align.md     # uncertainty/frontier/提问/确认
│  ├─ execute.md            # work graph + 调度 + prompt
│  └─ verify-close.md       # verifier 契约 + 关闭语义
└─ scripts/
   └─ goal.py               # identity、状态迁移、证据双射、归档
```

不再把某个认知视图做成脚本一级命令。

---

## 6. 迁移路径

## M0 — 冻结并标记 v3 为实验版

不继续往现有文本叠规则。先记录当前行为基线和已知失败臂。

## M1 — 先修验收契约，不动认知流程

这是唯一应优先落地的修复：

- `init` 拒绝空 criteria；
- 初始化时生成稳定 criterion IDs 和集合 hash；
- verifier 改用 `criterion_id`；
- `accept-report` 校验完全双射、重复/缺失/未知 ID、hash 漂移；
- `done` 读取规范 verdict 重新计算，而不是盲信已存 tally；
- UNVERIFIABLE 对应 partial/blocked-close 语义，不允许被记录成全完成。

测试必须有四臂：完整、最小、缺失、伪造；并对实现侧做变异，证明门禁实际执行。

## M2 — 抽出 Goal Contract 和 uncertainty DAG

保留现有用户体验，但将 decision tree 降级为可选 artifact。Frontier 改为对 unknowns 的通用选择器。

## M3 — 替换叶子派发为 Work Graph

增加语义依赖和资源集合；写入文件只是 resources.writes。删除固定数量并行门槛，改为“存在两个 ready 且无冲突的 work item 时并行”。

## M4 — 收敛文档和状态所有权

- 合并 UNDERSTAND/GRILL；
- 明确 state 是规范数据、context 是叙事、Task UI 是投影；
- 删除 `tree` 内核命令；
- 消除 SKILL 与 references 重复规则；
- 给静态预算和真实 transcript 摄入分别建门禁/测量。

## M5 — 语料化 A/B 验证后再替换 v1/v3

至少覆盖：

1. 单一方向的软件目标；
2. 多方案选择；
3. 排障/根因研究；
4. 学习路线；
5. 外部副作用和部分失败；
6. 纯研究、标准部分不可验证；
7. 中断恢复。

指标：

- 用户提问轮数与无效问题率；
- 关键假设遗漏率；
- 错误树化/错误拆分率；
- criterion 覆盖和错配率；
- verifier 假 PASS 穿透率；
- 完成后返工率；
- 主会话真实 transcript 注入字符；
- 恢复后状态一致率。

没有失败臂和同任务对照，不能声称某一机制“必要”或“更科学”。

---

## 7. 对四个评价维度的最终判断

### 运行可靠性

v3 的独立 verifier 思路优于 v1 的通用验证，但当前 criterion identity 断裂使其核心承诺不可依赖。修复后才是真升级。

### 上下文成本

v3 的按阶段 reference 和“脚本不承载模型需核对的语义”是正确方向；静态包络比 v1 小。但真实 v1/v3 transcript 尚未 A/B，不能把 v2 的百万字符数据外推到 v1。

### 用户体验

Frontier 和“只问用户才知道的”明显更好；决策树、固定半成功问题和硬数量阈值则可能制造仪式感与无效往返。应保留选择器，删除强制本体。

### 交付质量

显式 criterion、独立取证、UNVERIFIABLE 都提高质量上限；缺少机械双射又降低质量下限。系统设计应先守下限，再优化提示词上限。

---

## 最终建议

不要回退到 v1，也不要继续修补当前 v3。采用：

> **v1 的抽象骨架 + v3 的优质局部机制 + 新的 criterion/evidence 机械契约。**

最小内核只回答四件事：

1. 我们要造成什么可观察结果？
2. 哪些不确定性必须先解决、由谁解决？
3. 哪些工作现在可执行且彼此无冲突？
4. 每条冻结标准是否有一一对应的独立证据？

决策树、苏格拉底问题、半成功探针、并行写入面都应是回答这四件事的工具，而不是目标本身。