# Agent Design Philosophy Research: Claude Code, OpenAI, and LLM Agent Best Practices (2025-2026)

> 分析日期: 2026-04-23
> 分析主题: Claude Code / OpenAI 的 Agent 设计哲学、Spec-Driven Development、最小脚手架原则、Agent 自主性权衡
> 研究目的: 为优化 Spec-Driven Development 系统提供理论基础和实践指导

---

## 1. 核心哲学对比：Anthropic vs OpenAI

### 1.1 Anthropic / Claude Code 的设计哲学

Claude Code 的核心设计理念可以用一句话概括：**"Less scaffolding, more model"**（更少脚手架，更多依赖模型）。

这一哲学体现在五个核心价值：

| 核心价值 | 含义 |
|----------|------|
| **Human Decision Authority** | 人类保持最终控制权，权限层级：Anthropic > Operator > User |
| **Safety, Security & Privacy** | 即使用户疏忽，系统也要保护代码、数据和基础设施 |
| **Reliable Execution** | 可靠一致的执行表现 |
| **Capability Amplification** | 增强人类能力，使之前不可能的工作流成为可能 |
| **Contextual Adaptability** | 在不同上下文中运用判断力和价值观 |

**架构选择的深层含义：**

Claude Code 采用了一个极简的 `while(tool_call)` 循环，放弃了复杂的 DAG（有向无环图）、RAG 系统或分类器。模型自主决定何时调用工具、调用哪个工具、何时结束。核心工具仅 8 个：Bash、Read、Edit、Write、Grep、Glob、Task（子代理）、TodoWrite。

这不是偷懒，而是深思熟虑的架构决策：

- **更少的故障点** -- 组件越少，可能出错的地方越少
- **模型驱动的决策** -- 不用手写规则，让模型的推理能力做路由
- **更好的泛化** -- 没有硬编码的规则意味着对新场景的适应更好
- **更容易调试** -- 简单循环比复杂 DAG 更容易追踪问题

一个极具启发性的案例：Anthropic 内部基准测试发现，基于 `grep` 的搜索策略在性能上 **优于** 传统的 RAG 方案，同时复杂度更低。这促使他们从 RAG 切换到 grep，验证了 "trust the model" 的理念。

### 1.2 OpenAI / Agents SDK 的设计哲学

OpenAI 在 2025 年 3 月发布 Agents SDK（替代实验性的 Swarm 框架），代表着向 "agent-native APIs" 的战略转型。其设计哲学同样强调最小抽象，但在 **编排模式** 上比 Anthropic 更加结构化。

核心原语（Primitives）：

| 原语 | 作用 |
|------|------|
| **Agents** | 带指令和工具的 LLM |
| **Handoffs** | 代理间控制转移（一等公民） |
| **Guardrails** | 输入/输出验证 |
| **Sessions** | 对话历史管理 |
| **Tracing** | 调试和监控 |

OpenAI 更倾向于提供 **结构化的编排原语**，而 Anthropic 更倾向于让 **模型自己编排**。

### 1.3 趋同点：两条路线的交汇

尽管路径不同，两者在 2025-2026 年表现出明显趋同：

1. **工具作为核心接口** -- 都将 Agent 视为 "LLM + 工具" 的组合，而非独立的智能体
2. **最小抽象原则** -- 都警惕过度工程化，强调从简单开始
3. **Context Engineering 取代 Prompt Engineering** -- 都认为管理模型看到什么信息比措辞更重要
4. **沙箱和安全** -- 都引入了隔离执行环境来控制风险
5. **子代理模式** -- 都支持任务委托给专门化的子代理

**关键差异仍在于信任模型的程度**：Anthropic 更激进地信任模型的自主决策能力，OpenAI 则提供更多显式的编排结构。

---

## 2. "Less Scaffolding, More Model" 原则

### 2.1 范式转变：从补偿模型到信任模型

2022-2024 年的 Agent 开发范式是 **补偿性的** -- 工程师为模型的不足构建复杂的脚手架：分类器、解析器、状态机、DAG 编排器。这在弱模型时代是合理的。

2025-2026 年的范式是 **信任性的** -- 随着 frontier 模型能力跃升，之前的补偿性脚手架反而成为 **负债**：

```
脚手架的双刃剑效应：

弱模型时代：脚手架补偿能力不足 → 提升系统表现
强模型时代：脚手架限制模型发挥 → 降低系统表现上限
```

**关键研究发现**（2025 EMNLP）：原始输入长度本身就会降低 LLM 推理能力，即使所有相关信息都可获取。这意味着 **每一个不直接服务于任务的脚手架 token，都在消耗模型的推理预算**。

### 2.2 脚手架成为负债的机制

脚手架如何从助力变为阻力：

**1. 信息预过滤陷阱**

专门化的工具可能在模型看到数据之前就过滤掉信息，阻止模型发现某些模式。当工具 "替模型思考" 时，实际上是在限制模型的探索空间。

**2. 上下文窗口的零和博弈**

脚手架指令本身占据 token 预算。系统提示中的每一条规则、每一个 guardrail、每一段格式要求，都在与实际任务内容竞争注意力。

**3. 过时的补偿策略**

为上一代模型设计的 workaround 可能与新模型的原生能力冲突。例如，为 GPT-3.5 设计的 Chain-of-Thought 强制格式，可能反而干扰 Claude 4 / GPT-5 的原生推理流程。

**4. 刚性管道限制灵活性**

硬编码的工作流无法适应模型发现的更优路径。模型可能 "看到" 一个更好的解决方案，但被管道约束在次优路径上。

### 2.3 Claude Code 的实践：Unix 哲学的回归

Claude Code 的架构设计呈现出强烈的 Unix 哲学色彩：

| Unix 原则 | Claude Code 对应 |
|-----------|-----------------|
| 做好一件事 | 每个工具专注单一功能 |
| 文本作为通用接口 | 文件和 CLI 作为通用接口 |
| 组合胜于集成 | Skills 松耦合组合，而非紧耦合框架 |
| 小即是美 | 8 个核心工具 + 模型推理 |

扩展能力通过 **渐进式上下文披露** 实现：

- **Skills** -- 惰性加载的指令文件，仅在匹配时加载完整内容
- **MCP Servers** -- 外部工具集成的标准协议
- **Hooks** -- 生命周期事件的扩展点

这种设计保持核心精简，同时通过边缘扩展获得丰富能力。

### 2.4 何时信任 vs 何时约束：决策框架

研究综合表明，决策不是二元的 "信任或不信任"，而是一个连续谱：

```
完全约束 ←──────────────────────────→ 完全信任
   │                                      │
   ├─ 安全关键操作（删除、推送）           ├─ 探索性搜索
   ├─ 涉及外部系统的操作                   ├─ 代码理解和分析
   ├─ 不可逆操作                           ├─ 路由和决策
   └─ 处理敏感数据                         └─ 方案设计和推理
```

**实践指南：**

- **约束高风险/不可逆操作** -- Shell 命令执行需经过安全管道，web 访问委托给子代理以防 prompt injection
- **信任高频/可逆操作** -- 文件搜索、代码阅读、方案推理让模型自主决定
- **中间地带用验证替代约束** -- 不阻止模型行动，而是在行动后验证结果（Plan-Execute-Verify 模式）

### 2.5 生产环境的务实策略

对于实际生产系统的建议模式：

1. **识别高风险/高价值路径** -- 为这些路径创建经过充分测试的工具
2. **其他地方依赖模型灵活性** -- 不为每个边缘情况都构建工具
3. **投资验证而非预防** -- 检查输出比控制过程更有效
4. **监控和迭代** -- 观察模型实际行为，只在证实的失败模式上添加约束

---

## 3. Spec-Driven Development（SDD）深度解析

### 3.1 从 Vibe Coding 到 Spec Coding 的演进

AI 辅助编码经历了三个阶段：

| 阶段 | 模式 | 工作流 | 痛点 |
|------|------|--------|------|
| **Prompt Coding** | 单次提示 → 代码 | prompt → code → debug → repeat | 迭代黑洞，上下文丢失 |
| **Vibe Coding** | 对话式迭代 | describe → generate → adjust → merge | 方向漂移，一致性差 |
| **Spec Coding** | 规格驱动 | research → spec → refine → tasks → done | 结构化，可追溯 |

Spec-Driven Development 的核心洞见是：**在让 AI 写代码之前，先让 AI 帮你想清楚要写什么**。Spec 不是文档 -- 是共享的 source of truth，是持久化的记忆，是跨会话的状态。

### 3.2 四阶段工作流

#### Phase 1: Requirements（需求规格）

从用户视角定义功能：
- User Stories -- 谁、做什么、为什么
- Acceptance Criteria -- 可验证的完成标准
- 边界与约束 -- 明确不做什么

**关键实践**：使用 `ask_user_question` 工具进行结构化采访，消除歧义，收集决策点。不在模糊状态下推进。

#### Phase 2: Design（技术设计）

将需求转化为技术方案：
- 数据模型定义
- API 契约（接口设计）
- 需要修改的文件清单
- 技术栈决策及理由

**关键实践**：Plan Mode（只读模式）-- 子代理分析现有代码库，生成详细计划的 markdown 文件，包含指令、代码示例、文件结构。**不写任何代码**。

#### Phase 3: Tasks（任务分解）

创建有序的实现计划：
- 明确的依赖关系
- 原子级任务粒度（每个任务可独立提交）
- 每个任务有清晰的完成标准

**关键实践**：Claude Code 的 Task System 管理任务委托、依赖排序和原子提交。pre-commit hooks 运行测试和 lint，为代理提供自动化反馈。

#### Phase 4: Execute（执行实现）

按计划逐任务实现：
- 每个任务在独立的上下文窗口中执行（子代理）
- Spec 文件作为参考文档始终可访问
- 验证通过后自动提交

**关键实践**：每个任务获得 "新鲜上下文"，不受之前失败尝试的污染。Spec 提供持久记忆，避免上下文窗口成为瓶颈。

### 3.3 SDD 解决的核心问题

**1. 决策前置，减少返工**

在 Spec 阶段就解决的问题：
- 技术方案选择 -- 不让模型在实现阶段自主做架构决策
- 接口设计 -- 避免实现到一半发现接口不兼容
- 边界条件 -- 提前识别而非实现时才发现

**2. 上下文管理**

传统模式的痛点是 "上下文污染" -- 失败的尝试、无关的探索、过时的讨论占据宝贵的上下文窗口。SDD 通过以下方式解决：
- Spec 文件作为外部记忆，不依赖上下文窗口
- 任务分解后，每个子任务获得干净的上下文
- 进度持久化到文件系统，跨会话可恢复

**3. 可验证性**

每个阶段都有明确的产出物和验证标准：
- Requirements → Acceptance Criteria 可回溯
- Design → 代码结构可对照
- Tasks → 完成状态可追踪
- Execute → 测试可验证

### 3.4 SDD 的原生支持特性

Claude Code 为 SDD 提供了多个原生特性：

| 特性 | 在 SDD 中的角色 |
|------|-----------------|
| **Plan Mode** | Phase 2 -- 只读分析，不产生代码变更 |
| **Subagents** | Phase 3/4 -- 专门化的子代理，独立上下文 |
| **Task System** | Phase 3/4 -- 任务管理、依赖排序、原子提交 |
| **CLAUDE.md** | 全局 -- 项目宪法，规范所有阶段的行为 |
| **Skills** | 全局 -- 可复用的领域知识和工作流 |
| **ask_user_question** | Phase 1 -- 结构化需求采访 |

### 3.5 SDD 的演进趋势（2025 → 2026）

2025 年晚期的 SDD 是 **人力密集的**：
- 用户手动清理上下文、保存笔记、分割任务、重建状态
- Spec 文件手动维护
- 会话间的连续性依赖人的记忆

2026 年的 SDD 是 **工具辅助的**：
- 自动上下文压缩（Compaction Pipeline）
- Plan Mode 处理大型任务的分析
- Agent Tools 支持并行探索
- 持久化项目记忆（CLAUDE.md + Memory）
- 自然语言替代冗长的 prompt engineering

**趋势总结**：SDD 的方向是将人从 "状态管理者" 的角色中解放出来，让人专注于 **决策** 而非 **流程编排**。

---

## 4. 三代范式演进：Prompt → Context → Harness Engineering

### 4.1 范式演进概览

| 维度 | Prompt Engineering (2022-2024) | Context Engineering (2025) | Harness Engineering (2026+) |
|------|------|------|------|
| **操作层级** | 消息级（Message） | 会话级（Session） | 系统级（System） |
| **核心关注** | 措辞、格式、角色扮演 | 信息选择、时机、结构 | 完整运行环境设计 |
| **关键技术** | Few-shot, CoT, Role-play | Token 预算、检索策略、压缩 | 架构约束、反馈循环、生命周期管理 |
| **类比** | 写一封好邮件 | 管理整个收件箱 | 设计整个通信系统 |
| **主要受众** | 所有 AI 用户 | Agent 开发者 | Agent 基础设施工程师 |

### 4.2 Context Engineering 的核心原则

Context Engineering 已在 2025-2026 年取代 Prompt Engineering 成为关键技术学科。核心洞见：

> **"AI bugs are context bugs"** -- 模型的大多数错误不是推理错误，而是上下文错误。

**关键原则：**

**1. Context Rot（上下文腐烂）**

更大的上下文窗口不能解决问题。目标是保持工作集 **小、相关、新鲜**：
- Token 预算管理 -- 不是能放多少就放多少，而是精确控制放什么
- 智能检索 -- Hybrid Search + Reranking，不是暴力全文
- 工具输出卸载 -- 大量输出不保留在上下文中
- 压缩（Compaction） -- 旧信息的摘要替代原始内容

**2. 将模型视为 CPU 而非大脑**

不是 "跟模型对话"，而是 "给模型喂数据"：
- 系统提示应该 **小、稳定、结构化、指向外部**
- CLAUDE.md / AGENTS.md 应作为 **目录** 而非 **百科全书**
- 按需加载而非预加载

**3. 分离上下文收集与深度推理**

OpenAI Codex 的 "Repo Prompt" 架构：
- 轻量级模型负责上下文收集（扫描代码库、收集相关文件）
- 重量级模型负责深度推理（基于精心策划的上下文进行分析）

### 4.3 Harness Engineering：2026 年的新前沿

> **"The model is commodity; the harness is moat."**

Harness Engineering 是 2026 年出现的最高层级 Agent 工程学科，关注 **完整的自主代理运行环境**。

**四大支柱：**

**1. Context Design（上下文设计）**
- 模型在开始任务前知道什么，信息如何随时间结构化和维护
- KV-cache 优化
- 用 `todo.md` 等模式防止目标漂移
- 保留错误证据

**2. Tool Selection（工具选择）**
- 代理可以访问哪些工具，如何命名，可用性如何动态管理
- 工具箱审计
- 阶段特定的工具门控（Logits masking）

**3. Constraint Management（约束管理）**
- 时间预算、推理深度分配、循环检测、验证门
- **Reasoning Sandwich Pattern** -- 推理/行动/推理的三明治结构
- **Ralph Wiggum Loop** -- 检测和打破代理的循环执行模式

**4. Verification Loops（验证循环）**
- 确认代理行动和输出正确的结构化反馈机制
- **Plan-Execute-Verify (PEV)** 模式 -- 将规划、执行和验证分离为独立阶段
- 可观测性驱动 -- 自动化检查 + 生产遥测来快速验证

### 4.4 Claude Code 的五层压缩管线

Claude Code 实现了一个精细的上下文管理系统，体现了 Context Engineering 的最佳实践：

```
Layer 1: Static Instructions (CLAUDE.md, System Prompt)
    ↓ 始终存在，占固定预算
Layer 2: Auto Memory (跨会话自动累积)
    ↓ 持久化的学习和偏好
Layer 3: Session Memory (单会话内的连续性)
    ↓ 当前任务的工作状态
Layer 4: Dynamic Context (Skills, Tool Results)
    ↓ 按需加载和卸载
Layer 5: Compaction Pipeline (自动压缩)
    ↓ 旧信息摘要化，保留决策和结论
```

这个管线的设计目标是：**让模型始终拥有最相关的上下文，同时保持总 token 数在最优范围内**。

### 4.5 对 Spec-Driven 系统的启示

Context Engineering 和 Harness Engineering 为 SDD 系统优化提供了直接指导：

1. **Spec 文件应作为上下文的锚点** -- 不是全量加载，而是按需提取相关章节
2. **任务执行时的上下文应精心策划** -- 只给子代理它需要的 spec 片段 + 相关代码
3. **验证循环应嵌入工作流** -- 不是事后补救，而是每步验证
4. **状态持久化到文件系统** -- 上下文压缩时不丢失关键进度

---

## 5. Agent 自主性与控制的权衡

### 5.1 核心张力

Agent 设计中存在一个根本性的矛盾：

> **自主性是 Agent 创造价值的前提，但控制是人类信任 Agent 的前提。**

Claude Code 的数据显示了 "信任轨迹" 的存在：自动批准率随使用时间从约 20% 上升到超过 40%。这说明信任是渐进建立的，系统设计应支持这种渐进性。

### 5.2 Anthropic 的编排模式分类

Anthropic 在 "Building Effective Agents" 中提出了从简单到复杂的模式谱系：

```
简单 ←─────────────────────────────────────→ 复杂

Single Call    Chain    Tool Use    Orchestrator    Multi-Agent
  Prompt      of CoT    Workflow     Worker         Collaboration
    │           │          │            │                │
    └── Workflows ─────────┘            └── Agents ──────┘
    （预定义代码路径编排）              （LLM 动态决策和迭代）
```

**核心建议：从最简单的能解决问题的模式开始，只在必要时添加复杂性。**

### 5.3 Skills 和 Hooks 的设计：渐进式能力披露

Claude Code 的 Skills 和 Hooks 体现了一种精妙的自主性管理：

**Skills 的设计原则：**

| 原则 | 说明 |
|------|------|
| **惰性加载** | 启动时只读 name + description，匹配时才加载完整 SKILL.md |
| **单一职责** | 每个 Skill 专注一件事，避免 "mega-skills" |
| **角色框架** | 明确定义 Claude 在使用该 Skill 时扮演的角色 |
| **结构化工作流** | Skill 是 "mini-program"，有明确的步骤序列 |
| **清晰的 I/O** | 定义输入期望和输出格式，确保可预测、可复用 |
| **领域知识编码** | 显式包含约束和业务逻辑，防止模型做出错误假设 |

**Skills 的分层架构：**

- **Reference Skills** -- 承载知识（设计原则、组件规格、业务规则）
- **Capability Skills** -- 编排工具 + 引用 Reference Skills 来完成任务

**Hooks 的设计：**

Hooks 提供生命周期扩展点，允许在 Agent 行为的关键节点注入自定义逻辑：
- 文件保存前/后的质量检查
- 命令执行前的安全验证
- 会话开始/结束时的状态管理

**这种设计的精妙之处在于**：模型保持自主决策的能力，但在 **关键节点** 受到人类定义的约束。不是限制模型 "能做什么"，而是在特定边界处设置 "检查站"。

### 5.4 Anthropic vs OpenAI 的编排哲学差异

**Anthropic 的方式：隐式编排**

模型自己决定工具调用序列。编排逻辑在模型的推理中，而非代码中。

优势：灵活、适应性强、能发现意外的好方案
劣势：不可预测、难以保证一致性、调试时路径不透明

**OpenAI 的方式：显式编排**

Handoffs 作为一等公民，明确定义代理间的控制转移。

优势：可预测、可审计、路径清晰
劣势：灵活性受限、需要预先定义所有可能的转移路径

**融合趋势（2026）**：

实践证明最有效的模式是 **混合方式**：
- 宏观流程用显式编排（Specify → Plan → Tasks → Execute）
- 每个阶段内部用隐式编排（模型自主决定如何完成子任务）
- 阶段转换用验证门控（前一阶段输出满足标准才进入下一阶段）

### 5.5 多代理协作模式

两种主流模式及其权衡：

**Manager 模式（集中式）**
```
        ┌─── Specialist A
Manager ├─── Specialist B
        └─── Specialist C
```
- 中心代理维护全局状态，分配任务，合并结果
- 适合：子任务不预定义、需动态发现的场景
- 风险：Manager 成为瓶颈和单点故障

**Peer Handoff 模式（去中心化）**
```
Agent A ←→ Agent B ←→ Agent C
```
- 代理间直接传递控制
- 适合：角色明确、转移条件清晰的场景
- 风险：难以追踪全局状态、可能出现循环

**Claude Code 的实际选择**：主要使用 Manager 模式 -- 主代理做决策，子代理（subagents）执行特定任务。子代理有独立的上下文窗口、系统提示和工具集，但受主代理的目标指引。

---

## 6. 对 Spec-Driven 系统优化的综合启示

### 6.1 核心设计原则提炼

综合 Anthropic、OpenAI 和学术界的最新实践，提炼出 Spec-Driven 系统优化的七条核心原则：

**原则 1：最小脚手架，最大模型信任**

> 每一行指令都有成本。只在证实的失败模式上添加约束，而非预防性地约束一切。

具体表现：
- Skill 指令精简到模型需要知道的最少信息
- 避免重复模型已经能做好的事（如基本的代码格式化）
- 用验证替代控制 -- 检查输出而非微管理过程

**原则 2：渐进式上下文披露**

> 模型不需要一次看到所有信息，它需要在正确的时间看到正确的信息。

具体表现：
- Skills 惰性加载 -- 只在匹配时加载完整指令
- Spec 文件按需提取 -- 执行任务时只加载相关的 spec 片段
- 工具描述精简 -- name + description 先行，detail 按需

**原则 3：外化状态，对抗上下文压缩**

> 不依赖上下文窗口保持状态，将关键信息持久化到文件系统。

具体表现：
- Spec 文件、任务状态、进度摘要写入 `.tasks/` 目录
- 决策及其理由持久化 -- 压缩后仍可恢复
- 每个阶段完成后更新外部状态文件

**原则 4：宏观显式编排，微观隐式编排**

> 大的阶段转换用结构化流程，每个阶段内部让模型自由发挥。

具体表现：
- Specify → Plan → Tasks → Execute 的四阶段流程是显式的
- 每个阶段内部的工具调用、文件搜索、方案推理是模型自主的
- 阶段间用验证门控 -- 满足条件才进入下一阶段

**原则 5：验证循环内建**

> 验证不是事后补充，是工作流的一等公民。

具体表现：
- Plan-Execute-Verify 模式贯穿每个任务
- pre-commit hooks 提供自动化验证反馈
- Acceptance Criteria 在 Spec 阶段就定义，Execute 阶段逐条验证

**原则 6：子代理隔离上下文**

> 复杂任务的关键不是一个超长的上下文，而是多个精心策划的短上下文。

具体表现：
- 每个子任务由独立子代理执行，获得干净的上下文
- 子代理只接收该任务需要的 spec 片段 + 相关代码
- 探索性搜索在子代理中进行，避免结果污染主上下文

**原则 7：面向模型进化设计**

> 为今天的模型设计的 workaround，明天可能成为障碍。保持架构的可退化性。

具体表现：
- 约束应可配置和可移除，而非硬编码
- 定期审查脚手架的必要性 -- 模型能力提升后移除过时的约束
- 偏好声明式约束（告诉模型什么是好的结果）而非过程式约束（告诉模型每一步怎么做）

### 6.2 Spec-Driven 系统的优化方向矩阵

基于以上原则，识别四个优化维度：

```
                    ┌─────────────────────────────────────┐
                    │           优化维度矩阵              │
     ┌──────────────┼──────────────┬──────────────────────┤
     │              │  降低成本     │  提升质量            │
     ├──────────────┼──────────────┼──────────────────────┤
     │  Spec 阶段   │ 简化模板     │ 结构化采访           │
     │              │ 按需深度      │ 决策前置             │
     ├──────────────┼──────────────┼──────────────────────┤
     │  执行阶段    │ 精准上下文   │ 验证循环             │
     │              │ 子代理隔离    │ 原子提交             │
     ├──────────────┼──────────────┼──────────────────────┤
     │  Skill 设计  │ 惰性加载     │ 领域知识编码         │
     │              │ 指令精简      │ 角色框架             │
     ├──────────────┼──────────────┼──────────────────────┤
     │  系统架构    │ 最小工具集   │ 持久化状态           │
     │              │ 渐进披露      │ 压缩保护             │
     └──────────────┴──────────────┴──────────────────────┘
```

### 6.3 具体优化行动建议

**高优先级（投入产出比最高）：**

1. **精简 Skill 指令** -- 审计现有 skills，移除模型已经能自主做好的指令，只保留 "不说就会做错" 的部分。目标：每个 skill 指令量减少 30-50%。

2. **实现按需上下文加载** -- Spec 文件不全量加载，而是按当前任务提取相关片段。利用 Claude Code 的子代理机制实现上下文隔离。

3. **强化验证循环** -- 在每个执行步骤后嵌入验证检查点，利用 hooks 和 pre-commit 提供自动化反馈，减少人工检查成本。

**中优先级（结构性改进）：**

4. **Spec 模板分层** -- 根据任务复杂度自动选择 Spec 深度（简单变更用轻量模板，复杂功能用完整四阶段）。

5. **决策日志持久化** -- 在 Spec 和 Design 阶段，将关键决策及理由显式写入文件，支持跨会话追溯和上下文压缩后的恢复。

6. **子代理上下文模板** -- 为不同类型的子任务（实现、测试、审查）预定义上下文模板，确保子代理获得精准的信息集。

**探索性（前沿方向）：**

7. **约束可退化性审计** -- 建立机制定期评估现有约束的必要性，随模型能力提升逐步放松过时的限制。

8. **Harness 级别的工具门控** -- 在不同阶段动态调整可用工具集（Spec 阶段只有读取和搜索工具，Execute 阶段开放写入工具）。

### 6.4 关键洞见总结

1. **2025 是 Agent 之年，2026 是 Harness 之年** -- 焦点从构建 Agent 转向构建 Agent 运行的环境。Spec-Driven 系统本质上就是一种 Harness。

2. **最大的杠杆在上下文管理** -- 不是更好的 prompt，而是更精准的 context。模型的大多数错误是上下文错误，而非推理错误。

3. **SDD 的本质是将人从状态管理中解放** -- 让 Spec 文件承载记忆，让 Task System 承载进度，让 Hooks 承载验证，人只需要做决策。

4. **"Trust the model" 不是放任不管** -- 而是在正确的层级信任。信任模型的推理和工具使用，约束安全和不可逆操作，验证输出质量。

5. **脚手架的最佳数量不是零** -- 而是 "恰好足够"。每一行约束都应该能回答："如果去掉它，模型会做出什么错误决策？"

---

## 参考来源

- [Google Search: Claude Code design philosophy principles](https://www.google.com/search?q=Claude+Code+design+philosophy+principles+Anthropic+2025+2026)
- [Google Search: Claude Code spec-driven development](https://www.google.com/search?q=Anthropic+Claude+Code+%22spec-driven+development%22+OR+%22spec+coding%22+agent+design)
- [Google Search: OpenAI agent design philosophy Agents SDK](https://www.google.com/search?q=OpenAI+agent+design+philosophy+best+practices+Agents+SDK+2025+2026)
- [Google Search: LLM agent design patterns minimal scaffolding](https://www.google.com/search?q=LLM+agent+design+patterns+minimal+scaffolding+%22trust+the+model%22+2025+2026)
- [Google Search: Claude Code system prompt CLAUDE.md skills hooks](https://www.google.com/search?q=Claude+Code+system+prompt+design+best+practices+CLAUDE.md+skills+hooks+2025+2026)
- [Google Search: OpenAI orchestration patterns context engineering](https://www.google.com/search?q=OpenAI+orchestration+patterns+multi-agent+handoff+%22context+engineering%22+2025+2026)
- [Google Search: Claude Code agent autonomy control architecture](https://www.google.com/search?q=Anthropic+%22Claude+Code%22+agent+autonomy+control+tradeoffs+architecture+internal+design)
- [Google Search: Claude Code trust the model minimal tools](https://www.google.com/search?q=Claude+Code+%22trust+the+model%22+native+capabilities+minimal+tools+agent+philosophy)
- [Google Search: Anthropic building effective agents patterns](https://www.google.com/search?q=Anthropic+blog+%22building+effective+agents%22+patterns+orchestration+workflows+2025)
- [Google Search: Claude Code spec-driven four phase workflow](https://www.google.com/search?q=Claude+Code+spec-driven+development+workflow+plan+mode+implementation+four+phase+2025+2026)
- [Google Search: Harness engineering agent 2026](https://www.google.com/search?q=%22harness+engineering%22+agent+2026+verification+loops+supervision+scaffolding+model+capabilities)
- [Google Search: Less scaffolding more model when to constrain](https://www.google.com/search?q=Anthropic+Claude+Code+%22less+scaffolding+more+model%22+agent+design+principles+when+to+constrain+when+to+trust)
- [Google Search: Context engineering vs prompt engineering 2026](https://www.google.com/search?q=OpenAI+Codex+agent+architecture+%22context+engineering%22+versus+%22prompt+engineering%22+best+practices+2026)
