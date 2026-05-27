# ace init 优化方案

> 设计哲学：**零问题直装，安装后告知定制路径**  
> 更新日期：2026-04-20

---

## 一、设计决策

### 核心简化

| 决策 | 原方案 | 新方案 | 理由 |
|------|--------|--------|------|
| Preset | 交互选择 full/safe/minimal | **固定 full** | 初始化就该给最完整的体验，减少不需要的选择 |
| Role | 交互选择 4 种角色 | **固定 fullstack** | 默认最通用角色，安装后提示用户自行修改 |
| 交互步骤 | 2 步（选角色 + 冲突处理） | **仅冲突处理**（有冲突时） | 零配置可用，只在真正需要决策时才问 |

### 新流程

```
ace init
  → intro（工具名 + 版本）
  → 冲突检测（静默）
  → [如有冲突] 展示冲突详情 + 询问处理方式
  → 安装全部组件（进度展示）
  → summary + next steps（引导 spec init → 开始工作 → 定制路径）
```

**无冲突时（首次安装），整个流程零交互、零问题**。这才是真正的零配置。

---

## 二、优化方向

### 方向一：用 @clack/prompts 重写 UI 层

**优先级：高** | **投入：低** | **影响：高**

**策略**：不做 inquirer → @clack 的逐 API 迁移，而是**直接用 @clack/prompts 重写 `init.js` 和 `ui.js`**。理由：

- init.js 流程已大幅简化（删除 role/preset 交互），剩余逻辑很少，重写比迁移更干净
- ui.js 中的 `clearScreen` / `renderScreen` / `printBanner` / `doneMessage` 等函数将被 @clack 的语义组件完全替代，不存在"复用旧代码"的价值
- 重写避免了"旧 API 思维套新库"的问题，直接用 @clack 的方式思考

**依赖变更**：

```diff
  "dependencies": {
    "commander": "^12.0.0",
-   "chalk": "^5.3.0",
-   "inquirer": "^9.2.0",
-   "ora": "^8.0.0",
+   "@clack/prompts": "^1.2.0",
    "fs-extra": "^11.2.0",
    "deepmerge": "^4.3.1",
    "js-yaml": "^4.1.0"
  }
```

> chalk 也可移除——init 命令的所有着色需求由 @clack 内置处理。如果 doctor/list 等其他命令仍需 chalk，可暂时保留，但 init 不再依赖它。

**@clack/prompts 核心 API（重写时使用）**：

| API | 用途 | 对应原 init 流程位置 |
|-----|------|---------------------|
| `p.intro(title)` | 开场，替代 clearScreen + printBanner | 流程起点 |
| `p.log.step(msg)` | 步骤标记 | 开始安装 |
| `p.log.success(msg)` | 成功状态（绿色 ✔） | 组件安装成功 |
| `p.log.info(msg)` | 信息状态（蓝色 ℹ） | 组件合并成功 |
| `p.log.warn(msg)` | 警告状态（黄色 ⚠） | 冲突/跳过提示 |
| `p.log.error(msg)` | 错误状态（红色 ✖） | 组件安装失败 |
| `p.log.message(msg)` | 中性信息（灰色） | 组件无变化 |
| `p.spinner()` | 加载动画 | 组件安装过程中 |
| `p.select(opts)` | 单选 | 冲突处理选择 |
| `p.confirm(opts)` | 确认 | 备用 |
| `p.note(msg, title)` | 信息块 | next steps 展示 |
| `p.outro(msg)` | 收束 | 流程结束 |
| `p.cancel(msg)` | 取消提示 | Ctrl+C 退出 |
| `p.isCancel(val)` | 检测取消 | 任何交互后检查 |

---

### 方向二：流程简化 + 冲突处理优化

**优先级：高** | **投入：中** | **影响：高**

#### 2a. 删除 Role 选择和 Preset 选择

Role 固定为 `fullstack`，Preset 固定为 `full`。重写时直接硬编码，无需保留旧交互逻辑。

**代码影响**：
- `init.js`：整文件重写，不再有 inquirer 相关代码
- `bin/ace.js`：移除 `--preset` 和 `--no-interaction` option
- `constants.js`：`PRESETS` / `ROLES` 常量保留（doctor/list 命令引用），但 init 不使用

#### 2b. 冲突处理优化

当前的"全部保留 vs 全部覆盖"粒度过粗。优化为**信息展示更清晰 + 默认策略更安全**：

```
│
│  ⚠ Found existing files
│
│  Will merge (preserves your changes):
│    CLAUDE.md — add missing @references
│    settings.json — merge new settings, keep your model/theme
│
│  Already exist (will skip by default):
│    rules/ace/thinking.md
│    rules/ace/clean-code.md
│    ... (3 more)
│
◆  How to handle existing files?
│  ● Keep existing — merge what's safe, skip the rest (Recommended)
│  ○ Overwrite all — replace everything with latest version
│  ○ Cancel
```

关键改进：
- **区分 merge 和 conflict**：让用户知道 CLAUDE.md/settings.json 是安全合并，不会丢数据
- **默认选项标记 (Recommended)**：降低决策负担
- **新增 Cancel 选项**：配合 `isCancel()` 优雅退出

#### 2c. 无冲突时完全静默

首次安装（无冲突）时，跳过所有交互，直接安装。这是**零配置可用**的极致体现。

---

### 方向三：对话节奏设计

**优先级：高** | **投入：低**（随方向一同步实现） | **影响：高（体感改善最大）**

#### 目标体验：首次安装（无冲突）

```
┌  ace v0.1.1

◇  Installing to ~/.claude/
│
│  ✔ Core Config — CLAUDE.md (new), settings.json (new)
│  ✔ Rules — 8 rule files
│  ✔ Plugin — ace v0.1.0
│  ✔ Hooks — java-compile-check.sh
│  ✔ Safety Guards — 7 hookify rules
│  ✔ Memory — MEMORY.md, user profile
│
│  ℹ  6 components installed, 20 files
│
│  Get started
│  1. cd <your-project> && ace spec init
│  2. Open Claude Code, type: /opsx:propose 创建某个需求的提案
│
│  Customize
│  ▸ Change role    edit ~/.claude/memory/user_profile.md
│  ▸ Adjust rules   edit ~/.claude/rules/ace/
│  ▸ Verify         ace doctor
│
└  Done. Go to your project and run ace spec init.
```

#### 目标体验：重复安装（有冲突）

```
┌  ace v0.1.1

│  ⚠ Found 5 existing files
│
│  Safe merge:
│    CLAUDE.md — add 3 missing @references
│    settings.json — merge new permissions
│
│  Skip (already exist):
│    rules/ace/thinking.md, rules/ace/clean-code.md, +3 more
│
◆  How to handle?
│  ● Keep & merge (recommended)
│  ○ Overwrite all
│  ○ Cancel
│
◇  Installing...
│
│  ✔ Core Config — 2 files (merged)
│  ✔ Rules — 3 new, 5 unchanged
│  ✔ Plugin — ace v0.1.0 (updated)
│  ~ Safety Guards — 7 files (unchanged)
│  ✔ Memory — skipped (exists)
│
│  ℹ  Updated 3 components, merged 2, skipped 12
│
│  Get started
│  1. cd <your-project> && ace spec init
│  2. Open Claude Code, type: /opsx:propose 创建某个需求的提案
│
│  Customize
│  ▸ Change role    edit ~/.claude/memory/user_profile.md
│  ▸ Adjust rules   edit ~/.claude/rules/ace/
│  ▸ Verify         ace doctor
│
└  Done. Go to your project and run ace spec init.
```

#### 设计要点

| 要素 | 设计决策 |
|------|----------|
| **intro** | `p.intro('ace v0.1.1')` — 极简，一行 |
| **不清屏** | 去掉 `clearScreen()`，保留完整上下文 |
| **竖线连接** | @clack 自带，形成视觉流 |
| **进度** | 每完成一个组件立即展示结果，用户有实时感知 |
| **统计摘要** | `p.log.info()` 一行总结 |
| **next steps** | `p.note()` 块，分两层：先引导工作流（spec init → /opsx:propose），再展示定制路径 |
| **outro** | `p.outro()` 收束，一句话 |

---

### 方向四：安装后引导（Next Steps）

**优先级：高** | **投入：低** | **影响：高**

这是简化 preset/role 交互后的**必要补偿**——不问用户选什么，但清晰告知下一步做什么、怎么定制。

Next Steps 分两层：**工作流引导**（核心路径）+ **定制引导**（可选路径）。

#### 核心路径：引导用户进入 spec-driven 工作流

```
Get started:
  1. cd <your-project> && ace spec init    初始化规范驱动开发
  2. Open Claude Code → /opsx:propose      创建需求提案
```

这是 ace 的**黄金路径**：全局环境初始化（ace init）→ 项目级规范初始化（ace spec init）→ 开始规范驱动开发（/opsx:propose）。

#### 定制路径：告知可修改的文件

```
Customize:
  ▸ Change role      edit ~/.claude/memory/user_profile.md
  ▸ Adjust rules     edit ~/.claude/rules/ace/
  ▸ Safety guards    edit ~/.claude/hookify.ace.*.local.md
  ▸ Verify setup     ace doctor
```

#### 代码实现

```javascript
p.note(
  [
    `${chalk.bold('Get started')}`,
    `  1. cd <your-project> && ace spec init`,
    `  2. Open Claude Code, type: /opsx:propose 创建需求提案`,
    ``,
    `${chalk.bold('Customize')}`,
    `  ▸ Change role      edit ~/.claude/memory/user_profile.md`,
    `  ▸ Adjust rules     edit ~/.claude/rules/ace/`,
    `  ▸ Safety guards    edit ~/.claude/hookify.ace.*.local.md`,
    `  ▸ Verify setup     ace doctor`,
  ].join('\n'),
  'Next steps'
);
```

**关键文件路径**（必须在 next steps 中展示）：

| 定制需求 | 文件路径 |
|----------|----------|
| 修改角色身份 | `~/.claude/memory/user_profile.md` |
| 调整认知规则 | `~/.claude/rules/ace/` |
| 修改安全守卫 | `~/.claude/hookify.ace.*.local.md` |
| 调整权限设置 | `~/.claude/settings.json` |
| 全局配置入口 | `~/.claude/CLAUDE.md` |

---

### 方向五：错误处理增强

**优先级：中** | **投入：低** | **影响：中**

为常见错误预设 What-Why-Fix 三段式消息：

```javascript
const ERROR_GUIDES = {
  EACCES: {
    why: 'Permission denied',
    fix: 'Check file permissions: chmod u+w ~/.claude/',
  },
  ENOSPC: {
    why: 'No space left on disk',
    fix: 'Free up disk space and retry',
  },
  TEMPLATE_MISSING: {
    why: 'ace installation may be corrupted',
    fix: 'Reinstall: npm install -g @shirayner/ace',
  },
  PLUGIN_FAIL: {
    why: 'Plugin registration failed',
    fix: 'Run ace doctor to diagnose, or use --force',
  },
};
```

组件安装失败时：

```
│  ✖ Rules — Permission denied writing rules/ace/thinking.md
│    Fix: Check permissions — chmod -R u+w ~/.claude/rules/
```

整体失败时使用 `p.log.error()` + `p.note()` 展示诊断建议。

---

### 方向六：CLI Flag 清理

**优先级：低** | **投入：低** | **影响：低**

既然 preset 和 role 不再需要交互选择，flag 也应对应简化：

```diff
  program
    .command('init')
    .description('Initialize AI coding environment')
-   .option('-p, --preset <name>', 'Installation preset: full, minimal, safe', 'full')
    .option('-f, --force', 'Overwrite existing files', false)
    .option('--dry-run', 'Show what would be done without making changes', false)
-   .option('--no-interaction', 'Skip interactive prompts, use defaults')
    .action(initCommand);
```

- **移除 `--preset`**：永远是 full
- **移除 `--no-interaction`**：唯一可能的交互是冲突处理，`--force` 已经能跳过它
- **保留 `--force`**：覆盖已有文件（跳过冲突询问）
- **保留 `--dry-run`**：预览模式

> 如果考虑向后兼容，可以保留 `--preset` 但标记 deprecated，一个版本后移除。

简化后的 flag：

```bash
ace init              # 零配置安装，有冲突时询问
ace init --force      # 强制覆盖，完全静默
ace init --dry-run    # 预览，不做任何更改
```

---

## 三、实施路径

```
Phase 1 — 用 @clack/prompts 重写
├── 替换依赖：移除 inquirer + ora + chalk，新增 @clack/prompts
├── 重写 init.js：全新实现，基于 @clack 语义组件
├── 重写 ui.js：仅保留 doctor/list 需要的工具函数，init 相关全部删除
├── 清理 bin/ace.js：移除 --preset, --no-interaction
├── 功能等价验证：首次安装 + 重复安装 + --force + --dry-run
└── 验证：目标体验 mockup 与实际输出一致

Phase 2 — 体验打磨
├── 冲突处理优化（区分 merge/conflict，展示更清晰）
├── Next Steps 引导（spec init → /opsx:propose → 定制路径）
├── 错误处理增强（What-Why-Fix）
├── Ctrl+C 优雅退出
└── 验证：边界情况（权限错误、磁盘满、模板缺失）
```

> Phase 1 是一次性重写，不存在"中间态"。因为 init.js 流程已大幅简化，重写的代码量远小于原有代码。

---

## 四、涉及的文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `package.json` | 修改 | 移除 inquirer + ora + chalk，新增 @clack/prompts |
| `src/commands/init.js` | **重写** | 全新实现，基于 @clack/prompts |
| `src/core/ui.js` | **精简** | 删除 init 专用函数，仅保留 doctor/list 共用的部分 |
| `bin/ace.js` | 修改 | 移除 --preset, --no-interaction |
| `src/core/installer.js` | 小改 | quiet 模式简化，dry-run 输出适配 |
| `src/core/constants.js` | 不变 | PRESETS/ROLES 保留供 doctor/list 使用 |
| `src/core/merger.js` | 不变 | 合并逻辑不涉及 UI |

---

## 五、附录：重写后的 init.js 完整骨架

```javascript
import * as p from '@clack/prompts';
import { createRequire } from 'module';
import { PRESETS, COMPONENTS } from '../core/constants.js';
import { Installer } from '../core/installer.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

const componentLabels = {
  core: 'Core Config',
  rules: 'Rules',
  plugin: 'Plugin',
  hooks: 'Hooks',
  hookify: 'Safety Guards',
  memory: 'Memory',
};

export async function initCommand(options) {
  const version = pkg.version;
  const components = PRESETS['full'];

  // ─── Intro ──────────────────────────────────
  p.intro(`ace v${version}`);

  // ─── Conflict detection ─────────────────────
  const installer = new Installer({
    force: options.force,
    dryRun: options.dryRun,
    role: 'fullstack',
    components,
    quiet: true,
  });

  let resolutions = {};

  if (!options.force) {
    const conflicts = await installer.detectConflicts();
    const conflictKeys = Object.keys(conflicts);

    if (conflictKeys.length > 0) {
      // 分类：可安全合并 vs 需要决策
      const totalFiles = conflictKeys.reduce((sum, k) => sum + conflicts[k].files.length, 0);
      const mergeComponents = conflictKeys.filter(k => conflicts[k].hasMerge);
      const conflictOnly = conflictKeys.filter(k => !conflicts[k].hasMerge);

      if (mergeComponents.length > 0) {
        p.log.info('Safe merge: CLAUDE.md, settings.json (preserves your changes)');
      }
      if (totalFiles > 0) {
        p.log.warn(`${totalFiles} existing file(s) found`);
      }

      const action = await p.select({
        message: 'How to handle existing files?',
        options: [
          { value: 'skip', label: 'Keep & merge', hint: 'recommended' },
          { value: 'overwrite', label: 'Overwrite all', hint: 'replace with latest' },
          { value: 'cancel', label: 'Cancel' },
        ],
        initialValue: 'skip',
      });

      if (p.isCancel(action) || action === 'cancel') {
        p.cancel('Setup cancelled.');
        process.exit(0);
      }

      for (const key of conflictKeys) {
        resolutions[key] = action;
      }
    }
  }

  installer.resolutions = resolutions;

  // ─── Dry-run notice ─────────────────────────
  if (options.dryRun) {
    p.log.warn('dry-run — no changes will be made');
  }

  // ─── Install ────────────────────────────────
  p.log.step('Installing to ~/.claude/');

  for (const componentName of components) {
    const component = COMPONENTS[componentName];
    if (!component) continue;

    const label = componentLabels[componentName] || componentName;
    const beforeInstalled = installer.results.installed.length;
    const beforeMerged = installer.results.merged.length;
    const beforeSkipped = installer.results.skipped.length;

    const s = p.spinner();
    s.start(label);

    try {
      await installer.installComponent(componentName, component);
      s.stop(label);

      const newInstalled = installer.results.installed.length - beforeInstalled;
      const newMerged = installer.results.merged.length - beforeMerged;
      const newSkipped = installer.results.skipped.length - beforeSkipped;

      if (newMerged > 0 && newInstalled === 0 && newSkipped === 0) {
        p.log.info(`${label} — merged`);
      } else if (newSkipped > 0 && newInstalled === 0 && newMerged === 0) {
        p.log.message(`${label} — unchanged`);
      } else {
        const count = newInstalled + newMerged;
        const detail = count > 0 ? `${count} file${count > 1 ? 's' : ''}` : '';
        p.log.success(`${label} — ${detail}`);
      }
    } catch (err) {
      s.stop(label);
      p.log.error(`${label} — ${err.message}`);
      installer.results.errors.push({ component: componentName, error: err.message });
    }
  }

  // ─── Summary ────────────────────────────────
  const { installed, merged, skipped, errors } = installer.results;
  const parts = [];
  if (installed.length > 0) parts.push(`${installed.length} installed`);
  if (merged.length > 0) parts.push(`${merged.length} merged`);
  if (skipped.length > 0) parts.push(`${skipped.length} skipped`);

  if (errors.length === 0) {
    p.log.success(parts.join(', '));
  } else {
    p.log.warn(`${parts.join(', ')}, ${errors.length} failed`);
  }

  // ─── Next Steps ─────────────────────────────
  p.note(
    [
      'Get started',
      '  1. cd <your-project> && ace spec init',
      '  2. Open Claude Code, type: /opsx:propose 创建需求提案',
      '',
      'Customize',
      '  Change role      edit ~/.claude/memory/user_profile.md',
      '  Adjust rules     edit ~/.claude/rules/ace/',
      '  Safety guards    edit ~/.claude/hookify.ace.*.local.md',
      '  Verify setup     ace doctor',
    ].join('\n'),
    'Next steps'
  );

  // ─── Outro ──────────────────────────────────
  if (errors.length === 0) {
    p.outro('Done. Go to your project and run ace spec init.');
  } else {
    p.outro('Done with errors. Run ace doctor to diagnose.');
  }
}
```
