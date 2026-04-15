# @shirayner/ace

一条命令搭建你的 Claude Code 开发环境。

ace 将精心调校的规则、技能、安全守卫和记忆模板一键安装到 `~/.claude/`，让 Claude Code 开箱即战。

## 安装

```bash
npm install -g @shirayner/ace
```

> 要求 Node.js >= 18.0.0

## 快速开始

```bash
ace init
```

交互式引导会询问两个问题：

1. **你的角色** — 后端 / 前端 / 客户端 / 全栈
2. **安装范围** — 完整 / 安全 / 最小

选完即装，已有配置不会被覆盖。

## 命令

### `ace init`

初始化 Claude Code 开发环境。

```bash
ace init [options]
```

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `-p, --preset <name>` | 安装预设：`full` / `minimal` / `safe` | `full` |
| `-f, --force` | 强制覆盖已有文件 | `false` |
| `--dry-run` | 仅展示操作，不实际执行 | `false` |
| `--no-interaction` | 跳过交互提示，使用默认值 | `false` |

### `ace doctor`

检查安装完整性，验证所有文件是否就位、配置是否有效。

```bash
ace doctor
```

### `ace list`

查看各组件的安装状态（installed / partial / missing）。

```bash
ace list
```

## 预设方案

| 组件 | full | safe | minimal |
|------|:----:|:----:|:-------:|
| core（CLAUDE.md + settings.json） | o | o | o |
| rules（7 条认知与代码质量规则） | o | o | o |
| skills（4 个 AI 技能） | o | o | o |
| hooks（角色相关 hook 脚本） | o | | |
| hookify（3 条安全守卫） | o | o | |
| memory（记忆模板 + 角色画像） | o | o | |
| commands（自定义命令） | o | | |

## 角色

角色决定安装哪些条件组件以及记忆中的开发者画像。

| 角色 | 语言方向 | 条件 Hook |
|------|----------|-----------|
| Backend | Java / Go / Python | java-compile-check |
| Frontend | React / Vue / TypeScript | - |
| Client | iOS / Android / Flutter | - |
| Fullstack | TypeScript + Java | java-compile-check |

## 安装内容

### Core

- **CLAUDE.md** — 全局配置索引，通过 `@` 引用指向各规则文件
- **settings.json** — Claude Code 基础设置（自动记忆目录、hookify 插件启用等）

### Rules（7 条规则）

| 规则 | 作用 |
|------|------|
| thinking.md | 深度思考原则（序验深广辨简） |
| clean-code.md | Clean Code 六条核心原则 |
| code-quality.md | 代码质量标准（编辑代码时自动加载） |
| reporting.md | 分析报告自动输出规则 |
| task-recovery.md | 任务中断恢复协议 |
| context-hygiene.md | 上下文卫生与 Compaction 保护 |
| memory-policy.md | 记忆质量策略 |

### Skills（4 个技能）

| 技能 | 作用 |
|------|------|
| auto-goal | 自主完成复杂目标（OODA 循环 + 域感知路由） |
| coding | 代码域认知协议（实现 / 测试 / 审查三种意图） |
| skill-creator | 创建和评测新技能 |
| skill-optimize | 基于七条永恒原则优化现有技能 |

### Hookify（3 条安全守卫）

- **block-dangerous-ops** — 拦截 `rm -rf`、`git push --force` 等危险命令
- **protect-secrets** — 编辑 `.env`、密钥文件时发出警告
- **require-verification** — 交付前提醒编译和测试验证

### Hooks

- **java-compile-check.sh** — 编辑 Java 文件后自动编译检查（仅 Backend / Fullstack 角色）

### Memory

- **MEMORY.md** — 记忆索引模板
- **角色画像** — 根据所选角色生成 `user_profile.md`

### Commands

- **report.md** — `/report` 命令，分析问题并增量写入 markdown 报告

## 合并策略

ace 不会破坏你的已有配置：

| 文件 | 策略 |
|------|------|
| CLAUDE.md | 智能合并：仅追加缺失的 `@` 引用 |
| settings.json | 深度合并：保留你的 model、theme、locale 设置 |
| memory/MEMORY.md | 跳过：已存在则不修改 |
| 其他文件 | 已存在则跳过，除非使用 `--force` |

合并前会自动备份原文件（`*.ace-backup.*`）。

## License

MIT
