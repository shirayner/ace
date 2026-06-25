# fix-archive-gap 任务上下文

## 根因
两步归档（ace task complete + ace task archive）被两个独立命令承载，
AI 可以在执行第一步后停止，SKILL.md 对此无机械阻力，仅有文字说明。

## 修复范围
1. **CLI 层** — 新增 `ace task done <changeName>`，内部顺序执行 complete → archive
2. **CLI 层** — `ace task list` 对 completed 但未归档的任务标记 `⚠ awaiting-archive`
3. **SKILL.md 层** — 归档节改写为 HARD-GATE，引用 `ace task done`（plugin + 已安装版）

## 完成标准
- `ace task done <name>` 一条命令完成 complete + archive，任一步失败中止
- `ace task list` 展示 awaiting-archive 状态
- SKILL.md 归档步骤有与对齐门禁等强的强制说明
- 两处 SKILL.md 同步（plugin 源 + 已安装版）
