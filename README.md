# ACE — AI Coding Environment

<p align="center">
  <b>一键配置专业级 Claude Code 开发环境</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@shirayner/ace"><img src="https://img.shields.io/npm/v/@shirayner/ace?style=flat-square&color=blue" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@shirayner/ace?style=flat-square&color=green" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/node/v/@shirayner/ace?style=flat-square&color=orange" alt="Node.js"></a>
  <a href="#"><img src="https://img.shields.io/badge/Claude%20Code-Compatible-purple?style=flat-square" alt="Claude Code"></a>
</p>

---

## 什么是 ACE？

ACE 是一个 **AI 编码环境**，为 Claude Code 提供 14 个专业 skill + 8 个共享认知协议 + 10 条编码规则，覆盖编码全生命周期：

- **认知基础设施** — 理解协议、对齐协议、验证铁律，确保 AI 做对事
- **14 个专业 Skill** — 从需求理解到代码实现到复盘归档的完整能力
- **规范驱动工作流** — 门禁系统确保每个决策经过对齐确认
- **经验进化** — 项目级经验积累，跨会话持续成长

---

## 核心理念

| 原则                   | 含义                                                 |
| ---------------------- | ---------------------------------------------------- |
| **深度思考**     | 理解先于规划，规划先于行动。用事实闭环，不以假设收尾 |
| **对齐优先**     | 准确完成用户真正想要的，胜过高效完成 agent 以为的    |
| **Clean Code**   | 正确性 > 可读性 > 清晰 > 简单 > 显式                 |
| **规范先于代码** | 决策先于实现，验证闭环先于归档                       |

---

## Skill 概览

### 一、核心编码流水线

| Skill          | 命令                    | 说明                                           |
| -------------- | ----------------------- | ---------------------------------------------- |
| auto-goal      | `/ace:auto-goal`      | 自主目标编排——开放式目标、学习需求、多步执行 |
| spec-coding    | `/ace:spec-coding`    | 全生命周期规范驱动编码（6 Phase + 门禁系统）   |
| spechub-coding | `/ace:spechub-coding` | 基于 SpecHub 平台产物的本地编码                |

### 二、质量保障

| Skill       | 命令                 | 说明                                          |
| ----------- | -------------------- | --------------------------------------------- |
| code-review | `/ace:code-review` | 代码审查（正确性→设计→风格三层分析）        |
| ut          | `/ace:ut`          | 单元测试生成/修复（行覆盖 ≥80%、分支 ≥70%） |
| verify      | `/ace:verify`      | 横切验证门控（无证据不可声称通过）            |

### 三、知识与分析

| Skill                | 命令                          | 说明                   |
| -------------------- | ----------------------------- | ---------------------- |
| init                 | `/ace:init`                 | 项目技术画像初始化     |
| requirement-analysis | `/ace:requirement-analysis` | 需求分析流水线         |
| llm-wiki-generator   | `/ace:llm-wiki-generator`   | 为仓库生成 LLM 知识库  |
| llm-wiki-reader      | `/ace:llm-wiki-reader`      | 渐进式消费 wiki 知识库 |

### 四、元工具

| Skill             | 命令                       | 说明               |
| ----------------- | -------------------------- | ------------------ |
| skill-creator     | `/ace:skill-creator`     | 创建新 skill       |
| skill-optimize    | `/ace:skill-optimize`    | 深度优化现有 skill |
| parallel-dispatch | `/ace:parallel-dispatch` | 并行代理调度       |

---

## 快速开始

### 1. 安装

```bash
npm install -g @shirayner/ace
```

### 2. 初始化环境

```bash
ace init
```

ACE 自动配置：全局规则、Skills 插件、CLAUDE.md 索引。

### 3. 初始化项目画像

进入目标项目后：

```
/ace:init
```

生成 `.ace/project-profile.md`，包含架构、分层、编码约定。后续所有 skill 基于此画像工作。

### 4. 开始使用

**开放式目标/学习**：

```
/ace:auto-goal
```

**规范驱动开发**：

```
/ace:spec-coding
```

SpecHub接力开发

```
/ace:spechub-coding
```



---

## CLI 命令

| 命令                | 说明                                         |
| ------------------- | -------------------------------------------- |
| `ace init`        | 初始化 AI 编码环境（全局配置 + 规则 + 插件） |
| `ace doctor`      | 检查安装完整性                               |
| `ace list`        | 查看已安装组件状态                           |
| `ace upgrade`     | 升级到最新版本                               |
| `ace uninstall`   | 卸载所有 ace 管理的组件                      |
| `ace spec init`   | 初始化项目级 spec 工作流                     |
| `ace spec doctor` | 检查 spec 工作流健康度                       |
| `ace spec update` | 更新 spec 模板到最新版本                     |

---

## 文档

| 文档                                      | 说明                     |
| ----------------------------------------- | ------------------------ |
| [系统架构](docs/architecture.md)             | 三层架构设计与协作模型   |
| [安装与快速上手](docs/getting-started.md)    | 详细安装步骤与典型工作流 |
| [Skill 使用手册](docs/skills-guide.md)       | 14 个 skill 的分类详解   |
| [共享协议说明](docs/shared-protocols.md)     | 8 个认知协议的机制解析   |
| [产物目录规范](docs/artifacts-convention.md) | .ace/ 目录组织约定       |
| [Skill 开发指南](docs/skill-development.md)  | 如何开发新 skill         |

---

## 项目结构

```
ace/
├── bin/                  # CLI 入口
├── src/                  # CLI 源码
│   ├── commands/         #   命令实现
│   ├── core/             #   核心逻辑
│   └── utils/            #   工具函数
├── plugin/               # Claude Code 插件（安装到 ~/.claude/plugins/）
│   ├── shared/           #   共享协议层
│   ├── skills/           #   14 个 skill
│   └── commands/         #   插件命令
├── docs/                 # 文档库
└── package.json
```

---

## License

MIT
