# V2 对齐门禁与输出契约

本文定义如何从当前模型收敛到用户确认，以及如何输出独立、可验证的已确认需求结果。字段、状态和 revision 规则以 `state-model.md` 为准。

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
- 每个 unresolved 条目满足 `state-model.md` 的“当前有效支撑 Issue”谓词中的 parking 或 `accepted_risk` 分支；
- 每个 unverified 条目满足该谓词中的 `validation_plan` 分支；
- 用户显式确认了当前 revision。

对齐不表示所有事实都已查明，而是用户确认了已知、未知、验证计划、停车事项和已接受风险的整体表达。

---

## 2. Ready 检查

### 2.1 Intent 完整

- problem 非空；
- desired outcome 非空；
- 至少一个 target user。

### 2.2 无阻塞问题

```text
不存在 issue_status=open && blocks_confirmation=true
```

### 2.3 非阻塞未知已归一化

除等待本次门禁批准的 `open + apply_ai_default` Issue 外，不得有其他 open Issue。剩余未知必须成为 parked Issue、`resolved + validation_plan` 或 `resolved + accepted_risk`。

### 2.4 模型无冲突

不得存在 conflicted 条目。

### 2.5 默认和风险可展示

门禁必须覆盖：

- `origin=ai_default` 且 `understanding_status=proposed` 的条目；
- unresolved；
- unverified；
- parked；
- accepted risk。

### 2.6 Revision 稳定

所有拟确认语义必须已写入当前 revision。生成门禁后发生任何语义变化，都必须重新生成门禁。

---

## 3. 门禁展示原则

门禁应：

- 一个屏幕内可扫读，默认约 20 行；
- 覆盖 Why、What、Who、范围和关键规则；
- 只展示会影响批准的默认和未闭合项；
- 不重复完整对话；
- 不输出内部 JSON 或完整 Issue 历史；
- 不给审批选项标推荐。

---

## 4. 标准门禁模板

```md
## 需求理解确认 · Revision N

**目标**：一句话说明 problem → desired outcome
**用户**：目标用户、参与者或受影响系统
**范围**：核心 in_scope；关键 out_of_scope
**关键需求**：3–7 条最重要能力或规则
**AI 默认**：仅列本次需要批量批准的默认；没有则省略
**未闭合事项**：unresolved / unverified / parked / accepted risk；没有则写“无”

A. 确认当前 Revision N
B. 需要修改
C. 暂停，暂不确认
```

审批只确认当前需求版本，不绑定任何后续动作，也不得给选项添加“推荐”。

---

## 5. 什么算显式确认

有效：

- 用户明确选择 A；
- 用户说“确认 revision N”；
- 上下文唯一无歧义时，用户说“确认”。

无效：

- 用户没有回复；
- 用户只说“看到了”或“差不多”；
- 用户切换话题；
- Agent 判断“没有反对就是同意”；
- 用户同时提出语义修正。

---

## 6. 用户确认

用户确认 revision N 后原子执行：

1. `confirmed_revision = N`；
2. 门禁覆盖的 proposed 条目改为 confirmed；
3. 对应 `confirmation_mode=batch_confirmation`；
4. `apply_ai_default` Issue 形成 `accepted_default` Resolution，且 `resolved_by=user`；
5. 这些 Issue 从 open 变为 resolved；
6. Resolution 写入 `confirmation_model_revision=N`；
7. 断言不存在任何 open Issue；
8. 生成 `ConfirmedRequirementOutput` 并结束。

这些是确认元数据变化，不增加 revision。

---

## 7. 用户要求修改

只要用户修正语义：

1. 不确认当前 revision；
2. 更新 RequirementModel；
3. `revision += 1`；
4. 创建或更新 RequirementIssue；
5. 推翻旧决定时，新建 Issue supersede 旧 Issue；
6. 重新处理 blocker；
7. 生成新 revision 门禁。

旧 revision 的确认不能继承。

---

## 8. 用户暂停

选择暂停时，不猜测确认，也不执行后续动作。保留当前会话状态；若之后继续且语义未变化，重新展示当前 revision 门禁。

---

## 9. ConfirmedRequirementOutput

输出由当前状态派生，不建立额外事实源：

```ts
interface ConfirmedRequirementOutput {
  requirement_model: RequirementModel;
  requirement_issues: RequirementIssue[];
  source_references: SourceReference[];
  confirmation_evidence: {
    revision: number;
    interaction_id: string | null;
    source_ref_ids: string[];
  };
}
```

导航摘要可以存在，但不能覆盖模型内容。RequirementModel 始终是 canonical 语义；superseded Issue 只用于历史。

---

## 10. 输出前最终断言

先执行本文件的确认断言，再完整执行 `../../../shared/confirmed-requirement-contract.md` 的 `is_valid_confirmed_requirement_input` 唯一谓词：

```text
assert confirmed_revision == revision
assert no issue where issue_status == open
assert no model item where understanding_status == proposed
assert no model item where understanding_status == conflicted
assert every unresolved item has current bidirectional parked or accepted_risk support
assert every unverified item has current bidirectional validation_plan support
assert every ai_default item has current bidirectional accepted_default support resolved_by user
assert every RequirementItem has non-empty, valid, disposition-consistent scope_item_ids
assert every projected item has stable identity, origin, and SourceReference or current Resolution
assert explicit confirmation evidence targets current revision
```

任一断言失败，不得宣告需求已对齐，不得输出 ConfirmedRequirementOutput。

---

## 11. 禁止行为

- 不确认没有 revision 的聊天摘要；
- 不把生成门禁当成用户已批准；
- 不把沉默、模糊回应或话题切换视为确认；
- 不给审批选项标推荐；
- 不在用户修正后沿用旧确认；
- 不在输出时保留 open Issue；
- 不把 unresolved 或 unverified 改写成 confirmed fact；
- 不把确认选项与后续工作选择绑定；
- 不选择、调用或编排其他 Skill；
- 不要求落盘中间需求状态。
