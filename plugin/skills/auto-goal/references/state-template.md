# 状态文件模板

## 完整状态文件（≥10 步任务）

创建路径：`.tasks/auto-goal-{id}/state.md`

```markdown
---
status: in-progress
last-updated: {timestamp}
---

## 目标与完成标准
[用户确认的目标]
- [ ] 可测试的完成标准 1
- [ ] 可测试的完成标准 2

## 进度
### Phase 1: {name} [done]
### Phase 2: {name} [active]
- [x] 已完成子任务
- [ ] → 当前进行中  ⟂
- [ ] 待做子任务  ⟂
- [ ] 依赖项 (depends: 上两项)
### Phase 3: {name} [pending]
### Phase Final: 收尾 [pending]
- [ ] 经验进化（如有新发现）
- [ ] 交付结果

## 已修改文件

## 下一步

## 活跃风险与未确认假设

## Tier 2 索引
| 文件 | 摘要 | 条目数 |
|------|------|--------|
```

**≤40 行原则**：state.md 是索引，不是文档。超出时移入 Tier 2。

---

## 轻量 checkpoint（6-9 步任务）

同样创建 `.tasks/auto-goal-{id}/state.md`，但只需：

```markdown
---
status: in-progress
last-updated: {timestamp}
---

## 目标
[一句话目标]

## 进度
- [x] 已完成
- [ ] → 当前
- [ ] 待做

## 下一步
```

---

## Tier 2 文件（按需创建）

```
.tasks/auto-goal-{id}/
├── state.md       # Tier 1：核心状态索引
├── context.md     # Tier 2：世界模型详情
├── decisions.md   # Tier 2：决策日志
└── reflections.md # Tier 2：反思日志
```

### context.md
- 环境上下文（技术栈、项目结构发现）
- 约束空间（不可行路径、硬限制）
- 信念状态：✓已验证 / ~假设 / ?待验

### decisions.md
- 每条：决策 + 理由 + 被排除的替代方案
- 格式：`### D{n}: {决策标题}` + 正文

### reflections.md
- 失败根因 + 揭示的错误假设 + 策略调整
- 格式：`### R{n}: {事件}` + 分析

---

## 并行标注约定

在 state.md 进度中：
- `⟂` — 该任务可与同级其他 `⟂` 任务并行
- `(depends: X, Y)` — 该任务依赖 X 和 Y 完成后才能开始
