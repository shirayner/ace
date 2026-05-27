# Claude Code Harness 深度优化分析报告

> 分析日期: 2026-04-15
> 分析主题: 当前 Claude Code AI Coding 开发环境的全面优化空间分析
> 方法论: 基于 Harness Engineering、Agent 设计哲学、认知科学、控制论等跨学科视角

---

## 1. 环境现状全景

### 1.1 当前架构清单

| 层级 | 组件 | 数量 | 状态评估 |
|------|------|------|----------|
| **Foundation** (CLAUDE.md) | 全局索引文件 | 1 | 精简（13行），仅作索引 |
| **Rules** | 全局规则文件 | 5 | 有冗余（exploration-methodology 254行非运行时规则） |
| **Skills** | 自定义 Skill | 12 | 功能覆盖广，但存在职责重叠 |
| **Plugins** | 第三方插件 | 1 (revealjs) | 仅启用 1 个，官方市场有 30+ 可用 |
| **Hooks** | 生命周期钩子 | 1 (PostToolUse for ut) | **严重不足** — 12+ 事件类型仅用了 1 个 |
| **MCP Servers** | 外部工具连接 | 2 (context7, feishu2md) | 基础够用 |
| **Agents** | 自定义 Agent | 1 (trip-member-grade-bot) | 业务特定 |
| **Memory** | 持久化记忆 | 0 | **完全未使用** |
| **Settings** | 全局配置 | 1 | 基本配置，缺少安全约束 |

### 1.2 自定义 Skill 详细清单

| Skill | 行数 | 职责 | 触发冲突风险 |
|-------|------|------|-------------|
| `auto-goal` | ~160 | 自主完成复杂目标 | 高 — 与 coding/task-driver 重叠 |
| `coding` | ~256 | 规划优先的编码工作流 | 高 — 与 task-driver/auto-goal 重叠 |
| `task-driver` | ~303 | 大型多步骤任务管理 | 高 — 与 coding/auto-goal 重叠 |
| `code-review` | ~189 | 代码审查 | 低 |
| `ut` | ~336 | Java 单元测试生成 | 低 |
| `skill-creator` | -- | 创建新 skill | 低 |
| `skill-optimize` | ~288 | 优化现有 skill | 低 |
| `browser-use` | ~200 | 浏览器自动化 | 低 |
| `webapp-testing` | -- | Web 应用测试 | 低 |
| `docx/pdf/xlsx` | -- | 文档处理（三个） | 低 |
| `report` | -- | 报告生成 | 低 |

### 1.3 Rules 文件分布

| 文件 | 大小 | 类型 | 每次会话加载? |
|------|------|------|-------------|
| `thinking.md` | 1.1KB | 运行时原则 | 是 — 合理 |
| `clean-code.md` | 7.4KB | 运行时标准 | 是 — 合理 |
| `reporting.md` | 0.5KB | 工作流规则 | 是 — 合理 |
| `task-recovery.md` | 0.7KB | 工作流规则 | 是 — 合理 |
| `exploration-methodology.md` | **7.5KB** | **参考文档** | **是 — 不合理，浪费 ~2000 tokens** |

### 1.4 关键数据

- **模型**: opus[1m]（1百万token上下文）
- **权限**: Bash, Read, Edit, Write, WebSearch, WebFetch, Task（较宽泛）
- **CLAUDE.md 引用**: `naming.md` 被引用但**从未创建**（悬空引用）
- **官方插件利用率**: 1/32（约 3%）
- **Hook 利用率**: 1/12+（约 8%）


---

## 2. 理论框架：Harness Engineering 的核心洞察

### 2.1 什么是 Harness Engineering？

**Harness Engineering**（线束工程）由 Mitchell Hashimoto（HashiCorp/Terraform 创始人）于 2026年2月正式提出，核心理念：

> "每当 Agent 犯一个错误，你就花时间工程化一个解决方案，确保 Agent 永远不会再犯同样的错误。"

这是 AI 工程的**第三代范式演进**：

```
Prompt Engineering → Context Engineering → Harness Engineering
  (写好指令)           (管好信息)            (建好世界)
```

- **Prompt Engineering**：优化发送给模型的指令
- **Context Engineering**（Andrej Karpathy, 2025）：设计信息系统——"LLM 是 CPU，上下文窗口是 RAM"
- **Harness Engineering**：工程化 Agent 的整个运行环境——工具、约束、反馈回路、验证机制

**实证影响**：LangChain 仅通过 Harness 优化（无模型更改）从 SWE-bench 第 30 名跃升至前 5。

### 2.2 Claude Code 六层架构

Anthropic 的 Claude Code 采用六层架构模型：

```
┌─────────────────────────────────────┐
│ Layer 6: Discovery（社区发现）       │ ← skills.sh 市场
├─────────────────────────────────────┤
│ Layer 5: Plugins（分发捆绑）         │ ← skills + hooks + MCP 打包
├─────────────────────────────────────┤
│ Layer 4: Hooks（确定性执行）         │ ← 生命周期钩子，12+ 事件
├─────────────────────────────────────┤
│ Layer 3: MCP（外部连接）            │ ← 工具/API/数据库桥接
├─────────────────────────────────────┤
│ Layer 2: Skills（按需专家）          │ ← 触发时加载，懒加载模式
├─────────────────────────────────────┤
│ Layer 1: Foundation（项目知识）      │ ← CLAUDE.md, MEMORY.md, rules/
└─────────────────────────────────────┘
```

**关键设计洞察**：
- **Hooks 是确定性层**：CLAUDE.md 中的规则是概率性的（模型可能不遵守），Hooks 是确定性的（shell 命令必定执行）。**需要 100% 遵守的规则应该用 Hook 实现，而非写在 CLAUDE.md 中。**
- **Skills 是懒加载的**：静默时仅占用少量 token（description 扫描），触发后才加载完整指令（~5k tokens）
- **Context Engineering 四策略**：Write（外化状态）→ Select（按需检索）→ Compress（压缩历史）→ Isolate（隔离上下文）

### 2.3 OpenAI 的 Agent Harness 三支柱

OpenAI 在其"Harness Engineering: Leveraging Codex in an Agent-First World"（2026.02）中提出：

| 支柱 | 含义 | 实践 |
|------|------|------|
| **The Model** | 如何提示、约束、引导 | 角色定义、思维框架 |
| **The Tools** | API、函数、数据访问 | 工具使用是默认模式，不是例外 |
| **The Instructions** | 规划循环、记忆格式、角色行为 | 超越简单提示的完整指令系统 |

**关键实践**：
- **可复用 Harness 文件**：`Plan.md`（任务规划）、`Implement.md`（执行指导）、`Documentation.md`（知识捕获）
- **Agent 可读性优先**：为 Agent 优化代码库的可理解性——隔离可启动实例、严格的架构模型
- **可观测性即 Harness**：暴露日志、指标、追踪给 Agent。没有可观测性，关于性能/行为的提示是不可解的
- **验证循环**：Agent 审查自己的变更，请求其他 Agent 审查，响应反馈，迭代直到满意

### 2.4 跨学科关键洞察

| 学科 | 核心洞察 | 对 Harness 的启示 |
|------|----------|-------------------|
| **控制论** (Ashby定律) | 控制器的多样性必须≥被控系统的多样性 | Hook/验证机制必须与 Agent 能力匹配。能力强但控制弱 = 失控 |
| **认知科学** (认知负荷) | 外在负荷可通过设计消除，内在负荷不可约简 | 消除 skill 中的冗余指令，保留核心推理框架 |
| **心理学** (决策疲劳) | 长决策链质量递减 | 在关键节点设置结构化检查点，作为"认知休息站" |
| **哲学** (有限理性) | 满意解系统性优于最优解 | Agent 应该 satisfice by default, optimize by exception |
| **教育学** (Vygotsky ZPD) | 脚手架而非替代 | Harness 应该赋能用户，而非替代用户理解 |
| **认知科学** (元认知) | 思考自己的思考 | Agent 需要 Orient 阶段（反思），否则退化为刺激-反应循环 |

### 2.5 五条最高杠杆洞察

1. **投资工具设计胜过提示设计** — "防呆化"工具、使用自然格式、让误用在结构上不可能
2. **隔离上下文胜过累积上下文** — 多个聚焦的子 Agent 胜过一个超载的 Agent
3. **控制多样性匹配 Agent 多样性** (Ashby定律) — 每个新能力需要对应的控制机制
4. **在每个循环中构建 Orient 阶段** — 没有结构化反思，Agent 会无限重复错误
5. **默认满意解，例外时才优化** — 第一个正确方案通常优于高成本搜索到的"最优"方案


---

## 3. 六维诊断：逐层分析优化空间

### 3.1 维度一：Hook 系统 — 最大的未开发金矿

**诊断结论：严重不足（利用率 ~8%）**

当前仅配置了 1 个 Hook（PostToolUse for ut 的执行日志），而 Claude Code 提供了 12+ 个生命周期事件。这是**整个 Harness 中杠杆最高的优化点**。

**为什么 Hook 如此重要？**

根据 Ashby 控制论定律：控制系统的多样性必须≥被控系统的多样性。你的 Agent 拥有 40+ 工具和极高的自主性，但控制机制几乎为零。这导致：

- 规则遵守依赖概率（CLAUDE.md 中的指令可能被忽略）
- 没有质量门禁（Agent 可以在未验证的情况下宣称完成）
- 没有安全护栏（危险操作没有拦截机制）
- 上下文压缩时状态可能丢失

**缺失的关键 Hook：**

| Hook 事件 | 缺失的用途 | 影响等级 |
|-----------|-----------|----------|
| `Stop` | **质量门禁** — Agent 宣称完成前自动运行 lint/typecheck/test | 🔴 关键 |
| `PreCompact` | **状态保全** — 上下文压缩前提醒保存 task-driver 状态 | 🔴 关键 |
| `PreToolUse` (Bash) | **安全护栏** — 拦截危险命令（rm -rf, git push -f 等） | 🟡 重要 |
| `PostToolUse` (Edit/Write) | **自动格式化** — 代码修改后自动运行 prettier/formatter | 🟡 重要 |
| `Notification` | **长任务通知** — 后台任务完成时桌面弹窗 | 🟢 改善体验 |
| `UserPromptSubmit` | **输入预处理** — 自动注入项目上下文或日期标记 | 🟢 改善体验 |

**Stop Hook 是最高优先级**：目前所有 skill 的验证步骤都是"建议性"的——Agent 可能跳过验证就宣告完成。Stop Hook 能将验证变成**强制性的确定性检查**。

---

### 3.2 维度二：Skill 生态 — 职责重叠与缺失并存

**诊断结论：三大编码 Skill 高度重叠，同时缺少关键工作流 Skill**

#### 问题 A：三角重叠

`auto-goal`、`coding`、`task-driver` 三者存在严重的职责重叠：

```
                 auto-goal
                /    |    \
         学习目标  复杂任务  自主执行
                     |
              ┌──────┼──────┐
              │      │      │
           coding  task-   auto-
            skill  driver   goal
              │      │      │
          中等编码  大型任务  复杂目标
           规划     状态     OODA
           执行     管理     循环
              │      │      │
              └──────┼──────┘
                     │
              大量重叠区域：
          • 状态文件管理
          • 子代理探索
          • 断点继续
          • 阶段化执行
```

**具体冲突场景**：

| 用户输入 | 可能触发 | 理想触发 |
|----------|----------|----------|
| "帮我实现用户认证功能" | auto-goal 或 coding | coding（纯编码任务） |
| "重构这个模块" | coding 或 task-driver | coding（有明确范围的编码） |
| "从断点继续" | task-driver 或 auto-goal | task-recovery 规则路由 |
| "学习 React 并搭建前端" | auto-goal（合适） | auto-goal |
| "设计并实现微服务架构" | 三者都可能 | 应由复杂度决定 |

**根因分析**：三个 Skill 的 description 都包含"复杂任务"、"多步骤"、"断点继续"等触发词，导致 Claude 在选择时产生歧义。

#### 问题 B：缺失的高价值 Skill

| 缺失 Skill | 使用场景 | 当前替代 |
|-------------|----------|----------|
| `commit` / `git-workflow` | Git 提交信息生成、分支管理、PR 创建 | 手动操作或靠 Claude 默认行为 |
| `debug` | 系统化调试工作流 | 无结构化流程 |
| `refactor` | 结构化重构（提取方法、移动类等） | coding skill 粗粒度处理 |
| `security-check` | 安全审计工作流 | 无（官方有 security-guidance 插件未启用） |

#### 问题 C：官方插件几乎未利用

已安装的官方插件市场有 32 个插件，但仅启用了 `revealjs`。以下高价值插件值得考虑：

| 插件 | 功能 | 价值 |
|------|------|------|
| `commit-commands` | 标准化 Git 工作流 | 高 — 补充缺失的 git workflow |
| `code-review` (官方) | 官方代码审查 | 中 — 对比自建的是否更优 |
| `pr-review-toolkit` | PR 审查工具包（含 6 个专用 Agent） | 高 — 多 Agent 协作审查 |
| `security-guidance` | 安全指导 | 中 — 补充安全维度 |
| `feature-dev` | 功能开发（含 code-architect, explorer, reviewer Agent） | 高 — 可替代部分 coding skill |
| `hookify` | Hook 推荐与生成 | 中 — 帮助优化 Hook 配置 |
| `code-simplifier` | 代码简化 | 低 — 已有 simplify skill |

---

### 3.3 维度三：Rules 与 CLAUDE.md — 信噪比问题

**诊断结论：存在信息错配和 Token 浪费**

#### 问题 A：exploration-methodology.md 不属于 Rules

这个文件（254 行，7.5KB，~2000 tokens）是**一次性参考文档**，记录了开发 Clean Code Rule 的过程和方法论。它在 **每次会话** 都会被加载到上下文中，但实际上：

- 它不影响 Claude 的运行时行为
- 它不包含需要遵守的规则
- 它是历史记录，不是指导原则

**成本计算**：假设每天 20 次会话，每次浪费 ~2000 tokens = 每天浪费 40,000 tokens 的上下文空间。

**应该移到**：Memory 系统（`reference` 类型）或 skill 的 references/ 目录。

#### 问题 B：CLAUDE.md 悬空引用

```markdown
- @~/.claude/rules/naming.md - 命名规范（待创建）
```

`naming.md` 被引用但从未创建。这个悬空引用不仅浪费 Claude 的注意力（它可能尝试加载这个不存在的文件），还降低了 CLAUDE.md 作为"可信索引"的信誉。

#### 问题 C：Clean Code 规则过于详细

`clean-code.md`（7.4KB）包含了完整的 SOLID 原则说明、质量检查表、反模式表等。虽然内容质量很高，但**全部加载到每次会话**是否必要？

建议拆分为：
- **核心原则**（~2KB）→ 保留在 rules/ 中（每次加载）
- **检查清单和反模式表**（~5KB）→ 移到 references/（按需加载，如执行 code-review 时）

---

### 3.4 维度四：Memory 系统 — 完全空白

**诊断结论：系统可用但从未使用，错失了跨会话学习的关键能力**

Memory 系统是 Claude Code 的**跨会话持久化机制**，支持 4 种类型的记忆：

| 类型 | 用途 | 当前状态 |
|------|------|----------|
| `user` | 用户角色、偏好、知识背景 | ❌ 空 |
| `feedback` | 用户对 Claude 行为的纠正/确认 | ❌ 空 |
| `project` | 项目上下文、进行中的工作 | ❌ 空 |
| `reference` | 外部资源指针 | ❌ 空 |

**影响**：
- 每次新会话，Claude 都从零开始理解你——不知道你的编码风格偏好、技术栈、团队约定
- 过去的纠正和反馈不会被记住——同样的错误可能反复出现
- 项目上下文丢失——正在进行的工作、关键决策的背景需要每次重新解释

**应该立即建立的记忆**：
- `user` 类型：你的角色（Java 后端开发？全栈？）、主要技术栈、编码偏好
- `feedback` 类型：过去纠正 Claude 的经验（比如"不要过度设计"、"我的团队用 Mockito 不用 PowerMock"）
- `reference` 类型：外部资源指针（Jira、Confluence、内部文档地址等）

---

### 3.5 维度五：上下文工程 — 缺乏系统化策略

**诊断结论：有朴素的上下文意识，但缺乏系统化策略**

#### 当前状态

你的 Skill 中已经有上下文管理的意识（auto-goal 和 task-driver 都提到了子代理隔离、状态外化），但**系统层面缺乏统一的上下文工程策略**。

#### 缺失的策略

**1. 无 Compaction 策略**

Context compaction（上下文压缩）是 Claude Code 最关键的运行时机制之一。当上下文达到阈值时自动触发，将对话历史压缩为摘要。但当前：

- 没有 PreCompact Hook 来保护关键状态
- 没有定义哪些信息在压缩时必须保留
- task-driver 在附录中提到了 PreCompact Hook 但并未实际配置

**2. 无 `/clear` 纪律**

无关任务之间的上下文隔离全靠手动。社区最佳实践建议：

- 每个独立任务开始前 `/clear`
- 长会话中每 30-60 分钟评估是否需要 `/compact`
- 不同类型的工作（编码 vs 审查 vs 研究）应该隔离

**3. 无分层加载策略**

当前所有 rules 都在会话开始时全量加载。缺少按需加载的机制：

```
当前：rules/* 全部加载（~20KB） → 每次会话固定成本
理想：核心原则（~5KB）始终加载 + 详细标准按需加载
```

---

### 3.6 维度六：安全与权限 — 偏宽松

**诊断结论：权限模型偏宽泛，缺少防御层**

#### 当前权限

```json
"allow": ["Bash", "Read", "Edit", "Write", "WebSearch", "WebFetch", "Task"]
```

`Bash` 是最宽泛的权限——它允许执行任意 shell 命令。虽然 Claude Code 有内建安全机制，但没有额外的 PreToolUse Hook 来拦截危险操作。

#### 缺失的安全机制

| 机制 | 说明 | 风险等级 |
|------|------|----------|
| 危险命令拦截 | `rm -rf`, `git push -f`, `DROP TABLE` 等 | 🔴 高 |
| 敏感文件保护 | `.env`, `credentials`, `*.key` 文件的写入/删除 | 🔴 高 |
| 网络请求审计 | 对外 HTTP 请求的记录 | 🟡 中 |
| Deny 规则 | 明确禁止的操作列表 | 🟡 中 |


---

## 4. 优化路线图：按优先级排列的行动项

### 优先级评估框架

每个行动项按两个维度评估：
- **杠杆率**：单位投入产出比（改善效果 / 实施成本）
- **紧迫性**：不做的持续损失

```
        高杠杆率
            │
     P1     │     P0
   (重要)   │   (立即做)
            │
  ──────────┼──────────  紧迫性
            │
     P3     │     P2
   (可选)   │   (计划做)
            │
        低杠杆率
```

---

### P0：立即做（高杠杆 × 高紧迫）

#### P0-1. 配置 Stop Hook（质量门禁）

**问题**：Agent 可以在未验证的情况下宣告任务完成
**解决方案**：添加 Stop Hook，在 Agent 停止前强制运行质量检查

```json
// settings.json → hooks
"Stop": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "echo '🔍 停止前检查: 请确认所有变更已通过验证（编译、测试、lint）再结束任务'"
      }
    ]
  }
]
```

**进阶版**（项目级 settings.json，根据项目类型自动运行检查）：
```json
{
  "type": "command",
  "command": "bash -c 'if [ -f pom.xml ]; then echo \"Java项目：请确认 mvn test 通过\"; elif [ -f package.json ]; then echo \"Node项目：请确认 npm test 通过\"; fi'"
}
```

**预期效果**：将验证从"建议性"变为"提醒性"，显著减少未验证就完成的情况。

---

#### P0-2. 配置 PreCompact Hook（状态保全）

**问题**：上下文压缩可能导致 task-driver 状态丢失
**解决方案**：task-driver 已在附录中设计了这个 Hook，但从未配置

```json
"PreCompact": [
  {
    "matcher": "",
    "hooks": [
      {
        "type": "command",
        "command": "echo '⚠️ 上下文即将压缩。如有进行中的任务，请先将关键状态保存到 .tasks/ 状态文件中。'"
      }
    ]
  }
]
```

**预期效果**：防止长任务中的上下文丢失，保护 task-driver 的状态连续性。

---

#### P0-3. 移除 exploration-methodology.md 出 Rules

**问题**：每次会话浪费 ~2000 tokens 加载非运行时参考文档
**解决方案**：

1. 将其移动到 Memory 系统作为 `reference` 类型记忆
2. 或移到 `~/.claude/skills/skill-creator/references/` 下（仅在创建 Skill 时按需加载）
3. 从 CLAUDE.md 中移除引用

```bash
# 移动文件
mv ~/.claude/rules/exploration-methodology.md ~/.claude/skills/skill-creator/references/
```

**预期效果**：每次会话节省 ~2000 tokens 上下文空间。

---

#### P0-4. 修复 CLAUDE.md 悬空引用

**问题**：`naming.md` 被引用但不存在
**解决方案**：二选一

- **方案 A**：删除引用行（如果命名规范已包含在 clean-code.md 中）
- **方案 B**：创建 `naming.md`（如果确实需要独立的命名规范）

推荐方案 A，因为 `clean-code.md` 中已有"命名质量"检查表，无需重复。

---

### P1：近期做（高杠杆 × 中紧迫）

#### P1-1. 解决 Skill 三角重叠

**问题**：`auto-goal`、`coding`、`task-driver` 职责边界模糊
**解决方案**：明确分工 + 在 description 中设置互斥边界

```
推荐分工模型：

auto-goal  → 非编码类复杂目标（学习、研究、分析、探索）
             + 跨领域目标（需要编码+非编码混合步骤）

coding     → 纯编码任务（实现功能、修 bug、重构）
             分为简单/中等/复杂三档

task-driver → 被 coding 或 auto-goal 内部调用的"引擎"
             不直接面向用户触发，而是作为基础设施
```

**具体修改**：
- `coding` description 增加：`不要在非编码目标（学习、研究、分析）时触发`
- `auto-goal` description 增加：`纯编码任务应使用 coding skill 而非 auto-goal`
- `task-driver` description 增加：`通常由其他 skill 内部调用，而非直接触发。直接触发场景仅限于用户明确说 /task-driver`

---

#### P1-2. 初始化 Memory 系统

**问题**：Memory 完全空白，每次会话从零开始
**解决方案**：创建基础记忆

应该立即创建的记忆文件：

```markdown
# memory/user_profile.md
---
name: 用户开发者画像
description: 用户的角色、技术栈、编码偏好和工作环境
type: user
---
[需要用户提供信息后填充]
- 角色/职位
- 主要技术栈（Java? 前端? 全栈?）
- 团队规模和协作模式
- IDE 偏好
- 编码风格偏好
```

```markdown
# memory/reference_external.md
---
name: 外部资源索引
description: 项目管理、文档、CI/CD 等外部系统的访问信息
type: reference
---
[需要用户提供]
- 代码仓库地址
- CI/CD 系统
- 文档/Wiki 地址
- 项目管理工具（Jira/Linear 等）
```

**预期效果**：跨会话积累用户偏好和项目上下文，减少重复解释。

---

#### P1-3. 启用高价值官方插件

**建议启用**：

| 插件 | 理由 |
|------|------|
| `commit-commands` | 标准化 Git 提交工作流，填补当前空白 |
| `pr-review-toolkit` | 6 个专用 Agent 协作审查，比自建 code-review 更强 |
| `hookify` | 分析对话模式并推荐 Hook 配置，帮助持续优化 |

**评估后决定**：

| 插件 | 需要评估的点 |
|------|-------------|
| `feature-dev` | 是否与自建 coding skill 冲突 |
| `security-guidance` | 安全审计的实际需求频率 |

---

#### P1-4. 拆分 clean-code.md

**问题**：7.4KB 全量加载到每次会话
**解决方案**：

```
clean-code.md（当前 7.4KB）
  ↓ 拆分为
clean-code.md（核心原则，~2KB）→ 保留在 rules/
clean-code-checklist.md（~3KB）→ 移到 references/（code-review 时加载）
clean-code-antipatterns.md（~2KB）→ 移到 references/（code-review 时加载）
```

**预期效果**：每次会话节省 ~5KB（~1300 tokens）上下文。

---

### P2：计划做（中杠杆 × 低紧迫）

#### P2-1. 添加 PostToolUse Hook（自动格式化）

```json
"PostToolUse": [
  {
    "matcher": "Edit|Write",
    "hooks": [
      {
        "type": "command",
        "command": "bash -c 'FILE=\"$CLAUDE_TOOL_ARG_file_path\"; EXT=\"${FILE##*.}\"; case \"$EXT\" in java) echo \"提示：可运行 mvn spotless:apply 格式化\";; js|ts|tsx) echo \"提示：可运行 npx prettier --write $FILE\";; esac'"
      }
    ]
  }
]
```

#### P2-2. 添加 PreToolUse Hook（安全护栏）

```json
"PreToolUse": [
  {
    "matcher": "Bash",
    "hooks": [
      {
        "type": "command",
        "command": "bash -c 'CMD=\"$CLAUDE_TOOL_ARG_command\"; if echo \"$CMD\" | grep -qE \"rm\s+-rf|git\s+push\s+.*-f|DROP\s+TABLE|truncate\"; then echo \"⚠️ 检测到高风险命令: $CMD\"; exit 2; fi'"
      }
    ]
  }
]
```

#### P2-3. 建立上下文工程纪律规则

创建 `~/.claude/rules/context-engineering.md`：

```markdown
# 上下文工程纪律

## 会话卫生
- 不同类型任务之间使用 /clear 隔离
- 长会话（>30分钟）定期评估是否需要 /compact
- 大范围代码探索必须委派给子代理

## 信息分层
- 始终加载：核心原则（thinking.md, clean-code 核心部分）
- 按需加载：详细标准（checklist, 反模式表）
- 外化存储：中间结果、决策记录（写入 .tasks/ 状态文件）

## Compaction 保护
- 关键状态外化到文件后才允许 compact
- PreCompact Hook 会提醒保存状态
```

#### P2-4. 创建项目模板 CLAUDE.md

为常见项目类型创建模板：

```
~/.claude/templates/
├── java-spring.md    # Spring Boot 项目模板
├── react-ts.md       # React TypeScript 项目模板
├── general.md        # 通用项目模板
```

新项目初始化时快速复制：`cp ~/.claude/templates/java-spring.md ./CLAUDE.md`

---

### P3：可选做（低杠杆或实验性）

#### P3-1. 实验多 Agent 审查模式

在 `code-review` skill 中加入对抗性子代理审查：

```
主 Agent → 生成代码
  ↓
审查 Agent → 独立审查（不看主 Agent 的推理过程）
  ↓
主 Agent → 综合反馈并修复
```

#### P3-2. 探索 Agent Teams

Claude Code 的 Agent Teams 功能（实验性）允许多个 Agent 通过共享任务列表协作。适合大型重构任务。

#### P3-3. 自定义 Agent 定义

为高频操作创建专用 Agent（如 `code-explorer.md`、`security-reviewer.md`），放在 `~/.claude/agents/`。

#### P3-4. 考虑 LSP 插件

官方市场有多种 LSP 插件（TypeScript, Java/jdtls, Python/pyright, Go/gopls 等），可以为 Claude 提供类型信息和自动补全上下文，提升代码生成质量。


---

## 5. 终极愿景：优化后的理想架构

### 5.1 目标架构图

```
┌──────────────────────────────────────────────────────────────┐
│                    Claude Code Harness v2.0                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Foundation Layer                                     │    │
│  │  CLAUDE.md (精简索引，<50行)                         │    │
│  │  rules/thinking.md (核心思考原则)                     │    │
│  │  rules/clean-code-core.md (精简核心原则，~2KB)       │    │
│  │  rules/context-engineering.md (上下文纪律)           │    │
│  │  rules/reporting.md + task-recovery.md               │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Memory Layer (跨会话持久化)                          │    │
│  │  user/    → 用户画像、编码偏好、技术栈               │    │
│  │  feedback/ → 行为纠正、确认的有效做法                │    │
│  │  project/ → 项目上下文、进行中工作                   │    │
│  │  reference/ → 外部资源索引                           │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Skill Layer (懒加载，按需激活)                       │    │
│  │                                                     │    │
│  │  编码类    auto-goal ←→ coding (明确边界)            │    │
│  │            task-driver (作为内部引擎)                 │    │
│  │            ut (Java UT)                              │    │
│  │                                                     │    │
│  │  审查类    code-review + pr-review-toolkit (官方)    │    │
│  │            security-guidance (官方)                   │    │
│  │                                                     │    │
│  │  工具类    docx / pdf / xlsx / report / revealjs     │    │
│  │            browser-use / webapp-testing              │    │
│  │                                                     │    │
│  │  元类      skill-creator / skill-optimize            │    │
│  │            commit-commands (官方)                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Hook Layer (确定性控制)                              │    │
│  │                                                     │    │
│  │  PreToolUse(Bash)  → 危险命令拦截                   │    │
│  │  PostToolUse(Edit) → 格式化提醒                     │    │
│  │  PostToolUse(ut)   → 执行日志（已有）               │    │
│  │  PreCompact        → 状态保全提醒                   │    │
│  │  Stop              → 质量门禁检查                   │    │
│  │  Notification      → 长任务完成通知                 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ MCP Layer (外部连接)                                │    │
│  │  context7 (文档查询) + feishu2md (飞书集成)         │    │
│  │  + 按需扩展 (GitHub, DB, CI/CD)                     │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Agent Layer (专用代理)                              │    │
│  │  trip-member-grade-bot (已有)                       │    │
│  │  + code-explorer (代码探索专家)                      │    │
│  │  + security-reviewer (安全审查专家)                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 关键指标对比

| 维度 | 当前状态 | 优化后目标 |
|------|----------|-----------|
| Hook 利用率 | 8%（1/12+） | >50%（6+/12+） |
| 上下文浪费 | ~3300 tokens/会话（exploration-methodology + clean-code 冗余） | <500 tokens/会话 |
| Skill 触发准确率 | 低（三角重叠） | 高（明确边界） |
| Memory 利用 | 0 | 4+ 类型记忆激活 |
| 安全防护 | 仅靠 Claude 内建机制 | Hook + 权限 + Deny 规则多层防护 |
| 跨会话连续性 | 无（每次重新开始） | Memory + 状态文件 + 恢复协议 |
| 质量保证 | 概率性（CLAUDE.md 建议） | 确定性（Stop Hook 强制检查） |

---

## 6. 实施建议

### 6.1 推荐实施顺序

```
Week 1 (P0 — 立即做，预计 1-2 小时):
├── 配置 Stop Hook
├── 配置 PreCompact Hook
├── 移除 exploration-methodology.md 出 rules/
└── 修复 CLAUDE.md 悬空引用

Week 2 (P1 — 近期做，预计 2-4 小时):
├── 解决 Skill 三角重叠（修改 description）
├── 初始化 Memory 系统
├── 启用 commit-commands + pr-review-toolkit 插件
└── 拆分 clean-code.md

Week 3-4 (P2 — 计划做，预计 4-6 小时):
├── 添加 PreToolUse 安全 Hook
├── 添加 PostToolUse 格式化 Hook
├── 创建 context-engineering.md 规则
└── 创建项目模板 CLAUDE.md

持续改进 (P3 — 可选实验):
├── 实验多 Agent 审查
├── 探索 Agent Teams
├── 自定义 Agent 定义
└── 评估 LSP 插件
```

### 6.2 风险提醒

| 风险 | 缓解措施 |
|------|----------|
| Hook 过度拦截导致工作效率下降 | 先用 `echo` 提醒（不阻塞），观察效果后再升级为 `exit 2` 阻塞 |
| Skill 边界修改导致触发失败 | 修改前用 skill-creator 的 eval 基础设施测试触发准确率 |
| 插件冲突 | 逐个启用，每启用一个观察 1-2 天 |
| 过度优化 | 遵循"足够好胜过完美"原则，P0/P1 完成后评估是否需要 P2/P3 |

### 6.3 度量成功

| 指标 | 如何衡量 | 目标 |
|------|----------|------|
| 上下文利用率 | 观察 compaction 触发频率是否下降 | 减少 30%+ |
| 任务完成质量 | 跟踪 Stop Hook 触发后发现的遗漏 | 遗漏率 <10% |
| 会话效率 | 同类任务所需的工具调用次数 | 减少 20%+ |
| 跨会话连续性 | "继续"命令后恢复成功率 | >90% |

---

## 7. 总结

### 7.1 核心发现

你的 Claude Code 环境已经建立了**不错的 Skill 生态和规则体系**，体现出对 AI 编码工作流的深入思考。但从 Harness Engineering 的视角看，存在以下系统性差距：

1. **控制层严重缺失**：Agent 能力强但控制机制弱（Ashby 定律违反）。Hook 系统几乎未使用，导致所有规则都是概率性的，没有确定性保证。

2. **信息层有浪费**：非运行时文档占用每次会话 ~3000+ tokens，clean-code 规则未按需加载。

3. **记忆层完全空白**：每次会话从零开始，无法跨会话积累和学习。

4. **Skill 层有冲突**：三个核心编码 Skill 高度重叠，触发选择靠运气而非设计。

5. **生态利用不足**：32 个官方插件仅启用 1 个，大量已验证的能力未被利用。

### 7.2 最高 ROI 的三个行动

如果只做三件事：

1. **配置 Stop + PreCompact Hook** — 用最小代价获得确定性质量保证和状态保全
2. **解决 Skill 三角重叠** — 消除触发歧义，让正确的 Skill 处理正确的任务
3. **初始化 Memory 系统** — 开启跨会话学习和积累

这三个行动覆盖了控制、执行、记忆三个核心维度，是 Harness 优化的最小有效集。

### 7.3 哲学思考

Mitchell Hashimoto 的 Harness Engineering 核心理念与你已有的"六字原则"高度共鸣：

- **序**（理解先于行动）↔ Harness 的渐进式优化：先观察问题模式，再工程化解决方案
- **验**（用事实闭环）↔ Hook 的确定性验证：不信任概率，要求确定性证据
- **深**（多问一层为什么）↔ Agent 的 Orient 阶段：不做刺激-反应，要结构化反思
- **广**（系统中定位局部）↔ 六层架构思维：每个优化都在系统中定位
- **辨**（区分事实/推断/假设）↔ 信息分级标注：FACT/INFER/ASSUME
- **简**（复杂度需要理由）↔ 满意解原则：第一个正确方案通常就是最好的

你的思维框架是优秀的。接下来的工作是**将这些原则从概率性指令升级为确定性机制**——这正是 Harness Engineering 的核心主张。

