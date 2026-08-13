# 验证协议

> 加载时机：`VERIFYING`。
> 机械校验：`protocols/runtime/evidence.mjs`、`criteria-gate.mjs`；终态推导见 `lib/`。

## 1. 独立 verifier

主 Agent **不亲自验证**。验证由独立 verifier worker 读取 artifact 原文，主 Agent 只收证据 envelope（≤1 KiB）。

理由：验证天然要读长内容（测试日志、diff、搜索全集）。主 Agent 一旦亲自读，「保护上下文」就已失败——而且它随后是在自己的叙述上做判断，不是在证据上。

| 角色 | 可读 | 不可读 |
|---|---|---|
| 主 Agent | checkpoint、证据 envelope | artifact 原文、完整日志、完整 diff |
| verifier worker | 显式声明的 artifact slice | 主会话历史、其他 task 目录 |

不变量 I4：主 Agent 不可接收 `raw_output` artifact 内容。

## 2. 证据契约

每条判据在规划期就确定 `required_rung`（`deriveRequiredRung()`）。验证只回答一个问题：**实际取得的证据是否达到该等级**。

```text
SATISFIED 要求：
  meetsRung(achieved_rung, required_rung)          # 不变量 I14
  且 evidence_refs 非空且 hash 匹配                 # 不变量 I5
  且 scope_version 未过期                          # 不变量 I12
  且（判定型判据）acceptor 不是 Agent                # 不变量 I9
```

### 常见上舍入错误

| 观察到的 | 只能记为 | 不能记为 | 为什么 |
|---|---|---|---|
| 外部 API 返回 200 | E1 | E2 | 请求成功不等于状态生效 |
| worker 报告「已完成」 | E0 | E1 | 模型断言什么都不能证明 |
| 写了文件 | E1 | E3 | 未对内容施加规则检验 |
| 读回了状态 | E2 | E3 | 未做机械判定 |
| 自造 rubric 打分 | E3（仅产物属性） | E4 | rubric 不能替代 acceptor |

**E1→E2 是最常被跳过的一级**。没有独立查询、回执或权威确认，不得上舍入。

## 3. 判定型判据

`JUDGMENT / KNOWLEDGE / EFFECT` 的判定权不在 Agent（`agentMayJudge() === false`）。

- acceptor 不可触达 → 终态 `UNVERIFIABLE`，**不是** DONE。
- Agent 不得自封 acceptor（`AGENT_CANNOT_ACCEPT`）。`acceptor_ref` 为 `agent`、`self`、`controller` 或 `worker:*` 均被拒绝。
- 策略上：**尽早交付小样**给 acceptor 取判定，别整篇做完再问（`judgment-sampling` pack）。

「写完了」不等于「写好了」；交付材料不等于用户学会了。

## 4. NEGATIVE 判据

原则不可证，只能有界检查。验证时必须落在声明的 `check_surface` 上，报告形式固定为：

```text
已在 <check_surface> 检查，未发现 <X>
```

不得输出「没有任何问题」「一切正常」。截断的 artifact 不能充当要求完整性的证据（`ARTIFACT_LIMIT_EXCEEDED` → 判据保持 `UNTESTED`）。

## 5. 尽责边界：UNTESTED vs UNVERIFIABLE

```text
可用的验证尚未运行            → UNTESTED（尽责失败，不能借此结束）
已取得最高可得证据仍不达标     → UNVERIFIABLE
```

`UNVERIFIABLE` **不是借口态**。声称不可验证之前必须证明已尝试最高可得等级（验收场景 O06）。

## 6. 外部副作用的验证

副作用不能靠重放 journal 恢复，也不能靠 intent 记录证明生效：

```text
1. 追加 EFFECT_INTENDED（含 approval ref、精确目标集、idempotency key）
2. 调用效应器
3. 独立读回或查询幂等结果          ← 这一步产生 E2/E4
4. 追加 EFFECT_OBSERVED
5. 崩溃恢复只见 intent：先查询世界，禁止直接重做（不变量 I6）
```

无法查询且动作非幂等 → `NEEDS_INPUT` 或 `UNVERIFIABLE`，不能猜测。

## 7. 终态推导

终态由 `lib/` 的纯函数从台账推导，**模型无权撰写**（不变量 I1）。仲裁序刻意偏向少报：

```text
1. constraint 违反或状态不自洽      → BLOCKED（先回滚）
2. principal 能给出钥匙            → NEEDS_INPUT（优先问，不是停）
3. 任一判据未达 required_rung       → UNVERIFIABLE（永不上舍入为 DONE）
4. 范围曾因任何原因收窄             → PARTIAL
5. 全票 + 有证据 + 未静默收窄       → DONE
```

`PARTIAL` 要求已交付部分是**自身可用的前缀**。中断处状态不自洽（半改坏）时正确终态是 `BLOCKED` + 先回滚，不是 `PARTIAL`。

所有终态都必须有 handoff（`validateHandoff()`，不变量 I15）——**永不空手而归**由此从口号变为字段约束。
