---
name: spec
type: api
token_count: 1250
generated_at: 2026-06-10T07:00:00Z
source_commit: a2436f6bab6a25323b68b03ae3335a660734bf2b
description: 在项目中初始化、诊断和更新规范驱动工作流（spec-driven workflow）
business_scenario: 团队在项目中使用规范驱动开发方式，将需求规格以结构化模板的形式管理与代码同步演进，需要一套工具来完成规范工作流的搭建、校验和模板更新
contract: ace spec <init|doctor|update> [target-path] [--force] [--dry-run] [--skip-openspec] [--team-repo <url>]
implementation_class: specInitCommand, specDoctorCommand, specUpdateCommand (src/commands/spec.js) + SpecInstaller 类 (src/core/spec-installer.js)
related_business: [规范驱动开发, 可执行规范, 团队规范, 项目脚手架, openspec框架]
external_deps:
  - @fission-ai/openspec: 规范命令行工具，提供 openspec init 和 --version 子命令，用于初始化规范框架和验证安装状态
  - js-yaml: 解析和序列化 YAML 格式的配置文件，支持规范配置的智能合并操作
  - fs-extra: 增强的文件系统操作库，用于复制模板文件、创建目录结构、检查文件存在性、读写配置文件
  - chalk: 终端文本着色工具，在控制台输出中区分不同状态（安装/跳过/合并/错误）
  - ora: 旋转加载动画工具，在执行耗时操作时提供用户友好的等待反馈
  - @clack/prompts: 交互式命令行提示组件，用于收集用户输入的 Git 仓库 URL 和确认选择
  - Git: 分布式版本控制系统，用于克隆团队规范仓库到目标目录
keywords: [规范驱动开发, spec-driven workflow, 可执行规范, 项目初始化, openspec, 规范模板, spec init, spec doctor, spec update]
---

# spec — 规范驱动工作流管理

## 业务场景

团队在项目中使用规范驱动（spec-driven）的开发方式，将需求规格以结构化模板的形式管理与代码同步演进。ace spec 提供三个子命令覆盖规范工作流的不同阶段：

- **ace spec init**：在项目中首次初始化规范工作流。安装 openspec CLI、创建 openspec/ 目录、安装规范模板文件（dimensions.md 等）和配置文件 config.yaml，并可选择从 Git 仓库初始化团队规范
- **ace spec doctor**：检查当前项目规范工作流的健康状况，验证 Node.js 版本、openspec CLI 可用性、目录结构完整性、配置文件有效性、模板文件齐全性以及 Git 可用性，并给出修复建议
- **ace spec update**：更新已有项目中的规范模板文件，不重复执行 openspec init 流程，专注于模板和配置文件的增量同步

## 业务输入 / 业务输出

- **输入**：
  - init：目标目录路径（可选，默认当前目录）、--force（覆盖已有文件）、--dry-run（试运行仅记录不实际操作）、--skip-openspec（跳过 openspec CLI 安装）、--team-repo <url>（团队规范 Git 仓库地址）
  - doctor：目标目录路径（可选，默认当前目录）
  - update：目标目录路径（可选，默认当前目录）

- **输出**：
  - init：
    - 安装 @fission-ai/openspec CLI（npm 全局安装）
    - 运行 openspec init 创建 openspec/ 目录框架
    - 安装 ACE 提供的规范模板文件到 openspec/templates/
    - 合并或首次安装 config.yaml 配置文件到 openspec/
    - 可选：从 Git 仓库克隆团队规范到目标目录
    - 控制台输出包含安装/合并/跳过/错误数量的汇总报告
  - doctor：
    - 逐项输出所有健康检查的通过或失败状态
    - 汇总通过数量与失败数量，失败时提示运行 ace spec init 修复
  - update：
    - 更新 openspec/templates/ 中的模板文件
    - 合并更新 openspec/config.yaml（保留用户自定义字段，覆盖 ACE 系统字段）
    - 控制台输出更新汇总报告

## 业务规则

1. **openspec CLI 安装**：运行 npm install -g @fission-ai/openspec 全局安装；如果系统已检测到 openspec 命令则自动跳过；可通过 --skip-openspec 跳过整个安装和初始化步骤
2. **模板安装**：目标模板文件已存在且非 --force 模式则跳过；dry-run 模式仅记录不执行实际文件操作
3. **配置合并**：config.yaml 已存在且非 --force 模式时执行智能合并——ACE 系统字段覆盖，用户自定义字段保留；合并前备份原文件
4. **团队规范初始化**：未提供 --team-repo 参数时交互式询问用户是否初始化，要求 Git URL 为 https:// 或 git@ 格式
5. **健康检查**：doctor 子命令依次检查 Node.js 版本（>= 18）、openspec CLI 可用、openspec/ 目录存在、config.yaml 包含 schema 和 version 字段、所有必需模板文件存在、Git 可用
6. **update 语义**：始终以 force=true 覆盖更新模板文件，明确跳过 openspec CLI 安装和 openspec init 步骤，仅做模板和配置文件的增量同步

## 调用链路

**init 入口**：
specInitCommand → SpecInstaller.run() → ensureOpenspecCli() → isOpenspecInstalled()（检查 openspec --version）→ runOpenspecInit()（执行 openspec init）→ installTemplates()（复制模板文件至 openspec/templates/）→ installConfig()（合并或安装 config.yaml）→ mergeSpecConfig()（YAML 智能合并）→ backupFile()（备份原配置文件）→ initTeamConventions() → TeamInstaller.run()（克隆团队规范仓库）

**doctor 入口**：
specDoctorCommand → SpecInstaller.doctor() → isOpenspecInstalled()（检查 openspec CLI）→ fs.pathExists()（多次检查目录、配置文件、模板文件存在性）→ 通过 execSync 检查 git --version

**update 入口**：
specUpdateCommand → SpecInstaller.installTemplates()（更新模板文件）→ SpecInstaller.installShared()（更新共享文件）→ SpecInstaller.installConfig()（合并更新 config.yaml）→ mergeSpecConfig() → backupFile()

## 外部依赖详情

| 依赖 | 业务用途 | 调用时机 |
|------|---------|---------|
| @fission-ai/openspec | 规范命令行工具，通过 openspec init 创建规范框架，通过 --version 验证安装 | init 阶段的 CLI 安装检查和框架初始化；doctor 阶段的安装验证 |
| js-yaml | 解析和序列化 openspec/config.yaml，支持 YAML 文档的加载、对比和智能合并 | init/update 阶段的 config.yaml 合并操作 |
| fs-extra | 文件系统增强库：复制模板文件、创建目录、检查文件存在、读写文件内容 | 三个子命令全程的文件操作 |
| chalk | 终端文本着色：区分安装（绿色）、跳过（黄色）、合并（蓝色）、错误（红色）等状态 | init/doctor/update 的控制台输出 |
| ora | 旋转加载动画：在 openspec 安装、模板安装、团队规范克隆等耗时操作中提供视觉反馈 | init/update 的耗时操作期间 |
| @clack/prompts | 交互式提示：p.confirm（确认是否初始化团队规范）、p.text（输入 Git 仓库 URL 并校验格式） | init 环节的交互式配置 |
| Git | 克隆团队规范仓库至目标目录，支持 https:// 和 git@ 协议 | init 阶段的团队规范初始化 |

## 主要实现类（定位锚点）

- **入口函数**：`specInitCommand()`、`specDoctorCommand()`、`specUpdateCommand()` — 位于 `src/commands/spec.js`
- **核心实现**：`SpecInstaller` 类 — 位于 `src/core/spec-installer.js`，包含 run、doctor、ensureOpenspecCli、runOpenspecInit、installTemplates、installConfig 等方法
- **团队规范**：`TeamInstaller` 类 — 位于 `src/core/team-installer.js`，处理 Git 仓库克隆
- **配置合并**：`mergeSpecConfig()` — 位于 `src/core/yaml-merger.js`
- **文件备份**：`backupFile()` — 位于 `src/core/merger.js`
- **常量定义**：`OPENSPEC_TEMPLATES_DIR`、`SPEC_TEMPLATE_FILES` — 位于 `src/core/constants.js`

## 相关入口

- ace doctor：用于整体检查 ACE 环境与项目配置的健康状态
- ace init：项目级初始化，spec 初始化是其子流程之一
