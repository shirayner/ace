# BUDGETS 门禁审计

> 审计日期：2026-08-13
> 被审对象：`plugin/skills/auto-goal-v2/lib/budgets.mjs` 声明的全部常量
> 问题：每个常量是否有代码**真的以它做门禁**，还是只有「定义处 + 常量断言 + 文档」三处引用的空声明。

方法：对每个常量 Grep 全 skill 目录树，把引用分成三类——定义处、`tests/kernel-budgets.test.mjs` 的常量相等断言、文档正文——剩下的才算真实调用点。判定 `ENFORCED` 需要有一个执行期分支（`assertWithinBudget`、显式比较、schema 关键字）以该限制拒绝或投影超额输入。

## BUDGETS（13 项硬上限）

| 常量 | 门禁位置 | 状态 |
|---|---|---|
| `SKILL_MD` | `tests/kernel-cohesion.test.mjs` 末条（断言磁盘真实字节） | ENFORCED（测试期） |
| `CHECKPOINT` | `lib/journal.mjs:454` `assertWithinBudget`；`lib/reducer.mjs:316` 抛 `ReducerError` | ENFORCED |
| `WORKER_INPUT_ENVELOPE` | 无 | **DECLARED-ONLY** |
| `WORKER_LAUNCH_TOTAL` | `scripts/ingest-audit.mjs:46` `LAUNCH_BUDGET_BYTES`（重复字面量）→ `:53` `checkLaunchBudget()` | ENFORCED（常量未复用） |
| `WORKER_OUTPUT_ENVELOPE` | `scripts/ingest-audit.mjs:47` `ENVELOPE_BUDGET_BYTES`（重复字面量）→ `:77` `projectEnvelope()` | ENFORCED（常量未复用） |
| `JOURNAL_EVENT` | `lib/journal.mjs:324` `assertWithinBudget` | ENFORCED |
| `JOURNAL_SEGMENT` | `lib/journal.mjs:362` `shouldRollover()` | ENFORCED |
| `RECOVERY_TOTAL` | `lib/recovery.mjs:141` 读取限制 → `:206` 投影阶梯逐级比较 → `:210` 底线抛错 | ENFORCED（本轮新增） |
| `RECOVERY_EVENT_TAIL` | `lib/recovery.mjs:181` 决定是否走 reducer 压缩 | ENFORCED（本轮新增） |
| `ARTIFACT` | `lib/artifacts.mjs:70` 抛 `ARTIFACT_LIMIT_EXCEEDED` | ENFORCED |
| `GOAL_SUMMARY` | `lib/reducer.mjs:302` `truncateToBytes()` | ENFORCED |
| `WORKER_SUMMARY` | `schemas/worker-output.schema.json:19` `maxBytes: 400`（校验器 `lib/schema-validator.mjs:101` 支持）；`scripts/ingest-audit.mjs:80` 按 400 裁剪 | ENFORCED（常量未复用） |
| `ARTIFACT_MANIFEST` | `lib/artifacts.mjs:54` `assertWithinBudget` | ENFORCED |

## SOFT_LIMITS（3 项，advisory 不拒绝）

| 常量 | 引用位置 | 状态 |
|---|---|---|
| `JOURNAL_SEGMENT` | `lib/journal.mjs:367` `exceedsSegmentSoftLimit()` | ENFORCED（告警语义） |
| `ARTIFACT` | `lib/artifacts.mjs:92` `softLimitExceeded` 字段 | ENFORCED（告警语义） |
| `ARTIFACT_SLICE_TOTAL` | 无门禁；`tests/kernel-layer-consistency.test.mjs` 有绊线测试（切片导出一出现即失败） | **DECLARED-ONLY（已加绊线）** |

## COUNT_LIMITS（3 项）

| 常量 | 门禁位置 | 状态 |
|---|---|---|
| `JOURNAL_SEGMENT_EVENTS` | `lib/journal.mjs:362` `shouldRollover()` | ENFORCED |
| `WORKER_OUTPUT_CLAIMS` | `schemas/worker-output.schema.json:23` `maxItems: 3`；`scripts/ingest-audit.mjs:88` `slice(0, 3)` | ENFORCED（常量未复用） |
| `WORKER_OUTPUT_ARTIFACT_REFS` | `schemas/worker-output.schema.json:42` `maxItems: 4`；`scripts/ingest-audit.mjs:89` `slice(0, 4)` | ENFORCED（常量未复用） |

## DECLARED-ONLY 逐项说明

### 1. `BUDGETS.WORKER_INPUT_ENVELOPE`（2 KiB）—— 第三个空声明，已证实

这是被要求「假定还有第三个，去证实或证伪」的那一个，**证实**。

- 全仓引用只有三处：`lib/budgets.mjs:18` 定义、`tests/kernel-budgets.test.mjs:41` 常量相等断言、`:74` 一条把**手工构造的 2049 字节字符串**喂给通用 `assertWithinBudget()` 的用例。第三处证明的是 `assertWithinBudget` 会拒绝超长字符串，**不是**任何真实 worker input envelope 被这个预算检查过。
- 缺什么：`dispatchWorker()` 序列化 worker input envelope 之后、启动之前，没有对该 envelope 单独做 2 KiB 门禁。目前只有 16 KiB 的**总载荷**门禁（`checkLaunchBudget`）。设计 §12 把两者列为两条独立限制：一个 1.9 KiB 的 objective 配一个小 prompt 能通过 16 KiB 总门，却已经违反 2 KiB 的 envelope 门。
- 要覆盖需要：在 dispatch 路径上对 envelope 单独 `assertWithinBudget(..., BUDGETS.WORKER_INPUT_ENVELOPE, ...)`，返回 `DISPATCH_REJECTED`；测试断言一个 2049 字节的**真实 envelope**（而非裸字符串）被拒且未启动进程。
- 注意：该文件在 `scripts/`，本轮受文件范围约束未改。

### 2. `SOFT_LIMITS.ARTIFACT_SLICE_TOTAL`（12 KiB）

- 引用只有定义处 `lib/budgets.mjs:35` 和常量断言 `tests/kernel-budgets.test.mjs:52`。
- 语义缺口比缺门禁更根本：这条限制约束的是「一次交给主 Agent 的 artifact 切片总量」，而**切片读取功能本身尚不存在**——`lib/artifacts.mjs` 只有 manifest 注册与完整性校验，没有任何按范围读取 artifact 内容的函数。
- 要覆盖需要：先实现有界切片读取（这属于 §8.2 Proxy 投影的一部分），再以该软限制做告警。在切片功能存在之前，这个常量是为未来预留的声明，不是可修的门禁缺口。**承重性低于第 1 项。**
- **已加绊线（2026-08-13）**：`tests/kernel-layer-consistency.test.mjs` 断言 `lib/artifacts.mjs` 不导出任何名字含 `slice` 的函数。切片读取一落地该测试即红，迫使门禁与功能同批交付，而不是让这个常量在功能上线后继续当注释。变异验证：加一个 `readArtifactSlice` 导出 → 测试失败且 `exit code 1`。
  - 刻意**不**用 `node:test` 的 `{todo}` 标记：实测 `todo` 用例即使断言失败也不计入 `fail`、不影响退出码，等于造出一个不可能失败的绊线——正是本审计要消除的模式。用普通 `test()`，它今天通过是因为切片确实不存在。

## 两类需要注意但不算缺陷的模式

**重复字面量而非复用常量（已收口，2026-08-13）**：`WORKER_LAUNCH_TOTAL`、`WORKER_OUTPUT_ENVELOPE`、`WORKER_SUMMARY`、两个 `WORKER_OUTPUT_*` 计数限制都有真实门禁，但门禁读的是 `scripts/` 与 schema 里各自写死的数字（`16 * 1024`、`1024`、`400`、`3`、`4`），不是 `lib/budgets.mjs` 的常量。

实测确认了漂移在当时确实无人拦：把 `LAUNCH_BUDGET_BYTES` 改成 64 KiB、`ENVELOPE_BUDGET_BYTES` 改成 8 KiB、claim/ref 上限改成 30/40，**402 项测试全绿**；只有把 400 字节改宽会被一条既有的 UTF-8 用例顺带抓到。

已在 `tests/kernel-layer-consistency.test.mjs` 加 8 条断言收口，双向变异验证 16 次全部被捕获（`lib/` 侧改 8 次、`scripts/`+schema 侧改 8 次）。其中三条不是钉字面量而是**驱动真实行为**：启动门禁在预算处接受、超一字节拒绝；`projectEnvelope()` 的 summary 裁剪对 ASCII 输入精确等于 `WORKER_SUMMARY`（并断言未过度裁剪，防反方向漂移）；claim/ref 计数上限由实际投影结果得出。

**`SKILL_MD` 只能在测试期强制**：宿主直接读文件，运行时无拦截点，因此测试期断言磁盘字节是唯一可行的门禁形态——这是正确的做法，不是妥协。

## 附：I10 内聚扫描的覆盖面缺口（2026-08-13 新增，已修）

审计跨层常量时顺带查出的同类缺陷，且这次出在**承重不变量本身**。

`tests/kernel-cohesion.test.mjs` 的 `RUNTIME_DIRS` 写死为 `['lib', 'schemas']`。`protocols/runtime/` 实际另有 `tests/control-cohesion.test.mjs:56` 覆盖（该处已实测能抓 bare import），但 **`scripts/` 的 3 个模块两侧都没扫**。实测确认：

- 在 `scripts/ingest-audit.mjs` 加 `import chalk from 'chalk'`（可解析，因为仓库根装了 chalk）→ **402 项全绿**。
- 加一个能干净解析的逃逸 import（`../../../../src/core/constants.js` 取真实导出 `PLUGIN_NAME`）→ **402 项全绿**。
- 只有当逃逸 import 恰好解析失败时才会红——那是模块加载错误顺带报出来的，不是 I10 扫描抓到的。换成能解析的写法就静默通过。

`scripts/` 正是唯一 spawn 子进程、唯一写文件、唯一处理不可信 objective 文本的一层，它脱离内聚扫描意味着「Skill 可整目录复制」这个承重主张对最关键的一层从未被验证。

**修法**：`RUNTIME_DIRS` 白名单改为从磁盘遍历——除 `tests/` 外所有目录都是运行时代码。根因是「手工维护一份该检查什么的清单」本身就是无人校验的声明，会静默停止覆盖最后新增的那个目录（`lib/recovery.mjs` 漏出 A02 硬编码清单是同一根因的第二次发作）。另加一条防回缩测试：断言扫描实际触达的目录集恰好等于 `EXPECTED_RUNTIME_DIRS`，任一方向不符即失败。`no kernel module writes outside task root` 一并从只扫 `lib/` 扩到全运行时。

**变异验证 6 次全部被捕获**：`scripts/` 第三方 import、`scripts/` 逃逸 import、`scripts/` V1 路径字符串、`scripts/` 绝对路径写、把扫描重新缩回旧清单、新增一个未登记的运行时目录。


待 `scripts/` 释放后实施。此处写死规格，避免「等有空再说」变成第 N 个空声明。

**前提复核（2026-08-13 重测）**：`dispatchWorker()` 已被 pipeline-fix 重写并改为 import `lib/`，但 worker input envelope **在生产路径上仍不存在**——`dispatchWorker({ objective, ... })` 收的是裸字符串，直接 `child.stdin.write(objective)`。`schemas/worker-input.schema.json` 在 `lib/`、`scripts/`、`protocols/runtime/` 内**零生产引用**。所以这不只是"缺一个字节门禁"，而是**协议要求的输入对象从未被构造过**——与 B5「协议承诺的步骤无调用方」同类。

**反例（已实测）**：`systemPrompt` 300 B + `objective` 1900 B → 总载荷 2200 B，`checkLaunchBudget()` 返回 `ok: true`（16 KiB 总门轻松通过）；而该 objective 单独已 1900 B，且 schema 声明的 `objective.maxBytes` 是 400 B，超标 1500 B。总门通过 ≠ envelope 门通过，两者是设计 §12 的两条独立限制。

**规格**：

1. 在 dispatch 路径上构造符合 `worker-input.schema.json` 的 envelope 对象（`role`/`objective`/`scope`/`constraints`/`inputs`/`expected_output`/`write_root` 等必填字段），不再把裸字符串当输入。
2. 序列化后、spawn 前依次门禁：先 `assertSchema()`（`objective.maxBytes` 400 等形状约束），再 `assertWithinBudget(json, BUDGETS.WORKER_INPUT_ENVELOPE, 'WORKER_INPUT_ENVELOPE')`。两步都在 `checkLaunchBudget()` **之前**——envelope 门比总门更严，先拒更省。
3. 超限返回 `DISPATCH_REJECTED(input_envelope_over_budget)` 且 `launched: false`，不抛错（与既有 `checkLaunchBudget` 的返回式门禁保持一致，便于 caller 落 journal）。不变量 I11：`DISPATCH_REJECTED` 不得产生 `WORKER_DISPATCHED`。
4. 测试须断言的是**真实 envelope 对象**被拒，而非裸字符串——现有 `tests/kernel-budgets.test.mjs:74` 喂的是手工 2049 字节字符串，它证明的是 `assertWithinBudget` 能拒长串，不是任何 envelope 被这个预算检查过。至少三条：2049 字节真 envelope 被拒且进程未启动；恰好 2048 字节被接受；上述 1900 B objective 反例被拒（证明它不是靠 16 KiB 总门被兜住的）。
5. 变异验证：把预算改宽、把门禁调到 `checkLaunchBudget` 之后、把 `<=` 改成 `<`，三次都必须有测试失败。

