# 状态文件规范

统一状态管理——所有 ACE 任务使用 `.ace/tasks/{changeName}/state.json`。

---

## 路径规则

```
$PROJECT_ROOT/.ace/tasks/{changeName}/state.json
```

- `{changeName}`: kebab-case, 2-4 英文单词描述任务语义
- spec 任务时与 `openspec/changes/{changeName}/` 同名关联

---

## state.json 模板

```jsonc
{
  // === 公共字段 (所有任务类型必填) ===
  "name": "{changeName}",
  "type": "goal",                    // "spec" | "goal" | "analysis" | "review"
  "status": "in-progress",           // "pending" | "in-progress" | "completed"
  "created_at": "2026-06-12T10:00:00",
  "updated_at": "2026-06-12T14:30:00",

  "completion_criteria": [
    "可测试的完成条件 1",
    "可测试的完成条件 2"
  ],

  "tasks": [
    {"id": "T1", "title": "...", "status": "done", "parallel": true},
    {"id": "T2", "title": "...", "status": "in-progress", "parallel": true},
    {"id": "T3", "title": "...", "status": "pending", "depends": ["T1", "T2"]}
  ],

  // === goal 类型扩展 ===
  "goal": {
    "phase": "executing",            // "aligning" | "planning" | "executing" | "verifying"
    "decisions": [
      {"decision": "...", "reason": "...", "alternatives": ["..."]}
    ]
  },

  // === spec 类型扩展 ===
  "spec": {
    "phase": "design",               // "understand" | "propose" | "design" | "plan" | "apply" | "archive"
    "workflow": "standard",
    "openspec_change": "{changeName}",
    "timestamps": {
      "understand_started": "2026-06-12T10:00:00",
      "propose_started": null,
      "design_started": null,
      "plan_started": null,
      "apply_started": null,
      "archive_started": null
    },
    "approvals": {
      "proposal": false,
      "design": false,
      "plan": false
    }
  },

  // === analysis 类型扩展 ===
  "analysis": {
    "skill": "requirement-analysis",
    "scope": "..."
  },

  // === review 类型扩展 ===
  "review": {
    "target": "branch/pr/diff",
    "findings_count": 0
  }
}
```

### spechub 类型（独立 schema）

`type: "spechub"` 使用独立 schema，由 `spechub-coding/references/state-schema.md` 定义。
与上述统一模板的公共字段不兼容（使用 camelCase、phases 结构等）。

spec-coding 恢复协议筛选 `type=="spec"` 时会自动排除 spechub 任务。

---

## 配套文件

每个 task 目录的完整结构：

```
.ace/tasks/{changeName}/
├── state.json        # 机器可读状态 (必需)
├── context.md        # 人可读文档: 任务描述 + 决策 + 中间结论 (必需)
└── artifacts/        # 输出产物 (按需)
    └── *.md          #   prd / technical-design / review-findings / report...
```

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
- {发现/结论 2}

### 风险
- {风险}: {缓解方案}

## 已修改文件
- {path}: {变更说明}
```

---

## 使用规则

1. **创建时机**: 对齐确认通过后，第一个动作
2. **更新频率**: 每次 TaskUpdate 变更状态后同步更新 state.json
3. **新目标 = 新目录**: 不复用上一个任务的目录
4. **设计目标**: 新 agent 读完 state.json + context.md 后能以 80% 效率继续

---

## 并行标注

在 state.json 的 tasks 数组中：
- `"parallel": true` = 可与同级其他 parallel 任务并行
- `"depends": ["T1", "T2"]` = 必须等依赖完成后执行
- 无标注 = 默认串行
