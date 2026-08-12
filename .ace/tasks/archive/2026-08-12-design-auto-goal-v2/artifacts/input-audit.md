# auto-goal-v2 输入审计

> 审计对象：(1) `plugin/skills/auto-goal/**`（3 文件，11,107B）；(2) 归档报告 `auto-goal-context-redesign.md`（19,261B）；(3) `需求澄清经典方法论.md`（7,748B）；(4) `需求理解与澄清方法论.md`（23,798B）。附带核查 V1 实际依赖的 `plugin/shared/**`、`plugin/skills/requirement-understanding/**`、`src/commands/task.js`、`templates/ace/rules/*`，因为 V2 的"完全内聚"目标必须以真实依赖面为基准。
>
> 结论先行：V1 不是"需要精简的 Skill"，而是**一个把方法论、状态机、上下文治理、领域假设四件事混在同一层的编排器**。V2 若只做重写压缩，会复刻同样的四类缺陷。真正必须重新设计的是三条边界：**主 Agent 与 worker 的信息边界**、**Skill 与外部共享资产的依赖边界**、**通用目标与代码领域的假设边界**。

---

## 1. V1 现状：静态依赖面

### 1.1 目录自身很小，实际加载面很大

| 文件 | 字节 | 性质 |
|---|---:|---|
| `auto-goal/SKILL.md` | 7,259 | 入口，激活即入上下文 |
| `auto-goal/references/recovery.md` | 1,507 | 条件加载（"继续"时） |
| `auto-goal/references/state-template.md` | 2,341 | **纯转发**，正文只说"详细模板见 `../../shared/state-template.md`" |

Skill 目录合计 11,107B，但 `SKILL.md` 有 **8 处** `../../shared/` 引用（`SKILL.md:32,39,69,78,98,108,142,149` + 索引表 194-200），指向 7 个外部文件：

| 外部依赖 | 字节 | 加载性质（依据） |
|---|---:|---|
| `shared/alignment-protocol.md` | 4,882 | 强制（`SKILL.md:32`） |
| `shared/understanding-protocol.md` | 6,935 | **传递强制**（`alignment-protocol.md:11-13`），入口索引未声明 |
| `shared/decision-log-protocol.md` | 7,810 | 条件强制（`SKILL.md:142`，AskUserQuestion 回复后当轮） |
| `shared/context-discipline.md` | 1,491 | 强制（`SKILL.md:78`） |
| `shared/parallel-protocol.md` | 1,816 | 强制（`SKILL.md:98`） |
| `shared/verification-protocol.md` | 2,231 | 强制（`SKILL.md:108`） |
| `shared/experience-protocol.md` | 1,923 | 强制（`SKILL.md:149`） |
| `shared/state-template.md` | 5,121 | 措辞为"参考"，未明确 Read |

**外部正文合计 32,209B，是 Skill 自身目录的 2.9 倍。** V1 的"内聚度"实际约 26%（11,107 / 43,316）。这是 V2 "完全内聚"约束的量化起点。

### 1.2 归档报告的字节口径已复核

报告第 2.1 节的"对齐链 19,627B"= alignment 4,882 + understanding 6,935 + decision-log 7,810，逐项与文件实际大小一致。报告自身也标注了口径限制（UTF-8 字节 ≠ token，不含系统 prompt / 工具 schema / 对话历史）。**该口径可直接被 V2 复用为验收基线**，但 V2 应额外声明"内聚率"指标，因为报告只度量了体积，没有度量依赖方向。

---

## 2. V2 必须解决的问题

按"若不解决则 V2 会复刻"排序。P0/P1 沿用归档报告的严重性判断，并补充报告未覆盖的两项（G、H）。

### A. 主 Agent 承担了四种互斥角色（P1，架构性）

`SKILL.md` 同时要求主 Agent：解释协议（8 处 Read）、执行探索与实现、汇聚日志与状态（`SKILL.md:166-171` 要求 TaskUpdate + state.json + context.md + decisions.md 四处同步）、fresh 执行验证并完整阅读输出（`verification-protocol.md:24-33` 的 RUN/READ 步骤明确要求"完整阅读输出""不要只看最后一行"）。

**内部矛盾（已核实）**：`context-discipline.md:19-24` 要求"结果量大 → 委托 sub-agent，只回传结论"，而 `verification-protocol.md` 要求主 Agent 亲自 RUN + 完整 READ。两条规则在同一运行时同时为真，主 Agent 无法同时遵守。

### B. 上下文纪律没有执行力（P1）

`context-discipline.md` 全文是策略矩阵与"何时用/何时不用"的软性建议，**无字节预算、无拒收条件、无 gate、无工具边界**。对照同一目录下的 `alignment-protocol.md`（`<HARD-GATE>` + Red Flags 表 + "Terminal state = AskUserQuestion 工具调用"）与归档门禁（`SKILL.md:112-128`），结论是：**V1 里"制造上下文的规则"是硬门禁，"保护上下文的规则"是软建议**。V2 必须让两者对称。

### C. 回传无界（P1）

`parallel-protocol.md:25-31` 只对探索型模板写了"200 字内"，实现型（33-41）与 Review 型（43-55）**没有任何长度上限**。且这个限制写在 prompt 模板里，属于"请 worker 自律"，主 Agent 收到结果时正文已进入上下文——归档报告 5.3 节已正确指出"不能由主 Agent 在收到 Agent tool 结果后再判断超长"。V2 必须在**模型摄入前**拦截，这是 Tool Proxy 存在的唯一理由。

### D. 恢复语义缺失 + 路径错误（P0）

- `recovery.md:7` 的路径（`.ace/tasks/*/state.json`）正确；但 `templates/ace/rules/task-recovery.md:7` 与 `templates/ace/rules/context-hygiene.md:21,23` 仍指向旧的 `.tasks/*/state.md`（已 grep 确认）。存在两套互相矛盾的恢复指引。
- state schema（`shared/state-template.md`）只有 `tasks[].status/depends`，**没有 `next_action` / `gate` / `attempt` / `evidence_pointer` / `artifact_index`**。压缩后主 Agent 无法确定唯一下一步，只能重读 `context.md`（无界增长）或重新探索。
- `recovery.md:8` 只筛 `type=="simple"`，而 `state-template.md` 明确存在 `spec` / `spechub` 与 legacy `name` 字段兼容分支——恢复的类型过滤不完整。

### E. 并行规则存在相反硬约束（P0）

已 grep 三方核实：`auto-goal/SKILL.md:85-96` 表格要求"实现阶段 ≥2 个任务修改不同文件 → 单条 response 并行 Agent"；`parallel-dispatch/SKILL.md:21-27` 声明"并行实现计划任务 ❌，Apply 阶段必须串行"并给出铁律理由；`subagent-execute/SKILL.md:56-62` 声明"严格串行，即使标记 ⟂ 仍串行"。**同一运行时三个真相源冲突。** V2 若继续引用外部并行协议，冲突会被继承。

### F. 状态写入面过多（P1）

`SKILL.md:166-171` 定义四个写入面（FleetView TaskUpdate、state.json、context.md、project/decisions.md），且 `context.md` 是追加式叙事（`state-template.md` 示例含"过程记录/中间结论/已修改文件"，无长度约束）。四写没有一致性机制，任一遗漏即状态漂移；`context.md` 同时充当机器恢复源和人类报告，两个用途的体积要求相反。

### G. 领域假设泄漏——与"面向任意目标"直接冲突（归档报告未覆盖）

description 声称覆盖"目标达成 + 学习研究"，但实现处处假设代码仓库：

- `recovery.md:20` fallback 只有 `git log` + `git diff --stat`；
- `recovery.md:28-29` 验证清单写死"代码变更确实存在""编译错误、broken import"；
- `verification-protocol.md:15-19` 的 IDENTIFY 四选项中三项是代码/配置/架构，仅第四项"无自动化手段"兜底；
- `SKILL.md` 归档门禁绑定 `ace task done`（`src/commands/task.js` 确认存在 complete→archive），属项目内 CLI，隐含"目标在本仓库内"。

**后果**：非代码目标（学习、调研、写作、运维、数据分析）走到 VERIFY/RECOVER 时没有一等公民路径，只能落到兜底分支。V2 的"任意目标"必须表现为**能力/证据模型的抽象**，而不是 description 里多写一句。

### H. 两类意图共用单一流水线（归档报告未覆盖）

"目标达成"与"学习研究"在 V1 里共享同一强制序列：对齐 → state 初始化 → ≥3 个 TaskCreate → 执行 → 验证 → `ace task done` 归档。对纯学习/调研目标，`completion_criteria`（"可测试完成条件"）与"验证 Iron Law"（fresh 执行验证命令）语义不成立，`≥3 个离散任务`也是强加结构。V2 需要**同一状态机 + 按目标类型可变的证据契约**，而非两套流水线或一套硬塞。

---

## 3. 可复用机制（应保留并强化）

审计确认以下机制是 V1 的真实资产，V2 应保留其**意图**，但重新实现载体（因为内聚约束）：

| 机制 | 出处 | 为什么值得保留 | V2 的改造方向 |
|---|---|---|---|
| `<HARD-GATE>` + "违反形式 = 违反精神" | `SKILL.md:22-28` | 唯一被证明有效的 LLM 约束句式：给出 terminal state（工具调用）而非意图 | 复制到内聚目录；同时用于**保护**上下文的门禁，实现规则对称 |
| Red Flags 反合理化表 | `alignment-protocol.md:100-122`、`verification-protocol.md:106-116` | 直接命中 LLM 自我合理化路径（"这个任务很简单""应该没问题了"） | 保留表格形式，为 V2 新增行（如"worker 结果我先看一眼再判断长度"） |
| Terminal-state 判据 | `alignment-gate.md`、`SKILL.md:120-126` | 把"做了没做"变成可机械检查的事实（工具已调用 / 命令已成功） | 每个 V2 gate 都必须有 terminal state |
| 惊讶测试 | `alignment-protocol.md:86-96` | 一句话可执行的升级判据，成本极低 | 直接复用，作为 NEEDS_INPUT 的触发器 |
| 探索型 200 字上限 | `parallel-protocol.md:31` | 方向正确 | 升级为全 worker 类型的 envelope 字节硬上限 + 代理层拒收 |
| 依赖测试（"A 结果完全不同时 B 的执行方式会变吗"） | `parallel-protocol.md:8-12` | 比"是否修改同文件"更本质的并行判据 | 保留；同时消除 E 项的三方冲突（V2 内聚 → 单一真相源） |
| 决策落盘"复刻铁律" | `decision-log-protocol.md:29-45` | "换一个选择，复刻出的项目会不同 → 才落盘"是极优雅的准入判据，四类噪声分类准确 | 保留铁律与四类噪声；但 7,810B 全文加载不可接受，压缩为短契约 |
| 决策主/档案双文件（accepted vs superseded） | `decision-log-protocol.md:13-25` | 渐进披露思想：读取端天然零噪声 | 直接复用到 V2 的 artifact 索引设计 |
| 经验"无发现也必须告知" | `experience-protocol.md:31-35` | 阻止为仪式感编造经验 | 保留 |
| `ace task done` 原子 complete→archive | `src/commands/task.js:101-105` | 单命令 terminal state，幂等意图清晰 | ⚠️ 但它是外部 CLI，与内聚约束冲突——见 §6 冲突 3 |

---

## 4. 需求理解/澄清方法的路由方式（三种范式对比）

这是本次审计的关键发现：**同一问题域在仓库里存在三套并行实现**，V2 必须显式选择一种，不能再增第四套。

### 4.1 范式一：`shared/understanding-protocol.md` — 参数化协议（V1 当前用法）

- **路由机制**：调用方声明参数 `verify`（`none` / `artifact-grounding` / `code-impact`）与 `threshold`；协议内部用 `[IF verify=xxx]` 条件段分支（102-129 行）。auto-goal 的声明是 `verify=none, threshold={insight≥1, assumptions≥3, defeater=mandatory}`（174-181 行）。
- **方法论内核**：思考纪律（序/验/深/广/辨/简）、苏格拉底四追问、问题驱动探索（识别决策前提 → 定位 UNKNOWN → 目标性探索 → 充分性判定）、Defeater 搜索（Steel-man → Attack，分 Rebutting / Undercutting）、五维质量门槛表。
- **产出**：结构化 `understanding_result`（insights / assumptions / defeater_results / unknowns / grounding），显式作为下游输入。
- **优点**：单文件覆盖多调用方；`understanding_result` 是清晰的层间契约；Defeater 机制是三套里唯一的**主动反证**设计。
- **缺点**：一次性 6,935B 全量加载，`[IF]` 分支导致大部分正文对任一调用方都是无效载荷；被 alignment 传递 Read，成本对入口不可见。

### 4.2 范式二：`skills/requirement-understanding/**` — 信号驱动渐进加载

- **路由机制**：三层。① `SKILL.md`（2,263B）只做入口 + 5 条不可破坏规则 + 指向 `flow.md`；② `flow.md`（10,248B）是唯一真相源，Step 5 按**问题信号**决定是否读 `packs.md`；③ `packs.md`（4,373B）内含 9 行**路由表**（问题信号 → 优先方法 → 更新位置），只加载命中信号的检查包。
- **核心数据结构**：因果决策树（原始诉求 → 根因/机会 → 目标结果 → {成立条件, 能力与边界, 关键假设/风险, 完成证据}），节点状态四态（已知/未知/冲突/依赖）。
- **Frontier 机制（最有价值的设计）**：每轮从最新树**重新派生**可问问题集，回答后即失效，且明确"**不得把 Frontier 保存为长期状态、清单对象或独立产物**"。入选需同时满足四条件：未决 / 前置已解 / 影响实质 / **责任属用户**。
- **责任边界**：第 4 条件把"可查事实"强制路由给执行者查证，"价值取舍"才给用户——直接对应方法论的"不把用户当搜索引擎"。
- **Readiness 纵横双检**：纵向查因果链无断点，横向查同层闭合（业务域、交付类型、Micro/Normal 画像一致性）。
- **单一确认产物**：固定五段式需求对齐卡（需求/目标/非目标/关键假设/完成标准）+ 固定两选项审批（`通过，需求已对齐` / `拒绝，需要修正`）+ 明确列举"不算确认"的五种情况（沉默、"继续"、含条件同意、执行者代推断、只展示未调用工具）。
- **优点**：**这是三套里唯一同时解决了"渐进加载"与"防状态膨胀"的设计**。信号驱动路由 + Frontier 不持久化 + 唯一确认产物三者叠加，天然抑制上下文增长。
- **缺点**：面向需求/PRD 领域，术语（业务域、研发交付类型、PRD）与通用目标不完全匹配；`flow.md` 单文件 10,248B 仍偏大。

### 4.3 范式三：两份 demo 方法论文档 — 知识库（尚未被任何 Skill 引用）

`需求澄清经典方法论.md` 是 14 种方法的发散清单，每法给"核心机制/适用场景/**局限**"，并按功能横向归类：

| 功能 | 方法 |
|---|---|
| 挖掘假设 | 苏格拉底诘问、5 Whys |
| 穷举分支 | 决策树、Given-When-Then、Example Mapping |
| 取原始信息 | 访谈、问卷、观察、焦点小组、原型 |
| 对齐价值/目标 | Impact Mapping、JTBD、用户故事"以便…" |
| 固化为可验收 | 验收标准、GWT、3C-Confirmation |

其暗线判断值得直接引用：几乎所有方法都在对抗同一组敌人——**隐含假设、方案伪装需求、说做不一致、歧义与遗漏边界**。

`需求理解与澄清方法论.md` 是体系化十步法，对 V2 有直接价值的四个模型：

1. **需求方程式**：`需求 = 目标 + 使用者 + 场景 + 当前问题 + 期望结果 + 业务规则 + 范围边界 + 约束条件 + 验收标准`。
2. **四类信息分离**：事实 / 解释 / 假设 / 决策。核心洞察——"**假设被当作事实，方案被当作目标，偏好被当作约束，口头共识被当作验收标准**"。四个常驻问题："我们知道什么？我们认为是什么？我们还不知道什么？哪些事情已经决定？"
3. **推导链与最大反模式**：`业务背景 → 目标与成功指标 → 用户及真实问题 → 场景与现状流程 → 目标流程与系统职责 → 功能行为与规则 → 边界异常与非功能 → 验收标准 → 实现方案`；反模式 = `用户提出方案 → 研发直接实现`。
4. **停止条件（V1 完全缺失的部分）**：追问应在四处停止——已找到可度量业务结果 / 已定位用户真实任务 / 继续追问将进入组织战略而不影响当前决策 / 需求被证明只是方案需重定义问题。

另有可直接机械化的**歧义词扫描表**（支持、快速、自动、合理、必要时、一般、尽量、大量、实时、最近、异常、重复、管理员、相关数据）与六类歧义（名词/动词/数量/时间/权限/状态/例外），以及"只成功了一半，系统应该处于什么状态"这一高杠杆提问。

反模式清单里两条直接命中 V1 缺陷：**"一次问几十个问题"**（V1 无单轮问题数上限）、**"把所有问题都推给用户"**（V1 无"事实由执行者查"的责任边界）。

### 4.4 路由方式结论（给 V2 的建议）

三套并存本身就是缺陷。V2 应当：

1. **采纳范式二的路由架构**（信号驱动 + 三层渐进 + Frontier 不持久化 + 唯一确认产物 + 固定两选项审批），但把领域术语从"需求/PRD"抽象为"目标/期望结果"。
2. **保留范式一的 Defeater 与质量门槛**——范式二没有等价的主动反证机制，这是范式一的独有价值。
3. **把范式三降级为按信号加载的方法包正文**（对应 `packs.md` 角色），并**必须补入 V1/V2 都缺的停止条件与歧义词扫描表**。
4. **绝不再造第四套**：V2 内聚目录里的澄清协议应当是范式二的抽象版本，而不是范式一的复制版本。

---

## 5. "面向任意目标"专项检查

结论：**V1 只在 description 层面通用，在机制层面是代码专用的。** 证据见 §2.G。V2 需要的最小抽象：

| 需要抽象的点 | V1 的代码专用实现 | V2 应抽象为 |
|---|---|---|
| 完成证据 | 编译命令 + 测试（`verification-protocol.md:15-19`） | 证据类型契约：可执行验证 / 可观察产出 / 对照标准逐条检查 / 外部确认；每类都要有 terminal state |
| 恢复 fallback | `git log` + `git diff --stat`（`recovery.md:20`） | 事件日志优先；仓库信号仅作为可选补充源 |
| 恢复验证清单 | "编译错误、broken import"（`recovery.md:29`） | "声称的产出是否存在且与 evidence pointer 一致"（领域无关） |
| 归档 terminal state | `ace task done`（外部 CLI） | Skill 内脚本或明确声明的外部依赖（见 §6 冲突 3） |
| 任务结构 | 强制 ≥3 个 TaskCreate | 由目标类型决定的最小结构；学习/调研类不强加"可测试完成条件" |
| 能力边界 | 无 | 显式 capability / 授权 / 安全边界声明（context.md 已确认为 V2 约束，V1 完全没有对应机制） |

---

## 6. 冲突、重复、过度复杂点

### 冲突（同一运行时两条规则同时为真且互斥）

1. **验证隔离 vs 主 Agent 亲自验证** — `verification-protocol.md:24-33`（主 Agent fresh RUN + 完整 READ）vs `context-discipline.md:19-24`（大结果委托 sub-agent）。**必须在 V2 中裁决**：归档报告建议独立 verifier worker，主 Agent 只收证据摘要 + pointer。
2. **并行实现三方冲突** — `auto-goal/SKILL.md:85-96`（必须并行）vs `parallel-dispatch/SKILL.md:21-27`（Apply 必须串行，附铁律）vs `subagent-execute/SKILL.md:56-62`（严格串行）。V2 内聚后应只保留一条，并写明理由。
3. **内聚约束 vs 归档门禁依赖外部 CLI**（V2 新增冲突，context.md 已确认"私有依赖全部位于 `auto-goal-v2/` 目录树"）——但归档 terminal state 目前是 `ace task done`。**必须显式决策**：Skill 内脚本自建归档，或把 `ace` CLI 列为唯一允许的外部运行时依赖并说明理由。
4. **恢复路径双真相源** — `recovery.md`（`.ace/tasks/*/state.json`，正确）vs `templates/ace/rules/task-recovery.md:7` + `context-hygiene.md:21,23`（`.tasks/*/state.md`，过时）。

### 重复（同一知识多处表达）

1. **澄清方法论三套**（§4）——最严重的重复，约 47KB 正文覆盖同一问题域。
2. **state 模板两份** — `auto-goal/references/state-template.md`（2,341B，其中正文明确说"详细模板见 shared"）与 `shared/state-template.md`（5,121B）。前者是纯转发层，无信息增量。
3. **验证 Gate Function 两处** — `shared/verification-protocol.md` 与 `skills/verify/`（归档报告 §2.1 已标注约 5,272B 重复实现风险）。
4. **惊讶测试两处** — `SKILL.md:66-69` 摘要 + `alignment-protocol.md:86-96` 全文；摘要版信息完整，全文版几乎无增量。
5. **参考文件索引表与正文 Read 指令重复** — `SKILL.md:190-201` 的表格与 32/78/98/108/142/149 行一一对应，且表格漏了传递依赖 understanding-protocol（既重复又不完整）。

### 过度复杂

1. **decision-log-protocol 7,810B 换取一条 4 行条目** — 条目模板本身只有"标题 + 日期·状态 + 决策 + 否决"四项（协议自称"只有 5 项，其余一律不记"）。协议正文与产出体积比约 100:1。
2. **understanding-protocol 的 `[IF verify=xxx]` 三分支** — auto-goal 恒为 `verify=none`（该分支正文仅 2 行），却要加载全部 6,935B。条件分支应在**加载时**路由，而非加载后跳过。
3. **四写状态面**（§2.F）——同一事实写四处，无一致性机制。
4. **`SKILL.md` 混装四类内容** — 状态机 / 方法论摘要 / 上下文治理 / 领域细节混在 202 行里，任一修改都要读全文。

### 反向发现：不该被压缩的部分

`alignment-protocol.md:46-50` 的 `⛔ STOP — 等待用户回复`（Step 2 调用后当前 response 必须结束，Step 3 在下一 response 才开始）看似冗余，实际是防止 LLM 把提问与确认合并成一轮的必要冗余。V2 精简时**不应删除这类"防合并"约束**——它们的冗余是功能性的。

---

## 7. 给 V2 设计阶段的移交清单

**必须解决**（否则复刻 V1 缺陷）：A 角色混淆、B 规则不对称、C 回传无界、D 恢复语义、E 并行冲突、F 四写、G 领域泄漏、H 双意图单流水线。

**必须裁决**（存在真实冲突，不能两者都要）：验证隔离 vs 亲自验证；并行 vs 串行；内聚 vs `ace task done`;澄清方法论三选一。

**必须复用**：HARD-GATE 句式、Red Flags 表、terminal-state 判据、惊讶测试、依赖测试、决策复刻铁律 + 四类噪声、双文件渐进披露、Frontier 四条件 + 不持久化、Readiness 纵横检查、唯一五段式确认产物 + 两选项审批 + 五种"不算确认"、Defeater Steel-man→Attack、"无发现也必须告知"。

**必须补入（现有三套都缺或 V1 缺）**：追问停止条件四则、歧义词扫描表与六类歧义、"只成功一半"提问、四类信息分离（事实/解释/假设/决策）、单轮问题数上限、"事实由执行者查"的责任边界、capability/授权/安全边界声明、非代码目标的证据类型契约。

**可直接复用的验收口径**：归档报告 §7 的字节指标表（checkpoint ≤2KB、envelope ≤1KB、dispatch ≤2KB、主 Agent 直读长文件 0 次、测试/搜索/完整 diff 进主上下文 0 字节、正常恢复读取 ≤4KB）已逐项复核可用；**建议新增一项"内聚率 = 100%"**（V1 实测 26%），因为体积指标无法度量依赖方向。
