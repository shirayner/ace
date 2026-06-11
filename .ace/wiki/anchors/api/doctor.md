---
name: doctor
type: api
token_count: 380
generated_at: 2026-06-10T08:00:00.000Z
source_commit: a2436f6bab6a25323b68b03ae3335a660734bf2b
description: 验证 ace 工具安装完整性，诊断 Claude Code 环境配置是否健康。
business_scenario: 用户安装或升级 ace 后，通过此命令验证所有组件、插件、规则文件、配置文件均已正确部署，用于安装验证和故障排查。
contract: ace doctor
implementation_class: doctorCommand
related_business: [ace工具, Claude Code 环境, 插件安装, 规则配置, 环境诊断]
external_deps:
  - fs-extra: 读取文件系统和 JSON 配置文件，检测文件/目录是否存在以及解析配置内容。
  - chalk: 输出彩色诊断结果，区分通过（绿色）和失败（红色）状态。
keywords: [环境诊断, 安装验证, 完整性检查, environment diagnosis, installation verification, integrity check]
---

# doctor — ace 安装完整性诊断

## 业务场景

用户安装或升级 ace 后，需要通过诊断命令验证所有组件是否部署正确。该命令覆盖核心目录结构、配置文件、规则文件、插件安装、市场注册、内存目录以及 settings.json 和 CLAUDE.md 的引用有效性，帮助用户快速定位缺失或配置错误的部分。

## 业务输入 / 业务输出

- **输入**: 无（命令无需参数，基于当前环境的 ~/.claude 目录做检查）
- **输出**: 终端打印每个检查项的通过/失败状态，汇总通过数和失败数，若存在失败则提示运行 `ace init` 修复

## 业务规则

- 所有检查项独立运行，一项失败不影响其余项继续检查
- 核心文件（CLAUDE.md、settings.json）必须存在于 ~/.claude 目录下
- 已注册的插件必须具有合法的安装目录，且各技能 SKILL.md 文件必须存在
- settings.json 必须可解析为合法 JSON，且包含 hooks 配置、autoMemoryDirectory 和 ace 插件启用状态
- CLAUDE.md 中所有 @ref 引用和路径索引引用的文件必须在磁盘上实际存在
- 汇总显示通过数和失败数，失败项以红色标记，通过项以绿色标记

## 调用链路

doctorCommand → check（辅助函数，包装 Promise 返回结构化检查结果）
doctorCommand → getPluginInstallDir（从 installed_plugins.json 或缓存目录获取插件安装路径）
doctorCommand → fs.pathExists（检测目录和文件是否存在）
doctorCommand → fs.readJson（解析 installed_plugins.json、known_marketplaces.json 和 settings.json）
doctorCommand → fs.readFile（读取 CLAUDE.md 内容并解析引用路径）
doctorCommand → fs.readdir（遍历模板规则目录和插件缓存目录）

## 外部依赖详情

| 依赖 | 业务用途 | 调用时机 |
|------|---------|---------|
| fs-extra | 读取文件系统、检测文件存在性、解析 JSON 配置文件、读取目录列表 | 每个检查项执行时 |
| chalk | 以绿色/红色/黄色标记诊断结果，用户视觉识别通过状态和修复建议 | 输出诊断报告时 |

## 主要实现类(定位锚点)

- **函数**: doctorCommand
- **文件**: src/commands/doctor.js

## 相关入口

- ace init: 安装和配置 ace 工具，doctor 用于验证 init 的执行结果
