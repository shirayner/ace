---
name: spechub-coding
description: |
  SpecHub 产物驱动的规范编码。当用户需要基于 SpecHub 平台产物进行本地编码时触发。
  适用于：用户提供 requirementId 或从 SpecHub inbox 选择需求后，基于平台产物完成编码。
  前提：项目中已有 openspec/ 目录（由 OpenSpec CLI 初始化）+ .ace/project-profile.md（由 /ace:init 生成）。

  DO NOT TRIGGER: 无平台产物的纯本地开发；单文件 bug 修复（→ 直接 Edit）；
  纯探索/学习（→ auto-goal）；代码审查（→ code-review）；写测试（→ ut）。
---
# SpecHub-Coding — 平台产物驱动的规范编码

核心信念：**产物是 AI 生成的输入，可能有错。本地核心价值 = 质量把关 + 差异记录 + 双向归档。**

---

## 前置检查

1. `openspec/` 目录存在 — 否则提示 `openspec init`
2. `.ace/project-profile.md` 存在 — 否则**直接调用 `/ace:init` 生成**，完成后继续流程（不终止）

---

## 状态机

| Phase      | 进入条件       | 产出                                                   | 退出 Gate |
| ---------- | -------------- | ------------------------------------------------------ | --------- |
| PULL       | 用户触发       | artifacts/ + manifest.json                             | — (auto) |
| COMPREHEND | pull.done      | comprehension.md + inventory + readiness-manifest.json | G0        |
| READINESS  | G0 passed      | readiness-check.md                                     | G1        |
| DESIGN     | G1 passed      | proposal.md + design.md + tasks.md (via OpenSpec)      | G2        |
| IMPLEMENT  | G2 passed      | 代码实现 + 测试 + tasks.md 勾选（逐 task TDD 微循环） | — (auto) |
| VERIFY     | implement.done | handoff-check.md（全量回归确认）                      | G3 (auto) |
| ARCHIVE    | G3 passed      | git + openspec archive + spechub archive               | DONE      |

---

## 目录结构

```
$PROJECT_ROOT/
├── .ace/
│   ├── tasks/{changeName}/           # $TASK_DIR — ACE 状态与过程产物
│   │   ├── state.json                # 状态机（type: "spec"）
│   │   └── artifacts/                # ACE 过程产出物
│   │       ├── comprehension.md
│   │       ├── artifact-inventory.json
│   │       ├── readiness-manifest.json
│   │       ├── readiness-check.md
│   │       ├── handoff-check.md
│   │       ├── decisions.md
│   │       └── analysis/             # COMPREHEND Agent 并行分析产出
│   │           ├── d1-semantic.md
│   │           ├── d2-verification.md
│   │           ├── d3-architecture.md
│   │           ├── d4-infra-gaps.md
│   │           └── d5-simplification.md
│   ├── tasks/.active-spechub         # 当前活跃需求指针（reqId）
│   └── spechub/{reqId}/              # SpecHub 拉取的原始产物（脚本管理）
│       ├── manifest.json
│       └── artifacts/                # 原始平台产物
├── openspec/changes/{changeName}/    # $CHANGE_DIR — OpenSpec 标准产物
│   ├── proposal.md
│   ├── design.md
│   └── tasks.md
```

**变量约定**：
- `$TASK_DIR` = `$PROJECT_ROOT/.ace/tasks/{changeName}`
- `$CHANGE_DIR` = `$PROJECT_ROOT/openspec/changes/{changeName}`
- `$SPECHUB_DIR` = `$PROJECT_ROOT/.ace/spechub/{reqId}`
- `changeName` = slug（kebab-case 简写，如 `grade-retention-rules`）

---

## 执行协议

```
1. Read $TASK_DIR/state.json → currentPhase
2. Read references/phases/{currentPhase}.md → 按指令执行
3. 执行完毕 → 更新 state.json
4. 检查 Gate 条件 → 通过则推进到下一 Phase
```

**每进入一个 Phase 必须 Read 对应的 reference 文件。不可跳过。**

---

## 分级介入架构（Tiered Intervention）

人工介入级别基于**风险 × 置信度 × 争议度**动态决定，而非固定流程：

| Level | 名称 | 行为 | 适用条件 |
|-------|------|------|---------|
| 0 | 静默执行 | 自动完成，仅日志 | 零偏离 + 高置信度 + 纯机械操作 |
| 1 | 通知式前进 | 通知摘要 + 默认继续 + 保留回溯点 | 低偏离 + 高置信度 + 可逆 |
| 2 | 精简确认 | 仅展示 ≤5 项关键判断 + AskUserQuestion | 中偏离 OR 有真实选择需做 |
| 3 | 深度对齐 | 完整展示 + 讨论 + 确认 | 高偏离 + 低置信度 + 不可逆 |

**核心原则**：减少频次，提高单次质量。用户角色从"审批者"变为"监控者 + 关键决策者"。

---

## Gate 定义

### G0 — 需求理解确认（条件式）

<HARD-GATE>
**位置**: COMPREHEND → READINESS  
**级别决定**: 基于争议度评分（详见 `references/phases/comprehend.md` §Step C）

| 争议度 | 级别 | 行为 |
|--------|------|------|
| 0 分（零冲突零争议） | Level 1 | 通知式前进：一行摘要 + [查看详情][有异议?]，默认继续 |
| 1-4 分（少量冲突） | Level 2 | 精简确认：仅展示冲突项 + Scope 争议项，用户裁决 |
| >4 分（多冲突/高争议） | Level 3 | 完整 G0：当前完整流程 |

**通过动作**: state.json.gates.G0.passed = true  
**格式**: Read `references/gate-formats.md` §G0
</HARD-GATE>

### G1 — 基础设施 Ready 确认

<HARD-GATE>
**位置**: READINESS → DESIGN  
**条件**: 
- 无 BLOCKED → 自动通过（Level 0，不需要 AskUserQuestion）
- 有 BLOCKED → 按类型处理（详见 `references/phases/readiness.md` §G1 判定）
**通过动作**: state.json.gates.G1.passed = true
</HARD-GATE>

### G2 — 技术方案确认（条件式）

<HARD-GATE>
**位置**: DESIGN → IMPLEMENT  
**级别决定**: 基于方案确定性（详见 `references/phases/design.md` §G2 条件式判定）

| 确定性 | 级别 | 行为 |
|--------|------|------|
| HIGH（所有决策唯一解） | Level 1 | 通知式前进：决策摘要 + 任务列表 + [有异议?]，默认继续 |
| MEDIUM（1-2 个多选项决策） | Level 2 | 精简确认：仅展示多选项决策 + AI 推荐 |
| LOW（架构级偏离/多 divergence） | Level 3 | 完整 G2：当前完整流程 |

**通过动作**: state.json.gates.G2.passed = true  
**格式**: Read `references/gate-formats.md` §G2
</HARD-GATE>

### G3 — 最终确认（VERIFY → ARCHIVE）

**位置**: VERIFY → ARCHIVE  
**行为**: VERIFY 完成后展示**统一最终确认**（偏离摘要 + 测试结果 + 归档确认三合一）

| 条件 | 行为 |
|------|------|
| 编译✅ + 测试✅ + 无 significant 偏离 | Level 1：通知式前进 |
| 编译✅ + 测试✅ + 有 significant 偏离 | Level 2：展示偏离摘要 + [确认归档] |
| 有失败或违规 | Level 3：完整展示 + AskUserQuestion |

**通过动作**: 进入 ARCHIVE

---

## 恢复协议

用户说"继续"时：

```
1. Read .ace/tasks/.active-spechub → reqId（不存在 = 无活跃需求，提示重新开始）
2. 从 state.json 中获取 changeName，Read $TASK_DIR/state.json → currentPhase + phases[].outputs
3. 验证当前 Phase 的前置产出都存在：
   | Phase      | 必须存在                                                    |
   |------------|-------------------------------------------------------------|
   | comprehend | .ace/spechub/{reqId}/artifacts/, .ace/spechub/{reqId}/manifest.json   |
   | readiness  | $TASK_DIR/artifacts/comprehension.md, artifact-inventory.json, readiness-manifest.json |
   | design     | $TASK_DIR/artifacts/readiness-check.md                      |
   | implement  | $CHANGE_DIR/design.md, $CHANGE_DIR/tasks.md                 |
   | verify     | 代码变更（git diff 非空）                                    |
   | archive    | $TASK_DIR/artifacts/handoff-check.md                        |
4. 前置存在 → 继续当前 Phase；缺失 → 回退到产出该文件的 Phase
5. Read references/phases/{currentPhase}.md → 执行
```

---

## 运行时规则

- **惊讶测试**: 决策让用户惊讶 → 暂停 AskUserQuestion
- **进度心跳**: Phase 切换报告 / 5+ 工具调用插入说明 / blocker 偏离立即告知
- **Divergence 分级处理**: 偏离按严重度分级处理（详见 `references/divergence-protocol.md` §自动分级规则）：
  - minor → AUTO_ABSORB（记录 + 继续，不中断）
  - significant → BATCH_REPORT（累积到 VERIFY 后统一展示）
  - blocker → IMMEDIATE_ESCALATE（立即 AskUserQuestion）
- **Scope 守护**: 实现过程中发现需要 Scope Out 功能点的代码 → 停下确认（blocker 级别）
- **回溯点保留**: 每个 Level 1 通知式前进的节点，state.json 记录完整快照，用户可随时要求回溯

---

## Divergence（差异）概述

差异是贯穿全流程的一等公民，详见 `references/divergence-protocol.md`。

类型：artifact_error | design_choice | scope_change | implementation_drift | infra_override

生命周期：产生 → 记录 → Gate 确认 → ARCHIVE 聚合 → SpecHub decisions 字段上报

---

## 脚本路径

统一 CLI：`scripts/spechub-workflow.py`

```bash
# 列出 inbox 需求（无 reqId 时）
python3 {skillDir}/scripts/spechub-workflow.py inbox --repo-root {repoRoot}

# 前置检查 + 拉取产物 + 初始化状态（有 reqId 时）
python3 {skillDir}/scripts/spechub-workflow.py start {reqId} --repo-root {repoRoot}

# 归档：构建 decisions + 上报 SpecHub + 清理
python3 {skillDir}/scripts/spechub-workflow.py archive {reqId} --repo-root {repoRoot} \
  --branch {branchName} --commit {commitHash}
```

脚本职责：前置检查、git remote 获取、SpecHub API 调用、state.json 初始化/更新、divergences 聚合。
AI 职责：COMPREHEND（理解分析）、READINESS（MCP 校验）、DESIGN、IMPLEMENT、VERIFY。
