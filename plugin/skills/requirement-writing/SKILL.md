---
name: requirement-writing
description: 将满足中立 ConfirmedRequirementInput 契约的 RequirementModel 与 RequirementIssue[] 投影为结构清晰、信息保真的标准 PRD。用户要求“写 PRD”“出产品需求文档”“把已确认需求整理成 PRD”时触发。只做输入校验、scope 裁剪、文档组织、正文生成和规则自检；不做需求澄清、需求决策、技术方案、UI 设计或任务拆分。非法输入返回 InputContractFailure，写作中发现产品语义缺口返回 ProjectionGap。
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

### 复杂度分流

- **Micro / Normal**：直接执行四步；
- **Large**：Freeze → Scaffold → Fill → Check；
- **Large 强信号**：来源需分块读取、多份来源共同决定需求、跨多个业务域且含多组 REQ/BR/Extension，或正文无法在一次稳定生成中完成。

---

## Large 路径

<HARD-GATE name="Large 先骨架后正文">
写任何正文前，必须完成 Freeze 和 Scaffold，并留下可恢复证据。没有 projection-state 或目标 PRD 骨架，禁止进入 Fill。
</HARD-GATE>

| 阶段 | 动作 | 完成证据 |
|---|---|---|
| **Freeze** | 冻结 model ID/revision、scope、术语、需求、支持型 Issue、章节归属和 Coverage | `.<PRD basename>.projection-state.md` |
| **Scaffold** | 按 chapter-tree 落完整标题骨架 | 仅骨架与 pending 标记 |
| **Fill** | 按依赖每次写一个章节；功能需求每次写一个 REQ + AC | 章节完成并标 done |
| **Chapter Check** | 检查模型覆盖、来源、术语、编号和支持型 Issue | 通过后进入下章 |
| **Global Check** | 生成 TL;DR，执行 Coverage 与 P0→P1→P2 | 无 pending 和临时 state |

Projection State 只保存稳定 ID、revision、来源索引和投影进度，不复制第三套需求模型。

---

## 输入门禁

<HARD-GATE name="输入契约与范围">
投影前必须读取 `../../shared/confirmed-requirement-contract.md`，并完整执行其中的 `is_valid_confirmed_requirement_input` 唯一谓词，包括 revision/确认、Issue/认知状态、未闭合项支撑、RequirementItem scope 归属、身份/来源和 AI default 的 accepted_default 证据。
任一条件失败：禁止投影，只返回 InputContractFailure。不得维护弱化版或局部门禁。
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
| `confirmed` | 投影为 PRD 需求、规则、范围或验收依据 |
| `confirmed + origin=ai_default` | 正常投影，Coverage 保留 ai_default provenance |
| `unresolved + parked` | 投影到“待决与验证事项”，状态为暂缓 |
| `unverified + validation_plan` | 投影到“待决与验证事项”，状态为待验证 |
| `unresolved + accepted_risk` | 投影到“风险与依赖”，明确已接受风险 |
| `superseded` Issue | 仅保留历史，不进入当前 PRD |
| `proposed / conflicted / open Issue` | 输入非法，返回 InputContractFailure |

---

## 写作中发现产品语义缺口

本 Skill 不向 PM 追问、不做产品决策、不应用默认、不创建 RequirementIssue、不修改 revision，也不把缺口直接写成 Open Item。

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

1. **输入仍有效**：写作期间 model revision 未变化；
2. **保真 100%**：所有 in_scope 条目均有 Coverage 落点；
3. **状态正确**：parked、validation_plan、accepted_risk 投影到指定章节；
4. **不写实现**：接口、表结构、技术状态机、prompt 和编排按 R-T1 裁决；
5. **验收完整**：每个 REQ 有 Given/When/Then；
6. **非目标准确**：只从 out_of_scope 边界生成；
7. **指标有依据**：量化指标满足四要素，或模型明确确认无量化指标。

---

## Loader

| 何时 | 读 |
|---|---|
| 输入边界校验 | `../../shared/confirmed-requirement-contract.md` |
| 节点定义、优先级和空值语义 | `prd-language.md` |
| 规则、门禁和自检 | `projection-rules.md` |
| 选章、归一和防重复 | `chapter-tree.md` |
| Core / 页面 / 埋点 / BR / Open Item | `templates/core.md` |
| AI 章 | `templates/ai.md` |
| 后台 / 非功能 | `templates/backend.md` |
| 数据 | `templates/data.md` |
| i18n / 发布 / Future Scope / accepted risk | `templates/extension.md` |

---

## 输出与恢复

- 默认输出 PRD；路径由调用方提供，未提供时使用当前目录 `PRD-<主题>.md`。
- Coverage 和质检记录是内部工作态，不默认展示。
- 存在 projection-state 时，先校验 model ID/revision，再从首个可执行章节继续。
- revision 不一致时停止 Fill，只返回 InputContractFailure；不得继续使用旧模型。
- state 丢失但 PRD 有 `PRD-WORKING` 时，可根据合法输入和已完成章节重建最小投影状态。
- 全局检查通过后删除工作标记和 projection-state，只交付最终 PRD。
