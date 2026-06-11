# State Schema — state.json 完整定义

## 文件位置
`.ace/tasks/{changeName}/state.json`

## 完整结构

```json
{
  "type": "spec",
  "reqId": 1450,
  "title": "黑钻升降保级规则",
  "currentPhase": "design",
  "changeName": "grade-retention-rules",
  "openspecChange": "grade-retention-rules",
  "phases": {
    "pull":       { "status": "done|pending", "ts": "ISO", "outputs": ["manifest.json", "artifacts/"] },
    "comprehend": { "status": "done|pending|in_progress", "ts": "ISO", "outputs": ["comprehension.md", "artifact-inventory.json", "readiness-manifest.json"] },
    "readiness":  { "status": "done|pending|in_progress", "ts": "ISO", "outputs": ["readiness-check.md"], "blockers": [] },
    "design":     { "status": "done|pending|in_progress", "ts": "ISO", "outputs": ["proposal.md", "design.md", "tasks.md"] },
    "implement":  { "status": "done|pending|in_progress", "ts": "ISO", "outputs": ["tasks.md (all checked)"] },
    "verify":     { "status": "done|pending|in_progress", "ts": "ISO", "outputs": ["handoff-check.md"] },
    "archive":    { "status": "done|pending|in_progress", "ts": "ISO", "outputs": ["decisions.md", "git branch", "openspec archive", "spechub archive"] }
  },
  "gates": {
    "G0": { "passed": true, "ts": "ISO", "scopeDecision": { "in": [...], "out": [...] } },
    "G1": { "passed": true, "ts": "ISO" },
    "G2": { "passed": true, "ts": "ISO" },
    "G3": { "passed": true, "ts": "ISO" }
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
```

## 状态转移规则

| 事件 | 动作 |
|------|------|
| Phase 开始 | phases[phase].status = "in_progress" |
| Phase 完成 | phases[phase].status = "done", phases[phase].ts = now |
| Gate 通过 | gates[G].passed = true, currentPhase = nextPhase |
| 新增 divergence | divergences.push(newDiv) |
| divergence 确认 | divergences[i].userApproved = true, approvedAt = now |

## .active-spechub 文件

`.ace/tasks/.active-spechub` — 内容仅为 reqId 字符串，表示当前活跃需求。
- PULL 阶段创建
- ARCHIVE 阶段删除
- 恢复时读取以定位活跃需求
