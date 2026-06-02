# Phase: DESIGN — 技术方案

## 职责
生成 proposal + design + tasks（通过 OpenSpec），形成可追溯的技术方案。

## 输入
- `spechub/{reqId}/comprehension.md` — **核心输入：修正后理解 + 代码插入点详情**
- `spechub/{reqId}/readiness-check.md` — 中间件准备状态
- `.claude/project-profile.md` — 项目编码约定
- G0 确认的 Scope 裁决

## Context Budget 规则 [HARD RULE]

```
⛔ 禁止在 DESIGN 阶段重新探索代码（派 Agent 读项目文件）
✅ 所有代码定位信息从 comprehension.md §代码插入点详情 获取
✅ 如需更多详情 → Read spechub/{reqId}/analysis/d2-verification.md 的特定 section
✅ 如需架构参考 → Read spechub/{reqId}/analysis/d3-architecture.md
```

**理由**：COMPREHEND 阶段已完成代码验证和定位，DESIGN 不应重复此工作。代码插入点信息已包含文件路径、类名、方法名、行号、扩展方式——足够做技术设计。

## 产出
- `openspec/changes/{slug}/proposal.md`
- `openspec/changes/{slug}/design.md`
- `openspec/changes/{slug}/tasks.md`
- state.json 更新（含 changeName）

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

### 6. 进入 G2

Read `references/gate-formats.md` §G2，按格式展示：
- 决策清单摘要
- 任务清单
- 与平台产物的设计偏离（新增 divergences）

→ AskUserQuestion 确认

### 7. 更新状态

G2 通过后：
```json
{
  "currentPhase": "implement",
  "phases": { "design": { "status": "done", "ts": "{ISO}", "outputs": ["proposal.md", "design.md", "tasks.md"] } },
  "gates": { "G2": { "passed": true, "ts": "{ISO}" } },
  "openspecChange": "{slug}"
}
```
