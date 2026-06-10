# Phase 6: Archive（归档收尾）

**目的**：知识固化 + 流程收尾。Spec 合并由 OpenSpec CLI 保证。

**交互规范**：所有 AskUserQuestion 调用遵循 `references/ask-user-guide.md`。

---

## 执行逻辑

### 1. 复盘

- 对照 technical-design.md 检查偏差
- 写入 notes.md

### 2. 经验提取

触发条件（任一满足）：
- 实施中遇到意外
- 踩坑后找到更好方案
- 反直觉行为
- 可复用模式

格式：
```
E{N}: {描述} | 来源: {change-name} | 日期: {date}
| 详情: {2-3 句} | 适用: {场景}
```

存储位置：`.ace/experience.md`

收敛：经验 > 20 条时提议合并/淘汰。

### 3. 归档前格式验证

```bash
openspec validate --json
```

确保所有 spec 文件格式正确，避免归档失败。

### 4. 归档（配置驱动）

```
IF config.auto_archive == true:
  → 直接执行 `openspec archive {change-name} --yes`
ELSE:
  → 先 markdown 展示即将归档的内容摘要
  → AskUserQuestion 审批确认后再执行
```

```bash
openspec archive {change-name} --yes
```

OpenSpec 自动执行：
- Delta spec 合并入 `openspec/specs/`（RENAMED→REMOVED→MODIFIED→ADDED 顺序）
- 保留原始需求排序
- 目录移动：`changes/{name}/` → `changes/archive/YYYY-MM-DD-{name}/`
- 更新 `.openspec.yaml`: `archived: true`

如归档失败 → 读取错误 → 尝试修复 → 重试。

### 5. 更新 .ace-state.json

```json
{
  "archived": true,
  "experience_extracted": true
}
```

### 6. 分支处理（配置驱动）

```
IF config.auto_push == true:
  → git add -A
  → git commit -m "feat(spec): {change-name} 描述本次改动"
  → git push -u origin {branch_name}
  → 无需用户确认
ELSE:
  → AskUserQuestion 让用户选择：
```

```
AskUserQuestion(questions: [{
  header: "分支处理",
  question: "实施分支如何处理？",
  options: [
    {label: "合并主分支 (推荐)", description: "squash merge 到主分支"},
    {label: "创建 PR", description: "推送远端，创建 Pull Request"},
    {label: "保持", description: "保留分支不做处理"}
  ]
}])
```

---

## 职责边界（Phase 6）

| 职责 | 谁做 |
|------|------|
| 复盘偏差 | spec-coding |
| 经验提取 | spec-coding |
| 格式验证 | OpenSpec CLI |
| delta spec 合并入 specs/ | **OpenSpec CLI** |
| 目录归档移动 | **OpenSpec CLI** |
| 状态更新 | spec-coding |
| 分支处理 | spec-coding |
