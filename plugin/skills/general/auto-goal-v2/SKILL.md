---
name: auto-goal-v2
description: |
  证据驱动地推进任意领域的开放目标：对齐目标差量 → 规划可验证短步 → clean-context worker 执行 → 独立验证 → 确定性终态。

  适用：目标开放式、跨多步、需方案选择、需调研或学习；或用户描述期望结果而非具体代码变更。
  与 V1 并存，不迁移 V1 任务。

  DO NOT TRIGGER: 明确的单点代码变更（修 bug、加功能、重构 → 直接 Edit；写测试 → ut；审查 → code-review）；创建或优化 skill（→ skill-creator / skill-optimize）；单步可完成的操作（→ 直接执行）。
---
# auto-goal-v2 — 目标控制器

**做了某动作 ≠ 目标已达成。** 完成由判据台账推导，不由叙述宣布。

多数跨系统、主观或延迟目标的正确终态是 `PARTIAL` 或 `UNVERIFIABLE`。把 `DONE` 当默认目标的系统必然以假 DONE 收场。

---

## 硬门禁

<HARD-GATE>
G1 未对齐 goal/scope_version → 不执行
G2 criteria 未分类或 evidence contract 不完整 → 不执行
G3 副作用未过 capability/risk/approval guard → 不执行
G4 worker 必须经 dispatch/proxy → 不得直收长结果
G5 outcome 只能由 `lib/outcome.mjs` 的 `deriveOutcome()` 产生
</HARD-GATE>

`checkHardGates()` 机械检查 G1–G5。**未证明的前置条件计为未满足**——"心里对齐了" = 未对齐；"上个目标批准过" = 未批准。

**clean-context 是正确性约束，不是优化。** `resolveBackend()` 返回 null → `DISPATCH_REJECTED(no_clean_context_backend)`，硬阻塞；不得退化为普通 Agent 调用并声称隔离。软性限长约束**生成端**，污染来自**摄入端**，"请简短"对已进入上下文的内容无效。

---

## 主 Agent 的读取面

**可读**：`checkpoint.json` ≤2 KiB、单个 envelope ≤1 KiB、恢复期 cursor 后事件 ≤2 KiB。
**不可读**：worker 原文、完整日志、完整 diff、搜索全集、`raw_output`/`log`/`diff` 类 artifact（I4）。模块签名见 `protocols/runtime-contract.md`，**不得为核对签名而读实现**；同一文件一次运行只摄入一次。

主 Agent **不亲自验证**、**不直接写** journal/checkpoint/manifest、**不自行宣布 DONE**。验证由独立 verifier worker 读原文——主 Agent 一旦亲自读，保护上下文就已失败，且随后是在自己的叙述上做判断而非在证据上。

---

## 控制循环

每一短步固定六步，顺序不可交换：

```text
1. READ      读 checkpoint（缺失或 cursor 失配 → RECOVERING）
2. LOAD      按 phase 加载一份协议 + 命中的 method pack
3. STEP      执行一个可验证短步
4. APPEND    向 journal 追加已发生事实（控制面单写者）
5. REDUCE    reduceCheckpoint() 重新派生 checkpoint 与台账
6. NEXT      执行唯一 next_action
```

**只规划下一个短步**，不一次规划 20 步：长程规划可靠性从 97.8% 掉到 23.63%。

非终态 checkpoint 必须恰好有**一个** `next_action`（I8）。0 个或多个是 reducer 错误，不是灵活性——多个候选意味着方向决策未做，应先决策或发起中断。

每步的模块调用、合法事件与短步粒度：Read `control-loop.md`。

---

## 按 phase 条件加载

路径相对 `protocols/`，`templates/` 与 `methods/` 显式标注。

| phase | 加载 | 出口条件 |
|---|---|---|
| `NEW` | `control-loop.md` + `runtime-contract.md` | task root 与首事件已持久化 |
| `ALIGNING` | `alignment.md` + `methods/router.md` + 命中 pack | 对齐卡已确认；criteria 已分类 |
| `PLANNING` | `goal-model.md` + `risk-approval.md` | next step 唯一；Mandate 可达；guard 通过 |
| `EXECUTING` | `dispatch.md` | 产物存在且已登记 manifest |
| `VERIFYING` | `verification.md` | 台账更新完毕 |
| `NEEDS_INPUT` | `risk-approval.md` | 用户提供命名输入 |
| `RECOVERING` | `recovery.md` | checkpoint 已重建；悬空副作用已观测 |
| `TERMINAL` | `templates/handoff.md` | 交接物齐全 |

一次只加载当前 phase 所需的一份。**不全文加载后用 `[IF]` 跳过**——摄入即计费。

`phase` 与 `outcome` 是两个字段：`BLOCKED` 是 outcome 不是 phase；`NEEDS_INPUT` 是唯一合法重叠（可恢复 phase + 可上报 outcome），不产生 `GOAL_TERMINATED`。转换 guard 见 `state-machine.md`。

---

## 提问与批准

提问判据：`不确定性 × 猜错代价 > 提问成本` 且答案只在 principal 手中。可查事实派 `DISCOVER` worker 查，**不把用户当搜索引擎**。惊讶测试兜底。

每次中断只解决**一个**最上游承重决策。沉默、"继续"、"你决定"、带条件同意、执行者自行推断均**不算批准**。批准不跨目标、不跨实例、不跨 `scope_version` 传递。

---

## 副作用（细则见 `verification.md` §6、`recovery.md` §4）

```text
EFFECT_INTENDED（approval ref + 枚举目标集 + idempotency key）
  → 调用效应器 → 独立读回或查幂等结果 ← 这一步才产生 E2/E4
  → EFFECT_OBSERVED
```

外部请求返回 200 只是 E1，不能判 STATE 满足。崩溃后只见 intent：**先查询世界，禁止盲重放**（I6）；无法查询且动作非幂等 → `NEEDS_INPUT` 或 `UNVERIFIABLE`，不猜测。

等待用户输入前不得有在途不可回滚副作用；不回复时的默认动作必须是 `NO_ACTION` 或安全回滚。
---

## 终态

`DONE | PARTIAL | BLOCKED | UNVERIFIABLE` 可 seal；`NEEDS_INPUT` 是持久化中断态。不设 `FAILED`。

```text
可用的验证尚未运行        → UNTESTED（尽责失败，不能借此结束）
已取得最高可得证据仍不达标 → UNVERIFIABLE
```

**所有终态都必须有交接物，包括 `DONE`**（`validateHandoff()`，I15）。

Seal：写最终 manifest 与 handoff，journal 追加 `GOAL_TERMINATED`。

---

## 内聚约束

私有运行时依赖全部位于本目录树内（I10）。禁止引用 `shared/`、V1、其他 Skill 私有文件或外部 goal CLI。Node 标准库是平台依赖，不算私有文件依赖。
