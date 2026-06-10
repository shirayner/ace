# Phase 5: Apply（代码实施）

**目的**：按计划执行代码实现。可选 subagent 模式（推荐）或 direct 模式。

---

## 执行逻辑

### 1. 选择执行策略（首次进入时，一次性确认）

AskUserQuestion（合并两个选择为一次交互）：

| 维度 | 选项 | 说明 |
|------|------|------|
| 执行模式 | subagent（推荐） | 隔离子代理 + 双重审查 |
| | direct | 主代理直接执行，轻量快速 |
| 隔离方式 | branch（推荐） | git checkout -b feat/spec-{change-name} |
| | worktree | EnterWorktree（完全隔离） |
| | none | 当前分支直接工作 |

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

#### Subagent 模式（推荐）

invoke `/subagent-execute`，传入：
- `tasks_file`: openspec/changes/{name}/tasks.md
- `design_context`: openspec/changes/{name}/technical-design.md
- `pattern_report`: technical-design.md 的 Patterns 节

→ /subagent-execute 返回执行结果
→ spec-coding 更新 .ace-state.json

#### Direct 模式

- 逐任务执行（主代理直接实现）
- 每任务完成后：
  - 执行 /verify Gate Function（运行验证命令）
  - 更新 tasks.md checkbox
  - 更新 .ace-state.json: `completed_tasks++`
- 无 spec-reviewer / code-reviewer（轻量模式）
- 但**仍必须运行验证命令**（/verify 铁律不可跳过）

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
