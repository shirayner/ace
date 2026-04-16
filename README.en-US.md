[English](README.md) | [中文](README.zh-CN.md)

<div align="center">

# ace

**一条命令，武装你的 Claude Code。**

[![npm version](https://img.shields.io/npm/v/@shirayner/ace)](https://www.npmjs.com/package/@shirayner/ace)
[![license](https://img.shields.io/github/license/shirayner/ace)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@shirayner/ace)](package.json)

</div>

## 效果预览

```
$ ace init
? Your role: Fullstack Developer
? Preset: full
✔ core installed
✔ rules installed
✔ plugin installed (ace:auto-goal, ace:coding, ...)
✔ hookify installed
✔ hooks installed
✔ memory installed
Done! Your AI coding environment is ready.
```

### Spec 驱动开发

```
$ ace spec init ./my-project
✔ openspec config installed
✔ spec templates installed (taxonomy, issues, procedures, evolution)
Done! Spec workflow is ready.

# 三命令 spec coding 流程：
/opsx:proposal   → 需求澄清 + 创建提案 + 技术澄清 + 确定方案
/opsx:apply      → 按方案逐项实现，每步验证
/opsx:archive    → 归档复盘，知识库三层进化
```

Claude Code 开箱即用已经很强大——但手动配置规则、技能、安全守卫和记忆模板既繁琐又容易出错。

**ace 用一条命令解决这个问题：**

- **规则** — 8 条认知与代码质量规则（深度思考、Clean Code……）
- **技能** — 4 个 AI 技能，命名空间隔离（`ace:auto-goal`、`ace:coding`……）
- **规约** — Spec 驱动开发工作流，集成 OpenSpec
- **安全** — Hookify 守卫，拦截危险操作并保护密钥
- **记忆** — 跨会话记忆模板和开发者画像
- **无损安装** — 智能合并保留你的已有配置；卸载可完整还原

## 快速开始

```bash
npm install -g @shirayner/ace
ace init
```

搞定。运行 `ace doctor` 验证安装。

## 安装内容

| 组件 | 内容 | 预设 |
|------|------|------|
| **Core** | `CLAUDE.md` + `settings.json`（智能合并） | 全部 |
| **Rules** | 8 条规则：thinking、clean-code、code-quality…… | 全部 |
| **Plugin** | 4 个技能 + 1 个命令（`ace:auto-goal`、`ace:coding`……） | 全部 |
| **Hookify** | 3 条安全守卫（block-dangerous-ops、protect-secrets……） | full、safe |
| **Hooks** | 角色相关脚本（如 Java 编译检查） | full |
| **Memory** | MEMORY.md 模板 + 角色开发者画像 | full、safe |
| **Spec** | Spec 驱动工作流模板（分类、问题、流程） | `ace spec init` |

## 设计理念

1. **默认无损** — ace 合并到你的已有配置中，绝不覆盖。卸载后还原原始状态。

2. **命名空间隔离** — 规则位于 `rules/ace/`，技能使用 `ace:` 插件命名空间。你的文件和 ace 的文件永不冲突。

3. **有主见但可逃逸** — ace 提供精心策划的默认配置：深度思考、整洁代码、安全守卫。不同意？覆盖任何规则或干净卸载。

## 文档

- [CLI 参考](docs/cli-reference.md) — 命令、选项和预设方案
- [组件详情](docs/components.md) — 所有安装组件的详细说明
- [合并策略](docs/merge-strategy.md) — ace 如何处理已有配置文件
- [角色说明](docs/roles.md) — 基于角色的安装和开发者画像

## 参与贡献

欢迎通过 GitHub 或 GitLab（内部）参与贡献！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
