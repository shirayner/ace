# Stateful AI-Assisted Coding Workflows: Design Patterns Research

## Executive Summary

本报告分析了 OpenHands、SWE-agent、Aider、Continue.dev、Claude Code 等主流 AI 编码工具的架构模式，提炼出有状态多阶段开发工作流的核心设计原则、模式与反模式。

---

## 1. Finite State Machine Patterns for Multi-Phase Developer Workflows

### 1.1 SWE-agent: Trajectory-Based Linear Loop

SWE-agent 采用**最简单的状态模型** — 没有显式的 FSM，而是一个 `while not done` 循环：

```
setup → [step → step → ... → done] → save_trajectory
```

**核心数据结构：**

```python
class StepOutput(BaseModel):
    thought: str = ""        # 思考过程
    action: str = ""         # 执行的动作
    observation: str = ""    # 环境反馈
    done: bool = False       # 终止信号
    submission: str | None   # 最终提交（patch）
    state: dict[str, str]    # 环境快照

class TrajectoryStep(TypedDict):
    action: str
    observation: str
    response: str
    state: dict[str, str]
    thought: str
    execution_time: float
```

**关键设计决策：**
- **无显式状态枚举**：用 `done` 布尔值 + `exit_status` 字符串代替 FSM
- **Trajectory 作为持久化日志**：每步都追加到 trajectory 并写入磁盘（`.traj` 文件）
- **错误分为两类**：可重试（requery model）vs 致命退出（autosubmit + exit）

**恢复模式：**
- 当 Runtime 死亡时，从最后一个 trajectory step 的 `state["diff"]` 中恢复
- `attempt_autosubmission_after_error()` — 无论如何都尝试提取 patch

### 1.2 SWE-agent RetryAgent: Multi-Attempt Orchestration

```
RetryAgent
├── Attempt 0: DefaultAgent.run() → submit
│   └── Reviewer evaluates submission
├── Attempt 1: env.hard_reset() → DefaultAgent.run() → submit
│   └── Reviewer evaluates submission
└── Choose best attempt (by reviewer score)
```

**关键模式：**
- **Cost Budget 分配**：每次 attempt 的 budget = 剩余总预算
- **环境硬重置**：每次 retry 完全重置环境状态
- **Trajectory 持续保存**：每步、每次 attempt 结束都保存

### 1.3 OpenHands: Event-Driven Architecture

- **Action/Observation 事件流**：Agent 产生 Action，环境返回 Observation
- **Runtime 抽象层**：Docker/Local/Remote 统一接口
- **Plugin 系统**：Bash Session、Jupyter、BrowserEnv

### 1.4 Claude Code: Three-Phase Agentic Loop

```
Gather Context → Take Action → Verify Results → (repeat until done)
```

**状态管理机制：**
- **Checkpoints**：每次文件编辑前自动快照，支持 `/rewind` 回滚
- **Session Persistence**：JSONL 文件记录完整对话历史
- **Auto-Compaction**：上下文满时自动压缩，保留关键信息
- **Worktrees**：通过 Git worktree 实现并行隔离

### 1.5 Aider: Git-as-Checkpoint

- **Git commit 作为原子检查点**：每次成功修改自动 commit
- **Lint/Test 反馈循环**：edit → lint → test → fix → repeat
- **Repository Map**：全局代码库映射辅助决策

---

## 2. Spec-Driven Development with AI

### 2.1 Anthropic 推荐的 "Interview → Spec → Implement" 模式

```
Phase 1: Interview（澄清需求，用 AskUserQuestion 工具）
Phase 2: Write Spec（生成 SPEC.md）
Phase 3: Fresh Session → Implement from Spec
```

**关键洞察：**
> "Once the spec is complete, start a fresh session to execute it. The new session has clean context focused entirely on implementation."

**Spec 质量标准：**
- Self-contained：命名相关文件和接口
- 明确 out-of-scope
- 包含端到端验证步骤

### 2.2 从外部平台获取 Spec 的挑战

**问题：**
- Spec 可能包含错误或模糊描述
- Spec 可能引用不存在的基础设施
- Spec 中的技术方案可能不适合当前代码库

**应对模式：**
1. **Validate-Before-Execute Gate**：在实现前验证 spec 的可行性
2. **Divergence Log**：记录实际实现与 spec 的偏差
3. **Feedback Loop to Platform**：将发现的问题回传到 spec 平台

### 2.3 Plan-Implement Separation（Anthropic Prompt Chaining）

> "Prompt Chaining decomposes tasks into sequential steps with programmatic validation gates between stages."

核心原则：**"trades off latency for higher accuracy, by making each LLM call an easier task"**

---

## 3. Claude Code Custom Skills / Harness Architecture

### 3.1 Skill 架构要点

| 特性 | 说明 |
|------|------|
| **生命周期** | 加载一次，整个 session 保持在上下文中 |
| **Compaction 行为** | 保留前 5000 tokens，总共 25000 token budget |
| **隔离执行** | `context: fork` 在子 agent 中运行，不污染主上下文 |
| **动态注入** | `` !`command` `` 在 skill 加载前执行，注入实时数据 |

### 3.2 复杂编排 Skill 的设计模式

**推荐结构：**
```
my-skill/
├── SKILL.md           # 简洁指令（<500行）
├── template.md        # 模板
├── examples/          # 示例
└── scripts/           # 可执行脚本
```

**关键约束：**
- **SKILL.md 保持简洁**：每行都是持续的 token 成本
- **Reference 文件按需加载**：详细文档放在独立文件中
- **Sub-agent 隔离**：重计算/重读取操作应 fork 到子 agent

### 3.3 Skill 失败模式（Anti-Patterns）

| 反模式 | 症状 | 解决方案 |
|--------|------|----------|
| **Kitchen Sink Skill** | 把太多逻辑放在一个 prompt 中 | 拆分为多个 skill + sub-agent 协作 |
| **Context Overflow** | skill 内容过长，compaction 后丢失关键指令 | 保持核心 <500 行，引用外部文件 |
| **Stateful Assumption** | 假设上下文中有之前步骤的结果 | 用 `!command` 动态注入当前状态 |
| **Unverifiable Actions** | 执行操作但没有验证手段 | 每个阶段都包含验证步骤 |
| **Infinite Exploration** | 无边界的代码探索消耗完上下文 | 用 sub-agent 隔离探索，返回摘要 |

### 3.4 Claude Code 的 Orchestrator-Workers 模式

> "A central LLM dynamically determines subtasks and delegates to workers, suited for unpredictable problem decomposition like multi-file code changes."

在 Claude Code 中的实现：
- **主会话**：决策 + 验证
- **Sub-agents（Explore）**：代码探索，只读
- **Sub-agents（Plan）**：方案规划，不加载 CLAUDE.md
- **Sub-agents（general-purpose）**：执行具体任务

---

## 4. Decision Tracking and Divergence Management

### 4.1 SWE-agent 的 Trajectory 模式

每一步都记录完整的决策上下文：
```python
TrajectoryStep = {
    "action": "执行了什么",
    "observation": "环境反馈什么",
    "response": "模型原始输出",
    "thought": "思考过程",
    "state": {"diff": "...", "open_file": "..."},  # 环境快照
}
```

**关键特征：**
- 完整可重放（replay 机制）
- 审查者可在事后评估任意步骤的决策质量
- 每步都有环境状态快照，不依赖运行时

### 4.2 Anthropic 的 Evaluator-Optimizer 模式

> "Implements iterative refinement loops where one LLM generates responses while another provides feedback."

**应用于 divergence 管理：**
1. **Writer Agent** 执行实现
2. **Reviewer Agent**（新上下文）对比 diff vs spec，报告 gaps
3. Writer 修复，再次 review
4. 人工最终确认

### 4.3 实用 Divergence 管理策略

**从 Claude Code Best Practices 提炼：**

| 策略 | 实现 |
|------|------|
| **Early Course Correction** | 发现偏离立即用 `Esc` 中断并重新引导 |
| **Checkpoint + Rewind** | 每步 checkpoint，偏离时回滚到正确状态 |
| **Adversarial Review** | 完成后用独立 sub-agent 做 "fresh eyes" review |
| **Evidence-Based Verification** | 要求展示证据（测试输出、截图）而非断言成功 |

### 4.4 Decision Record Pattern（适用于平台对接）

```
Decision Log Entry:
├── original_spec_item: "spec 原文"
├── actual_implementation: "实际做法"
├── divergence_reason: "为什么不同"
├── impact: "对其他 spec items 的影响"
└── sync_action: "需要回传平台的信息"
```

---

## 5. Infrastructure Readiness Checks

### 5.1 从 SWE-agent 的环境管理模式学习

```python
# SWE-agent 的 setup 流程：
env.start()                          # 启动运行环境
tools.install(env)                    # 安装工具
env.set_env_variables(...)           # 设置环境变量
# 然后才开始 agent loop
```

**关键原则：环境就绪是 agent 运行的前置条件，不是可选步骤。**

### 5.2 Claude Code 的 `/run-skill-generator` 模式

> "It gets your app running from a clean environment, captures what worked (the install commands, the env vars, the launch script), and commits it as a per-project skill."

**模式：Discover → Record → Replay**
1. 第一次：探索如何让项目跑起来
2. 记录成功的步骤为可重放的 recipe
3. 后续直接 replay，不再重新发现

### 5.3 Infrastructure Readiness Check Pattern

```
Pre-Implementation Gates:
├── Database Check
│   ├── Schema exists?
│   ├── Required tables/collections present?
│   └── Connection permissions valid?
├── Message Queue Check
│   ├── Topic/Queue exists?
│   ├── Producer/Consumer permissions?
│   └── DLQ configured?
├── Service Registry Check
│   ├── Upstream dependencies registered?
│   ├── Health check endpoints accessible?
│   └── Contract versions compatible?
└── Config Check
    ├── Required config keys present?
    ├── Env-specific values set?
    └── Secrets accessible?
```

**实现策略：**
- **Declarative Manifest**：在 spec 中声明依赖的基础设施
- **Automated Probe**：用脚本/工具验证每项
- **Gate Blocking**：未通过不允许进入实现阶段
- **Issue Reporting**：将缺失项报告为 "blockers"

---

## 6. Design Principles: What Makes Workflows Robust vs Brittle

### 6.1 Robust Patterns（推荐）

| 原则 | 说明 | 来源 |
|------|------|------|
| **Simplicity First** | "Success isn't about the most sophisticated system. It's about the right system for your needs." | Anthropic |
| **Ground Truth Feedback** | 每步从环境获取真实反馈（测试结果、命令输出），不靠模型自我评估 | Anthropic |
| **Trajectory Persistence** | 每步持久化完整状态，支持事后分析和恢复 | SWE-agent |
| **Budget-Bounded Execution** | 设置成本/时间/步数上限，超过自动优雅退出 | SWE-agent |
| **Git-as-Checkpoint** | 用 Git commit 作为原子恢复点 | Aider |
| **Isolated Exploration** | 探索性工作在隔离上下文中执行，不污染主工作流 | Claude Code |
| **Verify After Every Phase** | 不假设成功，每阶段结束都有验证 | All |
| **Graceful Degradation** | 致命错误时仍尝试提取有价值产出（如 autosubmit patch） | SWE-agent |

### 6.2 Brittle Patterns（避免）

| 反模式 | 为什么脆弱 | 替代方案 |
|--------|-----------|---------|
| **Monolithic Prompt** | 单次 prompt 承载太多指令，模型 "遗忘" 关键约束 | 拆分为阶段性 prompt chaining |
| **Implicit State** | 依赖 LLM "记住" 之前步骤的决策 | 显式状态文件/environment snapshot |
| **No Verification Gate** | 假设 LLM 输出正确，不验证 | 每步 lint/test/build 验证 |
| **Unbounded Loop** | 无停止条件的无限重试 | Max retries + cost limit + timeout |
| **Context Pollution** | 无关信息累积在上下文中降低性能 | 定期 compact + sub-agent 隔离 |
| **Coupled Phases** | 所有阶段在同一上下文中执行 | Phase separation + fresh context |
| **Silent Failure** | 错误被吞掉，后续步骤基于错误前提继续 | Fail-fast + explicit error propagation |

### 6.3 Anthropic 的五种 Workflow Building Blocks

1. **Prompt Chaining**：固定顺序步骤 + 编程化验证门
2. **Routing**：输入分类 → 专门化处理
3. **Parallelization**：独立子任务并发执行
4. **Orchestrator-Workers**：中央 LLM 动态分解 + 分派
5. **Evaluator-Optimizer**：生成 + 评估的迭代循环

**选择标准：**
- 步骤固定 → Prompt Chaining
- 输入多样 → Routing
- 子任务独立 → Parallelization
- 步骤不可预测 → Orchestrator-Workers
- 有明确评估标准 → Evaluator-Optimizer

---

## 7. Synthesis: Architecture Recommendations for Spec-Driven Coding Workflows

### 7.1 Recommended Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Orchestrator Layer                    │
│  (State Machine / Phase Controller)                  │
├─────────────────────────────────────────────────────┤
│                                                       │
│  Phase 1: SPEC VALIDATION                            │
│  ├── Fetch spec from platform                        │
│  ├── Validate completeness & consistency             │
│  ├── Infrastructure readiness check                  │
│  ├── Gate: human approval if issues found            │
│  └── Output: validated_spec + blockers               │
│                                                       │
│  Phase 2: DESIGN (Plan Mode)                         │
│  ├── Explore codebase (sub-agent, isolated)          │
│  ├── Generate implementation plan                    │
│  ├── Map spec items → code changes                   │
│  ├── Gate: human review of plan                      │
│  └── Output: implementation_plan.md                  │
│                                                       │
│  Phase 3: IMPLEMENT (Fresh Context)                  │
│  ├── For each task in plan:                          │
│  │   ├── Implement                                   │
│  │   ├── Verify (lint + test + build)               │
│  │   ├── Git checkpoint                             │
│  │   └── Record decisions/deviations                │
│  ├── Gate: all tasks pass verification              │
│  └── Output: code changes + decision_log            │
│                                                       │
│  Phase 4: REVIEW & SYNC                              │
│  ├── Adversarial review (fresh sub-agent)            │
│  ├── Diff vs spec: coverage check                   │
│  ├── Sync deviations back to platform               │
│  └── Gate: human final approval                     │
│                                                       │
└─────────────────────────────────────────────────────┘
```

### 7.2 State Persistence Strategy

```
project/
├── .claude/
│   ├── workflow-state.json      # 当前阶段 + 门禁状态
│   ├── decision-log.md          # 决策记录
│   ├── spec-divergence.md       # Spec 偏差日志
│   └── infra-readiness.json     # 基础设施检查结果
```

### 7.3 Error Recovery Strategy

| 失败场景 | 恢复策略 |
|---------|---------|
| 单步实现失败 | Git revert → retry with refined prompt |
| Context 溢出 | Compact + 重新加载关键状态文件 |
| Spec 有错误 | 记录 divergence → 继续（flagged）→ 事后回传 |
| 基础设施不就绪 | 阻塞 + 生成工单/通知 |
| 模型幻觉 | 验证门禁捕获 → rewind → 重新生成 |
| Session 中断 | 从 workflow-state.json 恢复阶段状态 |

---

## Sources

- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills)
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices)
- [Claude Code - How It Works](https://code.claude.com/docs/en/how-claude-code-works)
- [Building Effective Agents - Anthropic Engineering](https://www.anthropic.com/engineering/building-effective-agents)
- [SWE-agent Source Code](https://github.com/SWE-agent/SWE-agent) — `sweagent/agent/agents.py`, `sweagent/types.py`
- [OpenHands](https://github.com/All-Hands-AI/OpenHands) — Event-driven agent architecture
- [Aider](https://github.com/Aider-AI/aider) — Git-based checkpoint model
- [Continue.dev](https://docs.continue.dev) — Agent/Chat/Edit modal architecture
