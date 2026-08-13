# Goal 模型协议

> 加载时机：`PLANNING`（与 `risk-approval.md` 同时）。
> 机械校验：`protocols/runtime/goal-shape.mjs`、`criteria-gate.mjs`、`mandate.mjs`。

## 1. Goal：与 Agent 无关的世界差量

```yaml
goal:
  goal_id: g-001
  intent: "世界将变成什么样，而不是要执行什么动作"
  subject: "唯一可解析的作用对象"
  principals:
    owner: "目标归属者"
    decider: "可改变范围或批准取舍者"
    acceptor: "有权判定完成者"
  criteria: [criterion_id]
  constraints: [constraint_id]
  scope:
    in: []
    out: []
    deferred: []
    external_dependencies: []
  horizon: "目标成立的时间窗口"
  scope_version: 1
```

四条阻塞性约束，由 `validateGoalShape()` 检查：

| 约束 | 违反时的 code | 修复动作 |
|---|---|---|
| `intent` 必须是结果差量 | `INTENT_IS_ACTION` | 反推：这个动作成功后世界有什么不同？用差量替换 |
| `subject` 解析到唯一指称 | `SUBJECT_UNRESOLVED` | 指称消解；高爆炸半径前枚举确切目标集 |
| `scope.in` 与 `scope.out` 同权必填 | `MISSING_SCOPE_OUT` | 只写 in 的范围不是范围 |
| 三个功能位齐备 | `MISSING_PRINCIPAL` | 可为同一主体，但功能位不可省略 |

**为什么强制差量形式**：「做个批量导入」不是 intent，「运营不再需要每天手工录入 2 万条」才是。前者把方案伪装成需求，一旦接受，后续所有判据都会围绕「导入功能是否写完」而不是「录入工作是否消失」展开——目标已经被悄悄换掉了。

`scope_version` 只能通过 decider 同意的 `SCOPE_CHANGED` 事件 +1 递增（`validateScopeChange()`，不变量 I2）。这不是形式主义：没有这道锁，「先偷偷缩范围再宣布完成」始终可行。`detectSilentNarrowing()` 独立检测被丢弃且未登记 MOOT 的判据，任何命中都把终态上限压到 `PARTIAL`。

## 2. Mandate：Agent 当前能合法做到什么

能力不是布尔值。五个分量各自独立可缺失，**缺哪一个决定正确终态**：

| 分量 | 提问 | 缺失后果 | 能否靠提问解决 |
|---|---|---|---|
| `effector` | 存在通往目标物的改变机制吗 | 重定为可达前缀 | 否 |
| `access` | 在该效应器上有凭证吗 | `NEEDS_INPUT(ACCESS_REQUIRED)` | 是 |
| `authority` | 主体允许把它用于此事吗 | `NEEDS_INPUT(APPROVAL_REQUIRED)` | 是 |
| `competence` | 用它能做对吗 | 有界重试后 `BLOCKED` | 否 |
| `observation` | 行动后能独立读回吗 | 可能 `UNVERIFIABLE` | 否 |

`access` 与 `authority` 正交：**有密码不等于有授权**。把两者合并成「能不能做」会让「我有 token」直接推导出「我可以发」。

```text
attainable = goal ∩ mandate
residual   = goal \ mandate
```

`partitionGoal()` 在**规划期**计算。`residual` 非空时：

- 当场向 decider 披露，不得执行到最后才「发现」；
- 给出责任人、下一动作、所需输入、验收方式（`validateHandoff()`）；
- 重定向到「可达前缀 + 交接物」必须由 decider 批准；
- 即使可达前缀全部完成，原始目标终态**最多 `PARTIAL`**。

**头号失效模式**：用户说「帮我退订健身房」，Agent 写了封邮件草稿然后报 DONE。合法形态只有一种——显式重定范围并取得同意。

## 3. 三轴画像

| 轴 | 问题 | 缺失后果 |
|---|---|---|
| Reachability | 有合法效应器改变目标物吗 | 只能交付计划/草稿 |
| Observability | 行动后能独立读回吗 | 能行动但不能自证 |
| Decidability | 判据有客观真值条件吗 | 读回也无法定论 |

三轴决定证据上限和追问方向，**不创建不同领域的固定流水线**。软件工程恰好三轴拉满，是特例而非原型；以它为模板的模型迁到别的领域会静默失效。

## 4. Criterion 类型

| 类型 | 定义 | 判定权 | baseline | 上限 |
|---|---|---|---|---|
| `STATE` | 某时点世界命题 | Agent | E2 | E4 |
| `BEHAVIOR` | 激励下的响应 | Agent | E3 | E3 |
| `ARTIFACT_PROPERTY` | 产物的明文可核查属性 | Agent | E3 | E4 |
| `JUDGMENT` | 依赖人的评价 | acceptor | E4 | E4 |
| `EFFECT` | 延迟或统计性世界效果 | 指标所有者 | E5 | E5 |
| `KNOWLEDGE` | 用户理解发生变化 | 用户/考核者 | E4 | E4 |
| `NEGATIVE` | 声称某事未发生 | Agent（有界） | E3 | E3 |

`criteriaGate()` 强制的规则：

1. **未分类不得执行**（`UNCLASSIFIED`）。
2. **模糊词必须量化**，或显式降级为 `JUDGMENT` 并指定 acceptor（`UNQUANTIFIED_VAGUE_PREDICATE`）。快/大量/及时/合理/实时/相关/异常在任何领域都是缺失阈值的伪装。
3. **`NEGATIVE` 必须有界**：「没有任何问题」不可证，改写为「已在 A/B/C 检查，未发现 X」（`UNIVERSAL_NEGATIVE` + `MISSING_CHECK_SURFACE`）。全称否定是假 DONE 的温床。
4. **`JUDGMENT/KNOWLEDGE/EFFECT` 的 acceptor 不能是 Agent**（`AGENT_CANNOT_ACCEPT`，不变量 I9）。V2 不允许用「用户预授权的代理 rubric」把它们转成 Agent 自验；rubric 只能验证产物属性，不能替代最终判定。
5. **`EFFECT` 超出会话窗口**时只能转为经同意的代理指标（并声明其为代理）或移入 `deferred`（`EFFECT_BEYOND_HORIZON`）。
6. **空判据集不可执行**（`NO_CRITERIA`）：否则 reducer 会真空推导出 DONE。

## 5. 证据阶梯

| 等级 | 含义 | 能证明什么 |
|---|---|---|
| E0 | 模型断言 | **什么都不能证明** |
| E1 | 行动痕迹 | 动作被执行，**不证明效果** |
| E2 | 独立读回 | 某时点状态成立 |
| E3 | 对读回结果做机械检验 | 明文规则被满足 |
| E4 | 外部权威确认 | 判定权在位 |
| E5 | 世界效果度量 | 目标差量真实发生 |

**E1→E2 是最常被跳过的一级**，也是外部系统类目标假 DONE 的唯一来源。外部 API 返回 200 只是 E1；没有独立查询、回执或权威确认不得上舍入（`meetsRung()`，不变量 I14）。

## 6. 判据台账

```json
{
  "criterion_id": "c-1",
  "scope_version": 2,
  "type": "STATE",
  "required_rung": "E2",
  "max_rung": "E4",
  "achieved_rung": "E2",
  "state": "SATISFIED",
  "evidence_refs": ["a-..."],
  "checked_at": "...",
  "acceptor_ref": null
}
```

状态：`SATISFIED | VIOLATED | UNTESTED | UNTESTABLE | MOOT`。

**终态由台账纯函数推导，模型无权撰写**。这把「不许假 DONE」从劝告变成结构。终态推导归 `lib/`（`derive-outcome`），本协议只负责保证进入台账的判据是合法的。
