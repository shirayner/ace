# Tech-Design Skill Overhaul

## 目标
将 tech-design 从"提示词+知识库"升级为与 auto-goal 同级的"可执行协议"。

## 完成标准
1. SKILL.md 包含：Hard Gate（首轮对齐/阶段门禁/归档门禁）、state.json 管理、ace task done 归档、进度心跳规则、恢复协议
2. forward-design.md 修正为八阶段(0-7)、六大维度、每阶段 AskUserQuestion 硬门禁、增量持久化、延迟加载门禁
3. knowledge-anchors.md 增加"无匹配"和"多匹配"策略
4. quality-attributes/estimation-guide/review-checklist 精简为 checklist
5. review.md / tech-selection.md 与协议层对齐

## 关键决策
- shared 协议不外部引用，核心机制内聚到 tech-design 内部
- 每个阶段的 terminal state = AskUserQuestion 调用
- 设计文档产出到 artifacts/ + 用户指定位置
- 归档走 ace task done 统一生命周期
