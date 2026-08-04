# V2 对齐门禁与同会话交接

本文定义如何从当前模型收敛到用户确认，以及如何在同一 Session 交给 requirement-writing。字段、状态和 revision 规则以 `state-model.md` 为准。

---

## 1. 对齐的精确定义

需求已对齐，当且仅当：

```text
requirement_model.confirmed_revision
  === requirement_model.revision
```

并且：

- 不存在 open RequirementIssue；
- RequirementModel 不存在 proposed 或 conflicted 条目；
- unresolved 条目有 parking 或 `accepted_risk` 依据；
- unverified 条目有 `validation_plan` 依据；
- 用户显式确认了当前 revision。

对齐不表示所有事实都已查明，而是用户确认了已知、未知、验证计划、停车事项和已接受风险的当前整体表达。

---

## 2. 进入门禁前的 Ready 检查

### 2.1 Intent 完整

- problem 非空；
- desired outcome 非空；
- 至少一个 target user。

### 2.2 无阻塞问题

```text
不存在 issue_status=open && blocks_confirmation=true
```

### 2.3 非阻塞未知已归一化

除等待本次门禁批准的 `apply_ai_default` Issue 外，不得有其他 open Issue。剩余未知必须成为 parked Issue、`resolved + validation_plan` 或 `resolved + accepted_risk`。

### 2.4 模型无冲突

不得存在 conflicted 条目。

### 2.5 默认和风险已准备展示

门禁必须覆盖：

- `origin=ai_default` 且 `understanding_status=proposed` 的条目；
- unresolved；
- unverified；
- parked；
- accepted risk。

### 2.6 Revision 稳定

所有拟确认语义已经写入当前 revision。生成门禁后发生任何语义变化，都必须重新生成门禁。

---

## 3. 门禁展示原则

门禁应：

- 一个屏幕内可扫读，默认约 20 行；
- 覆盖 Why、What、Who、范围和关键规则；
- 只展示会影响批准的默认和未闭合项；
- 不重复完整对话；
- 不输出内部 JSON 或完整 Issue 历史；
- 不给审批选项标推荐。

内容无法压缩到一个屏幕时，按主题分组并只展示摘要，允许用户要求展开。

---

## 4. 标准门禁模板

```md
## 需求理解确认 · Revision N

**目标**：一句话说明 problem → desired outcome
**用户**：目标用户、参与者或下游系统
**范围**：核心 in-scope；关键 out-of-scope
**关键需求**：3–7 条最重要能力或规则
**AI 默认**：仅列本次需要批量批准的默认；没有则省略
**未闭合事项**：unresolved / unverified / parked / accepted risk；没有则写“无”

A. 确认并继续撰写 PRD
B. 确认，但暂不撰写 PRD
C. 需要修改
```

不得给 A/B/C 添加“推荐”。审批选择属于用户。

---

## 5. 什么算显式确认

有效：

- 用户明确选择 A/B；
- 用户说“确认 revision N，并继续/暂停”；
- 上下文唯一无歧义时，用户说“确认，继续写 PRD”。

无效：

- 用户没有回复；
- 用户只说“看到了”；
- 用户切换话题；
- Agent 判断“没有反对就是同意”；
- 用户说“差不多”，但同时提出语义修正。

用户只说“可以”且无法区分继续还是暂停时，进行一次最小追问确认 next action，不得猜测。

---

## 6. 用户选择 A：确认并继续

用户确认 revision N 后原子执行：

1. `confirmed_revision = N`；
2. 门禁覆盖的 proposed 条目改为 confirmed；
3. 对应 `confirmation_mode=batch_confirmation`；
4. `apply_ai_default` Issue 形成 `accepted_default` Resolution；
5. 这些 Issue 从 open 变为 resolved；
6. Resolution 写入 `confirmation_model_revision=N`；
7. 断言不存在任何 open Issue；
8. 同一 Session 立即进入 requirement-writing。

这些是确认元数据变化，不增加 revision。

---

## 7. 用户选择 B：确认但暂停

执行与 A 相同的原子更新，但不进入 requirement-writing。

模型留在当前会话上下文，不要求写入中间文件。同一 Session 后续要求撰写且 revision 未变化时可直接交接。跨 Session 不承诺恢复内部模型，应重新读取权威输入或重新确认。

---

## 8. 用户选择 C 或提出修正

只要用户修正语义：

1. 不确认当前 revision；
2. 更新 RequirementModel；
3. `revision += 1`；
4. 创建或更新 RequirementIssue；
5. 推翻旧决定时，新建 Issue supersede 旧 Issue；
6. 重新处理 blocker；
7. 生成新 revision 门禁。

旧 revision 的确认不能继承。用户先说确认又附加修改时，以修改为准，先更新 revision 再重新门禁。

---

## 9. Handoff 不是第三个模型

不建立 RequirementHandoff、DecisionRecords 或额外事实摘要。requirement-writing 直接消费当前 Session 中：

- 已确认 RequirementModel；
- 非 superseded RequirementIssues；
- 原始输入和 SourceReferences；
- 当前 revision 的确认证据。

可以提供导航摘要，但摘要不是新的事实来源；RequirementModel 才是 canonical 语义。

---

## 10. 下游消费映射

| V2 内容 | requirement-writing 行为 |
|---|---|
| confirmed 条目 | 直接写入 PRD 内容或验收依据 |
| unresolved + parked | 写入非阻塞 Open Questions / 后续事项 |
| unresolved + `accepted_risk` | 显式写入已接受风险 |
| unverified + `validation_plan` | 写入验证对象、方法、责任人和时机 |
| superseded Issue | 仅作为历史，不影响当前 PRD |
| proposed | 正常 handoff 不得存在 |
| conflicted | 正常 handoff 不得存在 |

已批准 AI 默认仍保留：

```yaml
origin: ai_default
understanding_status: confirmed
confirmation_mode: batch_confirmation
```

下游不得把它改写成用户原始陈述。

---

## 11. 下游发现新缺口

requirement-writing 发现改变语义的阻塞缺口时：

1. 暂停受影响部分；
2. 回到 V2 建模流程；
3. 在创建 RequirementIssue 前或同一原子更新中执行 `revision += 1`，先使旧确认失效；
4. 创建 RequirementIssue；
5. 确定并应用 RequirementModel 修改；
6. 重新处理和确认；
7. 再继续写作。

这是同一 Session 循环，不需要落盘或 workflow phase。不影响语义的写作组织问题由 requirement-writing 自行处理。

---

## 12. Handoff 前最终断言

```text
assert confirmed_revision == revision
assert no issue where issue_status == open
assert no model item where understanding_status == proposed
assert no model item where understanding_status == conflicted
assert every unresolved item has parked or accepted_risk support
assert every unverified item has validation_plan support
assert explicit confirmation evidence exists
```

任一断言失败，不得宣告需求已对齐，不得进入正常 PRD 撰写。

---

## 13. 禁止行为

- 不确认没有 revision 的聊天摘要；
- 不把生成门禁当成用户已批准；
- 不把沉默、模糊回应或话题切换视为确认；
- 不给审批选项标推荐；
- 不在用户修正后沿用旧确认；
- 不在 handoff 时保留 open Issue；
- 不把 unresolved 或 unverified 改写成 confirmed fact；
- 不要求为同会话交接落盘中间文档；
- 不自动进入技术设计或编码。
