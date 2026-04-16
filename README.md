# <img src="https://raw.githubusercontent.com/shirayner/ace/main/assets/logo.svg" width="48" align="center"> ACE

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
? 选择你的角色: Fullstack Developer
? 选择安装预设: full (完整功能)
✓ Core 核心配置已安装
✓ 8 条认知规则已部署
✓ 4 个 AI Skills 已激活 (ace:auto-goal, ace:coding, ...)
✓ Hookify 安全守卫已启用
✓ 角色钩子脚本已配置
✓ 记忆系统已初始化
Done! 你的 AI 开发环境已就绪。
```

### 规范驱动开发
```bash
$ ace spec init ./my-project
✓ OpenSpec 配置已安装
✓ 规范模板已部署 (taxonomy, issues, procedures, evolution)
Done! 规范驱动工作流已就绪。
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
│  │   检查      │  │ • user_     │  │ • taxonomy/ │         │
│  │ • TypeScript│  │   profile   │  │ • issues/   │         │
│  │   检查      │  │ • roles/    │  │ • procedures│         │
│  │ • 更多...   │  │             │  │ • evolution │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 安装预设

| 组件 | `full` | `safe` | `minimal` |
|------|:------:|:------:|:---------:|
| **Core** (CLAUDE.md + settings.json) | ✅ | ✅ | ✅ |
| **Rules** (8 条认知与代码质量规则) | ✅ | ✅ | ✅ |
| **Plugin** (4 个 Skills) | ✅ | ✅ | ✅ |
| **Hooks** (角色相关脚本) | ✅ | ❌ | ❌ |
| **Hookify** (3 个安全守卫) | ✅ | ✅ | ❌ |
| **Memory** (模板 + 开发者画像) | ✅ | ✅ | ❌ |

```bash
# 完整功能（推荐）
ace init --preset full

# 安全优先（适合团队协作）
ace init --preset safe

# 最小安装（仅核心功能）
ace init --preset minimal
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
- [Hookify 安全体系](docs/architecture/hookify.md)
- [Hooks 角色脚本](docs/architecture/hooks.md)
- [记忆系统](docs/architecture/memory.md)
- [Spec 规范驱动](docs/architecture/spec.md)

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

- **智能合并** — 与现有配置共存，从不覆盖
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
