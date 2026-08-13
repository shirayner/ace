# auto-goal-v2 可发现性核查

## 结论

**仓库侧可发现，无阻塞级遗漏；但当前本机安装目录是陈旧副本，`ace doctor` 实跑 FAIL 一项。** 该 FAIL 是"未重装"造成的环境态，不是代码缺陷——重跑 `ace init` 即可消除。5 项核查全部通过。

核查方式为纯只读 + 临时目录模拟，未修改仓库任何文件，未运行 `init`/`install` 等会写用户目录的命令。

---

## 1. frontmatter 合法性 — 通过

用 `js-yaml`（仓库自身依赖）解析 `plugin/skills/` 下全部 23 个 SKILL.md，逐个对比字段集：

| 项 | 结果 |
|---|---|
| YAML 可解析 | 是，23/23 全部成功解析，无异常 |
| `name` 与目录名一致 | 是，`name: auto-goal-v2` == 目录 `auto-goal-v2`（`plugin/skills/auto-goal-v2/SKILL.md:2`） |
| `description` 非空 | 是，282 字节（V1 auto-goal 为 281，同量级） |
| 字段集 | `[name, description]` |

字段集对比结论：`auto-goal-v2` 的 `[name, description]` 与 auto-goal、code-review 及其余 21 个 skill 中的 22 个完全一致。唯一例外是 `requirement-review`，它多一个 `version` 字段——即 v2 **没有缺字段，也没有多出不被支持的字段**，它用的是仓库主流字段集。

`description` 采用 YAML 块标量（`|`）多行写法，与 auto-goal/code-review 一致，含 DO NOT TRIGGER 负向边界，符合仓库既有触发描述惯例。

---

## 2. plugin manifest — 通过（目录扫描式，无需显式列举）

manifest 仅一个：`plugin/.claude-plugin/plugin.json`（全文 8 行）。

```
{ name, version, description, author }
```

**它不含任何 skill 列举字段**（无 `skills`、无 `components`、无 `files`）。因此 skill 发现是目录扫描式而非白名单式，auto-goal-v2 无需登记进 manifest。

依据（三条独立佐证）：

1. manifest 本身无 skill 数组——若为显式列举式，现有 22 个 skill 也都不会被发现，与仓库事实矛盾。
2. `src/core/installer.js:264` 与 `:244` 整树复制 `plugin/`，安装侧不按名单筛选。
3. `installer.js:267-278` 生成的 `marketplace.json` 只写 `{name, source, description, version}` 单个 plugin 条目，同样不枚举 skill。

**不是阻塞级遗漏。**

---

## 3. doctor 检查 — 检查逻辑正确；实跑 FAIL 源于安装目录陈旧

### 3.1 doctor 检查的是安装目录，确认无误

`src/commands/doctor.js:46`：

```js
const skillMd = path.join(pluginInstallDir, 'skills', skill, 'SKILL.md');
```

`pluginInstallDir` 由 `getPluginInstallDir()`（`doctor.js:128-151`）解析：优先读 `installed_plugins.json` 的 `installPath`，回退扫 `PLUGIN_CACHE_DIR`。**确认是安装目录，不是仓库目录。** `auto-goal-v2` 已在 `doctor.js:44` 的 `skillNames` 白名单中。

### 3.2 实跑结果（`node bin/ace.js doctor`，入口取自 `package.json` 的 `bin.ace = ./bin/ace.js`）

```
    pass  plugin: skill ace:auto-goal
    FAIL  plugin: skill ace:auto-goal-v2
    pass  plugin: skill ace:ut
    ... （其余全 pass）

  40 passed, 1 failed
```

### 3.3 FAIL 归因：安装目录是陈旧副本

直接列出注册的安装目录内容：

- `installPath` = `D:\Users\r.shi\.claude\plugins\cache\ace-local\ace\1.1.1`
- 该目录 `skills/` 下有 21 个 skill，**不含 `auto-goal-v2`，也不含 `feishu-doc`**
- marketplace 目录 `~/.claude/plugins/marketplaces/ace-local/skills/` 同样是这 21 个

仓库 `plugin/skills/` 有 23 个。缺的两个都是本次 `ace init` 之后新增的 skill——`feishu-doc` 与 v2 无关，却同样缺失，证明这是**整体未重装**，而非 v2 特有的接线漏洞。

**在已安装环境下 doctor 会不会通过**：会。安装器整树复制（见第 4 项），复制后 `<installPath>/skills/auto-goal-v2/SKILL.md` 必然存在，该检查项即转 pass。已用临时目录复现安装动作验证：复制后 `SKILL.md exists: true`。消除该 FAIL 只需重跑 `ace init`（本次核查为只读，未执行）。

---

## 4. 安装器覆盖 — 通过（整树复制，非白名单）

`src/core/installer.js` 两处复制，均为整目录、无过滤：

- `installer.js:244` — `await fs.copy(PLUGIN_SRC_DIR, destDir, { overwrite: true })` → 复制到 plugin cache
- `installer.js:264` — `await fs.copy(PLUGIN_SRC_DIR, MARKETPLACE_DIR, { overwrite: true })` → 复制到 marketplace 目录

`PLUGIN_SRC_DIR` = 仓库 `plugin/`（`src/core/constants.js:12`）。两处都先 `fs.remove` 再整树 copy，**没有 skill 白名单，没有扩展名过滤**，因此 v2 的 `lib/`、`protocols/runtime/`、`schemas/`、`scripts/`、`tests/`、`methods/`、`templates/` 全部随行。

实证：按 installer 同样的 `fs.copy(plugin → tmp)` 复制到 `%TEMP%\ace-v2-install-probe\1.1.1`，逐目录清点：

| 目录 | 复制后文件数 |
|---|---|
| `lib/` | 13 |
| `protocols/runtime/` | 11 |
| `schemas/` | 10 |
| `scripts/` | 3 |
| `tests/` | 19 |
| `methods/packs/` | 9 |
| `templates/` | 3 |

仓库侧 `find plugin/skills/auto-goal-v2 -type f` = 78 个文件，复制后一致。

npm 分发侧同样覆盖：`package.json` 的 `files` 含 `plugin/`，无 `.npmignore`；`npm pack --dry-run` 显示 269 个文件中 **78 个属于 auto-goal-v2**，与磁盘数一致，`lib/*.mjs` 在列。

**运行时可读性已实证**（关键点：装了却跑不起来）：从上述临时安装位置直接 import——

```
runtime/index.mjs loaded, exports: 58
outcome.mjs deriveOutcome: function
schemas/registry.mjs loaded, exports: 5
```

进一步在 `cwd=%TEMP%`（脱离仓库）下跑完整 19 个测试文件：`tests 383 / pass 378 / fail 0 / skipped 5`。5 个 skip 是 `capability-live.test.mjs` 的 live backend 用例，需 `ACE_LIVE_SPIKE=1` 才运行，属预期门控而非失败。**不是阻塞级遗漏。**

---

## 5. 相对路径存活 — 通过

### 5.1 import 全为 node: builtin 或相对路径

汇总 v2 全部 `.mjs` 的 import 目标（去重）：仅两类——`node:` 前缀 builtin（`node:fs`、`node:path`、`node:crypto`、`node:test` 等 9 个）与相对路径（`./x.mjs`、`../lib/x.mjs`、`../../lib/x.mjs`）。**无裸包名，无第三方依赖，无跨出 skill 树的相对路径。**

这一点由 skill 自带的架构测试机械保证（`tests/kernel-cohesion.test.mjs`，实跑全绿）：

- `every import is either node: builtin or a relative path (no third-party)`
- `no relative import escapes the skill directory tree (I10, A01)`
- `every relative import resolves to a file that exists`
- `the runtime references neither shared/, V1, nor other skills (A01)`
- `the kernel does not import the repository root package`
- `the kernel loads with no module outside its own tree (A02)`
- `no kernel module writes to a path outside the task root`

即"不依赖仓库根 package、不越出自身目录树"不只是当前事实，还有回归保护。

### 5.2 无硬编码仓库路径或 task root 绝对位置

- 扫 Windows 盘符绝对路径（`[A-Za-z]:[\\/]`）：`.mjs` 中唯一命中是 `tests/kernel-artifacts.test.mjs:54` 的 `'c:\\windows'`——**测试夹具，用于断言这类路径被拒绝**，是正向的安全用例。
- 扫 unix 绝对路径、`requirement-agent-skill`、`.claude/plugins`、`process.cwd()`：`.mjs` 中零命中。
- 扫 `.ace`：v2 的 `.mjs` 中**零命中**——`.ace/tasks/` 的位置没有被写进运行时。

task root 是**由调用方作为参数传入的绝对路径**，而非模块内推导：`lib/paths.mjs:42-59` 的 `resolveWithinRoot(taskRoot, relativePath)` 要求 `taskRoot` 为绝对路径并把一切解析约束在其内，`scripts/dispatch-worker.mjs:99` 用 `cwd: resolve(taskRoot)` 派发。模块自身定位一律用 `path.dirname(fileURLToPath(import.meta.url))`（`schemas/registry.mjs:14`），跨安装位置成立。

---

## 阻塞级遗漏清单

**无。** 两个可能的阻塞点均已排除：

- plugin manifest 是目录扫描式，不需要显式登记 v2（第 2 项）。
- 安装器是整树复制而非白名单，v2 的 `lib/*.mjs` 与 `protocols/runtime/*.mjs` 全部随行且在异地可 import、可跑通全测（第 4 项）。

---

## 需关注（非阻塞）

1. **本机安装目录陈旧**：`~/.claude/plugins/cache/ace-local/ace/1.1.1` 与 marketplace 目录都停留在 21 个 skill，缺 `auto-goal-v2` 与 `feishu-doc`。这是当前 `ace doctor` 唯一 FAIL 的直接原因。修复动作是重跑 `ace init`（本次核查只读，未执行）。注意安装路径以 `plugin.json` 的 version 命名，而 v2 与 1.1.1 同版本号——重装会 `fs.remove` 后重建同名目录（`installer.js:242`），不会残留旧副本。
2. **SKILL.md 超出自声明预算 181 字节**：`lib/budgets.mjs:16` 声明 `SKILL_MD: 6 * KIB`（6144），实际 `SKILL.md` 为 6325 字节。该预算目前**只被 `tests/kernel-budgets.test.mjs:39` 断言其数值，没有任何代码对 SKILL.md 实际字节做门禁**，所以不影响加载或发现。但它使"SKILL.md ≤6 KiB"这一自我约束在文件层面已不成立，建议后续压正文或调预算，二者取一。

---

## 未能核查项

1. **Claude Code 运行时是否真的列出并触发 `/ace:auto-goal-v2`**——需在重装后由宿主进程实际加载 skill 列表才能观测，本次为只读核查且安装目录陈旧，无法从进程外证实。已证实的是加载所需的全部静态前置条件（frontmatter 可解析、目录扫描式发现、整树安装、运行时异地可 import）均成立。
2. **`ace init` 重装后 doctor 全绿**——需执行写用户目录的命令，超出本次只读授权范围，未执行。已给出必然通过的推理依据（第 3.3 节）。
3. **live backend 能力**（clean-context worker 真实派发）——`capability-live.test.mjs` 的 5 个用例需 `ACE_LIVE_SPIKE=1`，本次未设置。该项属能力验证，不属可发现性范畴；同目录已有 `capability-evidence.md` / `capability-live.tap` 单独记录。
