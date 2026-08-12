# 降低 auto-goal 主 Agent 上下文占用

## 目标

静态审计 auto-goal 及其直接依赖，解释主 Agent 上下文膨胀和压缩失效的结构性原因，并给出以控制面/数据面分离为核心的可落地重构方案。

## 完成标准

- 给出按阶段和来源拆分、且有文件证据支撑的主上下文膨胀模型。
- 区分结构性占用、偶发输出污染与压缩恢复脆弱性，并排序根因。
- 定义主 Agent 最小职责、强制委派边界和 sub-agent 回传契约。
- 提供落实到具体文件的分阶段重构清单、风险及迁移顺序。
- 提供可量化验收方法。

## 过程记录

### 决策

- **D1**: 本轮交付静态分析与重构方案，不修改产品代码 — 理由: 用户选择先获得深度诊断与设计。
- **D2**: 允许重新设计现有机制 — 理由: 不受内部兼容约束，优先解决结构性问题。
- **D3**: 以主 Agent 上下文占用最低为第一优化指标 — 理由: 这是当前最急迫问题；总 token、延迟和 sub-agent 成本为次级指标。

### 中间结论

- 对齐链上限正文为 19,627B（alignment + understanding + 条件触发的 decision-log），入口 SKILL.md 另有 7,259B；这是静态正文下界，不等于实际 token。
- 主要风险由协议固定税、多状态线性增长和 worker/验证无界突发三类成本叠加。
- 推荐“事件溯源控制面 + 无状态 worker”，但 worker 原始结果必须先经过 tool proxy/CLI，在模型摄入前落盘与截断。
- 正常恢复只读取 checkpoint + 单 envelope；事件重建由 CLI 在模型外扫描日志。
- 独立架构 Gate 最终结果：PASS，五项完成标准均满足。

### 风险

- 缺少真实失败 transcript：可定位结构性风险，但不能精确归因某一次压缩异常，也不能排除 compaction 实现缺陷。
- 直接依赖边界之外的系统注入也可能占用上下文：报告已明确静态审计的证据边界。

## 已修改文件

- `.ace/tasks/reduce-main-context/state.json`: 初始化任务状态。
- `.ace/tasks/reduce-main-context/context.md`: 记录目标、标准、决策、结论和风险。
- `.ace/tasks/reduce-main-context/artifacts/auto-goal-context-redesign.md`: 完整静态审计与重构方案。
- `.ace/experience.md`: 新增 E4，记录模型摄入前截断原则。
