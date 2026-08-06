# PRD Language — PRD 表达语言定义

> 定义 PRD 节点、编号、优先级和空值语义。Template 定义节点长相，projection-rules 定义投影约束。

---

## 节点类型

| 节点 | 读作 | 承载什么 | 编号 |
|---|---|---|---|
| **REQ** | Requirement | 一个 in_scope 功能能力 | `REQ-001` 起连续递增 |
| **BR** | Business Rule | 跨 ≥2 个 REQ 复用的 confirmed 业务规则 | `BR-001` 起连续递增 |
| **AC** | Acceptance Criteria | 基于 confirmed 语义、可判定真假的验收表达；格式按需求类型选择 | `AC-001` 起，REQ 内独立编号 |

写作中发现的新产品语义不得直接进入 PRD，必须返回 ProjectionGap；纯写作组织问题才可在投影内部处理。

---

## 编号规范

- 实例用 `REQ-001` / `BR-001`；泛指占位用 `REQ-00X` / `BR-00X`。
- 同类条目按出现顺序连续编号，不按类型或优先级分段。
- 交叉引用写语义编号，引用目标必须存在。
- Coverage 保留 RequirementModel item ID；PRD 编号不能替代模型来源 ID。

---

## AC 语法与格式选择

每个 REQ 必须有至少一个可验证完成条件。AC 是 PRD 验收表达，不等于固定语法，也不得据此创建或回写 `Example` 模型对象。

| 需求类型 | 推荐验收表达 |
|---|---|
| 简单功能 | 清晰验收结果或检查表 |
| 条件分支、异常、边界 | Given/When/Then 场景 |
| 多条件组合 | 决策表 |
| 状态需求 | 状态转换表 |
| 数据或质量属性 | 测量口径或指标阈值 |

简单验收结果：

```text
| 编号 | 可验证完成条件 | 验证方式 |
|---|---|---|
| AC-001 | <可观察、可判定真假的完成结果> | <检查步骤或证据> |
```

Given/When/Then（仅在条件场景适用时使用）：

```text
| 编号 | 场景 | Given（前置条件） | When（动作 / 事件） | Then（可验证结果） |
|---|---|---|---|---|
| AC-001 | <场景名> | <前置条件> | <动作 / 事件> | <可验证结果> |
```

决策表、状态转换表及指标阈值表按 `templates/core.md` 选用。一个 REQ 可组合多种表达；结果必须可判定真假。模型语义不足以形成可验证结果时，不进行推断，返回 ProjectionGap。

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

如果缺失会改变目标、范围、规则、验收、风险或实现理解，不能用“模型未提供”掩盖，必须返回 ProjectionGap。定性或部分量化 success signal 应按 confirmed 内容原样投影；缺少基线、目标、测量口径或时间窗本身不属于此类缺失，只有指标被定义为验收或发布门槛且因此无法判定时才返回 ProjectionGap。
