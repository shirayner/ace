# 调度协议（契约层）

> 加载时机：`EXECUTING`。
> 本文件定义**契约**；`dispatch.mjs` / `proxy.mjs` 的实现归调度与代理模块。

## 1. clean-context 是正确性约束

worker 每次调用**无状态**：不继承主会话历史、不读整个 task 目录、不读其他 Skill 正文。

这不是优化。软性限长约束的是**生成端**，而污染主要来自**摄入端**（工具输出、文件内容、子任务中间产物）。prompt 里写「请简短」对已经进入上下文的内容毫无作用。

```text
运行环境若无法保证"无历史启动" → 该 worker backend 不合格
不得退化为普通 Agent 调用并声称隔离
```

不变量 X02：默认继承主会话的 backend 判定为不合格，拒绝调度。

## 2. 输入预算

| 对象 | 硬上限 | 超限行为 |
|---|---|---|
| input envelope JSON | 2 KiB | `DISPATCH_REJECTED(worker_input_over_budget)` |
| 总启动载荷（envelope + prompt + slices） | 16 KiB | 启动前拒绝，记录组成字节 |
| artifact slices 合计（默认） | 12 KiB | 同上 |

**在启动前拒绝**，不是启动后截断。超限时记录实际字节与各组成项，建议缩小 slice 或拆分任务。

envelope 是**真实构造的对象**，不是描述：`buildWorkerInput()` 按 `worker-input.schema.json` 组装，其规范化 JSON 即 worker stdin 的全部内容。启动前三道门按此序：

```text
总载荷 16 KiB  → DISPATCH_REJECTED(launch_payload_over_budget)  ← 最粗的门先报，信息最可行动
schema 校验    → DISPATCH_REJECTED(worker_input_schema_invalid)  ← 形状与逐字段字节上限（objective ≤400 B）
envelope 2 KiB → DISPATCH_REJECTED(worker_input_over_budget)     ← 度量**规范化后的真实字节**，非估算
```

单字段合法而组装后超 2 KiB 是 schema 抓不到的情形，故字节门是独立一步。`role` 与 `task_id` **required 且 nullable**：未声明必须写成显式 `null`（`null` role 的 claim 权限为空集），不得省略字段——省略会被读成"已授权"。

不变量 I11：`DISPATCH_REJECTED` 不得产生 `WORKER_DISPATCHED`。

## 3. 输出摄入前处理顺序

顺序不可交换：

```text
CAPTURE STREAM                ← 读到 stdio 关闭为止，不是读到子进程退出为止
  → RAW ARTIFACT WRITE        ← 无论成功失败都先落盘
  → HASH + MANIFEST
  → DEADLINE CHECK            ← 超时即拒，即使字节能解析
  → JSON PARSE / EXTRACT
  → SCHEMA VALIDATE           ← 形状
  → SEMANTIC VALIDATE         ← 意义
  → PATH + EVIDENCE VALIDATE
  → BYTE VALIDATE
  → NORMALIZE / TRUNCATE ENVELOPE
  → APPEND ACCEPTED OR REJECTED EVENT
  → RETURN ≤1 KiB TO MAIN MODEL
```

关键语义：

- 原始输出**先落盘再校验**，保留诊断证据；
- **采集以 `'close'` 为界，不以 `'exit'` 为界**。Node 的 `'exit'` 只表示子进程已终止，**不保证 stdio 管道已排空**；在 `'exit'` 处理器里同步快照缓冲区可能取到截断甚至为空的 stdout，随后被判 `cli_output_unparseable`——**随机拒绝一个本应成功的 worker**，且 raw artifact 的 sha256 会忠实地记录那份截断。后端把继承来的 stdout 交给辅助进程再自己退出（launcher/shim 形态，真实 Claude CLI 即如此分发）时，两个事件可确定性分离：实测 `'exit'` 见 0 字节、`'close'` 见全部 512 KiB；
- **kill 后的等待有上界**（`CLOSE_GRACE_MS`）。`kill` 只作用于被 spawn 的那个进程，继承了 stdout 的辅助进程会存活并继续持有管道，`'close'` 可能永不到来。因此每条 kill 路径（超时、采集上限）都自带上界：整体在 `timeoutMs + CLOSE_GRACE_MS` 内 settle。这段等待买的是**诊断**（在途字节仍进 raw artifact），不是结果；
- **超时是拒收，即使晚到的字节完整且能解析**。承接上一条：被 kill 的 worker 的输出仍可能在 kill 之后到达。若接受它，`timeoutMs` 就退化为建议值——worker 可以突破任意 deadline 仍被采信，而 audit 会出现 `timed_out: true` 与 SUCCEEDED envelope 并存的自相矛盾；
- schema 失败时**不得**让「看起来合理」的摘要进入主模型，只返回固定拒收码 + artifact pointer + 修复动作；
- 截断的是**规范化 envelope**；原文不靠字符串截断伪装成合法 JSON；
- schema 只保证形状不保证语义，因此 semantic validate 是独立一步，不可省。

## 4. worker 角色

一个 worker 只承担一种角色：

```text
DISCOVER | PLAN_STEP | ACT | VERIFY | SUMMARIZE
```

角色决定它能产生哪类 claim。semantic validator 检查「角色是否有权产生该 claim」——`DISCOVER` worker 不能宣布判据满足。

## 5. worker 不写控制面

不变量 I3：worker 不可写 journal / checkpoint / manifest index。

```text
worker 只能把产物写到 dispatcher 分配的 write_root
控制面事件只有 controller / proxy 单写者可追加
```

多个 worker 不共享可变内存。默认串行；并行仅当**依赖测试**成立：若 A 的结果完全不同，B 的执行方式仍不改变。涉及外部副作用、相同目标集、同一 artifact 或顺序判据时禁止并行。

并行收益估计不覆盖协调与 token 成本时退回串行——多 agent 系统的 token 消耗约为单次对话的 15 倍，不是免费的。

## 6. 拒收码

| code | 含义 | worker 是否启动 |
|---|---|---|
| `DISPATCH_REJECTED` | 输入预算/路径/schema 不合法 | 否 |
| `RESULT_REJECTED` | 输出 schema/语义不合法 | 是，原文已落盘 |
| `ARTIFACT_LIMIT_EXCEEDED` | artifact 被截断 | 是，不能充当完整性证据 |
| `STALE_SCOPE` | 结果基于旧 `scope_version` | 是，登记 artifact 但**不更新台账**（I12） |

**同一 dispatch 因相同原因连续拒绝两次后禁止自动重试**，转 `BLOCKED` 或请求方向决策。盲目重试掩盖问题。

## 7. 主 Agent 的返回契约

固定三段，`≤1 KiB`：

```text
status + bounded summary/error code + artifact pointer/next instruction
```

主 Agent **不可接收** `raw_output` artifact 内容（不变量 I4）。worker 的 `suggested_next_action` 只是建议，不能直接改变状态（计划是提案，不是事实）。
