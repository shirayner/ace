# ace 开源项目最佳实践优化方案

> 分析日期: 2026-04-15
> 分析主题: 对标 GitHub 优秀开源项目，系统性优化 ace 项目的 README、CHANGELOG、贡献流程、项目治理等方面

## 1. 现状诊断

### 1.1 当前项目根目录文件结构

```
ace/
├── .gitignore          ✅ 已有
├── package.json        ✅ 已有
├── README.md           ⚠️  存在但质量不足
├── bin/                ✅ CLI 入口
├── src/                ✅ 核心代码
├── templates/          ✅ 安装模板
├── plugin/             ✅ Claude Code 插件
├── tests/              ✅ 测试（存在但不完善）
├── node_modules/       ✅ 依赖
├── tempdoc/            ⚠️  临时文档，不应存在于发布版本
├── .task/ .tasks/      ⚠️  任务状态（已 gitignore）
│
├── LICENSE             ❌ 缺失（package.json 声明 MIT 但无文件）
├── CHANGELOG.md        ❌ 缺失
├── CONTRIBUTING.md     ❌ 缺失
├── CODE_OF_CONDUCT.md  ❌ 缺失
├── SECURITY.md         ❌ 缺失
├── .editorconfig       ❌ 缺失
├── .nvmrc              ❌ 缺失
├── .github/            ❌ 缺失（无 CI、无 issue/PR 模板）
└── docs/               ❌ 缺失（无项目文档站点）
```

### 1.2 README 现状分析

| 维度 | 现状 | 标杆做法 | 差距 |
|------|------|----------|------|
| **开头 Hook** | "一条命令搭建你的 Claude Code 开发环境" — 有但缺少英文 | 一行英文 tagline + 中文翻译 | 缺少英文版本，无法吸引国际用户 |
| **视觉冲击** | 无 logo、无 badges、无终端录屏 | logo + badges + demo GIF | 完全缺失，第一印象弱 |
| **Why / 定位** | 未解释为什么需要 ace，直接跳到安装 | "问题→方案"叙事 + 与替代方案对比 | 没有回答"为什么用 ace" |
| **设计理念** | 完全缺失 | 核心设计决策和哲学 2-3 句 | 用户无法理解工具的核心价值观 |
| **Quick Start** | 有但混在详细文档中 | 3 行代码，30 秒内第一次成功 | 不够精炼 |
| **文档层次** | 全部堆在 README 中（147 行） | README 精简 + 链接到 docs 站 | README 过长，信噪比低 |
| **国际化** | 纯中文 | README.md(EN) + README.zh-CN.md | 阻碍国际传播 |

### 1.3 缺失项清单

| 类别 | 缺失项 | 影响 |
|------|--------|------|
| **信任信号** | 无 CI badge、无测试覆盖率、无 npm 版本 badge | 用户对质量缺乏信心 |
| **版本追踪** | 无 CHANGELOG | 用户不知道版本间改了什么 |
| **贡献门槛** | 无 CONTRIBUTING.md、无开发指南 | 想贡献的人不知从何入手 |
| **社区治理** | 无 CODE_OF_CONDUCT、无 SECURITY.md | 不符合开源社区规范 |
| **自动化** | 无 CI/CD、无自动发布、无 lint 检查 | 质量无法持续保障 |
| **编辑器一致性** | 无 .editorconfig | 贡献者代码风格不统一 |
| **Node 版本** | 无 .nvmrc | 贡献者可能使用不兼容版本 |

### 1.4 核心问题总结

**ace 当前是一个"能用的工具"，但还不是一个"开源项目"。** 差距集中在三个层面：

1. **营销层**：README 缺乏 "Landing Page" 思维，无法快速传达价值
2. **治理层**：缺少开源社区的标准基础设施（贡献指南、行为准则、版本记录）
3. **自动化层**：缺少 CI/CD，质量保障依赖人工


## 2. README 重写方案

### 2.1 核心理念转变

> **README 不是文档，是着陆页。** 它的目标是让访客在 10 秒内决定"值得一试"。

当前 README 采用"产品手册"模式：安装→命令→参数→内容列表。这在 npm 详情页上很有用，但在 GitHub 首页上，用户最先想知道的是"这东西解决什么问题"和"用起来有多简单"。

### 2.2 推荐结构

```
README.md (English, canonical)
├── 1. Name + Tagline + Badges          ← 10 秒 hook
├── 2. Demo (terminal recording)         ← 视觉冲击
├── 3. Why ace? / Motivation             ← 解决什么痛点
├── 4. Quick Start (3 行代码)            ← 30 秒第一次成功
├── 5. What You Get                      ← 核心价值概览
├── 6. Design Philosophy                 ← 区别于竞品的核心理念
├── 7. Documentation (link to docs/)     ← 详细内容不堆在 README
├── 8. Contributing                      ← 一句话 + 链接
└── 9. License                           ← MIT

README.zh-CN.md (Chinese mirror)
├── 与英文版结构完全一致
└── 顶部有 [English](README.md) | 中文 切换链接
```

### 2.3 各章节具体方案

#### 2.3.1 Name + Tagline + Badges

```markdown
<div align="center">

# ace

**One command to set up your Claude Code harness.**

一条命令，武装你的 Claude Code。

[![npm version](https://img.shields.io/npm/v/@shirayner/ace)](https://www.npmjs.com/package/@shirayner/ace)
[![license](https://img.shields.io/github/license/user/ace)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@shirayner/ace)](package.json)

</div>
```

关键原则：
- 英文一句话定位在最前面，国际用户首先看到
- 中文次之，作为补充
- Badges 只放 3 个核心信号：版本、许可证、Node 版本要求
- CI badge 等 CI 搭建完成后再加

#### 2.3.2 Demo

推荐使用 [VHS](https://github.com/charmbracelet/vhs) 或 asciinema 录制终端操作，展示：
1. `npm install -g @shirayner/ace`
2. `ace init`（交互选择角色和预设）
3. 安装完成的输出摘要

放在 tagline 下方，**这是转化率最高的位置**。

> 在 demo 制作前，可以先用一段 text-based 的"What it looks like"代替：
>
> ```
> $ ace init
> ? Your role: Fullstack Developer
> ? Preset: full
> ✔ core installed
> ✔ rules installed
> ✔ plugin installed (ace:auto-goal, ace:coding, ...)
> ✔ hookify installed
> Done! Your AI coding environment is ready.
> ```

#### 2.3.3 Why ace? / Motivation

采用"痛点→方案"叙事结构：

```markdown
## Why ace?

Claude Code is powerful out of the box — but configuring rules, skills,
safety guards, and memory templates by hand is tedious and error-prone.

**ace solves this in one command:**

- **Rules** — 7 cognitive and code-quality rules (deep thinking, clean code, ...)
- **Skills** — 4 AI skills with namespace isolation (`ace:auto-goal`, `ace:coding`, ...)
- **Safety** — Hookify guards that block dangerous ops and protect secrets
- **Memory** — Templates for cross-session memory and developer profiles
- **Non-destructive** — Smart merge preserves your existing config; uninstall restores it
```

#### 2.3.4 Quick Start

极致精简：

```markdown
## Quick Start

```bash
npm install -g @shirayner/ace
ace init
```

That's it. Run `ace doctor` to verify.
```

不超过 3 行命令。交互式问题在 demo 中已展示过，这里不重复。

#### 2.3.5 What You Get

用表格替代当前的多层嵌套列表，一屏展示全貌：

```markdown
## What You Get

| Component | Contents | Preset |
|-----------|----------|--------|
| **Core** | `CLAUDE.md` + `settings.json` (smart merge) | all |
| **Rules** | 7 rules: thinking, clean-code, code-quality, ... | all |
| **Plugin** | 4 skills + 1 command (`ace:auto-goal`, `ace:coding`, ...) | all |
| **Hookify** | 3 safety guards (block-dangerous-ops, protect-secrets, ...) | full, safe |
| **Hooks** | Role-dependent scripts (e.g., Java compile check) | full |
| **Memory** | MEMORY.md template + role-based developer profile | full, safe |

See [detailed documentation](docs/) for the full reference.
```

#### 2.3.6 Design Philosophy

这是当前完全缺失但极其重要的章节。建议提炼 3 个核心理念：

```markdown
## Design Philosophy

1. **Non-destructive by default** — ace merges into your existing config,
   never overwrites. Uninstall restores your original state.

2. **Namespace isolation** — Rules live in `rules/ace/`, skills use
   the `ace:` plugin namespace. Your files and ace's files never collide.

3. **Opinionated but escapable** — ace ships curated defaults for
   deep thinking, clean code, and safety. Disagree? Override any rule
   or uninstall cleanly.
```

#### 2.3.7 详细文档迁移

当前 README 中的以下内容应移到 `docs/` 或独立文件：

| 当前 README 内容 | 迁移目标 |
|-----------------|----------|
| 命令详细参数（init 选项表） | `docs/cli-reference.md` |
| 预设方案表 | `docs/presets.md` 或合并到 cli-reference |
| 角色详细说明 | `docs/roles.md` |
| 安装内容详细列表（Rules/Skills/Hookify/...） | `docs/components.md` |
| 合并策略说明 | `docs/merge-strategy.md` |

README 中只保留一句"See [documentation](docs/) for details."

### 2.4 双语方案

- **README.md** — 英文（canonical），顶部无语言切换（GitHub 默认展示此文件）
- **README.zh-CN.md** — 中文镜像，结构完全一致
- 两个文件顶部都加语言切换链接：

```markdown
[English](README.md) | [中文](README.zh-CN.md)
```

维护建议：英文版作为 source of truth，中文版定期同步。


## 3. CHANGELOG 引入方案

### 3.1 格式选择：Keep a Changelog

采用 [Keep a Changelog v1.1.0](https://keepachangelog.com/) 格式，这是开源社区的事实标准。

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0-snapshot.2] - 2026-04-15

### Added
- `ace uninstall` command for clean removal with config restore
- Plugin architecture: skills and commands as Claude Code plugin (`ace:*` namespace)
- Pre-install backup mechanism (`.pre-ace` snapshots)
- `ace` prefix for hookify rules and hook scripts (namespace isolation)
- npm publish support with scoped registry

### Changed
- Rules moved to `rules/ace/` subdirectory for namespace isolation
- Skills/commands moved from `templates/` to `plugin/` directory
- Settings.json merge now uses deep merge with hook deduplication

## [0.1.0-snapshot.1] - 2026-04-xx

### Added
- Initial CLI with `ace init`, `ace doctor`, `ace list` commands
- 7 cognitive and code-quality rules
- 4 AI skills (auto-goal, coding, skill-creator, skill-optimize)
- 3 hookify safety guards
- Role-based hook installation (backend, frontend, client, fullstack)
- Smart merge for CLAUDE.md and settings.json
- Memory templates with role-based developer profiles
```

### 3.2 六个标准分类

| 分类 | 适用场景 | 示例 |
|------|----------|------|
| **Added** | 新功能 | "Added `ace uninstall` command" |
| **Changed** | 已有功能的变更 | "Changed rules path to `rules/ace/`" |
| **Deprecated** | 即将移除的功能 | "Deprecated flat rules layout" |
| **Removed** | 已移除的功能 | "Removed direct skill installation" |
| **Fixed** | Bug 修复 | "Fixed settings.json merge losing user plugins" |
| **Security** | 安全修复 | "Fixed token exposure in logs" |

### 3.3 版本命名规则

- **Pre-1.0**：使用 `0.x.y-snapshot.z` 表示不稳定版本
- **1.0.0**：API 稳定后发布，去掉 `-snapshot` 后缀
- 遵循 SemVer：pre-1.0 阶段 minor 版本号表示 breaking change

### 3.4 Commit 与 CHANGELOG 的关系

- Git commit 采用 **Conventional Commits** 格式：`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`
- CHANGELOG **手写维护**，不自动生成（项目早期，发布频率低）
- 每条 CHANGELOG 描述**用户可感知的变化**，不记录内部重构
- 在 `[Unreleased]` 中持续积累，发版时移到具体版本号下

### 3.5 工具化路线

| 阶段 | 工具 | 时机 |
|------|------|------|
| **现在** | 手写 CHANGELOG + Conventional Commits | 项目早期 |
| **贡献者增多后** | commitlint（git hook 检查 commit 格式） | 有外部贡献者时 |
| **发布频繁后** | release-please 或 changesets | 发布频率 > 2次/月时 |

## 4. 贡献流程建设方案

### 4.1 CONTRIBUTING.md

```markdown
# Contributing to ace

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Link locally: `npm link`
4. Test your changes: `ace init --dry-run`

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run tests |
| `npm run lint` | Lint source code |
| `node bin/ace.js init --dry-run` | Test without side effects |
| `node bin/ace.js doctor` | Verify installation |

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `chore:` — Build process or auxiliary tool changes
- `test:` — Adding or correcting tests

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure `npm test` and `npm run lint` pass
4. Update CHANGELOG.md under `[Unreleased]`
5. Submit a PR with a clear description

## Project Structure

(简要说明 bin/, src/, templates/, plugin/ 的职责)

## Reporting Issues

Use GitHub Issues. Please include:
- ace version (`ace --version`)
- Node.js version (`node --version`)
- Steps to reproduce
- Expected vs actual behavior
```

### 4.2 GitHub Issue Templates

#### Bug Report (`.github/ISSUE_TEMPLATE/bug_report.yml`)

```yaml
name: Bug Report
description: Report a bug in ace
labels: ["bug"]
body:
  - type: input
    id: version
    attributes:
      label: ace version
      placeholder: "0.1.0-snapshot.2"
    validations:
      required: true
  - type: input
    id: node-version
    attributes:
      label: Node.js version
      placeholder: "20.x"
    validations:
      required: true
  - type: dropdown
    id: os
    attributes:
      label: Operating System
      options: [macOS, Windows, Linux]
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: true
```

#### Feature Request (`.github/ISSUE_TEMPLATE/feature_request.yml`)

```yaml
name: Feature Request
description: Suggest a new feature
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem
      description: What problem does this feature solve?
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
```

### 4.3 PR Template (`.github/PULL_REQUEST_TEMPLATE.md`)

```markdown
## Summary

<!-- Brief description of changes -->

## Related Issue

<!-- Fixes #123 -->

## Checklist

- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] CHANGELOG.md updated (if user-facing change)
- [ ] README updated (if relevant)
```

### 4.4 CI Workflows

#### CI 检查 (`.github/workflows/ci.yml`)

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        node-version: [18, 20, 22]
        os: [ubuntu-latest, windows-latest, macos-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm install
      - run: npm run lint
      - run: npm test
```

#### npm 发布 (`.github/workflows/publish.yml`)

```yaml
name: Publish
on:
  release:
    types: [published]
jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: npm install
      - run: npm test
      - run: npm publish --access public --provenance
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```


## 5. 项目治理文件补全

### 5.1 必须创建的文件

#### LICENSE

当前 package.json 声明 `"license": "MIT"` 但根目录无 LICENSE 文件。这在法律上是有风险的。

```
MIT License

Copyright (c) 2026 shirayner

Permission is hereby granted, free of charge, to any person obtaining a copy
...（标准 MIT 全文）
```

#### CODE_OF_CONDUCT.md

采用 [Contributor Covenant v2.1](https://www.contributor-covenant.org/) 标准文本，这是最广泛采用的开源行为准则（Node.js、Electron、Vue 等均使用）。

#### SECURITY.md

```markdown
# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✅        |

## Reporting a Vulnerability

Please report security issues to [email] or via GitHub Security Advisories.
Do NOT open a public issue for security vulnerabilities.

Expected response time: 48 hours.
```

### 5.2 开发工具配置文件

#### .editorconfig

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

#### .nvmrc

```
20
```

锁定 Node.js 20 LTS，贡献者 `nvm use` 即可对齐版本。

#### .prettierrc (可选，推荐)

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100
}
```

### 5.3 目标根目录结构

```
ace/
├── .editorconfig           ← NEW
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml  ← NEW
│   │   └── feature_request.yml ← NEW
│   ├── PULL_REQUEST_TEMPLATE.md ← NEW
│   └── workflows/
│       ├── ci.yml          ← NEW
│       └── publish.yml     ← NEW
├── .gitignore              ✅
├── .nvmrc                  ← NEW
├── bin/                    ✅
├── CHANGELOG.md            ← NEW
├── CODE_OF_CONDUCT.md      ← NEW
├── CONTRIBUTING.md         ← NEW
├── docs/                   ← NEW
│   ├── cli-reference.md
│   ├── components.md
│   ├── merge-strategy.md
│   └── presets.md
├── LICENSE                 ← NEW
├── package.json            ✅
├── plugin/                 ✅
├── README.md               ← REWRITE (English)
├── README.zh-CN.md         ← NEW (Chinese mirror)
├── SECURITY.md             ← NEW
├── src/                    ✅
├── templates/              ✅
└── tests/                  ✅
```

## 6. 实施路线图

### Phase 1: 基础治理（立即可做，1-2 小时）

| 优先级 | 任务 | 预期效果 |
|--------|------|----------|
| P0 | 创建 LICENSE 文件 | 消除法律风险 |
| P0 | 创建 CHANGELOG.md（回溯已有版本） | 版本追踪从零到一 |
| P0 | 创建 .editorconfig + .nvmrc | 贡献者环境一致性 |
| P1 | 创建 CODE_OF_CONDUCT.md | 开源社区标准信号 |
| P1 | 创建 SECURITY.md | 安全漏洞报告通道 |

### Phase 2: README 重写（核心，2-3 小时）

| 优先级 | 任务 | 预期效果 |
|--------|------|----------|
| P0 | 重写 README.md（英文着陆页模式） | 国际化 + 10 秒 hook |
| P0 | 添加 Design Philosophy 章节 | 传达核心价值观 |
| P0 | 添加 Why ace? 动机章节 | 回答"为什么用 ace" |
| P1 | 创建 README.zh-CN.md（中文镜像） | 服务中文用户 |
| P1 | 创建终端操作录屏（VHS/asciinema） | 视觉冲击力 |
| P2 | 将详细文档迁移到 docs/ | 降低 README 信噪比 |

### Phase 3: 贡献流程（中期，1-2 小时）

| 优先级 | 任务 | 预期效果 |
|--------|------|----------|
| P1 | 创建 CONTRIBUTING.md | 降低贡献门槛 |
| P1 | 创建 GitHub Issue Templates | 结构化问题报告 |
| P1 | 创建 PR Template | 标准化代码评审 |
| P2 | 搭建 CI workflow（lint + test） | 自动质量保障 |

### Phase 4: 自动化（长期，视贡献者增长）

| 优先级 | 任务 | 触发条件 |
|--------|------|----------|
| P2 | 搭建 publish workflow | 当手动发布成为负担 |
| P3 | 引入 commitlint | 当有外部贡献者 |
| P3 | 引入 release-please | 发布频率 > 2次/月 |
| P3 | 添加 Dependabot | 依赖数 > 10 |
| P3 | 添加 CodeQL 扫描 | 用户量增长后 |

### 行动优先级总结

```
立即做（阻碍开源可信度）：
  LICENSE + CHANGELOG + .editorconfig + .nvmrc

本周做（阻碍用户获取和贡献者加入）：
  README 重写 + CONTRIBUTING.md + Issue/PR Templates

按需做（随项目成长引入）：
  CI/CD + commitlint + release-please + Dependabot
```

---

> **关键洞察**：对 ace 这样的早期项目，最大的 ROI 是 README 重写。一个优秀的 README 既是最好的营销也是最好的文档。其次是 CHANGELOG 和 LICENSE — 它们的存在本身就是"这是一个认真的项目"的信号。CI/CD 和自动化可以随项目成长渐进引入。

