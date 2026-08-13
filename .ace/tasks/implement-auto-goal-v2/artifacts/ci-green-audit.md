# CI 与测试入口的「假绿」审计

审计人：docs-wiring（只读 + %TEMP% 实验；唯一例外是本轮按派工修改了 `scripts/run-tests.mjs`，见 3.6）
日期：2026-08-13
被审对象：`scripts/run-tests.mjs`、`package.json`、`.github/workflows/ci.yml`、`.github/workflows/publish.yml`、全仓 `tests/`
本机 Node：v24.13.0；另用本机 v20.12.0 复测（v18 本机不可用，见「未能核查项」）

---

## 结论一句话

**测试入口本身不会假绿**——退出码在所有实测路径上都忠实传播，空发现报失败；**发现面静默收缩这一项（F3/F4）本轮已修并经 7 项变异验证**（3.6），`ci.yml` 的 `ACE_REQUIRE_STUB_BACKEND` 三元接线经审计成立、无需改动（F9 / 3.5）。原查出的 F1（`C02/C03` 在无 `claude` 机器上失败）与 F2（`backend-isolation.test.mjs:73` 第二处假 skip）已由他人修完并经 team-lead 在无 backend 环境复验闭环。

**留在观测层的一项已收口**：`dispatch-argv-integrity.test.mjs:102` 的低频单红，**机制已定（D6 第三档，3.6.4）**：并发 spawn 刚编译出的原生可执行文件时，Windows 以约 0.6%–0.8% 的比率返回映像加载失败（`0xC0000043` / `0xC0000142`），子进程零字节输出，前提断言随之为假。**与 dispatcher 无关**——裸 `child_process.spawn` 在无任何产品代码参与时给出同样比率与同样两个 NTSTATUS。我先前写的机制「并发编译同一 stub 二进制」前提不成立、已作废；**该族归因本轮被第四次否证，第四次是本探针自己提出的版本**。

**观测层新开一项，未收口**：`dispatch-pipeline.test.mjs` 在完整窗口内以约 2/25 的比率出现 `parse` 阶段单红，**红点在不同断言间迁移**，同文件单跑 0/10。**成因未查明（D6 第二档）**，已初步排除 #20 的映像加载机制（形态不符：`exit=0` + 非零 `raw_bytes`）。最小复现与插桩手段见 3.6.5 第八节。**该项同时是「窗口完整 ≠ 读数确定」在本机的确认证据**（3.6.5 第七节）。

**所有计数只对其标注时刻**且**只对通过 D7 窗口完整性判定的读数**成立——并发方仍在增删测试，总项数已从 407 变到 489，且未经窗口判定的读数（含我此前的 19:42 那格）一律作废，见 3.6.1。

**引用本报告数字与机制时的五条纪律**（均为本轮实测所得，非推论）：

1. **窗口完整 ≠ 读数确定（本机已确认，21:52Z）。** D7 排除「被测对象在测量期间变了」，逻辑上排除不了「被测对象本身不确定」。**修后守护（89 文件）上 25 轮全量、窗口全 INTACT、digest 恒为 `all-89:891c21fa1bf6`，`dispatch-pipeline` 出现 2 次单红，且红点在两个不同断言间迁移**——这是该命题所需的证据形态（3.6.5 第七节）。我原先引作证据的那组漂移（`3ee4f8e4a2ec` 上 2/3、`dba55fc8227c` 上 3/3/4）另有更简单的解释（当时守护只看 46 文件），**那组数据仍不引用**；此条现在靠新数据成立，不靠旧数据。**频率约 8%，故四轮全一致不是反证**——重复观测的次数必须与被观测事件的频率相称。该红的成因**未查明**，已排除 #20 机制（初步），见 3.6.5 第八节。
2. **计数可以从已关闭的窗口引用；机制不可以。** 解释红项时读到的源码可能已不是产生该红的源码。用 `tree-snapshot.mjs --verify <digest>` 判定「阅读窗口」（3.6.3）。**本轮实测到一次**：21:13:52Z 对 `42483a4d050e` 执行 `--verify` 报 `READ WINDOW BROKEN`，并点名 `scripts/dispatch-worker.mjs`（28585→29241 字节）与 `tests/dispatch-pipeline.test.mjs` 已被改写——我据此重新按当前树核对了 3.6.4 引用的全部行号。
3. **digest 只在同一采样面内可比，且这条已由工具机制保证、不再依赖读者记性。** 采样面 20:28:56Z 由 46 文件扩为 89 文件。现每个 digest 都带面标注（`all-89:891c21fa1bf6`），跨面声明被 `--verify` 以 `READ WINDOW UNCOMPARABLE`（exit 5）**在比较之前**拒绝（3.6.3 末、3.6.5）。
4. **窗口完整性只能来自窗口内取的快照，不能来自事后回扫。** `find -newermt` 得空集有两种不可区分的读法（窗口内无人写 / 写过又被写一次），且失明随滞后单调增长（0/89 → +3min 1/89 → +6.5min 4/89 → +28min 8/89）。**本报告未引用任何回扫作为窗口证据**——所有窗口判定均出自 `tree-snapshot.mjs --run`，故无需补滞后时长（3.6.5）。
5. **`WINDOW INTACT` 不等于「有读数」，`0/n` 不等于「该格没有该事件」。** 两处都是「形式完整但内容为空」：`--run` 在命令**从未启动**时给出最强的 INTACT（树当然没动）——现按 stdout 字节数三分，零字节印 `THERE IS NO READING HERE`（3.6.5 十）；而低频事件下 `0/n` 可能纯属抽样运气——本报告的 `0/192` 在 0.6% 率下缺席概率 **31.5%**，两格「一格 0 一格 1」的概率 **43.1%**，故**凡引用某格 0 次，必同时给出 n 与该 n 下的缺席概率**（方法论 D5b）。

## 阻塞级 / 需处理清单

| 编号 | 结论 | 严重度 | 归属 |
|---|---|---|---|
| **F1** | `C02/C03: over-budget dispatch does not launch...` 在**无 `claude` 可解析**的机器上**失败**（非跳过）。CI 三平台九个 job 均不装 Claude CLI ⇒ **CI 现在应当是全红的**。 | **阻塞** → **已修**（他人实施；team-lead 在无 backend 环境复验 `pass 13 / fail 0 / skipped 1 / exit 0`） | `tests/backend-isolation.test.mjs:162` |
| **F2** | 「提前 return 冒充 skip」**第二处实例**：`tests/backend-isolation.test.mjs:73`。无 backend 时该用例报 `ok`，与有 backend 时输出完全一致。 | 高（同缺陷类第八个实例） → **已修**（skip 在 TAP 中可见） | 同上 |
| **F3** | 发现面静默收缩：整个 skill 的 `tests/` 改名、或测试文件被清空成 0 用例，`run-tests.mjs` 均**报绿且退出 0**，仅 `Running N test file(s)` 一行数字变化，无断言守护。 | 中 → **已修（3.6）** | `scripts/run-tests.mjs`（本轮由 docs-wiring 实施） |
| **F4** | `.test.` 之外的命名一律不被发现：`*.spec.mjs`、`*_test.mjs`、`*.test.ts` 全部静默跳过；`__tests__/`、单数 `test/` 目录也不在扫描面内。 | 中 → **已修（3.6）** | 同上 |
| **F5** | `node:test` 语义坑：测试体内 `process.exit(0)` 会把**已失败的用例洗成全绿并退出 0**（Node 20 与 24 均复现）。当前仓库无此用法，属预防性记录。 | 低（当前不成立） | — |
| **F6** | `t.skip()` 后若继续执行断言，失败会打印 `not ok` 但**计入 `fail 0` 且退出 0**。当前 `kernel-artifacts.test.mjs:143` 用法正确（skip 后立即 return），属预防性记录。 | 低（当前不成立） | — |
| **F7** | `package-lock.json` **被 `.gitignore` 忽略、未纳入版本控制**，CI 用 `npm install`。锁文件漂移风险存在但**对测试结论无影响**（见第 3 项实证）。 | 低 | team-lead 定夺 |
| **F8** | `npm run lint` 的 `eslint` 既非 dependency 也非 devDependency，本机未安装，且仓库无 eslint 配置文件。CI 未跑 lint，故不影响绿灯；但该 script 实际不可执行。 | 低（存量） | 存量债务 |
| **F9** | `ci.yml:25` 的 `ACE_REQUIRE_STUB_BACKEND` 三元接线**审计通过**：主结论是该变量的全部读者都用严格 `=== '1'`，故任何 falsy 取值行为等价、唯一会翻车的是意外产生精确 `'1'` 而那会红（3.5）；`'0'` 在 GHA 里 truthy 为佐证。无需改动。 | 无问题（已证） | — |
| **F10** | 3.5 主结论的前提「全部读者都是严格 `=== '1'`」原**无门禁**，且危险落点是**假 skip**（有人传 `'true'`/`'yes'`/空串 → 严格读者判假 → CI 静默跳过而非红），不是假强制。 | 中（同缺陷类第九个位置） → **已修（3.6.2）**，两端门禁 + 10 项变异 | `plugin/skills/auto-goal-v2/tests/stub-gate-cohesion.test.mjs` + `tests/ci-stub-gate-wiring.test.mjs`（本轮 docs-wiring 实施） |

---

## 1. `scripts/run-tests.mjs`

### 1.1 发现是否可能静默漏掉某 skill 的 tests/ 或某类文件名 —— **有，且无痕迹（F3/F4）**

在 %TEMP% 造仓库骨架实测（`tests/`、`plugin/skills/{alpha,beta,gamma,delta}`），刻意放入 9 个文件，仅 3 个被发现：

| 放置位置 | 被发现 |
|---|---|
| `tests/a.test.mjs` | 是 |
| `plugin/skills/alpha/tests/b.test.mjs` | 是 |
| `plugin/skills/beta/tests/nested/c.test.mjs` | 是（递归有效） |
| `plugin/skills/alpha/tests/d.spec.mjs` | **否** |
| `plugin/skills/alpha/tests/e_test.mjs` | **否** |
| `plugin/skills/alpha/tests/f.test.ts` | **否** |
| `plugin/skills/gamma/lib/__tests__/g.test.mjs` | **否** |
| `plugin/skills/delta/test/h.test.mjs` | **否**（单数 `test/`） |

原因是 `TEST_FILE_PATTERN = /\.test\.(mjs|cjs|js)$/`（`scripts/run-tests.mjs:21`）与 `testRoots()` 只认 `<skill>/tests`（:24-31）。这**不是缺陷而是约定**，但约定无人校验：未被发现的 6 个文件里我全部塞了 `throw`，仍 `exit=0`。

收缩实验（同一 %TEMP% 仓库）：

| 操作 | 输出 | 退出码 |
|---|---|---|
| 基线 | `Running 3 test file(s)` | 0 |
| 把 `alpha/tests/b.test.mjs` 清空成注释 | `Running 3 test file(s)`、`# tests` 少 1 | **0** |
| 把 `alpha/tests` 改名为 `tests-disabled` | `Running 2 test file(s)` | **0** |

`run-tests.mjs` 只断言 `files.length === 0`（:68），没有任何下限或清单断言（:74 仅打印）。**建议**：加一条「发现文件数不得低于 N」或「每个含 `lib/` 的 skill 必须有 tests/」的断言——否则「某个 skill 的测试整体消失」在 CI 上表现为绿灯。这与本次反复抓到的缺陷类同源：数字打印了，没人校验。

### 1.2 子进程非零退出 / 套件未被发现时退出码是否仍为 0 —— **无此问题**

| 情形 | Node 24 | Node 20 |
|---|---|---|
| 某用例 `throw` | `exit=1`, `fail 1` | `exit=1`, `fail 1` |
| 测试文件在 **import 期**抛错（套件根本没注册） | `exit=1`, `fail 1` | `exit=1`, `fail 1` |
| 异步断言在 `setTimeout` 里失败（fire-and-forget） | `exit=1`, `fail 1` | 未复测 |
| 漏 `await` 的 async 断言助手 | `exit=1`, `fail 1` | 未复测 |
| 空发现（过滤器无匹配） | `exit=1` + `No test files matching ... found` | `exit=1` |
| 拼错过滤器（`alpah`） | `exit=1` | `exit=1` |

退出码链路：`process.exit(result.status ?? 1)`（:85）+ `result.error` 分支（:81-84）。实测 spawn 失败 → `error: true, status: null` → 退出 1；子进程被 SIGKILL → `status: 1` → 退出 1。`?? 1` 的兜底方向正确（未知即失败）。

**唯一能洗白失败的路径是 F5**：测试文件里调 `process.exit(0)`。实测「一个必失败用例 + `process.exit(0)`」→ `tests 4 / pass 4 / fail 0 / exit 0`，Node 20 与 24 行为一致。全仓 `tests/` 无 `process.exit` 用法（已 grep 确认），故当前不成立，作为预防项记录。

### 1.3 空发现是否报成成功 —— **不会**

`files.length === 0` → stderr 输出 + `process.exit(1)`（:68-72）。这一点比历史入口更好：旧入口 `node --test tests/`（`package.json` 改动前）在 **Node 20 上目录存在但为空时 `exit=0 / tests 0`**（实测），只有 Node 24 才报错。换成 `run-tests.mjs` 消除了这个版本相关的假绿。

### 1.4 Node 18/20/22 差异 —— **设计已处理，18 未能本机实证**

文件头（:5-9）声明的理由与实测一致：目录 positional 从 Node 22 起被当 glob 处理，glob positional 在 18 不被理解，故只用显式文件列表。本机 v20.12.0 跑全套：`Running 21 test file(s) with v20.12.0`、`tests 425 / pass 420 / fail 0 / skipped 5`，与 v24 同批次结果一致（同一时刻 v24 为 425/420/0/5）。Node 18 与 22 本机不可用，见「未能核查项」。

## 2. `package.json` → `run-tests.mjs` 链路

`"test": "node scripts/run-tests.mjs"`（`package.json:10`），无 `pretest`/`posttest`、无 `&&`/`||` 串接、无 `--if-present`、无 shell 重定向，**无绕过点**。`npm test` 的退出码即 `run-tests.mjs` 的退出码。

一项存量：`"lint": "eslint src/"`（:11）中 `eslint` 不在 `dependencies`，`devDependencies` 整个字段不存在，本机 `node_modules/.bin` 无 eslint，仓库根无 eslint 配置。CI 不跑 lint 故不影响绿灯，但该 script 现在无法执行（F8）。

## 3. `.github/workflows/ci.yml`

### 3.1 `npm install` 而非 `npm ci` 的锁文件漂移 —— **风险成立但对测试结论无影响（F7）**

`package-lock.json` 存在于工作树，但被 `.gitignore:8` 忽略、`git ls-files` 无任何 lock 文件 ⇒ CI checkout 后**没有锁文件**，`npm ci` 本来也无法使用。语义上依赖会随上游 semver 漂移。

但对测试的影响可实证排除：把仓库复制到 %TEMP% 并**排除 `node_modules`**，直接跑 `node scripts/run-tests.mjs` → `Running 21 test file(s)`、`tests 425 / pass 420 / fail 0 / skipped 5`、`exit=0`，与装了依赖时逐项相同。机制（读源码确认，非「拿掉依赖后没变化」的相关性推断）：全部测试文件的 import 只有 `node:` 与相对路径，且无任何测试引用 `src/`——19:42 在 22 个文件上重新 grep 复验，第三方 specifier 数 = 0、引用 `src/` 的文件数 = 0，前提仍成立。**结论**：依赖漂移会影响 `ace` CLI 的运行时行为，但不会让测试结论变化，也不会造成假绿。顺带记录：`src/` 下 14 个 `.js` 文件**零测试覆盖**，`npm test` 全绿不代表 CLI 本体被验证过。

### 3.2 矩阵是否真覆盖 auto-goal-v2 —— **覆盖**

9 个 job（node 18/20/22 × ubuntu/windows/macos）都跑 `npm test`，即全部 21 个文件、434 项（当前计数）。`ACE_REQUIRE_STUB_BACKEND` 按平台取 `1`（ubuntu/macOS）或 `0`（windows）——该三元表达式的取值起初只是转述 workflow 注释，现已在 **3.5** 判决证实（`'0'` 在 GHA 中 truthy，windows 分支不会落到 `'1'`）。CI 未显式安装 C 编译器，依赖镜像自带 gcc/clang——这一点无法在本机证实，属未能核查项。

### 3.3 有无步骤失败被吞 —— **无**

`ci.yml` 与 `publish.yml` 均无 `continue-on-error`、`|| true`、`if: always()`。`publish.yml` 的顺序是 `npm install` → `npm test` → `npm publish`，测试失败会阻止发布。

### 3.4 **F1：CI 现在应当是红的（阻塞）**

`tests/backend-isolation.test.mjs:162` 的 `C02/C03: over-budget dispatch does not launch and writes no artifact` 断言 `envelope.reason === 'launch_payload_over_budget'`，但 `dispatchWorker` 先解析 backend（`scripts/dispatch-worker.mjs:193`）再查预算（:209），**无 backend 时先返回 `no_clean_context_backend`**。CI runner 不装 Claude CLI ⇒ 该用例失败。

实测（PATH 只留 gcc + node，清空 `CLAUDE_CODE_EXECPATH` 与 `ACE_CLAUDE_BIN`，先确认 `resolveBackend() = null`）：

| 环境 | tests | pass | fail | skipped | exit |
|---|---|---|---|---|---|
| 本机原样（claude 在 PATH 上） | 434 | 429 | 0 | 5 | **0** |
| 类 ubuntu/macOS：无 claude、有 gcc、`REQUIRE=1` | 434 | 428 | **1** | 5 | **1** |
| 类 windows：无 claude、无 gcc、`REQUIRE=0` | 434 | 420 | **1** | 13 | **1** |

失败详情：`Expected 'launch_payload_over_budget', actual 'no_clean_context_backend'`（`backend-isolation.test.mjs:171`）。

这条**不是我引入的**（我只加了 `stub-backend-rejection.test.mjs`），也不是 `ACE_REQUIRE_STUB_BACKEND` 造成的——两种开关状态下都失败。修法方向（不由我实施）：该用例应像 C05 那样注入一个可解析的 backend（例如指向任意存在的原生文件的 `ACE_CLAUDE_BIN`）以隔离「预算门」这个被测面，或改为直接单测 `checkLaunchBudget`。**这是「测试依赖机器上恰好装了什么」的实例：它在开发者机器上永久绿、在 CI 上永久红，而绿的那一侧才是偶然。**

### 3.5 **F9：`ACE_REQUIRE_STUB_BACKEND` 三元接线自审 —— 接线正确，两个假设均已证实**

被审对象是 `ci.yml:23-25`（team-lead 接线，他不自审）：

```yaml
- run: npm test
  env:
    ACE_REQUIRE_STUB_BACKEND: ${{ matrix.os == 'windows-latest' && '0' || '1' }}
```

承重点只有一个：**`'0'` 在 GHA 表达式里是 truthy 还是 falsy**。若 `'0'` 为 falsy，`&&` 会返回 `'0'`、`||` 随即认为它假而跳到 `'1'`，**windows 分支就会被反向置成强制**——即接线效果与注释所述完全相反。

**主结论（不需要读 GHA 源码即可成立）**：该变量的**全部读者都是严格比较 `=== '1'`**。故唯一 enforced 取值是精确字符串 `'1'`，`undefined`、`'0'`、`''`、`'true'`、`'01'`、`'0 '` 一律落入 conditional。六值实测（无编译器环境，PATH 只留 node 目录）：

| 取值 | tests | pass | fail | skipped | exit |
|---|---|---|---|---|---|
| 未置位 / `'0'` / `''` / `'true'` / `'01'` | 8 | 0 | 0 | **8** | 0 |
| `'1'` | 1 | 0 | **1** | 0 | **1** |

五种取值逐列相同 ⇒ **即使我们对 GHA 求值语义判断错了，windows 那格也只会在若干 falsy 值之间漂移、行为不变；唯一会翻车的是意外产生精确 `'1'`，而那会红、不会静默。** 这是「让正确性不依赖需查文档才能确定的语义」的正面实例：结论只依赖一行本仓代码，不依赖第三方实现的版本。

以下求值器判决是**佐证**，用于回答「windows 那格实际拿到的是不是 `'0'`」这个更细的问题。它有三个环节，每一环都来自读第三方实现，版本一变就要重读——所以不作为主结论。

**佐证一（`'0'` 的真值性）**：GitHub 官方表达式文档只给出「conditionals 中 `false, 0, -0, "", '', null` 被 coerce 为 false」，其中的 `0` 是**数字**，未说明字符串 `'0'`——文档层面存在歧义。判决来自求值器实现 `actions/runner` 的 `EvaluationResult.IsFalsy`：

```csharp
case ValueKind.String:
    var str = (String)Value;
    return String.Equals(str, String.Empty, StringComparison.Ordinal);
```

字符串**仅空串为 falsy**，故 `'0'` truthy。（来源：`src/Sdk/DTExpressions2/Expressions2/EvaluationResult.cs`）

**佐证二（`&&`/`||` 返回值而非布尔）**：同仓 `Sdk/Operators/And.cs` 与 `Or.cs` 的 `EvaluateCore` 均 `return result?.Value;`——即 JS 式短路返回操作数原值，不 coerce。故整个表达式在 windows 上求值为字符串 `'0'`，在其余平台为 `'1'`。**注释所述取值成立，windows 不会意外置 1。**

**主结论的读取点原文**（当前共 **3 处**读者，均为同一严格比较；写此节时只有 1 处，其余两处由他人后续新增——这也说明「唯一读者」这类计数式声明本身会过期，故主结论改为对**全部**读者成立的形式）：

```js
// stub-backend-rejection.test.mjs:100
if (built.skip && process.env.ACE_REQUIRE_STUB_BACKEND === '1') {
// dispatch-argv-integrity.test.mjs:71 / dispatch-pipeline.test.mjs:90
if (STUB_OPTIONS.skip && process.env.ACE_REQUIRE_STUB_BACKEND === '1') {
```

三处形态相同 ⇒ 主结论不因读者增加而失效；但**若将来有人加一处非严格读者，或把 `ci.yml` 的值写成 `'true'`/`'yes'`，主结论即失效**。**该缺口本轮已由两端门禁闭合（F10 / 3.6.2），并经 10 项变异验证。**

**主结论所依据的完整六格实测（无编译器环境由「PATH 只留 node 目录」构造，已先确认该 PATH 下 `gcc --version` 失败）**：

| 编译器 | 开关 | tests | pass | fail | skipped | exit |
|---|---|---|---|---|---|---|
| 有 | 未置位 | 8 | 8 | 0 | 0 | 0 |
| 有 | `'0'` | 8 | 8 | 0 | 0 | 0 |
| 有 | `'1'` | 8 | 8 | 0 | 0 | 0 |
| 无 | 未置位 | 8 | 0 | 0 | **8** | 0 |
| 无 | `'0'` | 8 | 0 | 0 | **8** | 0 |
| 无 | `'1'` | 1 | 0 | **1** | 0 | **1** |

两行「未置位 / `'0'`」在两种工具链下逐列相同（team-lead 另以六值实测复验，含 `''`/`'true'`/`'01'`，五种取值逐列相同）。

**两条反事实（错误接线的后果是否可见）**：
- 若 windows 误取 `'1'`（无编译器）→ `exit=1` 且消息点名 `ACE_REQUIRE_STUB_BACKEND=1 but the stub backend is unavailable: no C compiler (gcc/cc/clang) available...`。**接线错会红且说明原因，不会静默。**
- 若 GHA 误产生空串而非 `'0'` → `8 skipped / exit 0`，等价于未置位。**不会意外强制。**

**过程纪实（一次未能复现的异常，不隐去）**：首轮「有编译器 + `'0'`」曾读出 `0 pass / 8 skipped`，与相邻格仅差一个不被读取的环境变量，形式上像是 `'0'` 真有语义。据「不得把偶发当结论」，加做 3 次定向复跑 + 20 次连跑共 23 次，全部 `8 pass / 0 skipped`，且无一次出现 `failed to compile` / `no C compiler` 字样 ⇒ 首轮读数不可复现，**与 `'0'` 无因果**。**若当时只跑一格就收尾，会得出「`'0'` 会导致跳过」这个错误结论并据此让 team-lead 改对的接线。**

**这条证据的边界**：它只证明「不是 `'0'` 的语义」，**不**证明该 flake 的成因是什么。「不是 X」与「是 Y」是两个结论，需要的证据不同——本节只主张前者，成因未查（同形态的成因待查项见 3.6 末尾与任务 #20）。

**未能核查**：CI 镜像是否真自带 gcc/clang 仍无法在本机证实（见「未能核查项」第 2 条）；本节只判决表达式取值与读取点等价性这两个可判决部分。

### 3.6 **F3/F4 已修：发现面守护 + 环境事实自述（本轮实施）**

F3/F4 与「未能核查项第 6 条」由同一处改动闭环，改的是 `scripts/run-tests.mjs`（217 行，+131）。

**判据选择及理由**。team-lead 倾向「每个含 `lib/`/`protocols/` 的 skill 必须有非空 `tests/`」，方向正确（结构性、新增 skill 自动纳入），但它挡不住 F4 那一半：改扩展名后 `tests/` 仍非空，守护照过。故落地为**两条**判据，且第一条的触发条件改得更贴根因：

1. **发布了运行时代码的 skill 必须有被发现的测试**。触发条件不是「有 `lib/` 或 `protocols/`」这个目录名白名单（那还是手工维护的清单，新目录名会漏），而是「`tests/` 之外存在任何 `.mjs`/`.cjs`/`.js`」。实测全仓 23 个 skill 中只有 auto-goal-v2 命中（29 个运行时文件），其余 22 个是纯 prompt skill、本就不该被要求有测试——判据自动区分了这两类，无需列举。
2. **import 了 `node:test` 的文件必须可被发现**。这条治 F4：文件自称是测试（拉了测试运行器）却不匹配 `*.test.{mjs,cjs,js}` 或不在 `tests/` 下，即报错并点名。

未采用纯数字下限，理由与 team-lead 一致且更强：`files.length >= 21` 是又一份手工维护的声明，加 skill 时无人记得改，正是本任务追踪的同一缺陷类。这两条都从磁盘派生，**新增 skill 落地当天即被纳入**。

**环境自述**。运行开始即打印 Node 版本/平台/架构、发现数与完整文件列表、以及**从测试源码里 grep 出来的** `ACE_*` 门控变量实际值（当前自动得到 `ACE_LIVE_SPIKE` 与 `ACE_REQUIRE_STUB_BACKEND`，含 `<unset>` 状态；名字含 KEY/TOKEN/SECRET 等则只印 `<redacted>`）。变量清单不是写死的——新增门控变量自动出现在日志里。这样一次真实 CI 跑的日志就含 3.5 想坐实的那个值，无需另加 `echo` 步骤。

**变异验证（7 项，全部在 %TEMP% 副本上，仓库零修改）**：

| # | 变异 | 结果 |
|---|---|---|
| M1 | 删掉 auto-goal-v2 整个 `tests/` | **KILLED-BY-GUARD** |
| M1b | 同上，但另留一个 decoy 测试使发现集非空 | **KILLED-BY-GUARD** |
| M2 | 一个测试文件改名 `.spec.mjs` | **KILLED-BY-GUARD** |
| M3 | 一个测试文件改名 `_test.mjs` | **KILLED-BY-GUARD** |
| M4 | `tests/` 整体改名 `__tests__/` | **KILLED-BY-GUARD** |
| M4b | 同上 + decoy 使发现集非空 | **KILLED-BY-GUARD** |
| M5 | 新增一个只有 `lib/` 没有 `tests/` 的 skill | **KILLED-BY-GUARD** |
| M6 | 控制组：只在 runner 末尾加一行注释 | **GREEN**（未误报） |
| M7 | **反向控制组**：禁用守护 + 删 `tests/` + decoy | **GREEN** |

**M7 是这组里的决定性一格**：守护被改成 `return []` 后，同样的删除变绿。这证明 M1b/M4b/M5 的红**只能**来自守护，而非别的机制。

**一次被我自己抓住的归因错误（保留记录）**：首版把守护放在既有的 `files.length === 0` 检查**之后**，于是 M1/M4/M7 三格都是 `guardFired=false` 的红——它们红是因为「一个测试都没发现」这条旧检查，与新守护无关。当时 M7 也红，若按「红=杀死」记账，会得出「守护有效」的结论，而实际那三格根本没测到守护。两处修正：判定逻辑区分 `KILLED-BY-GUARD` / `RED-OTHER-CAUSE`（只有守护自己发声才算它的功劳），以及把守护提到空发现检查**之前**（顺带让报错更有用：「auto-goal-v2 发布了代码却没有测试」可行动，「没找到测试文件」只是重复现象）。次序一改，变异证据即过期，7 项全部重跑。

**no-op 自检自身也验了**：把 M1 的 `apply` 换成真正什么都不做的函数，脚本报 `SURVIVED-VOID — tree is byte-identical after the mutation; nothing was tested`，而非静默记为「杀死」。这条按 team-lead 收进经验的那句执行：变异脚本必须自检文件真的变了。

**控制组现状（每个读数带时刻与窗口完整性判定）**：

| 时刻 (UTC, 2026-08-12/13) | 窗口 | tests | pass | fail | skipped | exit |
|---|---|---|---|---|---|---|
| ~03:20 | **未测量**（D7 之前，作废） | 466 | 461 | 0 | 5 | 0 |
| ~03:20 + `REQUIRE=1` | **未测量**（作废） | 466 | 461 | 0 | 5 | 0 |
| 19:42 | **未测量**（作废，见下） | 471 | 466 | 0 | 5 | 0 |
| 19:53:19–19:53:24 | `2be445558303` **INTACT** | 477 | 471 | **1** | 5 | 1 |
| 19:53:37–19:53:41 | `2be445558303` **INTACT** | 477 | 471 | **1** | 5 | 1 |
| 20:02:37–20:02:43 | `a23ca3040bac` **INTACT** | 482 | 477 | **0** | 5 | 0 |
| 20:02:54–20:02:59 | `a23ca3040bac` **INTACT** | 482 | 477 | 0 | 5 | 0 |
| 20:02:59–20:03:05 | `a23ca3040bac` **INTACT** | 482 | 477 | 0 | 5 | 0 |

前三行按 D7 作废——它们没有窗口证据。**19:42 那格作废尤其重要**：我曾用它论证「pipeline-fix 的 14 项 `ReferenceError` 已消失」，team-lead 实测该时段 `tests/kernel-semantics.test.mjs` 于 19:48:21→19:49:04 两次被写，读数落在活跃写入窗口内。结论很可能是真的（20:02 三轮已独立证实 `replyFiles` 落盘、那 14 项确实消失），但**19:42 那份读数证不到它**。

19:53 两轮的 `fail 1` 是 `kernel-reducer.test.mjs:363` 的 `a journal with no ARTIFACT_REGISTERED cannot seal DONE (I5, I1)`，抛在 `lib/semantic-validator.mjs:61` ← `lib/journal.mjs:465` `appendEvent`——即任务 #18 的活跃改动面（`appendEvent` 自行派生 `semanticContext`），不属我的范围、未上报为缺陷。它在 20:02 的窗口里已消失，说明 #18 owner 在两个窗口之间推进了。**两组读数都成立**，因为各自窗口完整；若无窗口判定，这就是又一次"重跑变绿"式的假结论。

其间 team-lead 另读到 `466 / pass 447 / fail 14`，全部是 `dispatch-pipeline.test.mjs` 的 `ReferenceError: replyFiles is not defined`（pipeline-fix 正在写该文件的窗口内）。**三组读数互不矛盾，只是时刻不同**——但按 D7，只有带窗口判定的那几行可被引用。方法学：本任务期间任何计数都必须带时刻**且带窗口判定**，否则下一个读者会把它当现状。计数轨迹（每点均带时刻，因为轨迹本身跨时间，不带时刻就无法判断两点之间是否夹了一次源码变更）：407（~02:0x）→425（~02:5x）→434（~03:0x）→466（~03:20）→471（19:42）→477（19:53）→482（20:02，含我新增的 F10 两个门禁 5 项）。

### 3.6.1 D7 WINDOW INTEGRITY 复测（按 team-lead 派工）

**工具**：`artifacts/tree-snapshot.mjs`。跑前跑后各取 `lib/`+`scripts/`+`tests/` 的 43–44 个文件的 `size+mtimeMs+sha256`，两次 digest 相同才记录；不同则**作废并列出漂移文件**。`--run "<cmd>"` 把判定做成运行的一部分而非事后人工检查——事后检查是又一份"要有人记得做"的声明。

同时用 **content hash 而非 size**：size-only 指纹会漏掉等长改动，我自己的 F10 变异脚本第一版就吃了这个亏（见下 N1）。

**当前树是否可测**：先连采 8 次 digest，间隔 ~8s：
```
63ae6a2c05c8 @19:52:00  63ae6a2c05c8 @19:52:09  63ae6a2c05c8 @19:52:17
225bd3553ace @19:52:26  225bd3553ace @19:52:34  3cb210a0270b @19:52:43
2be445558303 @19:52:51  2be445558303 @19:53:00
```
即 60 秒内 4 个不同 digest（加上 team-lead 的 A/B/C 与我 19:51:48 的 `2a27f00baeaa`，共 8 个）。树确实在动，**但窗口仍可取到**：全量跑只需 5–6 秒，短于写入间隔。故结论不是"当前树不可测"，而是"**窗口必须短，且必须每次判定**"。这一点值得写下来：D7 不必然导致不可测，它导致的是**测量窗口成为一个需要主动控制的量**。

**采到的 5 个完整窗口见上表**，两个 digest 各自内部一致：`2be445558303` 两轮均 `fail 1`，`a23ca3040bac` 三轮均 `fail 0`。同一 digest 下读数可复现，这才是"重复观测"应有的形态。

**这个守护自己也必须被变异验证**，否则它就是又一个"永远说 INTACT"的空转断言（D3 应用于我自己的工具）。在副本上造一次真正的中途写入：另起**独立进程**在开窗后 1.5s 追加一行到 `tests/kernel-identity.test.mjs`。结果：

```
WINDOW OPEN  20:09:08  digest=158ac618d2cb
WINDOW CLOSE 20:09:13  digest=d25f6f054c3e
WINDOW VIOLATED -- the tree changed mid-run; this reading is VOID:
  CHANGED tests/kernel-identity.test.mjs
            before: 4117 1786553543804.2705 fa07a4f75e162efd
            after:  4138 1786565350285.6804 b40f786cdba9f52f
The run itself exited 0, but that number means nothing: green and red are equally void here.
guard exit code: 3
```

**注意最后一行：那一轮测试本身是绿的（exit 0），守护仍判 VOID。** 这正是 team-lead 指出的更硬的那一半——污染落在测试文件时，绿灯读起来像强证据而其实什么都没测。守护对绿和红一视同仁，所以它能挡住这一侧。

自检过程本身踩了一个坑，记下来：首两次尝试用 `setTimeout` 在**同一进程**里安排中途写入，永远不触发——`spawnSync` 阻塞事件循环。并发写入者必须是独立进程（探针：`artifacts/d7-writer-probe.cjs`）。**在自己被阻塞的进程里模拟并发，模拟出来的是"没有并发"。**

### 3.6.3 `--verify`：D7 守住了"跑"，没守住"事后解释"（team-lead 实践发现 → 本轮实施）

**缺口**（team-lead 亲历）：他从一个完整窗口取到两条红，随后打开源码去解释它们——**读的已是被改写过的版本**（树已移到 `fadd42b7115a`），他差点报出一条依赖「那次运行时并不存在的测试代码行」的机制。**`--run` 守护的是"跑"这个动作，不守护"解释"这个动作，而后者是第二个窗口。**

由此得到一条可直接引用的纪律：

> **计数可以从已关闭的窗口引用；机制不可以。** 两者写进同一份报告，看起来同样可信——这正是这类混淆便宜的原因。

已在 `tree-snapshot.mjs` 加第三档 `--verify <digest>`，并让 INTACT 的 `--run` 主动打印 `before reading any source to explain this reading, run: --verify <digest>`（把"要有人记得做"变成工具递到手上）。判定如下（`--verify` 五种、`--run` 四种）：

| 情形 | 输出 | exit | 含义 |
|---|---|---|---|
| 树未动 | `READ WINDOW INTACT` | 0 | 机制可引用 |
| 字节全同、仅 mtime 变 | `READ WINDOW INTACT (bytes)` | 0 | 屏幕上的字节就是跑过的字节，**不喊狼** |
| 有文件被改写 | `READ WINDOW BROKEN` + 逐文件漂移 | 4 | **计数仍可引用，机制不可归因于该读数** |
| 无该 digest 的文件清单 | `READ WINDOW BROKEN` + 说明无法点名 | 4 | 拒绝，且说清为何点不出文件 |
| 声明来自另一采样面 | `READ WINDOW UNCOMPARABLE` | 5 | **在比较之前**拒绝：两次读数从不可通约，不是树漂移（3.6.5） |

`--run` 侧（本轮由四种收敛为按「树是否动」×「有无读数」两维判定）：

| 情形 | 输出 | exit | 含义 |
|---|---|---|---|
| 树未动、命令 exit 0 | `WINDOW INTACT -- reading is admissible`（带 stdout 字节数） | 0 | 读数可引用 |
| 树未动、命令**从未启动**（stdout 0 字节） | `WINDOW INTACT, BUT THERE IS NO READING HERE` | 命令的退出码 | **最强的 INTACT + 空读数**，任何东西都不可引用（3.6.5 十） |
| 树未动、命令跑过但失败（有 stdout） | `WINDOW INTACT, BUT THE RUN FAILED` + 字节数 | 命令的退出码 | 读数存在，**可引作"一次失败运行的输出"**，不可引作通过 |
| 仅 mtime 移动、字节全同 | `WINDOW TOUCHED` + 逐文件点名 | 0 | **字节类读数可引用；计时类读数视为已污染需重取**（3.6.5 九、方法论第九格） |
| 有文件字节被改写 | `WINDOW VIOLATED` + `CHANGED` | 3 | 全部作废，绿与红一并作废 |

第二行（`INTACT (bytes)`）是有意为之：`touch` 或改写时间戳的 checkout 会移动 digest 而不动任何字节。**该分支自写成之日即存在**——team-lead 先前据一次 BROKEN 判断"纯 mtime 漂移会被谎报红"，本轮已由他自行撤回：那次 BROKEN 的真实原因是同窗口内 `dispatch-stream-completeness.test.mjs` 确有字节改写，纯 mtime 的那个文件只是同时出现在名单里。**真实缺口只是逐文件标签**（现为 `TOUCHED`）。**从一个聚合判定反推它由哪个个体事件造成，与「按断言名分类而非只计数」是同一条判据**——本轮该错误在他与我两侧各出现一次（我那次是把 `| grep` 的退出码读成工具的退出码）。

**门禁若喊狼就会被忽略，那比不存在更糟**——故 `--verify` 额外维护一份 path+content（无 mtime）的 `contentDigest`，并把 `--run` 的完整文件清单落在 `artifacts/.snapshots/<digest>.txt`，这样 BROKEN 时能**点名是哪个文件背叛了你**，而不只是说"不一样"。

**该档已变异验证**（`artifacts/verify-read-window.mjs`，全在 `os.tmpdir()` 合成树上跑，仓库零修改）：**14 例全部 `PASSED-AND-SENSITIVE`，无豁免项**（20:30:06Z 首测 6 例；21:39:14Z 扩为 9 例；22:31:44Z 扩为 14 例，新增 V10–V14 见 3.6.5 第五、九、十节）。各自被指定的工具变异杀死：V1/V3 ← `alwaysBroken`，V2/V4 ← `blindVerify`，V5 ← `dropUsageGuard`，V6 ← `dropCitationHint`，V7 ← `dropSurfaceLabel`，V8 ← `dropSurfaceGuard`，V9 ← `dropLedgerGuard`，V10 ← `touchIsVoid`，V11 ← `touchAlways`，V12 ← `blindStatus`，V13 ← `neverAdmissible`，V14 ← `alwaysUnstarted`。

**第五个自身缺陷，且形态最值得记**：探针第一版只有 `blindVerify`（让 `--verify` 永远说 INTACT）一个变异，外加一张豁免名单。结果 **V1 被判 VACUOUS**——V1 断言的正是 INTACT，所以"永远说 INTACT"的工具当然能通过它。真正的问题不是 V1 这一例，而是**豁免名单在替我掩盖「正面分支根本没有杀手」这一事实**：一个正面断言需要能打破正面的变异（`alwaysBroken`），把它写进豁免名单只是给缺口改了个名字。改为**每例自带一个必须杀死它的变异、不设豁免**后 6/6 敏感。**教训：单一变异 + 豁免名单 ≈ 用「测不到」冒充「不必测」；豁免名单本身就是一处待查的空转。**

**同期观察到的工具作用域被并发扩大（20:28:56Z）**：另一位 agent 把 `tree-snapshot.mjs` 的采样面从枚举 `lib/`+`scripts/`+`tests/`（46 文件）改为**排除式全树遍历**（89 文件），理由是原枚举漏掉了 `lib/` 与 `scripts/` 直接 import 的 21 个运行时模块（如 `schemas/registry.mjs`、`protocols/runtime/risk.mjs`），并加了「采到 0 文件即抛错」的空采样器防护。我的 `--verify` 与之无冲突（20:30 起的读数已是扩大后版本，`files=89`）。**由此产生的引用纪律「采样面变更前后的 digest 不可比较」已于 21:3x 从纪律升级为工具判定**——本报告 20:28:56Z 之前的所有 digest（`3ee4f8e4a2ec`、`dba55fc8227c`、`bffe0c89486b` 等）属 46-文件面，现被 `--verify` 以 exit 5 拒绝比较，见 3.6.5 第四节。**守护工具自身的版本也是读数的一部分，故它现在写在 digest 里。**

**扩大后首次完整窗口（`e1997f82d29e` INTACT，20:30:22Z–20:30:33Z，files=89）**：`Discovered 25 test file(s)`、`tests 489 / pass 483 / fail 1 / skipped 5`，唯一红项为 `kernel-layer-consistency.test.mjs:304`（他人 `dispatch-worker.mjs` 活跃面）。紧随其后的 `--verify e1997f82d29e` 报 `READ WINDOW INTACT`，故该轮的机制归因是可引用的。

**收尾读数（`fc5b7b11d834`，files=89，三个 INTACT 窗口，20:34:09Z / 20:34:2xZ / 20:35:0xZ）**：三轮均 `Discovered 25 test file(s)`、`tests 489 / pass 484 / fail 0 / skipped 5 / exit 0`；`--verify fc5b7b11d834` 报 `READ WINDOW INTACT`。**按纪律 1 这里给了三次而非一次**——单次 INTACT 的 `fail 0` 无法与抽样运气区分，而本报告此前恰好观察到同 digest 上 `3/3/4` 与 `2/3` 的抖动。同批第四轮 guard exit 3（digest 漂到 `80260ed0afaf`，`fail 1` = `dispatch-stream-completeness` 的 deadline 项）**已按 D7 作废**，不计入。我的四条 F10 门禁在三轮中均 4/4 通过。

### 3.6.5 回扫不是窗口证据；采样面与台账位置改为工具判定（team-lead 更正 + 实测 → 本轮实施）

本节收三件事：一条我必须收下的更正、两项 team-lead 替我做的外部实测、以及由此把「靠读者记住」改成「工具拒绝」的实现。

#### （一）`find -newermt` 回扫有有效期，不能作独立窗口证据

`find -newermt <开窗> ! -newermt <闭窗>` 得空集，有两种在**读数上完全不可区分**的读法：窗口内真没人写，或窗口内写过而**之后**又被写了一次（哪怕完全无辜）——mtime 只记最后一次写入，第二种历史把自己擦掉了。v2-review 在本树上量化了衰减：

| 回扫滞后闭窗 | 失明文件数 |
|---|---|
| 闭窗即刻 | 0 / 89 |
| +3 分钟 | 1 / 89 |
| +6.5 分钟 | 4 / 89 |
| +28 分钟 | 8 / 89（单调增长，永不缩小） |

**危险的不是漏检，是它给出一个干净的空集。** 忘取快照会让人写「窗口未验证」——没东西可引；晚做的回扫产出空集，让人写下「已确认窗口内无写入」——有东西可引，而那东西不成立。**这是假 skip 的第四处形态**：F1/F2/F10 是门禁自称「本环境不适用」，这一处是回扫自称「窗口内无写入」，共同点仍是那句——**自称的那个状态，它的成立条件本身没有被任何东西校验。**

快照与回扫的区别是**性质而非严格程度**：快照回答「此刻树是什么」，回扫回答「此后没人再写过」，后者的答案随时间腐烂，前者不会。

**本报告的自查结果：未引用任何回扫作为窗口证据。** 全文窗口判定均出自 `tree-snapshot.mjs --run`（快照在窗口内两端各取一次），故无需补滞后时长。`recent-writes.mjs`（我用来点名漂移文件的辅助工具）已改为**拒绝被当作验证引用**：

- 新增 `--closed-at <ISO|epochMs>`，输出 `BACKSCAN, LAGGING WINDOW CLOSE BY <n>s` 并按上表报出该滞后下的实测失明数，让读者自己判有效期；
- 不给 `--closed-at` 时明说「本输出没有滞后时长，不能对任何窗口引用」；
- 超出最后一个实测点时报「at least」而不插值——曲线单调，这个界成立，而插值会凭空造出这四个点没有的精度。

#### （二）观测方自己的写入会进入被测量的树

v2-review 看到 `04:29:10` `schemas/registry.mjs` 被写，推断「有人在改产品代码」；那是 team-lead 自己的灵敏度探针追加一字节再还原，mtime 精确到同一毫秒。**「树在动」里有一部分是别人在看它，而这个信息不在树里。** `recent-writes.mjs` 现每次运行都提示：报告某文件名是产品改动之前，先问它是不是谁的探针——追加后还原的文件在这里显示为「被写」，在 `tree-snapshot` 里显示为 `TOUCHED`（字节全同）。这一点在 flake 调查上格外要紧：flake 调查最容易把观测扰动读成信号。

#### （三）台账必须在被采样树之外——team-lead 实测为真，本轮改为断言

`LEDGER_DIR = .ace/tasks/.../artifacts/.snapshots`，`SKILL_ROOT = plugin/skills/auto-goal-v2`，`startsWith` 为 false，今天满足。**这一条不测不能算知道**：若台账落在被采样树内，`recordSnapshot` 会移动它刚记下的那个 digest——INTACT 的 `--run` 写完台账后读数立即失效，`--verify` 永远 BROKEN，**守护工具会因为记录自己的观测而作废自己的观测**，而且现场看起来像「一棵永远脏的树」，不像工具坏了。

「测过一次」不等于「保持为真」——改一个路径就静默复发。故已在 `tree-snapshot.mjs` 的 `LEDGER_DIR` 定义处加**加载期断言**：台账落在 `SKILL_ROOT` 内即 throw 并说明为什么。新增变异例 **V9** 覆盖它（见下）。

#### （四）采样面编进读数本身（team-lead 提议，我采纳并实现）

team-lead 实测了两件我只写成引用纪律的事，两件都 fail-closed：`--verify 3ee4f8e4a2ec`（46-文件面真实旧 digest）→ exit 4 `no recorded file list`；更值的一例是他在 tmpdir 里伪造**只含 46 文件的台账**挂到假 digest 上、专门去撞 `contentDigest` 那条「仅 mtime 变」的宽松分支（那 46 个文件的内容哈希此刻确实逐字节匹配）→ 仍 exit 4，并**逐条点名 43 个 ADDED**，因为宽松分支比的是全清单而非交集。**所以跨面污染在工具上是被机制挡住的，不依赖人的记性。**

但它挡不住第三处：**digest 不携带产生它的采样面**，`fc5b7b11d834` 与 `3ee4f8e4a2ec` 都是 12 位十六进制。工具比对时安全，**人在报告里比对时不安全**——本报告 §3.6.2 那条被降档的证据，坏就坏在这里。故按 team-lead 的提议改为面标注：

- 所有输出的 digest 形如 `all-89:891c21fa1bf6`（`<采样规则>-<文件数>:<digest>`），`--run` 递给读者的 `--verify` 提示也带标注；
- `--verify` 两种形式都收（带标注 / 裸 digest）；
- 台账文件写入 `# surface all-89` 头，使**引用者只给裸 digest 时工具仍知道面**；
- 跨面声明在**任何比较之前**被拒：新增第五档 `READ WINDOW UNCOMPARABLE`（exit 5）。

第五档为何必要，而不是让它落进原有的 BROKEN：BROKEN 报的是**树漂移**，而跨面的真相是**两次读数从不可通约**。报错方向错了，读者会去追一次并不存在的写入。「拒绝」和「为正确理由拒绝」是两件事。

`SURFACE_POLICY` 只在**遍历规则**改变时改；文件增删只移动计数，那是合法漂移，仍可比。

**本轮实测（当前树，`all-89:891c21fa1bf6`）**：

| 声明 | 判定 | exit |
|---|---|---|
| `all-89:891c21fa1bf6`（当前面、当前树） | `READ WINDOW INTACT` | 0 |
| `42483a4d050e`（同面、旧树，台账无 surface 头） | `READ WINDOW BROKEN` + 点名 `dispatch-worker.mjs` CHANGED、`lib/budgets.mjs` TOUCHED | 4 |
| `lib-46:3ee4f8e4a2ec`（46-文件面） | `READ WINDOW UNCOMPARABLE` | 5 |

第二行顺带证实无 surface 头的旧台账仍 **fail-closed**（凭 ADDED/REMOVED 落到 BROKEN），只是不如新台账说得清——给旧台账猜一个面等于凭空发明这次要加的那个字段，所以报 `null` 并退回旧行为。

#### （五）变异验证：6 例 → 14 例，仍无豁免项

`verify-read-window.mjs` 先加三例，随后因 `--run` 三处新分支再加五例，仍是「每例自带一个必须杀死它的变异、不设豁免」：

| 例 | 断言 | 杀手变异 |
|---|---|---|
| V7 | 每个输出的 digest 都带采样面 | `dropSurfaceLabel`（退回裸 digest） |
| V8 | 跨面声明报 `UNCOMPARABLE`（exit 5）**而非**误报为漂移 | `dropSurfaceGuard`（保留标注、去掉拒绝，于是落回 BROKEN——正确退出码、错误理由） |
| V9 | 台账落在被采样树内时**加载期**拒绝 | `dropLedgerGuard` |
| V10 | `--run` 跨越纯 touch 报 `TOUCHED` 并警告计时读数被污染 | `touchIsVoid`（退回一律 VOID） |
| V11 | `--run` 期间字节被改写仍 VOID，不被 `TOUCHED` 软化 | `touchAlways` |
| V12 | 命令**从未启动**（stdout 0 字节）时不称「可采纳」 | `blindStatus`（强制走可采纳分支） |
| V13 | 命令确实 exit 0 时**仍**称「可采纳」 | `neverAdmissible`（否掉可采纳分支） |
| V14 | 命令**跑过但失败**（有 stdout）与「从未启动」被区分开 | `alwaysUnstarted`（把所有失败一律当空跑） |

V9 的对照树需要一种特殊布局：工具按「自身向上四级 + `plugin/skills/auto-goal-v2`」定位被采样树，故把工具放在 `<root>/plugin/skills/auto-goal-v2/artifacts/` 就让被采样根成为工具自己的祖父目录、`.snapshots/` 落在测量之下——这是该误配唯一可能的形态，也只差一次路径搬迁。

**结果（22:31:44Z，`os.tmpdir()` 合成树，仓库零修改）：14/14 `PASSED-AND-SENSITIVE`，无豁免项。**

**V8 的写法值得单记**：`dropSurfaceGuard` 只删拒绝、保留标注，被测例仍会拿到「exit 5 之外的某个失败」——若我把 V8 的期望只写成「非 0 退出」，这个变异就杀不掉它，而漏掉的正是「理由是否正确」这一半。**门禁的正确退出码与正确理由需要各自的杀手**，这与第五个自身缺陷（正面/反面断言需要方向相反的变异）是同一条的推广。

**V12–V14 这一组是「豁免名单本身是一处待查的空转」的第一次兑现，且兑现方式是我自己踩中的**——详见（九）。

#### （九）新分支进来时没有杀手，而探针给出满分——本轮最直接的一次自我兑现

team-lead 修 `--run` 假可采纳，加了按 `status` 分叉的判定。**这个分叉进入文件时，14 个杀手变异里没有任何一个触及它**（实测：对当时的杀手清单搜 `status === 0` / `admissible =`，命中 0）。而我在它已经在场之后跑的那次变异验证，报的是 **11/11 `PASSED-AND-SENSITIVE`「每例都可证敏感」**。

**这就是「全绿不是覆盖的证据」的一个现场标本，而且是最难察觉的形态**：探针没有出错、没有跳过、没有豁免名单——它只是**没有那一格**。空转测试的诸多形态里，「断言写错」会在变异下暴露，「豁免」会在名单上留痕，而**「性质根本没被写进用例表」在任何一次运行的输出里都完全不可见**：满分报告的分母是用例数，不是性质数。

补齐时又踩中同一族的第二层，且这次是探针自己抓出来的：我给 V13（正面断言「exit 0 仍称可采纳」）挂的杀手是 `alwaysUnstarted`，但 V13 走的是 exit 0 分支，而该变异改的是失败分支——**V13 根本到不了被改的代码**，于是它在变异体下照样通过。探针把它判成 `VACUOUS` 并拒绝给全绿（`UNEXPECTED: V13=VACUOUS`）。这正是我先前写进方法论的那条在自己身上执行了一次：**正面断言与反面断言需要方向相反的杀手，而「挂了一个杀手」与「挂了一个能到达它的杀手」是两个命题。** 改挂 `neverAdmissible`（否掉可采纳分支）后 14/14。

**可搬用的判据**：新增一个分支时，同时问「哪一格会因为这个分支被删而变红」；如果答案是「没有」，那么这个分支**在探针的意义上不存在**，无论探针报多少分。这一条比「豁免名单可疑」更强——豁免至少是显式的。

#### （十）`--run` 的第三种结局：把「有没有读数」从措辞里挪进测量

team-lead 的修复把 `status === 0` 与非 0 分开，非 0 那支印：

> `WINDOW INTACT, BUT THE RUN FAILED (exit N) -- ... If this exit came from the command not starting at all (a bad path, MODULE_NOT_FOUND), there is no reading here to cite.`

**实测这句话对两种本质不同的结局给出逐字相同的输出**：

| 命令 | 真实结局 | stdout | 原措辞 |
|---|---|---|---|
| `node no/such/path.mjs` | 从未启动，零读数 | **0 字节**（stderr 802） | 同一句 |
| `node -e "console.log(1);process.exit(7)"` | 跑过、有输出、失败 | **2 字节** | 同一句 |

也就是说，那个 `If this exit came from ...` 的条件**留给读者去解**，而读者手上没有解它所需的信息。**但这不是意见问题**：从未启动的命令一个字节都没写出来，stdout 字节数就能定它。这与他自己在同一条消息里点名的病同族——**递出原始数字（`(exit N)`）不等于递出结论**，条件从句同理：递出一个待解的条件也不等于递出判断。

已把 `execSync(..., stdio:'inherit')` 改为 `spawn` + 三通道 tee，边转发边计数（不缓冲：整套 40371 字节，缓冲一个话多的命令会让守护把被守护的运行搞挂），并在 `close` 而非 `exit` 上收口（#19 那条教训：`exit` 可能在管道尚有未读字节时就触发，会把有输出的运行报成 0 字节）。三种结局各自成句：

```
WINDOW INTACT -- reading is admissible (the run exited 0, 40371 bytes on stdout)
WINDOW INTACT, BUT THERE IS NO READING HERE (exit 1, ZERO bytes on stdout, 802 on stderr) -- ... Nothing from this run may be cited.
WINDOW INTACT, BUT THE RUN FAILED (exit 7) -- it did run and wrote 10 bytes on stdout, so a reading exists; ... Do not cite them as a passing one.
```

第三支是新增的一类可采纳性：**跑过的失败运行是有读数的**，其输出可以被引用为「一次失败运行的输出」，只是不可引用为通过。原措辞把它和零读数混在一句里，等于让两种不可区分的结局共用一条判定——**与他在 §4 判 `argv === null` 时用的正是同一条判据：不可区分的两件事共用一条断言时，断言测的是它们的并集。** 他把那条用在产品断言上，这里它落在守护工具自己身上。

退出码转发经实测保持（never-started 1、ran-and-failed 7；**读退出码必须不经管道**，经 `| grep` 读到的是 grep 的 0——我这一任务里第二次踩这个，记在此处）。整套守护运行复测：`all-89:55112845db30` 开闭同 digest、INTACT、`pass 494 / fail 0 / skipped 5`、40371 字节、测试输出仍逐行实时流出（tee 未改变 reporter 形态，实测无 ANSI、行格式一致）。

#### （六）我先前那批 INTACT 判定的强度低于新标准

`tree-snapshot.mjs` 早期只看 46 文件，漏掉的 21 个运行时模块正被 `lib/`、`scripts/` 直接 import。**这直接解释了我为什么当时判不出漂移**：视野外的改动不破坏 INTACT。§3.6.2 已按 D6 降到第二档，此处只补「为什么当时的窗口判不出来」这一半。20:28:56Z 之前的所有 digest 属 46-文件面，与之后的不可比——现在这件事由 exit 5 强制，不再由读者记性维持。

**一条可直接搬用的原则（team-lead 提法，我认为是本轮最普适的一条）**：**凡是靠读者记住才成立的前提，都应设法变成读数自带的字段。** 面标注、`--verify` 提示语由工具主动递出、回扫自报滞后，是同一个动作的三次应用。

#### （七）§3.6.2 的悬案有了新数据：同 digest 下的漂移**在修后守护上复现了**（21:44–21:52Z）

team-lead 定的判据是：「要不要保留为已确认事实，取决于你在修后的守护上重测还能不能复现漂移」。20:41 那四轮没有复现，我据此把它停在第二档。**本轮 25 轮复现了两次。**

25 轮 `node scripts/run-tests.mjs`，全部 `--run` 守护、`void=0`、digest 恒为 `all-89:891c21fa1bf6`、`tests 498`：

| 轮次 | fail | 失败项 | 断言实际值 |
|---|---|---|---|
| 第 3 轮 | 1 | `B5 SEMANTIC: a DISCOVER worker declaring a criterion checked is refused` | `cli_output_unparseable`（期望 `worker_output_semantic_invalid`） |
| 第 6/25 轮 | 1 | `B5 SEMANTIC: SUCCEEDED carrying an error object is refused` | `parse`（期望 `semantic`） |
| 其余 23 轮 | 0 | — | — |

**关键点：同一 digest、同一 89 文件采样面、窗口全部 INTACT，而 fail 数在 0 与 1 之间变化，且失败项在两轮之间迁移。** 这满足 D6 第三档对「窗口完整 ≠ 读数确定」这个命题所需的证据形态——**不是同一项时红时绿（那还能用套件内部状态解释），而是红点本身在同一文件的不同断言间移动**。

故 §3.6.2 与首页纪律 1 由第二档升为**已在本机确认**：D7 排除「被测对象在测量期间变了」，排除不了「被测对象本身不确定」，而后者在本树上实测存在。team-lead 与我 20:41 各自的四轮全一致，只说明该现象频率约 2/25（8%），四轮观测不到它——**这正是「重复观测的次数必须与被观测事件的频率相称」的一个实例，而不是该现象不存在的证据**。

#### （八）该漂移的成因：不是 #20 的机制，且**未查明**（D6 第二档）

先说不是什么，因为这一步是可判的。`cli_output_unparseable` 出自 `dispatch-worker.mjs:616`（`JSON.parse(captured.stdout)` 抛错即判 `parse` 阶段），空 stdout 会走到这里——与 #20 的空 artifact 形态相符，故必须排查。我把真套件复制到 tmpdir、把相对 import 改成绝对（`probe-pipeline-parse-flake.mjs`，仓库零修改），在**harness** 而非单个用例上插桩（红点已经迁移过一次，钉在某个用例上等于把「红不会再移动」当前提），打印每次被拒 dispatch 的 `exit_code` / `raw_bytes` / `timed_out`。

**结果否掉了 #20 的机制**：出现红的那一轮，20 条被拒 dispatch 全部 `exit=0`、`raw_bytes` 非零（152–1048576），无一条呈现 #20 的 `exit=0xC00000xx` + `raw_bytes=0`。**所以这不是映像加载失败，不能并进 #20。**

**但这批插桩读数随后被我自己作废**：该探针未走 `--run` 守护，而运行期间 `tests/dispatch-pipeline.test.mjs` 被并发改写（`--verify` 报 `READ WINDOW BROKEN`，50873 字节，05:58:33 本地时间；另有 `lib/budgets.mjs`、`schemas/worker-input.schema.json`、`scripts/ingest-audit.mjs`、`SKILL.md` 四个文件 `TOUCHED`——字节全同、仅 mtime 变，是**他人变异探针**的签名，见本节第二小节）。那批读数里出现的 5/10 红、且红点散落到 `budget constants`、`launch payload`、`§2 input gates` 等**其他文件**，与被改写的时间窗吻合；**按 D7，其绿与红一并作废，不予引用**。上面那条「`exit=0`、`raw_bytes` 非零」的否证结论所依据的是同一批数据，故其强度只到「有一次观测如此」，不到「已排除」——**我把它记为「#20 机制的排除是初步的，需在静止树上复测」**。

改写后的树（`all-89:55112845db30`，`tests 499`）：`dispatch-pipeline.test.mjs` 单跑 6/6 绿（全部 INTACT），全量 8/8 绿（全部 INTACT，`fail 0`）。**按派工第三条硬约束，这不构成「已解决」**：`891c21fa1bf6` 上的 2/25 是在完整窗口内取到的真实读数，而树在那之后被改写；「改了 X 之后现象没了」证不了「现象由 X 引起」，也证不了现象已不存在——8 轮观测在 8% 频率下有约 51% 的概率全绿。

**故此条按 D6 第二档交付**：

> **现象**：`all-89:891c21fa1bf6` 上 25 轮全量、窗口全 INTACT，`dispatch-pipeline.test.mjs` 出现 2 次单红，红点在两个不同断言间迁移，均落在 `parse` 阶段（`cli_output_unparseable` / `rejected_stage='parse'`）；同文件单跑 0/10。**成因未查明。**
> **已排除（初步，依据一批后被 D7 作废的插桩读数中的 exit/raw_bytes 字段）**：#20 的 Windows 映像加载失败（该形态要求 `raw_bytes=0` + `exit=0xC00000xx`，观测到的是 `exit=0` + 非零字节）。
> **最小复现**：`for i in 1..25: node .ace/tasks/implement-auto-goal-v2/artifacts/tree-snapshot.mjs --run "node scripts/run-tests.mjs"`，看 `dispatch-pipeline` 是否出现 `parse` 阶段单红；复现率约 2/25（8%），单跑该文件不复现（0/10），故必须整套跑。
> **插桩手段**：`artifacts/probe-pipeline-parse-flake.mjs`（真套件副本 + harness 层插桩，打印 `exit_code`/`raw_bytes`/`timed_out`）。**下次使用必须包在 `--run` 里**——这次没包，代价是一批读数作废。

**本轮我自己的第七个缺陷（探针层）**：`probe-pipeline-parse-flake.mjs` 收尾用 `\n  });\n}` 定位 harness 调用的结尾，而该串在文件里出现 **30 次**；`String.replace` 取第一个，**恰好**就是 harness 的。「恰好」不是可依赖的前提——已改为断言「第一个出现位置必须等于 harness 之后的第一个出现位置」，若将来有人在 harness 上方加函数，探针会抛错而不是静默插桩到错误的调用上。**这与豁免名单是同一族：一个正确结果如果来自巧合而非机制，它下一次不必正确，而现场看不出区别。**


### 3.6.2 **F10 已修：`ACE_REQUIRE_STUB_BACKEND` 契约两端门禁（本轮实施）**

**缺陷形态（经 team-lead 纠正）**。我原写「若有人加宽松读者，windows 那格会被静默置成强制」——方向对但**落点写反了**。`ci.yml:25` 给 windows 传 `'0'`，宽松读者 `!== '0'` 对 `'0'` 仍为假，windows **不会**被强制。真正会坏的是反向：有人把值写成 `'true'`/`'yes'`/`'on'` 或空串，严格读者一律判假 → **静默跳过**，CI 报 skip 而非红。**故落点仍是老朋友「假 skip」，不是假强制**——这个缺陷类的第九个位置。

**两端都要门禁**，因为单端门禁只是把「声明了却无人校验」多加一步：

| 门禁 | 位置 | 管什么 |
|---|---|---|
| 消费端 | `plugin/skills/auto-goal-v2/tests/stub-gate-cohesion.test.mjs` | 全部读者必须是 `=== '1'` 字面形式；且**每个依赖 C 编译器的套件都必须自带该开关** |
| 生产端 | `tests/ci-stub-gate-wiring.test.mjs`（**仓库级新建 `tests/`**） | `ci.yml` 传的值必须落在读者认识的字面集合内；且该赋值不得消失 |

生产端必须放仓库级：`.github/` 在 skill 树之外，**I10 禁止 skill 的测试向外伸手**。依赖方向取诚实的那一侧——仓库可以看它的 skill，skill 不可以看它的仓库。两个文件互相点名（生产端断言消费端文件存在），否则删掉一个另一个会继续绿着守护一个已失效的前提。

**断言不写数量**。「有 3 个读者」写此节时为真、现已易过期——正是我自己指出的病。消费端扫全部 `tests/**/*.mjs`，凡出现该变量且不是 canonical 形式即红；同时用「找到的编译器依赖套件数 > 0」防止扫不到主体时断言空转（**不是**读者计数）。区分「提及」与「读取」是计算出来的：docblock 与 `throw new Error(\`…\`)` 里的同名字符串会被字符串区间与注释判定排除，否则门禁要么对文档喊狼、要么对引号后的真读取失明。

**不认识的形态一律报错而非放行**。消费端只承认 `=== '1'` 一种写法；生产端只解构 `${{ }}` 顶层 `&&`/`||` 链的操作数（丢掉 `==` 比较项，因为 `'windows-latest'` 是比较操作数、永不可能是求值结果），无法解构的表达式报「无法判定」。**门禁对自己看不懂的形态做判断，正是「声明了却无人校验」的起点。**

**变异验证（10 项，全在 %TEMP% 副本上，仓库零修改）**：

| # | 变异 | 结果 |
|---|---|---|
| N1 | 某读者 `=== '1'` → `!== '0'` | **KILLED-BY-GATE** |
| N2 | 某读者 → `Boolean(env)` 包裹 | **KILLED-BY-GATE** |
| N3 | 某编译器依赖套件整块删掉开关 | **KILLED-BY-GATE** |
| N4 | `ci.yml` windows 腿改传 `'true'`（**本缺陷的真实形态**） | **KILLED-BY-GATE** |
| N5 | `ci.yml` 强制值 `'1'` → `'yes'` | **KILLED-BY-GATE** |
| N6 | `ci.yml` 整条赋值删除 | **KILLED-BY-GATE** |
| N7 | 消费端门禁文件被删（生产端须发现） | **KILLED-BY-GATE** |
| N8 | 控制组：只加一行注释 | **GREEN**（未误报） |
| N9 | no-op 自检：`apply` 什么都不做 | **SURVIVED-VOID**（正确） |
| N10 | **反向控制组**：消费端两条断言全部禁用 + N1 | **GREEN** |

七项红全部由**门禁自己点名**（如 `'true' is not a literal the readers act on`、`dispatch-argv-integrity.test.mjs gates on a C compiler but never reads ACE_REQUIRE_STUB_BACKEND`），非 `RED-OTHER-CAUSE`。

**三个被变异抓出来的自身缺陷（保留记录）**：

1. **size-only 指纹漏掉等长变异**。首轮 N1 报 `SURVIVED-VOID`——`=== '1'` 与 `!== '0'` **字节数相同**，size 指纹判定"树没变"。即：我的 no-op 自检对**最该测的那一类变异**恰好失明，任何等长改动都会被静默记为「什么都没变」。改为 content hash 后 N1 转 KILLED。**教训：自检机制本身也要问「它能发现什么、发现不了什么」。**
2. **反向控制组只禁用了一条断言**。N10 首轮 `CONTROL-BROKEN`——我只禁用了 canonical-form 断言，而 N1 同时也移除了 coverage 断言要找的 canonical 读取，于是那条仍然红。「禁用门禁」指的是**它的全部断言**；留一条活着的反向控制组证不到它声称的东西。
3. **CRLF 让生产端门禁零匹配**。`ci.yml` 是 CRLF，`$` 锚定的正则被尾随 `\r` 挡住，门禁静默匹配到 0 行——**它自己就是一个空转断言**。是「赋值数 > 0」那条兜底断言把它抓出来的（`no workflow assigns ACE_REQUIRE_STUB_BACKEND`）。这是本轮唯一一次「我加的反空转断言抓住了我自己」。

**接入后实测（窗口 `a23ca3040bac` INTACT，20:02:37–20:02:43）**：`Discovered 24 test file(s)`（+2）、`tests 482 / pass 477 / fail 0 / skipped 5 / exit 0`。仓库级 `tests/` 此前不存在，新建后自动被 `run-tests.mjs` 的 `testRoots()` 纳入（`:43` 已含 `REPO_ROOT/tests`，此前只是该目录不存在）。

**第四个自身缺陷：门禁文件里一个 NUL 字节（20:16:20Z 发现并修）**。用 `grep -rn` 复查读者面时，`grep` 把我自己的 `stub-gate-cohesion.test.mjs` 报成 `Binary file … matches`。实测该文件含 1 个 NUL：`:109` 的 `.repeat()` 参数是 `'\0'` 而非 `' '`。**功能上无害**（同为 1 字节、同样不匹配变量名，四条断言全绿），但后果在工具层：**任何基于 grep 的读者面审计都会静默跳过这个文件**——而它恰是管辖读者面的那个门禁。已改回 ASCII 空格（长度不变，NUL 计数 0，`grep` 现正常列出其 docblock 行）。**教训与 N1 同形**：功能自检（断言全绿）不覆盖工具可读性，而「被工具静默跳过」正是本任务反复出现的那一类失效。

**当前树复测（NUL 修复后，全部带 D7 判定）**：

| 时刻 (UTC) | 窗口 digest | 判定 | 读数 | 我的四条门禁 |
|---|---|---|---|---|
| 20:16:29–20:16:38 | `1f72de2627fb` → `54eb65c69b0e` | **VIOLATED**（`lib/ledger.mjs` 被并发写）**作废** | 变异全 KILLED（不采信） | — |
| 20:16:50–20:16:59 | `bffe0c89486b` | INTACT | 变异 N1–N7 KILLED / N8·N10 GREEN / N9 SURVIVED-VOID | — |
| 20:17:11–20:17:21 | `4040337fbcab` | INTACT | 同上（第二次独立确认） | — |
| 20:17:33–20:17:43 | `dba55fc8227c` | INTACT | `tests 489 / pass 481 / fail 3 / skipped 5` | 4/4 通过 |
| 20:17:43–20:17:53 | `dba55fc8227c` | INTACT | `tests 489 / pass 481 / fail 3 / skipped 5` | 4/4 通过 |
| 20:17:54–20:18:05 | `dba55fc8227c` | INTACT | `tests 489 / pass 480 / **fail 4** / skipped 5` | 4/4 通过 |
| 20:19:21–20:19:28 | `3ee4f8e4a2ec` | INTACT | `fail 2` | 4/4 通过 |
| 20:19:29–20:19:35 | `3ee4f8e4a2ec` | INTACT | `fail 3` | 4/4 通过 |

**D7 的一个必要补充：窗口完整 ≠ 读数确定（命题成立；本地数据不足以确认，按 D6 停在第二档）。** 最后两行是同一 digest `3ee4f8e4a2ec` 上两次相邻 INTACT 窗口给出 `fail 2` 与 `fail 3`；20:17 那三行同样在 `dba55fc8227c` 上给出 3/3/4。

**但这组数据现在有更简单的解释，而且我认为就是它。** team-lead 指出：当时 `tree-snapshot.mjs` 的采样面只有 46 个文件，全树 89 个；缺的 43 个里有 21 个是被 `lib/`、`scripts/` 直接 import 的运行时模块（`schemas/registry.mjs` 被 `lib/journal.mjs:55`、`lib/artifacts.mjs:21`、`lib/reducer.mjs:18`、`scripts/dispatch-worker.mjs:27` 引；`protocols/runtime/risk.mjs` 被 `lib/vocabulary.mjs:14` 引）。实测改 `schemas/registry.mjs` 一字节，旧范围 digest 不变、照报 INTACT。**那两次 INTACT 之间，视野外完全可能有连带改动**——pipeline-fix 当时正在改 `lib/`/`scripts/`。该盲区源自最初的 `WATCHED = ['lib','scripts','tests']` 规格，已于 20:2x 改为枚举排除项 + 空采样 throw，现覆盖 89/89。

**曾按 D6 记为第二档：现象——曾观测到同 digest 下 fail 数不一致；成因两个候选：(1) 套件自身不确定；(2) 守护范围盲区。** 命题本身（D7 是必要非充分条件）独立于这组数据成立：窗口完整性排除「被测对象在测量期间变了」，逻辑上排除不了「被测对象本身不确定」。

**修后守护上的第一次重测（89 文件面，20:41–20:43Z，digest `42483a4d050e`）**：四轮全 INTACT，`tests 489 / pass 484 / fail 0 / skipped 5 / exit 0`，四轮完全一致，**未复现漂移**——与 team-lead 在 `9dfd2fc38ea6` 上四轮全一致相符。我当时据此把本条停在第二档。

**第二次重测把它定了档（21:44–21:52Z，digest `all-89:891c21fa1bf6`，25 轮）：漂移复现，2/25。** 窗口全 INTACT、`void=0`，`dispatch-pipeline.test.mjs` 两次单红且**红点在两个不同断言间迁移**（详见 3.6.5 第七节）。**故本条升为已确认事实**，且 20:41 那四轮的意义随之改变：它不是反证，而是 8% 频率下四次观测的正常结果——**四轮全绿与 2/25 之间没有矛盾，只有样本量不足**。此前那组 46-文件面的漂移数据仍不引用（另有更简单的解释），本条现在靠 `891c21fa1bf6` 上的新数据成立。该红的成因**未查明**，已初步排除 #20 机制（3.6.5 第八节）。

失败项归属（不属于我，20:18:19Z–20:19:35Z 窗口内实测）：`dispatch-stream-completeness.test.mjs:91`「a deadline still settles when a detached writer holds the pipe open」（任务 #19 的活动面，即上下轮次间迁移的那一项）、`kernel-layer-consistency.test.mjs:304`「every cross-layer copy of a kernel budget is registered with a reason」（`UNREGISTERED scripts/dispatch-worker.mjs:2000 at line(s) 68 = COUNT_LIMITS.JOURNAL_SEGMENT_EVENTS`，他人正在写该文件）、以及一轮出现的「B5 SCHEMA: unknown properties and bad claim shapes are refused」。**我的四条门禁在全部 5 次 INTACT 全套读数中 4/4 通过**，无一次红。

**一次低频 flake，不隐去（结论止于观测层）**：

- **现象（真，可复现过一次）**：次序修正前的一轮 `ACE_REQUIRE_STUB_BACKEND=1` 出现 `fail 1` —— `dispatch-argv-integrity.test.mjs:99` 的 `precondition: the stub echoed its argv into the raw artifact`。team-lead 独立复现：同进程跑两套，第 1 轮即 1 fail；随后同进程 14 轮 + 带两路并发竞争 10 轮，共 30 轮全绿。**低频真事件。**
- **已排除的机制（1）——与我的发现面守护无因果**：单独跑该文件 4/4 通过；**绕过我的改动**用 `node --test <全部文件>` 跑整套 `466 / 0 fail / exit 0`；经我的 runner 再复跑 3 次亦全绿。
- **已排除的机制（2）——两套不共享编译产物**（这一条推翻我自己先前写的归因，源码依据）：

  | | `dispatch-argv-integrity` | `stub-backend-rejection` | `dispatch-pipeline` |
  |---|---|---|---|
  | C 源文件 | `fixtures/argv-echo-stub.c` | `fixtures/stub-backend.c` | `fixtures/dispatch-pipeline-stub.c` |
  | 输出目录 | `mkdtempSync(…,'ace-argv-stub-')` | `mkdtempSync(…,'ace-stub-backend-')` | `mkdtempSync(…,'ace-pipeline-stub-')` |
  | 输出文件名 | `claude.exe` / `claude` | 同 | 同 |

  三套的编译输入与输出路径全不相交（`mkdtempSync` 每次新建唯一目录）。唯一相同的是**输出文件名**，而那是 backend resolver 强制的——路径不同的两个 `claude.exe` 不是同一个文件。**我原先写的「并发编译同一 stub 二进制的资源竞争」，其前提不成立，该归因作废。**
- **机制已定（3.6.4，D6 第三档）**：Windows 并发 spawn 刚编译的原生可执行文件，约 0.6%–0.8% 返回 `0xC0000043` / `0xC0000142` 映像加载失败，零字节输出。裸 spawn 对照组给出同样比率 ⇒ 与 dispatcher 与两套 stub 均无关。~~待查机制：同名文件被外部程序按名加锁 / gcc 中间文件 / 与 `child.on('exit')` 同源的竞态~~——第三条已被排除：`dispatch-worker.mjs:490` 现读 `'close'`，且中途截断会抛 SyntaxError 而不是让 `notEqual(argv, null)` 失败。
- **归属**：任务 #20，已交付。**当初禁止「因为重跑变绿就记为已解决」的约束正确且必要**：本轮多次出现 480 次 0 红的批次，若停在那里就会把机制记成"已消失"。

**两条归因方法要点**：① 判断「是不是我引入的」不能只复跑我的路径，必须同时跑一条绕过我改动的路径。② 三步归因（单独跑 / 绕过自己跑 / 复跑）回答的是「**是不是我引入的**」，回答不了「**是什么引入的**」——后者需要独立于「现象消失」的证据：读源码确认机制前提成立，或构造该机制的最小复现。**假机制比没有机制更糟**：没有机制留下一个待查问题，假机制会关闭它，下一个人去修一个不存在的共享二进制而真因还在。详见 `mutation-methodology.md` §2 D6 的三档写法。

**过滤器不构成绕过点**：守护基于 `discovered`（全树）而非 `files`（过滤后），实测 `node scripts/run-tests.mjs kernel-identity` 仍打印 `Discovered 22 ... running 1` 并执行守护。

### 3.6.4 #20 已定机制：`argv !== null` 低频红是 Windows 进程创建的映像加载失败（D6 第三档）

**先读断言，不先跑循环。** `dispatch-argv-integrity.test.mjs:93` 是
`argv: raw ? JSON.parse(raw).argv_echo : null`，`:102` 是 `assert.notEqual(argv, null, 'precondition: …')`。因此 `argv === null` 只有三种成因，而**中途截断不在其中**：

| 形态 | 条件 | 会不会产生这条红 |
|---|---|---|
| (a) 无 artifact | `audit.raw_artifact` falsy，即走了 `launched:false` 的早退路径 | 会 |
| (b) **空 artifact** | 文件存在但 0 字节 ⇒ `raw === ''` 是 **falsy** ⇒ 三元取 `null` 分支，`JSON.parse` 根本没被调用 | **会（实测就是这条）** |
| (c) 无 `argv_echo` 键 | 解析成功但不是本 stub 的回复 | 会 |
| 部分截断 | `JSON.parse('{"resu')` **抛 SyntaxError** | **不会**——红会是那个 SyntaxError，不是 `notEqual` |

**这一步就否掉了派工里的头号候选。** 「`child.on('exit')` 不保证 stdout 排空」只有在**零字节极限**下才能产生这条断言的红；任何中间程度的截断都会给出一条形态不同的红。且 `dispatch-worker.mjs:490` 现已是 `child.on('close', …)`（#19 已改），该竞态不再可用作成因。

**实测机制（每格 480 次 dispatch，均在 INTACT 窗口）**：失败形态恒为
`raw_bytes=0`、`raw_original_bytes=0`、`timed_out=false`，退出码是 NTSTATUS 映像加载失败：

- `3221225539` = `0xC0000043` **STATUS_SHARING_VIOLATION**（映像打不开）
- `3221225794` = `0xC0000142` **STATUS_DLL_INIT_FAILED**（映像打开了，DLL 初始化失败）

**四组对照，逐个排除候选**：

| 实验组 | 变量 | 结果（每 480 次） | 结论 |
|---|---|---|---|
| `load` 共享一个映像，宽度 12 | 基线 | 1 / 4 / 4 / 3 | 复现 |
| `distinct` 12 个各自独立映像，宽度 12 | 去掉映像共享 | 2 / 1 / 4 | **与基线不可区分 ⇒ 映像共享不是成因** |
| `load` + stagger 60ms | 降低 spawn 速率 | 2 / 2 / 0 / 0 | **速率不是成因** |
| `spawn-floor` **裸 `child_process.spawn`，无任何产品代码** | 去掉 `dispatchWorker` | **4 / 3 / 4** | **速率与形态与基线一致 ⇒ 与 dispatcher 无关** |

**故 D6 第三档（机制）**：在本机上并发 spawn 一个刚编译出的原生可执行文件，Windows 会以约 **0.6%–0.8%**（3–4/480）的比率返回映像加载失败，子进程一个字节都没写出，`dispatchWorker` 忠实地把 0 字节落盘，测试的前提断言随之为假。**这不是 dispatcher 的缺陷，也不是两套 stub 的相互干扰**——裸 spawn 在没有任何产品代码参与时给出同样的比率和同样两个 NTSTATUS。最小复现：`node .ace/tasks/implement-auto-goal-v2/artifacts/spawn-floor-probe.mjs 40 12`。

**「共享 stub 二进制」这一族归因至此被第四次否证**，其中第四次是**本探针自己提出的版本**：我先看到 `load` 1/192 而 `distinct` 0/192，几乎写成"映像共享是成因"；把两格各跑到 480 次后两者不可区分（2/1/4 对 1/4/4），**先前那个 0/192 是小样本运气**。这正是本任务反复出现的形态：低频事件下，样本量不足的对照组会给出一个看起来很干净的因果结论。

**该「运气」现已算出确切大小，且比"运气"这个词暗示的严重得多**（`(1-p)^n`，`p=0.6%`）：

| 基础率 | n=192 缺席概率 | n=480 | 95% 信心所需 n |
|---|---|---|---|
| 0.6% | **31.5%** | 5.6% | 498 |
| 0.8% | 21.4% | 2.1% | 373 |

而两格对照下「**恰好一格 0、另一格 ≥1**」的概率是 **43.1%**（`2·(1-p)^n·(1-(1-p)^n)`）——**那个"看起来很干净的因果差异"是该设计下最可能的单一结局，不是一次罕见的坏运气；第一轮对照的结论方向基本随机。** 故 n=192 那两格**在任何方向上都不构成证据**，本报告只引用 480 次那组。判据已写入方法论 D5b（对照组样本量必须由基础率决定；而基础率往往正是本次调查要测的东西，所以第一轮只用于估率）。

**给 owner 的判断（我不改 `tests/`）**：该前提断言当前测的是**环境**而不是它声称要测的 `shell: false`。落点是个真缺陷——0 字节的映像加载失败与"dispatcher 把 stdout 读短了"在这条断言上不可区分，而后者是真正要防的。建议由 owner 择一：① 断言区分二者（`audit.exit_code` 是映像加载失败时报环境错误而非契约失败）；② 对该 NTSTATUS 集合重试一次并计数。**我未改动这三个文件中的任何一个。**

**team-lead 已择 ①，并补了一条我没给出的理由，我认为它比我的理由强**：② 会让这条断言**在环境噪声下变绿，而它现在测的正是环境**——重试把「一条已经测错东西的断言」变成「一条测错东西且不再报警的断言」。**这一点排除 ② 的力度比我原来的「重试很脏」大得多**：脏是风格问题，而「让唯一能观测到该现象的通道静音」是能力问题。判据可一般化为：**当一条断言被查明测错了对象时，任何降低其报警率的改法都是在加固错误，而不是修它。**

**实施 ① 所需的落点与数值，一并给 owner（我不改，故只给事实）**：
- 断言点**是三处而非一处**：`:102`（带 `precondition:` 说明）、`:114`、`:131`。三处都调同一个 `receivedArgv()`（`:92-93` 取 `raw_artifact` → `JSON.parse(raw).argv_echo`），故**该 flake 命中的是这个 helper，不是某一个用例**——只改 `:102` 会留下两处同缺陷。
- 需要区分的两个 NTSTATUS（十进制，即 `audit.exit_code` 的实际取值）：`0xC0000043 STATUS_SHARING_VIOLATION` = **3221225539**，`0xC0000142 STATUS_DLL_INIT_FAILED` = **3221225794**（另 `0xC0000135 STATUS_DLL_NOT_FOUND` = 3221225781 在本轮未观测到，但同族）。
- 判据形态：`exit_code` ∈ 该集合且 `raw_bytes === 0` ⇒ 环境错误（该轮不构成契约结论）；`exit_code === 0` 而 `argv === null` 或 `raw_bytes` 读短 ⇒ **契约失败，必须红**。**两者分开报，才是「不可区分的两件事不再共用一条断言」。**

**本节读数的窗口纪律**：所有引用的计数均取自 `WINDOW INTACT` 的批次（21:06–21:13Z，digest `79fd00dba167`）；21:07:46、21:14:04、21:14:32 三批 `WINDOW VIOLATED`，**其绿与红一并作废、不在上表**。21:13:52Z 的 `--verify 42483a4d050e` 报 BROKEN 并点名 `dispatch-worker.mjs` 已改写，故本节全部行号（`:93`/`:102`/`:490`）是在当前树上重新核对过的，不是从早先阅读中沿用的。

**探针自身的一个缺陷（第六个自查项）**：`argv-flake-probe.mjs` 首版的红检测器按 TAP 的 `not ok` / `# fail` 解析，而 **Node 24 的默认 reporter 打印的是 `ℹ fail 1` 与 `✖ name`**——检测器对真红完全失明，头 20 轮报出的 `0 red` 是一个**不可能打印出红的检测器给出的绿**。修法有两处：强制 `--test-reporter=tap`，并加一档 `sensitivity` 子命令，用一条合成的同名红先证明检测器能看见它，**看不见就拒绝输出任何计数（exit 2）而不是输出 0**。这与 F1/F2/F10 三次假 skip 同根：输出里没有任何东西区分「跑了没找到」与「根本不可能找到」。

## 4. 全仓 skip / 条件跳过普查

### 4.1 node:test 跳过语义（先实证，再据此判定）

%TEMP% 探针五例，一次跑清语义：

| 写法 | TAP | 计入 |
|---|---|---|
| `if (cond) return;` | `ok 1` | **pass** |
| `t.skip(reason); return;` | `ok 2 # SKIP` | skipped |
| `test(name, {skip}, fn)` | `ok 3 # SKIP` | skipped |
| `assert.ok(true, reason)` | `ok 4` | **pass** |
| `t.skip()` 后继续执行失败断言 | `not ok 5 # SKIP` | **fail 0、exit 0** |

第 1、4 行是「假 skip」的两种形态；第 5 行是 F6。

### 4.2 全仓条件跳过清单

`tests/` 下 21 个测试文件、共 434 项，只有两个门控机制 + 一处环境探测：

| 位置 | 机制 | 门控 | 无条件时 |
|---|---|---|---|
| `capability-live.test.mjs:22-23` | 注册期 `{skip}` | `ACE_LIVE_SPIKE=1` | 5 项 skipped（**正确、可观测**） |
| `stub-backend-rejection.test.mjs:100` | 注册期 `{skip}` | C 编译器探测 + `ACE_REQUIRE_STUB_BACKEND` | 8 项 skipped，置位则硬失败（**正确、可观测**） |
| `dispatch-argv-integrity.test.mjs:71` | 注册期 `{skip}` | 同上（本轮他人新增） | skipped，置位则硬失败（**正确**） |
| `dispatch-pipeline.test.mjs:90` | 注册期 `{skip}` | 同上（本轮他人新增） | skipped，置位则硬失败（**正确**） |
| `kernel-artifacts.test.mjs:143` | `t.skip()` + 立即 `return` | `symlinkSync` 是否可用 | 计入 skipped（**正确**；本机有权限故实跑，`ok 11` 非 skip） |
| **`backend-isolation.test.mjs:73`** | **`if (resolved === null) return;`** | `resolveBackend()` | **计入 pass（F2）** → 已修为注册期 skip |

（此表的行数随并发方增删测试而变；上表为 19:42 复验后的状态，后两个 stub 套件是本轮新增。）

### 4.3 F2 详证：第二处「提前 return 冒充 skip」

`tests/backend-isolation.test.mjs:71-75`——`resolver never returns a .cmd/.bat/.ps1 shim`：

```
const resolved = resolveBackend();
if (resolved === null) return; // no backend installed here; live tests will report BLOCKED
assert.doesNotMatch(resolved.bin, /\.(cmd|bat|ps1)$/i);
```

实测三种环境下该用例的 TAP 行：

| 环境 | `resolveBackend()` | 该用例 | 整文件计数 |
|---|---|---|---|
| 本机原样 | 命中 `claude.exe` | `ok 4` | 13/13 pass、0 skipped |
| 仅 `PATH=/nonexistent` | 仍命中（`via: execpath`，因 `CLAUDE_CODE_EXECPATH` 兜底，`backend-resolve.mjs:51`） | `ok 4` | 13/13 pass、0 skipped |
| `PATH` + `CLAUDE_CODE_EXECPATH` + `ACE_CLAUDE_BIN` 三者全清 | **null**（已单独打印确认） | **`ok 4`** | 12 pass / 1 fail（fail 是 F1，与本项无关）、**0 skipped** |

即：断言一次未执行，输出与执行过时**完全一致**，skip 计数不变。这与 C05 修复前的第五个实例是同一形态，出在同一个文件的同一层面上。附带发现：想让 `resolveBackend()` 返回 null 必须同时清掉 `CLAUDE_CODE_EXECPATH`——单清 `PATH` 不够（`candidatePaths()` 有 execpath 兜底），任何想复现「无 backend」的测试都得注意这点。

**建议修法**（不由我实施）：改成注册期 skip，即在模块顶层同步调一次 `resolveBackend()`，`test(name, { skip: resolved ? false : 'no backend installed' }, ...)`。

### 4.4 「用例整体消失」排查 —— 未发现

逐文件对比「顶层 `test(` 声明数」与「TAP 报告数」，21 个文件**全部相等**（32/13/5/11/41/17/27/28/9/18/11/11/19/27/15/27/23/49/26/17/8），无用例因写在条件块里而从计数中消失。同时确认全仓无 `assert.ok(true, ...)` 型恒真断言（C05 修复时删掉的那处是唯一实例）、无 `process.exit` 用法、无 `.todo`。

---

## 未能核查项及原因

1. **Node 18 与 Node 22 的实机行为**：本机 nvm 只有 v12.14.1 / v20.12.0 / v24.13.0。已用 20 与 24 覆盖「目录 positional 从 22 起变 glob」这条边界的两侧结论，但 18 与 22 上的退出码传播未实测。风险低（`run-tests.mjs` 只用显式文件列表，不依赖版本特性），但不等于已验证。
2. **CI 镜像是否真的自带 gcc/clang**：无法在本机证实 `ubuntu-latest` 与 `macos-latest` 的镜像内容。若某个镜像没有编译器，`ACE_REQUIRE_STUB_BACKEND=1` 会让那个 job 红——**这正是开关的设计意图**（宁红不静默），但首次 CI 运行前无法确认它不会误报。建议首跑后核对一次实际 TAP 计数。
3. **`windows-latest` 的实际 skip 数**：预期 13 skipped（5 live + 8 C05），依据是本机「无 gcc」模拟，非真实 runner。
4. **F1 在真实 CI 上的表现**：本机以「三个环境变量全清」模拟无 Claude CLI，与真实 runner 不完全等价（runner 上根本没有该二进制，本机是让解析找不到它）。两者在 `resolveBackend() → null` 这个决定性条件上等价，故结论可迁移，但严格说是模拟。
5. **`npm install` 的实际依赖漂移幅度**：未实跑 `npm install` 对比 lockfile 前后差异（会写工作树，且本任务禁止修改仓库）。仅论证了漂移不影响测试结论。
6. **GHA 表达式取值未在真实 workflow 上观测**：3.5 的佐证来自 `actions/runner` 求值器源码（`IsFalsy` / `And.cs` / `Or.cs`）加本机等价性实测，**未**在一次真实 CI 运行里打印 `ACE_REQUIRE_STUB_BACKEND` 的实际值。**本轮已消解**：3.6 的环境自述会在每次运行开头打印该变量实际值，故首次 CI 跑的日志即含此事实，无需另加 `echo` 步骤。3.5 的**主结论**本就不依赖该观测（只依赖 `=== '1'` 这行本仓代码），受影响的仅是「windows 那格实际拿到什么字符串」这个更细的问题。

## 实验卫生

所有实验在 `os.tmpdir()` 副本上进行；仓库产品文件的修改共三处，均为派工范围内：`scripts/run-tests.mjs`（3.6 发现面守护）、`plugin/skills/auto-goal-v2/tests/stub-gate-cohesion.test.mjs`（新建，F10 消费端门禁）、`tests/ci-stub-gate-wiring.test.mjs`（新建，F10 生产端门禁）。`plugin/skills/auto-goal-v2/` 的 `lib/`、`scripts/`、既有 `tests/` 文件全程只读——`replyFiles`、`readManifestIndex`、`semantic-validator.mjs` 一律未碰。临时目录已全部清理。**审计期间其他子 Agent 持续写入本树，故本报告的读数纪律是：带时刻 + 带 D7 窗口判定，二者缺一即作废**（工具与实测见 3.6.1）。

本轮新增的方法论工具（均在 `.ace/tasks/implement-auto-goal-v2/artifacts/`，非产品代码）：`tree-snapshot.mjs`（D7 窗口守护，`--run` / `--verify` 两档，digest 带采样面标注）、`verify-read-window.mjs`（`--verify` 的 9 例变异探针）、`mutate-f10.mjs`（F10 的 10 项变异）、`d7-writer-probe.cjs`（独立进程并发写入者）、`argv-flake-probe.mjs`（#20 的五档探针：`sensitivity` / `direct` / `load` / `distinct` / `fresh` / `pair`，其中 `sensitivity` 是计数的前置门禁）、`spawn-floor-probe.mjs`（裸 spawn 对照组，把 dispatcher 从画面里移除）、`probe-pipeline-parse-flake.mjs`（`dispatch-pipeline` parse 阶段单红的 harness 层插桩，打印 `exit_code`/`raw_bytes`/`timed_out`）、`recent-writes.mjs`（**辅助定位工具，非窗口证据**——自报滞后闭窗时长与该滞后下的实测失明数，见 3.6.5）。**八者都是可执行的判定器，不是文档声明**——本任务反复出现的失效正是「声明了却无人校验」。

**`tree-snapshot.mjs --run` 的一个使用陷阱（本轮自己踩到两次）**：它守护的是"树在跑之前和跑之后一样"，**不校验被跑的命令是否真的跑成了**。我两次把不存在的路径传给 `--run`（`plugin/skills/auto-goal-v2/scripts/run-tests.mjs` 实际在仓库根），命令以 `MODULE_NOT_FOUND` 立即退出，而守护照常打印 `WINDOW INTACT -- reading is admissible (exit 1)`。**"窗口完整"与"读数存在"是两件事**，前者为真时后者可以是空的——这与 F1/F2/F10 的假 skip 同形，也说明每一份读数都必须同时引用被测命令的实际输出（本报告的计数表因此都带 `tests/pass/fail` 三个数，而不只带窗口判定）。

**「自称某状态而其成立条件无人校验」这一族，本轮共记四种形态**：F1/F2/F10 的门禁自称「本环境不适用」（假 skip）；`--run` 自称「读数可采信」而命令根本没跑起来（上一段）；回扫自称「窗口内无写入」而 mtime 只记最后一次写入（3.6.5）；以及探针的豁免名单自称「此例不必测」而实情是「此例没有杀手」（3.6.3 末）。**四种形态的检出方式各不相同，共同点只有一条：去问那句自称本身是被什么校验的。**


3.5 的补审同样只读：`plugin/` 树复制到 `/tmp/ace-envprobe-*`，六格测量与两条反事实全在副本上跑，收尾时以 `diff` 确认副本与仓库的 `stub-backend-rejection.test.mjs` 逐字节相同后删除副本。此处顺带记录一条方法学：`diff -r` 报出 `journal-append.test.mjs` 有差异，方向是**仓库比副本多两个用例**（B1 修复方并发新增），非我改动——比对时必须看差异**方向**，否则会把「别人在推进」误判成「我污染了仓库」。

---

## F1 / F2 修复与实证（2026-08-13，v2-review 追加）

### F1 已修复：预算门用例不再依赖机器上装了什么

**根因复现（`probe-f1.mjs`，先验证前提再下结论）：**

```
PREMISE resolveBackend({PATH:""}) = null
F1 no-backend env  : reason=no_clean_context_backend   ← CI 上的实际行为
F1 proposed fix env: reason=launch_payload_over_budget ← 注入 backend 后
```

**修法**：该用例的被测面是**预算门**，而预算门位于 backend 解析**之后**，所以用例必须自带 backend，而不是碰运气用机器上的。注入 `{ PATH: '', ACE_CLAUDE_BIN: process.execPath }`——`process.execPath` 在所有平台都是真实原生二进制，解析必定成功；随后预算门在**任何 spawn 之前**拒绝，被测面被干净隔离。用例内另加一条前提断言 `resolveBackend(env) !== null`，使「注入失效」表现为前提失败而非结论失败。

**承重性实证**（把注入删掉、其余不动，空 PATH 下单跑）：

```
not ok 14 - C02/C03: over-budget dispatch does not launch and writes no artifact
  actual: 'no_clean_context_backend'
# pass 12  # fail 1
```

即修复确实承重，不是恰好变绿。

### F2 已修复：提前 return 改为注册期 skip

`resolver never returns a .cmd/.bat/.ps1 shim` 原为 `if (resolved === null) return;`——断言一次未执行而 TAP 报 `ok`，与真跑过完全无法区分。改为模块加载时解析一次，把 skip 交给 `node:test` 自己的 `skip` 选项。空 PATH 下实测：

```
ok 4 - resolver never returns a .cmd/.bat/.ps1 shim ... # SKIP no clean-context backend installed on this machine
# pass 13  # fail 0  # skipped 1
```

**skip 计数从 0 变为 1**，即「没跑」现在在输出里可见。

**同时补上机器无关的另一半**：新增 `a real .cmd shim with no native sibling is refused, not returned`。原用例只用**不存在的路径**证明 shim 被拒，而任何 `isFile` 检查都会拒绝不存在的文件——真正需要证明的是**真实存在的 shim 也必须被拒**。该用例在临时目录里写出真 `claude.cmd`，经 `ACE_CLAUDE_BIN` 与 `PATH` 两条路径分别断言返回 null，且不依赖机器状态（M39 变异 KILLED）。

附带确认审计正文那条注记确有实操后果：`PATH` 只清不够——本机 node 安装目录**自带 `claude.cmd`**，`PATH` 指向 node 所在目录时 `resolveBackend` 仍经 shim 命中原生兄弟。要复现「无 backend」必须给一个真空目录，`CLAUDE_CODE_EXECPATH` / `ACE_CLAUDE_BIN` 也要一并清掉。

### 三种 CI 等价环境的实测（修复后）

| 环境 | tests | pass | fail | skipped |
|---|---|---|---|---|
| 本机原样（backend + gcc 在位） | 466 | 461 | **0** | 5 |
| 类 ubuntu/macOS：无 backend、有 gcc、`REQUIRE=1` | 466 | 460 | **0** | 6 |
| 类 windows：无 backend、无 compiler、`REQUIRE` 未设 | 466 | 431 | **0** | 35 |

修复前第二、三行各有 1 个 fail（即九个 job 全红的成因）。

另：新建的 `tests/dispatch-argv-integrity.test.mjs` 同样接入 `ACE_REQUIRE_STUB_BACKEND` 三元开关，已实测在 `REQUIRE=1` 且无编译器时**硬失败**（`ACE_REQUIRE_STUB_BACKEND=1 but the argv-echo stub is unavailable: no C compiler...`），不会在 CI 里静默停止测试。

*—— v2-review，2026-08-13。绑定版本：`scripts/dispatch-worker.mjs` = `ef4be041…57c0bbaa`（460 行）。*
