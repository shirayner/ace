# Phase: IMPLEMENT — 代码实现

## 职责
按 tasks.md 逐步实现代码，跟踪偏离。

## 输入
- `openspec/changes/{slug}/design.md` — 决策清单
- `openspec/changes/{slug}/tasks.md` — 任务清单
- `.claude/project-profile.md` — 项目编码约定

## 产出
- 实际代码变更
- tasks.md 中已完成 task 打勾 `[x]`
- state.json 更新（含实现偏离记录）

---

## 执行步骤

### 1. 调用 OpenSpec Apply

调用 `/opsx:apply` — 这将读取 change 的完整上下文并逐步实现。

如果 `/opsx:apply` 不可用，则手动逐 task 实现：

### 2. 逐 Task 实现

对 tasks.md 中的每个 task：
1. 读取 task 描述 + 关联决策（如 → D1, D3）
2. 读取 design.md 中对应决策的详细方案
3. 参照 project-profile.md 的编码约定实现
4. 完成后将 `- [ ]` 改为 `- [x]`
5. 自检：实现是否偏离对应决策点？

### 3. 偏离检测

每完成一个 task，检查实际实现与 design.md 决策是否一致：

**一致** → 继续下一个 task

**偏离** → 记录 + 暂停确认：
```json
{
  "id": "DIV-{seq}",
  "type": "implementation_drift",
  "severity": "significant",
  "phase": "implement",
  "category": "实现偏离",
  "expected": "design.md 中 D{N} 的方案",
  "actual": "实际实现方式",
  "reason": "偏离原因（如：实现中发现约束）",
  "userApproved": false
}
```

→ AskUserQuestion："实现偏离了设计 D{N}，是否接受？"
- 接受 → userApproved=true，继续
- 拒绝 → 按设计重新实现

### 4. 回退条件

**≥2 个 task 偏离设计** → 建议回退到 DESIGN Phase（re-spec）：
- AskUserQuestion："已有 {N} 处偏离设计，建议回到设计阶段重新规划。继续/回退？"
- 回退 → state.json.currentPhase = "design"，重新进入 DESIGN

### 5. 更新状态

所有 task 完成后：
```json
{
  "currentPhase": "verify",
  "phases": { "implement": { "status": "done", "ts": "{ISO}", "outputs": ["tasks.md (all checked)"] } }
}
```

自动进入 VERIFY Phase（无 Gate）。
