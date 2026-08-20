# 状态机协议

> 加载时机：任何 phase 转换前。
> 机械校验：`protocols/runtime/state-machine.mjs`。

## 1. Phase 与 Outcome 是两个字段

```text
NEW → ALIGNING → PLANNING → EXECUTING ↔ NEEDS_INPUT → VERIFYING → TERMINAL
进程重启 → RECOVERING → 最近合法非终态
```

| | 含义 | 取值 |
|---|---|---|
| `phase` | 现在在哪 | `NEW ALIGNING PLANNING EXECUTING NEEDS_INPUT VERIFYING RECOVERING TERMINAL` |
| `outcome` | 怎么结束的 | `DONE PARTIAL BLOCKED UNVERIFIABLE NEEDS_INPUT` |

**`BLOCKED` 不是 phase，是 outcome**。设计 §6.3 把它写成 `* → BLOCKED`，本协议解释为 `* → TERMINAL(outcome=BLOCKED)`：§6.1 与 checkpoint 契约都要求 phase 与 outcome 分存，若 BLOCKED 同时是 phase，同一事实就有两处记录，reducer 无从判断哪个权威。

`NEEDS_INPUT` 是唯一合法重叠：它既是可恢复 phase，也是可上报 outcome，但**不产生 `GOAL_TERMINATED`**。可 seal 的终态只有 `DONE / PARTIAL / BLOCKED / UNVERIFIABLE`。

`validatePhaseOutcome()` 双向校验：非终态不得携带 seal 型 outcome；`TERMINAL` 必须携带一个，且 `BLOCKED` 必须带 reason。

## 2. 不设 FAILED

明确失败、方案证伪、尝试穷尽全部归入：

```text
BLOCKED(reason = FALSIFIED | EXHAUSTED | PLAN_CHANGE_REQUIRED | CONSTRAINT_VIOLATED | INCOHERENT_STATE | INVARIANT_VIOLATED)
```

`FAILED` 不提供额外恢复语义，反而与 `BLOCKED`、`VIOLATED` 重叠；具体性质由 reason 保留。

**注意**：计划虽失效但已能确定合法替代计划时，回到 `PLANNING`，不得滥用 `BLOCKED`。`BLOCKED` 的含义是「当前无任何可触达行为者能提供继续所需之物」。

## 3. Transition guards

`checkTransition()` 逐条检查。**未证明的前置条件计为未满足**——`context` 中缺失的键或非 `true` 的值都不放行，避免「大概满足了」通过门禁。

| 转换 | 必须满足 |
|---|---|
| `NEW→ALIGNING` | task root 与首事件已持久化 |
| `ALIGNING→PLANNING` | Goal 完整；in/out 明确；criteria 已分类；必要批准已记录 |
| `PLANNING→EXECUTING` | next step 唯一；Mandate 可达；evidence contract 可达；副作用 guard 通过 |
| `EXECUTING→VERIFYING` | 声称产物存在；manifest 已登记；原始输出已由 Proxy 处理 |
| `VERIFYING→EXECUTING` | 尚有未满足判据，且下一步合法可达 |
| `VERIFYING→TERMINAL` | outcome 由 reducer 产生；handoff 字段齐全 |
| `*→NEEDS_INPUT` | 命名输入可由 principal 提供；可原样恢复；中断前不变量成立 |
| `*→TERMINAL` | 同 `VERIFYING→TERMINAL` |
| `*→RECOVERING` | task root 可定位且权限有效 |
| `RECOVERING→*` | checkpoint 已由 reducer 重建；悬空 effect intent 已先观测 |

`TERMINAL` 不可离开。

## 4. 生命周期

1. **Intake** — 创建 task root、journal segment、空 checkpoint。
2. **Understand** — 信号路由、事实查证、Frontier、Defeater。
3. **Align** — 生成对齐卡；必要时取得 `scope_version` 批准。
4. **Plan one step** — 只规划下一个可验证短步；做 Mandate、风险、批准、证据可达性检查。
5. **Dispatch** — 构造 ≤2 KiB input envelope；超限在启动前拒绝。
6. **Act** — worker 产出 artifact 或副作用事实；控制面追加事件。
7. **Verify** — 独立 verifier 读原文，主 Agent 只收证据 envelope。
8. **Reduce** — 从 journal 推导 checkpoint、台账和唯一 `next_action`。
9. **Interrupt or continue** — 需要用户钥匙则生成单决策 interruption，否则执行下一短步。
10. **Derive outcome** — 纯函数推导终态。
11. **Seal** — 写最终 manifest 和 handoff，追加 `GOAL_TERMINATED`。

**只规划下一个短步**，不一次规划 20 步：长程规划可靠性从 97.8% 掉到 23.63%，短步 + 每步验收是对此的直接回应。

## 5. 唯一 next_action

所有非终态 checkpoint 必须恰好有**一个** `next_action`（不变量 I8）。0 个或多个均为 reducer 错误，不是「灵活性」——多个候选下一步意味着方向决策未做，应先做决策或发起中断。

`gateStep()` 的 `competing_steps > 1` 会以 `NEXT_STEP_NOT_UNIQUE` 阻止执行。
