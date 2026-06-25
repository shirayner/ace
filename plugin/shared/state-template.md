# 状态文件规范

统一状态管理——所有 ACE 任务使用 `.ace/tasks/{changeName}/state.json`。

---

## 路径规则

```
$PROJECT_ROOT/.ace/tasks/{changeName}/state.json
```

- `{changeName}`: kebab-case, 2-4 英文单词描述任务语义
- spec / spechub 任务时 changeName 与 `openspec/changes/{changeName}/` 同名（同名约定替代 openspec_link 字段）

---

## 统一基础字段（三种 type 共用）

```jsonc
{
  // === 基础字段（统一）===
  "changeName": "{changeName}",          // ★ 关联 key，== openspec changeName（如适用）
  "type": "simple",                      // "simple" | "spec" | "spechub"
  "skillName": "auto-goal",              // 创建该任务的 skill 名称
  "status": "in_progress",              // "in_progress" | "completed"
  "created_at": "{ISO时间}",
  "updated_at": "{ISO时间}",
  "completed_at": null,                  // 完成时填（ace task complete 写入）
  "archived_at": null,                   // 归档时填（ace task archive 写入）

  // === 完成标准（统一）===
  "completion_criteria": [
    "可测试的完成条件 1",
    "可测试的完成条件 2"
  ],

  // === 任务列表（统一）===
  "tasks": [
    {"id": "T1", "title": "...", "status": "done", "parallel": true},
    {"id": "T2", "title": "...", "status": "in-progress", "parallel": true},
    {"id": "T3", "title": "...", "status": "pending", "depends": ["T1", "T2"]}
  ],

  // === 类型特定字段（按 type 不同，见下方）===
}
```

> **兼容说明**：旧任务可能使用 `"name"` 而非 `"changeName"`。
> `ace task` 命令和恢复协议遇到缺失 `changeName` 时自动回退读取 `name` 字段。

---

## type: "spec" 扩展字段

```jsonc
{
  "spec": {
    "phase": "design",               // understand|propose|design|plan|apply|archive
    "workflow": "standard",          // trivial|small|standard|large
    "isolation": "branch",           // branch|worktree|none
    "timestamps": {
      "understand_started": "...",
      "propose_started": "..."
    },
    "approvals": {
      "proposal": false,
      "design": false,
      "plan": false
    },
    "scope_assessment": "appropriate"  // appropriate|needs_decomposition
  }
}
```

**路径推导**：`openspec/changes/{changeName}/`（由 changeName 确定性推导，无需存储链接字段）

---

## type: "spechub" 扩展字段

```jsonc
{
  "spechub": {
    "reqId": 1450,
    "title": "黑钻升降保级规则",
    "currentPhase": "design",        // pull|comprehend|readiness|design|implement|verify|archive|done
    "phases": {
      "pull": {"status": "done", "ts": "..."},
      "comprehend": {"status": "done", "ts": "..."}
    },
    "gates": {
      "G0": {"passed": true, "ts": "..."},
      "G1": {"passed": true, "ts": "..."}
    },
    "divergences": []
  }
}
```

> **注**：原有 spechub state.json 采用顶层字段（`reqId`, `currentPhase`, `phases`, `gates`, `divergences`）而非嵌套在 `spechub` 块内，两种格式均兼容。
> 新建任务推荐使用嵌套格式；恢复协议兼容两种。

---

## type: "simple" 扩展字段

适用：auto-goal / requirement-analysis / code-review（及未来不走 openspec 的 skill）

```jsonc
{
  "simple": {
    "phase": "executing",            // planning|executing|verifying
    "decisions": [
      {"decision": "使用 Caffeine", "reason": "延迟敏感", "alternatives": ["Redis"]}
    ]
  }
}
```

---

## 完整目录结构

```
.ace/tasks/{changeName}/
├── state.json        # 机器可读状态（必需）
├── context.md        # 人可读文档：任务描述 + 决策 + 中间结论（必需）
├── input/            # 任务输入（只读，spechub 使用）
│   ├── manifest.json
│   └── artifacts/
└── artifacts/        # 任务输出（ACE 过程产物，按需懒建）
```

> **artifacts/ 子目录按需创建**，不预建固定子目录结构。命名约定见 `artifacts-schema.md`。

---

## context.md 模板

```markdown
# {任务标题}

## 目标
{一句话目标描述}

## 过程记录

### 决策
- **D1**: {决策内容} — 理由: {why}，备选: {alternatives}

### 中间结论
- {发现/结论 1}

### 风险
- {风险}: {缓解方案}

## 已修改文件
- {path}: {变更说明}
```

---

## 使用规则

1. **创建时机**：对齐确认通过后，第一个动作
2. **changeName 唯一性**：创建前检查 `.ace/tasks/{changeName}/` 是否已存在
3. **更新频率**：每次状态变更后同步更新 `state.json`
4. **新目标 = 新目录**：不复用上一个任务的目录
5. **完成与归档**：任务完成后调用 `ace task complete`，归档调用 `ace task archive`

---

## 并行标注

在 state.json 的 tasks 数组中：
- `"parallel": true` = 可与同级其他 parallel 任务并行
- `"depends": ["T1", "T2"]` = 必须等依赖完成后执行
- 无标注 = 默认串行
