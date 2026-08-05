# V2 用户交互契约

本文定义通道无关的提问、推荐、响应记录和防疲劳规则。没有 AskUserQuestion 工具时，使用普通 Markdown 完成相同行为。字段和枚举以 `state-model.md` 为准。

---

## 1. 先决定是否应该问

只有 resolution route 为 `ask_user`，且用户拥有信息或决策权、无法从证据可靠解决、错误会造成值得避免的返工、依赖已满足时，才向用户提问。

以下情况不问：

- 可调查事实 → `investigate_evidence`；
- 低风险易逆转 → `apply_ai_default`；
- 当前没人知道 → `define_validation_plan`；
- 用户已主动决定 → `record_user_decision`。

---

## 2. 选择 Question Mode

### 2.1 `open_ended`

适用：用户需提供事实、目标、约束或经验；AI 无法完整枚举答案；给选项会过早锚定。

```yaml
interaction_type: open_question
question_mode: open_ended
options: []
ai_recommendation: null
```

### 2.2 `option_selection`

适用：可列出 1–3 个主要方案，用户需要在清晰取舍之间拍板，Other 可覆盖未枚举答案。

```yaml
interaction_type: choice_question
question_mode: option_selection
```

禁止为了格式统一把所有问题强制选项化。

---

## 3. Open-ended 展示格式

```md
### 问题标题

**为什么现在需要确认**：一句话说明它会影响什么。

请补充：一个聚焦、可直接回答的问题。
```

示例：

```md
### 失败后的补偿责任

**为什么现在需要确认**：这会决定失败状态、人工入口和验收边界。

支付扣款成功但订单创建失败时，目前由哪个团队或系统负责补偿？
```

规则：

- 一次只问一个认知目标；
- 不把多个独立问题塞进一句；
- 不提供虚假推荐；
- 回答过宽时，基于回答新建或细化 Issue，不机械重复原问题。

---

## 4. Option-selection 展示格式

```md
### 问题标题

**为什么现在需要确认**：一句话说明影响。

A. 选项短标题
   完整语义和主要影响。

B. 选项短标题
   完整语义和主要影响。

C. 选项短标题（仅在确有第三种主要方案时）
   完整语义和主要影响。

**AI 建议：A**
理由：一句或两句说明依据和主要权衡。信心：中。

也可以回复其他方案或补充限制条件。
```

### 4.1 Option 规则

- `option_key` 使用 A、B、C；
- `label` 是便于扫读的短标题；
- `description` 独立说明完整语义和主要后果；
- 选项互斥，或至少边界清晰；
- 默认 2 个，必要时 3 个；
- 不为凑数制造明显劣质选项；
- Other 不必作为固定 option，用户自定义回答记录为 `custom_answer`。

错误：

```md
A. 余额为 0 时拒绝并提示且不扣次数，因为这样风险最低（推荐）
```

正确：

```md
A. 拒绝请求
   余额为 0 时提示充值，不扣调用次数。

B. 允许一次透支
   本次请求继续执行，余额进入负数。

**AI 建议：A**
理由：能避免无上限欠费，且失败行为更容易解释和验收。
```

---

## 5. AI Recommendation

只有 `choice_question` 可以存在推荐。必须记录 option key、rationale 和 confidence。

推荐必须基于目标、证据、风险和可逆性，说明主要权衡，不声称唯一正确。以下情况不推荐：

- 价值取舍完全属于用户且没有明显风险差异；
- 信息不足以形成负责任建议；
- `open_ended` 信息收集；
- 用户只需确认事实。

最终 revision 审批选项不得标推荐。用户选择推荐项不等于推荐“准确”。

---

## 6. 批次与防疲劳

- 优先问影响多个下游问题的前置 Issue；
- 同主题、无依赖冲突的问题可小批次展示；
- 默认一轮 1–3 个问题；
- 高复杂问题单独一轮；
- 回答可能使后续问题失效时，不提前展示后续问题。

```md
我需要确认 N 个会显著影响需求的问题：

1. 问题一
2. 问题二
```

每个问题使用自己的 A/B/C，不让整个批次共用一套选项。

回答后简短说明采用了什么、改变了哪些语义、是否产生新问题和下一步，不向用户展示 ModelChange JSON。

---

## 7. UserResponse 规范化

### 7.1 选择选项

```yaml
response_type: selected_option
selected_option_key: A
free_text: null
```

### 7.2 选择并补充条件

```yaml
response_type: selected_option
selected_option_key: A
free_text: "仅普通用户适用，内部测试账号允许透支"
```

补充改变选项语义时，Resolution.answer 必须记录完整最终结论，不能只记录 A。

### 7.3 自定义答案

```yaml
response_type: custom_answer
selected_option_key: null
free_text: "允许透支，但上限为 10 元"
```

### 7.4 延后

```yaml
response_type: deferred
selected_option_key: null
free_text: "等待财务负责人确认"
```

`deferred` 不是 Resolution。必须进一步决定保持 open blocker、转 Parking、建立 Validation Plan，或由用户明确 `accepted_risk`。

---

## 8. 用户主动决定

用户未被提问就明确决定时：

```yaml
interaction_type: unsolicited_decision
question_text: null
options: []
ai_recommendation: null
user_response:
  response_type: custom_answer
  selected_option_key: null
  free_text: 用户原始决定
```

随后使用：

```yaml
issue_type: decision
resolution_route: record_user_decision
resolution_type: user_decision
confirmation_mode: direct_statement
```

更新 RequirementModel revision，不重复问用户是否确定；整体模型仍需最终门禁。

---

## 9. Artifact Review

使用原型、状态图、决策表或 GWT 帮助用户判断时：

```yaml
interaction_type: artifact_review
```

记录用户反馈、`created_issue_ids`、确认/否定的理解和模型修改。制品通过 SourceReference 的 prototype 类型引用，不建立独立 Examples 模型。

---

## 10. 无专用提问工具时

- 使用 Markdown 标题和 A/B/C；
- 明确告诉用户如何回复；
- 收到回复前保持 Issue open；
- 不把“已发送问题”视为“已确认”；
- 不因工具缺失跳过最终门禁。

自由文本明确对应某选项时可规范化记录；无法判断用户响应语义时，只做一次最小追问。

---

## 11. 指标派生

`option_key` 只在单个 Interaction 内有效，不能跨 Issue 或 supersede 链直接比较 A/B/C。

- 即时接受率：在同一 Interaction 内，首次 UserResponse 是否选择推荐 key；
- 最终保留率：推荐选项所代表的语义结果（以 option description、Resolution.answer 和 ModelChange 共同识别）是否仍保留在当前有效 Issue 链和 RequirementModel 中；
- 推荐反转率：用户最初接受推荐语义，但最终有效 Resolution 或 RequirementModel 已改为不同语义；
- 自定义答案率：`custom_answer` 占比；
- AI 默认批准率：`apply_ai_default` 最终形成 `accepted_default` 的比例。

不得仅因新旧 Interaction 使用相同 A/B/C key 就判定语义保留，也不得仅因 key 不同就判定反转。这些是接受和保留指标，不称准确率。

---

## 12. 禁止行为

- 不将问题、选项、理由和推荐标记塞进一行；
- 不超过 3 个主要选项；
- 不把 Other 包装成无意义的第四选项；
- 不为 `open_ended` 问题给推荐；
- 不用推荐替代证据；
- 不把用户沉默视为批准；
- 不因为用户选推荐项就省略完整 Resolution；
- 不用连续长问卷消耗注意力；
- 不在最终审批选项上标“推荐”。
