# Phase: READINESS — 基础设施准备度校验

## 职责
验证所需中间件/服务是否已就位。**本 Phase 是机械执行**——所有"判断"已在 COMPREHEND 阶段完成。

## 输入
- `spechub/{reqId}/readiness-manifest.json` — 动态校验实例（COMPREHEND 产出）
- `references/readiness-schema.json` — 静态校验规则定义

## 产出
- `spechub/{reqId}/readiness-check.md`
- state.json 更新

---

## 执行步骤

### 1. 读取 Manifest
Read `spechub/{reqId}/readiness-manifest.json` → `checks[]`

### 2. 补全缺失参数

收集所有 check 中的 `paramGaps`（非空的）：
- 若存在 paramGaps → AskUserQuestion 批量展示所有缺失参数，一次性收集
- 展示格式：
  ```
  以下中间件校验需要补全参数：
  | # | 中间件 | 描述 | 缺失参数 |
  |---|--------|------|---------|
  | RC-002 | SOA 依赖 | 积分查询接口 | mavenGroupId, mavenArtifactId, mavenVersion |
  | RC-003 | DB 新表 | 等级变更记录表 | ddl |
  ```
- 用户补全后 → 更新 readiness-manifest.json 的对应 params + 清空 paramGaps

### 3. 执行校验

对每个 check：

```
schema = readiness-schema.json.checkTypes[check.type]
for step in schema.checkSteps:
  if step.skipIf 条件满足 → skip
  if step.tool == "manual_confirm" → 加入 manual_batch
  if step.tool == "param_check" → 本地逻辑判断
  else → 调用对应 MCP 工具（并行执行所有 MCP 调用）
```

**并行规则**：所有 MCP 工具调用（非 manual_confirm）在单条 response 中并行执行。

### 4. 处理人工确认

将所有 `manual_confirm` 类型合并为一个 AskUserQuestion：
```
以下中间件需要人工确认：
| # | 类型 | 问题 |
|---|------|------|
| RC-004 | QMQ | topic 'member.grade.change.event' 是否已注册？ |
| RC-006 | QSchedule | 任务 'gradeExpirationJob' 是否已创建？ |
```
选项：对每个可选 "已就绪" / "实现阶段处理" / "未就绪"

### 5. 聚合结果

对每个 check 标注最终状态：
- ✅ READY — 校验通过
- 🟡 WARN — 不阻塞（createDuringImpl=true 或用户选择"实现阶段处理"）
- 🔴 BLOCKED — 必须解决
- 🔵 MANUAL — 人工已确认就绪

### 6. 产出

Write `spechub/{reqId}/readiness-check.md`：
```markdown
# Infrastructure Readiness Check — {title}

## 校验结果
| # | ID | 中间件 | 资源 | 校验方式 | 状态 | 详情 |
|---|----|----- --|------|---------|------|------|

## 🔴 BLOCKED 补全清单（如有）
| # | 缺失项 | 需要的 Action | 负责方 |

## 结论
- BLOCKED: {N} 项
- WARN: {N} 项
- READY: {N} 项
- MANUAL: {N} 项
```

### 7. G1 判定

- **无 BLOCKED** → 自动通过 G1，更新 state.json，进入 DESIGN
- **有 BLOCKED** → AskUserQuestion：
  - "已补全，重新校验" → 回到 Step 3
  - "跳过阻塞项（我负责）" → 记录 divergence（type: infra_override），通过 G1
  - "终止本次需求" → 停止

### 8. 更新状态

state.json：
```json
{
  "currentPhase": "design",
  "phases": { "readiness": { "status": "done", "ts": "{ISO}", "outputs": ["readiness-check.md"] } },
  "gates": { "G1": { "passed": true, "ts": "{ISO}" } }
}
```
