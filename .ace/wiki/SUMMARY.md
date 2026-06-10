---
name: ace
type: summary
token_count: 1200
description: 核心业务流程与领域模型知识地图，帮助理解系统"做什么"
---

# ace

## 快速查找

| 我想了解... | 看这个入口 |
|------------|-----------|
| 如何安装 ace 工具链？ | [init](./entries/api/init.md) |
| 如何验证安装是否完整？ | [doctor](./entries/api/doctor.md) |
| 如何查看各组件的安装状态？ | [list](./entries/api/list.md) |
| 如何在项目中搭建规范驱动工作流？ | [spec](./entries/api/spec.md) |
| 如何卸载 ace 工具链？ | [uninstall](./entries/api/uninstall.md) |
| 如何更新项目中的规范模板？ | [spec](./entries/api/spec.md) |
| 如何处理安装时的文件冲突？ | [init](./entries/api/init.md) |
| 如何从干净状态重新安装？ | [uninstall](./entries/api/uninstall.md) |

## 核心业务流程

### 初始化安装流程
- **概要**: 一键安装 ace 工具箱的 core、rules、plugin、hooks、scripts、memory 六大组件到 ~/.claude/ 目录，完成 Claude Code 增强环境的初始设置
- **入口**:
  - [init](./entries/api/init.md) — 提供冲突检测、智能合并、遗留迁移、备份快照等完整安装能力
  - [doctor](./entries/api/doctor.md) — 安装完成后全面验证各组件的部署完整性
  - [list](./entries/api/list.md) — 安装后以组件维度查看 installed/partial/missing 状态

### 规范工作流搭建流程
- **概要**: 在项目中初始化 openspec 框架、安装规范模板文件和配置文件，并可选择从 Git 仓库克隆团队规范
- **入口**:
  - [spec](./entries/api/spec.md) — 提供 init/doctor/update 三个子命令覆盖规范工作流全生命周期
  - [init](./entries/api/init.md) — spec init 依赖 init 的底层安装引擎和合并策略
  - [doctor](./entries/api/doctor.md) — 验证规范工作流健康状况，定位配置缺失或版本不兼容

### 卸载清理流程
- **概要**: 从 ~/.claude/ 目录中彻底清除 ace 管理的文件、插件、钩子脚本和配置修改，恢复环境到安装前状态
- **入口**:
  - [uninstall](./entries/api/uninstall.md) — 按规则目录、插件、钩子、配置恢复五步有序清理
  - [init](./entries/api/init.md) — 卸载后可通过 ace init 重新安装，init 的备份快照用于配置恢复

### 环境诊断流程
- **概要**: 全面诊断 Claude Code 环境的配置完整性，检查目录结构、配置文件、规则文件、插件注册、设置的引用有效性
- **入口**:
  - [doctor](./entries/api/doctor.md) — 所有检查项独立运行，以绿色/红色标记通过/失败状态
  - [init](./entries/api/init.md) — 诊断失败时提示用户运行 ace init 修复
  - [list](./entries/api/list.md) — 轻量级前置视图，快速定位缺失组件

### 组件安装状态查看流程
- **概要**: 遍历所有组件，按五种路径清单逐一检查文件存在性，以 installed/partial/missing 三级状态展示
- **入口**:
  - [list](./entries/api/list.md) — 支持非插件组件五种路径检查和插件组件缓存+清单双重校验
  - [init](./entries/api/init.md) — list 展示的状态直接反映 init 的安装结果
  - [doctor](./entries/api/doctor.md) — list 的校验逻辑是 doctor 深度检查的基础

## 核心领域模型

### 组件(Component)
- **定义**: ace 工具箱的基本模块单元，每个组件包含文件清单、目录结构和安装策略，是安装和管理的最小粒度
- **关联入口**:
  - [init](./entries/api/init.md) — 按组件顺序逐一调度安装，每种组件有专属安装方法
  - [list](./entries/api/list.md) — 按组件维度展示 installed/partial/missing 三级状态

### 插件(Plugin)
- **定义**: 可注册到本地插件市场的技能包，含 SKILL 定义和元数据，通过安装清单和已知市场清单管理生命周期
- **关联入口**:
  - [init](./entries/api/init.md) — 创建本地市场目录、复制插件文件、注册安装信息和市场信息
  - [uninstall](./entries/api/uninstall.md) — 删除插件缓存目录、清理市场注册、移除安装清单条目

### 钩子(Hook)
- **定义**: Claude Code 的安全控制脚本，控制命令执行权限和自动化行为，安装在 hooks/ 目录下
- **关联入口**:
  - [init](./entries/api/init.md) — 安装 ace 管理的钩子脚本到 ~/.claude/hooks/
  - [uninstall](./entries/api/uninstall.md) — 按文件清单逐一检查并删除钩子脚本

### 规则(Rule)
- **定义**: 认知与代码质量规则 markdown 文件，引导 Claude 的行为模式、设计偏好和代码风格
- **关联入口**:
  - [init](./entries/api/init.md) — 安装规则到 ace/rules/ 目录，支持递归目录安装
  - [list](./entries/api/list.md) — 检查规则文件的安装状态

### 规范工作流(Spec Workflow)
- **定义**: 基于 openspec 框架的结构化需求规格驱动开发方式，需求模板与代码同步演进
- **关联入口**:
  - [spec](./entries/api/spec.md) — 管理规范工作流的 init/doctor/update 全生命周期
  - [init](./entries/api/init.md) — 提供底层安装引擎支持 spec init 的模板和配置安装

### 配置文件合并(Config Merge)
- **定义**: CLAUDE.md 和 settings.json 的智能合并策略，包括标记区替换、深度对象合并和备份恢复机制
- **关联入口**:
  - [init](./entries/api/init.md) — 通过 mergeClaudeMd 标记区合并和 mergeSettingsJson 深度合并保留用户配置
  - [uninstall](./entries/api/uninstall.md) — 优先从 .pre-ace 备份恢复配置，无备份则外科手术式清理

### 团队规范(Team Convention)
- **定义**: 团队级别的规范仓库和约定模板，通过 Git 克隆分发到项目，实现团队级开发规范统一
- **关联入口**:
  - [spec](./entries/api/spec.md) — init 阶段通过 --team-repo 或交互式提示初始化团队规范
  - [init](./entries/api/init.md) — TeamInstaller 作为底层基础设施，支持团队规范的安装和更新

### 记忆模板(Memory Template)
- **定义**: 用户档案和项目记忆的模板文件，支持按角色定制，记录用户偏好和项目上下文
- **关联入口**:
  - [init](./entries/api/init.md) — 安装角色模板到 memory/ 目录，支持按角色定制安装
  - [list](./entries/api/list.md) — 检查 memory 组件的安装状态
