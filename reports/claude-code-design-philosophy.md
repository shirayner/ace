# Claude Code 设计哲学与最佳实践研究（2026.04 更新版）

> 分析日期: 2026-04-22
> 分析主题: Claude Code 核心设计哲学、系统提示设计、Skills/Tools 最佳实践、"信任模型原生能力"理念、上下文管理与用户对齐机制
> 数据来源: Anthropic 官方文档 (code.claude.com)、Web 多源研究、社区实践

## 1. 核心设计哲学：Less Scaffolding, More Model

### 1.1 架构本质：简单 while-loop + 丰富基础设施

Claude Code 的核心是一个极简的 agentic loop：

```
while (tool_call) {
    response = call_model(context)
    result = execute_tools(response.tool_calls)
    context = update_context(result)
}
```

模型做出所有路由决策，不依赖 DAG、分类器或 RAG 管线。真正的复杂度分布在围绕这个循环的**运营基础设施（harness）**中：权限系统、五层 Compaction 管线、MCP/Plugin/Skill/Hook 四套可扩展机制、子代理隔离系统、append-oriented 会话存储。

约 98% 的代码是基础设施，仅约 2% 是 AI 决策逻辑。这揭示了关键洞察：**AI Coding Agent 的壁垒不在模型，在 harness**。

### 1.2 五大核心价值观

| 价值观 | 含义 | 设计体现 |
|--------|------|---------|
| Human Decision Authority | 人类保留最终决策权 | 权限层级、Auto Mode 分类器、随时可中断 |
| Safety & Security | 保护用户代码与基础设施 | deny-first 安全模型、推理与执行分离 |
| Reliable Execution | 可靠完成委托任务 | 错误恢复、会话持久化、checkpoint |
| Capability Amplification | 放大人类能力而非仅加速 | 使能新工作流（并行会话、Agent 团队） |
| Contextual Adaptability | 适应不同场景 | 动态提示词组装、多层记忆、Skill 按需加载 |

### 1.3 三条元原则（来自 Anthropic "Building Effective Agents"）

1. **Simplicity** — 用最简方案起步，只在有可衡量改进时才增加复杂度
2. **Transparency** — 规划步骤对用户可见、可检查、可干预
3. **Careful ACI Design** — 工具接口设计比提示词工程更重要（Anthropic 在 SWE-bench 中投入更多时间优化工具而非 prompt）

## 2. 系统提示设计：动态组装与知识下沉

### 2.1 动态提示词架构

Claude Code 的系统提示**不是静态文本，而是运行时动态组装的多层结构**。提示词被分为：

- **静态可缓存前缀** — 跨用户共享，利用 prompt cache 降低延迟和成本
- **动态用户特定后缀** — 由 `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 标记分隔

构建依据包括：用户配置、启用的功能、会话类型、当前模式（Plan/Normal）、活跃工具集、环境变量等。

系统提示的关键组成部分：
1. **Identity & Role** — 简洁的角色定义
2. **Tool Usage Instructions** — 工具使用指南
3. **Coding Standards** — 代码风格指令
4. **Response Tone & Style** — 沟通方式设置（简洁、匹配任务复杂度）
5. **Security Directives** — Cyber Risk Instruction，位于提示词最前部
6. **Environmental Context** — 当前工作目录和环境信息
7. **Subagent Guidelines** — 何时、如何使用子代理

### 2.2 "Push Knowledge Down the Stack" 原则

这是 Claude Code 上下文分层的核心策略——**将知识放在尽可能低的层级**：

| 层级 | 名称 | 性质 | 示例 |
|------|------|------|------|
| Always resident | CLAUDE.md | 每次都加载（~5-10K token） | 项目构建命令、编码规范 |
| Path-loaded | Rules 文件 | 按目录/文件类型触发 | 语言特定规则 |
| On-demand | Skills | 匹配时才加载完整指令 | 工作流、领域知识 |
| Isolated | Subagents | 独立上下文窗口 | 批量搜索、并行研究 |
| Never in context | Hooks | 确定性脚本，不占上下文 | 格式化、lint、审计 |

**选择原则**：如果能用 Hook（确定性），就不用 Skill（概率性）；如果能用 Skill（按需加载），就不放 CLAUDE.md（始终加载）。

### 2.3 上下文预算分配

200K token 窗口的实际分配：

| 类别 | 占用 | 内容 |
|------|------|------|
| Fixed overhead | ~15-20K | 系统指令、Skill 描述符、MCP 工具定义、LSP 状态 |
| Semi-fixed | ~5-10K | CLAUDE.md、Memory 文件 |
| Dynamic available | ~160-180K | 对话历史、文件内容、工具调用结果 |

**MCP Server 工具定义是隐藏的 token 大户**——每添加一个 MCP 服务器，其所有工具定义都占用 fixed overhead。

### 2.4 用户可定制的三种方式

1. **Output Styles** — 替换 tone/style 部分，放在提示词开头以获得最佳遵循度
2. **`--append-system-prompt`** — 插入到工具定义上方
3. **`--system-prompt`** — 替换几乎整个系统提示（仅保留工具定义和基础身份行）

## 3. Skills/Tools 构建最佳实践

### 3.1 Skill 设计原则

SKILL.md 是 Claude Code 技能的标准格式（已被 Codex、Cursor、Gemini CLI 等采用）。核心要点：

- **Description 决定一切** — Skill 发现机制仅读取 name + description（~100 token/skill），匹配时才加载完整指令
- **只写模型缺乏的知识** — Skill 与对话共享上下文窗口，每个 token 都有成本
- **流程导向** — 正文放步骤，背景资料放支撑文件（brand.md、examples.md）按需引用
- **可组合** — Skill 可调用其他 Skill，从小组件构建复杂工作流
- **`disable-model-invocation: true`** — 有副作用的工作流设为手动触发

### 3.2 Hook vs Skill 选择矩阵

| 需求 | 用 Hook | 用 Skill |
|------|---------|---------|
| 每次文件编辑后运行 eslint | Hook (deterministic) | |
| 阻止写入 migrations 目录 | Hook (blocking) | |
| REST API 设计规范 | | Skill (on-demand knowledge) |
| 修复 GitHub issue 的工作流 | | Skill (multi-step procedure) |
| 提交前检查测试通过 | Hook (lifecycle event) | |
| 代码审查方法论 | | Skill (encoded preference) |

**判断标准**：如果行为是"每次都必须发生，零例外"，用 Hook；如果是"某些场景需要的知识或方法"，用 Skill。

### 3.3 Subagent 设计最佳实践

Subagent 是管理上下文的核心机制，每个 subagent 拥有独立上下文窗口、系统提示和工具权限。

**使用场景**：
- 代码探索（搜索结果不污染主上下文）
- 验证（让新上下文审查已实现的代码，避免确认偏差）
- 并行任务（独立子任务同时处理）
- 安全审查（专业化审查 agent，限定工具集）

**设计原则**：
1. 最小工具集 — 仅配备完成任务所需的最少工具
2. 结果精炼 — 仅返回摘要到主 agent，中间过程丢弃
3. 成本路由 — 简单任务可路由到更快/更便宜的模型
4. 不适用短任务 — 启动有开销，极短操作直接在主 agent 中执行

### 3.4 CLAUDE.md 写作铁律

官方最佳实践（来自 code.claude.com/docs/en/best-practices）：

**包含**：Claude 猜不到的 Bash 命令、与默认不同的代码风格规则、测试指令、仓库礼仪、架构决策、环境怪癖

**排除**：Claude 能从代码推导的信息、语言标准约定、详细 API 文档（改为链接）、频繁变化的信息、文件级描述、"write clean code" 之类的自明指令

**核心检验**："删掉这条会导致 Claude 犯错吗？" 如果不会，删掉它。过长的 CLAUDE.md 导致 Claude 忽视真正重要的规则。

## 4. "Trust the Model's Native Capabilities" 的实践含义

### 4.1 核心理念

"信任模型原生能力"意味着：**只构建模型不会自发做的事，把决策留给模型**。

具体表现：
- **无分类器路由** — 模型自行决定使用哪个工具、读取哪个文件、下一步做什么
- **无 DAG 编排** — 没有预定义的工作流图，模型在 while-loop 中自主规划
- **仅 8 个核心工具** — Bash（万能适配器）、Read、Edit、Write、Grep、Glob、Task（子代理）、TodoWrite
- **最少的指令约束** — 提供工具、知识和权限边界，让模型自主操作

### 4.2 实践收益

| 收益 | 说明 |
|------|------|
| 更低延迟 | 无分类器/路由器中间步骤 |
| 更简调试 | 所有决策在模型输出中可追溯 |
| 更好泛化 | 更少的硬编码规则 = 新场景下更灵活 |
| 更少维护 | 不需要维护复杂的编排逻辑 |

### 4.3 Auto Mode 作为"信任"的制度化

Auto Mode 是这一理念的极致体现——用户选择信任模型自主执行，仅由一个轻量分类器做安全兜底：
- 自动批准安全操作（读文件、运行测试、搜索代码）
- 阻止危险操作（删除文件、修改生产配置）提升到人工审批
- 在非交互模式（`-p` flag）下，如果分类器反复阻止操作，则中止任务

### 4.4 与 Harness Engineering 的关系

"Trust the model" 不意味着"不需要 harness"。恰恰相反：

- Harness 提供模型无法自己获得的能力——文件系统、命令执行、网络、权限控制
- Harness 建立安全边界——模型在边界内自由操作
- Harness 管理上下文——Compaction、子代理隔离、Skill 按需加载
- Harness 确保可恢复——checkpoint、会话持久化、状态外化

**核心公式：Trust the model + Build the harness = Effective agent**

## 5. 上下文管理、任务分解与用户对齐

### 5.1 上下文管理：最核心的约束

官方文档明确声明：**大多数最佳实践都基于一个约束——上下文窗口填满得快，性能随之退化。**

管理策略：

| 策略 | 方法 | 何时使用 |
|------|------|---------|
| 重置 | `/clear` | 切换不相关任务 |
| 压缩 | `/compact <focus>` | 上下文过长，指定保留重点 |
| 局部压缩 | `Esc+Esc` → Summarize from here | 保留早期上下文，压缩后段 |
| 隔离 | Subagent | 探索性搜索、批量文件读取 |
| 旁路 | `/btw` | 不进入历史的快速问答 |
| 外化 | 写入文件 | 关键中间产物持久化 |

### 5.2 五层 Compaction 管线

1. **Snip Compact** — 移除较老消息（最轻量）
2. **Micro Compact** — 缓存感知的内容收缩（保留缓存前缀）
3. **Auto Compact** — 达 95% 容量时自动触发的全对话摘要
4. **Manual Compact** — 用户主动触发（`/compact`）
5. **Reactive Compact** — API 错误时的紧急压缩（最激进）

关键设计：与 prompt cache 的 5 分钟 TTL 协调——频率控制在 40-60% 利用率区间内可实现缓存命中率最优。

### 5.3 任务分解：Explore → Plan → Code → Commit

官方推荐的四阶段工作流：

1. **Explore**（Plan Mode）— 读取文件和回答问题，不做修改
2. **Plan**（Plan Mode）— 创建详细实施计划，`Ctrl+G` 编辑计划
3. **Implement**（Normal Mode）— 根据计划编码，配合测试验证
4. **Commit** — 提交变更、创建 PR

但同时明确：**规划并非总是必要的**。如果能用一句话描述 diff，跳过规划直接做。规划在不确定方案、多文件修改或不熟悉代码时最有价值。

### 5.4 用户对齐机制

**验证是最高杠杆实践**。官方原文："This is the single highest-leverage thing you can do."

对齐手段：
- **自验证** — 让 Claude 运行测试、截图比较、验证输出
- **早期纠正** — 发现偏差立即中断（`Esc`），重新引导
- **两次纠正规则** — 同一问题纠正超过两次后 `/clear` 重来，用更好的初始 prompt
- **Interview 模式** — 大型功能让 Claude 先用 AskUserQuestion 工具采访你
- **Checkpoint + Rewind** — 每个动作创建 checkpoint，双击 `Esc` 回滚

### 5.5 五大常见反模式

| 反模式 | 症状 | 解决 |
|--------|------|------|
| Kitchen sink session | 一个会话混杂不相关任务 | `/clear` 切换任务 |
| Correction spiral | 反复纠正不收敛 | 两次失败后 `/clear`，重写 prompt |
| Over-specified CLAUDE.md | 规则太多被忽略 | 删除 Claude 已经正确执行的规则 |
| Trust-then-verify gap | 看起来对但边界未覆盖 | 始终提供验证手段 |
| Infinite exploration | 无范围的"调查" | 限定范围或用 subagent |

## 6. 关键发现总结

1. **架构哲学是 "Less Scaffolding, More Model"** — 简单 while-loop 核心 + 丰富运营 harness，让模型做决策，harness 提供能力和边界
2. **系统提示是动态组装的** — 分 static/dynamic 两段，按模式/工具/状态注入片段，"Push Knowledge Down the Stack" 最小化 always-on 上下文
3. **Skill 设计关键是 Description** — 它是唯一的发现入口；正文只放模型缺乏的知识；Hook 处理确定性行为，Skill 处理概率性知识
4. **"Trust the model" = 不做多余编排** — 无 DAG、无分类器、仅 8 工具，模型自主路由；harness 负责安全边界和上下文管理
5. **上下文是最稀缺资源** — 性能随上下文填满退化，所有实践围绕信噪比优化：subagent 隔离、aggressive clearing、状态外化、Compaction 管线

## 参考来源

- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices) — 官方最佳实践指南
- [Claude Code Overview](https://code.claude.com/docs/en/overview) — 官方概览文档
- [How Claude Code Works](https://code.claude.com/docs/en/how-claude-code-works) — 官方架构说明
- [Extend Claude Code](https://code.claude.com/docs/en/features-overview) — Skills、Hooks、MCP、Subagents 扩展指南
- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic 官方 Agent 设计博文 (2024.12)
- Anthropic Claude Code Source Architecture Analysis (2026) — 社区架构分析
- Claude Code Harness Engineering Study — Harness 工程深度研究
