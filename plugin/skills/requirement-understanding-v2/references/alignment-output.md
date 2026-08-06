# V2 对齐门禁与输出契约

本文定义如何从当前模型收敛到用户确认，以及如何输出独立、可验证的已确认需求结果。字段、状态和 revision 规则以 `state-model.md` 为准。

---

## 1. 对齐的精确定义

“需求已对齐”表示当前模型已经足够完整，可以在**不新增任何业务语义**的前提下投影为 PRD；它不表示已经撰写 PRD，也不授权任何后续动作。

对齐当且仅当：

```text
requirement_model.confirmed_revision
  === requirement_model.revision
```

并且：

- problem、desired outcome 和至少一个 target user 已确认；
- 至少存在一个 confirmed `in_scope` ScopeItem；
- 至少存在一个派生 scope 为 `in_scope` 的 confirmed RequirementItem；
- 不存在 open RequirementIssue；
- 所有输出模型条目的 `understanding_status` 都是 `confirmed`；
- 适用维度扫描通过；
- 用户显式确认了当前 revision。

对齐不允许携带任何尚未闭合的业务事项。需要新事实、取舍或边界才能完成 PRD 投影时，模型尚未对齐。

---

## 2. PRD-ready 检查

### 2.1 Intent 完整

- problem 非空且 confirmed；
- desired outcome 非空且 confirmed；
- 至少一个 confirmed target user。

success signals 可以为空，不强制量化。模型明确提供的定性或部分量化信号按已确认内容原样记录；只有完整提供基线、目标、测量口径和时间窗时，才形成结构化量化指标。缺少四要素本身不创建 Issue；仅当模型把该指标定义为验收或发布门槛，且缺失口径导致业务上无法判定是否通过时，才必须创建并闭合 Issue。

### 2.2 最小范围与需求

- 至少一个 `scope_disposition=in_scope` 的 confirmed ScopeItem；
- 至少一个通过 `scope_item_ids` 派生为 `in_scope` 的 confirmed RequirementItem；
- RequirementItem 的 scope 引用非空、有效且 disposition 一致；
- 每个 in-scope RequirementItem 仅凭当前 confirmed 模型语义足以形成至少一个可判定真假的完成条件；不强制 Given/When/Then，也不增加 Example 模型。

### 2.3 无 open Issue

```text
不存在 issue_status=open
```

resolved 与 superseded Issue 可以保留审计历史，但不能提供与当前模型冲突的语义。

### 2.4 所有模型语义已确认

RequirementModel 中所有 IntentStatement、ScopeItem、VocabularyTerm 和 RequirementItem 都必须是 `understanding_status=confirmed`，不以是否最终展示为限。`proposed`、`unresolved`、`unverified`、`conflicted` 只可能出现在 draft，均不满足 ready。

### 2.5 适用维度扫描通过

角色、主流程、规则、异常/失败、边界/重复、状态、权限、数据口径、集成/依赖、质量要求、成功信号和范围均已按需检查。每个维度必须是：

- 已由 confirmed 模型语义明确；或
- 不适用且有理由；重要理由已写入 scope、requirement 或 rationale。

任何需要在 PRD 中猜测的新业务语义都必须先创建并闭合 Issue。

### 2.6 Revision 稳定

所有拟确认语义必须已写入当前 revision。生成门禁后发生任何语义变化，都必须递增 revision 并重新生成门禁。

---

## 3. 门禁候选例外：待批准 AI defaults

低风险 AI defaults 可以在门禁前暂时保持：

```yaml
origin: ai_default
understanding_status: proposed
issue_status: open
resolution_route: apply_ai_default
```

此时模型仍是 draft，不是 ready。只有同时满足以下条件才可展示 revision 门禁：

- 除这些 AI defaults 外，第 2 节全部满足；
- 每个默认均为 `error_impact=low`、`reversibility=easy`、`blocks_confirmation=false`，且目标不是 problem、desired outcome、核心范围、关键业务规则或关键数据语义；
- 每个可独立批准或反转的默认都有独立 Issue，并与模型条目双向关联；
- 门禁完整展示全部待批准默认；
- 不存在任何其他 proposed 条目或 open Issue。

用户确认时，必须先在一个原子更新中把全部默认转为 confirmed、形成 `accepted_default` Resolution、把对应 Issue 转为 resolved；确认无 open Issue 且所有输出条目 confirmed 后，才能设置 `confirmed_revision` 并输出。

---

## 4. 门禁展示原则

门禁应：

- 以能够准确批准当前 revision 为准，不设固定行数；
- 覆盖 Why、What、Who、范围、全部 in-scope Requirement 索引和关键规则；
- 完整展示本次需要批准的 AI defaults；
- 不重复完整对话或 Issue 审计历史；
- 不输出内部 JSON；
- 不给审批选项标推荐；
- 不为追求短小而隐藏会改变 PRD 的语义。

### 4.1 Micro

适用于范围单一、需求少、无复杂规则或依赖的清晰需求。可以压缩为一屏，但仍必须包含目标、用户、in-scope 范围、全部 in-scope Requirement 和全部 AI defaults。

### 4.2 Normal

适用于存在多个范围项、规则、状态、失败行为、依赖或质量要求的需求。必须展示：

- 完整 in-scope ScopeItem；
- **全部** in-scope Requirement 索引，不限定条数；
- 关键业务规则、边界、异常/失败和状态语义；
- 重要 out-of-scope 边界；
- 全部 AI defaults。

可以用分组与索引提高扫读性，但不能省略语义。

---

## 5. 门禁模板

### 5.1 Micro 模板

```md
## 需求理解确认 · Revision N

**问题与目标**：problem → desired outcome
**用户**：目标用户、参与者或受影响系统
**本期范围**：全部 in-scope ScopeItem
**需求索引**：全部 in-scope RequirementItem（ID + 简明语义）
**AI 默认**：全部待批准默认；没有则省略

A. 确认当前 Revision N
B. 需要修改
C. 暂停，暂不确认
```

### 5.2 Normal 模板

```md
## 需求理解确认 · Revision N

### 问题、目标与用户
- Problem：...
- Desired outcome：...
- Target users：...
- Success signals：按已明确内容展示；没有则省略

### 范围
- In scope：完整列表
- Out of scope：会影响边界理解的列表

### In-scope Requirement 索引
- R-001 [functional] ...
- R-002 [business_rule] ...
- ...展示全部条目

### 关键规则与边界
- 关键业务规则、异常/失败、重复、状态、权限、数据口径、依赖或质量要求

### AI 默认
- 展示全部待批准默认；没有则省略

A. 确认当前 Revision N
B. 需要修改
C. 暂停，暂不确认
```

门禁不展示“未闭合事项”作为可批准内容。若仍有未闭合业务事项，应返回 Issue 处理而不是生成确认。

审批只确认当前需求版本，不绑定任何后续动作，也不得给选项添加“推荐”。

---

## 6. 什么算显式确认

有效：

- 用户明确选择 A；
- 用户说“确认 revision N”；
- 上下文唯一无歧义时，用户说“确认”。

无效：

- 用户没有回复；
- 用户只说“看到了”或“差不多”；
- 用户切换话题；
- Agent 判断“没有反对就是同意”；
- 用户同时提出语义修正；
- 用户选择 `deferred` 或暂停。

---

## 7. 用户确认

用户确认 revision N 后原子执行：

1. 验证用户确认的确是当前 revision；
2. 门禁覆盖的 proposed AI default 条目改为 confirmed；
3. 对应 `confirmation_mode=batch_confirmation`；
4. 每个 `apply_ai_default` Issue 形成 `accepted_default` Resolution，且 `resolved_by=user`；
5. 这些 Issue 从 open 变为 resolved；
6. Resolution 写入 `confirmation_model_revision=N` 和确认证据；
7. 断言不存在任何 open Issue；
8. 断言所有输出模型条目都是 confirmed；
9. `confirmed_revision = N`；
10. 执行第 11 节最终断言；
11. 生成 `ConfirmedRequirementOutput` 并结束。

这些是确认元数据变化，不增加 revision。任一步失败则整个更新失败，不得产生部分确认状态。

---

## 8. 用户要求修改或延后

### 8.1 用户要求修改

只要用户修正语义：

1. 不确认当前 revision；
2. 更新 RequirementModel；
3. `revision += 1`；
4. 创建或更新 RequirementIssue；
5. 推翻旧决定时，新建 Issue supersede 旧 Issue；
6. 重新处理 blocker 并运行适用维度扫描；
7. 生成新 revision 门禁。

旧 revision 的确认不能继承。

### 8.2 用户延后或暂停

选择暂停时，不猜测确认，也不执行后续动作。`UserResponse.deferred` 只记录延后，相关 Issue 保持 open；影响 PRD 时保持 blocker。若之后继续且语义未变化，先处理所有 open Issue，再重新展示当前 revision 门禁。

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

输出中的每个模型条目都必须 confirmed。Issue 历史不能把 draft 候选重新引入当前语义。

---

## 10. PRD 投影保证

输出 ConfirmedRequirementOutput 表示下游可以：

- 直接使用 problem、desired outcome 和 target users；
- 将定性和部分量化 success signals 按已确认内容原样写成叙述或列表；只有基线、目标、测量口径和时间窗全部明确时才渲染结构化量化指标表；
- 直接投影完整 in-scope/out-of-scope 边界；
- 按完整 in-scope Requirement 索引展开功能、规则、数据、集成、质量属性与约束；
- 使用 rationale 保留已知取舍与明确边界；
- 不需要新增角色、流程、规则、失败行为、边界、状态、权限、数据口径、依赖、质量要求或范围语义。

允许下游改变表达结构、章节组织和非业务措辞；不允许靠猜测补齐业务语义。

---

## 11. 输出前最终断言

以下断言是本 Skill 在自身目录内完整拥有的输出边界：

```text
assert confirmed_revision == revision
assert problem exists and is confirmed
assert desired_outcome exists and is confirmed
assert at least one target_user exists and is confirmed
assert at least one confirmed ScopeItem where scope_disposition == in_scope
assert at least one confirmed RequirementItem whose derived scope == in_scope
assert no issue where issue_status == open
assert every model item has understanding_status == confirmed
assert no model item where understanding_status in [proposed, unresolved, unverified, conflicted]
assert every RequirementItem has non-empty, valid, disposition-consistent scope_item_ids
assert every in-scope RequirementItem can form at least one truth-evaluable completion condition from current confirmed semantics
assert every model item has stable identity, valid origin, and SourceReference or a current valid Resolution
assert every supporting Resolution belongs to a resolved non-superseded Issue, is exactly bidirectionally linked, semantically matches the current item, and has resolved_model_revision <= revision
assert every supporting Resolution has non-empty traceable original confirmation revision/evidence where confirmation_model_revision <= revision
assert every ai_default item is confirmed with batch_confirmation
assert every ai_default item has a current valid apply_ai_default Issue with low impact, easy reversibility, blocks_confirmation=false, accepted_default, and resolved_by=user
assert no ai_default targets problem, desired outcome, core scope, key business rules, or key data semantics
assert partial quantitative success signals may remain narrative; missing metric elements only block when an acceptance/release gate becomes semantically undecidable
assert applicability scan passed for every relevant PRD dimension
assert PRD projection requires no new business semantics
assert confirmation_evidence targets current revision
assert confirmation_evidence has non-null interaction_id or non-empty source_ref_ids
assert referenced interaction or sources trace to user's explicit confirmation of current revision
```

Resolution 的原始确认 revision 可以早于当前 revision；无关语义增加 revision 不会使其失效。只有当前条目语义改变时，才必须通过新 Issue supersede 旧 Issue。任一断言失败，不得宣告需求已对齐，不得输出 ConfirmedRequirementOutput。

---

## 12. 禁止行为

- 不确认没有 revision 的聊天摘要；
- 不把生成门禁当成用户已批准；
- 不把沉默、模糊回应、延后或话题切换视为确认；
- 不给审批选项标推荐；
- 不在用户修正后沿用旧确认；
- 不在输出时保留 open Issue；
- 不输出任何非 confirmed 模型条目；
- 不把确认选项与后续工作选择绑定；
- 不用固定行数或固定需求条数隐藏语义；
- 不在 Normal 确认中省略 in-scope Requirement；
- 不选择、调用或编排其他 Skill；
- 不要求落盘中间需求状态。
