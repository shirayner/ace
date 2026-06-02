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
| `blocker` | 阻止流程继续 | 必须立即解决 |
| `significant` | 不阻塞但影响方案理解 | 记录 + 批量确认 + 上报 |
| `minor` | 细微差异 | 自动吸收，仅记录，不上报 |

---

## 自动分级规则（implementation_drift 专用）

IMPLEMENT 阶段的偏离检测不再逐个中断用户，而是按以下规则自动分级处理：

### AUTO_ABSORB（自动吸收，不中断）

**条件**（满足所有）：
- 不改变对外接口签名（方法名、参数类型、返回类型不变）
- 不影响其他未完成 task 的前提假设
- 变更可逆（回退成本低）

**典型场景**：
- 内部实现算法选择不同（如用 Stream 代替 for 循环）
- 方法内部变量命名微调
- 辅助 private 方法的拆分方式不同
- 类型精确化（如 `List` → `ArrayList`）
- 异常处理方式微调（不影响对外契约）

**处理**：记录到 state.json（`autoAbsorbed: true`）→ 继续下一个 task

### BATCH_REPORT（批量汇报，VERIFY 后统一展示）

**条件**（满足任一）：
- 改变了方法签名（参数增减、返回类型变更）
- 替换了设计中指定的依赖
- 调整了流程顺序
- 新增了 design.md 未规划的辅助类/接口

**但同时**：
- 不影响其他未完成 task 的输入假设（签名/依赖）
- 不构成 scope 蠕动

**处理**：记录到 state.json（`batchDeferred: true`）→ 继续下一个 task → VERIFY 完成后在 G3 最终确认中统一展示

### IMMEDIATE_ESCALATE（立即升级，中断用户）

**条件**（满足任一 = 立即升级）：
- **scope 蠕动**：实现中发现需要 Scope Out 功能的代码
- **架构模式偏离**：改变分层方向、引入 design.md 未规划的跨模块依赖
- **前提失效**：当前偏离导致后续 task 的输入假设不再成立
- **累积阈值**：IMPLEMENT 阶段累计 ≥2 个 IMMEDIATE_ESCALATE 偏离 → 自动建议回退 DESIGN

**处理**：立即 AskUserQuestion → 用户决策（接受/回退/re-spec）

---

## 分级处理的质量保障

**为什么 AUTO_ABSORB 不会导致质量下降？**
1. 编译门控（COMPILE GATE）仍然验证接口兼容性
2. 测试门控（TEST GATE）仍然验证行为正确性
3. VERIFY 阶段的全量回归测试捕获跨 task 集成问题
4. 最终确认时用户看到完整偏离列表（延迟审查 ≠ 跳过审查）

**为什么 BATCH_REPORT 优于逐个确认？**
1. 用户有全局视角：一次看到所有偏离，可识别系统性模式
2. 避免决策疲劳：集中决策 vs 碎片化决策
3. 每个偏离在批量展示时有上下文对比（vs 孤立判断）

---

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
  "approvedAt": "2026-05-29T14:00:00Z",
  "autoAbsorbed": false,
  "batchDeferred": false
}
```

**新增字段说明**：
- `autoAbsorbed: true` — 该偏离被自动吸收（minor 级别，未中断用户）
- `batchDeferred: true` — 该偏离被延迟到 VERIFY 后批量确认（significant 级别）
- 两者均为 false = 立即升级处理（blocker 级别）或非 implementation_drift 类型

## 生命周期

```
产生（Phase N 发现差异）
  → 分级判定（AUTO_ABSORB / BATCH_REPORT / IMMEDIATE_ESCALATE）
  → 记录到 state.json.divergences[]
  → 处理：
    ├─ AUTO_ABSORB: autoAbsorbed=true，不中断，最终确认时展示
    ├─ BATCH_REPORT: batchDeferred=true，VERIFY 后 G3 统一确认
    └─ IMMEDIATE_ESCALATE: 立即 AskUserQuestion
  → G3 最终确认（用户确认所有 significant 偏离）→ userApproved=true
  → ARCHIVE 阶段聚合为 decisions.md
  → 上报 SpecHub（decisions 字段）
  → 平台侧可据此更新知识库/调优产物生成质量
```

## 聚合规则（ARCHIVE 阶段使用）

1. 过滤：排除 severity="minor"（autoAbsorbed 的不上报）
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
- `implementation_drift`：标注关联的设计决策 D{N} + 处理方式（auto/batch/escalate）
- 无 divergences 时：decisions = "无偏离，完全按平台产物实现"
