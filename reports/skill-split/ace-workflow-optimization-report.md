# ACE 工作流执行保障优化方案

> 基于 ACE auto-goal/coding 工作流与 Superpowers 5.1.0 的深度对比分析
>
> 日期：2026-05-19

---

## 摘要

**核心问题**：ACE 的 auto-goal 工作流设计了严格的对齐门禁（规则 0-3），但在实际执行中无法 100% 确保 AI agent 按流程执行。本报告通过对比 Superpowers 的强制执行机制，识别出 5 个根因并提出 7 个优化方向。

**关键发现**：Superpowers 在执行保障上的优势并非来自更好的"规则描述"，而是来自**架构级别的强制机制**——SessionStart hook 注入、技能链式调用、子代理隔离、以及渐进式检查点。ACE 当前主要依赖"文档级纪律"，缺乏工程化的强制手段。

---

## 第一部分：问题诊断 — ACE 工作流为何不能 100% 按流程执行

### 1.1 根因分析

| # | 根因 | 表现 | 严重度 |
|---|------|------|--------|
| R1 | **Auto mode 与对齐门禁冲突** | Auto mode 的"立即执行"指令覆盖了规则 0 的 Pre-execution Checkpoint | ⚠️ Critical |
| R2 | **缺乏架构级强制** | 规则全部是"文档级纪律"，无 hook/工具链层面的硬拦截 | ⚠️ Critical |
| R3 | **技能间缺乏链式调用约束** | auto-goal → coding 的路由没有强制中间件（如 brainstorming → writing-plans → executing-plans） | ⚡ High |
| R4 | **验证闭环缺失** | 没有类似 `verification-before-completion` 的独立验证阶段 | ⚡ High |
| R5 | **对齐确认格式限制** | Step 3 的 markdown 文本确认容易被模型"自洽"跳过 | 🔶 Medium |

### 1.2 对比 Superpowers 的强制执行层

Superpowers 通过**四层防御**确保流程执行：

```
Layer 4: 文档级纪律（Red Flags 表、Rationalization Prevention）
Layer 3: 技能链强制（REQUIRED SUB-SKILL 标记、terminal state 约束）
Layer 2: 工具调用约束（checklist → TodoWrite 强制跟踪每一步）
Layer 1: 架构级注入（SessionStart hook → system prompt 注入 using-superpowers）
```

ACE 当前只有 Layer 4（文档级纪律），部分 Layer 2（TaskCreate/TaskUpdate）。

### 1.3 具体对比矩阵

| 维度 | Superpowers 做法 | ACE 当前做法 | 差距 |
|------|-----------------|-------------|------|
| **会话入口控制** | SessionStart hook 注入 using-superpowers 到 system prompt | 依赖用户手动触发 skill | 缺乏自动入口 |
| **技能发现与触发** | "1% 可能就必须调用"+ Red Flags 表拦截合理化 | skill description 触发 | 被动触发不够 |
| **流程步骤追踪** | checklist → TodoWrite 每项强制创建 todo | TaskCreate 可选使用 | 追踪松散 |
| **子技能强制调用** | `REQUIRED SUB-SKILL: Use superpowers:xxx` | 无类似标记 | 链断裂风险 |
| **验证闭环** | verification-before-completion（Iron Law） | coding skill 中有验证但非独立 | 可被跳过 |
| **反合理化** | 12 条 Red Flags + Rationalization Table + 压力测试 | 规则 0 "Pre-execution Checkpoint" | 覆盖面不足 |
| **子代理隔离** | subagent-driven-development + 双阶段 review | coding 中有 sub-agent 探索 | 缺少 review 闭环 |
| **计划-执行分离** | brainstorming → writing-plans → executing-plans（3 阶段 3 skill） | auto-goal 内嵌所有阶段 | 单一 skill 过重 |

---

## 第二部分：Superpowers 的核心设计智慧

### 2.1 "1% 规则"与心理拦截

Superpowers 的 `using-superpowers` skill 做了一个关键设计：**将合理化倾向显式列举并标记为 Red Flag**。

```markdown
| Thought | Reality |
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "The skill is overkill" | Simple things become complex. Use it. |
```

这不是"建议"，而是**心理拦截模式**——当 AI 检测到自己在产生特定思维模式时，将其识别为"正在合理化跳过流程"的信号。

**ACE 可借鉴**：auto-goal 的规则 0 有类似意图，但措辞更像"命令"而非"拦截模式"。需要将 agent 可能产生的合理化思维显式列举。

### 2.2 链式技能架构（Skill Pipeline）

Superpowers 的工作流是**技能链**，不是单一技能内的步骤：

```
brainstorming → writing-plans → subagent-driven-development → finishing-a-development-branch
     ↓                ↓                    ↓                           ↓
  设计文档          实现计划           子代理执行+review              分支完成
```

每个环节是独立 skill，有独立的 SKILL.md，通过 `REQUIRED SUB-SKILL` 标记形成强链接。

**关键优势**：
1. 每个 skill 轻量聚焦，容易遵循
2. 转换点有显式声明（"terminal state is invoking writing-plans"）
3. 任一环节可以被独立测试和优化
4. agent 不需要在一个 500+ 行 skill 中找到当前步骤

**ACE 的问题**：auto-goal 承载了对齐+规划+执行+验证+经验进化全部职责，单个 skill 过重（264 行），且没有强制的 skill 间跳转。

### 2.3 子代理双阶段 Review

Superpowers 的 `subagent-driven-development` 设计了：

```
实现 → Spec Compliance Review → Code Quality Review → 下一个任务
```

两阶段 review 不可跳过，reviewer 找到问题必须修复后重新 review。

**ACE 缺失**：coding skill 有 OODA 循环和验证，但没有独立的 review 代理确保规范合规。

### 2.4 Verification Iron Law（不可跳过的验证）

Superpowers 将验证提升为**独立技能**（verification-before-completion），核心规则：

> NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

配合 Red Flags 表（"Should work now"、"I'm confident"、"Partial check is enough"），形成了对"过早宣称完成"的系统性拦截。

---

## 第三部分：优化方案

### 方案 1：引入 SessionStart Hook 自动加载（Priority: P0）

**问题**：ACE 技能依赖手动触发，auto mode 下容易被跳过。

**方案**：参照 Superpowers 的 `hooks/hooks.json` 和 `session-start` 脚本，为 ACE 创建 SessionStart hook：

```json
// .claude-plugin/plugin.json 中添加 hooks 配置
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|clear|compact",
      "hooks": [{
        "type": "command",
        "command": "hooks/session-start",
        "async": false
      }]
    }]
  }
}
```

Hook 脚本核心逻辑：
```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# 读取核心对齐规则
alignment_rules=$(cat "${PLUGIN_ROOT}/skills/auto-goal/alignment-gate.md" 2>&1 || echo "")

# 注入到 system prompt
session_context="<ACE_ALIGNMENT_GATE>\n${alignment_rules}\n</ACE_ALIGNMENT_GATE>"

printf '{\n  "hookSpecificOutput": {\n    "hookEventName": "SessionStart",\n    "additionalContext": "%s"\n  }\n}\n' "$session_context"
```

**预期效果**：对齐门禁从"skill 内规则"升级为"system prompt 层级强制"。

---

### 方案 2：拆分 auto-goal 为技能链（Priority: P0）

**问题**：auto-goal 单一 skill 承载过多职责，执行中容易丢失步骤。

**方案**：将 auto-goal 拆分为 3-4 个链式 skill：

```
ace:align          → 对齐专用（规则 1 的 Step 1-3）
ace:plan           → 规划专用（任务分解、state.md 管理）
ace:execute        → 执行专用（并行调度、进度追踪）
ace:deliver        → 交付专用（验证、经验进化、关闭任务）
```

**链接方式**（学习 Superpowers）：

```markdown
# ace:align SKILL.md 末尾

## Terminal State
对齐确认通过后，REQUIRED SUB-SKILL: Use ace:plan
不可执行其他操作。对齐 skill 的唯一出口是 ace:plan。
```

```markdown
# ace:plan SKILL.md 末尾

## Terminal State
计划确认后，REQUIRED SUB-SKILL: Use ace:execute
```

```markdown
# ace:execute SKILL.md 末尾

## Terminal State
所有任务完成后，REQUIRED SUB-SKILL: Use ace:deliver
```

**每个 skill 控制在 100-150 行**，聚焦单一职责。

**设计约束**：
- 每个 skill 有明确的输入（前置 skill 的产出）和输出（后置 skill 的输入）
- 转换点用 `REQUIRED SUB-SKILL` 标记，不可跳过
- 轻量任务可以 ace:align 直接路由到 ace:coding（跳过 plan/execute）

---

### 方案 3：构建 Red Flags 反合理化系统（Priority: P1）

**问题**：规则 0 的 "Pre-execution Checkpoint" 是一个是非题，容易被 agent 自我回答为"是"。

**方案**：为 ace:align（或 auto-goal 如不拆分）添加显式合理化拦截表：

```markdown
## Auto Mode 合理化拦截

以下思维模式 = 正在跳过对齐，**立即停止**：

| 你的想法 | 真相 |
|---------|------|
| "这个任务很简单，不需要对齐" | 简单 = 隐含决策被忽略，恰恰最需要对齐 |
| "用户已经说清楚了" | 说清楚 ≠ 你的理解 100% 正确 |
| "auto mode 要求立即执行" | auto mode 优化执行效率，不是对齐质量 |
| "先做一点探索再对齐" | 对齐在任何操作之前，包括探索 |
| "对齐会让用户等太久" | 做错让用户等更久 |
| "上一轮已经对齐过了" | 新目标 = 新对齐，除非满足全部跳过条件 |
| "这只是延续性修复" | 延续性需要同时满足三个条件才可跳过 |
| "我理解用户要什么" | 理解 ≠ 验证。调用 AskUserQuestion 确认 |
| "读文件就知道怎么做了" | 读文件是探索，不是对齐 |
| "先出初版再迭代" | 先对齐再出初版。顺序不可逆 |

**如果你正在想上述任何一条 → 你正在合理化 → 立即回到规则 1 Step 1**
```

**配合措辞强化**（学习 Superpowers 的"Spirit vs Letter"模式）：

```markdown
**违反规则的字面意思 = 违反规则的精神。**

不存在"我遵循了精神但跳过了形式"的情况。
对齐的形式（AskUserQuestion 工具调用）就是对齐的实质。
```

---

### 方案 4：引入独立验证 Skill（Priority: P1）

**问题**：验证逻辑分散在 coding skill 的 OODA 循环中，没有独立的"完成声明前验证"门禁。

**方案**：创建 `ace:verify` skill（或整合为 ace:deliver 的一部分），核心规则：

```markdown
---
name: verify
description: |
  在声明任何工作完成之前使用。TaskUpdate completed 前、向用户报告"已完成"前、
  标记 Phase done 前必须触发。确保证据先于声明。
---

# ace:verify — 验证 Iron Law

## The Iron Law
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

如果你没有在**本次消息**中运行验证命令，你不能声称它通过了。

## Gate Function

标记任务完成前，必须：
1. **IDENTIFY** — 什么命令能证明这个声明？
2. **RUN** — 执行完整命令（fresh，不复用旧结果）
3. **READ** — 读完整输出，检查 exit code，计数失败
4. **VERIFY** — 输出是否确认声明？
   - YES → 附上证据，声明完成
   - NO → 报告实际状态，不声明完成
5. **ONLY THEN** — 调用 TaskUpdate completed

跳过任何步骤 = 虚假声明，不是验证。

## Red Flags — 正在跳过验证

| 你的想法 | 真相 |
|---------|------|
| "应该没问题了" | RUN 验证命令 |
| "我有信心" | 信心 ≠ 证据 |
| "这次可以跳过" | 没有例外 |
| "部分检查就够了" | 部分什么也证明不了 |
| "刚才改过了，肯定好了" | 改过 ≠ 验证过 |
| "测试通过了"（但没运行） | 没运行 = 没通过 |

## 适用时机
- TaskUpdate status → completed 之前
- 向用户报告"已完成"/"搞定了"之前
- 标记 Phase done 之前
- 准备进入下一个任务之前
```

---

### 方案 5：强制 Checklist → TaskCreate 绑定（Priority: P1）

**问题**：ACE 的 TaskCreate 是"按需使用"，Superpowers 的 TodoWrite 是"checklist 中每项强制创建"。

**方案**：在对齐 skill 中显式标注：

```markdown
## Checklist（MUST TaskCreate each item）

You MUST create a task for each of these items and complete them in order:

1. **苏格拉底分析** — 内部推理，形成深层理解
2. **AskUserQuestion 澄清** — 基于分析设计具体问题
3. **对齐确认展示** — markdown 呈现 + AskUserQuestion 确认
4. **创建执行计划** — TaskCreate 分解子任务
5. **逐项执行** — 每个子任务 in_progress → completed
6. **验证交付** — 运行验证命令，确认结果

**每项完成前不能进入下一项。**
**TaskCreate 调用 = 对步骤的承诺，不是可选的追踪。**
```

**关键设计**：将 TaskCreate 从"进度可视化工具"重新定义为"步骤承诺机制"。当 agent 调用 TaskCreate 时，它在 tool-use 层面对步骤做出了承诺——这比纯文本中的"必须"更有约束力。

---

### 方案 6：子代理 Review 闭环（Priority: P2）

**问题**：ACE coding skill 的执行依赖自我验证，缺乏独立 reviewer。

**方案**：为 coding 的标准/深度复杂度增加类似 Superpowers 的双阶段 review：

```
实现完成 → 规范合规 Review（Agent: spec-reviewer）
         → 代码质量 Review（Agent: quality-reviewer）
         → 两者都通过 → 标记完成
```

创建 `skills/coding/agents/spec-reviewer.md`：

```markdown
# Spec Compliance Reviewer

你是规范合规审查员。你的职责是验证实现是否完全符合用户需求规范。

## 审查清单
- 需求中的每个功能点是否都已实现？
- 是否存在超出需求的额外实现？（Over-engineering 风险）
- 命名是否与需求描述一致？
- 边界条件是否按需求处理？
- 错误处理是否符合预期行为？

## 输出格式
✅ 规范合规 — [一句话确认]

或

❌ 规范问题：
  1. **缺失**：[需求要求但未实现的功能]
  2. **多余**：[需求未要求但已实现的功能]
  3. **偏差**：[实现与需求不一致的行为]
```

创建 `skills/coding/agents/quality-reviewer.md`：

```markdown
# Code Quality Reviewer

你是代码质量审查员。你的职责是确保实现遵循 Clean Code 原则。

## 审查维度
- **命名**：是否表达意图？是否一致？
- **函数**：是否单一职责？是否过长（>20行）？
- **结构**：是否适当封装？依赖方向是否正确？
- **SOLID**：是否违反任一原则？
- **DRY**：是否存在知识重复？

## 输出格式
✅ 代码质量达标 — [简要确认]

或

⚠️ 质量问题（按重要性排序）：
  1. **[Critical/Warning/Suggestion]** — [file:line] [具体问题 + 修复建议]
```

**Coding skill 中添加 review 流程**：

```markdown
### 标准/深度复杂度的 Review 闭环

实现完成且通过自验证后，标记完成前**必须**：

1. Dispatch spec-reviewer Agent → 读 agents/spec-reviewer.md
2. spec-reviewer ✅ → Dispatch quality-reviewer Agent → 读 agents/quality-reviewer.md
3. quality-reviewer ✅ → 标记完成
4. 任一 ❌ → 修复 → 重新 dispatch 对应 reviewer

**不可跳过 review 直接标记完成。**
**spec review 必须在 quality review 之前。**
```

---

### 方案 7：CSO 优化 — 触发准确率提升（Priority: P2）

**问题**：ACE skill 的 description 中包含了流程摘要（如 coding skill description 列出了三种意图和触发信号），可能导致 AI 按 description 走捷径而非读完整 skill。

**方案**：应用 Superpowers 的 CSO（Claude Search Optimization）发现：

> 当 description 摘要了 workflow，Claude 可能跟着 description 走而非读 skill body。

**优化原则**：Description = 何时触发，不描述如何执行。

**coding skill — 优化前**：
```yaml
description: |
  编写、修改、测试和审查项目代码。用户需要产出代码变更或评估代码质量时触发。
  三种意图及触发信号：
  **实现** — 修 bug、加功能、重构、处理报错或编译/测试失败。
  **测试** — 生成、修复或补充单元测试，提升覆盖率。
  **审查** — Code review，检查质量，发现潜在问题。
  DO NOT TRIGGER: ...
```

**coding skill — 优化后**：
```yaml
description: |
  编写、修改、测试和审查项目代码。用户需要产出代码变更或评估代码质量时触发。
  触发：修 bug、加功能、重构、处理报错/编译失败、生成/修复单元测试、Code review。
  DO NOT TRIGGER: 学习概念/调研方案/制定计划（→ auto-goal）；优化 skill（→ skill-optimize / skill-creator）；极简改动且位置明确（→ 直接 Edit）。
```

**变更**：去掉"三种意图"的详细流程描述，只保留触发关键词和排除条件。意图路由的详细逻辑留在 skill body 中。

**auto-goal skill — 同理优化**：description 不应描述"苏格拉底分析 → 澄清 → 对齐确认"的流程，只描述触发条件。

---

## 第四部分：实施优先级与路线图

### Phase 1：基础设施（1-2 天）

| 任务 | 方案 | 预期效果 | 工作量 |
|------|------|---------|--------|
| 创建 SessionStart hook | 方案 1 | 对齐门禁升级为 system prompt 层级 | 2h |
| 添加 Red Flags 合理化拦截表 | 方案 3 | 覆盖 auto mode 下 10 种跳过模式 | 30min |
| 强制 checklist → TaskCreate 绑定 | 方案 5 | 步骤执行从可选变为承诺 | 30min |

### Phase 2：架构优化（3-5 天）

| 任务 | 方案 | 预期效果 | 工作量 |
|------|------|---------|--------|
| 拆分 auto-goal 为技能链 | 方案 2 | 单一职责、可独立测试、链式强制 | 1d |
| 创建 ace:verify skill | 方案 4 | 完成声明前独立验证门禁 | 2h |
| CSO 优化所有 skill description | 方案 7 | 触发准确率提升，避免走捷径 | 1h |

### Phase 3：质量闭环（5-7 天）

| 任务 | 方案 | 预期效果 | 工作量 |
|------|------|---------|--------|
| 实现子代理 review 闭环 | 方案 6 | 规范合规 + 代码质量双重保障 | 1d |
| 编写压力测试场景 | 借鉴 writing-skills | 验证优化后 skill 在压力下仍遵循流程 | 2d |
| 经验闭环整合 | — | 将优化效果反馈到 experience.md | 2h |

---

## 第五部分：设计原则总结

从 Superpowers 提炼的 5 条可迁移设计原则：

### 原则 1：强制优于建议

> 能用工具调用强制的，不用文字建议。

- TaskCreate 强制创建 → 步骤可观测且构成承诺
- Hook 注入 system prompt → 规则不可跳过
- `REQUIRED SUB-SKILL` 标记 → 技能链不可断

**应用**：将"必须 TaskCreate"从 ACE 的隐式期望变为显式强制（方案 5）。

### 原则 2：拦截优于命令

> 列举"你正在合理化"的思维模式，比"你必须做 X"更有效。

AI 在遵循命令时会自我合理化跳过。但如果看到一张表说"如果你正在想 Y，说明你在合理化"，它会被 catch 在想法产生的瞬间。

**应用**：为每个门禁步骤配备 Red Flags 表（方案 3）。

### 原则 3：单一职责 Skill

> 一个 skill 只做一件事，通过链式调用组合。

轻量 skill（100-150 行）比重量 skill（300+ 行）执行率高得多。agent 在 300 行指令中容易"丢失"当前步骤。

**应用**：拆分 auto-goal 为 align → plan → execute → deliver 链（方案 2）。

### 原则 4：独立验证

> 验证必须是独立步骤/skill，不是"执行完顺便验证"。

当验证嵌入执行流程时，它容易被"我已经在执行中验证了"合理化跳过。独立出来就成了不可跳过的门禁。

**应用**：创建 ace:verify 独立 skill（方案 4）。

### 原则 5：Description 不描述流程

> Skill description 只说"何时触发"，不说"如何执行"。

CSO 研究表明，描述了 workflow 的 description 会被 AI 当作快捷路径执行，跳过 skill body 中的完整流程。

**应用**：精简所有 skill description（方案 7）。

---

## 附录 A：Superpowers 架构全景

```
SessionStart Hook
    ↓ 注入 using-superpowers 到 system prompt（Layer 1）
    ↓
using-superpowers（1% 规则 + Red Flags 表 + skill 优先级）
    ↓ 触发对应 skill（Layer 2-3）
    ↓
brainstorming（HARD-GATE: 设计前不写代码）
    ↓ terminal state → writing-plans
    ↓
writing-plans（bite-sized tasks + No Placeholders + 自检）
    ↓ execution handoff → 用户选择模式
    ↓
subagent-driven-development（实现 + 双阶段 review）
    ├─ implementer-prompt.md（实现代理）
    ├─ spec-reviewer-prompt.md（规范审查代理）
    └─ code-quality-reviewer-prompt.md（质量审查代理）
    ↓ all tasks done
    ↓
finishing-a-development-branch（验证 → 检测环境 → 选项 → 执行 → 清理）
```

每个箭头 = `REQUIRED SUB-SKILL`，不可跳过。

## 附录 B：建议的 ACE 目标架构

```
SessionStart Hook（新增）
    ↓ 注入 ace 核心对齐规则 + Red Flags 表
    ↓
ace:align（新 — 对齐专用）
    ├─ 苏格拉底分析（内部推理）
    ├─ AskUserQuestion 澄清
    └─ 对齐确认 + 用户确认
    ↓ REQUIRED: ace:plan（标准/深度）或 ace:coding（轻量）
    ↓
ace:plan（新 — 规划专用）
    ├─ 任务分解 + 复杂度评估
    ├─ state.md 创建（按规模触发）
    └─ 并行标注（⟂ / depends）
    ↓ REQUIRED: ace:execute
    ↓
ace:execute（新 — 执行专用）
    ├─ 并行调度（≤8 agents）
    ├─ 进度追踪（TaskCreate/Update + state.md 同步）
    └─ ace:coding（各子任务调用）
         ├─ OODA 循环执行
         ├─ spec-reviewer（规范审查）
         └─ quality-reviewer（质量审查）
    ↓ REQUIRED: ace:deliver
    ↓
ace:deliver（新 — 交付专用）
    ├─ ace:verify（Iron Law 验证）
    ├─ 经验进化（条件触发）
    └─ 进度心跳 + 最终摘要
```

## 附录 C：快速实施 — 最小改动方案

如果不希望做大规模重构（方案 2 的技能链拆分），可以通过以下**最小改动**获得显著改善：

| # | 改动 | 方案 | 时间 | 预期提升 |
|---|------|------|------|---------|
| 1 | auto-goal SKILL.md 中添加 Red Flags 合理化拦截表 | 3 | 10min | +15% |
| 2 | 将 "规则 3" 改为 "MUST TaskCreate each checklist item" | 5 | 5min | +10% |
| 3 | 创建 `hooks/` 目录 + SessionStart hook 注入对齐规则 | 1 | 30min | +15% |
| 4 | 优化 coding skill description 去掉流程摘要 | 7 | 5min | +5% |
| 5 | 添加 "Spirit vs Letter" 声明 | 3 | 2min | +5% |

**合计预期**：从当前水平提升约 40-50% 的流程执行率。

---

## 附录 D：关键机制对比速查表

| 机制 | Superpowers 实现 | ACE 现状 | 建议行动 |
|------|-----------------|---------|---------|
| System prompt 注入 | `hooks/session-start` → `additionalContext` | 无 | 创建 hook |
| 强制触发 | "1% 就 invoke" + EXTREMELY-IMPORTANT 标签 | description 触发 | 添加强制语义 |
| 步骤追踪 | "MUST create TodoWrite per item" | TaskCreate 可选 | 改为 MUST |
| 链式调用 | REQUIRED SUB-SKILL + terminal state | 单一 skill 内嵌 | 拆分为链 |
| 反合理化 | Red Flags 表（12 条）+ Rationalization Table | Pre-execution Checkpoint（1 条） | 扩展为表 |
| 验证门禁 | verification-before-completion（独立 skill） | coding OODA 中的 Observe | 独立 skill |
| 双阶段 review | spec-reviewer + quality-reviewer | 无 | 创建 agent prompts |
| HARD-GATE | `<HARD-GATE>` XML 标签 + 明确禁止 | "不可跳过" 文字 | 使用 XML 标签 |
| Spirit vs Letter | "违反字面 = 违反精神" | 无 | 添加声明 |
| Subagent 隔离 | 独立 skill + prompt 模板 | coding 中使用 Agent | 规范化 |

---

*报告完成。*

*作者：Claude AI Analysis*
*数据来源：ACE 0.1.9-SNAPSHOT.1 + Superpowers 5.1.0*
