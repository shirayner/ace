# Phase: DESIGN — 技术方案

## 职责
生成 proposal + design + tasks（通过 OpenSpec），形成可追溯的技术方案。

## 输入
- `$TASK_DIR/artifacts/comprehension.md` — **核心输入：修正后理解 + 代码插入点详情**
- `$TASK_DIR/artifacts/readiness-check.md` — 中间件准备状态
- `.ace/project-profile.md` — 项目编码约定
- G0 确认的 Scope 裁决

## Context Budget 规则 [HARD RULE]

```
⛔ 禁止在 DESIGN 阶段重新探索代码（派 Agent 读项目文件）
✅ 所有代码定位信息从 $TASK_DIR/artifacts/comprehension.md §代码插入点详情 获取
✅ 如需更多详情 → Read $TASK_DIR/artifacts/analysis/d2-verification.md 的特定 section
✅ 如需架构参考 → Read $TASK_DIR/artifacts/analysis/d3-architecture.md
```

**理由**：COMPREHEND 阶段已完成代码验证和定位，DESIGN 不应重复此工作。代码插入点信息已包含文件路径、类名、方法名、行号、扩展方式——足够做技术设计。

## 产出
- `$CHANGE_DIR/proposal.md`
- `$CHANGE_DIR/design.md`
- `$CHANGE_DIR/tasks.md`
- `$TASK_DIR/state.json` 更新（含 changeName）

---

## 执行步骤

### 1. 创建 OpenSpec Change

```bash
openspec new change {slug} --description "{title}"
```

slug 规则：需求标题的 kebab-case 简写（如 `grade-retention-rules`）

### 2. 生成 Proposal

```bash
openspec instructions proposal --change {slug}
```

基于指令 + 以下输入生成 `proposal.md`：
- G0 确认的 Scope In 功能点（不含 Scope Out）
- comprehension.md 中的业务目标
- 验证结论中的修正方向（⚠️-conflict 项按修正方向写，非产物原文）

**Proposal 质量要求**：
- 问题陈述清晰（不是解决方案）
- 范围界定明确（与 G0 scopeDecision 一致）
- ≥2 个可测试验收条件
- Scope Out 的功能点不出现

### 3. 技术方案澄清

基于 artifacts/architecture.md + profile + readiness-check.md：

AskUserQuestion 确认关键技术决策（仅存在真实不确定性时）：
- 中间件选型（有多个可行方案时）
- 接口设计（契约定义的关键选择）
- 数据模型（表结构的关键决策）

**如果产物 + profile + 代码已足够确定方案 → 不追问，直接进入生成。**

### 4. 生成 Design + Tasks

```bash
openspec instructions design --change {slug}
```

生成 `design.md`：
- 决策清单：D1, D2, D3...（每条含：决策标题 / 选项对比 / 选择 / 理由 / 驱动需求）
- 接口契约引用
- 数据流描述

生成 `tasks.md`：
- 每 task 关联决策点（如 `→ D1, D3`）
- 拓扑顺序：DDL → DAO → SOA → QMQ → QConfig → QSchedule → Service → Test
- 每 task 有明确的"做完了"标准
- 每 task 标注测试策略：FULL_TDD / COMPILE_ONLY / SKIP_TEST
- FULL_TDD 类 task 附带测试用例方向提示（正常/异常/边界）
- 测试策略选择参照 `references/quality-criteria.md` §测试策略选择指南

### 5. 记录设计偏离

本地方案与平台产物建议的差异 → 记录 divergences：
```json
{
  "id": "DIV-{seq}",
  "type": "design_choice",
  "severity": "significant",
  "phase": "design",
  "category": "技术选型 | 架构决策 | 接口设计",
  "expected": "平台建议方案",
  "actual": "本地选择方案",
  "reason": "选择理由",
  "userApproved": false
}
```

### 6. G2 条件式判定

**G2 不再固定要求完整确认，而是根据方案确定性自动选择介入级别。**

#### 方案确定性评估

```
certainty = HIGH  # 默认

# 降级条件（任一触发 → 降级）
if count(divergences, type='design_choice', severity='significant') >= 2:
    certainty = LOW
if 存在跨模块架构变更:
    certainty = LOW
if count(决策点中有多个可行选项的) >= 3:
    certainty = LOW
elif count(决策点中有多个可行选项的) >= 1:
    certainty = MEDIUM

# 最终判定
if certainty == HIGH:
    所有决策点只有唯一解（profile + 代码约束决定）
    无新增 significant divergence
    tasks.md 中所有 task 可直接映射到 comprehension.md 功能点
```

#### 分流执行

**HIGH_CERTAINTY → Level 1：通知式前进**

```markdown
✅ 技术方案已生成，所有决策由约束唯一确定。

**决策摘要**: {N} 个决策点，均由项目约定/代码现状确定
**任务清单**: {M} 个 task（{TDD}个 FULL_TDD + {CO}个 COMPILE_ONLY + {ST}个 SKIP_TEST）
**偏离**: 无新增 design_choice

[查看 design.md] [查看 tasks.md] [有异议?]
```

行为：不阻塞，直接进入 IMPLEMENT。

---

**MEDIUM_CERTAINTY → Level 2：精简确认**

仅展示有多选项的决策点（其余自动采纳唯一解）：

```markdown
以下决策需要你确认（其余 {N-K} 个决策已由约束确定）：

| D# | 决策 | 选项 A | 选项 B | AI 推荐 | 推荐理由 |
|----|------|--------|--------|---------|---------|
| D3 | 缓存策略 | Redis | 本地缓存 | Redis | 已有 cluster |
```

AskUserQuestion 选项：
- "接受 AI 推荐" — 采纳所有推荐选项
- "需要调整" — 用户选择不同方案

---

**LOW_CERTAINTY → Level 3：完整 G2**

按原有格式展示（Read `references/gate-formats.md` §G2 Level 3）：
- 决策清单摘要
- 任务清单
- 新增 design_choice divergences

AskUserQuestion 选项：
- "确认，开始实现"
- "需要调整设计"
- "有技术问题需讨论"

---

### 7. 更新状态

G2 通过后（`$TASK_DIR/state.json`）：
```json
{
  "currentPhase": "implement",
  "phases": { "design": { "status": "done", "ts": "{ISO}", "outputs": ["proposal.md", "design.md", "tasks.md"] } },
  "gates": { "G2": { "passed": true, "ts": "{ISO}" } },
  "openspecChange": "{slug}"
}
```
