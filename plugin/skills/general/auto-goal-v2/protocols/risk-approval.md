# 风险与批准协议

> 加载时机：`PLANNING`（与 `goal-model.md` 同时）。
> 机械校验：`protocols/runtime/risk.mjs`、`approval.mjs`、`planning-gate.mjs`。

## 1. 别用工具名判风险

「危险 = rm / force push」是软件偏见。`rm` 一个临时文件无害，发一封邮件不可撤销。风险由五个维度描述：

| 维度 | 取值（递增） | 提问 |
|---|---|---|
| `reversibility` | `easy → costly → impossible` | 用同样能力能撤销吗？代价？ |
| `externality` | `private → shared → public` | 效果是否离开用户私域？ |
| `blast_radius` | `one → bounded_many → unbounded` | 影响多少实体？可枚举吗？ |
| `undo_window` | `available → short → none` | 存在可撤销的时间窗吗？ |
| `detectability` | `loud → observable → silent` | 出错时用户会察觉吗？ |

**缺失维度按最坏情况填充**（`normalizeRisk()`）。未评估的动作被视为最高风险：忘记评估应当抬高门槛，否则「不填 risk 字段」就是绕过升级的免费通道。返回值中的 `unassessed` 数组把「未评估」与「已评估为低风险」区分开，两者不可对 decider 混同呈现。

## 2. 风险 → 最低证据等级

```text
baseline: 见 goal-model.md §4

raise to at least E4 if any of:
  externality != private        # 外部化的社会效果几乎从不可逆
  reversibility == impossible
  blast_radius == unbounded
  detectability == silent       # 静默污染比响亮失败更危险

compare with ceiling = min(type ceiling, criterion.max_rung)
if required > ceiling => UNTESTABLE，必须在规划期披露
```

`deriveRequiredRung()` 同时返回 `required`（诚实的要求）与 `effectiveRequired`（验证实际能达到的），`untestable` 标记两者不等。**不做静默 cap**：把要求 E4 的判据悄悄降到 E3 就能通过，等于把不可判定伪装成已满足。

per-criterion 的 `max_rung` **只能降低不能提高**类型上限——提高会让 JUDGMENT 声称它的 acceptor 从未给出的等级。

首版映射刻意保守，不假装量化概率。任何放宽必须新增回归测试。

## 3. 批准的性质

批准绑定五元组：

```text
action kind × exact target set × scope_version × risk summary × time window
```

`recordApproval()` 强制记录：

- **枚举后的目标集**，不是描述（`TARGETS_NOT_ENUMERATED`）。「所有旧文件」不是目标集。
- **用户原话**（`MISSING_VERBATIM`）。由想要推进的一方撰写的摘要不构成同意证据。
- **批准者身份**，且必须是 decider（`APPROVER_NOT_DECIDER`）。
- **绑定的 `scope_version`**。

批准**不传递**：不跨目标、不跨实例、不跨 scope_version。

### 什么不算批准

沉默、「继续」、「好」、「你决定」、带条件同意、执行者自行推断，均**不构成批准**（`isNonApproval()` → `NOT_AN_APPROVAL`）。只接受明确的「批准当前 goal/scope_version」或「拒绝并修正」。

### 追问 vs 批准

两者不同：**追问补的是信息，批准给的是权力**。信息可由 Agent 自己查（则不该问）；权力只能来自 principal（则必须问）。

## 4. Delta re-approval

执行前重新计算实际动作风险。`checkDeltaApproval()` 在以下任一变化时要求重新批准：

| 变化 | code |
|---|---|
| 目标集扩大**或身份改变** | `TARGET_SET_EXPANDED` |
| 动作类型改变 | `ACTION_KIND_CHANGED` |
| 任一风险维度上升 | `RISK_INCREASED` |
| `scope_version` 改变 | `SCOPE_VERSION_CHANGED` |
| 超出时间窗 | `APPROVAL_EXPIRED` |

目标集规则是**子集 + 身份**双重判定，不是计数比较：把 f3 换成 f9 保持数量不变，却作用在从未被批准的对象上。误识别的危害通常大于动作本身——「批量改名」真正的风险不是改名，是改错目录。

严格子集不需要重新批准；风险下降也不需要。

## 5. 目标集枚举

`requiresTargetEnumeration()`：

- `blast_radius == bounded_many` → 必须枚举，且枚举本身是批准对象。
- `blast_radius == unbounded` → **不可枚举**（`UNBOUNDED_NOT_ENUMERABLE`）。这是阻塞发现，不是继续的许可；必须缩小到可枚举集合或拆分为多步。
- 单目标但外部化/不可逆 → 仍需确认目标身份。

## 6. 中断前不变量

`checkInterruptionInvariants()`，在等待用户输入前必须成立：

| 不变量 | 违反 code | 理由 |
|---|---|---|
| 无在途不可回滚副作用 | `IRREVERSIBLE_IN_FLIGHT` | 恢复时中断点之前的代码会重跑 |
| 已开始的可逆步骤处于自洽状态 | `INCOHERENT_STATE` | 半改坏的状态不是 PARTIAL，是 BLOCKED |
| 只含一个决策 | `MULTIPLE_DECISIONS` | 多决策节点无法确定性恢复 |
| 2–3 个互斥选项 | `INSUFFICIENT_OPTIONS` / `TOO_MANY_OPTIONS` | 超过 3 个说明混入了多个决策 |
| 载荷可 JSON 序列化 | `NOT_SERIALISABLE` | 否则无法持久化和恢复 |
| 默认动作是 `NO_ACTION` 或 `SAFE_ROLLBACK` | `UNSAFE_DEFAULT` | 不回复绝不能默认继续 |
| 带 `resume_token` 与 `required_from` | `MISSING_RESUME_TOKEN` | 否则回答后无法原样续跑 |

「一个中断 = 一个决策」不是风格偏好：业界实现中恢复会重跑中断点之前的代码，因此一个节点承载两个决策就无法确定性恢复。

## 7. 复合门禁

`gateStep()` 组合上述检查，是控制器在派发带副作用步骤前的唯一入口。返回 `recommendedPhase`：

```text
无 blocker                        → EXECUTING
有 blocker 且 principal 持有钥匙   → NEEDS_INPUT   # 优先问，而不是停
有 blocker 且无人可提供            → BLOCKED
```

这个优先级来自终态仲裁序：**能被一句回答原样续跑的，就不该报 BLOCKED**。

五条 HARD GATE（`checkHardGates()`）作为数据保存，任一失败即禁止执行：

| ID | 规则 |
|---|---|
| G1 | 未对齐 goal/scope_version，不执行 |
| G2 | 未分类 criteria 或 evidence contract 不完整，不执行 |
| G3 | 副作用未通过 capability/risk/approval guard，不执行 |
| G4 | worker 必须经 dispatch/proxy，不得直收长结果 |
| G5 | outcome 只能由 derive-outcome 产生 |
