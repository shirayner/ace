---
name: subagent-execute
description: |
  通用子代理驱动执行引擎。输入任务列表，逐任务派遣隔离子代理，配合两阶段审查（规范合规 + 代码质量）。
  可独立使用，也可作为 /spec-coding 的执行后端。

  独立使用：/subagent-execute [tasks-path] 执行任何 tasks.md / 计划文件
  被调用：/spec-coding Phase 5 Apply 时自动调用

  DO NOT TRIGGER: 无任务列表的开放式编码（→ auto-goal）；并行修复独立 bug（→ /parallel-dispatch）。
---
# Subagent Execute — 通用子代理执行引擎

**核心原则**：
- 每任务一个新的隔离子代理（无上下文污染）
- 两阶段审查：先 spec compliance，后 code quality
- 持续执行不打断（除非 BLOCKED）
- Controller 不信任 implementer 报告（独立验证一切）

---

## 输入/输出接口

**输入**：
```
/subagent-execute [tasks_path]
  tasks_path: 任务文件路径（markdown with checkboxes）
  或通过 ARGUMENTS 直接传入：
    - tasks_file: 任务文件路径（如 openspec/changes/{changeName}/tasks.md）
    - design_context: 设计文档路径（如 .ace/tasks/{changeName}/artifacts/technical-design.md）
    - pattern_report: Pattern Grounding Report 内容
    - state_file: 状态文件路径（如 .ace/tasks/{changeName}/state.json）
```

**输出**：
- 每任务的执行状态（DONE / DONE_WITH_CONCERNS / BLOCKED）
- 变更文件列表
- 审查结论
- tasks.md 中对应 checkbox 已勾选

---

## 执行流程

### Step 1: 解析任务列表

```
Read tasks_path
提取所有 `- [ ]` 未完成任务
识别任务分组和依赖标记
```

### Step 2: 执行策略确定

```
执行模式：严格串行

即使任务标记为 ⟂（逻辑独立），仍然串行执行。
原因：
  - 逻辑独立 ≠ 运行时无文件冲突
  - 串行 + 双重审查 = 高质量保证
  - 并行只用于探索/调研场景（→ /parallel-dispatch）

任务执行顺序：
  1. 按 tasks.md 中的顺序
  2. 同组内按编号顺序
  3. 跨组按组顺序
  4. 无需等上一组全部完成才开始下一组（除非有 depends 标记）
```

### Step 3: 逐任务执行循环

For each task:

#### 3a. 选择模型（复杂度信号）

| 信号 | 模型 |
|------|------|
| 1-2 文件 + 清晰规范 | 快速模型（haiku） |
| 5+ 文件 + 模式匹配 | 标准模型（sonnet） |
| 架构判断 + 权衡 | 强模型（opus） |

#### 3b. 派遣实现者子代理

Read `prompts/implementer.md`，构造 prompt 传递：
- 完整任务文本（不让子代理读文件）
- 架构背景（从 design context 摘取相关段落）
- Pattern Grounding Report（约定遵循）
- 约束（不修改其他代码、遵循现有模式）
- 鼓励提问

#### 3c. 处理实现者状态

| 状态 | 处理 |
|------|------|
| DONE | → 进入 Verification Gate |
| DONE_WITH_CONCERNS | 读取 concerns，必要时处理后进入 Verification |
| NEEDS_CONTEXT | 提供信息，重新派遣 |
| BLOCKED | 升级策略（见下） |

**BLOCKED 升级策略**：
```
├── 上下文问题 → 补充上下文重新派遣
├── 推理能力不足 → 更强模型重新派遣
├── 任务过大 → 拆分为更小任务
└── 计划本身错误 → 报告给调用者（escalation）
```

#### 3d. Verification Gate（Controller 独立验证）

运行任务对应的验证命令（测试/编译/lint）：
- ✅ 通过 → 进入规范审查
- ❌ 失败 → 报告给 implementer → 修复 → 重新验证
- 最多 3 次重试，仍失败 → 标记 BLOCKED

**CRITICAL: 不信任 implementer 的验证报告。Controller 必须独立运行验证命令。**

#### 3e. 规范审查（Spec Compliance）

Read `prompts/spec-reviewer.md`，派遣 spec-reviewer 子代理：
- 验证实现 vs 任务规范（逐行对比）
- 检查：缺失需求？多余功能？误解？
- ✅ 通过 → 进入代码审查
- ❌ 问题 → 实现者修复 → 重新验证 → 重新审查

#### 3f. 代码质量审查（Code Quality）

**只在 spec compliance ✅ 后执行！**

Read `prompts/code-reviewer.md`，派遣 code-reviewer 子代理：
- 检查：DRY、错误处理、可读性、文件职责
- ✅ 批准 → 标记完成
- ❌ 问题 → 实现者修复 → 重新验证 → 重新审查

#### 3g. 标记任务完成（每任务必须立即执行）

<HARD-GATE>
每完成一个任务，必须立即执行以下更新，不可延迟或批量操作：
</HARD-GATE>

1. 更新 tasks.md checkbox：`- [ ]` → `- [x]`
2. 记录变更文件列表

这确保中断恢复时能从正确位置继续。

### Step 4: 全部任务完成

- 最终集成验证（运行完整测试套件）
- 汇报结果给调用者

---

## 通信协议（与 /spec-coding 交互）

**正常完成**：
```
返回 {
  status: "completed",
  completed_count: N,
  total_count: N,
  files_changed: [...],
  issues: []
}
```

**部分完成**（中断/失败）：
```
返回 {
  status: "partial_completion",
  completed_count: M,
  total_count: N,
  last_completed_task_id: "2.3",
  files_changed: [...],
  issues: [...]
}
```

**升级信号**（设计缺陷）：
```
返回 {
  status: "escalation",
  reason: "设计缺陷描述",
  task_id: "3.1",
  suggestion: "回退 design / 修改 spec"
}
```

**恢复**：调用者重新 invoke 时传入 `resume_from: task_id`

---

## Red Flags

| 绝不 | 原因 |
|------|------|
| 跳过审查（spec 或 quality） | 审查是质量保证 |
| 未修复 issue 就继续 | 技术债积累 |
| 并行派遣修改同文件的 agent | 冲突 |
| 让子代理读 plan 文件 | 提供完整文本才可靠 |
| 忽略子代理提问 | 猜测 < 澄清 |
| spec 审查未过就做 code 审查 | 顺序错误，浪费 |
| 子代理失败后不改变就重试 | 相同输入 = 相同失败 |
| 信任 implementer 的验证报告 | 独立验证是铁律 |
