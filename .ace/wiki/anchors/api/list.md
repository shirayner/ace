---
name: list
type: api
token_count: 800
generated_at: 2026-06-10T08:46:48Z
source_commit: a2436f6bab6a25323b68b03ae3335a660734bf2b
description: 查看 ace 工具箱各组件的安装状态（已安装/部分缺失/未安装）
business_scenario: 用户需要了解 ace 工具箱中 core、rules、plugin、hooks、scripts、memory 等组件在 ~/.claude/ 目录下的安装情况，以确认各组件是否就绪
contract: ace list
implementation_class: listCommand() — src/commands/list.js
related_business: [组件安装, 插件管理, Hook 脚本, 规则文件, 内存模板, Component Installation, Plugin Management]
external_deps:
  - fs-extra: 文件系统操作，检查文件/目录是否存在、读取 JSON、递归遍历目录
  - chalk: 终端文字着色，区分 installed/partial/missing 三种状态
keywords: [list, 组件列表, 安装状态, component status, installed, partial, missing, ace list]
---

# list — 查看组件安装状态

## 业务场景

用户通过 `ace list` 命令查看 ace 工具箱中各组件（core、rules、plugin、hooks、scripts、memory）在 `~/.claude/` 目录下的安装状态，判断哪些组件已就绪、部分缺失或完全未安装。对于插件组件，还会额外显示已安装的版本号和插件标识键。

## 业务输入 / 业务输出

- **输入**: 无（`ace list` 无需参数）
- **输出**: 终端打印所有组件的安装状态列表，每种组件前带颜色标识：installed（已安装，绿色）、partial（部分缺失，黄色）、missing（未安装，灰色）。对于 partial 状态的组件（非插件），逐行列出缺失的具体文件路径；对于已安装的插件组件，显示版本号和插件标识键。

## 业务规则

- 非插件组件按 files、directories、rulesDir、recursiveDir、conditional 五种路径清单逐一检查文件是否存在：
  - 全部存在 → installed
  - 部分存在 → partial，并列出缺失文件
  - 全部缺失 → missing
- 插件组件先检查缓存目录是否存在（不存在则判定为 missing），再检查已安装插件清单文件：
  - 插件清单中有对应键 → installed
  - 缓存目录存在但插件清单中无对应键或无清单文件 → partial
- 无待检查路径清单的组件直接判定为 installed

## 调用链路

1. `listCommand()` — 入口函数，遍历 COMPONENTS 对象
2. 对每个组件判断 `component.isPlugin` 属性：
   - 插件组件 → `getPluginStatus()` → 检查 `PLUGIN_CACHE_DIR` 目录是否存在，然后读取 `INSTALLED_PLUGINS_FILE` 查询 `PLUGIN_KEY`
   - 非插件组件 → `getComponentStatus(component)` → 根据组件配置的 rulesDir / recursiveDir / files / directories / conditional 五种路径收集所有待检查路径，通过 `Promise.all` 并行调用 `fs.pathExists()`，统计存在数量后返回状态
3. 状态为 partial 且非插件组件 → `getComponentDetails(component)` → 递归收集所有文件，逐一检查存在性，返回缺失文件列表
4. 插件组件状态为 installed → `getPluginVersion()` → 读取安装清单中的版本号
5. 辅助函数 `collectMdFiles(dir, relBase)` — 递归扫描指定目录下所有 .md 文件的相对路径

## 外部依赖详情

| 依赖 | 业务用途 | 调用时机 |
|------|---------|---------|
| fs-extra | 文件系统操作：检查文件/目录是否存在、读取 JSON 文件、递归读取目录列表 | 遍历每个组件时检查文件安装状态 |
| chalk | 终端着色输出：为 installed(绿色)、partial(黄色)、missing(灰色) 三种状态赋予不同颜色标识 | 打印每个组件的状态行时 |

## 主要实现类(定位锚点)

- `listCommand()` — `/Users/chengzheng/Projects/py/ace/src/commands/list.js`

## 相关入口

- `ace doctor` — 安装后全面诊断，检测配置完整性
- `ace init` — 组件安装命令，list 展示的状态反映 init 的安装结果
