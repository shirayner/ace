# 对齐协议

> 加载时机：`ALIGNING`（与命中的 method pack 同时）。
> 机械校验：`protocols/runtime/router.mjs`。

## 1. 临时 Frontier

每轮从当前 Goal、Mandate、判据台账和未决决策**重新派生**。问题只有同时满足四条才可进入（`deriveFrontier()`）：

1. 未决；
2. 前置决策已解决；
3. 答案会实质改变范围、风险、计划或判据；
4. 答案**只能**由 principal 提供，Agent 无法查证。

第四条最常被违反。可查事实由 discovery worker 查（`delegated`，`suggestedDispatch: DISCOVER`），**不把用户当搜索引擎**。

> **Frontier 禁止持久化**（不变量 I13）。它是瞬时计算结果，不得写入 journal、checkpoint 或任何长期清单。`assertNotPersisted()` 机械检查这一点。
>
> 理由：存下来的 Frontier 会在使它失效的答案到达之后仍被查阅，让已解决的问题复活。用户回答后旧 Frontier 立即失效。

## 2. 提问判据

```text
不确定性 × 猜错代价 > 提问成本
且答案只在 principal 手中
```

`worthAsking()` 实现上式；**惊讶测试兜底**：用户此刻看到该决定会惊讶，则必须问，无论算术结果如何。

- 每次中断只解决**一个承重决策**，且是最上游的那个（`next`）。后面的问题可能因前面的答案而失效。
- 一个问题含 2–3 个互斥选项 + 推荐项 + 取舍代价，而非开放式提问。
  「业务上允许异步吗？若允许我建议返回任务号」优于「接口怎么设计」。
- **未问的槽位一律登记为假设**，并写 defeat condition（什么现象出现说明它不成立）。假设很便宜，**未记录的假设**才是事故源。

### 追问何时停止

- 已定位到可度量结果；
- 已定位真实任务；
- 继续追问只进入不影响当前决策的上层战略；
- 原请求已被证明只是方案，且问题已被重定义。

## 3. 信号 → 方法包

方法包**按命中信号加载**，未命中的知识不进入上下文（`route()`）。这既不是固定问卷，也不是「全文加载后在 prompt 内用 `[IF]` 跳过」——后者对已经进入上下文的内容毫无作用。

| 信号 | 方法包 | 更新 |
|---|---|---|
| 输入是方案或动作 | `outcome-reframing` | `intent` |
| 目标/主体歧义 | `ambiguity` | `subject/scope` |
| 规则密集或组合多 | `decision-table` | criteria |
| 存在模糊词 | `ambiguity` | criteria/constraints |
| 存在 `JUDGMENT/KNOWLEDGE` 判据 | `judgment-sampling` | evidence contract |
| 高爆炸半径 | `target-enumeration` | approval scope |
| 领域不熟 | `domain-anchoring` | assumptions/evidence |
| 有人工补偿或影子流程 | `current-flow` | constraints |
| 假设承重 | `examples-defeaters` | assumption status |
| 能力或授权不明 | `mandate-probe` | attainable/residual |

`domain-anchoring` 有硬证据支撑：同一规划任务仅更换词表，模型成功率从 62.6% 崩到 0.8%。领域术语陌生会让规划质量崩塌，因此必须先做术语落地。

## 4. 唯一对齐产物

进入规划前生成五段式 Goal Alignment Card（模板见 `templates/alignment-card.md`）：

1. 目标差量；
2. 本轮范围与非目标；
3. 关键假设、约束及 Mandate 缺口；
4. criteria 与所需证据等级；
5. residual、风险和批准点。

需要用户确认时，只接受明确的**批准当前 goal/scope_version** 或**拒绝并修正**。沉默、「继续」、带条件同意、执行者自行推断均不算批准（详见 `risk-approval.md` §3）。

## 5. 与规划期披露的衔接

对齐卡的第 3、5 段承担一项不可推迟的义务：**`residual` 和 `UNTESTABLE` 判据必须在此刻披露**，不能等执行到最后才「发现」。

- `partitionGoal()` 给出 residual 与 `maxOutcome`；
- `criteriaGate()` 给出 `untestableCount`；
- 两者非零时，对齐卡必须显式写出，且原始目标终态上限已经确定为 `PARTIAL` 或 `UNVERIFIABLE`。

多数跨系统、主观或延迟目标的**正确终态不是 DONE**。把 DONE 当默认目标的系统必然以假 DONE 收场。
