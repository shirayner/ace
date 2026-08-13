# 空输出不可归因 与 编译期整文件死亡：处置记录

任务 #26 / #27。两处都不是产品缺陷，都是**量具缺陷**——失败发生时，日志说不出原因。
所以验收标准不是"套件变红"（没有东西可以变红），而是**注入失败后，输出是否给出它声称的诊断**。

---

## 缺陷 1（#26）：stub 三处静默 `return 0`

### 观察

第 57 轮 census：raw artifact 摘要 `e3b0c44298fc`，即 `sha256("")`。管线报
`cli_output_unparseable`。

### 为什么这是缺陷

`dispatch-pipeline-stub.c` 的每条失败路径都 `return 0` 且不写任何字节。对 dispatcher 来说，
这与"后端正常运行、选择回复空内容"**逐字节相同**：空 stdout、空 stderr、exit 0。于是红色报告
只说了症状（无法解析），却销毁了原因（为什么没有输出）。日志无法区分：

- `ACE_STUB_REPLY_FILE` 打不开
- 回复文件真的是空的
- `malloc` 失败

三种原因，一种观察形状。**这个缺陷独立于第 57 轮究竟哪一条失败了** —— 无论原因是什么，
量具都不该让原因不可恢复。

### 修复

引入 `die(what, detail)`：写 stderr（含路径与 errno），返回 42。三处静默返回全部改为调用它。

关键点：dispatcher **不以 `exit_code` 判定**，所以非零状态本身不改变任何行为；真正让下次
可归因的是 stderr 文本，`pickRawStream` 会在 stdout 为空时把它提升进 raw artifact。
非零状态仍然设置，是为了人读 transcript 时看到失败而不是干净退出。

`dispatch-ghost-stub.c` 的 `GetModuleFileNameA` / `_spawnl` 失败路径同样改响。
但"没有 reply file"保持安静——`measureDetachLatency` 正是这样调用它来测量 detach 延迟的，
那是**一种模式，不是失败**。

### 经验假设未被证实

`probe-fopen-fresh-file.mjs`：300 轮"写入临时文件后立刻打开"，**零次失败**。
所以"新文件短暂不可打开"这一假设**未被证实**。修复的正当性是**instrumentation**
（让下次发生可归因），**不是**已证实的第 57 轮修复。这一点写进了 stub 的注释里。

### 验证（`verify-loud-failures.mjs` F1）

注入一个必然打不开的路径（父目录不存在），读**产物**而非断言：

| 检查 | 结果 |
|---|---|
| 失败不再是零字节 | PASS — `raw_bytes=153`（原 0） |
| raw artifact 点名失败的变量 | PASS |
| raw artifact 点名打不开的路径 | PASS |
| raw artifact 携带 errno | PASS — `errno 2: No such file or directory` |
| exit code 标记失败 | PASS — `42` |
| dispatch 仍被拒绝，未被"修好" | PASS — `status=FAILED` |

被检验的是**最后一环**——原因确实抵达了人会读的产物。这一环原本是我推理出来的，不是量出来的。

---

## 缺陷 2（#27）：gcc 编译失败导致整文件 import 期死亡

### 观察

census 一次（75 轮中）：`gcc` 退出 3221225539（0xC0000043，STATUS_SHARING_VIOLATION），
stderr **为空**。编译在模块求值期裸跑，异常杀死整个文件：`node --test` 只报
`<file>:1:1` 一个匿名失败，**8 个用例一个都没注册**。

stderr 为空意味着 gcc 根本没走到编译——故障在创建进程或其输出映像，不在 fixture。

### 为什么不降级为 skip

缺少编译器是无法改变的环境事实；编译**失败**通常是 `.c` 写坏了。把后者静默 skip，
会让真实缺陷藏在与"无工具链"相同的绿色后面。所以两者必须分开，并且**用重试从经验上区分**：

- 语法错误的 fixture 每次都同样失败 → 连同编译器诊断一起抛出，文件保持红色
- 瞬时拒绝在后续尝试成功 → 只花掉一次重试

耗尽仍然抛出而非 skip，`ACE_REQUIRE_STUB_BACKEND` 因此保持单一含义（只管无工具链的 skip）。

### 机制未被证实

`probe-gcc-sharing-violation.mjs`：480 次编译，跨并发/串行 × 共享/隔离 `%TEMP%` 四个臂，
**零次失败**。所以 0xC0000043 的成因**未被证实**。已修的是确定性的那一半——
一次坏编译不该抹掉 8 个测试——不声称找到了原因。

### 验证：量具本身先被检验了两次

用一个计数的 `gcc` 注入到真 gcc 之前，"瞬时"与"永久"只差注入次数，不是两段分别写的场景。
**这个量具错了两次，两次都被 F0 基线抓住**——这是本次最有价值的部分：

**第一次：`gcc.cmd` shim 根本没被执行**（`invocations=0`）。
`findCompiler` 用 `execFileSync` 且无 shell，win32 下**根本无法执行 .cmd**（实测 ENOENT）。
PATHEXT 是 shell 的特性，不是 CreateProcess 的。于是 shim 隐形，`findCompiler` 穿透到真
gcc.exe，**三个臂测的都是未注入的套件**。若无基线，会把三个臂当作已运行来报告。

**第二次：`.exe` wrapper 破坏了透传**（基线臂每次编译都失败）。
`gcc.exe` 是**驱动器**，它按 `argv[0]` 推导自身镜像位置来定位 cc1/as/ld。原样转发 argv 使
`argv[0] == "gcc"`——一个裸名，驱动器会经 PATH 重新解析，而 wrapper 目录此刻排在最前——
于是真 gcc 把工具链根算成了 wrapper 的临时目录，死于 `cannot execute 'cc1'`。
`probe-gcc-wrapper-argv0.mjs` 用只差一行的两个臂隔离了这一点：

| 臂 | argv[0] | 结果 |
|---|---|---|
| A | `"gcc"`（原样） | status=1，`cannot execute 'cc1'` |
| B | 真 gcc 绝对路径 | status=0，干净编译 |

`--version` 必须永远成功**且不计数**：它是 `findCompiler` 在探测编译器，不是被测的编译；
计入会让每个臂偏移 1。

### 最终结果（20/20 全通过）

| 臂 | 观察 | 判定 |
|---|---|---|
| F0 基线（永不失败） | `invocations=1 pass=8 fail=0` | wrapper 确实在 PATH 上且透明 |
| F3 瞬时（失败 1 次） | `invocations=2 pass=8 fail=0 skipped=0` | 重试恰好一次；8 个用例全部注册，无一丢失 |
| F2 永久（始终失败） | `invocations=3 pass=0 fail=1 status≠0` | 坏 fixture 保持红色，错误携带退出状态 |
| F4 泄漏 | `before=30 after=30` | 丢弃的尝试被清理 |

F3 的 `pass === SUITE_CASES` 用的是**从 F0 基线读出的数**，不是硬编码——所以比较的是文件
当前真实内容。这也顺带纠正了注释里的陈旧数字："22 个用例"实为 8（22 是整个 tests 目录的计数）。

---

## 顺带核实

- 全量套件：**501 tests，496 pass，0 fail，5 skipped**
- 5 个 skip 全是 `ACE_LIVE_SPIKE=1` 的真机 opt-in，每个都有会真跑的离线 stub 对应项（C05 家族）→ 非假绿
- 干净跑一遍套件**不泄漏**临时目录（ghost 30→30、pipeline 28→28）；此前 58 个残留是被中断的
  census/probe 遗留，非产品缺陷，已清理
