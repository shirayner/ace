# ACE — AI Coding Environment

<p align="center">
  <b>一键配置专业级 AI Coding 开发环境</b>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@shirayner/ace"><img src="https://img.shields.io/npm/v/@shirayner/ace?style=flat-square&color=blue" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/npm/l/@shirayner/ace?style=flat-square&color=green" alt="license"></a>
  <a href="package.json"><img src="https://img.shields.io/node/v/@shirayner/ace?style=flat-square&color=orange" alt="Node.js"></a>
  <a href="#"><img src="https://img.shields.io/badge/Claude%20Code-Compatible-purple?style=flat-square" alt="Claude Code"></a>
</p>

---

## 什么是 ACE？

ACE 是一个 **AI 编码环境**，为 Coding Agent 提供 24 个专业 skill + 11 个共享认知协议 + 10 条编码规则，覆盖编码全生命周期：

- **认知基础设施** — 理解协议、对齐协议、验证铁律，确保 AI 做对事
- **24 个专业 Skill**（按 coding / general / meta / docs 四类组织，安装时可选）— 从PRD撰写到需求理解到代码实现到复盘归档的完整能力
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

下表按使用场景挑选常用 skill，便于快速上手；**安装分类**（coding / general / meta / docs）是另一套维度，完整清单见[系统架构](docs/architecture.md#layer-2-skills能力单元层)。

### 一、核心编码流水线

| Skill          | 命令                    | 说明                                                 |
| -------------- | ----------------------- | ---------------------------------------------------- |
| auto-goal      | `/ace:auto-goal`      | 自主目标编排——万能通用，设定定一个目标，AI努力完成 |
| auto-goal-v2   | `/ace:auto-goal-v2`   | 证据驱动的目标控制器——判据台账推导终态，与 V1 并存 |
| auto-goal-v3   | `/ace:auto-goal-v3`   | 决策树理解 + 苏格拉底澄清 + 并行派发 + 独立验收       |
| spec-coding    | `/ace:spec-coding`    | 全生命周期规范驱动编码（6 Phase + 门禁系统）         |
| spechub-coding | `/ace:spechub-coding` | 基于 SpecHub 平台产物的本地编码                      |

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
# 安装最新版本到本地
# 如果之前安装过，会用最新版本覆盖（因此当 ace upgrade 命令不存在时，也可以执行此命令来升级ace）
npm install -g @shirayner/ace --registry=https://registry.npmjs.org/
```

### 2. 初始化环境

```bash
ace init
```

`ace init` 会先问你**用哪些 AI 编码工具**（多选，已安装的会自动勾选）：

```
Which agent tools do you use?
  ◼ Claude Code        ◻ Codex          ◻ OpenCode
  ◻ DeepSeek Harness   ◻ Kiro
```

选择会记在 `~/.ace/config/target-selection.json`，之后 `ace upgrade` 和 `ace init --force`
直接复用，不再重复询问。

---

## 多工具安装（Multi-target）

### 一份 skills，多个工具共用

Skills 先写入**规范存储** `~/.agents/skills/`（可用 `DSH_AGENTS_HOME` 覆盖），
再按每个工具的实际发现机制投影：

| 工具                | Skills 来源                         | 投影方式         | 指令文件                      |
| ------------------- | ----------------------------------- | ---------------- | ----------------------------- |
| **Codex**           | `~/.agents/skills/` 原生读          | 无（零拷贝）     | `~/.codex/AGENTS.md`          |
| **OpenCode**        | `~/.agents/skills/` 原生读          | 无（零拷贝）     | `~/.config/opencode/AGENTS.md`|
| **DeepSeek Harness**| `${DSH_HOME:-~/.dsh}/skills/<skill>`| **扁平复制**     | `~/.agents/AGENTS.md`         |
| **Kiro**            | `~/.kiro/skills/`                   | **复制**         | `~/.kiro/AGENTS.md`           |
| **Claude Code**     | 插件市场（plugin cache）            | 本地 marketplace | `~/.claude/CLAUDE.md`         |

Codex 和 OpenCode 递归读取 `~/.agents/skills/`，因此无需投影。DeepSeek Harness 只扫描 skill
根目录的直接子目录，所以 ACE 会把已选 skill 的完整 bundle 扁平复制到它自己的 `skills/` 下；
如果那里已有非 ACE 托管的同名目录，安装会明确报错而不是覆盖。Kiro 也需要真实副本（它对指向
`.agents` 的链接处理不可靠）。Claude Code 继续走它原有的插件市场机制。

### 两条硬约束

**1. 规范存储保留 ACE 分类。**
共享目录按 `~/.agents/skills/ace-<category>/<skill>/SKILL.md` 安装，例如
`ace-coding/spec-coding/`、`ace-general/auto-goal/`。这样既保留源码分类，也避免把 ACE 的
所有 skill 平铺到共享根目录。Claude Code 与 Kiro 仍在各自的专用目录使用扁平投影。

**2. 只动自己的东西。**
`~/.agents/skills/` 是**共享**目录，其它安装器也往里写。因此 ACE 只重建 `ace-*` 分类目录、
迁移自己旧版的扁平 skill，并在卸载时按回执清理；从不删除存储根目录。

### 安装回执

每次安装会写 `~/.ace/config/install-receipt.json`，记录实际落地的路径。
卸载**只**依据这份回执——因为无法从"选了哪些工具"反推出该删什么：
副本散落在各工具目录下，而源已失效的链接对 `pathExists` 表现为"不存在"却仍占着名字。
回执里没有的东西，一概不动。

`ace doctor` 用 `lstat` 逐个核对真实路径（不是读某个"已安装"标记位），
并检查每个工具指令文件里的规则引用是否都能解析——
指向不存在文件的索引能正常加载却静默解析为空，只查"是否写了文件"是发现不了的。

### 工具间互不干扰

只选 Codex 时，`~/.claude/` 一个文件都不会创建（`CLAUDE.md`、`settings.json`、hooks
都只有 Claude Code 会读）；反过来只选 Claude Code 时也不会污染 `~/.agents/`。

### 3. 开始使用

**开放式目标(万能通用)**：

```
/ace:auto-goal  描述你的目标
```

**规范驱动开发**：

```
/ace:spec-coding  描述需求/或飞书需求链接/或文件
```

SpecHub接力开发

```
/ace:spechub-coding spechub需求ID
```

---

## CLI 命令

| 命令              | 说明                                         |
| ----------------- | -------------------------------------------- |
| `ace init`      | 初始化 AI 编码环境（选择工具 + 规则 + Skills） |
| `ace doctor`    | 检查安装完整性（逐工具核对真实路径与指令引用） |
| `ace list`      | 查看已安装组件与各工具安装状态                |
| `ace upgrade`   | 升级到最新版本（沿用已保存的工具选择）        |
| `ace uninstall` | 卸载所有 ace 管理的组件（依据安装回执）        |

---

## 文档

| 文档                                      | 说明                     |
| ----------------------------------------- | ------------------------ |
| [系统架构](docs/architecture.md)             | 三层架构设计与协作模型   |
| [安装与快速上手](docs/getting-started.md)    | 详细安装步骤与典型工作流 |
| [Skill 使用手册](docs/skills-guide.md)       | skill 的分类详解         |
| [产物目录规范](docs/artifacts-convention.md) | .ace/ 目录组织约定       |

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
│   ├── skills/           #   skill 按分类分目录（共享存储保留分类）
│   │   ├── coding/       #     spec-coding、review、需求与设计
│   │   ├── general/      #     通用目标编排与调研
│   │   ├── meta/         #     skill 自身的编写与优化
│   │   └── docs/         #     文档工作流与配图
│   └── commands/         #   插件命令
├── docs/                 # 文档库
└── package.json
```

---

## License

MIT
