# Requirement Anchors Analysis Skill 落盘计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `requirement-anchors-analysis` Skill 集成到 ace 项目中，确保 `ace init` 正确安装，`ace doctor` 正确校验。

**Architecture:** Skill 文件（SKILL.md + 2 templates）已写入 `plugin/skills/requirement-anchors-analysis/`。由于 ace plugin 组件将整个 `plugin/` 目录复制安装，Skill 文件自动随插件分发。只需更新两处注册引用：插件描述文本和 doctor 检查列表。

**Tech Stack:** Node.js, fs-extra

---

## 前置检查

- [ ] **Step 1: 验证 Skill 文件结构完整性**

```bash
ls -la plugin/skills/requirement-anchors-analysis/SKILL.md
ls -la plugin/skills/requirement-anchors-analysis/templates/requirement-anchors-analysis.md
ls -la plugin/skills/requirement-anchors-analysis/templates/requirement-issues.md
```

Expected: 三个文件均存在。

- [ ] **Step 2: 对比现有 Skill 结构确认一致性**

```bash
ls plugin/skills/auto-goal/
ls plugin/skills/requirement-anchors-analysis/
```

Expected: 两个目录结构模式一致（SKILL.md + 可选 templates/）。

---

### Task 1: 更新插件描述

**Files:**
- Modify: `src/core/constants.js:105`

- [ ] **Step 3: 添加 requirement-anchors-analysis 到 COMPONENTS.plugin.description**

```javascript
// Before (line 105):
description: 'Ace plugin (skills: auto-goal, ut, code-review, skill-creator, skill-optimize; commands: report)',

// After:
description: 'Ace plugin (skills: auto-goal, ut, code-review, skill-creator, skill-optimize, requirement-anchors-analysis; commands: report)',
```

Edit `src/core/constants.js`:
```javascript
    description: 'Ace plugin (skills: auto-goal, ut, code-review, skill-creator, skill-optimize, requirement-anchors-analysis; commands: report)',
```

- [ ] **Step 4: 提交**

```bash
git add src/core/constants.js
git commit -m "feat: add requirement-anchors-analysis to plugin skill list"
```

---

### Task 2: 更新 doctor 技能检查列表

**Files:**
- Modify: `src/commands/doctor.js:44`

- [ ] **Step 5: 添加 requirement-anchors-analysis 和 spechub-coding 到 skillNames 数组**

当前 skillNames 数组（line 44）缺少 `spechub-coding` 和 `requirement-anchors-analysis`，一起补上。

```javascript
// Before (line 44):
const skillNames = ['auto-goal', 'ut', 'code-review', 'skill-creator', 'skill-optimize'];

// After:
const skillNames = ['auto-goal', 'ut', 'code-review', 'skill-creator', 'skill-optimize', 'spechub-coding', 'requirement-anchors-analysis'];
```

Edit `src/commands/doctor.js`:
```javascript
    const skillNames = ['auto-goal', 'ut', 'code-review', 'skill-creator', 'skill-optimize', 'spechub-coding', 'requirement-anchors-analysis'];
```

- [ ] **Step 6: 提交**

```bash
git add src/commands/doctor.js
git commit -m "feat: add requirement-anchors-analysis and spechub-coding to doctor skill checks"
```

---

### Task 3: 验证

- [ ] **Step 7: 运行 lint 检查**

```bash
npm run lint
```

Expected: 0 errors。

- [ ] **Step 8: 确认 Skill 随插件安装**

```bash
# 检查 PLUGIN_SRC_DIR 指向的目录结构
node -e "
const path = require('path');
const { PLUGIN_SRC_DIR } = require('./src/core/constants.js');
console.log('PLUGIN_SRC_DIR:', PLUGIN_SRC_DIR);
const fs = require('fs');
const skillsDir = path.join(PLUGIN_SRC_DIR, 'skills');
console.log('Skills:', fs.readdirSync(skillsDir));
"
```

Expected: 输出包含 `requirement-anchors-analysis`。

- [ ] **Step 9: 最终提交（如有遗漏文件）**

```bash
git status
# 如有未跟踪文件，评估是否需要纳入
```
