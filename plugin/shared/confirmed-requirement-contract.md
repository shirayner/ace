# Confirmed Requirement Input Contract

本文是中立的数据边界契约，只定义可被可靠消费的已确认需求输入，不定义任何 Skill 名称、调用顺序、回流目标或重试策略。

## 1. 边界对象

```ts
interface ConfirmedRequirementInput {
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

该对象是 canonical 模型、Issue、来源和确认证据的传递视图，不是第三套需求模型。

## 2. `is_valid_confirmed_requirement_input` 唯一谓词

以下条件必须同时成立。

### 2.1 Revision 与确认

- `confirmed_revision === revision`；
- confirmation_evidence.revision 等于当前 revision；
- 存在用户对当前 revision 的显式确认证据。

### 2.2 Issue 与认知状态

- 不存在 `issue_status=open`；
- 不存在 `understanding_status=proposed|conflicted`；
- superseded Issue 只保留历史，不能提供当前支撑。

### 2.3 未闭合项支撑

支撑必须双向关联：模型条目的 `related_issue_ids` 包含 Issue ID，且 Issue 的 `target_refs` 精确回指该模型条目。

- unresolved + parking：当前 Issue 为 `parked`，`parking != null`，`resolution == null`；
- unresolved + accepted risk：当前 Issue 为 `resolved`，Resolution 为 `accepted_risk`，且 `resolved_by=user`；
- unverified + validation plan：当前 Issue 为 `resolved`，Resolution 为 `validation_plan`。

### 2.4 Scope 归属

- 每个 RequirementItem 的 `scope_item_ids` 非空；
- 每个 ID 都指向当前模型中的 ScopeItem；
- 同一 RequirementItem 关联的 ScopeItem 必须具有相同 `scope_disposition`；
- 若语义同时跨越 in_scope 与 out_of_scope，必须拆成不同 RequirementItem，禁止混合归属；
- RequirementItem 的派生 scope 等于其全部关联 ScopeItem 的共同 disposition。

### 2.5 身份与可追溯性

每个会被投影或显式展示的 IntentStatement、ScopeItem、VocabularyTerm 和 RequirementItem 都必须：

- 有稳定模型 item ID；
- 有合法 origin；
- 至少有一个有效 SourceReference，或一个当前、非 superseded、双向关联且带 Resolution 的 Issue 作为依据。

### 2.6 AI default

每个 `origin=ai_default` 的条目必须：

- `understanding_status=confirmed`；
- `confirmation_mode=batch_confirmation`；
- 双向关联当前、非 superseded、`issue_status=resolved` 的 Issue；
- 该 Issue 的 Resolution 为 `accepted_default`，`resolved_by=user`；
- Resolution 保留确认 revision 与确认证据。

## 3. 失败语义

任一条件不成立时，该对象不是合法的 ConfirmedRequirementInput。消费方只能返回结构化契约失败，不能猜测缺失语义或静默放宽谓词。

## 4. 非职责

本文不规定：

- 谁创建或更新需求模型；
- 谁消费该输入；
- 失败后调用哪个能力；
- 是否以及何时重试；
- 中间状态是否持久化。
