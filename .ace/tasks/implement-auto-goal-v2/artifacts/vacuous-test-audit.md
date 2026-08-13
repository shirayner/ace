# 空转测试审计：auto-goal-v2

**审计对象**：`plugin/skills/auto-goal-v2/tests/` 全部 20 个测试文件，407 个 `test()` 声明。
**审计日期**：2026-08-13
**审计者**：v2-review（只读；未修改 `lib/`、`tests/`、`protocols/`、`scripts/` 任何文件）

> **阅读前必看（2026-08-13 追加）**：本报告的 407 项基线**已作废**，且当前基线仍在变动（同日实测 444 → 449 → 452）。M22、M25 两项「存活」结论**已失效**（已被杀死）。其余存活项结论**悬置**。引用本报告任何变异结论前，先读末节「更正：基线作废与 M22/M25 的死亡确认」。


## 方法

判定不靠读测试名，靠两件事：

1. **读断言与被测代码**，确认断言真正抵达它声称在验的分支。
2. **变异验证**（决定性证据）。为避免与正在改 `lib/` 的子 Agent 冲突，全部变异在仓库外的隔离副本 `/tmp/agv2-mutate/` 上执行，**仓库内文件一字未改**。基线：`node --test tests/*.test.mjs` → 407 tests / 402 pass / 0 fail / 5 skipped（Node v24.13.0）。

共施加 43 项变异（编号 M1–M42，另有 M1b 单列），逐项记录「杀死 / 存活」。存活即证明该约束**没有任何测试保护**。

> 注：`node --test tests/`（目录形式）在 Node 24 上只发现 0 个用例并报 1 fail；必须用 `tests/*.test.mjs` 显式文件列表。这一点本身值得记入 CI 审计。

## 变异验证结果总览

| 结果 | 数量 | 含义 |
|---|---|---|
| **杀死**（≥1 测试失败） | 31 | 该约束有 SOUND 测试保护 |
| **存活**（407 全绿） | 12 | 该约束**无任何测试保护** |
| 合计 | 43 | 靶点不存在而重写后重试的 2 项已计入其最终结果 |

> 计数口径（此前本表曾写 30 / 9 / 2，与下方清单不符，已按清单校正）：分母是**去重后的变异编号**，M1b 因与 M1 靶点同函数但机制不同而单列。「杀死」= M1、M2、M3、M4、M7、M8、M10、M11、M13–M21、M23、M26、M27、M30–M38、M41、M42；「存活」= 下表 12 行。两项曾报 `PATCH-TARGET-MISSING` 的变异（靶点文本与我假设不符）经按真实源码重写后已跑出结论，不再单列为「不适用」。

### 存活变异清单（最重要的产出之一）

| # | 变异内容 | 存活证据 | 后果 |
|---|---|---|---|
| M1b | `assessSatisfaction()` 开头插入 `if (artifactIndex.size === 0) return { satisfiable: true, reasons: [] }` | 407 pass / 0 fail | **零证据的判据直接判为满足** → 假 DONE |
| M5 | `writeCheckpoint()` 的 2 KiB 门禁改为 `if (false)` | 407 pass | CHECKPOINT 预算在唯一持久化入口无保护 |
| M6 | `reduceCheckpoint()` 的 2 KiB 门禁改为 `if (false)` | 407 pass | 同上，reducer 侧亦无保护 |
| M9 | `allSatisfied` 去掉 `assessment.satisfiable` 合取，只信 `entry.state === 'SATISFIED'` | 407 pass | 「不信 state 标签」这条核心防线的**该行**无测试 |
| M12 | 删除 `if (!terminal && !nextAction) throw` （I8 缺 next_action 守卫） | 407 pass | I8 的「至少一个」方向无保护 |
| M22 | `ENVELOPE_BUDGET_BYTES` 1024 → 102400 | 407 pass | 1 KiB envelope 预算无门禁 |
| M24 | `dispatchWorker` 中删除 `assertIsolatedArgs(args)` 调用 | 407 pass（重复 3 次确认） | **spawn 前的隔离 argv 断言可被摘除而无人发现** |
| M25 | `LAUNCH_BUDGET_BYTES` 16 KiB → 1600 KiB | 407 pass | 16 KiB 启动预算无门禁 |
| M28 | 删除 `if (actualBytes > BUDGETS.ARTIFACT)` （8 MiB 硬限） | 407 pass | ARTIFACT 预算无门禁 |
| M29 | 删除 `isSafeRelativePath` 的盘符行 `/^[A-Za-z]:/` | 407 pass | `C:relative/x`、`C:` 类相对盘符路径不再被拒 |
| M39 | `resolveBackend` 的 shim 分支 `continue` → 返回 `.cmd` 作为 backend | 407 pass | **不可 spawn 的 shim 会被当作可用 backend 返回** |
| M40 | `spawn(..., { shell: false })` → `shell: true` | 407 pass | 不可信 objective 文本经 shell 执行，无测试阻止 |

（M1b 与 M9 分属 `assessSatisfaction` 与 `deriveOutcome`，机制不同：M1b 是**可达**的假 DONE 直通路，见下方 VACUOUS-SHORTCIRCUIT 表首两行；M9 是**当前不可达**的冗余防线，见 VACUOUS-FIXTURE 表末行。）

---

## 逐测试判定表

只列出**非 SOUND** 的条目，以及少数需要说明的 SOUND 边界条目。未列出的测试均为 SOUND（变异其被测分支即失败）。

### VACUOUS-SHORTCIRCUIT

| 测试文件 | 测试名 | 变异 / 理由 | 声称保护的不变量 |
|---|---|---|---|
| `kernel-ledger.test.mjs` | `evidence that is missing from the index is not satisfiable` | `assessSatisfaction` 第 200 行有 `if (artifactIndex.size === 0) break;`。**本测试及全部同族测试都只传非空 `artifactIndex`**（`makeArtifactIndex([{artifact_id:'a-fixture01'}])`），因此从不走该早退。变异 M1b：在函数开头插入 `if (artifactIndex.size === 0) return {satisfiable:true, reasons:[]}` → 407 全绿。即：**"零 artifact 时一切判据都满足" 这条假 DONE 直通路，整套测试看不见**。 | I5（证据必须存在） |
| `outcome-derivation.test.mjs` | `a criterion whose evidence vanished cannot reach DONE (I5)` | 同上。`doneInput()` 恒定注入非空 `artifactIndex`。变异 M1b 存活。这就是审查报告 B3 的测试侧根因。 | I5 |
| `kernel-semantics.test.mjs` | `an artifact reference that is not registered is rejected (C06)` | 被测代码 `validateEventSemantics` 第 186 行 `if (knownArtifactIds.size > 0 && ...)`。本测试**手工传入** `knownArtifactIds: new Set(['a-real0001'])` 才使检查生效。**生产写入路径 `appendEvent()` 从不传 `semanticContext`**（全仓 grep：`semanticContext` 除 journal.mjs 自身外零调用方），故实际 `knownArtifactIds.size === 0`，检查永远短路。已实测：向真实 journal 追加 `artifact_refs: ['a-NEVERREG']` **被接受并落盘**。测试验的是一个生产中永不启用的分支。 | C06（artifact 引用可解析） |
| `kernel-semantics.test.mjs` | `a causation id that names no known event is rejected` | 同一机制：`knownEventIds.size > 0` 短路，生产路径不传。 | causation_resolves |
| `kernel-semantics.test.mjs` | `only SCOPE_CHANGED may advance scope_version (I2)` / `SCOPE_CHANGED must increment by one and name its approver` | 三项 scope 检查全部包在 `if (currentScopeVersion !== undefined)` 内。测试用 `eventContext` 显式给 `currentScopeVersion: 1`；生产 `appendEvent()` 不给。已实测：向真实 journal 追加 `scope_version: 7` 的 `STEP_PLANNED`（无 SCOPE_CHANGED）**被接受并落盘**。I2 在写入路径未被强制。 | I2（scope 单调且需批准） |
| `kernel-semantics.test.mjs` | `a claim citing an unregistered artifact is rejected (C06)` | `validateWorkerOutput` 第 416/437 行同为 `artifactIndex.size > 0` 短路。测试手工提供非空索引。此外 `validateWorkerOutput` 在生产端**无任何调用方**（审查报告 B5），故这一层整体未接线。 | C06 |
| `backend-isolation.test.mjs` | `resolver honours ACE_CLAUDE_BIN and ignores an unusable shim` | 测试把 `ACE_CLAUDE_BIN` 指向**不存在**的 `definitely-missing-claude.cmd`，于是 `isFile()` 在 shim 分支之前就 `continue`，**shim 逻辑从未执行**。已实测：造一个真实存在、无原生兄弟的 `claude.cmd`，基线返回 `null`（正确），而变异 M39（把 `continue` 改成返回该 shim）**407 全绿**——测试名声称的「忽略不可用 shim」实际无保护。 | X02 / 后端必须为原生二进制 |
| `kernel-artifacts.test.mjs` | `the soft limit is reported without rejecting` | 只覆盖软阈值分支；8 MiB 硬限分支（`verifyManifest` 第 70 行）无任何测试。变异 M28 删除硬限判断 → 全绿。 | ARTIFACT 硬预算 |

### VACUOUS-FIXTURE

| 测试文件 | 测试名 | 变异 / 理由 | 声称保护的不变量 |
|---|---|---|---|
| `journal-append.test.mjs` | `a checkpoint is written atomically and read back` | 断言 `written.bytes < BUDGETS.CHECKPOINT`。该 fixture 是一个极小的 checkpoint（数百字节），断言恒成立。变异 M5（禁用 `writeCheckpoint` 的 2 KiB 门禁）→ 全绿。 | C01 / CHECKPOINT 预算 |
| `journal-append.test.mjs` | `the widest schema-legal checkpoint stays under the 2 KiB limit (C01)` | 这条本身是 SOUND 的**属性**断言（且价值高），但它顺带证明了一件事：实测最宽合法 checkpoint = **1590 字节，余量 458 字节**，因此 `writeCheckpoint`/`reduceCheckpoint` 的字节门禁**在任何 schema 合法文档下都不可达**。文件自己的注释把它称为 "backstop … exercised directly in kernel-budgets.test.mjs"，但那里测的是 `assertWithinBudget` 这个通用函数，不是这两个调用点。故 M5/M6 双双存活。 | C01 |
| `kernel-reducer.test.mjs` | `every reduced checkpoint stays within 2 KiB (C01)` | 同上：`driveToSatisfied` 产出的 checkpoint 远小于 2 KiB，断言恒真。变异 M6 → 全绿。 | C01 |
| `kernel-reducer.test.mjs` | `every non-terminal checkpoint names exactly one next action (I8)` | 只断言 `next_action` 存在且 `kind` 是字符串——即只验「≤1 且非空」中的非空侧，且四个 stage 的 fixture 都必然落在 `deriveNextAction` 的某个 `return` 上。变异 M12（删除 `!terminal && !nextAction` 的抛错）→ 全绿。实测 `deriveNextAction` 对畸形非终态（`activeStep.status = 'weird_status'`）仍返回兜底 `PLAN`，故该守卫**当前不可达**，但它是防未来新增 phase 的护栏，现在无人看守。 | I8 |
| `outcome-derivation.test.mjs` | `a criterion marked SATISFIED on inadequate evidence cannot reach DONE` | 测试是真实的，但它**杀不掉** `allSatisfied` 那一行的 `assessment.satisfiable` 合取（变异 M9 全绿）。实测原因：所有「标签 SATISFIED 但证据不足」的输入都在更早的 `stillTestable` / `unreachable` 分支就返回了 PARTIAL/UNVERIFIABLE，从不抵达 `allSatisfied`。即该合取是**当前不可达的冗余防线**，测试保护的是前面的分支而非它。这不是缺陷，但报告为「该行无测试」以免日后重构时被误删。 | 假 DONE 防线 |

### NO-NEGATIVE

| 测试文件 | 测试名 | 变异 / 理由 | 声称保护的不变量 |
|---|---|---|---|
| `backend-isolation.test.mjs` | `argv carries every isolation flag...` + `X02: argv that would inherit the caller session is rejected` | 两者都只测 `assertIsolatedArgs()` **这个函数**，没有任何测试证明它**在 spawn 前被调用**。变异 M24（从 `dispatchWorker` 里删掉 `assertIsolatedArgs(args)` 调用）→ 407 全绿（重复 3 次确认；首轮一次偶发的 stub 失败经复跑证实为 flake，不是真杀）。G4/X02 的「经代理」保证在集成点无保护。 | G4 / X02 |
| `backend-isolation.test.mjs` | `C03: launch payload over 16 KiB is rejected before any spawn` | 有负例（超预算被拒）且 M21（绕过 `if (!gate.ok)`）确实被杀——这部分 SOUND。但**预算常量本身**无门禁：M25 把 `LAUNCH_BUDGET_BYTES` 提高 100 倍 → 全绿。测试用 `LAUNCH_BUDGET_BYTES` 自身构造输入，因此随常量一起漂移。 | C03 / WORKER_LAUNCH_TOTAL |
| `backend-isolation.test.mjs` | `C04: an oversized worker result still yields a <=1 KiB parseable envelope` | 同族自指问题：断言 `bytes <= ENVELOPE_BUDGET_BYTES`，而 `ENVELOPE_BUDGET_BYTES` 就是被测常量。M22 提高 100 倍 → 全绿。 | WORKER_OUTPUT_ENVELOPE |
| `kernel-artifacts.test.mjs` | 全部 `isSafeRelativePath` 用例 | 负例集含 `'C:/windows'`、`'c:\\windows'`，但这两个已被更早的 `path.win32.isAbsolute` / 反斜杠检查拦住。**只有盘符行能拦住的输入**（`'C:relative/x'`、`'C:'`）不在任何用例中。M29 删除盘符行 → 全绿。 | C07 |
| `dispatch-worker` 相关全部 | （无对应测试） | 没有任何测试断言 `spawn` 的 `shell` 选项。M40 `shell:false → shell:true` → 全绿。不可信 objective 经 shell 的风险无回归。 | 注入安全 |
| `journal-append.test.mjs` | `a partial trailing line is dropped and reported (J01)` + `a corrupt complete line is an explicit error` | 有 happy 与 negative 两侧，但**缺第三种也是真实崩溃形态**：残留行不再是末行（后续 append 与之熔接）。这正是审查报告 B1，`blocker-repro-specs.md` 给了规格。现有两测试合起来恰好绕过它。 | J01 / 恢复保证 |

### TAUTOLOGY

| 测试文件 | 测试名 | 变异 / 理由 | 声称保护的不变量 |
|---|---|---|---|
| `kernel-budgets.test.mjs` | `budget constants match the design table` | 逐条断言 `BUDGETS.X === <字面量>`。这**不是**空转——它是常量漂移的哨兵，M27（改 `RECOVERY_TOTAL`）确实被它杀死。但它保护的是「常量值不变」，**不是**「常量被用作门禁」。13 个 BUDGETS 常量里有 6 个（`WORKER_INPUT_ENVELOPE`、`WORKER_SUMMARY`、`WORKER_OUTPUT_CLAIMS`、`WORKER_OUTPUT_ARTIFACT_REFS`、`SOFT_LIMITS.ARTIFACT_SLICE_TOTAL`、`SKILL_MD`）在 `lib/`+`protocols/`+`scripts/` 中**零引用**（grep 已验），其存在感全部来自这一条断言。这就是本次任务反复撞上的「已声明无门禁」缺陷类的测试侧成因。 | §12 预算表 |
| `kernel-budgets.test.mjs` | `assertWithinBudget accepts a payload exactly at the limit` / `soft limits report without rejecting` | 断言的是通用工具函数在边界的行为，正确且必要，但与任何**调用点**无关。全部 budget 相关的空转都源于此：工具被充分测试，调用点未被测试。 | — |
| `kernel-identity.test.mjs` | `newId collisions are not expected across many draws` | 断言 2000 次抽样无碰撞。8 位 base36 空间下这近乎恒真，无法区分「良好的随机源」与「计数器」。属弱断言而非严格恒真，列此备考。 | §9.3 |
| `stub-backend-rejection.test.mjs` | `the stub backend is usable and does not shadow a real one` | 在 `skipReason` 存在时执行 `assert.ok(true, skipReason)` —— 恒真占位。这是诚实的 skip 语义（本机有 gcc 16.1.0，实际未 skip），但该行本身不验证任何东西。 | — |

### SOUND（抽样列出被变异确认的高价值项）

| 测试文件 | 测试名 | 杀死它的变异 |
|---|---|---|
| `kernel-semantics.test.mjs` | `a worker may not author a control plane event (I3)` | M2 |
| `kernel-ledger.test.mjs` | `E1 is not satisfiable for an E2 requirement (E01, I14)` | M16（连带杀 5 项） |
| `kernel-ledger.test.mjs` | `truncated evidence cannot prove a criterion` | M15 |
| `kernel-ledger.test.mjs` | `evidence recorded under a superseded scope does not move the ledger (C08, I12)` | M17 |
| `kernel-ledger.test.mjs` | `JUDGMENT without an external acceptor is not satisfiable (E04, I9)` | M20（连带 4 项） |
| `kernel-ledger.test.mjs` | `NEGATIVE without a bounded check surface is not satisfiable (E05)` | M19 |
| `kernel-ledger.test.mjs` | `no evidence at all is not satisfiable` | M41 |
| `outcome-derivation.test.mjs` | `an unapproved scope version cannot reach DONE (I2)` | M10 |
| `outcome-derivation.test.mjs` | `a non-empty residual caps the outcome at PARTIAL (O03)` / `a narrowed scope caps... (O02)` | M13 |
| `outcome-derivation.test.mjs` | `missingTerminalFields catches an outcome lacking its mandatory content` | M34 |
| `kernel-reducer.test.mjs` | `a sealed status the ledger does not support is a reducer failure (I1)` | M11 |
| `kernel-reducer.test.mjs` | `a dangling effect intent must be observed before anything else (I6, E03)` | M31 |
| `journal-append.test.mjs` | `an event over 4 KiB is refused` | M7 |
| `journal-append.test.mjs` | `verifyCursor accepts a real cursor and rejects a forged one (I7)` | M32 |
| `kernel-reducer.test.mjs` | `an over-long goal summary is trimmed on a character boundary` | M8 |
| `kernel-canonical.test.mjs` | `canonical form sorts object keys recursively` 等 | M42 |
| `kernel-semantics.test.mjs` | `raw worker output is not main-agent ingestible (I4)` | M33 |
| `routing-frontier.test.mjs` | `Frontier keys must never appear in persisted state (I13, U04)` | M35 |
| `control-protocol.test.mjs` | `all five hard gates are evaluated and any failure blocks` | M36 |
| `backend-isolation.test.mjs` | `missing backend produces DISPATCH_REJECTED and never launches` | M23 |
| `backend-isolation.test.mjs` | `C02/C03: over-budget dispatch does not launch` | M21 |
| `stub-backend-rejection.test.mjs` | C05 全 6 例 | M18、M37 |
| `kernel-layer-consistency.test.mjs` | `both layers recognize the same criterion states` 等 | M30 |
| `kernel-schemas.test.mjs` | `JSON schema enums stay in sync with lib/vocabulary.mjs` | M30 |
| `kernel-budgets.test.mjs` | `budget constants match the design table` | M27 |
| `backend-isolation.test.mjs` | `cleanEnv strips parent session identity` | M38 |
| `ingest-audit` summary clamp | `summary clamping keeps 400 bytes...` | M26 |

`stub-backend-rejection.test.mjs` 值得单独表扬：它自带一条 **control 用例**（`C05 control: a well-formed stub reply IS accepted`），显式声明「没有这条，下面每条断言对一个无条件拒绝的 dispatcher 也会通过」。这是全套测试里唯一主动防范空转的设计，应作为其余文件的样板。

---

## 承重不变量的验证真空

判定标准：该不变量在**生产调用路径上**是否存在至少一个变异会杀死的测试。工具函数被测但调用点未被测，计入真空。

### 完全真空（无任何 SOUND 测试）

| 不变量 | 真空内容 | 证据 |
|---|---|---|
| **I8**（非终态恰好一个 next_action） | 「至少一个」方向的守卫可整段删除而全绿；「至多一个」方向从未被测（`deriveNextAction` 是顺序 return，结构上只能返回一个，但无测试断言该性质） | M12 存活 |
| **G4**（worker 必须经 dispatch/proxy，不得直收长结果） | `assertIsolatedArgs` 在 spawn 前的调用可删除而全绿；`HARD_GATES` 的 G4 只是把 `ctx.workerViaProxy` 布尔值转发，没有任何测试把它接到真实 dispatch 上 | M24 存活（3 次） |
| **C01 的调用点**（CHECKPOINT ≤2 KiB） | 两个调用点的门禁均可禁用而全绿；实测最宽合法文档 1590 B，门禁不可达 | M5、M6 存活 |
| **WORKER_LAUNCH_TOTAL（16 KiB）** | 常量可提高 100 倍而全绿（测试用常量自身构造输入） | M25 存活 |
| **WORKER_OUTPUT_ENVELOPE（1 KiB）** | 同上 | M22 存活 |
| **ARTIFACT（8 MiB）** | 硬限判断可删除而全绿 | M28 存活 |

### 部分真空（工具层 SOUND，集成层无保护）

| 不变量 | SOUND 的部分 | 真空的部分 |
|---|---|---|
| **I2**（scope_version 仅经批准的 SCOPE_CHANGED 递进） | `validateEventSemantics` 与 `deriveOutcome` 两处逻辑均 SOUND（M4、M10 被杀） | **写入路径未强制**：`appendEvent` 不传 `currentScopeVersion`，实测 `scope_version: 7` 的普通事件被接受落盘 |
| **I5**（SATISFIED 必须有存在的证据） | 「无引用」「引用未注册（索引非空时）」「已截断」三条 SOUND（M41/M1/M15 被杀） | **索引为空时整段跳过**，M1b 存活；这是审查 B3 |
| **C06**（artifact 引用必须可解析） | 三处逻辑 SOUND（M3、M14、`verifyManifest` 从磁盘重算摘要 SOUND） | 两处调用被 `size > 0` 短路且生产不传上下文；`validateWorkerOutput` 生产无调用方 |
| **C07**（路径收敛） | `..`、反斜杠、绝对路径、符号链接逃逸均 SOUND | 相对盘符形式（`C:relative/x`、`C:`）无用例，M29 存活 |
| **I1**（outcome 仅由 reducer 派生） | reducer 的 seal 分歧守卫 SOUND（M11 被杀） | `writeCheckpoint` 可直接落盘手写 TERMINAL/DONE（审查 B2）；无测试覆盖 |
| **X02**（worker 无法继承调用方会话） | `cleanEnv` 剥离清单 SOUND（M38 被杀）；`assertIsolatedArgs` 函数本身 SOUND | 该断言**是否被调用**无保护（M24）；不可用 shim 是否被拒无保护（M39） |

### 已被 SOUND 测试覆盖的不变量

I3、I4、I6、I7、I9、I10、I11、I12、I13、I14、I15，以及 G1、G2、G3、G5（作为 `HARD_GATES` 数据表的完整性，M36 被杀）。

### 汇总

- **I1–I15 中存在验证真空**：I1（部分）、I2（部分）、I5（部分）、I8（完全）。
- **G1–G5 中存在验证真空**：G4（完全——就集成点而言）。
- **§12 预算表 13 项中，6 项零生产引用**：`SKILL_MD`（仅 `kernel-cohesion.test.mjs` 的门禁在量它，属正确做法）、`WORKER_INPUT_ENVELOPE`、`WORKER_SUMMARY`、`WORKER_OUTPUT_CLAIMS`、`WORKER_OUTPUT_ARTIFACT_REFS`、`SOFT_LIMITS.ARTIFACT_SLICE_TOTAL`。另有 3 项虽被引用但门禁不可达或可任意放大（`CHECKPOINT`、`WORKER_LAUNCH_TOTAL`、`WORKER_OUTPUT_ENVELOPE`）。

## 缺陷类的机制归纳

十二项存活变异不是十二个独立疏漏，收敛为三种机制：

1. **可选上下文默认为"不检查"**（`size === 0` / `!== undefined` 短路）。测试手工提供上下文使检查生效，生产不提供使其静默关闭。检查越写得"防御性"，越容易变成空转。修法：让上下文成为必填参数，缺失即抛错；或由 `appendEvent` 自己从 journal 派生 `knownArtifactIds` / `currentScopeVersion`。
2. **常量自指断言**。测试用被测常量构造输入（`'x'.repeat(BUDGETS.Y + 1)`），断言随常量一起漂移。修法：断言里写死设计值（`16384`），或至少加一条把常量本身钉在设计表上的测试——`kernel-budgets.test.mjs` 已经这么做了，但它只覆盖 `BUDGETS`/`SOFT_LIMITS`/`COUNT_LIMITS`，`scripts/ingest-audit.mjs` 里那两个字面量副本（`16 * 1024`、`1024`、`400`、`3`、`4`）不在其射程内。
3. **测函数不测调用点**。`assertIsolatedArgs`、`assertWithinBudget`、`validateWorkerOutput` 都有优质单测，但没有测试断言它们在正确时机被调用。这与审查报告 B5（协议步骤无生产调用方）是同一件事的两个侧面：一侧是代码没接线，一侧是测试没验接线。修法：对每个门禁增加一条"集成点"测试，直接驱动 `dispatchWorker`/`appendEvent` 并断言拒绝行为，而非断言 helper 的返回值。

## 建议的最小补测集（按性价比排序）

1. `assessSatisfaction` 传空 `artifactIndex` 且判据引用了 artifact → 必须不满足。（一行 fixture 改动即杀 M1b；同时是 B3 的回归）
2. `appendEvent` 集成测试：`scope_version` 漂移、未注册 `artifact_refs` → 必须被拒。（杀 I2/C06 的写入路径真空）
3. `dispatchWorker` 集成测试：篡改 `buildArgs` 结果注入 `--resume` → 必须在 spawn 前拒绝。（杀 M24）
4. 预算断言改为写死设计字节数，并把 `scripts/ingest-audit.mjs` 的字面量副本纳入 `kernel-budgets.test.mjs` 的漂移哨兵。（杀 M22/M25/M26 一族）
5. `isSafeRelativePath('C:relative/x')` 与 `('C:')` → false。（杀 M29）
6. 存在但无原生兄弟的 `claude.cmd` → `resolveBackend` 必须返回 null。（杀 M39；已有实测脚本可直接改写为测试）
7. 断言 `spawn` 以 `shell: false` 调用。（杀 M40）
8. 8 MiB 硬限的负例。（杀 M28）
9. 按 `stub-backend-rejection.test.mjs` 的样板，为每组"拒绝类"测试补一条 control 正例，防止无条件拒绝的实现骗过整组断言。

## 审计边界

- 未执行 live 测试（`capability-live.test.mjs` 的 5 项），遵守不花真钱约束。其门禁 `skip: live ? false : '...'` 是诚实的，但也意味着 X02–X05 的真实行为不在离线回归内。
- 全部变异在 `/tmp/agv2-mutate/` 的副本上执行，**仓库内 `lib/`、`tests/`、`protocols/`、`scripts/` 未被修改**。
- **主 Agent 独立复验（2026-08-13，事后追加）**：I2 与 C06 写入路径真空两条实测断言已由主 Agent 用独立探针复现成立——控制组 `STEP_PLANNED` 先 ACCEPTED，随后 `scope_version: 7` 与 `artifact_refs: ['a-NEVERREG']` 均 ACCEPTED 并落盘（`scope=7` 可见于磁盘）。首轮复验曾误报「两者被 `SEMANTIC_INVALID` 拒绝」，原因是探针的 `STEP_PLANNED` 缺 `payload.kind`，连控制组一起被同一条 `payload_complete` 拒绝。**教训：验证「不变量已生效」必须控制组先行**，否则拒绝理由可能与被验约束无关。
- 变异存活的判定基于 `node --test tests/*.test.mjs` 的离线用例集（本轮 control 实测值见下方复验节；**该数字只对当时那一快照有效，不得作为基线引用**——理由见 `mutation-methodology.md` §1）。若 CI 使用其他入口（如 `node scripts/run-tests.mjs`），结论仍成立但覆盖集合需另行核对。M24 的首轮"杀死"经 3 次复跑证实为 flake，其余存活项均为单轮稳定全绿。
- **本文全部变异结论的可归因性判据已抽成 `artifacts/mutation-methodology.md`**（同快照配对、D1–D6 探测器、needle 自检）。后续任何 Agent 在并发编辑期复验本文结论前应先读该文；尤其：本文中任何「存活」结论都绑定其快照时刻，且需另外排除「变异未落地」与「分支不可达」两项竞争解释才成立。

---

## 复验：12 项存活变异 vs 修复后代码（2026-08-13 02:5x，v2-review 追加）

审计结论绑定被测代码版本。修复者在本审计交付后落地了 B1/B2/B3、跨层常量哨兵与多条补测，故对全部 12 项存活变异逐项重跑。基线由 402 项涨到 **444 项（439 pass / 0 fail / 5 skipped）**。

### 方法修正（重要，且是本任务同一缺陷类在我自己工具上的第二次发作）

首轮重跑用「`fail > 0` 即杀死」判定，得出 M22/M25/M28/M29/M39 全部被杀。**该结论是错的**：仓库正被其他子 Agent 并发编辑，我的快照多次落在半写状态（先后测得 428/439/443/444/448 项，一次撞上 `kernel-recovery.test.mjs` 的真实红灯——B2 门禁 02:44 落地、该测试 02:46 才跟上，两分钟窗口），那些失败与我的变异无关。

改为**配对判定**：同一快照复制两份，一份变异一份不变异，杀死只按**失败测试名的集合差**归因。并对该工具自证双向——已知 SOUND 靶点（重命名 `canonicalize`）必须报 KILLED，纯注释改动必须报 SURVIVED，两者都通过。变异器另加「文件真的变了」自检（`VOID-MUTATION` 出口），此前的 `patch.mjs` 只校验 needle 存在。

这正是任务已记录的两条方法论（控制组先行、变异脚本须自检）在验证工具层的再次应验：**我用来审计空转测试的工具，自己空转过一轮。**

### 逐项复验结果（全部配对判定，control 均 0 pre-existing fail）

| 变异 | 原判 | 复验 | 杀死它的测试 |
|---|---|---|---|
| M1b | 存活 | **KILLED** | `a journal with no ARTIFACT_REGISTERED cannot seal DONE (I5, I1)`、`an empty artifact index cannot reach DONE either (I5)`、`an empty artifact index does not make ghost evidence satisfiable (I5)` |
| M22 | 存活 | **KILLED** | `the dispatch layer gates on the same output envelope budget the kernel declares` |
| M25 | 存活 | **KILLED** | `the dispatch layer gates on the same launch budget the kernel declares`、`the launch gate rejects at the kernel budget, one byte over and not before` |
| M5 | 存活 | 仍存活 | — （3 次复跑；首轮一次 `fail 1` 经查为半写快照，非真杀） |
| M6 | 存活 | 仍存活 | — |
| M9 | 存活 | 仍存活 | —（当前不可达的冗余防线，非缺陷） |
| M12 | 存活 | 仍存活 | — |
| M24 | 存活 | 仍存活 | —（配对判定；首轮非配对曾误报 KILLED） |
| M28 | 存活 | 仍存活 | —（首轮非配对误报 KILLED） |
| M29 | 存活 | 仍存活 | —（首轮非配对误报 KILLED） |
| M39 | 存活 | 仍存活 | —（首轮非配对误报 KILLED） |
| M40 | 存活 | 仍存活 | — |

**已闭环 3 项**：B3 的空索引直通路（建议 #1）、两处跨层预算常量自指（建议 #4）。

**仍开口 9 项**，其中按后果排序值得优先的三条：
1. **M24** — `assertIsolatedArgs(args)` 仍可从 spawn 前摘除而无人发现（G4/X02 集成点）。
2. **M40** — `shell: false → true` 仍无任何断言阻止（不可信 objective 经 shell）。
3. **M28/M29** — 8 MiB 硬限与相对盘符路径行仍可删除（ARTIFACT 预算、C07）。

M5/M6/M9/M12 属「门禁不可达」类，非行为缺陷，但重构时会被无声删掉，建议保留结论备查。

### I2/C06 写入路径真空：仍然成立

以控制组先行的探针在**当前代码**上重跑（`snap-P12/probeI2C06.mjs`）：

```text
CONTROL (well-formed)      : ACCEPTED      <- 先证明通路是通的
I2      (scope_version: 7) : ACCEPTED
C06     (unregistered ref) : ACCEPTED
落盘复读：seq=1 scope=1 refs=[] / seq=2 scope=7 refs=[] / seq=3 scope=1 refs=["a-NEVERREG"]
```

根因未变：`appendEvent` 仍只透传 `expectedSeq`/`expectedEventHash`/`semanticContext`，而**全仓 `scripts/` 与 `protocols/` 零调用方传 `semanticContext`**，故 `knownArtifactIds`/`knownEventIds` 恒空、`currentScopeVersion` 恒 undefined，三处检查恒短路。建议 #2 未落地。

### 复验边界

- 全部在 `/tmp/agv2-rc2/` 的一次性副本上执行，**仓库内一字未改**（本次仅写本报告）。
- 仓库树在复验期间仍被并发编辑，故每项结论都以「与自己同快照的 control」为基准，而非跨时间比较计数。
- 未跑 live 用例（5 项 skipped），仍遵守不花真钱约束。

---

## 更正：基线作废与 M22/M25 的死亡确认（2026-08-13，acceptance-trace 追加，经 team-lead 复验）

本节只更正基线口径与 M22/M25 两项结论，报告其余部分未改动。

### 1. 407 基线作废，且当前基线仍在变动

原报告以 `node --test tests/*.test.mjs` 的 **407 tests / 402 pass** 为判定基线（正文与「审计边界」处另有 402 的表述）。该数字已作废。同一天的连续实测：

| 时点 | 测得 | 来源 |
|---|---|---|
| 审计当时 | 407 tests / 402 pass | v2-review 原始审计 |
| 上文复验节 | 444 tests / 439 pass | v2-review 复验 |
| team-lead 复验 | 449 tests / 444 pass | team-lead 隔离副本 |
| 本节 `run-tests.mjs` | 451 tests / 446 pass | acceptance-trace，仓库内 |
| 本节 control 快照 | **452 tests / 447 pass / 0 fail / 5 skipped** | acceptance-trace，隔离副本 |

**基线还在涨**，因为多个子 Agent 正在并发补测（kernel-fix、pipeline-fix、vacuous-fix）。因此：

> **任何引用本报告变异结论的 Agent 必须自建基线，不得引用上表任一数字作为锚。**

这也是为什么判定必须走**配对归因**（同一快照复制 control 与 mutant 各一份，只按失败测试名的**集合差**归因），而不是拿计数与任何历史数字相比——跨时间比较计数在并发编辑下无意义。

### 2. M22 / M25 已死亡，附杀手测试名

两项均已被跨层常量哨兵杀死（任务 12 落地，`tests/kernel-layer-consistency.test.mjs` 的第二半）：

| 变异 | 杀死它的测试 |
|---|---|
| **M25**（`LAUNCH_BUDGET_BYTES` 16 KiB → 1600 KiB） | `the dispatch layer gates on the same launch budget the kernel declares`（相等断言）<br>`the launch gate rejects at the kernel budget, one byte over and not before`（**驱动真实门禁**） |
| **M22**（`ENVELOPE_BUDGET_BYTES` 1024 → 102400） | `the dispatch layer gates on the same output envelope budget the kernel declares`（仅此一条） |

M25 的第二条杀手比第一条值钱：它在预算边界两侧驱动 `checkLaunchBudget()` 的真实行为（恰好在预算处必须接受、超一字节必须拒绝并回报 `limit`/`bytes`），因此杀死不是靠等式碰巧成立，而是门禁真的按那个数字动作。M22 只有相等断言这一条杀手。

### 3. 「跨层相等」单独存在时可被协同漂移绕过 —— 是设计值哨兵兜住了它

M22 只被一条相等断言看守，暴露一个原报告未覆盖的攻击面：**相等断言只保证两侧一致，不保证两侧正确**。若两侧一起改宽，相等仍成立。

acceptance-trace 自证（配对判定，隔离副本，变异器带 `VOID-MUTATION` 自检）：同时把 `scripts/ingest-audit.mjs` 的 `ENVELOPE_BUDGET_BYTES` 1 KiB → 100 KiB **与** `lib/budgets.mjs` 的 `WORKER_OUTPUT_ENVELOPE` 1 KiB → 100 KiB 改宽。

```text
CONTROL : tests 452 / pass 447 / fail 0 / skipped 5      <- 先证明快照本身是绿的
MUTANT  : tests 452 / pass 445 / fail 2 / skipped 5
集合差（仅变异体失败）：
  ✖ budget constants match the design table
  ✖ the worker-input schema caps the requested envelope at the output budget
```

那条跨层相等断言**如预期地没有失败**（两侧一致）。抓住协同漂移的是另外两条：

- `tests/kernel-budgets.test.mjs:43` —— `assert.equal(BUDGETS.WORKER_OUTPUT_ENVELOPE, 1 * 1024)`，把常量钉在**设计值字面量**上，不随任何一侧漂移。
- `tests/kernel-layer-consistency.test.mjs:255` —— 比对 `worker-input.schema.json` 里 `max_envelope_bytes.maximum` 的字面量 `1024`，等于第三份独立拷贝。（**注**：此条属任务 12 新增的跨层一致性批次。它钉住的 `SCHEMA_IDS.WORKER_INPUT` 目前在 `lib/`+`scripts/`+`protocols/` **零 `getSchema()` 调用**——见任务 #16，该输入对象尚未被任何生产代码构造。此测试是 #16 落地后的防漂移哨兵，不表示 envelope 已在使用。）

结论：**跨层相等断言必须与设计值哨兵配对使用**，单用前者只堵单侧漂移。原报告 TAUTOLOGY 节说 `budget constants match the design table`「保护的是常量值不变，不是常量被用作门禁」——这个定性正确，但本次实测补上了它的正面价值：正是这条「弱」断言拦住了相等断言拦不住的协同漂移。两类断言职责不同，都需要。

顺带纠正原报告对 `WORKER_SUMMARY`/`WORKER_OUTPUT_CLAIMS`/`WORKER_OUTPUT_ARTIFACT_REFS` 的定性。「零生产引用」在 `lib/` 侧仍然成立（门禁实现在 `scripts/` 的内联字面量里），但**漂移已被拦住**：`tests/kernel-layer-consistency.test.mjs` 第 202、229 行用**行为断言**而非字面量比对（喂 10 倍超长 summary 后量 `projectEnvelope()` 实际输出字节；ASCII 输入使裁剪精确等于 `BUDGETS.WORKER_SUMMARY`，并有反向的「未过度裁剪」断言，故放宽与收紧两个方向都抓）。准确表述是「常量仍无 `lib/` 侧调用点，但跨层已钉死」，不是「仍无任何保护」。

### 4. 其余 10 项存活结论悬置

上文复验节列为「仍存活」的 M5、M6、M9、M12、M24、M28、M29、M39、M40 与 M1b 之外的余项，**结论一律悬置，需重跑后再判**。理由不是怀疑当时的判定，而是靶点所在文件正被重写：

| 变异 | 靶点文件 | 状态 |
|---|---|---|
| M24、M39、M40 | `scripts/dispatch-worker.mjs` | pipeline-fix 已从 196 行重写到 460 行（#9/#14/#16） |
| M28、M29 | `lib/artifacts.mjs` | 受 B2/B3 修复波及 |
| M5、M6、M12 | `lib/journal.mjs`、`lib/reducer.mjs` | kernel-fix 修 B1/B2 中 |

**旧靶点文本很可能已不存在。**

### 5. 方法论：no-op 变异必然报「存活」

因此**存活结论的可信度天然低于杀死结论**，二者不对称：

- 「杀死」是阳性证据：有测试红了，且已按集合差归因到本次变异。
- 「存活」是阴性证据，有两个非缺陷解释——变异没落地（needle 因重写而消失、缩进不匹配致 `replace` 静默 no-op），或变异落地了却在死代码上。

本节的变异器带两道自检并在任一触发时**退出码 1**：needle 不存在 → `VOID-MUTATION: needle absent`；替换前后内容相同 → `VOID-MUTATION: replacement identical`。仅校验 needle 存在不够。

这道自检本次**当场生效**：`lib/budgets.mjs` 的真实文本是 `WORKER_OUTPUT_ENVELOPE: 1 * KIB,`（用了 `KIB` 常量），而我按 `1 * 1024` 构造 needle。若没有自检，那半边变异不会落地，`fail` 只会来自 `scripts/` 单侧，我会把「协同漂移未被拦住」误写成「已被拦住」——恰好是与真相相反的结论。

这与原报告已记录的两条方法论（控制组先行、变异脚本须自检）同源，是同一缺陷类在验证工具层的第三次发作。

*—— acceptance-trace，2026-08-13。本次仅追加本节，报告其余部分一字未改；全部变异在 `%TEMP%/agv2-coord-drift/` 的一次性配对副本上执行，运行后已删除，`git status` 复核仓库无新增改动。*


---

## 补测实施与复验（2026-08-13，v2-review 追加）

本节记录**已实施的补测**及其变异复验结果，绑定代码版本
`scripts/dispatch-worker.mjs` = `ef4be041e7298fb3b08856028de376d9eef4fbad9dd081c0d559c4fa57c0bbaa`（460 行，pipeline-fix 重写后）。
基线：**466 tests / 461 pass / 0 fail / 5 skipped**（本机，backend 与 gcc 均在位）。

### 1. 建议清单 5–8 项：全部实施并被变异确认承重

每条补测都用「先确认靶点文本存在于当前磁盘版本 → 施加变异 → 比对替换前后内容，相同即 VOID 退出」的配对流程验证。

| 项 | 补测 | 文件 | 变异 | 判定 | 杀手用例 |
|---|---|---|---|---|---|
| 5 | 盘符相对路径 `C:relative/x`、`C:`、`c:x`、`Z:a/b` → false | `tests/kernel-artifacts.test.mjs` | M29（删 `/^[A-Za-z]:/` 行） | **KILLED** | `a drive-relative path is rejected even though it is not absolute` |
| 6 | 真实存在但无原生兄弟的 `claude.cmd` → `resolveBackend` 返回 null | `tests/backend-isolation.test.mjs` | M39（shim 当 backend 返回） | **KILLED** | `a real .cmd shim with no native sibling is refused, not returned` |
| 7 | 真实 spawn 的 argv 完整性（4 条） | `tests/dispatch-argv-integrity.test.mjs`（新建） | M40（`shell:false→true`） | **KILLED**（单跑该文件 3/3 全红） | `the worker is spawned without a shell...` 等 |
| 8 | 8 MiB 硬限负例 + `verifyContent:false` 控制组 | `tests/kernel-artifacts.test.mjs` | M28（删硬限抛错块） | **KILLED** | `an artifact past the 8 MiB hard limit is refused before it is ever read` |

**第 5 项的实质**：原有拒绝列表里的 `'C:/windows'` 与 `'c:\windows'` 早已被「绝对路径」和「反斜杠」两条规则拦下，**从未触及盘符规则**——所以那行代码删掉全绿。真正需要它的是 `C:relative`：Windows 按该盘符的*当前目录*解析，既非绝对亦非任务相对，正是该规则存在的理由。这是「负例选得不够刁，规则形同虚设」的实例。

**第 7 项为何必须新建文件并编译 C 桩**：`shell: false` 是唯一**无法从 dispatcher 返回值观测**的性质。shell 会把 argv 数组拼成单条命令行再由子进程重新切分，父进程两种情况下看到的 envelope 完全相同，只有子进程能报告它真正收到了什么。实测差异（`probe-argv.mjs`）：

| | argc | `--tools ''` | 多行 system prompt |
|---|---|---|---|
| `shell: false` | 12 | 保留空串参数 | 完整落在单个 argv 槽 |
| `shell: true` | 11 | **两个 `''` 全部消失** | 按空白切成 `line` / `one` |

即 `--tools ''` 的空串被 shell 吞掉后，该 flag 会静默绑定到下一个 token，**worker 的「无工具」保证当场失效**——这是本文件真正防的缺陷，不只是参数变形。

### 2. M24 二次复验：先存活、补测后杀死

M24（从 dispatch 路径摘除 `assertIsolatedArgs(args)` 调用）在**靶点确实落地**（`applied 1 edit(s)`）的情况下**仍然存活**——即上文「测函数不测调用点」缺陷类在 pipeline-fix 重写后**依然成立**：该函数有优质单测，但无人断言它被调用。

补测的关键是找到**可达的注入点**。已实测确认：`dispatchWorker` 的 `model` 参数默认取自 `process.env.ACE_WORKER_MODEL`（外部字符串），经 `buildArgs` 直接进入 argv，故 `model: '--resume'` 可真实触发该门禁：

```
args= [...,"--model","--resume","--max-turns","1"]
GATE FIRED: INVARIANT_VIOLATED: isolation-defeating args present: --resume
```

补测 `X02 integration: an isolation-defeating model value is refused before any spawn` 同时断言**拒绝发生在 spawn 之前**（该 dispatch 不得留下 raw artifact）。复验：M24 **KILLED**。

### 3. 建议清单第 9 项：给出可操作定义并全量执行

原第 9 项「为每组拒绝类测试补 control 正例」无法判定完成与否。本次将其**操作化**为：**对每个校验函数施加「无条件拒绝」变异（blanket-reject），若整套测试仍全绿，则该组断言纯属空转——它对一个「对任何输入都说不」的实现同样通过。**

20 个校验函数全部施加，结果：**19 KILLED / 1 SURVIVED**。

唯一存活者：**`assertCompositionWithinBudget`**（`lib/budgets.mjs`）。该函数三处调用点全部只断言拒绝，无任何正例。已补 control：

- `control: a launch payload exactly at the limit is accepted and returns its composition`
- 该用例同时把边界钉为 `>` 而非 `>=`（恰好等于上限必须放行）。

复验：blanket-reject 变异 **KILLED**。至此第 9 项在当前代码版本上**无残留空转组**。

被 blanket-reject 杀死的 19 项（附失败数，可作为各校验函数「被依赖广度」的粗略度量）：
`validateSchema`(119)、`isHashRef`(89)、`assertWithinBudget`(88)、`validateEventSemantics`(73)、`assertNoViolations`(81)、`checkLaunchBudget`(25)、`verifyEventHash`(25)、`assertIsolatedArgs`(25)、`resolveBackend`(24)、`isSafeRelativePath`(24)、`rungSatisfies`(19)、`validateArtifactManifest`(16)、`verifyChain`(13)、`verifyCursor`(10)、`validateWorkerOutput`(7)、`validateCriterion`(5)、`validatePhaseTransition`(2)、`validateEvidenceUsability`(1)、`isMainAgentIngestible`(1)。

**附带发现**：`assertIsolatedArgs` 的 blanket-reject 被 25 条杀死，而 M24（删调用点）却存活。二者不矛盾，恰是缺陷的精确刻画——**函数被广泛依赖，但没有一条断言它在正确时机被调用**。blanket-reject 只能证明「函数被用到了」，证不出「门禁接在了该接的地方」；两类变异缺一不可。

### 4. 方法论补记：正例检测无法用正则近似

实施第 9 项前曾尝试用正则统计「每个出现在拒绝断言里的函数是否也出现在正例断言里」，产出 8 个「无正例」告警，逐一核对**全部为假阳性**（数值期望如 `assert.equal(fn(x), 2049)` 不匹配 `true`/`.valid` 模式）。启示与本任务前两次同源：**判断「约束是否被守住」必须靠变异这类阳性证据，静态文本近似只能提假设，不能下结论。**

*—— v2-review，2026-08-13。所有变异均在 `%TEMP%` 一次性副本上执行（`mutate.mjs`，带 needle 缺失与 no-op 双自检并非零退出），运行后删除。*
