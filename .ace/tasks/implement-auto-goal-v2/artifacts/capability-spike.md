# clean-context 能力 Spike

任务：implement-auto-goal-v2 / Task #1
日期：2026-08-13
结论：**能力成立（DONE）**。无需硬阻塞。

设计参考：§8.1 调度边界、§8.2 摄入前处理顺序、§8.3 超限处理、§16 的 X02/X04/C02/C03/C04/C05/C07。

---

## 1. 结论摘要

`claude -p` 原生二进制可作为 clean-context worker backend，由 Skill 私有 Node ESM 脚本经
`child_process.spawn`（`shell: false`）包装。三项设计要求均以实测证据成立：

| 要求 | 结论 | 决定性证据 |
|---|---|---|
| 不继承调用会话历史 | 成立 | 隔离运行摄入 452 tokens；`--resume` 同一会话摄入 2532 tokens。差异可检测，且默认不发生 |
| 输入在模型摄入前经过字节预算 | 成立 | 载荷字节在 spawn 前计算；超 16 KiB 时 worker 进程不启动，返回 `DISPATCH_REJECTED` |
| 输出只通过受限 envelope 返回 | 成立 | 原始 stdout 先落盘再解析；调用方仅得到 ≤1 KiB envelope + artifact 路径 |
| 跨 Windows/POSIX 可实现 | 成立（含一个硬约束） | 见 §4.1 `.cmd` shim 的 EINVAL 问题 |

这**不是**"普通 Agent 返回后裁剪"：worker 是独立 OS 进程，其模型在一个我们控制全部输入的
上下文里运行；超限输入根本不会被任何模型读到。

---

## 2. 隔离的决定性实验

单看 `usage.input_tokens` 会得出**错误结论**。实测三次运行：

| 运行 | input_tokens | cache_read | 实际摄入 |
|---|---|---|---|
| 种子（9 KB 消息，持久化会话） | 122 | 2304 | **2426** |
| `--resume` 同一 session_id | 228 | 2304 | **2532** |
| 全新隔离会话（相同提问） | 196 | 256 | **452** |

- 正向对照：`--resume` 确实继承历史，摄入 2532，模型能看到先前消息。
- 负向对照：默认隔离运行摄入 452，模型答"0"（未见先前消息）。
- 因此该指标**有检测能力**，不是恒真断言 —— 这是本 spike 的核心。

**测量陷阱**：`input_tokens` 单独看时 resume(228) 甚至*小于*种子运行，历史完全被隐藏在
`cache_read_input_tokens` 里。缓存前缀仍是模型条件化过的 token，必须计入。
`ingest-audit.mjs` 的 `ingestedTokens()` 就是为封住这个陷阱而存在。

补充证据（跨进程无记忆）：

- 运行 A 提交 `Remember this secret token: ZEBRA-7741` → 回 `STORED`。
- 运行 B 询问同一 token → 回 `UNKNOWN_TOKEN`。
- 要求复述"先前所有消息" → 隔离运行回 `NO_PRIOR_CONTEXT`。

另有一次**未加隔离参数**的对照运行泄漏了调用方会话的历史正文（复述出无关的中文需求分析
材料），证明隔离不是默认行为，而是由参数集显式获得的。

---

## 3. 隔离所依赖的参数与环境

`--bare` 是主开关。相同提示下摄入量：

| 配置 | 摄入 tokens |
|---|---|
| `--bare` + `--tools ''` + `--setting-sources ''` | **170** |
| 同上 + 自定义 `--system-prompt` | 197 |
| 去掉 `--bare`（加载 CLAUDE.md/skills/plugins） | **2498** |
| 去掉 `--bare` + 默认工具 + 用户 settings | 超 90 s 未返回（不可用） |

固定 argv（`buildArgs()`），每个 flag 都承重：

```text
-p --bare --no-session-persistence --setting-sources '' --tools ''
--output-format json [--system-prompt <contract>] [--model <m>] [--json-schema <s>] --max-turns 1
```

禁止出现：`--resume` `-r` `--continue` `-c` `--session-id` `--fork-session` `--teleport` `--add-dir`。
`assertIsolatedArgs()` 在 dispatch 前强制校验，缺失必需 flag 或出现禁用 flag 均抛
`INVARIANT_VIOLATED`。

环境净化（`cleanEnv()`）剥离两类变量，各有独立理由：

1. `CLAUDE_CODE_SESSION_ID` / `CLAUDE_CODE_CHILD_SESSION` / `CLAUDECODE` /
   `CLAUDE_CODE_ENTRYPOINT` / `CLAUDE_CODE_EXECPATH` — 父会话身份，避免子进程与调用会话关联。
2. `ANTHROPIC_AUTH_TOKEN` — 见 §4.2，这是一个会伪装成"挂起"的故障。

---

## 4. 两个必须记录的环境陷阱

### 4.1 Windows `.cmd` shim 不可免 shell spawn

`PATH` 上先命中的是 `claude.cmd`。Node `spawn(cmd, args, {shell:false})` 抛
`Error: spawn EINVAL (errno -4071)`。而 `shell: true` 不可接受 —— dispatch 路径要传递
不可信的 objective 文本，引入 shell 会带来引号与注入风险。

解法：shim 只作为**指针**，映射到同级原生二进制
`<dir>/node_modules/@anthropic-ai/claude-code/bin/claude{.exe}`；该二进制不存在则拒绝此候选。
`resolveBackend()` 保证返回值永不是 `.cmd`/`.bat`/`.ps1`。

候选顺序：`ACE_CLAUDE_BIN` → `PATH` 扫描 → `CLAUDE_CODE_EXECPATH`。

### 4.2 401 重试循环伪装成挂起

初次探测中 `claude -p` 无任何 stdout/stderr 输出，持续到超时被 kill。看起来是挂起或网络
不可达（已排除：直连 API 200 OK）。`--debug-file` 才揭示真相：

```text
[ERROR] API error (attempt 1/11): 401 {"detail":"Invalid API key..."}
... 指数退避重试至 attempt 11
```

根因：环境同时存在 `ANTHROPIC_API_KEY`（指向 `ANTHROPIC_BASE_URL` 的网关）与
`ANTHROPIC_AUTH_TOKEN`（属于另一个本地代理）。auth token 优先级更高，与 base URL 不匹配，
每次请求 401，CLI 静默重试 11 次。剥离 `ANTHROPIC_AUTH_TOKEN` 后同一命令 6.1 s 返回。

运维含义：worker 启动无输出时**不要**当作超时处理，应视为凭证歧义。缺失全部凭证时行为是
干净的（exit 1，`Not logged in`），可区分。

---

## 5. 摄入前处理顺序的实现

`dispatchWorker()` 按 §8.2 固定顺序执行，raw 正文**不作为返回值**存在：

```text
resolveBackend → injectedBytes → checkLaunchBudget(16 KiB) ─超限→ DISPATCH_REJECTED（不 spawn）
  → spawn(shell:false, cleanEnv) → CAPTURE stdout/stderr
  → RAW ARTIFACT WRITE + sha256          ← 成功或失败都先落盘
  → JSON PARSE（CLI envelope）
  → JSON PARSE（worker 输出）─失败→ RESULT_REJECTED + pointer（不含 summary）
  → status 枚举校验 ─失败→ RESULT_REJECTED
  → projectEnvelope（≤1 KiB，逐层丢字段，不字符串截断 JSON）
  → 返回 {envelope, audit}
```

关键语义已实测：

- **C04**：worker 输出 400×BANANA（raw 7960 bytes）→ envelope ≤1 KiB，summary ≤400 bytes，
  raw 仅经 `audit.raw_artifact` 路径可达。
- **C05**：worker 回非 JSON → `RESULT_REJECTED`，envelope **不含** `summary` 字段，
  避免"看起来合理"的摘要进入主模型。
- **C02/C03**：超 16 KiB 载荷 → 未 spawn，未写 artifact，返回含各组成项字节数的拒收 envelope。
- **C07**：`../`、绝对路径、`C:/` 盘符前缀全部拒绝，且拒绝发生在触碰文件系统之前。
- envelope 超限时按 §8.3 逐层降级（claims → artifact_refs → 仅 code+pointer），
  始终保持可 `JSON.parse`。

`--json-schema` 亦可用（实测能约束结构化输出），当前作为可选参数暴露，未设为必需。

---

## 6. 创建的文件

脚本（零第三方依赖，仅 `node:` 内置）：

- `plugin/skills/auto-goal-v2/scripts/backend-resolve.mjs` — 跨平台 backend 解析、
  `cleanEnv()`、`buildArgs()`、`assertIsolatedArgs()`、`FORBIDDEN_ARGS`。
- `plugin/skills/auto-goal-v2/scripts/ingest-audit.mjs` — `ingestedTokens()`（计入缓存前缀）、
  `injectedBytes()`、`checkLaunchBudget()`、`projectEnvelope()`、预算常量。
- `plugin/skills/auto-goal-v2/scripts/dispatch-worker.mjs` — `dispatchWorker()`、
  `safeRelativePath()`、`WORKER_SYSTEM_PROMPT`。

测试：

- `plugin/skills/auto-goal-v2/tests/backend-isolation.test.mjs` — 13 项离线测试，任何平台可跑。
- `plugin/skills/auto-goal-v2/tests/capability-live.test.mjs` — 5 项真实 backend 测试，
  默认 skip，需 `ACE_LIVE_SPIKE=1`（会消耗真实 token）。

---

## 7. 测试结果

```text
node --test plugin/skills/auto-goal-v2/tests/backend-isolation.test.mjs
  → 13 pass / 0 fail

ACE_LIVE_SPIKE=1 ACE_WORKER_MODEL=claude-opus-5 \
  node --test plugin/skills/auto-goal-v2/tests/capability-live.test.mjs
  → 5 pass / 0 fail（89.9 s）

node --test plugin/skills/auto-goal-v2/tests/capability-live.test.mjs
  → 5 skipped（默认不产生费用）
```

---

## 8. 遗留与风险

- 隔离地板实测 170–530 摄入 tokens；live 测试阈值取 1500，与继承态（>2400）留有余量。
  该地板由平台系统提示决定，可能随 CLI 版本变化；阈值是回归探测器，不是承诺值。
- 单次 worker 往返实测 6–140 s，长尾明显（同一 backend 上 BANANA 任务耗时 138 s）。
  `timeoutMs` 默认 120 s 对生成型任务可能偏紧，需按 role 调整。
- 本 spike 未覆盖 §9 的 journal 落盘与并发，也未覆盖 artifact 8 MiB 硬上限的流式截断；
  当前 `dispatchWorker` 一次性写入 raw，大输出场景需改为流式。
- 验证环境经 moonshot 网关（`ANTHROPIC_BASE_URL`）。隔离机制与网关无关（依赖 CLI 参数与
  环境净化），但 token 计数的绝对值可能因网关而异。
