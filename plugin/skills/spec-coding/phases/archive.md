# Phase 6: Archive（归档收尾）

**目的**：知识固化 + 流程收尾。Spec 合并由 OpenSpec CLI 保证。

---

## 执行逻辑

### 1. 复盘

- 对照 design.md 检查偏差
- 写入 notes.md

### 2. 格式验证（归档前确认）

```bash
openspec validate --json
```

确保所有 spec 文件格式正确，避免归档失败。

### 3. 归档（OpenSpec CLI 执行）

```bash
openspec archive {change-name} --yes
```

OpenSpec 自动执行：
- Delta spec 合并入 `openspec/specs/`（RENAMED→REMOVED→MODIFIED→ADDED 顺序）
- 保留原始需求排序
- 目录移动：`changes/{name}/` → `changes/archive/YYYY-MM-DD-{name}/`
- 更新 `.openspec.yaml`: `archived: true`

如归档失败 → 读取错误 → 尝试修复 → 重试。

### 4. 经验提取

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

### 5. 分支处理

AskUserQuestion：合并主分支 / 创建 PR / 保持 / 丢弃

### 6. 更新 .ace-state.json

```json
{
  "archived": true,
  "experience_extracted": true
}
```

### 7. AskUserQuestion（归档确认）

---

## 职责边界（Phase 6）

| 职责 | 谁做 |
|------|------|
| 复盘偏差 | spec-coding |
| delta spec 合并入 specs/ | **OpenSpec CLI** |
| 目录归档移动 | **OpenSpec CLI** |
| 经验提取 | spec-coding |
| 分支处理 | spec-coding |
| 工作流状态更新 | spec-coding |
