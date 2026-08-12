# auto-goal-v2 设计任务

## 目标

从零设计一个完全内聚、面向任意通用目标的 `auto-goal-v2` Skill。本轮只交付设计方案，不创建 V2 实现。

## 已确认约束

- 新写 Skill，与 V1 并存，不在 V1 上增量修补。
- 主 Agent 只负责用户对齐、方向决策、小型 checkpoint 读取、worker 调度、`BLOCKED/NEEDS_INPUT` 处理和有界汇报。
- 采用事件溯源控制面、无状态 worker、模型摄入前 Tool Proxy。
- Tool Proxy 相关脚本放在 Skill 自身 `scripts/` 目录，不封装为 `ace goal` CLI。
- V2 的协议、schema、模板、脚本、恢复与验证规则等私有依赖全部位于 `auto-goal-v2/` 目录树，不依赖外部 `shared/` 或其他 Skill 私有文件。
- 支持任意领域目标，但执行受 capability、授权、安全边界和可验证性约束。

## 调研输入

- 当前 `plugin/skills/auto-goal`
- 上一轮归档报告 `auto-goal-context-redesign.md`
- `D:/Users/r.shi/work-space/demo/需求澄清经典方法论.md`
- `D:/Users/r.shi/work-space/demo/需求理解与澄清方法论.md`
- 业界一手资料

## 阶段结论

- 输入审计已完成：V1 私有运行时依赖外溢明显，且“制造上下文”的约束强于“保护上下文”；恢复、验证和归档存在软件工程偏置。
- 需求理解采用可观察信号路由，而非固定问卷；保留临时 Frontier、五段式对齐卡和 Defeater，并补充追问停止条件、歧义扫描与领域无关证据契约。
- 两次架构反方 worker 调度均因继承上下文过长而失败。该反例证明 Agent 调用本身不是隔离边界；V2 必须同时控制启动输入和返回输出，并在超预算时产生 `DISPATCH_REJECTED`，禁止盲目重试。

## 通用目标模型结论

- `Goal` 表达期望世界差量，`Mandate` 表达当前效应器、通路、授权、胜任与观测能力；仅交集可执行，剩余范围必须命名并交接。
- 领域差异由可达、可观测、可判定三轴刻画；软件工程只是三轴通常较高的特例。
- 完成判据按 `State/Behavior/Artifact/Judgment/Effect/Knowledge/Negative` 分类，类型决定证据上限与最终判定权；主观判断和知识获得不能由 Agent 自我验收，负向判据必须有界化。
- 采用 E0–E5 证据阶梯，外部操作至少要求独立读回，禁止仅凭工具返回宣称完成。
- 终态由判据台账纯函数推导并偏向少报；范围收窄必须由 decider 显式同意并递增 `scope_version`。

## 业界实践结论

- 使用有界 append-only journal 与派生 checkpoint，不采用完整 Event Sourcing/CQRS；外部副作用不可重放，恢复依赖事实记录、幂等键与跳过已完成步骤。
- journal 必须支持硬阈值、告警和续接；具体阈值需按本 Skill 的文件与上下文预算推导，不能照搬平台值。
- planner 不作为状态或完成权威；采用短步规划、逐步确定性校验，并将 `BLOCKED` 作为一等结果。
- prompt 限长不足以防 context rot；Tool Proxy 必须在模型摄入前拦截并只返回摘要、artifact pointer 和取用指令。
- HITL 中断前禁止不可回滚副作用；每个中断只处理一个决策，载荷必须可序列化。
- structured output 只保证形状，V2 必须自带语义校验器；多 Agent 非默认，仅在并行收益覆盖协调与 token 成本时启用。

## 设计与验证结果

- 正式设计已写入 `artifacts/auto-goal-v2-design.md`，覆盖完整内聚目录、目标模型、状态机、schema、预算、Tool Proxy、恢复、风险批准、终态 reducer、实施路线和 37 项验收场景。
- fresh 设计完整性验证已写入 `artifacts/design-validation-checklist.md`；完成标准逐项通过。
- 本轮未创建 `auto-goal-v2` 实现。clean-context backend、摄入前拦截、transcript 实测和故障注入均明确留作实现期验证，不声称已落地。

## 下一动作

用户评审设计；确认后另开实现任务，按 Phase 1–6 落地并运行测试矩阵。
