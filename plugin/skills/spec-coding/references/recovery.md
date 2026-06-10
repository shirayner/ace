# 恢复协议

当用户说"继续"或重新调用 /spec-coding 时执行此协议。

---

## 恢复流程

### Step 1: 检测活跃变更

```bash
openspec list --json
```

获取所有活跃变更列表。

### Step 2: 匹配 spec-coding 管理的变更

对每个活跃变更：
- 检查 `.ace-state.json` 是否存在
- 存在 + `archived: false` → 这是 spec-coding 管理的活跃变更

### Step 3: 读取恢复点

读取 `.ace-state.json` 的关键字段：
- `phase`: 当前阶段
- `workflow`: 复杂度分级
- `completed_tasks` / `total_tasks`: 进度（如在 apply 阶段）

### Step 4: 按 phase 决定恢复点

| phase | 恢复策略 |
|-------|---------|
| understand | 重新进入 Phase 1 |
| propose | `proposal.md` 存在？→ Phase 3 : 重新 propose |
| design | `design.md` + `technical-design.md` 存在？→ Phase 4 |
| plan | `tasks.md` 存在？→ Phase 5 |
| apply | tasks.md（找下一个未勾选任务）→ 继续执行 |
| archive | 继续归档流程 |

### Step 5: 告知用户恢复状态

简要报告：
- 变更名称
- 当前阶段
- 进度（如 "5/8 tasks completed"）
- 下一步动作

### Step 6: 继续执行

---

## 多变更处理

如果有多个活跃变更 → AskUserQuestion 让用户选择。

---

## 降级路径（.ace-state.json 丢失）

当 change 目录存在但 `.ace-state.json` 丢失时：

### 1. 获取 OpenSpec 状态

```bash
openspec status --change {name} --json
```

### 2. 从 artifact 图推断 phase

| artifact 状态 | 推断 phase |
|--------------|-----------|
| proposal done + specs done + design done + tasks done | apply |
| proposal done + specs done + design done | plan |
| proposal done + specs done | design |
| proposal done | propose（结束）或 design（开始） |
| 无 artifact | understand |

### 3. 重建 .ace-state.json

基于推断的 phase 创建最小状态文件。

### 4. AskUserQuestion 确认

"检测到变更 {name}，推断当前在 {phase} 阶段。正确吗？"

---

## 接管非 spec-coding 创建的 change

如果 change 有 `.openspec.yaml` 但无 `.ace-state.json`：
- 这是其他工具创建的 change（如直接用 OpenSpec CLI）
- 提示用户：是否接管？
- 接管 → 创建 `.ace-state.json` + 开始管理
- 不接管 → 忽略此 change
