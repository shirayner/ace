# 用 ask-user-guide.md 替代 interactive-clarify.md

## 目标

以 `templates/ace/rules/ask-user-guide.md` 替代 `templates/ace/rules/interactive-clarify.md` 成为 ACE 全局常驻规则，同时精简 ask-user-guide.md 内容 —— 前提是问题澄清与审批确认两条门禁仍能正确执行。

## 探索发现

1. **installer 动态扫描，无硬编码清单** — `src/core/installer.js:491 installRulesDir()` 与 `src/commands/doctor.js:41` 均 `readdir(templates/ace/rules)`，因此增删规则文件**不需要改任何代码，也不需要改测试**。
2. **installer 不清理孤儿文件** — `installRulesDir` 只做覆盖拷贝。已安装用户升级后 `~/.claude/ace/rules/interactive-clarify.md` 会残留在磁盘，但 `merger.js` 会从 CLAUDE.md 移除对应 @import → 文件不再被加载，属无害残留。本次不加清理逻辑（超范围），仅 CHANGELOG 提示。
3. **存在近乎重复的副本** — `templates/ace/rules/ask-user-guide.md` 与 `plugin/skills/coding/spec-coding/references/ask-user-guide.md` 内容几乎完全相同（仅空行与表格对齐差异）。DRY 隐患，用户决定本次不动，仅记录。
4. **另一套独立契约** — `plugin/skills/coding/requirement-understanding/references/ask-user-guide.md` 是完全不同的严格版契约（含 Markdown 降级示例、单候选项"待确认建议"规则、Other 一律视为不通过）。**不在本次范围。**
5. **interactive-clarify 独有内容** — `preview` 字段展示方案差异；跨平台（其他 AI 编码工具）映射说明。二者均吸收进新文件。

## 引用面清单

| 位置 | 处理 |
|------|------|
| `templates/CLAUDE.md:21` | 改 @import 为 ask-user-guide.md |
| `docs/architecture.md:79` | 表格更名 |
| `docs/getting-started.md:151` | 表格更名 |
| `CHANGELOG.md:142,176` | 历史条目，不改；新增本次条目 |
| `reports/**`、`.ace/tasks/archive/**` | 历史快照，不改 |

## 完成标准

见 `state.json` 的 `completion_criteria`。

## 执行结果

- `templates/ace/rules/ask-user-guide.md` 新建，69 行（原 98 行，-30%）
- `templates/ace/rules/interactive-clarify.md` 已 `git rm`
- `templates/CLAUDE.md:21` @import 已换
- `docs/architecture.md:79`、`docs/getting-started.md:151` 表格已更名
- CHANGELOG Unreleased/Changed 已记录（含孤儿文件残留提示 + 副本待收敛待办）

## 验证归因

npm test: 625 tests / 617 pass / 3 fail —— 3 个失败全部与本次改动无关：

| 失败测试 | 归因证据 |
|---|---|
| `SKILL.md fits the always-loaded budget` | `git stash` 基线同样失败 → 既有失败 |
| `each documented category lists exactly its own skills` | 移开未跟踪的新 skill `code-review-pro` 后即通过 |
| `empty graph: neither an unplanned goal nor an empty plan can close` | 隔离运行通过 → 并发偶发 |

与 rules 目录相关的测试全绿，证实 installer 动态扫描假设成立（无需改代码/测试）。

## 工作树注意

以下变更**非本次任务所为**，执行前即存在，未做处理：
- `plugin/skills/coding/git-commit/SKILL.md`（modified）
- `plugin/skills/coding/spec-coding/references/ask-user-guide.md`（modified，仅列表前空行格式化）
- `plugin/skills/coding/code-review-pro/`（untracked 新 skill，导致 docs-skill-catalog 测试失败）
