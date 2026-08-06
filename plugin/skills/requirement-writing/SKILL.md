---
name: requirement-writing
description: 将符合本 Skill 输入门禁的 RequirementModel 与 RequirementIssue[] 投影为结构清晰、信息保真的标准 PRD。用户要求“写 PRD”“出产品需求文档”“把已确认需求整理成 PRD”时触发。只做输入校验、scope 裁剪、文档组织、正文生成和规则自检；不做需求澄清、需求决策、技术方案、UI 设计或任务拆分。非法输入返回 InputContractFailure，写作中发现产品语义缺口返回 ProjectionGap。
---
# PRD Projection Engine — PRD 投影引擎

**核心信念：RequirementModel 是需求语义的唯一 canonical 输入，PRD 只改变信息组织，不重新决策需求。**

本 Skill 只接受：

- 已确认的 `RequirementModel`；
- 与之关联的 `RequirementIssue[]`；
- 可访问的 SourceReferences 和确认证据。

不接受“已定决策 / 假设清单 / 术语表 / 范围三态”等旧清单作为替代输入，也不负责将其转换为 canonical 模型。

本 Skill 有三种互斥输出：

1. 完整 PRD；
2. `InputContractFailure`；
3. `ProjectionGap`。

它不调用或编排其他 Skill。

---

## 四象限判据

| 这是…… | 归宿 | 文件 |
|---|---|---|
| PRD 用什么语言表达？ | **Language** | `prd-language.md` |
| 绝不能违反的保真和反默认规则？ | **Rules** | `projection-rules.md` |
| 信息如何组织成章节？ | **Structure** | `chapter-tree.md` |
| 每种节点最终长什么样？ | **Rendering** | `templates/*.md` |

```text
投影 = Apply(Language, Rules, Structure, Template)
```

---

## 四步投影

```text
① Validate 校验输入契约
② Scope    in_scope 完整投影；out_of_scope 只按明确 rationale 裁剪展示
③ Project  按 chapter-tree 选章并按 templates 生成
④ Check    按 projection-rules 执行 P0 → P1 → P2；P0 未过不输出
```

- 四步是思考顺序，不是四份产物；默认只交付最终 PRD。
- 原始文档只用于 SourceReference 追溯，不得覆盖 RequirementModel。
- 不重新解释 scope，不从删除线、分期措辞或旧 Q&A 推导范围。

### 需求规模

本 Skill 仅支持同一 Session 内的 **Micro / Normal** 投影，二者都直接执行上述四步。投影进度不落盘，不维护恢复状态；如果一次生成无法稳定完成，应缩小本次输入或由调用方重新发起，而不是创建持久化工作态。

---

## 输入门禁

<HARD-GATE name="输入契约与范围">
投影前必须直接检查当前模型语义并同时满足：
1. `confirmed_revision == revision`；顶层 `confirmation_evidence` 存在并精确指向当前 revision，且 `interaction_id != null` 或 `source_ref_ids` 非空；对应 Interaction/SourceReference 可追溯到用户对该 revision 的显式确认，空 interaction/source 组合非法；
2. confirmed problem、confirmed desired outcome 和至少一个 confirmed target user 均存在；RequirementModel 中**所有模型条目**均为 `understanding_status=confirmed`，不以是否会在 PRD 中展示为限；任何 `proposed|unresolved|unverified|conflicted` 条目均使输入非法；
3. 不存在 `issue_status=open`；`superseded` Issue 只保留历史，不进入当前 PRD，也不能为当前模型条目提供支撑；
4. 每个模型条目都有稳定且唯一的 ID，`origin` 只能是 `user_statement|source_document|verified_evidence|ai_default`，并至少具备一个有效 SourceReference 或一个当前有效 Resolution。当前有效 Resolution 必须属于 `resolved` 且非 superseded 的 Issue，与模型条目双向精确关联，Resolution 语义与当前条目一致，且 `resolved_model_revision <= current revision`；其 `confirmation_model_revision` 及原始确认证据必须非空、可追溯且 `confirmation_model_revision <= current revision`。历史 Resolution 不因无关 revision 增加而失效；条目语义改变时必须由新 Issue supersede 旧 Issue；
5. 每个模型条目的 `source_refs` 中所有 SourceReference 对象都必须有效且来源类型与 origin 相容；顶层 `confirmation_evidence.source_ref_ids` 和 Resolution 的 `confirmation_source_ref_ids` 必须解析到可访问的 SourceReference。使用 Resolution 支撑时，模型条目必须引用 Issue ID，Issue `target_refs` 必须精确回指该模型条目；
6. 每个 RequirementItem 的 `scope_item_ids` 非空、引用有效且指向同一 `scope_disposition`；混合 disposition 的语义必须已拆分；至少存在一个 confirmed `scope_disposition=in_scope` ScopeItem 和一个由有效引用派生为 in_scope 的 confirmed RequirementItem；
7. 每个 in-scope RequirementItem 必须仅凭当前 confirmed 模型语义，足以形成至少一个可判定真假的完成条件；不强制 Given/When/Then，也不要求 Example 模型；
8. 每个 `origin=ai_default` 条目必须为 `understanding_status=confirmed + confirmation_mode=batch_confirmation`，并由当前有效、双向精确关联的 `issue_status=resolved` Issue 支撑；该 Issue 必须为 `resolution_route=apply_ai_default`、`error_impact=low`、`reversibility=easy`、`blocks_confirmation=false`，目标不是 problem、desired outcome、核心范围、关键业务规则或关键数据语义；Resolution 必须为 `resolution_type=accepted_default + resolved_by=user`，原始确认 revision/evidence 非空、可追溯且不晚于当前 revision；
9. success signal 的缺失四要素不单独使输入非法：定性和部分量化信号可按 confirmed 内容原样投影。仅当模型把某指标定义为验收或发布门槛，且缺失口径导致业务上无法判定是否通过时，输入才不满足 PRD-ready。

上述检查直接依据当前 confirmed 模型语义执行，不读取或假设存在独立的“扫描结果字段”。门禁应尽力完成逐 RequirementItem 的语义检查；若只有进入具体投影后才暴露此前不可见的产品语义缺口，则返回 ProjectionGap。

任一条件失败：禁止投影，只返回 InputContractFailure。不得猜测、修复或弱化门禁。
</HARD-GATE>

### InputContractFailure

```ts
interface InputContractFailure {
  output_type: "input_contract_failure";
  violated_rules: string[];
  affected_model_item_ids: string[];
  evidence: string[];
}
```

只报告失败，不猜测修复方式、不修改输入、不向用户澄清，也不选择下一步流程。

---

## 状态投影

| 输入内容 | 行为 |
|---|---|
| `confirmed` | 投影为 PRD 需求、规则、范围、验收依据或其他对应内容 |
| `confirmed + origin=ai_default` | 正常投影，Coverage 保留 ai_default provenance 与 accepted_default 用户支撑 |
| 已知且已确认的风险或取舍 | 仅当模型存在明确 confirmed RequirementItem、ScopeItem 或 rationale 时，作为普通风险内容保真投影；不得新增“已接受”等模型未提供的语义 |
| `superseded` Issue | 仅保留历史，不进入当前 PRD |
| `proposed / unresolved / unverified / conflicted / open Issue` | 输入非法，返回 InputContractFailure |

---

## 写作中发现产品语义缺口

本 Skill 不向 PM 追问、不做产品决策、不应用默认、不创建 RequirementIssue、不修改 revision，也不把缺口写入 PRD。

发现任何需要补充、决定、验证或纠正才能保持产品语义保真的信息时，立即暂停受影响部分，只返回：

```ts
interface ProjectionGap {
  output_type: "projection_gap";
  gap_type:
    | "missing_information"
    | "ambiguity"
    | "conflict"
    | "validation"
    | "scope"
    | "terminology";
  summary: string;
  affected_model_item_ids: string[];
  source_refs: string[];
  projection_impact: string;
}
```

`ProjectionGap` 是只读诊断，不是 RequirementIssue，也不改变 canonical 输入。只有不改变需求事实的纯写作组织问题可在本 Skill 内修复。

---

## 交付门禁

1. **输入仍有效**：写作结束前重新执行本 Skill 的输入门禁，且 model revision 未变化；
2. **保真 100%**：所有 in_scope 条目均有 Coverage 落点；
3. **状态正确**：正文只投影 confirmed 模型语义；superseded 只作历史；已确认风险/取舍仅按明确模型依据普通投影；
4. **不写实现**：接口、表结构、技术状态机、prompt 和编排按 R-T1 裁决；
5. **验收可验证**：每个 REQ 必须有可验证完成条件，但不强制统一使用 Given/When/Then。简单功能可用清晰验收结果或检查表；条件分支、异常和边界适合 Given/When/Then；条件组合可用决策表；状态需求可用状态转换表；数据或质量属性使用口径或指标阈值。模型不足以形成可验证结果时返回 ProjectionGap；
6. **非目标准确**：只从 out_of_scope 边界生成；
7. **成功信号保真**：定性和部分量化 success signal 都按当前 confirmed 内容原样投影为叙述或列表；只有模型同时明确提供完整基线、目标、测量口径和时间窗时，才渲染结构化量化指标表。缺少四要素本身不产生 ProjectionGap；仅当该指标被模型定义为验收或发布门槛，且缺失口径使业务语义无法判定时才返回 ProjectionGap。

---

## Loader

| 何时 | 读 |
|---|---|
| 节点定义、优先级和空值语义 | `prd-language.md` |
| 规则、门禁和自检 | `projection-rules.md` |
| 选章、归一和防重复 | `chapter-tree.md` |
| Core / 页面 / 埋点 / BR | `templates/core.md` |
| AI 章 | `templates/ai.md` |
| 后台 / 非功能 | `templates/backend.md` |
| 数据 | `templates/data.md` |
| i18n / 发布 / Future Scope / 风险依赖 | `templates/extension.md` |

---

## 输出

- 仅支持同一 Session 内的 Micro / Normal 投影；默认输出最终 PRD。
- 路径由调用方提供，未提供时使用当前目录 `PRD-<主题>.md`。
- Coverage 和质检记录是当前投影过程中的内部工作信息，不落盘、不默认展示。
- 写作结束前重新校验 model ID/revision 与完整输入门禁；不一致时只返回 InputContractFailure。
- 不创建持久投影状态、工作标记或恢复协议，只交付最终 PRD、InputContractFailure 或 ProjectionGap。
