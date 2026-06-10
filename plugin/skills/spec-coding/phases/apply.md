# Phase 5: Apply（代码实施）

**目的**：按计划执行代码实现。可选 subagent 模式（推荐）或 direct 模式。

**交互规范**：所有 AskUserQuestion 调用遵循 `references/ask-user-guide.md`。

---

## 执行逻辑

### 1. 选择执行策略

**配置驱动**：

```
IF config.use_subagent 已配置:
  → 直接使用配置值决定执行模式
  → mode=="auto" 时隔离方式默认 branch，跳过交互
  → mode=="manual" 时只问隔离方式（执行模式已由配置决定）

IF config.use_subagent 未配置（或 config 不存在）:
  → AskUserQuestion 让用户选择执行模式 + 隔离方式
```

**手动模式下的交互**（仅 config 未明确时）：

```
AskUserQuestion(questions: [
  {
    header: "执行模式",
    question: "代码实施使用什么执行模式？",
    options: [
      {label: "subagent (推荐)", description: "隔离子代理 + 双重审查，质量更高"},
      {label: "direct", description: "主代理直接执行，轻量快速，无审查"}
    ]
  },
  {
    header: "隔离方式",
    question: "代码隔离方式？",
    options: [
      {label: "branch (推荐)", description: "git checkout -b feat/spec-{name}"},
      {label: "worktree", description: "EnterWorktree 完全隔离"},
      {label: "none", description: "当前分支直接工作"}
    ]
  }
])
```

### 2. 创建隔离环境（在任何代码修改之前）

```
IF branch：
  git checkout -b feat/spec-{change-name}
  → 记录 branch_name 到 .ace-state.json
IF worktree：
  EnterWorktree
  → 记录 worktree path 到 .ace-state.json
IF none：
  → 跳过
```

**此步骤必须在步骤 3 之前完成。任何代码修改都在隔离环境中进行。**

### 3. 执行

<HARD-GATE>
每完成一个任务后，必须立即：
1. 更新 tasks.md 中对应 checkbox：`- [ ]` → `- [x]`
2. 更新 .ace-state.json：`completed_tasks++`，`current_task` 指向下一个
未更新 = 任务未完成。不可先执行多个任务再批量更新。
</HARD-GATE>

#### Subagent 模式（推荐）

invoke `/subagent-execute`，传入：
- `tasks_file`: openspec/changes/{name}/tasks.md
- `design_context`: openspec/changes/{name}/technical-design.md
- `pattern_report`: technical-design.md 的 Patterns 节

→ /subagent-execute 每完成一个任务就更新 tasks.md checkbox
→ 全部完成后 spec-coding 更新 .ace-state.json

#### Direct 模式

逐任务执行（主代理直接实现），每任务完成后**立即**：
1. 执行 /verify Gate Function（运行验证命令）
2. 更新 tasks.md checkbox：`- [ ]` → `- [x]`
3. 更新 .ace-state.json: `completed_tasks++`, `current_task++`

无 spec-reviewer / code-reviewer（轻量模式），但**仍必须运行验证命令**（/verify 铁律不可跳过）。

### 4. 偏差处理（分级）

借鉴 OpenSpec "随时更新 artifact" 哲学：

#### 轻微偏差（spec 不精确但方向对）

- implementer 报告 DONE_WITH_CONCERNS
- Controller 评估：是 spec 描述不精确？
- 直接更新 delta spec 中对应的 WHEN/THEN
- `openspec validate --json` 确认格式
- 继续执行

#### 中度偏差（设计决策需微调）

- 记录到 notes.md
- 更新 technical-design.md 相关段落
- 继续执行

#### 重大偏差（方向性问题）

- AskUserQuestion 报告偏差
- 用户决策：继续 / 回退 Phase 3 (design) / 回退 Phase 1 (understand)

### 5. 全部完成

事件 `applied` → Phase 6

---

## spec-coding 在 Phase 5 的职责边界

| ✅ 做 | ❌ 不做 |
|-------|--------|
| 选择模式和隔离方式 | 具体的子代理调度 |
| 调用 /subagent-execute | 管理 implementer 生命周期 |
| 接收结果并更新状态 | 做代码审查 |
| 偏差决策 | 决定模型选择 |
| 轻微偏差时回写 delta spec | - |
