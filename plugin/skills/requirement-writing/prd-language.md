# PRD Language — PRD 表达语言定义

> 定义 PRD 节点、编号、优先级和空值语义。Template 定义节点长相，projection-rules 定义投影约束。

---

## 节点类型

| 节点 | 读作 | 承载什么 | 编号 |
|---|---|---|---|
| **REQ** | Requirement | 一个 in_scope 功能能力 | `REQ-001` 起连续递增 |
| **BR** | Business Rule | 跨 ≥2 个 REQ 复用的 confirmed 业务规则 | `BR-001` 起连续递增 |
| **AC** | Acceptance Criteria | 基于 confirmed 语义的 Given/When/Then 验收场景 | `AC-001` 起，REQ 内独立编号 |
| **Open Item** | 待决与验证事项 | 输入中显式保留的 parked 或 validation_plan 项 | 无需编号；保留 Issue ID |
| **Accepted Risk** | 已接受风险 | `resolution_type=accepted_risk` 的风险决定 | 无需业务编号；保留 Issue ID |

现场发现的未知不得直接创建为 Open Item。新产品语义缺口必须返回 ProjectionGap；纯写作组织问题才可在投影内部处理。

---

## 编号规范

- 实例用 `REQ-001` / `BR-001`；泛指占位用 `REQ-00X` / `BR-00X`。
- 同类条目按出现顺序连续编号，不按类型或优先级分段。
- 交叉引用写语义编号，引用目标必须存在。
- Coverage 保留 RequirementModel item ID；PRD 编号不能替代模型来源 ID。

---

## AC 语法（Given/When/Then）

```text
| 编号 | 场景 | Given（前置条件） | When（动作 / 事件） | Then（可验证结果） |
|---|---|---|---|---|
| AC-001 | <场景名> | <前置条件> | <动作 / 事件> | <可验证结果> |
```

- 一个 REQ 至少一组 AC；主路径、异常和边界分别成行。
- Then 必须可判定真假，不写“体验更好”等不可测断言。
- 模型语义不足以形成 Then 时，不进行推断，返回 ProjectionGap。

---

## Delivery Priority 映射

| RequirementItem.delivery_priority | PRD 优先级 |
|---|---|
| `must` | P0：本期必须，缺则不可交付 |
| `should` | P1：本期应做 |
| `could` | P2：可后置或视资源裁剪，但仍属于 in_scope |
| `unspecified` | 未指定；如必须确定且影响排期，返回 ProjectionGap |

`out_of_scope` 不通过优先级表达，不生成当前 REQ。

---

## 空值语义（禁止裸写“无”）

| 值 | 使用条件 |
|---|---|
| `已确认无` | RequirementModel 或有效 Resolution 明确确认不存在 |
| `模型未提供（非需求事实）` | 仅缺少不改变产品判断的展示元数据 |
| `不适用（说明原因）` | 该字段对当前模型不适用，原因可由模型推导 |

如果缺失会改变目标、范围、规则、验收、风险或实现理解，不能用“模型未提供”掩盖，必须返回 ProjectionGap。
