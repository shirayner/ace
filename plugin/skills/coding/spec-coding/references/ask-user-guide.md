# AskUserQuestion 使用规范

定义 spec-coding 与用户交互时的标准模式。所有 AskUserQuestion 调用必须遵循。

**关于 Other 选项**：AskUserQuestion 工具会自动为每个 question 附加一个"Other"选项，允许用户自由输入文本。因此：

- options 中**不要手动添加 Other**，只定义预设选项即可
- 用户选择 Other 时，需要在文本框中输入内容
- AI 收到 Other 回复时，应读取用户输入的文本并据此行动
- 审批场景中，用户选 Other 并输入内容 = "有补充的通过"（视为通过 + 补充事项）

---

## 模式一：问题澄清

**场景**：需要用户对多个独立问题做出选择（如设计决策、范围确认、策略选择）。

**交互规范**：

```
AskUserQuestion(questions: [
  {
    header: "简短标签（≤12 字符）",
    question: "具体问题？",
    options: [
      {label: "选项 A (推荐)", description: "推荐理由"},
      {label: "选项 B", description: "权衡说明"},
      {label: "选项 C", description: "权衡说明"}   // 可选第三项
    ]
    // 系统自动附加 Other 选项，用户可自由输入
  },
  // ... 更多问题（单次 ≤4）
])
```

**规则**：

- 每个 question = 一个独立问题（独立 tab）
- options = 2-3 个预设选项（系统自动附加 Other）
- 推荐项加"(推荐)"后缀，放在第一位
- description 说明选该项的理由/权衡
- 单次最多 4 个 question
- 超过 4 个 → 分多轮提问（每轮 ≤4）

**适用场景**：

- Phase 1: 引导性澄清（unknowns → 问题）
- Phase 3: 设计决策确认（需澄清级决策）
- Phase 4: 范围分解确认
- Phase 5: 执行策略选择（模式 + 隔离方式）
- Phase 6: 分支处理选择

---

## 模式二：审批确认

**场景**：已展示完整内容（markdown），需要用户做"通过/不通过"的决策。

**交互规范**：

先用 markdown 呈现完整内容（四要素、设计文档摘要、计划概览等），然后在同一 response 中：

```
AskUserQuestion(questions: [{
  header: "确认",
  question: "以上内容是否准确？",
  options: [
    {label: "通过", description: "确认正确，继续下一步"},
    {label: "拒绝", description: "有偏差，需要重新调整"}
  ]
  // 用户选 Other 并输入内容 = 有补充的通过（视为通过 + 补充事项）
}])
```

**规则**：

- **信息展示在 markdown 中，不塞进 AskUserQuestion**
- AskUserQuestion 只做轻量审批决策
- 固定两选项：通过 / 拒绝（Other 由系统自动附加）
- 处理逻辑：
  - 通过 → 继续下一步
  - Other（用户输入补充内容）→ 读取补充 → 更新内容 → 继续
  - 拒绝 → 回退到前一步重新执行

**适用场景**：

- Phase 1: 对齐四要素确认
- Phase 3: 设计文档审批
- Phase 4: 实施计划审批
- Phase 6: 归档确认

---

## 反模式

| 错误做法                                      | 正确做法                               |
| --------------------------------------------- | -------------------------------------- |
| 把长文本塞进 AskUserQuestion 的 question 字段 | 先 markdown 输出，再用审批模式确认     |
| 一个 question 里放 4+ 选项                    | 最多 2-3 个预设选项（Other 自动附加）  |
| 审批时列出所有细节作为选项                    | 审批只有通过/补充/拒绝                 |
| 混合"澄清"和"审批"在同一次调用                | 分开：先澄清得到答案，再基于答案做审批 |
| 问题过于开放（"你觉得怎么样？"）              | 给具体选项 + 推荐                      |
| 手动在 options 中添加"Other"或"自由输入"      | 系统自动提供，不要重复                 |
