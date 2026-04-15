# 设计澄清完整流程

## 触发条件

在**创建 design.md 之后、创建 tasks 之前**，当以下任一条件成立时执行本流程：
- `spec/design-issues.md` 不存在
- `spec/design-issues.md` 存在但状态不在 `{clarified, resolved}`

> **与需求澄清的关键区别**：无论是否发现 High/Medium 问题，设计澄清都**强制**执行用户确认步骤（步骤 4）。

## 执行步骤

### 步骤 1：读取设计问题分类学

读取 `openspec/templates/taxonomy/design-issue-taxonomy.md`，了解 7 个检查维度：
架构决策、技术选型、接口设计、数据状态、安全合规、性能可靠性、部署运维

### 步骤 2：分析 design.md 的不确定性

按 7 个维度检查 `design.md`，识别：
- 技术决策中的模糊之处（选了什么但没说为什么）
- 未明确的备选方案对比
- 潜在风险点和未处理的约束条件

标记每个发现问题的严重程度（High / Medium / Low）。

### 步骤 3：创建 spec/design-issues.md

使用 `openspec/templates/issues/design-issues.md` 模板，填充发现的问题列表，
初始状态设为 `analyzing`。

### 步骤 4：强制用户确认（无论是否发现问题，必须执行）

按照 `openspec/templates/procedures/interactive-clarification-protocol.md` 的规范执行：
- 发现 High/Medium 问题 → 批量提问，一次性展示所有问题，等待统一回答
- 未发现 High/Medium 问题 → 展示设计分析摘要（主要决策列表），请求用户确认或提出顾虑

收到回答后，将用户意见同步到 `design-issues.md`，更新状态为 `clarifying`。

### 步骤 5：根据澄清结果更新 design.md

将用户答案中涉及的设计调整反映到 `design.md` 中（更新技术决策、补充约束条件、明确备选方案等）。

### 步骤 6：确认澄清完成，更新状态

确认所有 🔴 High 问题已获得明确答案，将 `design-issues.md` 状态更新为 `clarified`。

## 产出物

- `spec/design-issues.md`（状态：`clarified`）
- `design.md`（已根据澄清结果更新）

## 状态流转

```
analyzing → clarifying → clarified → resolved
```
