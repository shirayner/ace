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
  → mode=="auto" 时跳过交互
  → mode=="manual" 时只问执行模式（隔离方式已在 Phase 1 Step 7 决定）

IF config.use_subagent 未配置（或 config 不存在）:
  → AskUserQuestion 让用户选择执行模式
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
  }
])
```

> **注**：隔离方式已在 Phase 1 Step 7 确定并执行，此处无需再次选择。

### 2. 确认隔离环境 + 更新状态

```
读取 state.json 中 spec.isolation 的值，按类型确认环境就绪：

IF isolation == "branch":
  git branch --show-current
  → 应输出 feat/spec-{changeName}，否则执行 git checkout feat/spec-{changeName}
IF isolation == "worktree":
  → 确认当前工作目录为 worktree 路径
IF isolation == "none":
  → 跳过

更新 $TASK_DIR/state.json:
  "spec.apply": {
    "mode": "{subagent|direct}",
    "isolation": "{从 spec.isolation 读取}",
    "branch_name": "feat/spec-{changeName}"   // 仅 branch 模式有效
  }
```

**此步骤必须在步骤 3 之前完成。任何代码修改都在隔离环境中进行。**

### 3. 执行

<HARD-GATE>
每完成一个任务后，必须立即更新 tasks.md 中对应 checkbox：`- [ ]` → `- [x]`。
state.json 更新策略按执行模式区分（见下文）。
未更新 tasks.md = 任务未完成。不可先执行多个任务再批量更新。
</HARD-GATE>

#### Subagent 模式（推荐）

Read `{skill_dir}/../subagent-execute/SKILL.md`，按其协议执行。传入：
- `tasks_file`: openspec/changes/{changeName}/tasks.md
- `design_context`: .ace/tasks/{changeName}/artifacts/technical-design.md
- `pattern_report`: technical-design.md 的 Patterns 节

**注意：不使用 `Skill()` 工具调用 subagent-execute**（Skill 工具会将整个 SKILL.md 打印给用户）。
直接 Read 其 SKILL.md 并按协议执行即可。

→ /subagent-execute 每完成一个任务就更新 tasks.md checkbox
→ 全部完成后 spec-coding 统一更新 state.json（tasks 数组状态同步）

#### Direct 模式

逐任务执行（主代理直接实现），每任务完成后**立即**：
1. 执行 /verify Gate Function（运行验证命令）
2. 更新 tasks.md checkbox：`- [ ]` → `- [x]`
3. 更新 $TASK_DIR/state.json: 对应 tasks 项 status → "done"
3. 更新 $TASK_DIR/state.json: 对应 tasks 项 status → "done"

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
