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

**架构**：输入适配 → 通用引擎（spec-engine.md）→ 输出适配

---

## 前置检查

进入任何阶段前，验证：
- `openspec/` 目录存在 → 否则提示 `npx @fission-ai/openspec@1.2.0 init`
- `.claude/project-profile.md` 存在 → 否则提示 `/ace:init`

---

## Phase 0: 需求获取

**目的**：从 SpecHub 拉取产物到本地。

1. `git remote -v` → 获取 `gitRemoteUrl`
2. 若无 `requirementId`：运行 inbox 脚本让用户选择
3. 运行 pull-bundle 脚本拉取产物到 `spechub/{reqId}/artifacts/`

**脚本位置**：`scripts/spechub-pull-bundle.py`
**接口契约**：Read `references/api-contract.md`（含错误码与处理策略）

---

## Phase 0.5: 深度理解 → G0 对齐

**目的**：形成全面理解，为引擎提供高质量上下文。

1. Read `.claude/project-profile.md` → 架构分层 + 中间件使用表
2. Read `spechub/{reqId}/artifacts/` 全部产物
3. 分析产出：
   - **业务目标**（一句话）
   - **改动范围**（结合 profile 定位目标层）
   - **infrastructureFootprint**：
     - `existing`：profile 中间件表自动填充
     - `newlyRequired`：从产物推断（DDL→dal, 消息→qmq, 缓存→credis...）
     - `effective`：existing∩relevant ∪ newlyRequired
   - **冲突点/歧义/遗漏**

<HARD-GATE id="G0" phase="understand">
**何时**: 进入引擎（Phase 1）之前
**条件**: AskUserQuestion 展示理解摘要 + infrastructureFootprint + 用户确认
**无证据**: 禁止进入引擎、禁止调用 openspec new
</HARD-GATE>

**G0 展示格式**：
```
业务目标: {一句话}
改动范围: {定位到架构层}
基础设施足迹:
  existing: {dal, soa, qconfig, ...}
  newlyRequired: {qmq, credis, ...}
  effective: {本次涉及的全部中间件}
识别的问题: {冲突/歧义/遗漏列表}
```

---

## 引擎执行（Phase 1-4）

G0 通过后，Read `../../shared/spec-engine.md` — 执行通用 SpecCoding 引擎。

### 上下文注入（引擎自动消费）

| 上下文项 | 来源 | 引擎阶段 |
|----------|------|----------|
| userRequest | manifest.title + G0 确认摘要 | Phase 1 澄清 |
| artifacts | `spechub/{reqId}/artifacts/` | Phase 1-2（需求/设计背景） |
| profile | `.claude/project-profile.md` | Phase 2-3（技术约束） |
| footprint | G0 确认的 infrastructureFootprint | Phase 2-3（playbook 激活） |
| playbooks | effective 中间件 → `../../shared/playbooks/{mw}.md` | Phase 2-3 |

### 引擎如何使用产物

- Phase 1：产物 proposal 作为需求基础（但需独立验证和规范化，非直接复制）
- Phase 2：产物 architecture + contracts 作为设计约束（需本地化适配）
- Phase 3：playbook 骨架 + profile 模式 = 实现指导

---

## 输出适配（引擎 Phase 4 完成后）

### Step 1: 交付自检

- `git diff --stat` 对照 proposal 涉及文件清单 → 遗漏警告 / 超范围解释
- 对照 profile 编码约定检查一致性
- 严重违规 → AskUserQuestion 确认

### Step 2: Git 提交

创建 feature 分支 `feature/spechub-{reqId}-<slug>`，暂存 openspec/ + 业务代码，提交信息包含 requirementId 和关键决策摘要。不 push 到 main/master。

### Step 3: SpecHub 上报

运行 `scripts/spechub-archive-report.py` 上报归档结果。失败不阻塞（Git 已提交，上报可稍后重试）。

**完成报告**：
```
✅ SpecHub Coding 完成
分支: feature/spechub-{reqId}-<slug>
提交: {commitHash}
上报: archiveRecordId = {id}
下一步建议: 创建 Pull Request
```

---

## 恢复协议

用户说"继续"时：
1. 检测 `spechub/` 下活跃的 reqId
2. 读取 `spechub/{reqId}/manifest.json` → currentPhase + completedGates
3. 验证前置产物存在性（缺失则回退）
4. 从断点 phase 继续

每阶段完成后更新 manifest.json（结构见 `references/api-contract.md`）。

---

## 运行时规则

- **惊讶测试**：决策让用户惊讶 → 暂停 AskUserQuestion
- **进度心跳**：Phase 切换报告 / 5+ 工具调用插入说明 / 方向变化立即告知
- **经验进化**：交付后 Read `../../shared/experience-protocol.md`
