# auto-goal 项目级决策文档机制 — 设计方案

> 目标：让 auto-goal 每次任务的决策汇聚成项目级档案，随使用累积，最终凭档案在新目录复刻功能等价项目。
> 复刻语义：**语义/功能等价**（已与用户确认，非字节级精确复刻）。

---

## 一、诚实的可行性边界

**"能做到吗？" → 能，但要先厘清一个信息论天花板。**

| 你想复刻的层次 | 决策文档能否独立支撑 | 原因 |
|---|---|---|
| 关键取舍一致（为什么用 X 不用 Y） | ✅ 完全能 | 这正是决策文档的本职（why） |
| 功能等价（跑起来行为相同） | ✅ 能，但需决策文档 **+ 需求/设计规格** | 决策记 why，规格记 what/how 骨架 |
| 字节级精确复刻 | ❌ 做不到 | 需归档代码本身，决策文档做不到，也不该做 |

**核心命题**：决策文档记的是 **why**（为什么这么选、否决了什么）。仅凭 why 无法重建 what（有哪些功能）和 how（怎么实现）。所以"凭一份决策文档完整复刻项目"若指功能等价——**必须让"决策文档"升级为"决策 + 规格"的分层档案**，单纯的 ADR 日志不够。这是所有 ADR/spec 方案的共同天花板，业界无例外。

---

## 二、业界方案调研结论（5 类对比）

| 方案 | 沉淀粒度 | 累积形态 | 覆盖面 | 凭文档复刻功能等价项目 |
|---|---|---|---|---|
| **ADR / MADR** | 单决策 | ✅ 累积、不可变、superseded 状态机 | 仅决策 rationale | 部分（取舍一致，功能不全） |
| **Spec-Driven（spec-kit / AWS Kiro）** | 功能/任务 | ✅ specs 逐功能累积 + steering 项目级常驻 | **需求+设计+任务全覆盖** | **最强（原生为此设计）** |
| PRFAQ（Amazon） | 产品意图 | ❌ 一次性 | 仅 why/意图 | 否（仅方向锚点） |
| Living Doc / C4 / arc42 | 架构 | 随代码演进 | 架构全景 | 中（真相源是代码，方向相反） |
| IaC / Literate Programming | 系统状态/逻辑 | 声明式源 | 基础设施/程序逻辑 | 理念最强，非业务档案格式 |

**关键洞察**：
- **AWS Kiro 的双层结构最契合**你的诉求——`steering/`（项目级常驻档案，每次注入）+ `specs/<feature>/`（任务级 requirements/design/tasks 三段）。它天然解决"项目级汇聚 + 任务级累积 + 面向复刻的完整覆盖"三件事。
- **ADR 是补强件而非替代**：spec 文件会被覆盖更新，丢失"决策从 A 变到 B 的历史"；ADR 的不可变累积日志正好补这一环（arc42 第 9 节就是这么内嵌 ADR 的）。
- **PRFAQ 精简版做意图锚点**：防止复刻出"技术等价但目标漂移"的项目。
- **IaC/Literate Programming 提供信条**：档案 = 声明式单一真相源，追求"拷贝到新目录 → 幂等重建"。

来源：[joelparkerhenderson/adr](https://github.com/joelparkerhenderson/architecture-decision-record)、[github/spec-kit](https://github.com/github/spec-kit)、[Kiro Specs](https://kiro.dev/docs/specs/)、[Kiro Steering](https://kiro.dev/docs/steering/)、[Amazon PRFAQ](https://productstrategy.co/working-backwards-the-amazon-prfaq-for-product-innovation/)、[arc42](https://arc42.org/overview)、[C4](https://c4model.com/)。

---

## 三、ACE 现状勘查（为什么现在做不到 + 集成锚点）

**现状核心缺口：三层记忆中，唯独 decisions 无项目级归宿。**

| 层 | 位置 | 语义 | 项目级？ |
|---|---|---|---|
| memory | `~/.claude/memory/` | 跨项目通用教训 | 跨项目 |
| experience | `.ace/experience.md` | 项目级可复用经验/踩坑 | ✅ 项目级 |
| **decisions** | `.ace/tasks/{changeName}/state.json` | 单任务技术取舍 | ❌ **仅任务内** |

- decisions 由 **LLM 手写、无 schema 校验**，规范说对象数组 `{decision, reason, alternatives}`（`shared/state-template.md:106-119`），实测已漂移成纯字符串数组。
- 决策**双写不同步**：`state.json.simple.decisions[]`（结构化）+ `context.md` 决策节（叙事化）。
- 归档 = **纯目录移动、零内容抽取**（`archive.js:47-63`）；`ace task list` / recovery 显式跳过 `archive/`（`task-utils.js:52`）。→ 归档后决策对所有活跃视图**永久不可见**。
- 已有的强钩子：`experience-protocol.md` 有"任务完成必执行 + 一行式告知用户 + 项目级单文件 append + E{N} 递增"的完整成熟模式，可平行复制给 decisions。

**可挂载钩子（按强度）**：
1. **`archive.js:56-63`（最强）** — 移动目录前 CLI 已持有完整 state（含 decisions），是唯一确定性代码捕获点。
2. `experience-protocol` 收尾流程 — 复用现成"完成必触发 + append 项目文件"语义。
3. `ace task done` 编排点（`task.js:110-121`）— complete→archive 之间插入汇聚子步骤。

---

## 四、推荐方案：三层项目决策档案（Project Decision Ledger）

采用 **Kiro 双层为骨架 + ADR 补强 + PRFAQ 锚点**，落进 ACE 现有 `.ace/` 结构：

```
{project}/.ace/
├── project/                      # 【新增】项目级常驻档案（对应 Kiro steering）
│   ├── charter.md                #   意图锚点（PRFAQ 精简版）：问题/目标用户/核心收益/非目标
│   ├── tech.md                   #   技术基线：语言/框架/关键库/技术约束
│   ├── structure.md              #   结构基线：模块划分/命名约定/架构模式
│   └── decisions.md              #   【核心】项目决策日志（ADR 累积，D{N} 不可变 + superseded）
├── specs/                        # 【新增】任务级规格档案（对应 Kiro specs，从任务沉淀）
│   └── {changeName}/
│       ├── requirements.md       #   需求（EARS 可验证）—— 从 context.md 目标+完成标准蒸馏
│       └── design.md             #   设计骨架 —— 从 artifacts 蒸馏
├── experience.md                 # 【已有】经验，不动
└── tasks/                        # 【已有】任务工作区，不动
    └── {changeName}/{state.json, context.md, artifacts/}
```

**职责边界**：
- `project/decisions.md` = **为什么**（why，ADR 累积，回答"为什么这么选、否决了什么、什么时候改的"）
- `project/{charter,tech,structure}.md` = **项目级 what/约束基线**（复刻时首先注入的真相源）
- `specs/{changeName}/` = **每个功能的 what + how 骨架**（随任务累积，覆盖复刻所需的功能清单）
- 三者合起来 = "凭档案复刻功能等价项目"所需的**完整声明式真相源**

**为什么不只用单文件 decisions.md？** 单纯决策日志只有 why，复刻 agent 不知道"项目有哪些功能、什么技术栈、怎么组织"。必须加 project 基线 + specs 功能清单，才真正可复刻。这正是把"决策文档"升级为"决策档案"的关键——回应第一节的天花板。

---

## 五、decisions.md 模板（ADR 累积式，单文件）

选**单文件累积**而非每决策一文件，理由：auto-goal 面向中小项目迭代，单文件 append 与 experience.md 语义一致、易读全貌、CLI 抽取简单；决策量大后再拆 `decisions/NNNN-*.md` 不迟。

```markdown
# 项目决策日志

> 每条决策不可变。改变决策 = 新增一条并把旧条标记 superseded，不删除。

## D0001 — 用 SQLite 而非 Postgres 做本地存储
- 日期: 2026-07-28
- 状态: accepted        # proposed | accepted | superseded by D0007 | deprecated
- 来源任务: user-auth (.ace/specs/user-auth/)
- 上下文: 单机工具，无并发写，零运维优先
- 决策: 采用 SQLite 单文件库
- 否决项: Postgres（运维重）、JSON 文件（无事务）
- 后果: 迁移到多机需重做存储层；已在 tech.md 记为技术约束

## D0002 — ...
```

字段刻意与现有 `state.json.simple.decisions[]` 的 `{decision, reason, alternatives}` 对齐，方便机械抽取。

---

## 六、集成设计：任务决策 → 项目档案的汇聚流

**触发时机 = 任务归档时**（唯一确定性、有完整数据、且已是强制门禁的收尾点）。

**汇聚动作（在 auto-goal 收尾流程 / `ace task done` 增加）**：
1. 读 `tasks/{changeName}/state.json` 的 `simple.decisions[]`
2. 每条决策 → append 到 `project/decisions.md`，分配 D{N} 序号，标注来源任务
3. 若新决策否决/取代旧决策 → 把旧条状态改 `superseded by D{N}`（唯一允许的"改"）
4. 从 `context.md` 目标+完成标准蒸馏出 `specs/{changeName}/requirements.md`
5. 首次任务时若 `project/{charter,tech,structure}.md` 不存在 → 引导用户补一次基线
6. 一行式告知用户（复用 experience 的告知语义）：`📒 决策沉淀：D0003-D0004 已汇入 project/decisions.md`

**复刻流程（新目录）**：
```
1. 拷贝 .ace/project/ + .ace/specs/ 到新目录
2. auto-goal 读取顺序：charter.md（意图）→ tech.md + structure.md（基线约束）
   → decisions.md（历史取舍，避免重蹈覆辙）→ specs/*（逐功能重建）
3. 按 specs 的 requirements + design 逐功能生成 → 得到功能等价项目
```

---

## 七、落地步骤（用户据此改造 auto-goal，本次不改代码）

1. **定 schema**：给 `state.json.simple.decisions[]` 加约束（`{decision, reason, alternatives, supersedes?}`），auto-goal SKILL 明确"决策必须写结构化数组"。修 `shared/state-template.md`。
2. **建汇聚钩子**：优先改 `archive.js:56-63`（CLI 层确定性抽取，最稳）；或在 `auto-goal/SKILL.md` 归档门禁处加"汇聚"步骤（纯 SKILL 文字驱动，无需改 JS）。二选一——**推荐 CLI 层**，因为 LLM 驱动会漂移（现状 decisions 格式漂移已证）。
3. **建 project 基线引导**：`ace init` 或 auto-goal 首次任务时引导生成 `project/{charter,tech,structure}.md`。复用 `init` skill。
4. **补 decisions.md 模板 + specs 蒸馏规则**：加进 shared/ 供各 skill 复用。
5. **建复刻入口**：新增 skill 或 auto-goal 模式，读 `.ace/project/` + `.ace/specs/` 驱动复刻。

**最小可用版（MVP）**：只做 1+2+3 的 SKILL 文字版——归档时把 decisions append 到 `project/decisions.md`。先跑通"决策汇聚"，specs 蒸馏和复刻入口作为第二阶段。

---

## 八、一句话总结

**能做到功能等价复刻，但前提是把"一份决策文档"升级为"决策(why) + 项目基线 + 功能规格(what/how)"的三层档案**——用 Kiro 双层做骨架、ADR 做决策演进史、PRFAQ 做意图锚点，在归档钩子处把每任务 decisions 机械汇聚进 `.ace/project/decisions.md`。单纯的决策日志只能保证取舍一致，保证不了功能重建。
