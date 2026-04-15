# 需求澄清完整流程

## 触发条件

在**创建 proposal 之前**，当以下任一条件成立时执行本流程：
- `spec/requirement-issues.md` 不存在
- `spec/requirement-issues.md` 存在但状态不是 `clarified`

## 执行步骤

### 步骤 1：读取需求问题分类学

读取 `openspec/templates/taxonomy/requirement-issue-taxonomy.md`，了解 6 个检查维度：
功能完整性、数据相关、用户体验、边界异常、集成依赖、优先级

### 步骤 2：分析需求，识别功能点（Capabilities）

读取当前需求描述，拆解出所有独立功能点，每个功能点分配唯一 ID（如 `CAP-001`）。

### 步骤 3：按 6 个维度检查每个功能点

对每个功能点，逐一检查 6 个维度是否存在不确定性或缺失信息，识别问题并标记严重程度：
- 🔴 High：阻塞性，必须澄清后才能继续
- 🟡 Medium：重要，建议澄清
- 🟢 Low：建议性，可后续补充

### 步骤 4：创建 spec/requirement-issues.md

使用 `openspec/templates/issues/requirement-issues.md` 模板，填充发现的问题列表，
初始状态设为 `discovering`。

### 步骤 5：启动交互式澄清

按照 `openspec/templates/procedures/interactive-clarification-protocol.md` 的规范执行：
- 将所有 High/Medium 问题组织为批量提问，一次性展示给用户
- 等待用户统一回答
- 收到回答后，将答案同步到 `requirement-issues.md`，更新状态为 `clarifying`

若无 High/Medium 问题，可跳过交互直接进入步骤 6。

### 步骤 6：确认澄清完成，更新状态

确认所有 🔴 High 问题已获得明确答案，将 `requirement-issues.md` 状态更新为 `clarified`。

> 🟢 Low 问题可保留为 open 状态，不阻塞流程继续。

## 产出物

- `spec/requirement-issues.md`（状态：`clarified`）

## 状态流转

```
discovering → clarifying → clarified → superseded
```
