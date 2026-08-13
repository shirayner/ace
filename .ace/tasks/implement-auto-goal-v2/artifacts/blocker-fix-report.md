# B1 / B2 / B3 内核阻塞缺陷修复报告

**执行者**：kernel-fix
**范围**：`lib/ledger.mjs` 的 `assessSatisfaction`（B3）、`lib/journal.mjs` 的 `writeCheckpoint`（B2）与 `appendLine`/`readSegment`/`appendEvent`（B1），以及对应测试文件。
**环境**：Node v24.13.0，Windows 11。变异验证全部在 `$TEMP` 下的仓库外副本执行。

## 测试计数

| 阶段 | tests | pass | fail | skipped |
|---|---|---|---|---|
| 我接手时的实测基线（**不是任务书写的 407**） | 434 | 429 | 0 | 5 |
| 三项修复完成后 | 457 | 452 | 0 | 5 |

净增 23 条测试，0 失败。基线漂移原因：其他 Agent 并发加测试；任务书给的 407 与审计报告的数字均已过期。

命令：`node --test tests/*.test.mjs`（显式文件列表；目录形式在 Node 24 上发现 0 个用例）。

---

## B3 — `assessSatisfaction` 空 artifactIndex 直通 satisfiable

### 改了什么

`lib/ledger.mjs`：删除证据存在性循环里的 `if (artifactIndex.size === 0) break;`，并写明理由——空索引正是「journal 里一个 `ARTIFACT_REGISTERED` 都没有」的形态，把「空」当「未知，假定没问题」使得**证据缺失得越彻底越容易通过**。查不到即不满足，与索引大小无关。

### 为什么这么改

规格给的方向即最小修复，无需引入新概念。删除后基线零失败——这与规格的预测（「实测只有 2 项失败」）不符：规格作者当时连 `reasons.push` 一起删了，只删这一行不会让既有测试失败。**这正是缺陷能长期存活的原因**：两条现有 I5 测试的 fixture 恒定提供非空索引，从不走空索引路径。所以修复的价值全在新加的测试上，产品代码那一行删掉本身是无声的。

### 新增测试

1. `kernel-ledger.test.mjs`：`an empty artifact index does not make ghost evidence satisfiable (I5)`
2. `kernel-ledger.test.mjs`：`control: an index holding exactly the referenced evidence is satisfiable` — **控制正例**，唯一差异是证据存在。没有它，一个无条件返回 unsatisfiable 的实现也能通过第 1 条。
3. `outcome-derivation.test.mjs`：`an empty artifact index cannot reach DONE either (I5)` — 断言到 `blocking_reasons` 级别，不只是 `status !== DONE`。
4. `kernel-reducer.test.mjs`：`a journal with no ARTIFACT_REGISTERED cannot seal DONE (I5, I1)` — 端到端，证明完整攻击链被 reducer 的 I1 守卫接住。
5. `kernel-reducer.test.mjs`：`control: the same journal with the evidence registered does seal DONE` — **控制正例**，与第 4 条只差一个 `ARTIFACT_REGISTERED`。

### 变异证据

变异 `B3-restore-shortcircuit`：把 `if (artifactIndex.size === 0) break;` 加回去（脚本自检文件确实变化：9331 → 9372 字节）。

```
--- exit: FAILURES (mutant killed)   tests 85 / pass 82 / fail 3
✖ an empty artifact index does not make ghost evidence satisfiable (I5)
✖ a journal with no ARTIFACT_REGISTERED cannot seal DONE (I5, I1)
✖ an empty artifact index cannot reach DONE either (I5)
```

**结论：fixed，变异被杀。**

---

## B2 — `writeCheckpoint` 接受手写的 TERMINAL/DONE

### 改了什么

`lib/journal.mjs`：`writeCheckpoint` 在 schema 与 2 KiB 门禁之后新增 `assertDerivedFromJournal(taskRoot, checkpoint)`：重新 `reduceCheckpoint(readAllEvents(taskRoot).events, { now: checkpoint.updated_at })`，比较**整体 `canonicalHash`**；不等则抛 `KernelError(INVARIANT_VIOLATED)`，错误 details 带 `divergingFields`（有界诊断，不 dump 两份文档）。reducer 本身抛错（如空 journal、I1 冲突）时包装为同一个 code，消息带 `cannot be derived`。

新增 `journal.mjs → reducer.mjs` 的 import。已确认无循环依赖：`reducer.mjs` 不 import `journal.mjs`。

### 为什么比较整体 canonicalHash 而不只是 outcome

1. **收敛性**：只校验 `outcome`，攻击面立刻转移到 `ledger_counts`、`phase`、`residual_count`、`next_action` —— 而这些正是主 Agent 读来决定「还有没有事要做」的字段。伪造 `ledger_counts.satisfied = 9` 不需要碰 `outcome` 就能误导决策。整体 hash 是唯一不留残余攻击面的比较。
2. **cursor 不能用来识破**：伪造者可以从真实 `readTail()` 抄 `source_cursor`，`verifyCursor` 会报 `valid: true`。这已在规格里实测过，我在测试注释中显式记下了这一点，避免后人以为 cursor 校验够用。
3. `updated_at` 是唯一取自候选而非派生的字段——它记录「这次归约何时被持久化」，不携带关于目标的任何断言。其余字段必须与 journal 说的一致。

### 新增/修改测试

**新增**（`journal-append.test.mjs`）：
- `writeCheckpoint refuses a checkpoint the journal does not derive (I1, G5)` — 规格给的伪造 checkpoint，cursor 真实。
- `control: writeCheckpoint accepts exactly what reduceCheckpoint produced` — **控制正例**。没有它，无条件抛错的实现也能通过上一条。
- `a checkpoint whose ledger_counts were inflated is refused, not only its outcome (I1)` — 这条专门锁住「整体 hash 而非 outcome」的选择，`outcome` 与派生结果完全一致，只改 `ledger_counts`。
- `a checkpoint for an empty journal has nothing to derive from and is refused`。

**修改**（`journal-append.test.mjs`）：
- `a checkpoint is written atomically and read back`：原来手搓 checkpoint 对象，现在改用 `reduceCheckpoint` 产出。手搓的那个本来就与 journal 不符（`goal_summary: 'delta'`、`ledger_counts` 缺 `moot`），是同一类问题的良性版本。
- `the widest schema-legal checkpoint stays under the 2 KiB limit (C01)`：这条测的是**尺寸**，而「最宽的 schema 合法文档」按构造不可能由任何 journal 派生。改为直接 `assertSchema` + `utf8Bytes` 测量，用的是 `writeCheckpoint` 内部同一个序列化式子，所以测量值就是它会门禁的那个值。**没有放宽守卫，改的是断言的表达方式。**

### 对 `kernel-recovery.test.mjs` 两处故意坏 checkpoint 的处理

规格点名的 `:252` 与 `:270`：

- **`:270`（`an unparseable checkpoint file does not block recovery`）不需要改**。它本来就用 `writeFileSync` 绕过校验写入——注释已写明「Written past the validating writer on purpose」。新守卫对它无影响。

- **`:252`（`a stored checkpoint whose cursor does not match the journal is rebuilt`）改了写入通道，没有放宽守卫。** 想清楚这条测试要验的是什么：它验的是**恢复路径遇到游标失配时会重建而不是盲信**（I7）。这个状态的语义是「磁盘上出现了一份没有诚实写入者会产生的文件」——被篡改的、或从别的任务串过来的。既然如此，它就该在**文件层**被植入，与 `:270` 完全同一个理由。所以我改用 `writeFileAtomic(journalPaths(root).checkpointPath, ...)` 直接写，并在注释里写明为什么这是合法途径而非规避。

  `writeFileAtomic` 是既有的公开导出（`artifacts.mjs`、`rollSegment` 都在用），**不是我为可测性新开的后门**——它本身不提供「写一份被信任的 checkpoint」的能力，因为 `buildRecoveryEnvelope` 读到它时照样会验游标并重建。这一点很关键：低层通道存在，但它绕不过 I7，只绕过 I1 的写入面校验，而这条测试恰恰是在验 I7 生效。

- **一并新增控制正例** `control: the same journal with its real cursor is used as stored, not rebuilt`：与上一条只差 cursor 是真的。没有它，一个「永远 rebuilt」的恢复路径也能通过原断言。

### 变异证据

| 变异 | 内容 | 结果 |
|---|---|---|
| `B2-gate-off` | `assertDerivedFromJournal(...)` → `if (false) assertDerivedFromJournal(...)`（25440 → 25451 字节） | **killed**，3 条失败：`writeCheckpoint refuses a checkpoint the journal does not derive (I1, G5)` / `a checkpoint whose ledger_counts were inflated is refused...` / `a checkpoint for an empty journal...` |
| `B2-outcome-only` | 整体 hash 比较 → 只比较 `outcome`（25440 → 25469 字节） | **killed**，1 条失败：`a checkpoint whose ledger_counts were inflated is refused, not only its outcome (I1)`。这条变异是专门用来验证「整体 hash」这个决策本身是被测住的，不是被注释住的。 |

**结论：fixed，两条变异均被杀。**

---

## B1 — 崩溃残留行一旦不再是末行，journal 永久不可读

### 改了什么（三处联动，缺一不可）

**1. `appendLine` 补换行**：追加前用 `endsWithoutNewline(filePath)` 读文件末字节，非 `\n` 则先写 `\n`。单字节读是无歧义的——`\n` 是 0x0A，不可能作为 UTF-8 续字节出现。返回 `{ repairedNewline }` 供调用方推导字节数。

**2. `readSegment` 容忍非末尾残留**：采用规格的方案 (a)，语义为「若某行是坏行且其后的事件仍能与坏行之前的链相接，则判定为崩溃残留，丢弃并在 `droppedResidueLines` 中报告」。`readAllEvents`/`verifyJournal` 透传为 `[{segment, line}]`。

**3. `appendEvent` 写入与上报一致**：删掉写入后的 `readTail(taskRoot)` 重读，改为从内存推导 `newTail`（segment/seq/eventHash 来自刚封装的 event，eventCount +1，bytes 加上本行与可能的补换行）。

### 为什么必须三处一起改

- **只改 `appendLine` 不够**：补上换行后，残留行从「可丢弃的末行残片」变成「一个完整但非法的行」，仍撞 `readSegment` 的硬抛错分支。
- **只改 `readSegment` 不够**：不补换行，新事件会与残留熔接成**单独一行**，那一行既非法又携带真实事件的字节——丢弃它就是丢事件，不丢就读不了。
- **第 3 处是规格修正过的那一点，也是最容易被漏掉的**：原实现是**先成功写入、再抛错**（抛错点在写入完成后的 `readTail`）。调用方收到 `JOURNAL_CONFLICT` 会以为写入失败，而字节已落盘。这是 append-only log 最不该说的谎。推导 tail 顺带更精确：值就是刚写的那个，不依赖再读一遍。

### 残留判定的边界（三个我自己探出来的洞，规格没提）

规格只给了「前后行都能通过 hash 链校验相接」这个方向。落地时我用离仓探针实测出三个洞，都已收口：

1. **段首坏行无本地前驱**。最初实现里「没有前驱就直接判为残留」，结果**一个丢失的段首事件与残留无法区分**——实测：把 event 1 换成 garbage，`readSegment` 照样返回 1 个事件、`verifyJournal` 报 `valid: false`。改为从上一段的 seal（segment 1 则 genesis）取应有的前驱 hash。测试：`a bad first line is an error too: the chain link is checked against the seal` + 控制正例 `residue as a segment's first line is tolerated when the seal proves the link`。

2. **残留恰好停在合法 JSON 边界**。torn write 可能停在 `{"actor":"controller"}` 这种语法完整的位置。只靠 `JSON.parse` 就会把一条没有 seq、没有 hash 的记录当事件收进链里——实测：`events: 4, verify: false, prev_event_hash mismatch: ... found undefined`。比丢弃更糟，因为链会自称损坏。加了 `parseEventLine` 的最小形状检查（只查 `seq`/`event_hash`/`prev_event_hash` 三个链字段）。测试：`residue that happens to be valid JSON is still residue, not an event (J01)`。

3. **连续两个坏行**。一次崩溃只产生一个不完整的行，所以 `nextParsedEvent` 遇到紧邻的第二个坏行即返回 null，不当残留。实测确认这种状态下 `appendEvent` 抛错且**不写入任何字节**。

### 一处刻意的不检查，及其理由

`isCrashResidue` **不**对存活事件做自身 hash 校验（`verifyEventHash`）。我最初写了，变异 `B1-no-hash-verify` 存活，说明它不载荷——进一步想清楚后确认它**不该在这里**：「这条记录自身 hash 是否成立」是 `verifyChain` 的问题。在 `readSegment` 里回答它，会把一个被篡改的事件变成 `readSegment` 的抛错，用一个链接检查已经提供的守卫，换掉 `verifyJournal` 本该给出的精确诊断（`event_hash mismatch at index N`），并让 journal 在一个恢复流程本应能报告的状态下重新变得不可读。于是删掉该检查并在代码注释中写明选择理由，同时补测试 `residue next to a tampered event is diagnosed by verifyJournal, not by a throw` 把这个分工钉住。

### 新增测试

`journal-append.test.mjs`：
- `a crash residue that is no longer the last line still leaves a readable journal (J01)` — 规格的验收断言，加强为精确计数与行内容比对。
- `an append after a torn write reports the tail it actually wrote, not an error (J01)` — 锁住第 3 处修复，含 `assert.deepEqual(result.tail, readTail(root))`。
- `control: an append onto an intact segment adds no newline and reads back identically` — **控制正例**。没有它，补换行可能无条件触发，往每个健康 segment 里插空行，而残留测试不会发现。
- `appendEvent never reports failure over bytes it wrote, nor success over none` — 顺序性质：所有校验先于写入，拒绝即零字节移动。
- `a mid-file line the chain does not heal over is still an explicit error` — 容忍面的负例（整个事件被 garbage 替换 → 链断 → 仍抛错）。
- 上述三个边界洞各一条 + 篡改分工一条。

`kernel-recovery.test.mjs`：
- `recovery still produces an envelope after a crash residue mid-segment (J01)` — 直接断言「永不空手而归」这条退路本身，而不只是 parser。这是 B1 为什么是阻塞级而非难看的原因。

### 变异证据

| 变异 | 内容 | 结果 |
|---|---|---|
| `B1-no-newline-repair` | `endsWithoutNewline(filePath)` → `false && ...`（25440 → 25449） | **killed**，4 条失败（含 recovery 那条退路断言） |
| `B1-readsegment-throws` | `if (isCrashResidue(...))` → `if (false)`（25440 → 25390） | **killed**，5 条失败 |
| `B1-drop-unconditionally` | `if (isCrashResidue(...))` → `if (true)`（放宽成「任何坏行都丢」） | **killed**，4 条失败：`a mid-file line the chain does not heal over...` / `a bad first line is an error too...` / `appendEvent never reports failure...` / `a corrupt complete line is an explicit error...` |
| `B1-first-line-unchecked` | 段首前驱 hash → 取 `next.prev_event_hash`（自证自明） | **killed**，1 条失败：`a bad first line is an error too: the chain link is checked against the seal` |
| `B1-no-shape-check` | 形状检查字段列表 → `[]` | **killed**，1 条失败：`residue that happens to be valid JSON is still residue, not an event (J01)` |
| `B1-derived-tail-wrong-bytes` | 推导 tail 的 bytes 少算补换行的 1 字节 | **killed**，1 条失败 |
| `B1-derived-tail-wrong-count` | 推导 tail 的 `eventCount` 不 +1 | **killed**，1 条失败 |
| `B1-reread-tail` | 推导 tail → 改回 `readTail(taskRoot)` | **存活（等价变异，见下）** |

### 关于存活的 `B1-reread-tail`

我不把它算作「修复无效」，理由是它在当前代码下是**等价变异**——但这个判断是实测出来的，不是推断的。探针（`$TEMP/agv2-kernel-fix/probe/s.mjs`）枚举了 5 种前置状态，逐一比较「推导 tail」与「写入后重读 tail」：

```
clean                    append=ok | reread=ok | identical=true
unparseable residue      append=ok | reread=ok | identical=true
json-shaped residue      append=ok | reread=ok | identical=true
two residues in a row    append=THREW JOURNAL_CONFLICT | reread=JOURNAL_CONFLICT | identical=null
tampered last event      append=ok | reread=ok | identical=true
```

关键点：因为 B1 的第 1、2 处修复已经生效，**「写入成功但重读抛错」这个状态不再可达**。唯一仍抛错的一行（两个连续坏行）是在 `appendEvent` 开头的 `readTail` 就抛，写入根本没发生——已由 `appendEvent never reports failure over bytes it wrote` 覆盖。

所以第 3 处修复现在是**纵深防御**：它保证的性质（写入成功绝不上报失败）由第 1、2 处修复以另一条路径同样保证了。我保留它，因为它不依赖 `readSegment` 的容忍策略永远正确，而后者是策略、可能演化；而 tail 的**取值正确性**由 `B1-derived-tail-wrong-bytes`/`-wrong-count` 两条变异证明是被测住的。

**结论：fixed，8 条变异中 7 条被杀，1 条经实测判定为等价变异（对应性质由其他测试从另一路径覆盖）。**

---

## 变异脚本的自检

`$TEMP/agv2-kernel-fix/mutate.mjs`（**仓库外**，不污染仓库）。每次运行：`cpSync` 出隔离副本 → 替换 → **比对替换前后内容，相同即 `VOID MUTATION` 并 exit 3** → 再从磁盘重读确认 → 打印字节数变化 → 跑测试。

这个自检真实发挥了作用：我中途重构 `readSegment` 后，`B1-readsegment-throws` 与 `B1-drop-unconditionally` 的 find 串失效，脚本报了两次 `VOID MUTATION: pattern not found`。**若没有自检，这两条会打印 "applied" 然后测试全绿，被读成「约束未被守住」**——而实际上变异根本没执行。修正 find 串后两条都被杀。

## 规格与实际代码的偏差

1. **B3 的失败预测不成立**。规格称删掉 `size === 0` 那行后「基线实测只有 2 项失败」。实测：**0 项失败**。规格作者自己在括号里解释了原因（他的 M1 同时删了 `reasons.push`）但正文没改。这不影响修复，但它说明既有 I5 测试对这条缺陷完全空转。

2. **B2 的 `kernel-recovery.test.mjs:252` 行号已漂移**，且规格说「前者若被新守卫拒绝，需要为这类测试提供显式的低层写入通道」——不需要新提供，`writeFileAtomic` 已是公开导出。

3. **B1 的残留判定边界规格没覆盖**：段首无前驱、残留恰为合法 JSON、连续两个坏行。三者都是实测出来的真洞，若照规格字面实现会留下前两个。

## 超出范围、未修的问题（不自行扩大范围）

1. **`lib/semantic-validator.mjs` 的三处同源短路仍在**：第 179 行 `knownEventIds.size > 0`、第 186 行 `knownArtifactIds.size > 0`、第 416/437 行 `artifactIndex.size > 0`。机制与 B3 完全相同（集合为空则跳过校验）。规格建议一并收口并让 `appendEvent` 从 journal 自行派生 `knownArtifactIds` 传入语义校验，否则 C06 在写入路径仍是空转。`semantic-validator.mjs` 不在我的可改清单内，未动。

2. **B2 的每次 `writeCheckpoint` 现在多一次全量 replay**。规格已评估「对 2000 事件/段的规模可接受」，且 `CHECKPOINT_REDUCED` 事件本就携带 hash 可用于短路。我没做短路优化——那需要改 `CHECKPOINT_REDUCED` 的写入侧协议，超出范围。

3. **`kernel-recovery.test.mjs` 中另有多处 `checkpointNow(root)` 依赖 reducer 产出**，现在与新守卫天然一致，无需改动；但任何未来「手搓 checkpoint 再写」的测试都会被守卫拒绝，这是有意的。

4. **`tests/stub-backend-rejection.test.mjs` 有 flaky 迹象**（不在我的范围，另有 Agent 在改）。全量跑的某一次里 `C05 control: a well-formed stub reply IS accepted` 失败，`actual: ''` / `expected: '{"status":"SUCC'`——即子进程 stdout 为空。随后单独重跑该文件 3 次、全量重跑 2 次均全绿（461 tests / 456 pass / 0 fail / 5 skipped）。看形态像是子进程启动竞态而非断言缺陷，但**它恰好落在 C05 的控制正例上**，而控制正例静默失败正是本任务反复踩坑的地方，值得该文件的负责人查一次而不要当噪声忽略。
