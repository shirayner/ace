# ace 与 mspec-cli 整合方案

> 分析日期: 2026-04-15
> 分析主题: 将 mspec-cli 的 spec coding 能力整合到 ace 中，实现一键 AI 开发环境构建

## 1. 现状分析

### 1.1 两个项目的定位

| 维度 | ace | mspec-cli |
|------|-----|-----------|
| **定位** | 一键构建 Claude Code 开发环境 | 一键安装 spec coding 工作流 |
| **作用域** | 用户级（`~/.claude/`） | 项目级（`项目/openspec/`） |
| **技术栈** | Node.js (Commander + Inquirer) | Python (Click + Rich) |
| **分发** | npm (`@shirayner/ace`) | PyPI (`mspec-cli`) |
| **安装物** | rules, skills, hooks, memory 模板 | spec 模板, taxonomy, config.yaml |
| **外部依赖** | 无 | `@fission-ai/openspec` npm 包 |

### 1.2 架构同构性

两个项目在架构上高度同构——都是 **模板安装器**：

```
ace:     templates/ → Installer → ~/.claude/{rules,hooks,memory,...}
mspec:   templates/ → TemplateManager → 项目/openspec/{templates,config.yaml}
```

核心能力完全对等：

| 能力 | ace (Node.js) | mspec (Python) |
|------|---------------|----------------|
| 模板复制 | `fs-extra.copy` | `shutil.copytree` |
| 配置合并 | `merger.js` (CLAUDE.md, settings.json) | `config.py` (config.yaml) |
| 健康检查 | `ace doctor` | `mspec doctor` |
| 幂等安装 | skip-existing / smart merge | config merge 保留用户字段 |
| 备份恢复 | `.ace-backup` + `.pre-ace` | `~/.mspec/backups/` |
| 交互式初始化 | Inquirer prompts | questionary/click prompts |

### 1.3 mspec 的核心价值拆解

mspec-cli 的价值 **不在 Python 代码**，而在以下三层资产：

**第一层：模板资产（纯 Markdown/YAML，语言无关）**
- `config.yaml` — 寄生模式配置，注入 AI 工作流指令
- `taxonomy/` — 需求 6 维度 + 设计 7 维度的检查框架
- `issues/` — 每次变更的问题跟踪模板
- `evolution/` — ADR、术语表、风险地图
- `procedures/` — 澄清流程、交互协议、演进系统
- `retrospective-template.md` — 9 维度回顾模板

**第二层：安装逻辑（~200 行有效代码）**
- 模板目录创建与复制
- config.yaml YAML 合并（保留用户字段，更新系统字段）
- `@fission-ai/openspec` npm 包检测与安装
- 6 项健康检查

**第三层：更新机制**
- PyPI 版本检查 + 远程模板下载
- 带备份的升级流程

**关键判断**：第一层是不可替代的领域知识，第二层在 ace 的 Node.js 架构中可以用更少代码复现，第三层随 ace 的版本管理自然获得。

### 1.4 为什么应该整合

1. **用户体验碎片化** — 当前用户需要 `npm install -g @shirayner/ace` + `pip install mspec-cli`，两种包管理器、两套命令、两套升级流程
2. **功能天然包含** — ace 的目标是"一键构建 AI 开发环境"，spec coding 是 AI 开发的核心工作流，不应是独立工具
3. **架构已就绪** — ace 的 Installer 组件化架构天然支持添加新组件，不需要架构变更
4. **消除 Python 依赖** — 对 Node.js 开发者来说，Python 依赖是额外摩擦

## 2. 推荐方案：原生整合

### 2.1 方案选型

| 方案 | 描述 | 优势 | 劣势 |
|------|------|------|------|
| **A. ace 调用 mspec** | ace init 时 `pip install mspec-cli && mspec init` | 最小改动 | 保留 Python 依赖，两套升级 |
| **B. 原生整合（推荐）** | 迁移模板到 ace，用 JS 重写安装逻辑 | 单一工具，零外部依赖 | 需移植 ~200 行逻辑 |
| **C. monorepo 共存** | ace 和 mspec 共享模板仓库 | 模板统一 | 仍是两个工具 |

**推荐方案 B：原生整合**。理由：
- mspec 的安装逻辑简单（模板复制 + YAML 合并），ace 的 Installer 已有同构能力
- 模板资产是纯 Markdown/YAML，零迁移成本
- ace 的组件注册表设计天然支持扩展
- 用户只需 `npm install -g @shirayner/ace`，一个命令覆盖全部

### 2.2 整体架构

整合后 ace 将覆盖两个作用域：

```
ace init                    → 用户级环境（~/.claude/）      [已有]
ace spec init [project]     → 项目级 spec 工作流（openspec/） [新增]
ace spec doctor [project]   → 项目 spec 健康检查              [新增]
ace spec update [project]   → 更新项目 spec 模板              [新增]
```

架构层次：

```
ace CLI (bin/ace.js)
├── ace init          → Installer (用户级组件)
│   ├── core          → CLAUDE.md, settings.json
│   ├── rules         → rules/ace/*.md
│   ├── plugin        → skills, commands
│   ├── hooks         → java-compile-check 等
│   ├── hookify       → 安全守卫规则
│   └── memory        → MEMORY.md, 角色模板
│
└── ace spec init     → SpecInstaller (项目级组件)  ← 新增
    ├── openspec CLI  → 检测/安装 @fission-ai/openspec
    ├── config.yaml   → 寄生模式配置（YAML 合并）
    ├── templates/    → taxonomy, issues, procedures, evolution
    └── doctor        → 6 项健康检查
```

### 2.3 命令设计

#### `ace spec init [path]`

项目级 spec coding 工作流初始化。

```
ace spec init                    # 当前目录
ace spec init ./my-project       # 指定项目
ace spec init --force            # 强制覆盖
ace spec init --dry-run          # 预览模式
ace spec init --skip-openspec    # 跳过 openspec CLI 安装
```

流程：
1. 检测目标目录是否已有 `openspec/`
2. 检测 `@fission-ai/openspec` 是否全局安装，未安装则提示并自动安装
3. 执行 `openspec init`（创建基础目录结构）
4. 复制 spec 模板到 `openspec/templates/`
5. 合并 `config.yaml`（保留用户自定义，更新系统字段）
6. 运行快速健康检查

#### `ace spec doctor [path]`

```
ace spec doctor                  # 检查当前目录
```

检查项（复用 mspec 的 6 项）：
- Node.js 版本
- `@fission-ai/openspec` 是否安装
- `openspec/` 目录存在
- `config.yaml` 存在且有 schema 字段
- 8 个必需模板文件完整
- Git 是否可用

#### `ace spec update [path]`

```
ace spec update                  # 更新当前项目的 spec 模板
ace spec update --backup         # 更新前备份（默认行为）
```

流程：
1. 读取当前 `config.yaml` 版本
2. 对比 ace 内置模板版本
3. 备份现有 `openspec/` 到 `.ace-backup/`
4. 覆盖模板文件，合并 config.yaml
5. 验证更新结果

### 2.4 文件结构变更

ace 项目新增的文件：

```
ace/
├── src/
│   └── commands/
│       └── spec.js              # 新增：ace spec 子命令组
│   └── core/
│       ├── spec-installer.js    # 新增：项目级 spec 安装器
│       └── yaml-merger.js       # 新增：YAML 配置合并
├── templates/
│   └── openspec/                # 新增：从 mspec 迁移的模板
│       ├── config.yaml
│       ├── taxonomy/
│       │   ├── requirement-issue-taxonomy.md
│       │   └── design-issue-taxonomy.md
│       ├── issues/
│       │   ├── requirement-issues.md
│       │   ├── design-issues.md
│       │   └── retrospective-notes.md
│       ├── evolution/
│       │   ├── adr.md
│       │   ├── glossary.md
│       │   └── risk-map.md
│       ├── procedures/
│       │   ├── requirement-clarification-flow.md
│       │   ├── design-clarification-flow.md
│       │   ├── interactive-clarification-protocol.md
│       │   └── evolution-system.md
│       └── retrospective-template.md
```

### 2.5 组件注册表扩展

在 `constants.js` 的 `COMPONENTS` 中新增 spec 相关条目：

```javascript
// 项目级组件（新增分类）
'openspec-cli': {
  type: 'npm-global',
  package: '@fission-ai/openspec',
  description: 'OpenSpec CLI for spec-driven development'
},
'spec-config': {
  type: 'project-file',
  source: 'openspec/config.yaml',
  target: 'openspec/config.yaml',
  merge: 'yaml-config',  // 新增合并策略
  description: 'Spec workflow configuration (parasitic mode)'
},
'spec-templates': {
  type: 'project-directory',
  source: 'openspec/',
  target: 'openspec/templates/',
  merge: 'skip-existing',
  description: 'Spec taxonomy, issues, procedures, evolution templates'
}
```

### 2.6 新增依赖

| 包 | 用途 | 是否必须 |
|----|------|----------|
| `js-yaml` | config.yaml 解析与合并 | 是（新增） |

仅需新增 1 个依赖。`fs-extra`（已有）处理目录复制，`deepmerge`（已有）可辅助对象合并。

## 3. 实现路线图

### Phase 1：模板迁移 + 基础命令（核心交付）

**目标**：`ace spec init` 可用，替代 `mspec init` 的核心功能。

**步骤**：

1. **迁移模板资产**
   - 将 `mspec-cli/src/mspec/templates/` 下所有文件复制到 `ace/templates/openspec/`
   - 保持目录结构不变（config.yaml, taxonomy/, issues/, evolution/, procedures/）
   - 验证文件完整性（13 个文件）

2. **实现 `yaml-merger.js`**
   - config.yaml 合并逻辑：系统字段（schema, version）覆盖，用户字段保留
   - 复用 mspec 的 `ConfigManager.merge_with_new()` 语义
   - 依赖 `js-yaml` 解析 YAML

3. **实现 `spec-installer.js`**
   - OpenSpec CLI 检测：`which openspec` 或 `npm list -g @fission-ai/openspec`
   - OpenSpec CLI 自动安装：`npm install -g @fission-ai/openspec`
   - 调用 `openspec init`：`child_process.execSync('openspec init', { cwd: targetDir })`
   - 模板复制：遍历 `templates/openspec/` 复制到目标 `openspec/`
   - config.yaml 合并写入

4. **实现 `spec.js` 命令**
   - 注册 `ace spec` 命令组
   - 实现 `ace spec init [path]` 子命令
   - 支持 `--force`, `--dry-run`, `--skip-openspec` 选项

5. **更新 `package.json`**
   - 添加 `js-yaml` 依赖
   - 将 `templates/openspec/` 加入 `files` 字段

**交付物**：`ace spec init` 功能完整可用
**预估新增代码**：~300 行 JavaScript

### Phase 2：Doctor + Update + 集成优化

**目标**：完善 spec 子命令组，整合到 ace 现有的 doctor/list 体系。

**步骤**：

1. **实现 `ace spec doctor`**
   - 移植 mspec 的 6 项检查
   - 可选：整合进 `ace doctor`，当检测到项目有 `openspec/` 时自动检查

2. **实现 `ace spec update`**
   - 读取目标项目 `openspec/config.yaml` 版本
   - 对比 ace 内置模板版本
   - 备份 + 覆盖模板 + 合并配置
   - 输出变更摘要

3. **`ace list` 集成**
   - 在 `ace list` 输出中增加 spec 组件状态
   - 区分显示用户级组件和项目级组件

4. **`ace init` 联动**
   - 在 `ace init` 流程末尾提示："是否要为当前项目初始化 spec 工作流？"
   - 仅提示，不强制

### Phase 3：增强功能（可选）

**目标**：超越 mspec 原有功能，发挥 ace 生态优势。

**可选增强**：

1. **spec 模板定制**
   - `ace spec init --preset minimal` — 仅安装 taxonomy + config
   - `ace spec init --preset full` — 完整安装（默认）
   - 允许用户选择跳过特定模板类别

2. **spec skill 集成**
   - 在 ace plugin 中增加 spec 相关 skill（如 `/spec-review`）
   - 利用 ace 的 auto-goal skill 增强 spec 工作流

3. **模板版本管理**
   - ace 内置模板随 npm 版本更新
   - 支持 `ace spec update --remote <url>` 从自定义源更新

## 4. 关键实现细节

### 4.1 config.yaml 合并策略

这是整合中最关键的逻辑。mspec 的合并语义：

```yaml
# 系统字段：始终覆盖
schema: "openspec/v1"        # 覆盖
version: "5.0.3"             # 覆盖

# 用户字段：保留
language: "zh"               # 保留用户选择

# context 字段：模板覆盖（因为包含 AI 指令，版本敏感）
context: |
  ...                        # 覆盖

# rules 字段：合并
rules:                       # 合并（模板规则覆盖同名，用户自定义规则保留）
  proposal: "..."            # 覆盖
  custom_stage: "..."        # 保留（用户自定义）
```

Node.js 实现要点：
```javascript
// yaml-merger.js 核心逻辑
import yaml from 'js-yaml';

const SYSTEM_FIELDS = ['schema', 'version', 'context'];
const USER_FIELDS = ['language'];

function mergeConfig(existing, template) {
  const merged = { ...existing };
  // 系统字段：覆盖
  for (const field of SYSTEM_FIELDS) {
    if (template[field] !== undefined) merged[field] = template[field];
  }
  // 用户字段：保留
  // （不操作，existing 值已在 merged 中）
  // rules：合并（模板优先，保留用户自定义）
  if (template.rules) {
    merged.rules = { ...existing.rules, ...template.rules };
  }
  return merged;
}
```

### 4.2 OpenSpec CLI 检测与安装

```javascript
// spec-installer.js 中的 openspec 管理
import { execSync } from 'child_process';

function isOpenSpecInstalled() {
  try {
    execSync('openspec --version', { stdio: 'pipe' });
    return true;
  } catch { return false; }
}

async function ensureOpenSpec(spinner) {
  if (isOpenSpecInstalled()) return;
  spinner.text = 'Installing @fission-ai/openspec...';
  execSync('npm install -g @fission-ai/openspec', { stdio: 'pipe' });
}

function runOpenSpecInit(targetDir) {
  execSync('openspec init', {
    cwd: targetDir,
    stdio: 'inherit'  // 透传交互式输出
  });
}
```

### 4.3 命令注册模式

沿用 ace 现有的 Commander.js 模式：

```javascript
// bin/ace.js 新增
const spec = program
  .command('spec')
  .description('Manage spec-driven development workflow');

spec
  .command('init [path]')
  .description('Initialize spec workflow in a project')
  .option('-f, --force', 'Overwrite existing configuration')
  .option('--dry-run', 'Preview without making changes')
  .option('--skip-openspec', 'Skip openspec CLI installation')
  .action(specInitCommand);

spec
  .command('doctor [path]')
  .description('Check spec workflow health')
  .action(specDoctorCommand);

spec
  .command('update [path]')
  .description('Update spec templates to latest version')
  .action(specUpdateCommand);
```

## 5. 风险与决策点

### 5.1 需要决策的问题

| # | 问题 | 选项 | 建议 |
|---|------|------|------|
| 1 | `openspec init` 交互模式 | A) 透传交互 B) ace 接管交互后静默调用 | A — 保持 openspec 原生体验，降低维护负担 |
| 2 | mspec-cli 后续处置 | A) 停止维护，README 指向 ace B) 继续独立维护 | A — 避免双线维护 |
| 3 | 模板版本是否与 ace 版本绑定 | A) 绑定（随 ace 发版） B) 独立版本号 | A — 简单，单一版本源 |
| 4 | `ace init` 是否自动提示 spec | A) 是，追问用户 B) 否，spec 完全独立命令 | B — 保持 init 简洁，spec 是按需功能 |
| 5 | 已有 mspec 用户的迁移 | A) 提供 `ace spec migrate` B) 文档说明手动迁移 | B — 用户少，手动迁移足够 |

### 5.2 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| `@fission-ai/openspec` 版本不兼容 | 中 | 低 | 锁定已验证版本，doctor 检查版本 |
| config.yaml 合并丢失用户数据 | 高 | 低 | 合并前自动备份，dry-run 预览 |
| openspec CLI 安装失败（网络/权限） | 中 | 中 | `--skip-openspec` 跳过，清晰错误提示 |
| 模板更新破坏用户自定义 | 中 | 低 | 只更新模板文件，config.yaml 合并保留用户字段 |

### 5.3 mspec-cli 迁移策略

整合完成后，mspec-cli 建议：
1. 发布最终版本，README 注明 "已整合到 ace，请使用 `npm i -g @shirayner/ace && ace spec init`"
2. PyPI 包保留但不再更新
3. 代码仓库归档

## 6. 总结

### 整合本质

将 mspec-cli 整合到 ace **不是重写**，而是：
- **迁移** 13 个模板文件（零改动，直接复制）
- **移植** ~200 行 Python 安装逻辑为 ~300 行 JavaScript
- **复用** ace 已有的 Installer 架构、备份机制、doctor 框架

### 工作量估算

| 阶段 | 新增文件 | 新增代码量 | 核心工作 |
|------|----------|------------|----------|
| Phase 1 | 3 个 JS + 13 个模板 | ~300 行 JS | spec-installer, yaml-merger, spec 命令 |
| Phase 2 | 0-1 个 JS | ~150 行 JS | doctor, update, list 集成 |
| Phase 3 | 可选 | ~100 行 JS | preset, skill 增强 |

### 关键收益

1. **用户只需一个工具** — `npm i -g @shirayner/ace`，涵盖环境 + 工作流
2. **零 Python 依赖** — 对 Node.js 用户友好
3. **统一升级** — `npm update -g @shirayner/ace` 同时更新环境和 spec 模板
4. **架构自然** — ace 的组件化设计天然支持，无需架构变更
