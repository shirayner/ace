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

---

## 输入适配

### 前置检查

- `openspec/` 目录存在 — 否则提示 `npx @fission-ai/openspec@1.2.0 init`
- `.claude/project-profile.md` 存在 — 否则提示先运行 `/ace:init`

### Phase 0: Select + Pull（需求获取）

**动作**：
1. `git remote -v` → 获取 `gitRemoteUrl`
2. 若无 `requirementId`：
   ```bash
   python3 scripts/spechub-pull-bundle.py --inbox <gitRemoteUrl>
   ```
   → AskUserQuestion 让用户选择需求
3. 拉取产物：
   ```bash
   python3 scripts/spechub-pull-bundle.py <reqId> <gitRemoteUrl> <repoRoot>
   ```
4. 产物写入 `spechub/{reqId}/artifacts/` + `manifest.json`

**脚本路径**：`scripts/spechub-pull-bundle.py`（相对于本 skill 目录）

**错误处理**：
- Exit 1: HTTP/网络错误 → 报错终止
- Exit 2: 响应解析失败 → 报错终止
- Exit 3: 业务错误（REQUIREMENT_NOT_FOUND / NO_PROJECT_MATCH / ARTIFACTS_INCOMPLETE）→ 报错终止

### Phase 0.5: Understand + G0（深度理解）

**目的**：形成对需求的全面理解，为引擎提供高质量上下文。

**动作**：
1. Read `.claude/project-profile.md` → 提取架构分层、中间件使用表
2. Read `spechub/{reqId}/artifacts/` 全部产物
3. 分析产出：
   - 业务目标一句话
   - 改动范围（结合 profile 架构分层定位目标层）
   - `infrastructureFootprint` 识别：
     - `existing`：profile "中间件使用"表（自动填充）
     - `newlyRequired`：从产物推断的新中间件
     - `effective`：existing∩relevant ∪ newlyRequired
   - 产物与现有系统的冲突点 / 歧义 / 遗漏

**G0 门禁**：

<HARD-GATE id="G0" phase="understand">
**何时**: 进入引擎（Phase 1）之前
**条件**: AskUserQuestion 展示理解摘要 + infrastructureFootprint + 用户确认
**无证据**: 禁止进入引擎
</HARD-GATE>

### Context 准备（交付引擎）

G0 通过后，以下信息已存在于对话上下文中，引擎可直接使用：
- **userRequest**：manifest.title + 确认的理解摘要
- **artifacts**：`spechub/{reqId}/artifacts/`（prd.md, architecture.md, contracts/, proposal.md 等）
- **profile**：`.claude/project-profile.md`
- **footprint**：`infrastructureFootprint` 结构（含 effective）
- **playbooks**：`effective` 中为 true 的中间件 → `../../shared/playbooks/{mw}.md`

---

## 执行

Read `../../shared/spec-engine.md` — 按通用引擎 Phase 1-4 执行。

引擎注入增强（由上下文中已存在的信息自动触发）：
- **Phase 1/2 澄清**：产物作为澄清背景
- **Phase 2 设计**：playbook 决策树辅助技术选型
- **Phase 3 实现**：playbook 骨架 + profile 项目模式 = 实现指导

---

## 输出适配

引擎 Phase 4 (Archive) 完成后执行以下步骤：

### 1. Handoff Check（交付自检）

1. `git diff` 对照 proposal "涉及文件" 清单 — 是否有遗漏/超出
2. 对照 profile 编码约定检查生成代码一致性
3. 输出自检摘要
4. 若有违规 → AskUserQuestion 确认继续

### 2. Git 操作

```bash
# 创建 feature 分支
git checkout -b feature/spechub-{reqId}-<slug>

# 提交
git add -A
git commit -m "feat(spechub-{reqId}): <需求标题简述>"

# 推送
git push -u origin feature/spechub-{reqId}-<slug>
```

### 3. SpecHub 上报

```bash
python3 scripts/spechub-archive-report.py <reqId> <gitRemoteUrl> \
  --branch <branchName> \
  --commit <commitHash> \
  --decisions <design decisions markdown>
```

**脚本路径**：`scripts/spechub-archive-report.py`（相对于本 skill 目录）

**输出**：archiveRecordId + requirementStatus 更新确认

---

## 恢复

用户说"继续"时：
1. Glob `spechub/*/manifest.json` → 找到活跃的 reqId
2. Read manifest.json → `currentPhase` + `completedGates`
3. 验证前置产物存在性：
   - `currentPhase=design` 但 `proposal.md` 不存在 → 回退 Phase 1
   - `currentPhase=apply` 但 `design.md` 不存在 → 回退 Phase 2
4. 从断点 Phase 继续引擎执行

---

## 运行时规则

- **惊讶测试**: 决策让用户惊讶 → 暂停 AskUserQuestion
- **进度心跳**: Phase 切换报告 / 5+ 工具调用插入说明 / 偏离立即告知
- **经验进化**: 引擎内完成（Phase 4.3）
