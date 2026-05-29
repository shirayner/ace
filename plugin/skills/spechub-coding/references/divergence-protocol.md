# Divergence Protocol — 差异管理协议

## 核心理念
差异是预期产物，不是错误。平台产物是 AI 生成的初版，本地实现基于代码事实做修正——修正的记录就是 divergence。

---

## 差异分类

| 类型 | 含义 | 何时产生 | 上报 SpecHub |
|------|------|---------|-------------|
| `artifact_error` | 产物声明与代码事实矛盾 | COMPREHEND | ✅ |
| `design_choice` | 本地方案主动偏离平台建议 | DESIGN | ✅ |
| `scope_change` | Scope 裁减或新增 | COMPREHEND (G0) | ✅ |
| `implementation_drift` | 实际代码偏离 design.md | IMPLEMENT | ✅（仅 significant） |
| `infra_override` | 跳过中间件校验阻塞 | READINESS | ✅ |

## 严重度

| 级别 | 定义 | 影响 |
|------|------|------|
| `blocker` | 阻止流程继续 | 必须解决 |
| `significant` | 不阻塞但影响方案理解 | 记录 + 上报 |
| `minor` | 细微差异 | 仅记录，不上报 |

## 记录格式

```json
{
  "id": "DIV-{seq}",
  "type": "artifact_error",
  "severity": "significant",
  "phase": "comprehend",
  "category": "技术选型",
  "expected": "新建独立降级 Job",
  "actual": "扩展现有等级变更 Job",
  "reason": "代码验证发现 MembershipExpirationJob 已有等级判定逻辑，改动≤3方法",
  "evidence": "grep: src/.../MembershipExpirationJob.java:45",
  "userApproved": true,
  "approvedAt": "2026-05-29T14:00:00Z"
}
```

## 生命周期

```
产生（Phase N 发现差异）
  → 记录到 state.json.divergences[]（userApproved=false）
  → Gate 中展示给用户确认（userApproved=true）
  → ARCHIVE 阶段聚合为 decisions.md
  → 上报 SpecHub（decisions 字段）
  → 平台侧可据此更新知识库/调优产物生成质量
```

## 聚合规则（ARCHIVE 阶段使用）

1. 过滤：排除 severity="minor"
2. 按 category 分组
3. 每组输出格式：
```markdown
## {category}
- 平台方案: {expected}
- 本地实现: {actual}
- 理由: {reason}
```

## 特殊处理

- `infra_override`：标注"用户确认跳过，由用户负责后续补全"
- `implementation_drift`：标注关联的设计决策 D{N}
- 无 divergences 时：decisions = "无偏离，完全按平台产物实现"
