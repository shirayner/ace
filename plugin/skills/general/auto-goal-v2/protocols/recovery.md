# 恢复协议

> 加载时机：`RECOVERING`。
> 机械校验：`protocols/runtime/state-machine.mjs`（`RECOVERING→*` guards）；journal/checkpoint 读写归 `lib/`；恢复读取面的组装与预算门禁归 `lib/recovery.mjs`。

## 1. 不重放世界

journal 是**已发生事实的证据**，不是重建世界的脚本。Agent 的副作用几乎全是不可重放的外部效应（写文件、调 API、发消息），因此：

```text
恢复 = 读事实 + 跳过已完成 + 幂等续做
恢复 ≠ 重演副作用
```

这是刻意放弃完整 event sourcing 重放语义的结果。重放会误触发对第三方的重复通知——这个坑在 agent 场景里被放大而非缩小。

## 2. 恢复算法

```text
1. 定位 task root；验证路径和权限。
2. 读取 checkpoint（≤2 KiB），验证其 cursor/hash。
3. 若缺失或失配，由 sealed segments + active segment 运行 reducer 重建。
4. 验证 active artifact refs 的存在和 hash；缺失则标为证据失效。
5. 检查悬空 EFFECT_INTENDED；先观测世界，禁止盲重放。
6. 重新派生唯一 next_action。
7. 所需输入可由 principal 提供 → NEEDS_INPUT；计划必须改变 → BLOCKED。
8. 返回有界恢复 envelope，不把 journal 原文交给主 Agent。
```

第 5 步是唯一不可跳过的一步，见 §4。

## 3. 主 Agent 的读取预算

```text
正常恢复路径主 Agent 总摄入 ≤4 KiB
  checkpoint         ≤2 KiB
  cursor 后事件       正常 ≤2 KiB，硬上限 16 KiB
```

超过硬上限时，**先由 reducer 离线压缩投影**，主 Agent 不读事件正文。历史 segment 不删除（它们是审计事实），但不进入正常模型上下文。

这道预算由 `buildRecoveryEnvelope()` 单点强制：它是唯一组装恢复读取面的地方，因此 4 KiB 有一个执行期比较，而不是一条大家都要记住的规则。**超预算时降级并披露，不抛错**——journal 合法长大不是缺陷，抛错会让每次后续恢复都在同一份 journal 上再抛一次，把任务永久卡死。降级之所以不是静默撒谎，是因为 `complete`、`omitted_count`、`fidelity` 明确写出隐藏了多少。唯一的抛错是底线：连计数投影都放不进预算，说明 checkpoint 本身超标，那是缺陷而非 journal 状态。

不变量 I7：checkpoint.cursor 必须指向已验证的 event hash。cursor 失配即触发重建，不是「大概能用」。

## 4. 悬空副作用

崩溃后只见 `EFFECT_INTENDED` 而无 `EFFECT_OBSERVED`，说明动作可能已执行、可能未执行。**禁止直接重做**（不变量 I6）：

```text
1. 用 idempotency key 查询效应器的幂等结果
2. 或独立读回世界状态
3. 查到已生效 → 追加 EFFECT_OBSERVED，继续
4. 查到未生效 → 可以重做
5. 无法查询且动作非幂等 → NEEDS_INPUT 或 UNVERIFIABLE，不能猜测
```

第 5 种情况必须诚实上报。「大概没发过，重发一次」是把不确定性转成用户的损失。

## 5. Crash consistency 边界

| 崩溃点 | 恢复行为 |
|---|---|
| event 已追加、checkpoint 未更新 | 从 cursor 重放 reducer，next_action 唯一 |
| checkpoint 临时文件写一半 | 忽略临时文件，从 journal 重建 |
| segment 达上限未 seal | 由 reducer 生成 seal 后 rollover |
| 两个 writer 竞争同 seq | 只有一个成功，另一个重读 cursor |

checkpoint 更新用临时文件 + fsync + atomic rename。**checkpoint 永远可从 journal 重建**，因此它丢失不是数据丢失。

## 6. 恢复后的 phase

恢复到**最近合法非终态**，不是恢复到崩溃瞬间的 phase：

```text
RECOVERING → ALIGNING | PLANNING | EXECUTING | VERIFYING | NEEDS_INPUT
```

`RECOVERING→EXECUTING` 额外要求 `danglingEffectsResolved`——即 §4 已完成。这道 guard 存在的意义是：不允许「恢复后直接继续执行」跳过悬空副作用检查。

## 7. 证据失效

artifact 缺失或 hash 不匹配时，依赖它的判据**退回 `UNTESTED`**，不是保持 SATISFIED：

```text
evidence_refs 指向的 artifact 不存在 → 该判据证据失效
→ 判据状态回退，需重新验证
```

这防止「证据文件被清理但台账仍显示满足」。不变量 I5 要求 accepted claim 必须引用存在且 hash 匹配的 evidence。

## 8. 不做的事

- 不从模型叙述恢复状态（journal 是唯一事实源）；
- 不把 Frontier 从持久化数据里读出来（它从不持久化，不变量 I13）；
- 不因为 checkpoint 看起来合理就跳过 cursor 验证；
- 不在恢复期扩大范围（`scope_version` 变更需 decider 批准，与恢复无关）。
