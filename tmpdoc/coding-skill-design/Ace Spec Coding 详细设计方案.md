# Ace Spec Coding 详细设计方案

> 版本：1.0 | 日期：2026/06/10
> 目标：让 AI 基于规格说明高质量交付代码的完整编排系统设计

---

## 1. 系统定位与设计哲学

### 1.1 定位

Ace Spec Coding 是一个**规格驱动的 AI 编码编排系统**，不是代码生成器，而是一套确保 AI 编码质量的"行为操作系统"。

```
传统 AI 编码：需求 → 直接写代码 → 祈祷质量过关
Spec Coding：需求 → 对齐 → 规格 → 设计 → 计划 → TDD 实现 → 多维审查 → 验证交付
```

### 1.2 设计哲学

| 原则 | 含义 | 来源 |
|------|------|------|
| **Evidence over Claims** | 用实际输出证明完成，而非声称完成 | Superpowers |
| **Fluid not Rigid** | 允许随时回去改任何制品，无阶段锁 | OpenSpec |
| **Facts before Edits** | 写代码前强制调查事实，改变认知状态 | ECC GateGuard |
| **Progressive Rigor** | 根据复杂度自动调节流程深度 | ECC Size Classifier |
| **Controller ≠ Worker** | 编排者不执行实现，执行者获得新鲜上下文 | Superpowers |

### 1.3 核心不变量（Iron Laws）

1. **未对齐不实现** — HARD-GATE 通过前，禁止一切修改性操作
2. **无测试不编码** — TDD RED→GREEN→REFACTOR 铁律
3. **无证据不完成** — Verification Gate 必须有实际命令输出
4. **Spec 是行为契约** — 只描述 observable behavior，不描述实现细节
5. **禁止发明模式** — Pattern Grounding 先搜索约定，无约定明确声明

---

## 2. 整体架构

### 2.1 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    用户交互层                                      │
│  需求输入（对话/平台产物/Spec文档） │ 进度反馈 │ 审批门控            │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    编排引擎层 (Orchestrator)                       │
│  状态机 │ 门控决策 │ 复杂度分级 │ SubAgent 调度 │ 中断恢复          │
└─────┬───────────┬──────────────────┬───────────────┬────────────┘
      │           │                  │               │
┌─────▼─────┐ ┌──▼───────────┐ ┌────▼────────┐ ┌───▼──────────┐
│ Spec 引擎 │ │ 设计 & 计划  │ │ 执行引擎    │ │ 质量门控引擎  │
│ DAG管理   │ │ Pattern锚定  │ │ TDD循环     │ │ 两阶段审查   │
│ Delta合并 │ │ 模板约束     │ │ GateGuard   │ │ 6级验证      │
│ 归档      │ │ 粒度控制     │ │ Worktree    │ │ 根因调试     │
└───────────┘ └──────────────┘ └─────────────┘ └──────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                    基础设施层                                      │
│  上下文管理 │ 经验进化 │ 防合理化系统 │ 规则注入 │ 并行调度          │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件职责

| 组件 | 职责 | 关键接口 |
|------|------|---------|
| Orchestrator | 流程编排、状态转换、门控决策 | `transition(event)` `getState()` `recover()` |
| SpecEngine | Spec 生命周期管理（创建/验证/合并/归档） | `create()` `validate()` `merge()` `archive()` |
| DesignEngine | 设计文档生成、Pattern 搜索、任务分解 | `ground()` `design()` `planTasks()` |
| ExecutionEngine | TDD 执行、SubAgent 调度 | `executeTask()` `dispatch()` `collectResult()` |
| QualityEngine | 审查、验证、调试 | `reviewSpec()` `reviewCode()` `verify()` |
| InfraLayer | 上下文/经验/规则/并行 | `compact()` `learn()` `inject()` |

---

## 3. 编排引擎设计

### 3.1 状态机定义

```
         ┌──────────────────────────────────────────────────────┐
         │                                                      │
         ▼                                                      │
      [IDLE] ─── 需求输入 ──→ [SIZING] ─── 分级完成 ──→ [CLARIFYING]
                                                          │
                              ┌── trivial ──→ [IMPLEMENTING]    │
                              │                             │   │
      [PLANNING] ←── 对齐通过 ┤── small ────→ [DESIGNING] │   │
         │                    │                    │        │   │
         │                    └── standard/large ──┘        │   │
         │                                                  │   │
         ├── GATE: Plan 审批 ──→ [IMPLEMENTING] ←───────────┘   │
         │                           │                          │
         │                    ┌── 全部完成                       │
         │                    ▼                                 │
         │              [REVIEWING]                             │
         │                    │                                 │
         │              ┌── 通过                                │
         │              ▼                                       │
         │         [VERIFYING]                                  │
         │              │                                       │
         │         ┌── 通过                                     │
         │         ▼                                            │
         │    [ARCHIVING] ──→ [DONE]                            │
         │                                                      │
         └──── 发现问题需修正 spec ──────────────────────────────┘
```

### 3.2 复杂度分级器（Size Classifier）

```python
# 伪代码：分级决策逻辑
def classify(requirement):
    signals = {
        'file_count': estimate_affected_files(requirement),
        'new_dependency': has_new_external_dependency(requirement),
        'design_ambiguity': is_design_unclear(requirement),
        'cross_module': crosses_module_boundary(requirement),
    }
    
    if signals['file_count'] <= 1 and not signals['design_ambiguity']:
        return 'trivial'   # 直接 TDD，跳过 Spec 和 Design
    elif signals['file_count'] <= 3 and not signals['new_dependency']:
        return 'small'     # 简化 Spec（只写 tasks），跳过完整 Design
    elif signals['file_count'] <= 10:
        return 'standard'  # 完整流程
    else:
        return 'large'     # 完整流程 + 子项目分解
```

**分级与流程映射：**

| 分级 | Clarify | Spec | Design | Plan | TDD | Review | Verify |
|------|---------|------|--------|------|-----|--------|--------|
| trivial | 简化 | 跳过 | 跳过 | 跳过 | ✅ | 简化 | ✅ |
| small | ✅ | tasks only | 跳过 | ✅ | ✅ | ✅ | ✅ |
| standard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| large | ✅ + 分解 | ✅ | ✅ | ✅ | ✅ | ✅ + 对抗 | ✅ |

### 3.3 门控定义（Gate Functions）

```typescript
interface Gate {
  id: string;
  condition: () => boolean;       // 是否满足通过条件
  requiresHumanApproval: boolean; // 是否需要人工确认
  evidence: () => Evidence[];     // 需要什么证据
}

const GATES = {
  ALIGNMENT: {
    id: 'alignment',
    condition: () => clarificationComplete && userApproved,
    requiresHumanApproval: true,  // 不可跳过
    evidence: () => [{ type: 'user_confirmation', ref: askUserQuestionId }]
  },
  PLAN_APPROVAL: {
    id: 'plan_approval', 
    condition: () => planDocument.exists() && allTemplateFieldsFilled(),
    requiresHumanApproval: true,  // standard/large 需要，trivial/small 可跳过
    evidence: () => [{ type: 'plan_document', ref: planPath }]
  },
  IMPLEMENTATION_COMPLETE: {
    id: 'impl_complete',
    condition: () => allTasksDone() && noBlockedTasks(),
    requiresHumanApproval: false,
    evidence: () => tasks.map(t => ({ type: 'task_status', ref: t.id, status: t.status }))
  },
  REVIEW_PASSED: {
    id: 'review_passed',
    condition: () => specReview.passed && qualityReview.passed,
    requiresHumanApproval: false,
    evidence: () => [specReview.report, qualityReview.report]
  },
  VERIFICATION_PASSED: {
    id: 'verification',
    condition: () => allVerificationSteps.every(s => s.passed),
    requiresHumanApproval: false,
    evidence: () => verificationSteps.map(s => ({ type: 'command_output', ref: s.output }))
  },
  COMMIT_APPROVAL: {
    id: 'commit_approval',
    condition: () => reviewPassed && verificationPassed,
    requiresHumanApproval: true,  // 最终确认
    evidence: () => [diffSummary, testReport, reviewReport]
  }
};
```

### 3.4 中断恢复协议

```markdown
## state.md 结构
- current_state: IMPLEMENTING
- current_gate: PLAN_APPROVAL (已通过)
- next_gate: IMPLEMENTATION_COMPLETE
- tasks: [{id, status, output_path}]
- artifacts: [{id, path, exists}]
- last_checkpoint: "T3 完成，T4 进行中"

## 恢复步骤
1. Read state.md → 获取当前状态
2. 验证文件系统（artifacts 文件是否存在）
3. 验证 tasks 状态（命令验证产出是否真实存在）
4. 重建 TaskList → 继续从中断点
```

---

## 4. Spec 引擎设计

### 4.1 Artifact DAG

采用 OpenSpec 的文件系统状态检测模式：

```
产物文件存在 = DONE
产物文件不存在 + 依赖全满足 = READY
产物文件不存在 + 依赖未满足 = BLOCKED
```

**默认 DAG（standard 流程）：**

```
proposal (无依赖)
    ↓
specs (依赖: proposal)
    ↓
design (依赖: specs)
    ↓
tasks (依赖: design)
```

**轻量 DAG（small 流程）：**

```
tasks (无依赖，直接从需求生成)
```

### 4.2 制品模板系统

每个制品由 Schema 定义其结构：

```yaml
# schema: spec-driven (标准流程)
artifacts:
  - id: proposal
    generates: proposal.md
    template: |
      # Proposal: {title}
      ## Problem Statement
      ## Scope (In / Out)
      ## Proposed Approach (2-3 options with tradeoffs)
      ## Acceptance Criteria
      ## Open Questions
    instruction: |
      基于用户需求对话，生成 proposal。
      必须包含至少 2 个方案对比。
      Scope 必须明确列出 Out-of-Scope 项。
    requires: []
    
  - id: specs
    generates: specs/
    template: |
      # {Domain} Specification
      ## Purpose
      ## Requirements
      ### Requirement: {name}
      {description with SHALL/MUST keywords}
      #### Scenario: {scenario_name}
      - GIVEN {precondition}
      - WHEN {trigger}
      - THEN {expected}
    instruction: |
      基于 proposal，编写行为规格。
      每个 Requirement 至少一个 Scenario。
      只描述 observable behavior，不描述实现。
      使用 RFC 2119 关键词。
    requires: [proposal]
    
  - id: design
    generates: design.md
    template: |
      # Technical Design
      ## Overview (1-3 sentences)
      ## Architecture Decision
      ### Option A: {name}
      - Pros / Cons / Risk
      ### Option B: {name}
      - Pros / Cons / Risk
      ### Decision: {chosen} — Rationale: {why}
      ## API Contract
      ## Data Structure Changes
      ## Test Strategy
      ## Implementation Order (task dependency graph)
    instruction: |
      基于 specs，设计技术方案。
      必须先执行 Pattern Grounding（搜索代码库约定）。
      必须包含至少 2 个方案对比。
      API 必须有完整签名。
    requires: [specs]
    
  - id: tasks
    generates: tasks.md
    template: |
      # Implementation Tasks
      ## Task {N}: {title}
      **Files:** Create: / Modify: / Test:
      **Dependencies:** ⟂ or depends: {task_ids}
      ### Steps:
      - [ ] Write failing test [complete code]
      - [ ] Run test → verify FAIL [exact command + expected output]
      - [ ] Implement [complete code]
      - [ ] Run test → verify PASS [exact command]
      - [ ] Self-review checklist
    instruction: |
      基于 design，分解为实现任务。
      每任务 2-5 分钟。
      禁止 TBD/placeholder/similar to Task N。
      每步必须有完整可执行代码和验证命令。
      强制 TDD 格式：先测试后实现。
    requires: [design]
```

### 4.3 Delta Spec 机制

```markdown
## ADDED Requirements
### Requirement: UserLogout
Users SHALL be able to log out from any page.
#### Scenario: Logout from dashboard
- GIVEN user is on dashboard
- WHEN user clicks logout button
- THEN session is invalidated AND user is redirected to login

## MODIFIED Requirements
### Requirement: UserLogin
(完整更新后的内容，非 diff 格式)

## REMOVED Requirements
### Requirement: LegacyAuth
Reason: Migrated to OAuth2
Migration: Users will be auto-migrated on next login
```

**合并算法顺序：** RENAMED → REMOVED → MODIFIED → ADDED

### 4.4 Instruction Generation（四层分离）

生成给 SubAgent 的编码指令时，四层信息分离：

```xml
<task id="specs" change="add-auth">
  <!-- Layer 1: 结构模板（AI 要产出的文件结构） -->
  <template>
    # Authentication Specification
    ## Requirements
    ### Requirement: {name}
    ...
  </template>
  
  <!-- Layer 2: 指导（如何写，不出现在输出中） -->
  <instruction>
    使用 RFC 2119 关键词...
    每个 Requirement 至少一个 Scenario...
  </instruction>
  
  <!-- Layer 3: 项目上下文（背景，不出现在输出中） -->
  <context>
    Tech stack: Spring Boot 3 + MyBatis-Plus
    现有认证：Session-based, 见 AuthFilter.java
  </context>
  
  <!-- Layer 4: 规则约束（不出现在输出中） -->
  <rules>
    - 遵循项目 API 命名规范: /api/v1/{resource}
    - 数据库字段命名: snake_case
  </rules>
  
  <!-- 依赖产物（已完成的前置产物内容） -->
  <dependencies>
    <dependency id="proposal" status="done">
      <content>...</content>
    </dependency>
  </dependencies>
</task>
```

---

## 5. 设计引擎

### 5.1 Pattern Grounding（模式锚定）

**设计前必须执行的搜索协议：**

| 搜索维度 | 搜索目标 | 方法 |
|----------|---------|------|
| Naming | 文件/函数/类/变量命名约定 | Glob + Grep 现有代码 |
| Error Handling | 异常抛出/返回/日志模式 | Grep 关键词(throw/catch/Result) |
| Logging | 级别/格式/记录内容 | Grep log 调用 |
| Data Access | Repository/Service/Query 模式 | 搜索 DAO/Repository 层 |
| Test | 测试框架/fixture/断言风格/文件位置 | Glob test 文件 |
| API | 路由/参数验证/响应格式 | 搜索 Controller 层 |

**输出格式：**

```markdown
## Pattern Grounding Report
### Naming Conventions
- Service 类: {Domain}Service (e.g., UserService, OrderService)
- Controller: {Domain}Controller
- DAO: {Domain}Dao + {Domain}DaoImpl
...

### 无法确定的约定
- 缓存使用模式：代码库中未见统一模式，需要新建约定
```

**关键规则：** 如果代码库中没有类似代码，**明确声明"无现有约定"**，不发明模式。

### 5.2 No Placeholder 原则

**检测规则（编写 tasks.md 时的验证）：**

| 违规模式 | 示例 | 替代要求 |
|----------|------|---------|
| TBD/TODO | "Add error handling TBD" | 写出完整的 try-catch 代码 |
| "similar to" | "Similar to Task 2" | 写出完整代码，即使重复 |
| "appropriate" | "Add appropriate validation" | 写出具体的验证逻辑 |
| "etc." | "Handle edge cases etc." | 列出每个 edge case |
| 省略号 | "// ... rest of implementation" | 写出完整实现 |

---

## 6. 执行引擎设计

### 6.1 Controller-Worker 模式

```
┌─────────────────────────────────────────────┐
│  Controller (主代理)                          │
│                                             │
│  持有：全局计划 + 状态机 + 制品依赖图          │
│  职责：                                      │
│    1. 从 tasks.md 提取当前任务               │
│    2. 构造完整上下文 (instruction + context)  │
│    3. 选择模型等级 (based on complexity)      │
│    4. Dispatch SubAgent                     │
│    5. 收集结果 + 更新状态                     │
│    6. 触发审查                               │
│                                             │
│  不做：代码实现、文件编辑                      │
└────────────────────┬────────────────────────┘
                     │ dispatch
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
┌────────┐     ┌────────┐     ┌────────┐
│Worker 1│     │Worker 2│     │Worker 3│
│(新上下文)│     │(新上下文)│     │(新上下文)│
│        │     │        │     │        │
│收到：   │     │收到：   │     │收到：   │
│- task  │     │- task  │     │- task  │
│- context│    │- context│    │- context│
│- rules │     │- rules │     │- rules │
│        │     │        │     │        │
│返回：   │     │返回：   │     │返回：   │
│- status│     │- status│     │- status│
│- output│     │- output│     │- output│
└────────┘     └────────┘     └────────┘
```

### 6.2 Worker Prompt 模板

```markdown
# Task: {title}

## What to do
{task description with complete code}

## Context
{files to read, dependencies, architecture notes}

## Patterns to Follow
{Pattern Grounding 搜索结果}

## Rules
{项目规则 + 语言规则}

## Before You Begin
如果任何信息不足以开始，报告 NEEDS_CONTEXT 并说明需要什么。

## TDD Protocol
1. 先写失败测试
2. 运行测试确认 FAIL
3. 写最小实现
4. 运行测试确认 PASS
5. Self-review

## Self-Review Checklist
- [ ] 测试覆盖了 spec 中的每个 scenario？
- [ ] 遵循了 Pattern Grounding 中的命名约定？
- [ ] 没有引入新依赖（除非 task 明确要求）？
- [ ] 错误处理遵循项目约定？
- [ ] 没有 TODO/FIXME/placeholder？

## Report Format
报告 DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED
附上验证命令的实际输出。
```

### 6.3 GateGuard 事实强制

**触发时机：** Worker 编辑文件之前

**强制调查清单：**

```
1. 目标文件的所有 importers（谁引用了这个文件？）
2. 相关的接口/类型定义（修改的接口签名是什么？）
3. 对应的 spec scenario（这次修改对应哪个行为规格？）
4. 项目约定（Pattern Grounding 中该领域的约定是什么？）
```

**设计原理：** 传统 self-evaluation（"你确定吗？"）永远回答"yes"。GateGuard 通过**强制执行搜索命令**，产生新的事实上下文，从而改变 Agent 的认知状态。

### 6.4 并行调度策略

```
任务依赖分析：
  T1 ⟂ T2 ⟂ T3     → 并行 dispatch
  T4 depends: T1,T2  → 等待 T1,T2 完成
  T5 depends: T4     → 串行

并行上限：min(独立任务数, CPU cores - 2, 16)
隔离策略：
  - 修改不同文件 → 同 worktree 并行（无冲突）
  - 修改同文件 → 串行（或 Git Worktree 隔离后合并）
```

---

## 7. 质量门控引擎设计

### 7.1 两阶段审查

#### Phase 1: Spec Compliance Review

```markdown
## Reviewer 指令
你是 Spec Compliance Reviewer。

任务：验证实现是否忠实于 spec。

输入：
- specs/ 文件（行为规格）
- 实现代码（Worker 的输出）

检查清单：
1. 每个 spec requirement 是否都有对应实现？
2. 每个 scenario 的 GIVEN-WHEN-THEN 是否被测试覆盖？
3. 是否有超出 spec 范围的实现？（scope creep）
4. 是否有 spec 中 MUST 的要求被跳过？

不信任原则：
"The implementer may have cut corners. Verify independently by reading the actual code."
不要信任 implementer 的自我报告。

输出格式：
- PASS / FAIL
- Findings: [{severity, location, spec_reference, description}]
```

#### Phase 2: Code Quality Review

```markdown
## Reviewer 指令
你是 Code Quality Reviewer。

Pre-Report Gate（报告 finding 前必须回答）：
1. 能指出确切行号吗？模糊 finding 直接丢弃
2. 能描述具体失败模式吗？无法命名触发条件 = pattern-matching 非 reviewing
3. 看过周围上下文吗？很多问题已被上层处理
4. 严重度可辩护吗？缺少注释永远不是 HIGH

置信度规则：<80% 不报告。零 finding 是合法结果。

检查维度：
- 正确性：逻辑错误、边界条件、并发安全
- 可维护性：命名、函数长度、单一职责
- 性能：N+1 查询、不必要循环、内存泄漏
- 安全：注入、权限、敏感信息
```

### 7.2 六级验证循环

```
Level 1: Build      → 编译通过
Level 2: Type       → 类型检查通过
Level 3: Lint       → 代码风格通过
Level 4: Test       → 单元测试通过 + 覆盖率 ≥ 80%
Level 5: Security   → 无高危漏洞
Level 6: Diff       → 变更范围与 spec 一致（无意外修改）
```

**每级必须通过才进入下一级。** 失败时：修复 → 从 Level 1 重新验证。

### 7.3 根因调试协议

当验证失败时启动：

```
Stage 1: READ — 完整读取错误信息 + 堆栈
Stage 2: CATEGORIZE — 这是什么类型的错误？在哪一层？
Stage 3: SINGLE HYPOTHESIS — 一次只验证一个假设
  → 验证方法：添加日志/断点/最小复现
  → 禁止：同时尝试多个修复
Stage 4: ROOT CAUSE FIX — 确认根因后才修复
  → 3 次 fix 失败 → 质疑前提/架构，升级为 BLOCKED
```

---

## 8. 基础设施层设计

### 8.1 防合理化系统

每个 Iron Law 配套：

```markdown
## Iron Law: 无测试不编码

### Red Flags Table（AI 产生这些念头 = 即将违规）
| 念头 | 现实 |
|------|------|
| "这个太简单不需要测试" | 简单的东西写测试也快，没有借口 |
| "测试框架还没配好" | 先配好框架再写代码 |
| "先写代码后补测试" | 后补的测试只验证代码做了什么，不验证应该做什么 |
| "时间紧" | 没有测试的代码不算完成，不存在"节省时间" |

### Rationalization Table
| 借口 | 为什么不成立 |
|------|------------|
| "改了一行配置" | 配置错误是最常见的生产事故 |
| "只是重命名" | 重命名可能破坏反射/序列化 |
| "测试会在后面的任务中写" | 违反 TDD 的定义 |
```

### 8.2 上下文管理

```
三层策略：

1. Context Budget 监控
   - 估算当前 token 消耗（words × 1.3）
   - 超过 60% 容量时发出警告
   - 标识可压缩的区域

2. Strategic Compact
   - 仅在逻辑断点压缩（任务边界、审查完成后）
   - 压缩前保存关键状态到 state.md
   - 压缩后验证状态可恢复

3. PreCompact 保护
   - 压缩前自动保存：当前任务进度、未完成事项、关键发现
   - 确保压缩后不丢失关键上下文
```

### 8.3 经验进化（Instinct 模型）

```
触发条件：
- 意外发现（预期 A 实际 B）
- 踩坑（失败后找到原因）
- 反直觉（需要违反"显而易见"的做法）
- 可复用模式（连续 2+ 次用到同样的方法）

提取格式：
{
  "pattern": "简要描述",
  "context": "在什么场景下",
  "action": "应该怎么做",
  "confidence": 0.6,  // 首次出现
  "source": "session-id"
}

演化规则：
- 2+ 项目出现 → confidence += 0.2
- 用户正反馈 → confidence += 0.1  
- confidence ≥ 0.8 → 自动生成 Rule 文件
- confidence ≥ 0.9 → 纳入默认注入
```

### 8.4 规则注入层

```
优先级（高覆盖低）：
  1. 项目本地规则 (.claude/rules/ or project-profile.md)
  2. 用户全局规则 (~/.claude/ace/rules/)
  3. 语言默认规则 (ace/rules/{language}.md)
  4. 通用规则 (ace/rules/code-quality.md)

注入时机：
  - Session Start → 通用规则 + 语言规则
  - Task Dispatch → 项目规则 + Pattern Grounding 结果
  - Review → 所有层规则（最严格）
```

---

## 9. 完整流程示例（Standard 级别）

```
用户：「给订单服务加一个退款功能」

=== Phase: SIZING ===
→ 分析：修改 3-5 文件，需要新 API，有数据结构变更
→ 分级：standard

=== Phase: CLARIFYING (HARD-GATE) ===
→ 问：退款触发条件？全额/部分？退款到哪里？
→ 用户回答
→ 问：退款状态流转？是否需要审批？
→ 用户回答
→ 确认理解 → 用户审批 ✅

=== Phase: PLANNING ===
→ 生成 proposal.md (问题定义 + 边界 + 2 方案对比)
→ 生成 specs/ (退款行为规格，含 scenarios)
→ Pattern Grounding (搜索 OrderService 约定)
→ 生成 design.md (API + 数据结构 + 测试策略)
→ 生成 tasks.md (5 个任务，TDD 格式)
→ GATE: 展示给用户审批 ✅

=== Phase: IMPLEMENTING ===
→ 任务依赖分析：T1⟂T2, T3 depends T1, T4 depends T2, T5 depends T3,T4
→ 并行 dispatch T1 + T2 (各自独立 SubAgent)
→ T1 完成 (DONE) → dispatch T3
→ T2 完成 (DONE_WITH_CONCERNS) → Controller 评估 concerns → dispatch T4
→ T3,T4 完成 → dispatch T5
→ 所有 DONE

=== Phase: REVIEWING ===
→ Spec Compliance Review → 发现 T3 遗漏一个 scenario
→ 循环修复 → 重新验证 → PASS
→ Code Quality Review → 2 findings (medium) → 修复 → PASS

=== Phase: VERIFYING ===
→ Build ✅ → Type ✅ → Lint ✅ → Test (92% coverage) ✅ → Security ✅ → Diff ✅

=== Phase: ARCHIVING ===
→ Delta spec 合并到主 specs
→ GATE: 最终确认 → 用户审批 ✅
→ Commit / PR
→ DONE
```

---

## 10. 实现路径

### Phase 1 — 最小可交付核心（MVP）

| 周 | 交付 | 核心能力 |
|----|------|---------|
| W1 | Orchestrator 骨架 | 状态机 + Size Classifier + HARD-GATE |
| W2 | Spec 引擎 | Artifact DAG + 制品模板 + 验证器 |
| W3 | 执行引擎 | Controller-Worker + TDD 协议 |
| W4 | 质量门控 | 两阶段审查 + Verification Gate |

**MVP 完成标准：** 能完成一个 standard 级别需求的完整流程。

### Phase 2 — 质量放大器

| 周 | 交付 | 核心能力 |
|----|------|---------|
| W5 | GateGuard | 事实强制 + PreToolUse 检查 |
| W6 | Pattern Grounding | 代码库约定搜索 + 注入 |
| W7 | 防合理化系统 | Red Flags Table + Iron Laws |
| W8 | 并行调度 | Worktree 隔离 + 并发执行 |

### Phase 3 — 自适应进化

| 周 | 交付 | 核心能力 |
|----|------|---------|
| W9 | Instinct 学习 | 模式提取 + 置信度管理 |
| W10 | 上下文管理 | Budget + Compact + PreCompact |
| W11 | Delta Spec 完整 | 合并算法 + 归档 + 冲突检测 |
| W12 | 复杂度自适应 | 分级器调优 + 流程弹性 |

---

## 11. 与现有 ACE 体系的集成点

| ACE 组件 | 集成方式 |
|----------|---------|
| auto-goal | Spec Coding 是 auto-goal 的高级模式（有 spec 文件时自动激活） |
| alignment-protocol | 复用现有对齐协议，Spec Coding 的 HARD-GATE 即 alignment-protocol |
| verification-protocol | 扩展为 6 级验证循环 |
| experience-protocol | 扩展为 Instinct 模型 |
| parallel-protocol | 复用现有并行调度，增加 Worktree 隔离 |
| project-profile | 作为 Pattern Grounding 的输入源之一 |
| code-review skill | 作为 Code Quality Review 的执行器 |
| ut skill | 作为 TDD 执行器 |

---

## 12. 风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| 流程过重导致简单任务效率低 | 用户体验差 | Size Classifier 自动裁剪，trivial 几乎零开销 |
| SubAgent 上下文传递不充分 | Worker 产出质量差 | Iterative Retrieval + NEEDS_CONTEXT 升级路径 |
| 审查噪音过多（false positive） | 用户疲劳 | Pre-Report Gate + 置信度过滤(>80%) |
| 长任务上下文退化 | 后期质量下降 | Controller 不持有实现细节 + 每任务新鲜 Agent |
| Spec 维护成本 | 用户不愿维护 | Delta Spec 最小变更 + 自动归档 |

---

## 13. 成功指标

| 指标 | 目标 | 度量方式 |
|------|------|---------|
| Spec 合规率 | ≥95% | Spec Compliance Review 通过率 |
| 首次实现通过率 | ≥70% | Review 无需返工的比例 |
| 测试覆盖率 | ≥80% | 自动 coverage 报告 |
| 验证通过率 | ≥90% | 6 级验证一次通过率 |
| 用户满意度 | 交付物可直接使用 | 无需人工大幅修改 |

---

*设计方案版本：1.0*
*生成时间：2026/06/10*
*分析来源：superpowers / OpenSpec / ECC 深度探索*
