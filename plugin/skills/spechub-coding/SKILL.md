---
name: spechub-coding
description: |
  SpecHub 产物驱动的规范编码。当用户需要基于 SpecHub 平台产物进行本地编码时触发。
  适用于：用户提供 requirementId 或从 SpecHub inbox 选择需求后，基于平台产物完成编码。
  前提：项目中已有 openspec/ 目录（由 OpenSpec CLI 初始化）+ .claude/project-profile.md（由 /ace:init 生成）。

  DO NOT TRIGGER: 无平台产物的纯本地开发；单文件 bug 修复（→ 直接 Edit）；
  纯探索/学习（→ auto-goal）；代码审查（→ code-review）；写测试（→ ut）。
---
# SpecHub-Coding — 平台产物驱动的规范编码

核心信念：**产物是 AI 生成的输入，可能有错。本地核心价值 = 质量把关 + 差异记录 + 双向归档。**

---

## 前置检查

1. `openspec/` 目录存在 — 否则提示 `npx @fission-ai/openspec init`
2. `.claude/project-profile.md` 存在 — 否则提示先运行 `/ace:init`

---

## 状态机

| Phase      | 进入条件       | 产出                                                   | 退出 Gate |
| ---------- | -------------- | ------------------------------------------------------ | --------- |
| PULL       | 用户触发       | artifacts/ + manifest.json                             | — (auto) |
| COMPREHEND | pull.done      | comprehension.md + inventory + readiness-manifest.json | G0        |
| READINESS  | G0 passed      | readiness-check.md                                     | G1        |
| DESIGN     | G1 passed      | proposal.md + design.md + tasks.md (via OpenSpec)      | G2        |
| IMPLEMENT  | G2 passed      | 代码实现 + tasks.md 勾选                               | — (auto) |
| VERIFY     | implement.done | handoff-check.md                                       | G3 (auto) |
| ARCHIVE    | G3 passed      | git + openspec archive + spechub archive               | DONE      |

---

## 执行协议

```
1. Read spechub/{reqId}/state.json → currentPhase
2. Read references/phases/{currentPhase}.md → 按指令执行
3. 执行完毕 → 更新 state.json
4. 检查 Gate 条件 → 通过则推进到下一 Phase
```

**每进入一个 Phase 必须 Read 对应的 reference 文件。不可跳过。**

---

## Gate 定义

### G0 — 需求理解确认

<HARD-GATE>
**位置**: COMPREHEND → READINESS  
**条件**: AskUserQuestion 展示理解摘要 + Scope 裁决 + 差异清单，用户确认  
**格式**: Read `references/gate-formats.md` §G0  
**通过动作**: state.json.gates.G0.passed = true
</HARD-GATE>

### G1 — 基础设施 Ready 确认

<HARD-GATE>
**位置**: READINESS → DESIGN  
**条件**: 
- 无 BLOCKED → 自动通过（不需要 AskUserQuestion）
- 有 BLOCKED → AskUserQuestion：补全 / 跳过（记录 divergence） / 终止  
**通过动作**: state.json.gates.G1.passed = true
</HARD-GATE>

### G2 — 技术方案确认

<HARD-GATE>
**位置**: DESIGN → IMPLEMENT  
**条件**: AskUserQuestion 展示决策清单 + 任务清单 + 平台偏离，用户确认  
**格式**: Read `references/gate-formats.md` §G2  
**通过动作**: state.json.gates.G2.passed = true
</HARD-GATE>

### G3 — 验证通过（自动 Gate）

**位置**: VERIFY → ARCHIVE
**条件**: 编译通过 + 测试通过 + handoff-check.md 存在
**通过动作**: 自动进入 ARCHIVE

---

## 恢复协议

用户说"继续"时：

```
1. Read spechub/.active → reqId（不存在 = 无活跃需求，提示重新开始）
2. Read spechub/{reqId}/state.json → currentPhase + phases[].outputs
3. 验证当前 Phase 的前置产出都存在：
   | Phase      | 必须存在                                          |
   |------------|--------------------------------------------------|
   | comprehend | artifacts/, manifest.json                         |
   | readiness  | comprehension.md, artifact-inventory.json, readiness-manifest.json |
   | design     | readiness-check.md                                |
   | implement  | openspec/changes/{slug}/design.md, tasks.md       |
   | verify     | 代码变更（git diff 非空）                          |
   | archive    | handoff-check.md                                  |
4. 前置存在 → 继续当前 Phase；缺失 → 回退到产出该文件的 Phase
5. Read references/phases/{currentPhase}.md → 执行
```

---

## 运行时规则

- **惊讶测试**: 决策让用户惊讶 → 暂停 AskUserQuestion
- **进度心跳**: Phase 切换报告 / 5+ 工具调用插入说明 / 偏离立即告知
- **Divergence 记录**: 每个与产物的差异 → state.json.divergences[]，最终驱动 SpecHub decisions 字段
- **Scope 守护**: 实现过程中发现需要 Scope Out 功能点的代码 → 停下确认

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
