# OpenSpec apply/archive 数据流与经验进化架构方案

> 分析日期: 2026-04-24
> 分析主题: OpenSpec 执行 apply/archive 时的参数传递机制，config.yaml 字段的实际消费路径，以及经验进化系统的架构重设计方案

## 1. 问题本质：两条分叉的代码路径

### 1.1 config.yaml 的三个字段

OpenSpec 的 `readProjectConfig()` （`project-config.js`）解析三个顶层字段：

| 字段 | 类型 | 消费者 |
|------|------|--------|
| `schema` | string（必填） | `resolveSchemaForChange()` — 全局生效 |
| `context` | string（≤50KB） | `generateInstructions()` — **仅 artifact 创建时注入** |
| `rules` | Record<artifactId, string[]> | `generateInstructions()` — **仅对应 artifact 创建时注入** |

### 1.2 路径 A：artifact 创建（context + rules 被消费）

当执行 `openspec instructions <artifact>` 时，调用 `generateInstructions()`（`instruction-loader.js`）：

```javascript
const configContext = projectConfig?.context?.trim() || undefined;
const rulesForArtifact = projectConfig?.rules?.[artifactId];  // 按 artifactId 精确匹配
```

输出到 AI prompt 的结构：

```xml
<project_context>
[config.yaml 的整个 context: 字段]
</project_context>

<rules>
[仅当前 artifact 的 rules，如 rules.proposal]
</rules>
```

**生效范围**：proposal、specs、design、tasks — 这四个是 `spec-driven` schema 定义的 artifact。

### 1.3 路径 B：apply/archive 执行（context + rules 不被消费）

当执行 `openspec instructions apply` 时，调用的是**完全不同的函数** `generateApplyInstructions()`（`instructions.js`）：

```javascript
// 这个函数从不调用 readProjectConfig()
// 返回的数据结构：
{
    changeName, changeDir, schemaName,
    contextFiles,       // 仅 artifact 文件路径
    progress,           // { total, complete, remaining }
    tasks,              // 解析 tasks.md 的 checkbox
    state,              // 'blocked' | 'all_done' | 'ready'
    instruction,        // schema.yaml 的 apply.instruction 固定文本
}
```

archive 阶段更彻底 — 没有 `generateArchiveInstructions()` 函数，archive 的行为完全硬编码在 `archive-change.js` 的 skill 模板中。

### 1.4 数据流全景图

```
config.yaml
  ├── schema ─────────► 全局 schema 选择
  │
  ├── context: ───────► generateInstructions() → <project_context>
  │                        ✅ proposal 创建
  │                        ✅ specs 创建
  │                        ✅ design 创建
  │                        ✅ tasks 创建
  │                        ❌ apply 执行（不调用此函数）
  │                        ❌ archive 执行（不调用此函数）
  │
  └── rules:
        ├── proposal ─► ✅ 创建 proposal 时注入
        ├── specs ────► ✅ 创建 specs 时注入
        ├── design ───► ✅ 创建 design 时注入
        ├── tasks ────► ✅ 创建 tasks 时注入
        ├── apply ────► ❌ 无代码路径消费（死数据）
        └── archive ──► ❌ 无代码路径消费（死数据）
```

### 1.5 对经验进化各环节的影响

| 经验进化环节 | 触发阶段 | config.yaml 位置 | 是否被注入 AI prompt | 状态 |
|-------------|----------|------------------|---------------------|------|
| **应用**（需求经验） | proposal PRE | `rules.proposal[0]` | ✅ | 有效 |
| **应用**（技术经验） | design PRE | `rules.design[0]` | ✅ | 有效 |
| **提取 + 验证** | apply POST | `rules.apply[3]` | ❌ | **死数据** |
| **归档衔接** | apply POST | `rules.apply[4]` | ❌ | **死数据** |
| **收敛检查** | archive POST | `rules.archive[0]` | ❌ | **死数据** |
| 生命周期概览 | — | `context:` L91-150 | 仅 artifact 创建时 | 部分有效 |

### 1.6 为什么现在"看起来能工作"

在单次连续对话中走完 proposal → ... → apply 时，AI 在创建 proposal 时收到了 `context:` 的全部内容（包括经验进化描述）。当后续触发 `opsx:apply` 时，经验进化描述仍残留在会话历史中。

**但这是脆弱的**：
- 会话压缩（compaction）时可能丢弃
- 新会话直接调用 `/opsx:apply` 时完全不可见
- 长对话中早期 context 被截断

**结论**：`rules.apply` 和 `rules.archive` 是写给人看的注释，不是机器执行的指令。经验进化的提取、验证、收敛三个环节在架构层面没有可靠的注入机制。

## 2. OpenSpec 架构约束：schema 系统的能力边界

### 2.1 Schema 可定制范围

OpenSpec 支持三级 schema 覆盖（`resolver.js`）：

```
优先级：项目本地 > 用户级 > 包内置
1. <project>/openspec/schemas/<name>/schema.yaml    ← 最高优先
2. <XDG_DATA_HOME>/openspec/schemas/<name>/schema.yaml
3. <package>/schemas/<name>/schema.yaml              ← 最低优先
```

Schema YAML 支持的字段（Zod 校验，`types.js`）：

```yaml
name: string                    # schema 名称
version: number                 # 正整数
description: string             # 可选
artifacts:                      # 至少 1 个
  - id: string                  # artifact 标识
    generates: string           # 输出文件路径（支持 glob）
    description: string
    template: string            # 模板文件路径（相对 schema 目录）
    instruction: string         # 可选，创建该 artifact 的指令
    requires: string[]          # 依赖的 artifact ID
apply:                          # 可选
  requires: string[]            # 至少 1 个
  tracks: string | null         # checkbox 追踪文件
  instruction: string           # apply 阶段的指令文本
```

### 2.2 Schema 能做什么

| 能力 | 说明 |
|------|------|
| ✅ 自定义 artifact DAG | 任意数量、任意依赖关系的 artifact |
| ✅ 自定义模板 | 每个 artifact 可指定独立的 markdown 模板 |
| ✅ 自定义 artifact 指令 | 每个 artifact 的 instruction 在创建时注入 |
| ✅ 自定义 apply.instruction | `apply.instruction` 通过 `generateApplyInstructions()` 返回给 AI |
| ✅ 新增 artifact 类型 | 可添加 `retrospective`、`experience` 等新 artifact |
| ✅ 项目本地覆盖 | 无需 fork npm 包，项目内放 schema 即可生效 |

### 2.3 Schema 不能做什么

| 限制 | 根因 |
|------|------|
| ❌ 定义新的 workflow phase | skill 列表硬编码在 `skill-generation.js`（固定 11 个） |
| ❌ 控制 apply skill 模板内容 | `apply-change.js` 是 JS 模板，不受 schema 影响 |
| ❌ 控制 archive 行为 | archive 无 schema 配置，完全硬编码 |
| ❌ 在 apply 阶段注入 context/rules | `generateApplyInstructions()` 不读 config.yaml |
| ❌ 在 archive 阶段注入任何内容 | archive 没有 instructions 机制 |
| ❌ 添加自定义 skill/command | skill 生成不受 schema 驱动 |

### 2.4 apply.instruction 的有限价值

`apply.instruction` 是 schema `apply` 块中的字符串字段，会通过 `generateApplyInstructions()` 返回。AI 在执行 apply skill 时会读到这个字段。

**但它的局限**：
- 只是单一字符串，不是结构化的 context + rules
- 不支持 `[PRE]`/`[POST]`/`[CONSTRAINT]` 等标签分类
- 更重要的是：它是 **schema 级别**的（对所有使用此 schema 的项目相同），不是 **项目级别**的（不能按项目定制）

### 2.5 Skill 模板的硬编码性质

`getSkillTemplates()` 返回固定的 11 个 skill 模板：

```
explore, new-change, continue-change, apply-change, ff-change,
sync-specs, archive-change, bulk-archive-change, verify-change,
onboard, propose
```

这些模板的内容是 JavaScript 模板字面量（template literals），不读取 schema 文件，不支持插件扩展。要修改 apply/archive 的 skill 内容，唯一方式是修改 npm 包源码或在安装后覆盖生成的文件。

## 3. ACE 已有的基础设施

### 3.1 ACE 的双层安装架构

```
ace init                          ace spec init
  │                                 │
  ▼                                 ▼
~/.claude/                        <project>/openspec/
  ├── CLAUDE.md (merge)             ├── config.yaml (merge)
  ├── settings.json (merge)         ├── templates/
  ├── rules/ace/*.md (overwrite)    │   ├── dimensions.md
  ├── hooks/ace.*.sh                │   └── experience-template.md
  ├── hookify.ace.*.md              └── (openspec init 生成的结构)
  ├── memory/
  └── plugins/cache/ace-local/
        └── skills/ (4个) + commands/ (1个)
```

### 3.2 ACE 可独立控制的注入通道

| 通道 | 加载时机 | 适用场景 |
|------|---------|---------|
| `~/.claude/rules/ace/*.md` | **每次会话始终加载** | 全局行为规则 |
| ACE plugin skills (`SKILL.md`) | 被调用时加载 | 任务级行为指令 |
| ACE plugin commands (`.md`) | 被调用时加载 | 命令级行为指令 |
| `~/.claude/CLAUDE.md` @引用 | 每次会话始终加载 | 配置索引 |

**关键洞察**：ACE 已经有通过 Claude Code 原生机制（rules、skills、commands）向 AI 注入指令的完整能力，完全不依赖 OpenSpec。

### 3.3 ACE 当前的 OpenSpec 依赖关系

| ACE 需要 OpenSpec 的 | ACE 不需要 OpenSpec 的 |
|---------------------|----------------------|
| 结构化工作流（proposal→specs→design→tasks） | 经验进化行为规则 |
| artifact 模板和依赖管理 | 澄清与对齐协议 |
| CLI 工具（status、instructions、archive） | 门禁条件 |
| delta spec 管理 | 质量标准 |
| 变更追踪和归档 | Issue Schema |

## 4. 方案空间：从保守到激进

### 方案 A：上游 PR — 让 OpenSpec 原生支持 apply/archive 的 context/rules 注入

**思路**：向 OpenSpec 提交 PR，修改 `generateApplyInstructions()` 使其也读取 config.yaml 的 context 和 rules.apply，同理为 archive 添加 instructions 机制。

**需要改的代码**：
- `instructions.js` 的 `generateApplyInstructions()` — 增加 `readProjectConfig()` 调用，返回 context 和 rules.apply
- 新增 `generateArchiveInstructions()` — 类似结构
- `apply-change.js` 和 `archive-change.js` skill 模板 — 增加读取和展示 context/rules 的步骤

**优势**：
- 最小化 ACE 侧改动，config.yaml 的 rules.apply/archive 直接生效
- 符合 OpenSpec 的设计理念（config.yaml 是项目级配置入口）
- 社区受益

**劣势**：
- 依赖上游接受和合并
- 时间不可控
- OpenSpec 维护者可能认为 apply/archive 不需要 rules 注入（设计哲学差异）

**ACE 侧改动**：几乎为零，现有 config.yaml 的 rules.apply/archive 直接复活。

---

### 方案 B：Fork Schema + 覆盖 Skill 模板

**思路**：在项目本地创建 `aspec` schema，自定义 artifact 和 apply 配置。同时让 ACE 在 `ace spec init` 后覆盖 `.claude/commands/opsx/apply.md` 和 `.claude/skills/openspec-apply-change/SKILL.md`，注入经验进化指令。

**目录结构**：
```
<project>/
├── openspec/
│   ├── config.yaml            # schema: aspec
│   └── schemas/
│       └── aspec/
│           ├── schema.yaml    # fork of spec-driven, 自定义 apply.instruction
│           └── templates/     # 自定义 artifact 模板
└── .claude/
    ├── skills/
    │   └── openspec-apply-change/
    │       └── SKILL.md       # ACE 覆盖版本，含经验进化指令
    └── commands/
        └── opsx/
            └── apply.md       # ACE 覆盖版本
```

**优势**：
- 不修改 OpenSpec 源码
- Schema 定制完全合法（OpenSpec 设计的扩展点）
- 经验进化指令直接写入 AI 会读到的 skill 文件

**劣势**：
- **脆弱性**：每次 `openspec init` / `openspec update` 会重新生成 skill/command 文件，覆盖 ACE 的修改
- 需要 ACE 记录覆盖逻辑并在每次 OpenSpec 更新后重新执行
- 两套模板需要同步维护（OpenSpec 原版 + ACE 覆盖版）

**ACE 侧改动**：`spec-installer.js` 增加 skill 模板覆盖逻辑 + 维护 aspec schema + 维护 skill 模板。

---

### 方案 C：ACE Wrapper Skills — 用 ACE 自己的 skill 包装 apply/archive

**思路**：不修改 OpenSpec 的 skill，而是创建 ACE 自己的 `aspec:apply` 和 `aspec:archive` skill。这些 skill 在调用 OpenSpec CLI 之前/之后注入经验进化行为。

**执行流程**：

```
用户调用 /aspec:apply
  │
  ├─ PRE：读取 config.yaml 的 rules.apply PRE 规则
  ├─ PRE：读取 openspec/experience.md，展示相关经验
  │
  ├─ CORE：调用 openspec instructions apply --json
  ├─ CORE：读取 contextFiles（proposal, specs, design, tasks）
  ├─ CORE：循环实现 tasks（与 opsx:apply 相同逻辑）
  │
  ├─ POST：执行 rules.apply POST 规则
  │   ├─ 复盘与经验提取 → 写入 experience.md
  │   └─ 验证之前应用的经验
  │
  └─ POST：询问用户是否归档 → 调用 /aspec:archive
```

```
用户调用 /aspec:archive
  │
  ├─ CORE：调用 openspec archive CLI（文件归档操作）
  │
  └─ POST：执行 rules.archive POST 规则
      └─ 经验收敛检查（>20 条时合并/淘汰）
```

**优势**：
- 完全不修改 OpenSpec（无 fork，无覆盖）
- config.yaml 的 rules.apply/archive 被 ACE skill 直接读取和消费
- 经验进化逻辑作为 skill 指令，每次调用都可靠加载
- ACE 已有 skill 基础设施（plugin 系统 + skill-creator）

**劣势**：
- 用户需要调用 `/aspec:apply` 而非 `/opsx:apply`（两套命令共存，容易混淆）
- ACE skill 需要复制 OpenSpec apply skill 的核心逻辑（约 150 行指令）
- 需要与 OpenSpec CLI 的版本变更保持兼容

**ACE 侧改动**：新增 2 个 skill（aspec:apply, aspec:archive），修改 tasks 规则指向 aspec:apply。

---

### 方案 D：Claude Code Rules 全局注入

**思路**：将经验进化的 apply/archive 行为规则从 config.yaml 迁移到 `~/.claude/rules/ace/experience-evolution.md`。Claude Code 的 rules 在**每次会话中始终加载**，不受 OpenSpec 的代码路径限制。

**规则文件示例**：

```markdown
# ~/.claude/rules/ace/experience-evolution.md

## apply 阶段完成后

当完成 openspec apply（所有 tasks 勾选完毕）后，**必须**：

1. 按 experience-template.md 结构追加复盘到 experience.md
2. 提取知识：技术决策、新术语、风险事件、澄清漏检
3. 验证之前应用的经验（✓有效 / ✗无效 / —不适用）
4. 展示 5-8 行摘要供用户确认

## archive 阶段完成后

当完成 openspec archive 后，检查 experience.md 条目数，若超过 20 条，提议合并。
```

**优势**：
- **最简单**：不改 OpenSpec，不建新 skill，只加一个 rules 文件
- 利用 Claude Code 原生机制，rules 在所有对话中始终可见
- 不存在"注入失败"的风险

**劣势**：
- **始终加载**：即使不做 aspec 工作，这些规则也会占用 context
- **不可分阶段**：rules 无法区分"当前是 apply 阶段还是 archive 阶段"，只能靠 AI 自行判断适用时机
- **全局 vs 项目**：rules 是全局的（`~/.claude/rules/`），但经验进化是项目级行为
- config.yaml 的 rules.apply/archive 仍然是死数据，需要另行维护 rules 文件
- **弱约束力**：rules 是"建议"，不如 skill 指令的执行确定性强

---

### 方案 E：Orchestrator 模式 — ACE 成为工作流控制器

**思路**：根本性转变 — ACE 不再寄生于 OpenSpec，而是成为顶层编排器。OpenSpec 降级为"结构化工具库"，ACE 控制整个工作流的节奏和行为。

**架构**：

```
用户 → /aspec:new → ACE 编排器 skill
  │
  ├─ Phase 1: 需求澄清（ACE 自有逻辑 + 读 config.yaml rules.proposal PRE）
  ├─ 委托: openspec instructions proposal → AI 创建 proposal
  │
  ├─ Phase 2: Specs（委托 OpenSpec）
  │
  ├─ Phase 3: 设计澄清（ACE 自有逻辑 + 读 config.yaml rules.design PRE）
  ├─ 委托: openspec instructions design → AI 创建 design
  │
  ├─ Phase 4: Tasks（委托 OpenSpec）
  │
  ├─ Phase 5: Apply（ACE 全权控制）
  │   ├─ 调用 openspec instructions apply --json 获取 contextFiles + tasks
  │   ├─ 注入 rules.apply 的所有规则
  │   ├─ 实现 tasks
  │   └─ 执行 POST 规则（经验提取 + 验证）
  │
  └─ Phase 6: Archive（ACE 全权控制）
      ├─ 调用 openspec archive CLI 执行文件操作
      └─ 执行 POST 规则（经验收敛）
```

**优势**：
- **config.yaml 完全被消费** — ACE 作为编排器直接读取并执行所有 rules
- **干净的所有权** — 行为归 ACE，结构归 OpenSpec
- **一个入口** — 用户只需 `/aspec:new`、`/aspec:continue`，不接触 `/opsx:*`
- **经验进化原生集成** — 不是注入的，而是流程的一部分

**劣势**：
- **工作量最大** — 需要实现完整的编排器 skill（可能 300+ 行指令）
- **需要复制 OpenSpec skill 逻辑** — 或至少理解并调用其 CLI
- **维护负担** — OpenSpec 升级时需要验证兼容性
- **复杂的 skill** — 可能违反 auto-goal-optimization-v6 的"指令诅咒"发现（指令越多，遵从率越低）

---

### 方案 F：经验提取即 Artifact — 扩展 DAG

**思路**：在自定义 schema 中将经验提取定义为一个新 artifact（如 `retrospective`），使其通过 `generateInstructions()` 获得 context + rules 注入。

**Schema 设计**：

```yaml
name: aspec
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
    template: proposal.tpl.md
    requires: []

  - id: specs
    generates: specs/**/*.md
    template: spec.tpl.md
    requires: [proposal]

  - id: design
    generates: design.md
    template: design.tpl.md
    requires: [proposal]

  - id: tasks
    generates: tasks.md
    template: tasks.tpl.md
    requires: [specs, design]

  - id: retrospective            # 新增！
    generates: retrospective.md
    template: retrospective.tpl.md
    instruction: |
      所有 tasks 实施完成后，执行复盘与经验进化。
      按 experience-template.md 结构追加到 experience.md。
      提取：技术决策、新术语、风险事件、澄清漏检。
      验证已应用的经验（✓有效 / ✗无效 / —不适用）。
    requires: [tasks]

apply:
  requires: [tasks]
  tracks: tasks.md
  instruction: |
    实施 tasks.md 中的待办任务。完成全部任务后，
    运行 openspec instructions retrospective 创建复盘文档。
```

**数据流**：

```
openspec instructions retrospective --change "..." --json
  → generateInstructions(artifactId='retrospective', ...)
    → 读取 config.yaml context ✅
    → 读取 config.yaml rules.retrospective ✅
    → 读取 retrospective.tpl.md ✅
  → AI 收到完整的 context + rules + template
```

**优势**：
- **利用 OpenSpec 已有机制** — `generateInstructions()` 天然支持新 artifact 的 context/rules 注入
- config.yaml 中可以写 `rules.retrospective` 来定制复盘行为，且**会被消费**
- 不需要修改 OpenSpec 源码（schema fork 是合法扩展点）
- 复盘文档有独立文件（`retrospective.md`），可追溯

**劣势**：
- **artifact 依赖的时序问题** — OpenSpec 检查 artifact 是否"完成"是看 `generates` 文件是否存在。`retrospective` 依赖 `tasks`，但 `tasks.md` 在 tasks 阶段就已创建（此时 tasks 还没实施完）。需要 apply 完成后才触发 retrospective，但 OpenSpec 的依赖检查不理解"tasks 已实施完"这个语义。
- **archive 仍无法注入** — 收敛检查发生在 archive 阶段，而 archive 仍然是硬编码的
- **实施流程断裂** — apply（实施代码）和 retrospective（创建文档）是两个 skill 调用，需要在 apply 的 instruction 中引导 AI 手动触发 retrospective
- **命令数量膨胀** — 又多了一个 `/opsx:retrospective` 命令

## 5. 方案对比矩阵

### 5.1 多维度评估

| 维度 | A. 上游PR | B. Fork Schema+覆盖Skill | C. Wrapper Skills | D. Rules全局注入 | E. Orchestrator | F. 经验即Artifact |
|------|----------|-------------------------|------------------|----------------|----------------|-----------------|
| **rules.apply 生效** | ✅ 原生 | ✅ 覆盖后生效 | ✅ skill读取 | ❌ 仍死数据 | ✅ 编排器读取 | ⚠️ 需改名rules.retrospective |
| **rules.archive 生效** | ✅ 原生 | ✅ 覆盖后生效 | ✅ skill读取 | ❌ 仍死数据 | ✅ 编排器读取 | ❌ archive仍硬编码 |
| **经验提取可靠性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **经验收敛可靠性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **ACE侧改动量** | 几乎为零 | 中（installer+schema+模板） | 小（2个skill） | 极小（1个rule文件） | 大（编排器skill） | 中（schema+模板） |
| **OpenSpec侧改动** | 需要PR | 无 | 无 | 无 | 无 | 无 |
| **维护负担** | 低（上游维护） | 高（覆盖易被刷掉） | 中（需跟进CLI变化） | 低 | 高（复制大量逻辑） | 中（schema维护） |
| **用户体验一致性** | ⭐⭐⭐⭐⭐ 沿用/opsx:* | ⭐⭐⭐⭐⭐ 沿用/opsx:* | ⭐⭐⭐ 两套命令 | ⭐⭐⭐⭐ 无感知 | ⭐⭐⭐⭐ 统一/aspec:* | ⭐⭐⭐ 多一个命令 |
| **config.yaml一致性** | ⭐⭐⭐⭐⭐ 单一真相源 | ⭐⭐⭐⭐ 基本保持 | ⭐⭐⭐⭐ skill消费config | ⭐⭐ rules在别处 | ⭐⭐⭐⭐⭐ 编排器消费config | ⭐⭐⭐ 部分对齐 |
| **时间可控性** | ❌ 依赖上游 | ✅ | ✅ | ✅ | ✅ | ✅ |
| **对OpenSpec升级的韧性** | ⭐⭐⭐⭐⭐ | ⭐ 覆盖被刷 | ⭐⭐⭐⭐ CLI稳定即可 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ 需验证兼容 | ⭐⭐⭐⭐ schema独立 |

### 5.2 核心取舍

**A vs 其他**：A 是"正确"的解，但时间不可控。其他方案是 A 未合并前的替代路径。两者不互斥。

**C vs E**：都是 ACE skill 方案。C 是最小化包装（只包 apply/archive），E 是全面接管（包整个流程）。C 更务实，E 更彻底。

**D 的致命缺陷**：rules 全局加载解决了"可见性"问题，但制造了新问题 — 无法按阶段分发规则（所有规则对所有阶段可见），且 config.yaml 的 rules.apply/archive 仍然是死数据（两处维护）。

**F 的创造性价值**：将"经验提取"建模为 artifact 是概念上的突破 — 复盘本身就是一种"文档产出"。但 OpenSpec 的 artifact 依赖系统基于文件存在性而非语义完成度，导致时序问题。

## 6. 推荐路径与实施策略

### 6.1 推荐：C + A 组合（Wrapper Skills + 上游 PR）

**短期（立即可做）**：方案 C — 创建 `aspec:apply` 和 `aspec:archive` wrapper skills

**长期（并行推进）**：方案 A — 向 OpenSpec 提 PR，合并后可简化甚至移除 wrapper skills

选择理由：

1. **C 是唯一同时满足以下条件的方案**：
   - rules.apply 和 rules.archive 被可靠消费 ✅
   - 不修改 OpenSpec 源码 ✅
   - 不依赖覆盖（不怕 OpenSpec 升级刷掉）✅
   - config.yaml 保持单一真相源 ✅
   - 实现量可控（2 个 skill 文件）✅

2. **C 的"两套命令"劣势可以缓解**：
   - 修改 config.yaml 的 `rules.tasks[POST]` 指向 `aspec:apply` 而非 `opsx:apply`
   - 在 ACE 文档中明确：使用 `/aspec:apply` 和 `/aspec:archive`
   - 或更激进：ACE installer 在安装后删除 `.claude/commands/opsx/apply.md` 和 `archive.md`，只保留 ACE 版本

3. **A 是正确的长期方向**：
   - apply/archive 阶段不支持 context/rules 注入是 OpenSpec 的架构缺口
   - 这不仅影响 ACE，任何想在 apply/archive 阶段注入行为的项目都会遇到

### 6.2 aspec:apply Skill 设计草案

```
aspec:apply skill

Step 1: 选择 change
  → openspec list --json / 自动推断

Step 2: 获取 apply 指令
  → openspec instructions apply --change "<name>" --json
  → 获得 contextFiles, tasks, progress, state

Step 3: 注入经验进化上下文
  → 读取 openspec/config.yaml 的 rules.apply
  → 解析 [PRE] / [CONSTRAINT] / [POST] 标签
  → 读取 openspec/experience.md（如存在）

Step 4: 执行 PRE 规则
  → 读取澄清决策（issues/*.md）

Step 5: 实施 tasks
  → 读取 contextFiles（proposal, specs, design, tasks）
  → 循环实现 pending tasks
  → 遵守 CONSTRAINT 规则（新问题暂停、spec-code 一致性）
  → 每完成一个 task 勾选 checkbox

Step 6: 执行 POST 规则
  → 复盘与经验进化（提取 + 验证）
  → 展示摘要供用户确认

Step 7: 流程衔接
  → AskUserQuestion: 是否立即归档？
  → 确认后调用 /aspec:archive
```

### 6.3 aspec:archive Skill 设计草案

```
aspec:archive skill

Step 1: 选择 change
  → openspec list --json / 自动推断

Step 2: 检查完成度
  → openspec status --change "<name>" --json
  → 检查 tasks.md 完成状态

Step 3: 执行归档
  → openspec archive "<name>" CLI 命令
  → 或等效的文件操作（mv to archive/）

Step 4: 执行 POST 规则
  → 读取 openspec/config.yaml 的 rules.archive
  → 经验收敛检查（>20 条时合并/淘汰）
  → 需用户确认

Step 5: 显示摘要
```

### 6.4 config.yaml 的变化

config.yaml 保持 `rules.apply` 和 `rules.archive` 的现有内容不变。变化在于：

1. **消费者变了**：从"无人消费"变为"ACE wrapper skill 消费"
2. **context 中的经验进化描述可精简**：详细规则已在 rules 中，context 只需保留生命周期概览作为背景知识
3. **tasks 的 POST 规则更新**：`调用 Skill 工具执行 opsx:apply` → `调用 Skill 工具执行 aspec:apply`

### 6.5 可选增强：方案 F 的部分采纳

虽然不推荐完整的方案 F，但"retrospective 作为 artifact"的理念可以部分采纳：

- 在 aspec:apply skill 的 POST 阶段，输出 `retrospective.md` 文件
- 这不需要 OpenSpec 的 artifact 系统，只是一个 skill 行为
- 归档时 `retrospective.md` 随 change 目录一起归档，保留完整历史

## 7. 更远的思考

### 7.1 如果从零设计

如果不受现有系统约束，理想的架构是：

```
config.yaml                     ← 单一真相源
  ├── context: 背景知识          ← 始终可见
  ├── rules:                    ← 按阶段精确投递
  │     proposal:  [PRE + GATE]
  │     specs:     [CONSTRAINT]
  │     design:    [PRE + GATE + CONSTRAINT]
  │     tasks:     [PRE + POST]
  │     apply:     [PRE + CONSTRAINT + POST]  ← 有可靠消费者
  │     archive:   [POST]                     ← 有可靠消费者
  └── phases:                   ← 扩展点（当前 OpenSpec 不支持）
        apply:
          inject_context: true
          inject_rules: true
        archive:
          inject_context: true
          inject_rules: true
```

方案 C 通过 wrapper skill 在 **应用层** 实现了这个效果，即使底层 OpenSpec 不支持。

### 7.2 寄生模式的反思

ACE 最初选择寄生模式的假设是："通过 context 和 rules 注入就能控制整个工作流"。研究发现这个假设在 artifact 创建阶段成立，在 apply/archive 阶段不成立。

寄生模式的根本局限是：**寄生者不能注入宿主不消费的数据**。当宿主的 apply/archive 代码路径绕过了 config.yaml，寄生者就失去了控制权。

Wrapper skill 模式本质上是**在寄生失败的环节，改为独立运行**。这是一种务实的混合架构：
- artifact 创建阶段：继续寄生（OpenSpec 注入 context + rules，效果好）
- apply/archive 阶段：独立运行（ACE skill 直接读取 config.yaml，不经过 OpenSpec）

这不是架构的倒退，而是对现实约束的精确适配。
