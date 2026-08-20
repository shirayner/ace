# State Schema — state.json 完整定义

> 本文件为 spechub-coding 的**自包含**状态规范。无外部依赖。

## 文件位置

`$PROJECT_ROOT/.ace/tasks/{changeName}/state.json`

---

## 统一基础字段

所有 ACE 任务共用的基础字段：

```jsonc
{
  "changeName": "grade-retention-rules",   // ★ 唯一关联 key（== openspec change name）
  "type": "spechub",                       // "simple" | "spec" | "spechub"
  "skillName": "spechub-coding",
  "status": "in_progress",                // "in_progress" | "completed"
  "created_at": "2026-06-15T10:00:00Z",
  "updated_at": "2026-06-15T14:30:00Z",
  "completed_at": null,                    // scripts/ace-done.py 写入
  "archived_at": null,                     // scripts/ace-done.py 写入
  "completion_criteria": [],
  "tasks": [
    {"id": "T1", "title": "...", "status": "done", "parallel": true},
    {"id": "T2", "title": "...", "status": "pending", "depends": ["T1"]}
  ]
}
```

---

## spechub 类型扩展字段

```jsonc
{
  "spechub": {
    "reqId": 1450,
    "title": "黑钻升降保级规则",
    "currentPhase": "design",   // pull|prepare|design|implement|verify|archive|done
    "phases": {
      "pull":       { "status": "done",    "ts": "ISO", "outputs": ["input/manifest.json", "input/artifacts/"] },
      "prepare":    { "status": "done",    "ts": "ISO", "outputs": ["prepare-summary.md", "readiness-manifest.json"] },
      "design":     { "status": "in_progress", "ts": "ISO", "outputs": [] },
      "implement":  { "status": "pending" },
      "verify":     { "status": "pending" },
      "archive":    { "status": "pending" }
    },
    "gates": {
      "G1": { "passed": true, "ts": "ISO" },
      "G2": { "passed": false },
      "G3": { "passed": false }
    },
    "snapshots": [
      {
        "phase": "prepare",
        "ts": "ISO",
        "outputs": ["prepare-summary.md"]
      }
    ]
  }
}
```

### Divergences 独立文件

偏离记录不再存储在 state.json 中，改为独立文件 `$TASK_DIR/artifacts/divergences.jsonl`（每行一个 JSON 对象，append-only）：

```jsonl
{"id":"DIV-001","type":"design_choice","severity":"significant","phase":"design","category":"技术选型","expected":"平台方案","actual":"本地方案","reason":"理由","userApproved":false}
{"id":"DIV-002","type":"implementation_drift","severity":"minor","phase":"implement","category":"实现细节","expected":"...","actual":"...","reason":"...","autoAbsorbed":true}
```

**优势**：
- append-only，不需要反复读写 state.json
- 每次偏离只需一行 Write/追加
- ARCHIVE 阶段一次性 Read 聚合

---

## 完整示例

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
      "prepare":   { "status": "done", "ts": "2026-06-15T11:00:00Z", "outputs": ["prepare-summary.md", "readiness-manifest.json"] },
      "design":    { "status": "in_progress", "ts": "2026-06-15T12:00:00Z", "outputs": [] },
      "implement": { "status": "pending" },
      "verify":    { "status": "pending" },
      "archive":   { "status": "pending" }
    },
    "gates": {
      "G1": { "passed": true, "ts": "2026-06-15T11:35:00Z" }
    },
    "divergences": [],
    "snapshots": []
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
| 新增 divergence  | 追加一行到 `$TASK_DIR/artifacts/divergences.jsonl`            |
| divergence 确认  | 读取 divergences.jsonl → 更新对应行的 userApproved 字段       |
| 任务完成+归档    | status = "completed", completed_at/archived_at = now（由 scripts/ace-done.py 一步完成）|

---

## 路径推导（同名耦合）

`changeName` 是唯一的跨双根关联 key，无需存储冗余链接字段：

| 需求 | 推导方式 |
|------|---------|
| `$CHANGE_DIR` | `openspec/changes/{changeName}/` |
| `$TASK_DIR` | `.ace/tasks/{changeName}/` |
| `$INPUT_DIR` | `.ace/tasks/{changeName}/input/`（spechub 特有） |
| 归档 change 路径 | `glob: openspec/changes/archive/*-{changeName}/` |
| 归档 ACE 任务路径 | `glob: .ace/tasks/archive/*-{changeName}/` |

---

## 兼容性说明

旧版 spechub state.json 使用顶层字段（`reqId`, `currentPhase`, `phases`, `gates`, `divergences`）而非嵌套在 `spechub` 块内。
恢复协议应兼容两种格式：优先读 `state.spechub.reqId`，回退读 `state.reqId`。
