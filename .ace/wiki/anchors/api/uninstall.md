---
name: uninstall
type: api
token_count: 340
generated_at: 2026-06-10T12:00:00Z
source_commit: a2436f6bab6a25323b68b03ae3335a660734bf2b
description: 卸载 ace 工具链，移除所有由 ace 管理的文件、插件和配置修改
business_scenario: 用户不再需要 ace 对 Claude Code 工作环境的增强功能，希望彻底清除 ace 安装的所有痕迹，恢复 ~/.claude/ 目录到接近安装前的状态
contract: ace uninstall [--yes]
implementation_class: uninstallCommand (src/commands/uninstall.js)
related_business: [ace 安装管理, Claude Code 环境清理, 插件卸载, 钩子脚本清理]
external_deps:
  - fs-extra: 文件系统操作，支持递归删除目录和读写 JSON
  - path: 路径拼接与规范化
  - chalk: 终端输出着色，区分不同状态的输出
  - inquirer: 用户确认交互提示
  - ora: 步骤执行中的旋转加载动画
keywords: [uninstall, 卸载, remove, ace, claude code, cleanup, 清理, 还原, 反安装]
---

# uninstall — 卸载 ace 工具链

## 业务场景

用户已完成 ace 的使用，或需要从干净状态重新安装，希望彻底清除 ace 在 `~/.claude/` 目录下的所有文件、配置修改和插件注册信息，使 Claude Code 环境恢复到接近安装前的状态。

## 业务输入 / 业务输出

- **输入**: `--yes` 可选参数，跳过确认提示直接执行卸载
- **输出**: 按步骤移除 ace 组件的操作结果汇总，包括成功移除、跳过（因文件不存在）和失败三类项目列表

## 业务规则

1. 默认需要用户交互确认；传入 `--yes` 参数可跳过确认直接执行卸载
2. 仅移除 ace 管理范围内的文件（`ace/rules/`、`hooks/ace.*`、插件缓存、市场注册信息），不删除用户自己的 `memory/` 目录和无 ace 引用的 `CLAUDE.md`
3. `CLAUDE.md` 和 `settings.json` 优先从 `.pre-ace` 备份文件恢复；无备份时采用外科手术式方式删除 ace 注入的内容和引用
4. 各步骤独立执行，单步骤失败不影响其他步骤继续运行，最终汇总所有错误
5. 所有 `*.ace-backup.*` 和 `*.pre-ace` 临时备份文件在卸载完成后一并清理

## 调用链路

`uninstallCommand`(入口函数) — 按顺序执行 5 个独立清理步骤，每个步骤由 ora spinner 包裹：

1. **移除规则目录** → 删除 `~/.claude/ace/rules/` → 若 `ace/` 父目录为空则删除 → 删除遗留 `~/.claude/rules/ace/`(旧版路径)
2. **移除插件** → 删除插件缓存目录 `PLUGIN_CACHE_DIR` → 从 `installed_plugins.json` 中删除 ace 条目 → 删除市场目录 `MARKETPLACE_DIR` → 调用 `removeKnownMarketplace` 清理 `known_marketplaces.json` 中的 ace 注册
3. **移除钩子脚本** → 遍历 `COMPONENTS.hooks.files` 和 `COMPONENTS.hooks.conditional` → 逐一检查并删除目标文件
4. **移除遗留 hookify 规则** → 扫描 `~/.claude/` 下匹配 `/^hookify\.ace\..+\.local\.md$/` 的旧版文件 → 逐一删除
5. **恢复配置** → 检查 `CLAUDE.md.pre-ace` 备份 → 有则复制还原并删除备份 → 无备份则外科手术删除 ace managed section( `<!-- ace:managed:start -->`...`<!-- ace:managed:end -->` )和所有 `@~/.claude/rules/ace/` 引用 → 同理处理 `settings.json` → 清理所有 `*.ace-backup.*` 和 `*.pre-ace` 临时文件

## 外部依赖详情

| 依赖 | 业务用途 | 调用时机 |
|------|---------|---------|
| fs-extra | 递归删除目录、读取/写入 JSON、检查路径存在性、复制与移动文件 | 每个步骤 |
| chalk | 终端文本着色，区分标题、成功、跳过、错误和总结输出 | 步骤开始前和结束后 |
| inquirer | 弹出 yes/no 确认提示，询问用户是否继续卸载 | 执行开始时（无 `--yes` 时） |
| ora | 每个步骤的旋转加载动画，结束时切换为成功/失败图标 | 每个步骤执行期间 |
| removeKnownMarketplace (merger.js) | 从 known_marketplaces.json 配置文件中移除 ace-local 市场的注册信息 | 步骤 2 末尾 |

## 主要实现类(定位锚点)

`uninstallCommand` 函数 — `src/commands/uninstall.js`，导出的命令入口函数。所有步骤以内联方式实现，无子类。

## 相关锚点

- `installCommand` (`src/commands/install.js`): 安装 ace 组件，与 uninstall 对称的逆操作
- `Installer` class (`src/core/installer.js`): 安装引擎，定义了 ace 管理的组件结构和文件清单，uninstall 依赖这些结构确定需要清理的内容
