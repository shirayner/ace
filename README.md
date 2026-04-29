# `<img src="https://raw.githubusercontent.com/shirayner/ace/main/assets/logo.svg" width="48" align="center">` ACE

<p align="center">
  <b>AI Coding Environment</b> — 一键配置专业级 Claude Code 开发环境
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@shirayner/ace"><img src="https://img.shields.io/npm/v/@shirayner/ace?style=flat-square&color=blue" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@shirayner/ace?style=flat-square&color=green" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/node/v/@shirayner/ace?style=flat-square&color=orange" alt="Node.js"></a>
  <a href="#"><img src="https://img.shields.io/badge/Claude%20Code-Compatible-purple?style=flat-square" alt="Claude Code"></a>
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> | 
  <a href="docs/getting-started/index.md">快速开始</a> | 
  <a href="docs/why-ace/index.md">为什么选 ACE</a> | 
  <a href="docs/architecture/index.md">架构详解</a> | 
  <a href="docs/theory/index.md">理论基础</a>
</p>

---

## 🎯 什么是 ACE？

ACE 是一个**AI 开发环境配置工具**，基于 Claude Code 官方最佳实践构建，融合认知科学、控制论、软件工程等领域的深度理论，为开发者提供：

- 🧠 **认知增强规则** — 8 条基于认知科学的深度思考与代码质量原则
- 🤖 **专业级 AI Skills** — 4 个面向不同开发场景的智能技能
- 🛡️ **安全防护体系** — Hookify 守卫 + 角色脚本双重保障
- 📝 **规范驱动工作流** — OpenSpec 集成的需求管理体系
- 🧩 **跨会话记忆系统** — 持久化的开发者画像与项目记忆

```bash
# 一键安装，即刻拥有专业级 AI 开发环境
npm install -g @shirayner/ace
ace init
```

---

## ✨ 一分钟速览

### 初始化向导

```bash
$ ace init
◇  ace v0.1.6
│
◇  Installed to ~/.claude/
│
│  ◆ Core Config     2 files
│  ◆ Rules           8 files
│  ◆ Plugin          installed
│  ◆ Hooks           1 file
│  ◆ Safety Guards   7 files
│  ◆ Memory          2 files
│
◆  20 installed
│
┌  Next steps
│  Get started
│    1. cd <your-project> && ace spec init
│    2. Open Claude Code, type: /opsx:propose
│
│  Customize
│    Change role      edit ~/.claude/memory/user_profile.md
│    Adjust rules     edit ~/.claude/rules/ace/
│    Safety guards    edit ~/.claude/hookify.ace.*.local.md
│    Verify setup     ace doctor
└
└  Done. Go to your project and run ace spec init.
```

### Spec Coding 完整流程

```bash
# 进入工作目录
$ mkdir my-project 
$ cd my-project

# 执行 aspec 初始化
$ ace spec init
✓ aspec 工作流已初始化
Done! 规范驱动开发已就绪。

# 在 Claude Code 中体验三命令开发流程：
$ claude

> /opsx:proposal 帮我实现用户积分系统

Claude:
【需求澄清】积分获取规则？消费规则？过期策略？→ 3 个问题确认
【创建提案】proposal.md
【技术澄清】并发扣减方案？积分流水存储？→ 2 个问题确认
【确定方案】design.md + tasks.md（8 个可执行任务）

> /opsx:apply

Claude:
按 tasks.md 逐项实现，每步验证
✓ 所有任务完成，测试通过

> /opsx:archive

Claude:
spec 归档，收敛检查
✓ 归档完成
```

### 健康检查

```bash
$ ace doctor
✓ CLAUDE.md 配置正常
✓ 8 条规则文件完整
✓ 4 个 Skills 可正常加载
✓ Hookify 插件运行中
✓ 记忆目录可访问
All systems operational.
```

---

## 🏗️ 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        ACE 架构全景                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Rules     │  │   Skills    │  │  Hookify    │         │
│  │  (8 规则)    │  │  (4 技能)    │  │  (3 守卫)    │         │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤         │
│  │ • thinking  │  │ • auto-goal │  │ • block-    │         │
│  │ • clean-code│  │ • coding    │  │   dangerous │         │
│  │ • code-qual │  │ • skill-    │  │ • protect-  │         │
│  │ • reporting │  │   creator   │  │   secrets   │         │
│  │ • task-rec  │  │ • skill-    │  │ • require-  │         │
│  │ • context-  │  │   optimize  │  │   verify    │         │
│  │   hygiene   │  │             │  │             │         │
│  │ • memory-   │  │             │  │             │         │
│  │   policy    │  │             │  │             │         │
│  │ • interactive│  │             │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    Hooks    │  │   Memory    │  │    Spec     │         │
│  │ (角色脚本)   │  │  (记忆系统)  │  │ (规范驱动)   │         │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤         │
│  │ • Java 编译 │  │ • MEMORY.md │  │ • config    │         │
│  │   检查      │  │ • user_     │  │   .yaml     │         │
│  │ • TypeScript│  │   profile   │  │ • dimensions│         │
│  │   检查      │  │ • roles/    │  │   .md       │         │
│  │ • 更多...   │  │             │  │ • experience│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎓 核心设计理念

ACE 的设计融合了多学科的深层洞察：

### 认知科学

- **双过程理论** (Kahneman) — 简单任务快速响应，复杂任务深度分析
- **认知负荷理论** (Sweller) — 渐进式信息披露，避免工作记忆过载
- **元认知监控** — 持续自我监控与策略调整

### 控制论

- **OODA 循环** (Boyd) — 观察-定向-决策-行动的快速迭代
- **必要多样性定律** (Ashby) — 策略库必须匹配任务复杂度
- **闭环控制** — 每个操作都内建验证

### 软件工程

- **Clean Code 原则** (Robert C. Martin)
- **单一职责** (SOLID)
- **渐进式复杂度** (OpenAI Agent 最佳实践)

> 📖 详细理论解读请查看 [理论基础文档](docs/theory/index.md)

---

## 🚀 快速开始

### 视频教程

从下载安装到实际使用的完整演示：

<video src="assets/ace使用示例.mp4" controls width="100%"></video>

### 1. 安装 ACE

```bash
npm install -g @shirayner/ace
```

### 2. 初始化环境

```bash
ace init
```

按提示选择你的角色和预设。ACE 会自动配置：

- 全局 CLAUDE.md 索引
- 8 条认知规则
- 4 个 AI Skills
- Hookify 安全守卫
- 角色特定脚本和开发者画像

### 3. 验证安装

```bash
ace doctor
```

### 4. 开始项目（可选）

```bash
# 初始化规范驱动开发工作流
ace spec init ./my-project
cd my-project

# 开始开发
claude
```

---

## 📚 文档导航

### 新手入门

- [5 分钟快速开始](docs/getting-started/index.md) — 从零到专业开发环境
- [安装指南](docs/getting-started/installation.md) — 详细安装与配置
- [第一个项目](docs/getting-started/first-project.md) — 手把手入门教程

### 理解 ACE

- [为什么选 ACE](docs/why-ace/index.md) — 价值主张与核心优势
- [解决的问题](docs/why-ace/problems-solved.md) — ACE 如何应对开发痛点
- [方案对比](docs/why-ace/comparisons.md) — 与其他工具的比较

### 深度架构

- [架构全景](docs/architecture/index.md) — 完整组件关系图
- [8 条规则详解](docs/architecture/rules.md) — 每条规则的用途与设计
- [4 个 Skills 详解](docs/architecture/skills.md) — 工作原理与最佳实践
- [aspec 规范驱动](docs/architecture/aspec.md) — spec coding 完整工作流
- [Hookify 安全体系](docs/architecture/hookify.md)
- [Hooks 角色脚本](docs/architecture/hooks.md)
- [记忆系统](docs/architecture/memory.md)
- [OpenSpec 集成](docs/architecture/spec.md)

### 理论基础

- [理论总览](docs/theory/index.md)
- [认知科学基础](docs/theory/cognitive-science.md)
- [控制论与系统论](docs/theory/cybernetics.md)
- [哲学基础](docs/theory/philosophy.md)
- [心理学洞察](docs/theory/psychology.md)
- [社会学视角](docs/theory/sociology.md)

### 参考手册

- [CLI 完整参考](docs/reference/cli.md)
- [合并策略](docs/reference/merge-strategy.md)
- [角色说明](docs/reference/roles.md)

---

## 🛡️ 非破坏性设计

ACE 遵循**零侵入**原则：

- **智能合并** — CLAUDE.md 使用标记区块替换，settings.json 深度合并，用户配置始终保留
- **ACE 文件自动覆盖** — rules/ace/*、hooks/* 等 ACE 自有文件升级时自动更新，无需用户决策
- **自动备份** — 首次安装前创建完整快照
- **干净卸载** — `ace uninstall` 一键恢复原始状态
- **命名空间隔离** — 所有文件使用 `ace/` 前缀，避免冲突

---

## 🤝 贡献

欢迎贡献！我们同时在 GitHub 和 GitLab 维护代码库。

- 报告问题：使用 GitHub Issues
- 提交改进：Fork & Pull Request
- 讨论想法：GitHub Discussions

查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

---

## 📄 License

[MIT](LICENSE) © 2024

---

<p align="center">
  <sub>Built with ❤️ for developers who care about code quality</sub>
</p>
