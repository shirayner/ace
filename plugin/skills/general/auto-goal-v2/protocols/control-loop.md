# 控制循环 Runbook

> 加载时机：每一短步（`NEW` 及任何 phase 的执行期）。
> 机械校验：`protocols/runtime/planning-gate.mjs`、`state-machine.mjs`；持久化归 `lib/journal.mjs`、`lib/reducer.mjs`。

本文件回答一个问题：**每一步具体调用哪个模块，以及主 Agent 在这一步能看到什么**。协议语义归各 phase 协议，不在此复述。

## 1. 六步顺序

顺序不可交换。跳过 4 或 5 会让状态只存在于叙述里，下一次恢复就找不到它。

| 步 | 动作 | 模块 | 主 Agent 摄入 |
|---|---|---|---|
| 1 READ | 读 checkpoint 并验 cursor | `readCheckpoint()`、`verifyCursor()` | ≤2 KiB |
| 2 LOAD | 按 phase 加载一份协议 + 命中 pack | `route()` 给出 pack 列表 | 一份协议正文 |
| 3 STEP | 执行一个可验证短步 | 见 §3 分派表 | 见 §3 |
| 4 APPEND | 追加已发生事实 | `appendEvent()` | 事件回执，非正文 |
| 5 REDUCE | 重新派生 checkpoint 与台账 | `reduceCheckpoint()` | ≤2 KiB |
| 6 NEXT | 执行唯一 `next_action` | `deriveNextAction()` 已在 5 中算出 | — |

`appendEvent()` 内部持 task 单写锁、校验 `expectedSeq`/`expectedEventHash`、封 hash 链。**并发冲突抛 `JournalConflictError`，正确反应是重读 cursor 后重试，不是换个 seq 强写。**

## 2. 事实与提案的分界

journal 只记**已发生的事实**。这条界线决定了什么能进第 4 步：

| 可追加 | 不可追加 |
|---|---|
| `WORKER_RESULT_ACCEPTED`（结果已校验） | 模型的推理与思维链 |
| `EFFECT_OBSERVED`（已独立读回） | 完整 prompt、stdout/stderr、diff |
| `APPROVAL_GRANTED`（principal 已明确表态） | Frontier（I13：从不持久化） |
| `STEP_PLANNED`（计划这一事实本身） | 计划的内容当作已完成 |

合法事件类型是 `lib/vocabulary.mjs` 的 `EVENT_TYPES` 闭集。**不存在通用 `STATE_SET`**——它会成为绕过语义校验的通道。

单事件硬上限 4 KiB；超限 payload 必须转 artifact pointer，不是删字段。

## 3. STEP 的分派表

`next_action.kind` 决定这一步做什么。每种 kind 恰好一条合法路径：

| kind | 做什么 | 主 Agent 可见 |
|---|---|---|
| `ALIGN` | 派生 Frontier、问一个决策、生成对齐卡 | 用户回答 |
| `PLAN` | 规划**一个**短步，过 `gateStep()` | 门禁结论 |
| `DISPATCH` | `dispatchWorker()` 启动 clean worker | envelope ≤1 KiB |
| `REDUCE` | 等待中的 dispatch 结果收敛 | checkpoint |
| `ASK_USER` | 发出单决策 interruption | 用户回答 |
| `DERIVE_OUTCOME` | `deriveOutcome()` 推终态 | outcome 结构 |
| `SEAL` | 写 manifest + handoff，追加 `GOAL_TERMINATED` | 交接物 |

`DISPATCH` 的返回值形状是 `{envelope, audit}`：**`envelope` 可以进主 Agent，`audit.raw_artifact` 只是一个路径**。原文不是任何函数的返回值，这是结构性的，不靠自觉。

worker 的 `suggested_next_action` 只是建议。它不能直接改变 `next_action`——计划是提案，不是事实。

## 4. 每步之后的证明义务

第 5 步产出的 checkpoint 必须满足（否则是 reducer 错误，不是可容忍的偏差）：

```text
next_action 恰好一个                    I8
cursor 指向已验证的 event hash           I7
outcome 非 null 时 phase == TERMINAL     validatePhaseOutcome()
序列化 ≤2 KiB                           超限抛错，不静默截断语义字段
```

checkpoint 用临时文件 + fsync + atomic rename 写入（`writeFileAtomic()`）。**checkpoint 永远可从 journal 重建，因此它丢失不是数据丢失**——这是为什么第 4 步必须先于第 5 步。

## 5. 短步的粒度

一个短步 = **一次可独立验证的推进**。判据：

- 它产出的东西能被下一步机械检验；
- 它失败时不留下半改坏的世界状态；
- 它不需要"等后面几步做完才知道对不对"。

不满足第三条说明它不是一个短步，而是一个计划片段。拆开。

**默认串行。** 并行仅当依赖测试成立：若 A 的结果完全不同，B 的执行方式仍不改变。涉及外部副作用、相同目标集、同一 artifact 或顺序判据时禁止并行；收益不覆盖协调与 token 成本时退回串行（多 agent 的 token 消耗约为单次对话的 15 倍）。

## 6. 循环的退出

只有两种合法退出：

```text
SEAL 完成       → TERMINAL（outcome ∈ DONE/PARTIAL/BLOCKED/UNVERIFIABLE）
等待 principal  → NEEDS_INPUT（可恢复，不产生 GOAL_TERMINATED）
```

第三种情况——"做完了但没 seal"——不是退出，是任务悬空。`TERMINAL` 不可离开；新目标是新 task root，不复用上一个。

## 7. 反模式

| 写法 | 问题 |
|---|---|
| 先 reduce 再 append | checkpoint 领先于事实，恢复时会回退 |
| 一步里连做两个短步 | 中间态无事件，崩溃后无法定位 |
| 把 worker envelope 的 summary 当证据 | summary 是事实摘要，不是证据等级 |
| 跳过第 1 步"因为刚才刚读过" | 上一步的 append 已使它过期 |
| `JournalConflictError` 后改 seq 重写 | 覆盖另一写者的事实 |
| 计划完 20 步再逐个执行 | 长程规划可靠性 97.8% → 23.63% |
