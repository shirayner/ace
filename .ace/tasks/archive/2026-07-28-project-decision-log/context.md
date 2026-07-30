# 项目级决策文档机制 — 目标与完成标准

## 用户目标
让 auto-goal 从"每任务孤立留痕"升级为"项目级决策持续沉淀"：
- 每次用 auto-goal 完成的任务，决策都汇聚到一份项目级决策文档
- 随使用累积，整个项目的决策逐步落地
- 后续在新目录凭该文档能复刻项目（语义/功能等价）

## 对齐结论
1. **复刻语义** = 语义/功能等价复刻（非精确字节复刻）。这是 ADR/spec 方案的天花板，已与用户确认接受。
2. **交付物** = 仅方案文档，不改 auto-goal skill 本身。
3. **组织形态** = 由 AI 调研业界方案后推荐。

## 完成标准
- 业界成熟方案调研（ADR、spec-driven、PRFAQ、living-documentation 等）
- 可行性边界诚实结论
- 推荐组织形态 + 理由 + 与 ACE/auto-goal 现有机制（state.json decisions、memory、context.md）的集成设计
- 用户可据以落地的步骤

## 现状事实（已勘查）
- auto-goal 每任务在 `$ROOT/.ace/tasks/{changeName}/` 下有 state.json（含 `simple.decisions[]` 数组）、context.md、artifacts/
- decisions 目前是任务级、孤立、无汇聚、无项目级视图
- 全局有 memory 机制（跨会话），但那是 AI 的经验记忆，非项目决策档案
