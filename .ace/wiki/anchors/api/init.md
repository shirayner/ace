---
name: init
type: api
token_count: 1193
generated_at: 2026-06-10T08:47:07Z
source_commit: a2436f6bab6a25323b68b03ae3335a660734bf2b
description: 初始化并安装 ace Claude Code 工具链到本地开发环境
business_scenario: 开发者首次使用 ace 时执行初始化命令，安装核心配置、规则、插件、勾子、工具脚本和记忆模板到 ~/.claude/ 目录，完成 Claude Code 增强工具链的初始设置
contract: ace init [--force] [--dry-run]
implementation_class: initCommand (src/commands/init.js), Installer (src/core/installer.js)
related_business: [核心配置, 规则系统, 插件安装, 勾子系统, 工具脚本, 记忆模板, 文件合并策略, 冲突处理]
external_deps:
  - @clack/prompts: 提供交互式命令行提示（冲突处理选择、确认、进度展示）
  - fs-extra: 文件系统操作（复制、移动、删除、目录创建、文件存在检查、JSON 读写）
  - deepmerge: 深度合并 settings.json 配置对象（勾子去重、用户配置保留）
keywords: [初始化, 安装, 工具链, init, install, setup, harness, 一键安装]
---

# ace init — 初始化 ace 工具链

## 业务场景

开发者首次使用 ace 时运行 `ace init`，系统将 ace 的核心配置（CLAUDE.md、settings.json）、认知与代码质量规则、ace 插件（技能包）、安全勾子脚本、工具脚本以及记忆模板安装到用户主目录下的 `~/.claude/` 目录中，完成 Claude Code 增强环境的一键初始化。

该命令还负责：
- 检测冲突：当 `~/.claude/` 中已有文件时，通过交互式提示让用户选择跳过、覆盖或取消
- 智能合并：CLAUDE.md 和 settings.json 采用标记区替换或深度合并策略，保留用户原有内容
- 遗留迁移：自动将旧版目录结构 `rules/ace/` 迁移到新版 `ace/rules/`
- 插件注册：将 ace 插件注册到本地插件市场，写入安装清单和已知市场列表

## 业务输入 / 业务输出

- **输入**: `ace init` 命令，支持可选参数：
  - `--force`: 静默覆盖所有已存在的文件，跳过冲突提示
  - `--dry-run`: 仅模拟安装过程，不实际写入文件
- **输出**: 安装结果摘要（安装数、合并数、跳过数、失败数），以及后续操作指引

## 业务规则

1. **冲突处理策略**：按文件类型区分处理方式——CLAUDE.md 和 settings.json 采用智能合并（保留用户内容并添加 ace 内容）；skip-existing 标记的文件（如 MEMORY.md）保持不变；ace 自有文件（ace/rules/、hooks/ace. 等）直接覆盖；其他文件触发交互式提示
2. **插件注册规则**：安装插件时自动同步 package.json 版本号至 plugin.json，创建本地插件市场目录，并将插件注册到 installed_plugins.json 和 known_marketplaces.json
3. **Shell 脚本处理规则**：所有 .sh 文件在安装时自动转换换行符为 LF（Unix 风格），并设置可执行权限（0o755）
4. **遗留迁移规则**：如果检测到旧版 `~/.claude/rules/ace/` 目录，自动将其内容迁移到新版 `~/.claude/ace/rules/`，迁移后清理空目录
5. **备份规则**：修改已存在的目标文件前，先创建 .pre-ace 快照备份（仅首次安装时创建），用于后续卸载恢复

## 调用链路

1. `initCommand(options)` — 入口函数
   - 使用 PRESETS['full'] 定义完整组件列表：core、rules、plugin、hooks、scripts、memory
   - 非 force 模式下调用 buildInstallPreview() 扫描冲突
     - 遍历每个组件的 files、rulesDir、conditional，按 merge/skip/conflict 三类归类
     - merge 类型的文件调用 mergeClaudeMd() 预览变更内容，判断是否需要更新
     - conflict 类型的文件触发 p.select() 提示用户选择 skip/overwrite/cancel
   - 将用户选择写入 installer.resolutions，供后续安装时参考
   - 按顺序安装每个组件，在 spinner 中展示进度
   - 安装完成后输出摘要表格，显示每个组件的安装/合并/跳过/失败数
2. `Installer.installComponent(name, component)` — 组件安装调度
   - 根据组件类型分发到不同安装方法：
     - installRulesDir() — 安装 ace/rules/ 下的认知规则 markdown 文件
     - installRecursiveDir() — 递归安装目录中的 markdown 文件
     - installPlugin() — 安装 ace 插件：创建本地市场、复制插件文件、注册安装信息
     - installFile() — 安装单个文件，按策略处理（覆盖/合并/跳过）
     - installDirectory() — 安装整个目录
     - installRoleTemplate() — 根据角色安装用户档案模板
3. `Installer.installFile(fileSpec, componentName)` — 文件安装核心逻辑
   - 检查目标文件是否存在，若存在则按优先级处理：
     - skip-existing 策略 → 跳过
     - ace 自有文件（isAceOwnedFile）→ 直接覆盖
     - claude-md 策略 → 调用 mergeClaudeMdFile() 进行标记区合并
     - settings-json 策略 → 调用 mergeSettingsJsonFile() 深度合并
     - 其他文件（冲突）→ 根据 resolutions 决定覆盖或跳过
   - .sh 文件写入时转换 CRLF 为 LF 并设置 0o755 权限
   - 覆盖前调用 backupPreInstall() 创建备份快照
4. `mergeClaudeMd(existingContent, templateContent)` — CLAUDE.md 标记区合并
   - 若双方都有完整的 `<!-- ace:managed:start -->` / `<!-- ace:managed:end -->` 标记，执行标记区替换
   - 替换后清理过期的 ace 引用和 hookify 引用
   - 若缺少标记，回退到追加模式：仅添加缺少的引用
5. `mergeSettingsJson(existing, template)` — settings.json 深度合并
   - 使用 deepmerge 合并，对 hooks 数组按 matcher 去重
   - model、theme、locale 等用户配置键不做覆盖

## 外部依赖详情

| 依赖 | 业务用途 | 调用时机 |
|------|---------|---------|
| @clack/prompts | 交互式命令行提示（介绍、spinner、日志、选择、笔记、结束语） | 冲突检测交互、安装进度展示、结果摘要输出 |
| fs-extra | 文件系统操作（复制、移动、删除、目录创建、文件存在检查、JSON 读写） | 贯穿整个安装过程 |
| deepmerge | 深度合并 settings.json 对象，对 hooks 数组按 matcher 去重，保留用户配置（model/theme/locale） | 合并 settings.json 时 |

## 主要实现类(定位锚点)

- **入口函数**: initCommand — src/commands/init.js
- **安装执行器**: Installer 类 — src/core/installer.js
- **合并工具**: mergeClaudeMd, mergeSettingsJson — src/core/merger.js
- **组件定义与常量**: COMPONENTS, PRESETS, ACE_OWNED_PATTERNS — src/core/constants.js
- **团队规则安装**: TeamInstaller 类 — src/core/team-installer.js

## 相关锚点

- ace doctor — 安装完成后验证工具链状态
- ace update — 更新已安装的 ace 组件
