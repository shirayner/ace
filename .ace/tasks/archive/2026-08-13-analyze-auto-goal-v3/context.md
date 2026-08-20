# Auto Goal v3 深度分析

## 目标

对照 auto-goal v1 与 v3，解释 v3 在抽象层次、科学性和简洁性上的潜在退化，并提出更小、更可靠的重构蓝图。

## 完成标准

- 以文件证据还原 v1/v3 的核心抽象、状态机和协议依赖。
- 找出表层症状、机制根因和影响链，并按严重度排序。
- 明确保留、合并、下沉、删除的能力。
- 提出新的目标编排内核、扩展点和迁移路径。
- 覆盖运行可靠性、上下文成本、用户体验和交付质量。

## 过程记录

### 决策

- **D1**: 本轮只做诊断与重构蓝图，不修改 skill 文件 — 理由: 用户明确选择该范围，备选: 仅诊断、诊断后直接修改。
- **D2**: 将 shared protocols 纳入评价 — 理由: skill 的真实行为与上下文成本由完整协议依赖图决定。

### 中间结论

- v1 的核心是跨目标工作流不变量与可替换协议；v3 将决策树这一可选推理方法升级成通用目标本体，导致非树目标被过拟合。
- v3 的 Frontier、事实/意图分流、可证伪假设、独立 verifier 与 UNVERIFIABLE 值得保留，但应从决策树模型中解耦。
- 变异实跑确认验收契约断裂：0 条 criteria 可初始化；重复且不绑定标准的 `id=999` PASS verdict 可被 accept-report 接受。
- 重构方向：四阶段（DISCOVER → ALIGN → EXECUTE → VERIFY/CLOSE）、Goal Contract、uncertainty DAG、Work Graph、Evidence Ledger。
- 完整报告：`artifacts/diagnosis-and-refactor-blueprint.md`。

### 风险

- v1/v3 目录命名可能与历史演进版本不完全一致：通过 git 历史和文件内容核实，避免按名称猜测。

## 已修改文件

- `.ace/tasks/analyze-auto-goal-v3/state.json`: 初始化并跟踪分析状态。
- `.ace/tasks/analyze-auto-goal-v3/context.md`: 记录目标、标准、决策与结论。
- `.ace/tasks/analyze-auto-goal-v3/artifacts/diagnosis-and-refactor-blueprint.md`: 深度诊断与重构蓝图。
