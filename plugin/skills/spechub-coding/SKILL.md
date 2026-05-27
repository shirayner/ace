---
name: spechub-coding
description: |
  SpecHub 产物驱动的规范编码。当用户需要基于 SpecHub 平台产物进行本地编码时触发。
  适用于：用户提供 requirementId 或从 SpecHub inbox 选择需求后，基于平台产物完成编码。
  前提：项目中已有 openspec/ 目录（由 OpenSpec CLI 初始化）+ .claude/project-profile.md（由 /ace:init 生成）。

  DO NOT TRIGGER: 无平台产物的纯本地开发（→ spec-coding）；单文件 bug 修复（→ 直接 Edit）；
  纯探索/学习（→ auto-goal）；代码审查（→ code-review）；写测试（→ ut）。
---
# SpecHub-Coding — 平台产物驱动的规范编码

核心信念：**SpecHub 产物是输入参考，Spec 是契约，Code 是兑现。** 平台产物不跳过澄清，规范化输出才可累积。

**三层架构**：输入适配 → 通用引擎（spec-engine.md）→ 输出适配

---

## ═══════════════════════════════════════
## 输入适配层
## ═══════════════════════════════════════

### 前置检查

进入任何阶段前，验证：
- `openspec/` 目录存在 → 否则提示 `npx @fission-ai/openspec@1.2.0 init`
- `.claude/project-profile.md` 存在 → 否则提示 `/ace:init`

---

### Phase 0: Select + Pull（需求获取）

**触发**：用户提供 `requirementId` 或指定从 inbox 选择

**动作**：
1. `git remote -v` → 获取 `gitRemoteUrl`
2. 若无 `requirementId`：
   ```bash
   python3 scripts/spechub-pull-bundle.py --inbox <gitRemoteUrl>
   ```
   → AskUserQuestion 让用户从列表选择
3. 拉取产物：
   ```bash
   python3 scripts/spechub-pull-bundle.py <reqId> <gitRemoteUrl> <repoRoot>
   ```
4. 写入 `spechub/{reqId}/artifacts/` + `manifest.json`

**错误处理**：
- Exit 1: HTTP/网络错误 → 报错终止，提示检查网络
- Exit 2: 响应解析失败 → 报错终止
- Exit 3: 业务错误 → 报告具体错误码（REQUIREMENT_NOT_FOUND / NO_PROJECT_MATCH / ARTIFACTS_INCOMPLETE）

---

### Phase 0.5: Understand + G0（深度理解）

**目的**：形成全面理解，为引擎提供高质量上下文。

**动作**：
1. Read `.claude/project-profile.md` → 提取架构分层 + 中间件使用表
2. Read `spechub/{reqId}/artifacts/` 全部产物（prd.md, architecture.md, proposal.md, contracts/）
3. 分析产出：
   - **业务目标**一句话
   - **改动范围**（结合 profile 架构分层定位目标层）
   - **infrastructureFootprint** 计算：
     - `existing`：profile "中间件使用"表自动填充
     - `newlyRequired`：从产物推断（DDL→dal, 消息设计→qmq, 缓存→credis...）
     - `effective`：existing∩relevant ∪ newlyRequired
   - **冲突点/歧义/遗漏**：产物与现有系统的不一致

<HARD-GATE id="G0" phase="understand">
**何时**: 进入引擎（Phase 1）之前
**条件**: AskUserQuestion 展示理解摘要 + infrastructureFootprint + 用户确认
**无证据**: 禁止进入引擎、禁止调用 openspec new
</HARD-GATE>

**G0 确认内容**（展示给用户）：
```
业务目标: {一句话}
改动范围: {定位到架构层}
基础设施足迹:
  existing: {dal, soa, qconfig, ...}
  newlyRequired: {qmq, credis, ...}
  effective: {本次涉及的全部中间件}
识别的问题: {冲突/歧义/遗漏列表}
```

用户可在此修正 footprint 或补充上下文。

---

### Context 准备（G0 通过后交付引擎）

G0 通过后，以下信息已存在于对话上下文中：
- **userRequest**：manifest.requirementTitle + 确认的理解摘要
- **artifacts**：`spechub/{reqId}/artifacts/` 路径（prd, architecture, contracts, proposal 等）
- **profile**：`.claude/project-profile.md`
- **footprint**：确认的 infrastructureFootprint
- **playbooks**：effective 中为 true 的中间件 → `../../shared/playbooks/{mw}.md`
- **dimensions**：`references/dimensions.md`
- **qualityCriteria**：`references/quality-criteria.md`

---

## ═══════════════════════════════════════
## 执行层（通用引擎委托）
## ═══════════════════════════════════════

Read `../../shared/spec-engine.md` — 执行通用 SpecCoding 引擎。

引擎将基于上下文中的信息，自动执行：
- **Phase 1 (Proposal)**：需求澄清 → G1 → 生成 proposal.md + delta specs
- **Phase 2 (Design)**：设计澄清 → G2 → 生成 design.md + tasks.md
- **Phase 3 (Apply)**：G3 → /opsx:apply + Playbook 注入 + 偏离检测
- **Phase 4 (Archive)**：Spec-Code 验证 → G4 → /opsx:archive

### 引擎注入增强（本 skill 提供的上下文如何被引擎使用）

| 引擎阶段 | 本 skill 提供的增强 |
|----------|-------------------|
| Phase 1/2 澄清 | 平台产物（prd/architecture/contracts）作为澄清背景知识 |
| Phase 1 生成 | 产物 proposal.md 作为需求基础（但需独立验证和规范化） |
| Phase 2 澄清 | effective playbook 决策树辅助技术选型 |
| Phase 2 生成 | 产物 architecture.md + contracts/ 作为设计约束 |
| Phase 3 apply | playbook 骨架 + profile 项目模式 = 实现指导 |

---

## ═══════════════════════════════════════
## 输出适配层
## ═══════════════════════════════════════

引擎 Phase 4 完成后（/opsx:archive 已执行），执行以下后处理：

---

### Step 1: Handoff Check（交付自检）

1. `git diff --stat` 对照 proposal 中"涉及文件"清单
   - 遗漏 → 警告
   - 超出范围 → 解释原因
2. 对照 profile 编码约定检查生成代码一致性
3. 输出自检摘要
4. 若有严重违规 → AskUserQuestion 确认继续或修复

---

### Step 2: Git 操作

```bash
# 创建 feature 分支
git checkout -b feature/spechub-{reqId}-<slug>

# 暂存变更（openspec/ + 业务代码）
git add openspec/ src/ <其他变更文件>

# 提交
git commit -m "feat(spechub-{reqId}): <需求标题简述>

Requirement: {reqId}
Decisions: {D1, D2... 摘要}

Co-Authored-By: Claude <noreply@anthropic.com>"

# 推送
git push -u origin feature/spechub-{reqId}-<slug>
```

**注意**：不要 push 到 main/master。仅创建 feature 分支。

---

### Step 3: SpecHub 上报

```bash
python3 scripts/spechub-archive-report.py <reqId> <gitRemoteUrl> \
  --branch <branchName> \
  --commit <commitHash> \
  --decisions <design.md 中 D1-DN 决策清单> \
  --operator <当前用户标识>
```

**错误处理**：
- Exit 2 (业务错误) → 重试一次
- 仍失败 → 报告错误但不阻塞（Git 已提交，上报可稍后重试）

**完成报告**（展示给用户）：
```
✅ SpecHub Coding 完成

分支: feature/spechub-{reqId}-<slug>
提交: {commitHash}
上报: archiveRecordId = {id}
状态: {requirementStatus}

下一步建议: 创建 Pull Request
```

---

## 恢复协议

用户说"继续"时：

1. **检测**：`spechub/` 目录下寻找活跃的 reqId
2. **读取**：`spechub/{reqId}/manifest.json` → 获取 currentPhase + completedGates
3. **验证**前置产物：
   - `currentPhase=design` 但 `openspec/changes/{name}/proposal.md` 不存在 → 回退 Phase 1
   - `currentPhase=apply` 但 `design.md` 不存在 → 回退 Phase 2
4. **恢复**：重新 Read 必要上下文 → 从断点 phase 继续

### 进度持久化

每个阶段完成后更新 `spechub/{reqId}/manifest.json`：
```json
{
  "requirementId": 12345,
  "requirementTitle": "...",
  "currentPhase": "design",
  "openspecChangeName": "spechub-12345-xxx",
  "infrastructureFootprint": { "existing": {...}, "newlyRequired": {...}, "effective": {...} },
  "completedGates": ["G0", "G1"]
}
```

---

## 运行时规则

- **惊讶测试**：决策让用户惊讶 → 暂停 AskUserQuestion
- **进度心跳**：Phase 切换报告 / 5+ 工具调用插入说明 / 方向变化立即告知
- **经验进化**：交付后检查触发条件 → Read `../../shared/experience-protocol.md`
