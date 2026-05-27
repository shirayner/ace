# Harness Engineering 综合研究报告 (2025-2026)

> 分析日期: 2026-04-15
> 分析主题: AI Coding Agent 的 Harness Engineering 概念、最佳实践、跨行业设计哲学与实战优化
> 研究范围: OpenAI Codex, Anthropic Claude Code, 社区实践, 跨学科理论

---

## 1. 概念演进：从 Prompt 到 Context 到 Harness

### 1.1 三代范式总览

| 维度 | Prompt Engineering (2022-2024) | Context Engineering (2025) | Harness Engineering (2026) |
|------|-------------------------------|---------------------------|---------------------------|
| **核心问题** | 如何提问 | 如何组织信息 | 如何构建运行环境 |
| **优化对象** | 单轮指令 | 上下文窗口内容 | Agent 的完整操作系统 |
| **时间跨度** | 单次交互 | 单次会话 | 跨会话/长期运行 |
| **人的角色** | 提问者 | 信息策展人 | 环境架构师 |
| **代表技术** | Few-shot, CoT, ReAct | RAG, CLAUDE.md, Memory | Hooks, CI/CD 反馈环, 自修复系统 |
| **核心公式** | Output = f(Prompt) | Output = f(Context) | **Agent = Model + Harness** |

三者不是替代关系，而是嵌套关系：Harness Engineering 包含 Context Engineering，Context Engineering 包含 Prompt Engineering。每一层解决上一层无法触及的问题。

### 1.2 Harness Engineering 的定义

**Mitchell Hashimoto（2026年2月）** 首次正式提出该术语：

> "每当 AI agent 犯错，就在它的环境中建立一个永久性修复，使它不可能再犯同样的错误。"

这个定义强调了两个关键点：
- **环境而非模型**：改进的对象是 agent 运行的世界，而非 agent 本身
- **永久性修复**：不是一次性的 prompt 补丁，而是结构化的基础设施投资

**Martin Fowler / Birgitta Böckeler（2026年4月）** 进一步完善了定义框架：

> "Agent = Model + Harness。Harness 是 agent 中除了模型之外的一切。"

Böckeler 提出了 Harness 的两类组件分类法：
- **Guides（引导/前馈）**：在 agent 行动前引导方向 — 系统提示、CLAUDE.md、rules、架构约束
- **Sensors（传感/反馈）**：在 agent 行动后观察结果 — 测试、lint、CI 验证、人类审查

### 1.3 为什么 Harness Engineering 在 2026 年成为必需

**根因：agent 从"助手"进化为"自主执行者"。**

2024 年的 Copilot 模式是"人写代码、AI 补全"，人始终在循环中。2025-2026 年，agent 开始独立执行多步任务——读代码、写代码、运行测试、修复错误、提交 PR。当 agent 的自主性增加：

1. **错误的放大效应** — 一个错误的假设可以在 50 步后变成灾难性的代码库污染
2. **信任缺口** — 人无法逐行审查 agent 生成的数千行代码
3. **熵增问题** — 大规模 AI 生成的代码会出现风格漂移（OpenAI 称之为 "AI Slope"）
4. **上下文遗忘** — 长期任务超出上下文窗口后，agent 丢失关键决策历史

Harness Engineering 的核心命题：**不改变模型能力的前提下，通过工程化手段让 agent 可靠运行。** 这是一个纯软件工程问题。

### 1.4 核心原则框架

综合 OpenAI、Anthropic、Thoughtworks 的实践，Harness Engineering 的核心原则可归纳为：

1. **约束即赋能** — 减少 agent 的选择空间反而提高成功率。架构边界、lint 规则、测试套件都是约束
2. **反馈必须闭环** — agent 的每个动作都应有验证机制。写代码 → 编译 → 测试 → lint，缺一不可
3. **失败必须吵闹** — 静默失败是 agent 系统的最大敌人。错误必须被捕获、报告、并触发修复流程
4. **环境即文档** — 代码库本身是 agent 最好的文档。AGENTS.md/CLAUDE.md 应是"地图"而非"规则手册"
5. **渐进式构建** — 不试图一次设计完美 harness，而是从每次失败中迭代改进
6. **Harness 即代码** — 所有配置（prompts、skills、hooks）应该版本管理、PR review、持续重构


---

## 2. OpenAI 的方法论：Codex 实验与 Agent 设计

### 2.1 百万行代码实验（2025年8月 - 2026年1月）

OpenAI 在 2025 年 8 月启动了一项内部实验：一个 3 人团队使用 Codex agent 构建一个内部产品，**零行人工代码**。5 个月后：

- **代码量**：超过 100 万行
- **Pull Requests**：约 1500 个
- **开发速度**：约为人类团队的 10 倍
- **产品状态**：内部日常使用 + 外部 alpha 测试

**关键发现：** 成功不在于模型能力，而在于围绕模型构建的 harness 质量。

### 2.2 AGENTS.md 设计哲学

OpenAI 的核心洞察：**"AGENTS.md must be a map, not a rulebook"**（AGENTS.md 必须是地图，而不是规则手册）。

具体含义：
- **地图**：告诉 agent "这里有什么、在哪里、通往何处"，agent 自己导航
- **规则手册**：告诉 agent "必须做 X、禁止做 Y"，agent 被动执行

地图式设计的实践：
1. **架构拓扑可视化** — 用 ASCII 图或简明描述让 agent 理解模块之间的关系
2. **依赖规则声明** — 明确哪些模块可以依赖哪些模块，让 agent 理解边界
3. **业务领域映射** — 让 agent 能直接从代码库理解业务概念，而非通过外部文档
4. **变更影响路径** — 标注修改某模块时可能影响的下游系统

### 2.3 Agent Legibility（Agent 可读性）原则

OpenAI 实验中的一个核心投资方向：**让代码库对 agent 可读**，而非仅对人可读。

具体措施：
- **每个 Git worktree 可独立启动** — agent 可以快速创建隔离环境来测试变更
- **Chrome DevTools Protocol 集成** — agent 可以交互 UI、截屏、诊断前端问题
- **运行时状态可观测** — agent 可以检查应用状态，而非仅看静态代码
- **测试即规格** — 测试套件作为 agent 理解"正确行为"的首要来源

这意味着一个范式转换：**代码的首要读者不再是人类，而是 agent。** 人类通过 agent 生成的摘要和 PR 描述来理解代码。

### 2.4 Entropy Management（熵管理）

大规模 AI 生成代码面临的独特挑战——风格漂移（AI Slope）：

- 不同 agent 会话之间的命名风格不一致
- 抽象层次在不同模块间漂移
- 文档与实现之间逐渐脱节

OpenAI 的应对策略：
1. **严格的 lint/format 规则** — 消除表面层的熵
2. **架构约束自动化执行** — 依赖关系检查集成到 CI
3. **自修复 agent** — 定期运行 agent 来检测并修复文档与代码的偏差
4. **人类架构审查** — 保留人类在高层架构决策上的审批权

### 2.5 OpenAI Agent SDK 设计原则

Agent SDK 围绕几个核心 primitives 构建：

| Primitive | 作用 | 设计理由 |
|-----------|------|----------|
| **Agent** | LLM + 指令 + 工具 | 最小可用单元 |
| **Handoff** | Agent 间任务委托 | 分治原则 |
| **Guardrails** | 输入/输出验证 | 安全边界 |
| **Tracing** | 执行过程记录 | 可观测性 |

设计哲学总结：
- **Feature-rich but simple** — 足够强大但原语极少
- **Python-first** — 用语言原生能力编排，而非 DSL
- **Instructions as system prompt** — agent 指令直接作为系统提示，支持动态回调


---

## 3. Anthropic/Claude Code 的方法论：分层架构与渐进式披露

### 3.1 Claude Code 六层 Harness 架构

Claude Code 的配置体系是一个从稳定到动态的六层架构：

```
Layer 6: Discovery    — MCP Tool Search, 动态发现外部能力
Layer 5: Plugins/MCP  — 外部工具集成 (数据库、API、浏览器)
Layer 4: Hooks        — 确定性行为保障 (PreToolUse, PostToolUse)
Layer 3: Skills       — 领域知识与可复用工作流 (SKILL.md)
Layer 2: Rules        — 模块化编码规范 (.claude/rules/*.md)
Layer 1: Foundation   — 根 CLAUDE.md + 系统提示
```

**设计原则：每层解决一类问题，不越界。**

### 3.2 CLAUDE.md 最佳实践

**尺寸约束：**
- 根 CLAUDE.md 控制在 **60 行以内**（官方建议），最多不超过 200 行
- 超过 300 行时性能明显下降——"指令预算"（instruction budget）效应
- 所有 CLAUDE.md 指令与系统提示共享注意力预算，规则越多，单条被遵循的概率越低

**内容策略：**
- **放什么**：项目构建命令、测试命令、高层架构概述、关键约定（命名规范、分支策略）
- **不放什么**：详细的 API 文档、完整的文件树、具体的代码示例（这些属于 rules/skills）
- **引用式组织**：用 `@path/to/rule.md` 引用详细规则，而非内联

**示例结构：**
```markdown
# Project: MyApp

## Build & Test
- Build: `mvn clean package -DskipTests`
- Test: `mvn test`
- Single test: `mvn test -Dtest=ClassName#methodName`

## Architecture
- Java 17 + Spring Boot 3.2
- 分层架构: Controller → Service → Repository
- 详见 @.claude/rules/architecture.md

## Key Conventions
- 详见 @.claude/rules/clean-code.md
- 异常处理: @.claude/rules/error-handling.md
```

### 3.3 Rules 系统：模块化与路径作用域

Rules 是 CLAUDE.md 之上的精细化控制层：

**路径作用域（Path-Scoped Rules）** — 最强大的特性：
```yaml
# .claude/rules/migration-safety.md
---
globs: ["**/migration/**/*.sql", "**/db/changelog/**"]
---
SQL 迁移必须可回滚。每个 migration 必须包含 rollback 脚本。
禁止 DROP TABLE 除非有数据迁移计划。
```

这意味着 agent 只在编辑 SQL 迁移文件时才会看到迁移安全规则，编辑 React 组件时不会看到，从而：
- 减少无关上下文对注意力的稀释
- 每条规则在相关场景下获得更高的遵循概率
- 实现"按需加载"的认知模型

**层级分离：**
- `~/.claude/rules/*.md` — 个人全局规则（编码风格、思考习惯）
- `.claude/rules/*.md` — 项目级规则（团队共享、可 Git 管理）

### 3.4 Skills 系统：领域知识封装

Skills 是 Claude Code 的"专业技能包"，核心设计：

**Frontmatter 即触发器：**
```yaml
---
name: "API Convention"
description: "当修改或创建 REST API 端点时使用"
trigger: "API, endpoint, controller, REST"
---
```

只有 frontmatter 常驻在上下文中用于匹配（极低 token 开销），完整指令在触发后才加载。这实现了**渐进式披露**（Progressive Disclosure）。

**设计准则：**
- 一个 skill 只解决一类问题（单一职责）
- 触发词精确，避免误触发
- 完整指令中包含具体操作步骤而非泛泛原则
- 可以引用外部文件（`@references/api-spec.yaml`）扩展知识

### 3.5 Hooks 系统：确定性保障

Hooks 与 CLAUDE.md/Rules 的根本区别：

| 特性 | CLAUDE.md / Rules | Hooks |
|------|------------------|-------|
| 执行保障 | **概率性** — 可能被"遗忘" | **确定性** — 必定执行 |
| 实现方式 | 自然语言指令 | Shell 脚本 |
| 触发时机 | 模型推理时参考 | PreToolUse / PostToolUse |
| 适用场景 | 风格偏好、设计原则 | 安全防护、自动格式化、必要检查 |

**关键实践：**
- **安全防护** — PreToolUse hook 阻止写入 `.env`、`credentials.json` 等敏感文件
- **自动格式化** — PostToolUse hook 在文件编辑后自动运行 `prettier` / `eslint --fix`
- **编译检查** — 代码修改后自动触发增量编译，立即反馈错误

**设计原则：如果一个行为"绝对不能忘"，用 hook 而不是 rule。**

### 3.6 Memory 系统：跨会话学习

Claude Code 的 Memory 是实现"越用越懂你"的关键机制：

**四类记忆分类：**
1. **user** — 用户偏好和工作习惯
2. **feedback** — 用户纠正过的行为（必须包含 Why + How to apply）
3. **project** — 项目特定的架构决策和模式
4. **reference** — 外部资源索引和参考链接

**Memory 质量策略（从实践中提炼）：**
- 保存门槛严格：必须跨会话复用 + 不可从代码推导
- 绝不保存：项目构建命令（→ CLAUDE.md）、临时状态、git 历史
- 每条记忆 ≤ 10 行
- MEMORY.md 索引 < 100 行

**内部架构（2026年4月泄露信息）：**
- 多阶段 compaction 流程保护关键记忆不被压缩丢失
- 语义记忆排序器使用 Sonnet 模型对记忆相关性排序
- 记忆以文件形式持久化在 `.claude/` 目录下

### 3.7 Compaction 与上下文卫生

Claude Code 的 auto-compact 在上下文使用达到 ~95% 时触发，将对话历史压缩为摘要。

**Compaction 保护策略：**
- 必须保留：当前任务状态、关键决策理由、已修改文件列表、未完成待办、验证结果
- 可以压缩：探索性搜索的原始结果、已完成阶段的详细输出
- 长任务状态外化：使用 `.tasks/` 目录持久化进度，对抗上下文丢失


---

## 4. 跨行业 Agent 设计哲学

### 4.1 系统提示工程

系统提示是 harness 的"宪法层"。OpenAI 和 Anthropic 的设计哲学有共性也有差异：

**共性原则：**
- **角色定义优先** — 系统提示的第一段明确 agent 的身份、能力边界和行为预期
- **结构化胜于自由文本** — 使用 section headers、表格、编号列表而非大段散文
- **工具使用指南显式化** — 不假设 agent 知道何时用何种工具，显式说明触发条件

**OpenAI 风格：**
- 偏向简洁的 "instructions" 字段
- 支持动态指令回调（运行时根据上下文生成不同指令）
- 强调 agent 的自主判断力

**Anthropic 风格：**
- 多层系统提示架构（基础系统提示 + CLAUDE.md + rules + skills 动态注入）
- "system-reminder" 机制在对话中间插入提醒
- 严格的格式和安全约束

**设计建议：** 系统提示应分层管理——稳定的"宪法"部分很少修改，动态的"上下文"部分根据任务注入。

### 4.2 工具/技能组合模式

**核心模式：最小权限 + 按需发现**

| 模式 | 描述 | 适用场景 |
|------|------|----------|
| **静态工具集** | agent 启动时绑定固定工具 | 简单、可预测的工作流 |
| **动态发现** | agent 运行时搜索并绑定工具 | 复杂、多领域任务 |
| **分层授权** | 基础工具始终可用，高级工具需人类授权 | 安全敏感场景 |
| **工具链** | 多个工具串联为 pipeline | 构建-测试-部署流程 |

**MCP（Model Context Protocol）** 作为工具集成标准正在成为事实标准：
- 统一接口让 agent 连接数据库、API、浏览器等外部系统
- MCP Tool Search 可实现 85% 上下文缩减（只加载需要的工具描述）
- 工具描述本身也是上下文的一部分，过多工具会稀释注意力

### 4.3 上下文窗口管理策略

上下文管理是 harness engineering 中最技术密集的部分：

**策略矩阵：**

| 策略 | 机制 | 效果 | 代价 |
|------|------|------|------|
| **Compaction** | 旧对话压缩为摘要 | 延长有效上下文至百万 token 级 | 细节丢失 |
| **Sub-agent** | 子任务隔离在独立上下文 | 防止交叉污染 | Token 成本增加 |
| **Just-in-Time 加载** | 运行时按需读取文件 | 避免预加载开销 | 延迟增加 |
| **语义压缩** | LLM 自己压缩长文本 | 保留关键信息 | 压缩质量不稳定 |
| **Memory 外化** | 关键信息写入文件系统 | 跨会话持久化 | 需要检索机制 |
| **滑动窗口** | 丢弃最老的消息 | 简单直接 | 可能丢失重要上下文 |

**Anthropic 的最佳实践组合：**
1. Auto-compact 在 95% 容量时触发
2. 探索性搜索通过 sub-agent 执行，避免污染主上下文
3. `.tasks/state.md` 持久化长任务进度
4. Memory 系统存储跨会话知识
5. 大文件使用 offset/limit 按需读取

**Prompt Caching 的经济学：**
- Anthropic 的 prompt cache 有 5 分钟 TTL
- 在 TTL 内的请求享受缓存命中（成本降低约 81%）
- 设计含义：短间隔（<270s）的操作应留在缓存窗口内；长等待（>5min）应一次性跳到 20-30 分钟，避免"刚好过期"的 300s

### 4.4 安全与 Guardrails 模式

**分层防御架构：**

```
Layer 1: 输入筛选    — 过滤敏感信息、检测 prompt injection
Layer 2: 工具调用拦截 — PreToolUse hooks 检查命令合法性
Layer 3: 输出验证    — 检查生成内容的合规性和数据完整性
Layer 4: 业务规则    — 后置业务逻辑验证
Layer 5: 人类审批    — 高风险操作的人工确认
```

**核心模式：**

1. **Policy as Code** — 安全策略集中管理、版本控制、可测试，而非硬编码在提示中
2. **最小权限** — Agent 只能访问完成当前任务所需的最少工具和权限
3. **沙箱执行** — 代码在隔离环境中运行（Docker、Git worktree）
4. **速率限制** — 防止 agent 进入无限循环消耗资源
5. **审计日志** — 所有 agent 操作可追溯

**Claude Code 的具体实现：**
- 权限模型：`settings.json` 中配置允许/拒绝的工具和命令
- `PreToolUse` hooks：拦截危险操作（如 `rm -rf`、写入 `.env`）
- `.claudeignore`：排除敏感文件不进入上下文
- 人类审批流：高风险操作暂停等待确认

### 4.5 多智能体编排模式

**主要编排模式：**

| 模式 | 结构 | 最佳场景 |
|------|------|----------|
| **Orchestrator-Worker** | 中央 agent 分解任务 → 工人 agent 执行 → 聚合结果 | 复杂项目分解 |
| **Hierarchical** | 经理-专家-执行者层级 | 需要多层审批的流程 |
| **Pipeline** | 顺序执行：分析 → 规划 → 实现 → 测试 | 线性工作流 |
| **Fan-out/Fan-in** | 并行分发 → 独立执行 → 结果合并 | 大规模代码审查 |
| **Debate/Consensus** | 多 agent 独立处理 → 对比结果 | 需要高可靠性的决策 |

**实践建议：**
- 从 2-3 个 agent 的简单编排开始，而非一步到位的复杂系统
- 每个 agent 有独立的上下文窗口和工具集——这既是隔离也是限制
- 可观测性是多 agent 系统的生命线：缺少 tracing 几乎无法调试
- 消息传递（而非共享内存）是更可靠的 agent 间通信方式

**Claude Code 中的实际应用：**
- 主 agent + sub-agent 模式：主线程负责规划和决策，sub-agent 负责搜索和探索
- Git worktree 实现并行隔离：多个 agent 可在不同 worktree 中同时工作
- `tmux` 管理多会话：允许人类监控多个 agent 的并行执行


---

## 5. 跨学科洞察：理论如何指导 Agent 设计

### 5.1 认知科学：认知负荷理论（Cognitive Load Theory）

**核心理论：** 人的工作记忆容量有限（Miller's Law: 7±2 个组块）。认知负荷分为三种：
- **内在负荷**（Intrinsic）— 任务本身的复杂度
- **外在负荷**（Extraneous）— 不良设计带来的额外负担
- **相关负荷**（Germane）— 用于构建心智模型的有效负荷

**映射到 Harness 设计：**

| 认知负荷类型 | Agent 设计中的对应 | 优化手段 |
|-------------|-------------------|----------|
| 内在负荷 | 任务本身的复杂度 | 任务分解（sub-agent）、渐进式处理 |
| 外在负荷 | 无关上下文、冗余信息 | 路径作用域 rules、按需加载、.claudeignore |
| 相关负荷 | 帮助 agent 建立正确心智模型的信息 | CLAUDE.md 的架构描述、类型定义、测试用例 |

**关键洞察：** Claude Code 的 "instruction budget" 现象本质上就是 LLM 的"认知负荷"版本——信息过载导致注意力分散。解决方案与人类认知负荷管理一致：**减少噪声（外在负荷）、保留信号（相关负荷）**。

### 5.2 认知科学：注意力管理与 Selective Attention

**理论基础：** Broadbent 的过滤器理论——注意力是一个瓶颈，只有部分信息能通过。

**映射到上下文管理：**
- **CLAUDE.md 60行限制** = 注意力瓶颈的工程化表达
- **Skills 的 frontmatter 设计** = 预注意力筛选（只用元数据判断是否需要深入）
- **Compaction** = 注意力的"遗忘曲线"——旧信息被压缩，新信息保持鲜明
- **Sub-agent** = 分布式注意力——不同 agent 关注不同方面

**实践原则：** 每增加一条规则，所有其他规则被遵循的概率都会降低。这不是 bug，是注意力的物理限制。

### 5.3 控制论：反馈环设计（Cybernetics）

**核心框架：** Wiener 的控制论——系统通过反馈环实现自我调节。

**Harness 中的反馈环分类：**

```
正反馈环（放大信号）:
  成功模式 → 记录到 Memory → 未来重复使用 → 更多成功
  （危险：也可能放大错误模式）

负反馈环（纠偏信号）:
  代码错误 → 测试失败 → agent 修复 → 重新测试 → 通过
  （Harness Engineering 的核心机制）
```

**Böckeler 的 Guides/Sensors 模型正是控制论的映射：**
- **Guides = 前馈控制（Feedforward）**：在行动前引导方向，减少错误发生的概率
- **Sensors = 反馈控制（Feedback）**：在行动后检测偏差，触发纠正

**设计建议：**
1. **双环控制**：
   - 内环（快速）：代码 → 编译 → 测试，秒级反馈
   - 外环（慢速）：PR → CI → 人类审查 → 架构评估，分钟-小时级反馈
2. **反馈延迟最小化**：错误被发现得越早，修复成本越低
3. **反馈清晰度**：测试失败的信息应该足够 agent 理解原因，而非仅输出 "FAIL"

### 5.4 心理学：Flow State 与自主性

**Csikszentmihalyi 的 Flow 理论条件：**
1. 清晰的目标
2. 即时反馈
3. 挑战与能力的平衡

**映射到人-Agent 协作：**
- **清晰目标** → Task 分解要具体到 agent 可独立完成的粒度
- **即时反馈** → Agent 执行结果应实时可见（tmux 多窗口、实时日志）
- **挑战平衡** → 人类专注于高层架构决策（适度挑战），agent 处理实现细节（消除琐碎干扰）

**自主性理论（Deci & Ryan，Self-Determination Theory）：**
- **自主性**（Autonomy）— 人需要感觉在掌控，而非被 AI 替代
- **胜任感**（Competence）— 工具应增强而非取代人的能力感
- **归属感**（Relatedness）— 协作而非对抗的人-AI 关系

**关键洞察：** AI agent 最佳的角色不是"替代者"而是"吸收者"——吸收编程中的干扰、琐碎、重复，让人进入并维持 flow state。设计 harness 时应考虑：
- Agent 处理中断和上下文切换
- 人保持对创造性和架构性决策的控制
- 反馈机制不打断人的思考流（异步通知 > 同步弹窗）

### 5.5 哲学：Extended Mind Thesis

**Clark & Chalmers（1998）的延展心灵论：**

> 如果一个外部过程在功能上等同于一个内部认知过程，且与认知主体充分耦合，那么该外部过程就是认知过程的一部分。

**映射到 AI Agent：**
- **传统观点**：AI 是工具——人思考，AI 执行
- **延展心灵观点**：AI agent + 人 = 混合认知系统——思考本身是分布式的

**设计含义：**
1. **认知耦合质量** — agent 与人之间的信息流转应无摩擦（CLAUDE.md 自动加载、Memory 自动检索）
2. **信任校准** — 人需要准确知道何时可以信任 agent 的判断、何时需要验证（Harness 的 Sensors 角色）
3. **认知卫生** — 如果 AI 是认知的延展，那么上下文污染 = 思维污染。Context hygiene 不仅是效率问题，是认知质量问题
4. **工具透明性** — 延展心灵要求工具是"透明的"（不引起注意），而非"不透明的"（需要额外认知努力才能使用）

**实践推论：** 最好的 harness 让人"忘记" agent 的存在——自然地思考和工作，agent 在背景中无缝运行。越需要人花精力"管理" agent，延展效果越差。

### 5.6 综合框架：四个学科的交汇

```
                     ┌─────────────────┐
                     │  Extended Mind   │ ← 哲学基础
                     │ （认知系统设计）  │
                     └────────┬────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
    ┌─────────▼─────────┐ ┌──▼──────────┐ ┌──▼──────────────┐
    │  Cognitive Load    │ │  Flow State  │ │  Control Theory  │
    │ （注意力工程）     │ │ （体验设计） │ │ （反馈环设计）   │
    └─────────┬─────────┘ └──┬──────────┘ └──┬──────────────┘
              │               │               │
              └───────────────┼───────────────┘
                              │
                     ┌────────▼────────┐
                     │ Harness Design  │ ← 工程实现
                     │ （环境构建）    │
                     └─────────────────┘
```

四个学科共同指向一个结论：**Harness 的核心目标不是控制 agent，而是设计一个人-agent 混合认知系统的最优运行环境。**


---

## 6. 实战建议：Claude Code CLI 环境优化清单

以下建议按优先级排序，从投入产出比最高的开始。

### 6.1 即刻可做（30 分钟内见效）

**A. 精简 CLAUDE.md**
- 审计根 CLAUDE.md，控制在 60 行以内
- 详细规则迁移到 `.claude/rules/*.md`
- 使用 `@引用` 模式替代内联长文本
- 删除可从代码库推导的信息（已有的构建脚本、显而易见的目录结构）

**B. 配置 .claudeignore**
- 排除 `node_modules/`、`build/`、`dist/`、`.git/` 等大目录
- 排除 `.env`、`credentials.json` 等敏感文件
- 排除大型二进制文件和数据文件
- 目标：将 agent 可见的文件树缩减 70%+

**C. 设置关键 Hooks**
```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "检查危险命令的脚本路径"
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "自动格式化脚本路径"
      }
    ]
  }
}
```

### 6.2 一周内建设（架构级改进）

**D. 实施 Rules 路径作用域**
- 为不同代码区域创建专门 rules：
  - `rules/java-service.md` (globs: `["**/service/**/*.java"]`)
  - `rules/sql-migration.md` (globs: `["**/migration/**/*.sql"]`)
  - `rules/frontend.md` (globs: `["**/*.tsx", "**/*.jsx"]`)
- 确保每条 rule 只在相关文件编辑时加载

**E. 创建核心 Skills**
- 项目特定的 coding workflow skill
- 代码审查 skill
- 单元测试生成 skill
- 每个 skill 保持聚焦：一个 skill 解决一类问题

**F. 建立反馈环基础设施**
- 确保 agent 可以运行测试并看到结果
- 配置 lint 自动检查（PostToolUse hook）
- 编译错误立即反馈（而非等到 CI）
- 如果有 TypeScript，启用类型检查作为即时反馈

### 6.3 持续优化（每次失败都是改进机会）

**G. Mitchell Hashimoto 循环**
每次 agent 犯错时执行：
1. 分析错误根因
2. 判断是否可通过环境修复（而非仅靠 prompt）
3. 如果可以：创建 lint rule / test case / hook / rule 文件
4. 验证修复有效
5. 提交到版本控制

**H. Memory 质量管理**
- 定期审查 MEMORY.md 索引（保持 < 100 行）
- 每条 feedback 类型的记忆必须包含 Why + How to apply
- 清除过时记忆（项目结构变化、规则已更新到 CLAUDE.md）
- 避免保存可从代码推导的信息

**I. 上下文经济学**
- 使用 prompt caching：保持操作间隔在 5 分钟 TTL 内（<270s 最佳）
- 探索性搜索通过 sub-agent 执行
- 长任务使用 `.tasks/state.md` 外化进度
- 大文件读取使用 offset/limit 按需加载

### 6.4 高级模式（适合深度用户）

**J. 多 Agent 编排**
- 使用 Git worktree 实现并行隔离工作
- tmux 管理多个 Claude Code 会话
- Orchestrator-Worker 模式：主 agent 规划，sub-agent 执行独立子任务
- 结果汇总和冲突解决在主 agent 上下文中完成

**K. 自修复系统**
- 定期运行 agent 检查文档与代码的一致性
- 自动化回归测试覆盖率检查
- 架构合规性自动验证（依赖方向、分层约束）

**L. Harness 版本管理**
- `.claude/` 目录纳入 Git 管理
- Skills、rules、hooks 的变更通过 PR review
- 定期 refactor harness 配置（与产品代码同等对待）
- 记录 harness 演进历史（哪些规则因为什么原因加入/移除）

### 6.5 Anti-Patterns 清单

以下做法应避免：

| Anti-Pattern | 为什么有害 | 替代方案 |
|-------------|-----------|---------|
| CLAUDE.md 超过 300 行 | 指令预算饱和，遵循率下降 | 拆分到 rules + skills |
| 所有规则放在全局 | 无关规则稀释注意力 | 路径作用域 rules |
| 只用 CLAUDE.md 做安全防护 | 概率性遵循，不可靠 | 使用确定性 hooks |
| 把整个代码库结构写进提示 | 信息过载 + 快速过时 | 让 agent 按需探索 |
| Memory 中存放构建命令 | 属于 CLAUDE.md 的职责 | 迁移到 CLAUDE.md |
| 跳过 Plan 直接 Implement | 返工成本远高于规划成本 | Research → Plan → Implement |
| 不验证 agent 输出 | 错误累积放大 | 测试-lint-编译三重验证 |
| 无限制 agent 循环 | 资源浪费 + 可能偏离正轨 | 设置重试上限和中间检查点 |

---

## 7. 参考来源

### 核心人物与文章
- **Mitchell Hashimoto** — "My AI Adoption Journey" (Feb 2026) — 首次提出 Harness Engineering 术语
- **Birgitta Böckeler (Thoughtworks)** — "Harness engineering for coding agent users" (Apr 2026, martinfowler.com) — Guides/Sensors 分类法
- **Martin Fowler** — Harness Engineering 综合分析 (Apr 2026) — Context + Constraints + Entropy Management 三系统模型
- **OpenAI Codex Team** — 百万行代码实验 (Aug 2025 - Jan 2026) — Agent Legibility, AGENTS.md 设计哲学

### 技术参考
- **OpenAI Agents SDK** — Agent/Handoff/Guardrails/Tracing primitives 设计
- **Anthropic Claude Code** — CLAUDE.md / Rules / Skills / Hooks / Memory 六层架构
- **Anthropic Claude Agent SDK** (Sep 2025) — 自动 compaction, session management, 重试策略
- **Model Context Protocol (MCP)** — 工具集成开放标准

### 学术/理论基础
- **Andy Clark & David Chalmers** — "The Extended Mind" (1998) — 延展心灵论
- **John Sweller** — Cognitive Load Theory — 工作记忆容量限制
- **Mihaly Csikszentmihalyi** — Flow Theory — 最优体验心理学
- **Norbert Wiener** — Cybernetics (1948) — 反馈控制系统理论
- **Deci & Ryan** — Self-Determination Theory — 自主性/胜任感/归属感
- **Donald Broadbent** — Filter Theory of Attention — 选择性注意力

### 社区实践
- Claude Code 社区优化经验：Prompt Caching (81% 成本降低)、Model Tiering、HANDOFF.md 跨会话交接
- Multi-agent 架构实践：Git worktree 并行、tmux 多会话管理
- Context 优化数据：MCP Tool Search (85% 上下文缩减)、Sub-agent (50-70% 上下文缩减)

