# ace init UX 优化方案

> 目标：解决 ace init 输出冗余和冲突处理盲区两大问题
> 日期：2026-04-20

---

## 一、问题分析

### 1.1 输出冗余（每组件占 3 行，名称重复）

**现象**：6 个组件各输出 spinner 停止行 + 分隔行 + 结果行 = ~20 行，组件名出现两次。

**根因**：@clack/prompts 的 spinner 设计用于长耗时操作（网络请求、编译），但 ace 每个组件只做本地文件拷贝（< 100ms），spinner 的"开始→旋转→停止"语义不匹配实际速度。

**当前代码**（`init.js:82-116`）：
```js
for (const componentName of components) {
  const s = p.spinner();
  s.start(label);                    // 输出: spinning "Core Config"
  await installer.installComponent(componentName, component);
  s.stop(label);                     // 输出: ◇  Core Config    ← 第一次出现
  p.log.success(`${label} — 8 files`);  // 输出: ◆  Core Config — 8 files  ← 重复
}
```

### 1.2 冲突处理盲区（看不到细节，全有或全无）

**现象**：用户只看到"N existing file(s) found"，无法知道哪些文件会被覆盖、哪些会被安全合并。只能选"全部跳过"或"全部覆盖"。

**根因**：`detectConflicts()` 返回的数据是**组件级**聚合（`{files: string[], hasMerge: boolean}`），丢弃了文件级详情。同时，安全合并文件（CLAUDE.md、settings.json）和需要用户决策的文件（hookify rules）混在一起，用户无法区分风险等级。

**实际数据能力**（installer 已有但未暴露）：
- `results.merged[].added` — CLAUDE.md 合并时新增了哪些 @reference
- `results.installed[]` — 每个文件的精确路径
- 文件级 merge 策略信息 — `claude-md`、`settings-json`、`skip-existing`

---

## 二、方案设计

### 2.1 紧凑输出：单 Spinner + 摘要表

**原理**：用一个 spinner 覆盖整个安装过程，通过 `s.message()` 实时更新当前组件名。安装完成后，用 `p.log.message()` 输出紧凑摘要表。

**@clack/prompts 技术验证**：
- `s.message(msg)` 更新 spinner 文本但不停止旋转（已验证源码）
- `p.log.message('line1\nline2')` 每行都会加 `│  ` 前缀（已验证源码）
- 摘要表通过多行字符串一次输出，行间无空行分隔

**摘要表格式设计**：
```
◇  Installed to ~/.claude/
│
│  ◆ Core Config     merged
│  ◆ Rules           8 files
│  ◆ Plugin          installed
│  ◆ Hooks           1 file
│  ◆ Safety Guards   7 files
│  │ Memory          unchanged
│
◆  17 installed, 2 merged, 1 skipped
```

- `◆` 标记已安装/合并的组件（视觉锚点：有变化）
- `│` 标记未改动的组件（视觉锚点：无变化）
- `■` 标记失败的组件（红色，异常情况）
- 所有组件名左对齐，状态右对齐，形成表格视觉

**对比改进**：

| 维度 | 当前 | 优化后 |
|------|------|--------|
| 总行数（6 组件） | ~20 行 | ~8 行 |
| 组件名出现次数 | 2 次/组件 | 1 次/组件 |
| 进度感知 | 每组件独立 spinner | 单 spinner 显示当前步骤 |
| 语义密度 | 低（空行+分隔多） | 高（每行一个组件） |

### 2.2 冲突可视化：分类文件列表

**原理**：在提示用户选择前，按处理方式将文件分三类展示，让用户在做决策前看到全貌。

**分类逻辑**：

| 类别 | 匹配条件 | 处理方式 | 是否需要用户决策 |
|------|----------|----------|-----------------|
| Safe merge | `merge: 'claude-md'` 或 `'settings-json'` | 自动合并 | 否（始终执行） |
| Auto-skip | `merge: 'skip-existing'` | 自动跳过 | 否（始终跳过） |
| Conflict | 无 merge 策略 | 取决于用户选择 | **是** |

**展示格式设计**：

首次安装（无冲突）：无此节，直接进入安装。

升级安装（有已存在文件）：
```
│  Safe merge:
│    CLAUDE.md — adds 3 new @references
│    settings.json — merges permissions & plugins
│
│  Auto-skip:
│    memory/MEMORY.md — preserves your data
│
│  5 existing files:
│    hooks/ace.hookify.block-dangerous-ops.local.md
│    hooks/ace.hookify.code-quality-gate.local.md
│    hooks/ace.hookify.protect-secrets.local.md
│    hooks/ace.hookify.safe-git-commands.local.md
│    hooks/ace.hookify.require-verification.local.md
│
◆  How to handle 5 existing files?
│  ● Keep existing (recommended)
│  ○ Overwrite with latest
│  ○ Cancel
```

**CLAUDE.md 合并预览**：调用 `mergeClaudeMd()` 的纯函数模式（不写入磁盘），获取 `added` 数组长度，展示"adds N new @references"。若无新增，显示"up to date"。

**关键设计决策**：
1. 用户选择只影响 Conflict 类文件。Safe merge 和 Auto-skip 始终按策略执行，不受用户选择影响。
2. 仅当 Conflict 类文件存在时才展示选择提示。若只有 Safe merge 文件，显示信息但不需要决策。
3. prompt 文案改为"How to handle N existing files?"——明确告知影响范围。

---

## 三、实现方案

### 3.1 修改文件清单

| 文件 | 变更 |
|------|------|
| `src/commands/init.js` | 重写安装循环 + 冲突展示（主体改动） |
| `src/core/installer.js` | **不改** |
| `src/core/merger.js` | **不改** |
| `src/core/constants.js` | **不改** |

**设计原则**：所有变更限制在 UI 层（init.js），不改动 installer 核心逻辑。installer 的 `detectConflicts()` 仍可用但不再是唯一路径——init.js 直接扫描文件构建更丰富的预览。

### 3.2 新增辅助函数

#### `buildInstallPreview(installer, components)`

替代 `detectConflicts()`，返回文件级分类：

```js
/**
 * Scan target directory and categorize existing files by handling strategy.
 * @returns {{ merge: Array<{src, dest, strategy, detail?}>, skip: string[], conflict: string[] }}
 */
async function buildInstallPreview(installer, components) {
  const preview = { merge: [], skip: [], conflict: [] };

  for (const componentName of components) {
    const component = COMPONENTS[componentName];
    if (!component || component.isPlugin) continue;

    // Regular files
    if (component.files) {
      for (const file of component.files) {
        const destPath = path.join(installer.targetDir, file.dest);
        if (await fs.pathExists(destPath)) {
          if (file.merge === 'claude-md' || file.merge === 'settings-json') {
            preview.merge.push({ src: file.src, dest: file.dest, strategy: file.merge });
          } else if (file.merge === 'skip-existing') {
            preview.skip.push(file.dest);
          } else {
            preview.conflict.push(file.dest);
          }
        }
      }
    }

    // Rules directory
    if (component.rulesDir) {
      const srcDir = path.join(installer.templatesDir, component.rulesDir);
      const destDir = path.join(installer.targetDir, component.rulesDir);
      if (await fs.pathExists(srcDir)) {
        const files = (await fs.readdir(srcDir)).filter(f => f.endsWith('.md'));
        for (const f of files) {
          if (await fs.pathExists(path.join(destDir, f))) {
            preview.conflict.push(path.join(component.rulesDir, f));
          }
        }
      }
    }

    // Conditional files (role-dependent)
    if (component.conditional) {
      for (const file of component.conditional) {
        if (file.roles?.includes(installer.role)) {
          if (await fs.pathExists(path.join(installer.targetDir, file.dest))) {
            preview.conflict.push(file.dest);
          }
        }
      }
    }
  }

  // Enrich merge files with detail
  for (const item of preview.merge) {
    if (item.strategy === 'claude-md') {
      try {
        const existing = await fs.readFile(path.join(installer.targetDir, item.dest), 'utf-8');
        const template = await fs.readFile(path.join(installer.templatesDir, item.src), 'utf-8');
        const { added } = mergeClaudeMd(existing, template);
        item.detail = added.length > 0 ? `adds ${added.length} new @references` : 'up to date';
      } catch {
        item.detail = 'will merge';
      }
    } else if (item.strategy === 'settings-json') {
      item.detail = 'merges permissions & plugins';
    }
  }

  return preview;
}
```

#### `formatSummaryTable(componentResults)`

将组件安装结果格式化为紧凑摘要表：

```js
function formatSummaryTable(componentResults) {
  const maxLen = Math.max(...componentResults.map(r => r.label.length));
  return componentResults.map(r => {
    const padded = r.label.padEnd(maxLen);
    if (r.error)  return `■ ${padded}  ${r.error}`;
    if (r.merged > 0 && r.installed === 0 && r.skipped === 0) return `◆ ${padded}  merged`;
    if (r.skipped > 0 && r.installed === 0 && r.merged === 0) return `│ ${padded}  unchanged`;
    const count = r.installed + r.merged;
    return `◆ ${padded}  ${count} file${count > 1 ? 's' : ''}`;
  }).join('\n');
}
```

### 3.3 主流程重写（initCommand 伪代码）

```
intro(version)

if (!force):
  preview = buildInstallPreview()
  
  if preview has existing files:
    show Safe merge section (if any)
    show Auto-skip section (if any)
    
    if preview.conflict.length > 0:
      show conflict file list
      prompt: keep / overwrite / cancel
      set resolutions for all components
    else:
      log info about auto-merge (no action needed)

if dryRun: warn

spinner.start('Installing...')
for each component:
  spinner.message(`Installing ${label}...`)
  track before counts
  installComponent()
  track delta, push to componentResults
spinner.stop('Installed to ~/.claude/')

log.message(formatSummaryTable(componentResults))
log.success(total counts)

note(next steps)
outro(done message)
```

---

## 四、输出效果对比

### 4.1 首次安装

**当前（~24 行）**：
```
◇  ace v0.1.1-snapshot.5
│
◇  Installing to ~/.claude/
│
◇  Core Config
│
◆  Core Config — 2 files
│
◇  Rules
│
◆  Rules — 8 files
│
◇  Plugin
│
◆  Plugin — 1 file
│
◇  Hooks
│
◆  Hooks — 1 file
│
◇  Safety Guards
│
◆  Safety Guards — 7 files
│
◇  Memory
│
◆  Memory — 2 files
│
◆  21 installed
│
┌  Next steps
│  ...（8 行）
└
└  Done. Go to your project and run ace spec init.
```

**优化后（~16 行）**：
```
◇  ace v0.1.1-snapshot.5
│
◇  Installed to ~/.claude/
│
│  ◆ Core Config     2 files
│  ◆ Rules           8 files
│  ◆ Plugin          installed
│  ◆ Hooks           1 file
│  ◆ Safety Guards   7 files
│  ◆ Memory          2 files
│
◆  21 installed
│
┌  Next steps
│  ...（8 行）
└
└  Done. Go to your project and run ace spec init.
```

### 4.2 升级安装（已有文件，选择 Keep）

**当前**：
```
◇  ace v0.1.1-snapshot.5
│
●  Safe merge: CLAUDE.md, settings.json (preserves your changes)
│
▲  15 existing file(s) found
│
◆  How to handle existing files?
│  ● Keep & merge
│  ○ Overwrite all
│  ○ Cancel
│
◇  Installing to ~/.claude/
│
◇  Core Config
│
│  Core Config — unchanged
│
... （每组件 3 行 × 6 = 18 行）
│
◆  2 merged, 15 skipped
```

**优化后**：
```
◇  ace v0.1.1-snapshot.5
│
│  Safe merge:
│    CLAUDE.md — adds 2 new @references
│    settings.json — merges permissions & plugins
│
│  Auto-skip:
│    memory/MEMORY.md — preserves your data
│
│  5 existing files:
│    hooks/ace.hookify.block-dangerous-ops.local.md
│    hooks/ace.hookify.code-quality-gate.local.md
│    hooks/ace.hookify.protect-secrets.local.md
│    hooks/ace.hookify.safe-git-commands.local.md
│    hooks/ace.hookify.require-verification.local.md
│
◆  How to handle 5 existing files?
│  ● Keep existing (recommended)
│  ○ Overwrite with latest
│  ○ Cancel
│
◇  Installed to ~/.claude/
│
│  ◆ Core Config     merged
│  │ Rules           unchanged
│  ◆ Plugin          installed
│  │ Hooks           unchanged
│  │ Safety Guards   unchanged
│  │ Memory          unchanged
│
◆  2 merged, 1 installed, 15 skipped
│
┌  Next steps
│  ...
└
└  Done. Go to your project and run ace spec init.
```

### 4.3 --force 模式

无冲突检测，直接安装。输出与首次安装相同（摘要表显示 installed/overwritten）。

### 4.4 --dry-run 模式

安装循环正常执行（installer 内部 dry-run 不写盘），摘要表标注"(dry-run)"。

---

## 五、边界情况

| 场景 | 预期行为 |
|------|----------|
| 首次安装，无冲突 | 跳过整个冲突展示，直接安装 |
| 仅 CLAUDE.md 已存在（只有 merge 文件） | 显示 Safe merge 信息但**不弹出选择提示** |
| CLAUDE.md 已最新（added=0） | 显示 "up to date"，不显示 "adds 0 new" |
| 所有文件已存在（全量升级） | 完整展示三类文件 + 选择提示 |
| `--force` 跳过冲突检测 | 不调用 buildInstallPreview，直接安装 |
| 组件安装失败 | 摘要表显示 `■ ComponentName  error message` |
| 非 TTY 环境（CI/管道） | @clack/prompts 自动降级为无动画模式 |
