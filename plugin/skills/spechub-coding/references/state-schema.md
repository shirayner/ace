# State Schema — state.json 完整定义

## 文件位置
`.ace/tasks/{changeName}/state.json`

---

## 统一基础字段（同 shared/state-template.md）

```json
{
  "changeName": "grade-retention-rules",
  "type": "spechub",
  "skillName": "spechub-coding",
  "status": "in_progress",
  "created_at": "2026-06-15T10:00:00Z",
  "updated_at": "2026-06-15T14:30:00Z",
  "completed_at": null,
  "archived_at": null,
  "completion_criteria": [],
  "tasks": []
}
```

---

## spechub 类型特定字段

```json
{
  "spechub": {
    "reqId": 1450,
    "title": "黑钻升降保级规则",
    "currentPhase": "design",
    "phases": {
      "pull":       { "status": "done",    "ts": "ISO", "outputs": ["input/manifest.json", "input/artifacts/"] },
      "comprehend": { "status": "done",    "ts": "ISO", "outputs": ["comprehension.md", "artifact-inventory.json", "readiness-manifest.json"] },
      "readiness":  { "status": "done",    "ts": "ISO", "outputs": ["readiness-check.md"], "blockers": [] },
      "design":     { "status": "in_progress", "ts": "ISO", "outputs": [] },
      "implement":  { "status": "pending" },
      "verify":     { "status": "pending" },
      "archive":    { "status": "pending" }
    },
    "gates": {
      "G0": { "passed": true, "ts": "ISO", "scopeDecision": { "in": [], "out": [] } },
      "G1": { "passed": true, "ts": "ISO" },
      "G2": { "passed": false },
      "G3": { "passed": false }
    },
    "divergences": [
      {
        "id": "DIV-001",
        "type": "artifact_error|design_choice|scope_change|implementation_drift|infra_override",
        "severity": "blocker|significant|minor",
        "phase": "comprehend|design|implement|readiness",
        "category": "人类可读分类",
        "expected": "产物/平台方案",
        "actual": "本地实际方案",
        "reason": "差异原因",
        "evidence": "代码路径/grep结果（可选）",
        "userApproved": true,
        "approvedAt": "ISO"
      }
    ]
  }
}
```

---

## 完整示例（基础字段 + spechub 块）

```json
{
  "changeName": "grade-retention-rules",
  "type": "spechub",
  "skillName": "spechub-coding",
  "status": "in_progress",
  "created_at": "2026-06-15T10:00:00Z",
  "updated_at": "2026-06-15T14:30:00Z",
  "completed_at": null,
  "archived_at": null,
  "completion_criteria": [],
  "tasks": [],
  "spechub": {
    "reqId": 1450,
    "title": "黑钻升降保级规则",
    "currentPhase": "design",
    "phases": {
      "pull":      { "status": "done", "ts": "2026-06-15T10:05:00Z", "outputs": ["input/manifest.json", "input/artifacts/"] },
      "comprehend": { "status": "done", "ts": "2026-06-15T11:00:00Z", "outputs": ["comprehension.md"] },
      "readiness": { "status": "done", "ts": "2026-06-15T11:30:00Z", "outputs": ["readiness-check.md"] },
      "design":    { "status": "in_progress", "ts": "2026-06-15T12:00:00Z", "outputs": [] },
      "implement": { "status": "pending" },
      "verify":    { "status": "pending" },
      "archive":   { "status": "pending" }
    },
    "gates": {
      "G0": { "passed": true, "ts": "2026-06-15T11:05:00Z" },
      "G1": { "passed": true, "ts": "2026-06-15T11:35:00Z" }
    },
    "divergences": []
  }
}
```

---

## 状态转移规则

| 事件             | 动作                                                               |
| ---------------- | ------------------------------------------------------------------ |
| Phase 开始       | spechub.phases[phase].status = "in_progress"                      |
| Phase 完成       | spechub.phases[phase].status = "done", .ts = now                  |
| Gate 通过        | spechub.gates[G].passed = true, spechub.currentPhase = nextPhase |
| 新增 divergence  | spechub.divergences.push(newDiv)                                  |
| divergence 确认  | spechub.divergences[i].userApproved = true, approvedAt = now      |
| 任务完成         | status = "completed", completed_at = now（由 ace task complete 写）|
| 归档             | archived_at = now（由 ace task archive 写）                        |

---

## 兼容性说明

旧版 spechub state.json 使用顶层字段（`reqId`, `currentPhase`, `phases`, `gates`, `divergences`）而非嵌套在 `spechub` 块内。
恢复协议应兼容两种格式：优先读 `state.spechub.reqId`，回退读 `state.reqId`。

---

## .active-spechub 文件

`.ace/tasks/.active-spechub` — 内容仅为 reqId 字符串，表示当前活跃需求。
- PULL 阶段创建
- ARCHIVE 阶段删除（在 `ace task archive` 之前删除）
- 恢复时读取以定位活跃需求（也可通过 `ace task list` 扫描）
