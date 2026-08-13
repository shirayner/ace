# 实现 auto-goal-v2

## 目标

完整实现已归档设计中的 auto-goal-v2，并以可验证的模型摄入前预算和 clean-context worker 保护主 Agent 上下文。

## 完成标准

- 实现 P1-P6，不修改 V1。
- 私有运行时依赖完全内聚，零新增第三方依赖。
- 37 项验收场景均有结论，适用检查全部通过。
- capability spike 与真实 transcript 证明 clean-context 和摄入前代理成立；否则硬阻塞。
- 成功执行 `ace task done implement-auto-goal-v2`。

## 过程记录

### 决策

- **D1**: 完整实现 P1-P6 — 理由: 用户选择完整 V2；备选: P1、P1-P2。
- **D2**: 零新增依赖，允许最小仓库接线 — 理由: 保持可移植和运行时内聚；备选: Ajv、绝对目录内聚。
- **D3**: clean-context 能力不成立时硬阻塞 — 理由: 返回后截断不能保护模型摄入；备选: 软降级。
- **D4**: 主 Agent 仅保留状态、决策和压缩结论，探索/实现/审查优先委托 clean-context 子 Agent。

### 中间结论

- 设计产物位于 `.ace/tasks/archive/2026-08-12-design-auto-goal-v2/artifacts/`。
- 当前根 `npm test` 指向尚不存在的 `tests/`，需要最小测试接线。
- 2026-08-13 真实 capability spike 已通过：native `claude.exe` 以 `--bare --no-session-persistence --setting-sources '' --tools ''` 启动；主进程注入 570 B，worker 实际摄入 299 tokens，raw 1255 B 先落盘，主 Agent envelope 270 B。
- capability 证据：`.ace/tasks/implement-auto-goal-v2/artifacts/raw/capability-live-001-7d023d08da37.raw`；超 16 KiB 的 17395 B 启动载荷在 spawn 前拒绝且 `launched=false`。
- 可发现性链路无阻塞（`artifacts/discoverability-check.md`）：plugin.json 为目录扫描式无需登记 skill；installer 两处均整树复制；从异地安装位置 import 成功并脱离仓库跑完整测试 0 fail；模块 import 仅 `node:` 与相对路径。
- 验收台账 37 项（`artifacts/acceptance-ledger.md`）：COVERED 34、COVERED-LIVE 2、UNCOVERED 1（X05）。
- **发现缺陷类「预算已声明但无门禁」**：`BUDGETS.SKILL_MD` 与 `BUDGETS.RECOVERY_TOTAL` 均只有定义处、常量断言、文档三处引用，无任何代码以其做门禁。两次独立出现表明是系统性疏漏而非偶发，已展开全部 13 个 BUDGETS 常量的 ENFORCED / DECLARED-ONLY 审计。
- C05（非 JSON worker 回复必须拒绝）此前唯一证据是收费的 live 用例，等于实际不回归，正补离线 stub backend 覆盖。
- C05 离线覆盖已落地（`tests/stub-backend-rejection.test.mjs` + `tests/fixtures/stub-backend.c`）：8 用例含控制组与越界 status，三条拒绝路径各自经变异独立证伪，反方向（无条件拒绝）变异亦被抓；产品代码零改动，仅用既有 `ACE_CLAUDE_BIN` 注入点。约束发现：`dispatchWorker` 以固定 Claude-CLI argv + `shell:false` spawn，故 stub 只能是忽略 argv 的原生可执行文件（node/sh/.cmd 均被实测排除），需 C 编译器。
- **X05 已修**：新增 `lib/recovery.mjs`，`buildRecoveryEnvelope()` 为恢复读取面唯一组装点，RECOVERY_TOTAL 从此有单一执行期门禁。超预算行为定为**降级并披露**（`complete`/`omitted_count`/`fidelity`/`omitted_detail`），非抛错——cursor tail 正当增长无人可「修」，抛错会让每次恢复重读同一 journal 再抛一次、任务永久卡死。仅保留底线抛错（连计数投影都超标 ⇒ checkpoint 本身有缺陷，经正常写入不可达）。15 条测试 + 7 次变异全部被捕获。顺带修 A02 硬编码模块清单（新增模块会被静默漏掉）改为从磁盘派生。
- **19 个常量审计完成**（`artifacts/budget-enforcement-audit.md`）：17 项 ENFORCED，2 项 DECLARED-ONLY —— `WORKER_INPUT_ENVELOPE`（第三个空声明，与预判一致；dispatch 只有 16 KiB 总载荷门，1.9 KiB objective 可过总门却违反 envelope 门）、`ARTIFACT_SLICE_TOTAL`（切片功能尚未实现，属预留）。
- **「声明了却无人校验」第六个实例，且是承重不变量本身**：`kernel-cohesion.test.mjs` 的 `RUNTIME_DIRS` 只含 `['lib','schemas']`，而 `scripts/`(3) 与 `protocols/runtime/`(11) 共 14 个运行时模块**从未被 I10 内聚扫描覆盖**——在 `scripts/dispatch-worker.mjs` 引入第三方包或逃逸 import 到 V1，全套测试照绿。这也解释了跨层常量重复：`scripts/` 不 import `lib/`（仅互相 import），16 KiB、1 KiB、400、3、4 在 `scripts/ingest-audit.mjs` 各写一份，两侧改一处漏一处无任何测试失败。已派扩容 + 双向变异验证 + 跨层一致性断言（优先按根因排序，而非按当前哪个数字不一致）。
- **「声明了却无人校验」第五个实例，且出在专治此病的测试里**：C05 套件用 `if (skipReason) return;`，node:test 中提前 return **计为 pass 而非 skipped**，首个用例更是 `assert.ok(true, skipReason)` 恒真。无 C 编译器时 TAP 计数与有编译器时完全一致（`0 fail / 5 skipped`），C05 却一次未被校验，且无任何可观测痕迹。根因：`before()` 里赋值的标志拿不到 node:test 注册期的 `{skip}` 选项。已要求改为顶层同步探测 + 注册期 skip（无编译器应显示 13 skipped）、新增 `ACE_REQUIRE_STUB_BACKEND=1` 使缺工具链硬失败、并对这两点自证。
- **C05 已闭环**：探测搬到模块加载期同步执行，8 用例改用注册期 `{skip}`，恒真断言删除。自证含**旧写法复现**（%TEMP% 副本退回 `if (built.skip) return;`，无编译器时实测输出 `ok 7`，证明早退计为 pass 非推断）。四次变异在新结构下重跑全部捕获。三方向已由主 Agent 亲自复验（造只含 node 目录的 PATH）：无编译器+置位 → 抛错点名缺编译器、退出码 1；无编译器不置位 → `tests 8 / pass 0 / skipped 8`、退出 0；有编译器+置位 → `8 pass / 0 skipped`、退出 0。
- **第七个实例：开关有了但无人打开**，且同样出在专治此病的修复里（与第五实例同种讽刺）。由 docs-wiring 主动标出而非默认已解决。已在 `.github/workflows/ci.yml` 为 `npm test` 接线 `ACE_REQUIRE_STUB_BACKEND`：ubuntu 自带 gcc、macOS 自带 clang 故强制置 1；windows-latest 编译器不保证故置 0——那里红灯只是噪声，可见 skip 才诚实。C05 演进链完整：唯一证据是收费 live 用例 → 离线可回归 → 跳过可观测 → CI 强制。
- **B5 管线已接上并经核实**：`registerManifest`(dispatch-worker.mjs:316)、`validateSchema`(:414)、`validateWorkerOutput`(:433)，顺序与 dispatch.md §3 一致。
- **第八个实例，B5 原病的复发形态：有调用方但无人证明它有牙**。`scripts/dispatch-worker.mjs:433` 的 `if (violations.length > 0)` 改为 `if (false)` 后全套 8 pass 未被捕获（docs-wiring 变异实测）。核实：`validateWorkerOutput` 仅 `tests/kernel-semantics.test.mjs` 直接单测，**无任何测试经 `dispatchWorker` 端到端驱动语义拒绝**，`rejected_stage: 'semantic'` 分支零覆盖。演进链：零调用方（B5 原状）→ 接上调用方 → 调用方无人校验。已派 task #14 给 pipeline-fix，含 SCHEMA/manifest 两步同样核查与孤儿 fixture `dispatch-pipeline-stub.c`（无引用）去向。
- **审计断言经主 Agent 复验成立，我的首个否证探针自己是空转的**。我曾读出「scope_version: 7 与未注册 artifact_refs 均被 `SEMANTIC_INVALID` 拒绝」，据此准备推翻审计的 I2/C06 写入路径真空结论。实为探针的 `STEP_PLANNED` 缺 `payload.kind`，三条输入（含本该通过的控制组）被同一条 `payload_complete` 拒绝，我把「payload 不合法」误读成「不变量生效」。补 `kind` 且**把控制组放在第一条**后：控制组 ACCEPTED，`scope_version: 7` ACCEPTED 且落盘（`scope=7`），`artifact_refs: ['a-NEVERREG']` ACCEPTED 且落盘。根因复核无误：`appendEvent` 只传 `taskId`/`expectedSeq`/`expectedSegment`，全仓零调用方传 `semanticContext`，故 `knownArtifactIds`/`knownEventIds` 恒为空、`currentScopeVersion` 恒 undefined，三处检查恒短路。
- **方法论：任何「不变量已生效」的判定必须先跑控制组**。这与 `stub-backend-rejection.test.mjs` 的 control 用例是同一条规则，只是我在临时探针上没执行——空转不只发生在测试文件里，也发生在用来验证测试的探针里。规则升级为：断言 X 被拒绝时，必须同时证明「去掉 X 后同一输入被接受」，否则拒绝理由可能与 X 无关。这是本任务第三次撞上「验证工具自身未被验证」（前两次：变异脚本静默 no-op、条件 skip 计为 pass）。
- **方法论：变异脚本本身必须自检「文件真的变了」**。docs-wiring 两次撞上无效变异——插入行执行不到、缩进不匹配致 replace 静默 no-op 却打印 "applied"，差点把「变异未执行」误报成「约束已被守住」。只校验 needle 存在不够，须比对替换前后内容，相同即 void。这是同一缺陷类在工具层的形态：变异验证本身需要变异验证。
- **变异结论绑定被测代码版本**：产品代码被 B4/B5 重写后 docs-wiring 主动作废旧变异证据并全部重跑（`worker_output_not_json` 从 171 行移到 392 行），这是正确处理。
- **独立审查结论：不可交付**，5 项阻塞 + 13 项非阻塞（`artifacts/independent-review.md`）。承重不变量大部分真被强制（clean-context 硬阻塞、spawn 前预算门禁、路径收敛、测试无 mock），故为修补而非重做。
  - B5：`dispatch.md` §3 承诺的管线只实现一半——SCHEMA VALIDATE / SEMANTIC VALIDATE / MANIFEST 登记三步缺失，`validateWorkerOutput()` 与 `registerManifest()` 零生产调用方。后果：`DISCOVER` worker 宣布判据满足这类语义越权结果被当作 SUCCEEDED 接受并污染台账。**审查对此的定性「无 CLI 入口、控制循环无法推进」经复核不成立**：主 Agent 即粘合层，`control-loop.md` §3 明确分派各模块，scripts/ 与 lib/ 零 import 是设计使然。
  - B4：`stdout += chunk` 逐块解码，跨块拆断多字节 UTF-8 → raw 内容、raw_bytes、sha256 三者同时错；sha256 是证据完整性根基。另 stdout 无上限。
  - B1：崩溃残留行致 `readAllEvents()` 永久抛错，恢复保证失效。
  - B2：`writeCheckpoint()` 可手写 `{TERMINAL, DONE}` 落盘，G5（outcome 只能由 `deriveOutcome()` 产生）未被机械强制。
  - B3：`artifactIndex` 为空时短路跳过证据检查 → 假 DONE 且 `blocking_reasons: []`。B2/B3 恰好让 V2 的核心主张「DONE 由台账推导而非叙述宣布」失效。
- **「声明了却无人校验」缺陷类的第三、四次变形**：前两次声明在常量里（SKILL_MD、RECOVERY_TOTAL），B5 的声明在协议文档里（协议要求的步骤无调用方）。384 项测试全绿挡不住 5 项阻塞，根因是测试全在验零件，无一项验「管线按协议装齐」。审查另指出 B3 的现有 I5 测试仅因 fixture 恰好提供非空索引而通过——测试给出虚假信心的实例。已派空转测试审计（`artifacts/vacuous-test-audit.md`）系统性排查该缺陷类。

- **CI 目录形式陷阱已核实不影响本仓**：v2-review 报 `node --test tests/` 在 Node 24 上只发现 0 用例并报 1 fail。实测 `scripts/run-tests.mjs` 已用显式文件列表 spawn（注释亦已说明 Node 18 不认 glob、Node 22+ 拒绝目录 positional），且 `files.length === 0` 时 `exit(1)`。发现量核对：磁盘 21 个 `.test.mjs`，runner 报 21，全仓仅 v2 有 tests/（根 `tests/` 确不存在，正是当初改入口的原因）。
- **「声明了却无人校验」第十个位置（已记录，未派修）**：`run-tests.mjs` 唯一失败条件是 `files.length === 0`，**发现量本身无哨兵**。将来某 skill 新增 tests/ 而因目录名或扩展名不匹配被 glob 漏掉，runner 会照常绿灯少跑。v2 单 skill 下不可触发，故不属本次阻塞范围。另注：过滤器参数 `auto-goal-v2` 与不加过滤器结果相同（均 21），因当前只有一个 skill 有测试，非过滤器缺陷。

- **I10 扩容完成，我的判断被部分纠正**：`protocols/runtime/` 的 11 个模块**已被** `tests/control-cohesion.test.mjs:56` 覆盖（acceptance-trace 注入 bare import 实测会红），不是缺口——我此前把它与 kernel 那条混为一谈。真实缺口只是 `scripts/` 的 3 个模块两侧都没扫，但更要紧：`scripts/` 是唯一 spawn 子进程、唯一写文件、唯一处理不可信 objective 文本的一层。实测 `scripts/ingest-audit.mjs` 加 `import chalk`、加能解析的逃逸 import（`src/core/constants.js` 取真实导出）均 402 全绿。修法按根因：删掉 `RUNTIME_DIRS` 白名单改为遍历磁盘，并加防回缩测试（扫描触达目录集须**恰好等于** `EXPECTED_RUNTIME_DIRS`）。手工维护「该检查什么」的清单本身就是无人校验的声明——这与 A02 硬编码模块清单漏掉 `lib/recovery.mjs` 是同一根因第二次发作。6 次变异全被捕获，扩容后未发现真实违规 import。
- **跨层常量漂移已收口**：实测漂移当时确实无人拦（`LAUNCH_BUDGET_BYTES` 16→64 KiB、`ENVELOPE_BUDGET_BYTES` 1→8 KiB、claim/ref 上限 3/4→30/40 均 402 全绿；仅 400 字节改宽被一条既有 UTF-8 用例顺带抓到）。8 条断言 + **双向**变异 16 次全捕获（`lib/` 侧 8 次 + `scripts/`/schema 侧 8 次）。其中三条不钉字面量而驱动真实行为：启动门禁在预算处接受/超一字节拒绝、`projectEnvelope()` 对 ASCII 输入裁剪精确等于 `WORKER_SUMMARY`（并断言未过度裁剪，故反向漂移也抓）、claim/ref 上限由实际投影结果得出。schema 侧第三份拷贝一并钉住。
- **node:test 的第三条假绿通道：`{todo}`**。acceptance-trace 初版用 `test(name, {todo}, fn)` 标记 `ARTIFACT_SLICE_TOTAL` 债务绊线，自查发现 todo 用例**断言失败也不计入 fail、不影响退出码**，等于造了个不可能失败的绊线。我已独立复现确证：断言真失败、堆栈全打、**exit code 0**。三条通道同源（提前 return 计为 pass、条件 skip 不可观测、`{todo}` 吞掉失败），共性是「node:test 提供的表达债务/跳过的语法，默认不产生可观测失败」。已扫全仓：无 `{todo}` 用例、无提前 return 式跳过，两处 grep 命中均为记录教训的注释。规则：条件跳过只能用注册期 `{skip}`，债务绊线必须用普通 `test()`。
- **第十一个实例，且是「协议声明的对象从未被构造」这一新形态**：`dispatch.md` §2 表格声明「input envelope JSON / 2 KiB / `DISPATCH_REJECTED`」，但 `SCHEMA_IDS.WORKER_INPUT` 在 `lib/`+`scripts/`+`protocols/runtime/` **零处 `getSchema()`**（全部引用在 `tests/`），`dispatchWorker({objective: string})` 直接 `child.stdin.write(objective)`（dispatch-worker.mjs:255）。故 `BUDGETS.WORKER_INPUT_ENVELOPE`(2 KiB) **不是缺门禁，是缺被门禁的对象**。漏区实测：总载荷 2200 B 过 16 KiB 总门，objective 单独 1900 B 已超 schema 声明的 400 B。比 B5 深一层（B5 是函数无调用方，此项是对象类型从未存在）。已建 task #16 派 pipeline-fix，要求二选一并给理由：构造真实 envelope（协议原意）或三处一致地删除声明（诚实降级），**不得只补门禁**。
- **`ARTIFACT_SLICE_TOTAL` 已加绊线**：`lib/artifacts.mjs` 一旦导出名字含 slice 的函数即失败（注入 `readArtifactSlice` → 1 fail、exit 1），切片功能未实现，预留状态被机械看守。

- **M22/M25 已死，且协同漂移亦被堵住（主 Agent 隔离副本实测）**：基线已从审计的 407 涨到 **449 tests / 444 pass / 0 fail / 5 skipped** 且仍在变动（多个 Agent 并发加测试），故审计报告里的变异结论**不能当当前状态读**。M25 被两条杀（`the dispatch layer gates on the same launch budget...` 钉常量 + `the launch gate rejects at the kernel budget, one byte over and not before` 驱动真实门禁）；M22 只被那条相等断言杀，故我追测了**两侧协同改宽**（`ENVELOPE_BUDGET_BYTES` 与 `BUDGETS.WORKER_OUTPUT_ENVELOPE` 同时 →100 KiB），仍被 `budget constants match the design table` 抓住——「跨层相等」单独存在时可被协同绕过，是设计值哨兵兜住了它。全部变异均比对替换前后内容自检非 no-op。
- **审计报告本身成为「声明了却无人校验」的第十二个载体**：它是 #14/#15/归档三处的输入，却带着过时基线与已失效的存活结论。已批准 acceptance-trace 在其中追加带日期的更正节（选项 1 而非只在 context.md 记录），理由即此：把更正藏在别处，后续 Agent 仍会把报告当权威读。更正须写明四点——407 作废且当前值仍在变动、M22/M25 已死及杀手测试名、其余 10 条结论悬置（M24/M28/M39/M40 靶点全在正被重写的 `lib/ledger.mjs`/`lib/journal.mjs`/`scripts/dispatch-worker.mjs`）、**no-op 变异必然报「存活」故存活结论可信度低于杀死结论**。

- **「验证工具自身未被验证」第四次,这次是审计工具本身**:v2-review 首轮复验用「`fail > 0` 即杀死」,得出 M22/M25/M28/M29/M39 全部被杀——错的。仓库正被并发编辑,快照多次落在半写状态(先后测得 428/439/443/444/448),其中一次撞上 `kernel-recovery.test.mjs` 真实红灯:**B2 门禁 02:44 落地、该测试 02:46 才跟上,副本正取在这两分钟里**。它自己发现并改为**同快照配对判定**(复制两份、一变异一不变异、按失败测试名的集合差归因)+ 双向自证(重命名 `canonicalize` 须 KILLED、纯注释改动须 SURVIVED)+ `VOID-MUTATION` 出口。**经验:任何跨时间的测试计数比较都不可作为归因依据,必须同快照配对。**
- **第三次落在半写状态,且这次配对判定也挡不住**:v2-review 第二轮报「M24 仍开口」,实为 vacuous-fix 正在修——`tests/fixtures/argv-echo-stub.c` 建于 02:47(其交付前 12 分钟)且尚无测试引用。配对能排除「测试自己红」,排不掉「修复方刚把靶点改了」。补一条前置:变异前后记录被测文件与 `tests/` 的 mtime,期间有变动则结论须标注绑定代码版本或作废。已派 v2-review 写 `artifacts/mutation-methodology.md` 固化这五条判据。
- **I2/C06 写入路径真空经第三次核实仍成立,已升为阻塞并派 task #18**:`semanticContext` 在 `lib/`+`scripts/`+`protocols/` 零外部调用方(journal.mjs:364 取自 options、:410 展开),三处检查恒短路。控制组先行探针两次独立复现:CONTROL ACCEPTED → `scope_version: 7` ACCEPTED 落盘 → `artifact_refs:['a-NEVERREG']` ACCEPTED 落盘。**修法定为按根因:`appendEvent` 自己从 journal 派生 `knownArtifactIds`/`knownEventIds`/`currentScopeVersion`,禁止在调用方补参数**——让每个调用方记得传就是又一份手工维护的声明,与 `RUNTIME_DIRS` 白名单、A02 硬编码模块清单同根因。

- **F1/F2 已闭环,主 Agent 在无 backend 环境亲自复验**(前提先自证 `resolveBackend() === NULL`):`tests/backend-isolation.test.mjs` 14 项 → `pass 13 / fail 0 / skipped 1 / exit 0`,且那条 skip 在 TAP 里**可见**(`﹣ ... # no clean-context backend installed on this machine`)。CI 九个 job 的红灯根因消除。F1 修法正确——不再依赖机器装了什么,而是注入 `ACE_CLAUDE_BIN: process.execPath`(每平台都存在的原生二进制)使 backend 解析确定成功,再让预算门在 spawn 前拒绝,并**前置断言注入的 backend 真能解析**。F2 改为模块加载期解析 + 注册期 `{skip}`,并新增一条机器无关的另一半(真造出存在的 `claude.cmd` 须被拒),因为原断言只由「路径不存在」证明,而不存在的路径任何 `isFile` 都会拒。
- **CI env 接线判决:结构性等价强于取值判断**。`${{ matrix.os == 'windows-latest' && '0' || '1' }}` 的正确性表面上压在「字符串 `'0'` 在 GHA 里是否 truthy」(官方文档答不了——其 falsy 清单里的 `0` 是数字;docs-wiring 取 `actions/runner` 实现判决:字符串仅空串 falsy,且 `And`/`Or` 返回操作数原值不 coerce)。但更强的支点与 GHA 语义无关:该变量**唯一读者**是 `stub-backend-rejection.test.mjs:100` 的 `=== '1'` 严格比较。主 Agent 六值实测(无编译器环境):未置位/`'0'`/`''`/`'true'`/`'01'` 全部 `8 tests / 0 pass / 8 skipped / exit 0` 逐列相同,仅精确 `'1'` → `1 fail / exit 1` 且点名缺编译器。故**即使我对 GHA 求值语义判断错了,windows 那格也只会在 falsy 值之间漂移,行为不变;唯一会翻车的是意外产生精确 `'1'`,而那会红不会静默**。这是「让正确性不依赖需要查文档才能确定的语义」的一个正面实例。
- **docs-wiring 差点误报的一格**:首轮「有编译器 + `'0'`」读出 `0 pass / 8 skipped`,形式上像 `'0'` 真有语义;加跑 23 次全部 `8 pass / 0 skipped` 且无一次出现编译失败字样 ⇒ 单次 flake,疑为并发 sub-agent 争抢资源。**与控制组规则同源:单次观测不足以支撑因果,跨格差异必须可复现才算差异。** 若只跑一格收尾,会让人去改一段本来正确的接线。
- **`diff -r` 必须看差异方向**:docs-wiring 报 `journal-append.test.mjs` 有差异,方向是仓库比其副本**多**两个用例(B1 修复方并发新增的 `a bad first line is an error too` 及其 control),非污染。

- **归属纠正:那条 schema 测试是 acceptance-trace 任务 12 的产物,不是 pipeline-fix 的**。我据文件位置与依赖面裁定:它紧邻同批的 `the worker-input schema caps the objective at the summary budget`,只 import `getSchema` + `BUDGETS`(即把 schema 钉在内核声明上),正是任务 12「跨层数值一致性」的形状;pipeline-fix 做 #16 会在 `scripts/` 构造 envelope,不会往 `kernel-layer-consistency.test.mjs` 加钉 schema 的断言。我先前的说法错了,报告里那句「非原有测试」的注明须撤。**顺带核实 #16 仍未落地**:`SCHEMA_IDS.WORKER_INPUT` 在 `lib/`+`scripts/`+`protocols/` 仍零 `getSchema()`,声明的对象依然从未被构造。
- **自检当场救回一个与真相相反的结论**:acceptance-trace 按 `WORKER_OUTPUT_ENVELOPE: 1 * 1024` 构造 needle,而真实文本是 `1 * KIB,`,`VOID-MUTATION: needle absent` 挡下。若无这道自检,lib 侧半边不会落地、`fail 2` 全来自 `scripts/` 单侧,「协同漂移未被拦住」会被写成「已被拦住」。由此定出**证据不对称**:杀死是阳性证据(有测试红了且已归因),存活是阴性证据(有「变异没落地」与「变异落在死代码上」两个非缺陷解释)。
- **弱断言的正面价值**:原报告把 `budget constants match the design table` 定性为「保护常量值不变,不是保护常量被用作门禁」,语气偏贬。实测表明正是这条「弱」断言拦住了强断言(跨层相等)拦不住的协同漂移。两类断言职责不同,必须**配对**使用:跨层相等防单侧漂移,设计值哨兵防协同漂移。
- **基线共测到五个数字(407 / 444 / 449 / 451 / 452)**,分别来自不同时点。三个 Agent 并发补测,任何单一数字都是过期的;报告已在开头加醒目提示要求自建基线,因为后续 Agent 很可能只读前几节。

- **B2 门禁经双向变异确认有牙(主 Agent 亲自测,配对隔离快照)**:`writeCheckpoint()` 新增 `assertDerivedFromJournal()`,比对**整文档 canonical hash** 而非只比 `outcome`——只比判据会让伪造平移一格到 `ledger_counts`/`phase`/`residual_count`,而这些都是主 Agent 读来决策的字段,只有整文档比对收敛。摘除门禁 ⇒ 杀 3 项伪造用例(伪造 TERMINAL/DONE、虚增 ledger_counts、空 journal);门禁改无条件抛 ⇒ 杀 4 项,**含控制正例** `control: writeCheckpoint accepts exactly what reduceCheckpoint produced`。两个方向都成立才说明这组断言既挡得住伪造、也没造出一个无条件拒绝的写入面。判定期间源文件 mtime 03:02/03:03、快照 03:14,无并发写入污染。附带发现待查:`writeCheckpoint` 在 `lib/`+`scripts/` 内**零调用方**,疑似只由协议文档指示 Agent 调用,需确认是设计如此还是接线缺失。
- **「改测试写入通道算不算后门」判为不算,但判据不是它的自述**:`kernel-recovery.test.mjs` 那条故意坏 cursor 的用例改用 `writeFileAtomic` 在文件层植入。三条独立证据:(a) `writeFileAtomic` 有两个**产品**调用方(`lib/artifacts.mjs:101/118`),不是为可测性新增的导出;(b) 同目录测试早已用 `node:fs` 的 `writeFileSync` 做同类文件层植入(`journal-append.test.mjs` 七处、`kernel-recovery.test.mjs:273`),即测试**不需要任何产品导出**就能做这件事,所以它不构成新增的绕过路径;(c) 决定性的一条——摘除 `lib/recovery.mjs` 的 I7 判据 `verifyCursor(taskRoot, stored.source_cursor).valid` ⇒ 该用例**精确单点变红**(17 项中仅它 1 项),证明它验的确实是 I7 而非被绕过的 I1。「用了哪个写入函数」是错的提问,「改了通道后还挂在原不变量上吗」才是。
- **kernel-fix 报的「C05 疑似 flaky」实测不是 flaky,是另一个 Agent 的半写快照,而我自己先误判了一次原因**:孤立重跑该文件 20 次全绿;加 12 路 CPU 饱和后 12/12 全红,我据此一度写下「负载相关竞态」并已开始查 `dispatch-worker.mjs` 用 `child.on('exit')` 而非 `'close'`(该处确实违反 Node 契约,`exit` 不保证 stdout 已排空,记为待修的真实隐患,但**实测 400 次 4 KiB + 120 次 512 KiB 并发均测不出差异,不是本次红的原因**)。真因由一次性探针直连 `dispatchWorker` 拿到:`DISPATCH_REJECTED / worker_input_schema_invalid`,`input_violations` 点名 `task_id`(undefined)与 `role`(**null**,与 undefined 不同类,说明是被显式传成 null),`launched:false`、`rejected_stage:'input_schema'`。即 pipeline-fix 在我压测那几分钟落地了 #16 的 worker input envelope,新必填字段无人提供,**所有 dispatch 在 launch 前一站被拦**。爆炸半径 28 项(不是 kernel-fix 看到的 1 项、也不是 C05 的 7 项):`tests 466 / pass 433 / fail 28 / skipped 5`,含我在 #17 刚修绿的 #46、pipeline-fix 自己的 argv-integrity + B4 + B5 全族(#104–124)、C05 全族(#460–466)。**方法论教训:CPU 负载与代码落盘在时间上重合,负载是我加的、因此显眼,mtime 才是真凭据;先看 mtime 再归因于并发。**「重跑 N 次全绿」只能排除随机性,不能排除「N 次都在同一个半写快照的同一侧」。
- **给 pipeline-fix 的收口判据已下达,重点是别让修复毁掉证据**:C05 控制正例现在红着**是好事**——它红证明它没空转。因此判据不是「7 项 C05 变绿」,而是**控制正例绿 + 6 项拒绝用例仍红在 `RESULT_REJECTED` 上**;若把 input schema 放宽到什么都放过,7 项也会全绿而 C05 就白测了。另两条:`task_id` 禁止从参数补(那正是 #16 明令禁止的手工维护声明形状),`dispatchWorker` 已有 `taskRoot`,应从 task root 自身派生;`role` 需定合法默认或改全部调用方,二选一并写明理由。
- **新缺陷类「现象为真,归因为假」,与本轮主线反向,已定为判据 D6 MECHANISM**:docs-wiring 报 `dispatch-argv-integrity.test.mjs:99` 偶发单红,归因写「并发编译同一 stub 二进制的资源竞争」。**该机制不成立**——两套用不同源文件(`argv-echo-stub.c` vs `stub-backend.c`)、各自 `mkdtemp` 私有目录,不共享任何编译产物,唯一相同的是输出**文件名**(`claude.exe`,resolver 强制)。而**现象本身是真的**:我同进程跑两套第 1 轮即复现 1 fail,随后同进程 14 轮 + 带两路并发竞争 10 轮共 30 轮全绿。低频真事件 + 假机制。此前所有判据(D1–D5、配对判定、存活/被杀不对称)都在防「把噪声当信号」与「把未执行当已通过」,**这一条是反方向的**。三步归因(单独跑 / 绕过自己改动跑 / 复跑)能回答「是不是我引入的」,回答不了「是什么引入的」——前者靠对照即可,后者需要独立于「现象消失」的证据:读源码确认该机制前提成立,或构造该机制的最小复现。危险在于**报告里写下的机制会被后来者当既有事实引用**,下一个人去修一个不存在的共享二进制而真因仍在;低频事件尤其危险,它在任何一次修改后都很可能「恰好没了」,于是假机制拿到一次伪确认。**「改了 X 之后现象没了」证明不了「现象由 X 引起」。**已开任务 #20 查真因(候选:同名文件被外部程序按名加锁 / gcc 中间文件 / 与 #19 的 `exit` 不保证 stdout 排空同源——argv 套件依赖子进程把 argv 写进 raw artifact,最吃这个),并明令禁止「重跑变绿即记为已解决」。
- **两位 peer 报 0 fail 与我实测 28→14 fail 并不矛盾,但暴露了报告写法的缺陷**:v2-review 与 docs-wiring 各自报 `466 / 461 pass / 0 fail`,那是 03:20 pipeline-fix 落盘**之前**窗口的真实读数。03:20(#16 worker input envelope 落地)→ 28 fail;03:29(其收口 `task_id`/`role`)→ 14 fail,C05 全族 7 项、argv-integrity #104–107、#46 全部回绿,`launched` 恢复 true;剩 14 项全在 `tests/dispatch-pipeline.test.mjs`,单一根因 `ReferenceError: replyFiles is not defined`——第五次半写快照,已按惯例不归因不触碰。**结论:报告里写测试计数必须带时刻**,否则下一个读者会把历史读数当现状;这也是「基线唯一合法来源是同一快照的 control 组当场跑出来的那一份」的又一次实证。
- **B5 控制正例的判据尚未真正被检验**:失败清单含 `#113 B5 control: a well-formed, in-authority result is accepted end to end`,但它红于 `ReferenceError`(整文件起不来)而非断言失败,所以「控制正例必须绿」这条判据一次都没被执行过。已要求 pipeline-fix 修完后单独确认:**#113 绿 且 #114–118 五条 SEMANTIC 拒绝用例仍拒**;若 14 项一起变绿,说明拒绝路径可能被放宽,那才是危险形态。
- **F1，第一项「测试依赖机器上恰好装了什么」的阻塞缺陷：CI 现在九个 job 全红，而我们一路看的绿灯是偶然的那一侧。** `tests/backend-isolation.test.mjs:162` 的 `C02/C03: over-budget dispatch` 未传 `env`（默认 `process.env`），断言 `reason === 'launch_payload_over_budget'`；但 `dispatch-worker.mjs` 先解析 backend(:193) 再查预算门(:209)，无 backend 时先返回 `no_clean_context_backend`。CI runner 不装 Claude CLI 故必败，与 `ACE_REQUIRE_STUB_BACKEND` 无关（docs-wiring 三环境实测：类 ubuntu 428 pass/1 fail/exit 1、类 windows 420 pass/1 fail/exit 1、本机 429 pass/0 fail/exit 0）。主 Agent 已复现：`actual: 'no_clean_context_backend'` / `expected: 'launch_payload_over_budget'`，EXIT=1。已派 task #17。
- **复现 F1 时我第四次栽在「没验前提就读结论」上**：先试 `PATH=$NODEDIR` + `env -u CLAUDE_CODE_EXECPATH ACE_CLAUDE_BIN`，得 exit=0，差点判定 F1 不成立。实测 `resolveBackend` **仍非 null**——claude.exe 装在 node 安装目录的 `node_modules/@anthropic-ai/claude-code/bin/` 下，PATH 清不掉它。改为「temp 目录只放一个 node.exe 当 PATH」并**先断言 `resolveBackend() === NULL` 才跑测试**，F1 立刻复现。`backend-resolve.mjs:40-51` 的候选链有三个来源（`ACE_CLAUDE_BIN` → `PATH` 各扩展名 → `CLAUDE_CODE_EXECPATH` 兜底），任何要复现「无 backend」的测试都必须同时控制三者并自证前提。
- **F2：「提前 return 冒充 skip」第二处实例**，`tests/backend-isolation.test.mjs:73` 的 `if (resolved === null) return;` 后跟**唯一**一条断言。CI 上 `resolved` 恒 null → 断言一次不执行却报 `ok`、`skipped` 恒 0，输出与执行过时完全一致。与 C05 修复前同一形态、同一文件层面。
- **F3/F4：测试入口不假绿，但发现面静默收缩**（与主 Agent 早先独立记录的「第十个位置」是同一件事，docs-wiring 实测到了具体形态）。退出码在所有实测路径忠实传播（用例 throw、import 期抛错、异步漏 await、空发现、拼错过滤器、spawn 失败、SIGKILL，Node 20/24 全 exit 1，`?? 1` 兜底方向正确）。但发现面无下限守护：%TEMP% 造 9 个测试文件只发现 3 个，未被发现的 6 个塞满 `throw` 仍 `exit=0`——`*.spec.mjs`/`*_test.mjs`/`*.test.ts`/`__tests__/`/单数 `test/` 一律静默漏；清空文件成 0 用例 → 绿、退 0；整个 skill 的 `tests/` 改名 → `Running 3` 变 `Running 2`、绿、退 0。**「某 skill 测试整体消失」在 CI 上表现为绿灯。** 建议加发现数下限或「含 lib/ 的 skill 必须有 tests/」断言。顺带证实换掉旧入口是对的：`node --test tests/` 在 **Node 20 上目录空时 exit=0 / tests 0**（Node 24 才报 1 fail），版本相关假绿已消除。
- **CI 与发布链路无吞错点**：`ci.yml` 无 `continue-on-error`/`|| true`/`if: always()`，`publish.yml` 是 install → test → publish（测试失败挡发布），矩阵 9 job 各跑全部 21 文件；`package.json` → runner 无 pre/post、无 `&&`/`||`、无 `--if-present`。锁文件漂移风险不成立（`package-lock.json` 被 `.gitignore:8` 忽略且 `git ls-files` 无任何 lock，CI checkout 后无锁文件，`npm ci` 本就用不了）；实证：排除 `node_modules` 复制到 %TEMP% 直接跑得 425/420/0/5、exit 0，与装依赖后逐项相同（21 个测试文件的 import 只有 `node:` 与相对路径）。
- **skip 普查干净**：全仓 434 项只有两个门控（`ACE_LIVE_SPIKE` 5 项、C05 8 项，**均为注册期 skip、可观测、正确**）加一处环境探测（`kernel-artifacts.test.mjs:143` 用 `t.skip()` + 立即 return，写法正确），加上 F2 这一处错的。逐文件对比「顶层 `test(` 声明数」与 TAP 报告数，**21 个文件全部相等**，无用例因写在条件块里而从计数中消失；全仓无恒真断言、无 `process.exit`、无 `.todo`。预防性记录（当前不成立）：测试体内 `process.exit(0)` 会把已失败用例洗成全绿并退 0（Node 20/24 均复现）；`t.skip()` 后继续跑失败断言会打 `not ok` 却计 `fail 0`、退 0。
- **存量债务（非本次范围）**：`"lint": "eslint src/"` 的 eslint 既非 dep 也非 devDep、本机未装、仓库无 eslint 配置，该 script 实际不可执行（CI 不跑 lint 故不影响绿灯）。`src/` 下 14 个 .js **零测试覆盖**——`npm test` 全绿不代表 CLI 本体被验证过。

### 风险
- clean-context backend 不可用: 停止不安全集成，保留已验证内核并报告 BLOCKED。
- Windows/Unix 差异: 使用 Node 标准库并在多平台兼容边界上测试。
- 工作树已有用户改动: 仅修改本任务明确涉及文件，不清理无关变更。
- Node 18 的 `node --test <dir>` 递归行为需实测，必要时使用显式测试文件列表。
- node:test 中「提前 return」与「注册期 skip」语义不同：前者计为 pass。任何条件跳过必须走 `test(name, {skip}, fn)`，否则跳过不可观测。**`{todo}` 是同族第三条假绿通道**：todo 用例断言失败也不计入 fail、退出码仍为 0，故债务绊线必须用普通 `test()`。共性：node:test 提供的表达债务/跳过的语法默认不产生可观测失败。
- 条件覆盖（依赖本机工具链）必须配一个使其硬失败的开关，否则该覆盖在 CI 等价于不存在。
- U01-U03 是模型行为评估；X02-X05 需要真实 capability/transcript，禁止以单元测试替代。
- 恢复期预算若以抛错方式门禁，会让任务永久卡死并与「永不空手而归」冲突；正确行为应为投影到预算内并显式标记省略部分。

### 遗留债务（不属本次交付范围）

- `docs/architecture.md` 的 skill 计数与分类表在 auto-goal-v2 之前即已落后：现写 15，`plugin/skills/` 实有 23 个目录，未进表的有 requirement-understanding、requirement-writing、requirement-review、tech-design、test-case-gen、text-to-image、simple-text-to-image、feishu-doc。校准需单独排项。
- 已安装的 plugin 缓存目录陈旧（同时也缺 feishu-doc），`ace doctor` 因此报 1 项 FAIL。消除需重跑 `ace init` 写用户目录，待用户定夺。

### 集成映射

- 承重接线: `package.json` 测试入口、`src/commands/doctor.js` Skill 检查。
- 发现性接线: `src/core/constants.js`、`src/commands/init.js`、README、skills guide、architecture、getting-started、CHANGELOG。
- 无需修改 CI、plugin manifest 或 installer；安装器会复制整个 `plugin/` 树。
- 集成顺序: V2 自包含实现 → 单点测试接线 → doctor/常量 → 文档。

## 已修改文件

- `.ace/tasks/implement-auto-goal-v2/state.json`: 初始化机器状态。
- `.ace/tasks/implement-auto-goal-v2/context.md`: 初始化任务叙事。
- `plugin/skills/auto-goal-v2/`: V2 全部实现（78 文件，零新增第三方依赖）。
- `package.json`: 测试入口改为 `node scripts/run-tests.mjs`（覆盖根 tests/ 与各 skill tests/）。
- `scripts/run-tests.mjs`: 新增跨 Node 版本的测试发现器。
- `src/commands/doctor.js`、`src/core/constants.js`、`src/commands/init.js`: 承重接线，加入 auto-goal-v2。
- `README.md`、`docs/skills-guide.md`、`docs/architecture.md`、`docs/getting-started.md`、`CHANGELOG.md`: 发现性接线。
- `plugin/skills/auto-goal-v2/SKILL.md`: 压缩正文 6325 → 6125 字节以落入自声明的 6 KiB 预算（不调大预算迁就现实）。
- `plugin/skills/auto-goal-v2/tests/kernel-cohesion.test.mjs`: 新增 SKILL.md 预算门禁（直接量磁盘真实字节，已变异验证）；A02 模块清单改为从磁盘派生。
- `.github/workflows/ci.yml`: 为 `npm test` 接线 `ACE_REQUIRE_STUB_BACKEND`（ubuntu/macOS 置 1 强制 C05，windows 置 0）。
- `plugin/skills/auto-goal-v2/tests/stub-backend-rejection.test.mjs`、`tests/fixtures/stub-backend.c`: C05 离线覆盖（8 用例、注册期 skip、硬失败开关）。
- `plugin/skills/auto-goal-v2/lib/recovery.mjs`、`tests/kernel-recovery.test.mjs`: X05 恢复读取面唯一组装点与 RECOVERY_TOTAL 真门禁。

## 度量工具与实测读数（`.ace/` 内，非交付物）

审查期新增三个探针，均在 `.ace/tasks/implement-auto-goal-v2/artifacts/`，可复用：

- `tree-snapshot.mjs` — 读取面窗口守护。`--run <cmd>` 开窗关窗，`--verify <digest>` 判定"我正在读的树是否就是产生该读数的树"。**判决三态**：`INTACT`（字节与 mtime 皆未动）/ `TOUCHED`（字节未动、仅 mtime 移动 → 内容面读数可引，**时序面读数须重取**，因窗口期内有他者活动即负载源）/ `VIOLATED`（字节已变 → 读数 VOID）。
- `verify-read-window.mjs` — 上者的变异 harness，11 例全部 PASSED-AND-SENSITIVE，每例配各自的杀手变异（无豁免项，故任何 VACUOUS 都是真洞）。V10/V11 在同一分支两侧互斥（`if(false)` / `if(true)` 各杀一个），故该分支两个方向都不可能空转。
- `probe-detach-headroom.cjs` — 量进程派生延迟对 `CLOSE_GRACE_MS` 隐含上限的余量。
- `probe-fullsuite-flake.cjs` — 全套复现率 + 逐条命名失败断言（跳过 Node 的文件级汇总行，否则多个成因会被归进同一个路径形状的桶）。
- `probe-usn-distinguish.cjs` — 读 NTFS 卷变更日志的 `Reason` 位，回答"谁动了这个文件、动的是字节还是仅时间戳"。按 FileRef# 而非文件名过滤（变异 harness 都 `cpSync` 整树到 tmpdir，同名副本极多）；不按标签文本匹配（`fsutil` 标签本地化，按文本匹配的探针在非英文机器上会报"无证据"）。

**detach 延迟实测**（守护窗口下两轮，皆 `all-89:55112845db30` / `WINDOW INTACT`）：静置 n=30 → p50 59 / max 183 ms；6 路 CPU 满载 n=40 → p50 80 / max 221 ms。据此 `detach < 1800ms`（`CLOSE_GRACE_MS - 写偏移`，一个无人守护的边界）负载态余量 1579ms，需 8.1x 劣化才破 —— 故 ghost deadline 的 `raw_bytes==0` **不由该边界解释**，另有机制。

**`SKILL.md` mtime 归因（成因未定，内容确定未变 —— 不要当已解决引用）**：全部 11 个快照中 `SKILL.md` 的 hash 恒为 `71244ccd19586f41`、size 恒 6125，**内容面从未变过**；mtime 被改写 **5 次**（01:46:21、05:16:01、05:24:07、05:24:22、06:00:35 本地）。

成因只对最后 1 次有据：卷日志最早记录为 `05:44:35` 本地（`fsutil usn readjournal D: startusn=0`），**前 4 次落在日志覆盖之外，无记录可查**。06:00 那次读到两对 `BASIC_INFO_CHANGE`、零 `DATA_*` 位，故该次为零字节 touch。**净剩结论：1 次已判定为纯 touch，4 次成因未知。**

两条已撤回的错误推断，保留于此以免重犯：
- ~~「mtime 全部整毫秒 ⟹ 写入者是 `utimesSync(new Date)`」~~ —— **双向皆漏**。5 个戳里只有 1 个是整毫秒（另 4 个小数为 `.4414/.8108/.3752/.8384`，我当初截断了小数位才误以为全整）；且 `utimesSync` 传浮点秒实测产生亚毫秒（`…441.4`），故整毫秒既非该调用的必要条件也非充分条件。「`new Date` 只有整毫秒分辨率」是关于**实参**的事实，不是关于**调用者**的事实。
- ~~「采样面内存在一个未定位的 touch 源，且它不改字节」~~ —— 后半句只对 1 次有据。

**教训（比归因本身重要）**：`SKILL.md` 内容面从未变过，所以无论成因为何，对「机制可引」零影响 —— 此处不值得继续投入。**错误的闭合比公开的未知更贵**：一个未经证伪的线索被下游当作前提，比一个明确的「不知道」更危险，因为它会被当成已解决。本条归因链就是这样建起来的：上游报了一个只看了 1 个样本的形态线索，我未验证即接为前提，建成一整条链并写进本文件。

**教训（工具自身缺陷，已修）**：`--verify` 从一开始就把纯 touch 判 `INTACT (bytes)`，而 `--run` 只比带 mtime 的 digest，对同一事件判 `VOID` —— 同一工具两个判决，且 `snapshot()` 早已算出 `contentDigest`，信息在手却未用。因此丢弃了两次本来有效的时序读数。**窗口是检测器，不是协调机制**：它只能告知读数已脏，无法阻止任何人写入；把它当协调机制使用，即要求它承担它不承担的职能。

