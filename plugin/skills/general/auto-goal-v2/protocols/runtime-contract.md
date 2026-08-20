# 运行时调用契约

> 加载时机：`NEW`（与 `control-loop.md` 同时），一次运行只读本文件一次。
> **唯一调用面。**本表列出主 Agent 可调用的全部运行时导出。表由 `tests/contract-table.test.mjs` 对源码机械校验，漂移即测试失败——因此可以信任本表而不读实现。

调用方式统一为：

```text
node --input-type=module -e "import {fn} from 'file:///<skill-abs-path>/<module>.mjs'; ..."
```

`<skill-abs-path>` 取自 SKILL.md 头部的 Base directory。

## 契约表

| 模块 | 导出 | 用途 |
|---|---|---|
| `lib/outcome.mjs` | `deriveOutcome(input)` · `isSealable(status)` · `missingTerminalFields(result)` | G5：终态唯一来源 |
| `lib/reducer.mjs` | `reduceCheckpoint(events, opts)` · `projectState(events)` · `deriveNextAction(state)` | REDUCE：派生 checkpoint 与唯一 next_action |
| `lib/journal.mjs` | `appendEvent(taskRoot, draft, opts)` · `readCheckpoint(taskRoot)` · `readTail(taskRoot)` · `readEventsAfter(taskRoot, cursor)` · `verifyCursor(taskRoot, cursor)` · `initTaskRoot(taskRoot)` · `writeCheckpoint(taskRoot, checkpoint)` · `verifyJournal(taskRoot)` | APPEND：控制面单写者 |
| `lib/ledger.mjs` | `buildLedger(events)` · `assessSatisfaction(entry, opts)` · `hasExhaustedEvidence(entry)` · `planRequiredRung(type, risk)` · `countStates(ledger)` | 判据台账与证据等级 |
| `lib/artifacts.mjs` | `registerManifest(taskRoot, manifest, seq)` · `verifyManifest(taskRoot, manifest, opts)` · `verifyArtifactIntegrity(taskRoot, index)` · `readManifestIndex(taskRoot)` · `checkManifestShape(manifest)` | 产物登记与完整性 |
| `lib/recovery.mjs` | `buildRecoveryEnvelope(taskRoot, opts)` · `recoveryEnvelopeBytes(envelope)` | RECOVERING：≤1 KiB envelope |
| `lib/paths.mjs` | `resolveWithinRoot(taskRoot, rel)` · `resolveRealPathWithinRoot(taskRoot, rel)` · `isSafeRelativePath(candidate)` · `artifactObjectPath(sha256, ext)` | 路径逃逸防护 |
| `lib/budgets.mjs` | `BUDGETS` · `utf8Bytes(text)` · `assertWithinBudget(serialized, limit, budget, composition)` | 字节预算硬闸 |
| `protocols/runtime/planning-gate.mjs` | `checkHardGates(context)` · `gateStep({goal, step, mandate, approval})` · `HARD_GATES` | G1–G5 机械检查 |
| `protocols/runtime/router.mjs` | `route(input)` · `deriveFrontier({candidates, resolved})` · `worthAsking(candidate)` · `SIGNALS` · `METHOD_PACKS` | 方法包路由与 Frontier |
| `scripts/backend-resolve.mjs` | `resolveBackend(env)` · `cleanEnv(env)` · `assertIsolatedArgs(args)` · `FORBIDDEN_ARGS` | clean-context 后端；返回 null 即硬阻塞 |
| `scripts/dispatch-worker.mjs` | `dispatchWorker({...})` · `buildWorkerInput({...})` · `measureWorkerInput(envelope)` · `WORKER_SYSTEM_PROMPT` | G4：worker 派发唯一入口 |

## 摄入一次性原则

同一文件在一次运行内只摄入一次。重复 Read 不产生新信息，只重复计费——已进入上下文的内容不会因再读一遍而更可靠。

需要回看某个签名时，依据本表与既有上下文，**不重新 Read**。

## 何时才允许读实现

仅当三个条件同时成立：

1. 调用已严格按本表的签名进行；
2. 调用确实失败（有错误输出，不是"担心它会失败"）；
3. 错误信息不足以定位。

此时只读**该一个**模块，不顺带读其依赖。
