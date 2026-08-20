# 恢复协议

当用户说"继续"或重新调用 /spec-coding 时执行此协议。

---

## 恢复流程

### Step 1: 检测活跃 spec 任务

```
Glob `.ace/tasks/*/state.json`
→ 逐个读取
→ 筛选 type=="spec" && status!="completed"
```

### Step 2: 读取恢复点

读取 `state.json` 的关键字段：
- `spec.phase`: 当前阶段
- `spec.workflow`: 复杂度分级
- `spec.openspec_change`: 关联的 openspec change
- `tasks[].status`: 任务进度（如在 apply 阶段）

### Step 3: 按 phase 决定恢复点

| phase | 恢复策略 |
|-------|---------|
| understand | 重新进入 Phase 1 |
| propose | `$CHANGE_DIR/proposal.md` 存在？→ Phase 3 : 重新 propose |
| design | `$CHANGE_DIR/design.md` + `$TASK_DIR/artifacts/technical-design.md` 存在？→ Phase 4 |
| plan | `$CHANGE_DIR/tasks.md` 存在？→ Phase 5 |
| apply | tasks.md（找下一个未勾选任务）→ 继续执行 |
| archive | 继续归档流程 |

### Step 4: 告知用户恢复状态

简要报告：
- 变更名称
- 当前阶段
- 进度（如 "5/8 tasks completed"）
- 下一步动作

### Step 5: 继续执行

---

## 多任务处理

如果有多个活跃 spec 任务 → AskUserQuestion 让用户选择。

---

## 降级路径（state.json 丢失但 openspec change 存在）

### 1. 获取 OpenSpec 状态

```bash
openspec list --json
openspec status --change {changeName} --json
```

### 2. 从 artifact 图推断 phase

| artifact 状态 | 推断 phase |
|--------------|-----------|
| proposal done + specs done + design done + tasks done | apply |
| proposal done + specs done + design done | plan |
| proposal done + specs done | design |
| proposal done | propose（结束）或 design（开始） |
| 无 artifact | understand |

### 3. 重建 state.json

在 `.ace/tasks/{changeName}/` 下创建 state.json（type: "spec"），基于推断的 phase 填充。

### 4. AskUserQuestion 确认

"检测到变更 {changeName}，推断当前在 {phase} 阶段。正确吗？"

---

## 接管非 spec-coding 创建的 change

如果 openspec change 有 `.openspec.yaml` 但 `.ace/tasks/` 下无对应 state.json：
- 这是其他工具创建的 change（如直接用 OpenSpec CLI）
- 提示用户：是否接管？
- 接管 → 创建 `.ace/tasks/{changeName}/state.json` + 开始管理
- 不接管 → 忽略此 change
