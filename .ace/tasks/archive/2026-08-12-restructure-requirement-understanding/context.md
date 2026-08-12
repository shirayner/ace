# 重构需求理解 Skill

## 目标

将 `plugin/skills/requirement-understanding` 重构为低负担的需求理解链路：读取一句话、PRD 内容或文档链接，沿因果决策树澄清，经纵横 Readiness 检查后仅生成五段式需求对齐卡，确认后进入 PRD 写作。

## 过程记录

### 决策

- **D1**: 不引入 Requirement Canvas — 理由：避免用户确认准 PRD 与正式 PRD 两遍长文；备选：Canvas 唯一语义载体。
- **D2**: 允许破坏性整体重构 — 理由：现有 V1/V2 和本机合并版三代概念冲突；备选：增量补强。
- **D3**: Frontier 是每轮派生的问题集合，不创建显式状态对象。
- **D4**: 唯一用户确认产物固定为用户诉求、目标、非目标、关键假设、完成标准五段式需求对齐卡。

### 中间结论

- 当前工作区删除了 `requirement-understanding-v2`，但 `plugin/agents/requirement-agent.md` 仍引用它，编排契约断裂。
- V1 的强项是可机械验证的 AskUserQuestion 门禁、防篡改、交互契约和逐决策点深度控制。
- Readiness 应决定何时可生成对齐卡；用户显式确认门禁决定何时可进入 PRD 写作。
- 方法只用于发现高价值缺口，不产生额外模型或用户可见报告。

### 风险

- 工作区已有大量用户修改；仅编辑本次明确范围，不覆盖无关改动。
- 详细规则若在多个引用文件重复会再次产生漂移；每类规则只设一个正本。

## 已修改文件

- `plugin/skills/requirement-understanding/SKILL.md` — 渐进披露入口与完成边界。
- `plugin/skills/requirement-understanding/references/flow.md` — 需求画像、因果澄清、Frontier 与 Readiness 正本。
- `plugin/skills/requirement-understanding/references/alignment-gate.md` — 五段式需求对齐卡与显式确认门禁。
- `plugin/skills/requirement-understanding/references/ask-user-guide.md` — 1–4 问交互契约与审批语义。
- `plugin/skills/requirement-understanding/references/packs.md` — 按问题信号加载的方法包。
- 删除 `clarify-leveling.md` 与 `grill-techniques.md`，避免重复真相源和机械深挖。

## 验证进度

- T1 已完成；三份主流程文件通过 `git diff --check`，待与交互方法包和统一代理契约做集成验证。
