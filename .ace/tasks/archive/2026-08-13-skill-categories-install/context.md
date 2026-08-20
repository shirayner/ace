# 目标：ACE skill 源码分类 + init 按分类选择安装

## 用户意图（已对齐）

在 ACE **源码仓库**的 `plugin/skills/` 下加一层分类目录（参考 mattpocock/skills 的组织方式），`ace init` 时用户选择要安装的分类与 skill，**安装时打平**到 Claude 的 plugin skills 目录（Claude 侧不分类）。

## 关键认知（探索所得）

### Claude Code 只扫描一层
plugin 的 `skills/` 默认只扫描 `skills/<name>/SKILL.md`，**不递归**。mattpocock 之所以能分类，是因为其 `plugin.json` 里逐条枚举了 25 个 `./skills/<cat>/<skill>` 路径。

→ 但本方案**打平安装**，因此完全绕开此限制：无需 `plugin.json` 的 `skills` 字段，无需担心版本兼容。这是打平方案相对「Claude 侧也分类」的决定性优势。

### 打平恰好保住了所有硬引用
实测的文件级硬依赖（相对路径 Read）共 3 处，全部是 `skills/` 同层的 `../`：
- `spec-coding/phases/apply.md:75` → `{skill_dir}/../subagent-execute/SKILL.md`
- `spec-coding/SKILL.md:149` → `subagent-execute/SKILL.md`
- `llm-wiki-generator/SKILL.md:386` → `../llm-wiki-reader/SKILL.md`

打平后这些 `../` 依然指向兄弟 skill，**无需修改任何 SKILL.md**。
`../../shared/`（5 个 skill / 21 处）同理：打平后仍指向 plugin 根的 `shared/`。

⚠️ 副作用：源码仓库内这些相对路径会临时失配（多了一层）。需确认无脚本静态校验它们。

### 命令级依赖
- `spec-coding/SKILL.md:57` → `Agent(prompt="执行 /ace:init ...")` — 真正的跨 skill 调用
- `/verify`、`/parallel-dispatch` 的其余提及多为描述性触发点清单，非硬调用

## 分类映射（7 类 / 23 skill）

| 分类 key | 中文名 | skills | recommended |
|---|---|---|---|
| `general` | 万能通用 | auto-goal, auto-goal-v2 | ✅ |
| `core-workflow` | 核心编码流水线 | spec-coding, spechub-coding, subagent-execute, parallel-dispatch, verify, init | ✅ |
| `requirement` | 需求与设计 | requirement-analysis, requirement-understanding, requirement-writing, requirement-review, tech-design | ✅ |
| `quality` | 质量保障 | code-review, ut, test-case-gen | ✅ |
| `knowledge` | 知识与分析 | llm-wiki-generator, llm-wiki-reader | ⬜ |
| `meta` | 元工具 | skill-creator, skill-optimize | ⬜ |
| `docs-media` | 文档与图像 | feishu-doc, text-to-image, simple-text-to-image | ⬜ |

**core-workflow 为何是 6 个**：用户选择「扩大分类把耦合组塞进一类」。`spec-coding ↔ subagent-execute ↔ parallel-dispatch ↔ verify ↔ init` 构成强耦合簇，若按纯语义拆分（verify→quality、init→knowledge）会导致选一半即坏。代价是该分类语义略宽（verify/init 并非只服务 spec-coding），换来无需维护额外依赖表。

## 受影响的下游

| 位置 | 影响 |
|---|---|
| `src/core/installer.js` | `installPlugin`/`setupMarketplace` 各自 `fs.copy(PLUGIN_SRC_DIR)` 整目录 → 需改为「非 skills 内容整复制 + 选中 skill 打平复制」 |
| `src/core/constants.js:104` | plugin description 里的 skill 列表已过时 |
| `src/commands/doctor.js:44` | 硬编码 9 个 skillNames + `skills/<skill>/SKILL.md` 路径 |
| `scripts/run-tests.mjs` L44/L98/L149 | 三处 `plugin/skills` 一层 `readDirNames` 扫描 |
| `plugin/agents/requirement-agent.md` | frontmatter `skills:` 声明 requirement-understanding/writing（同分类，不受影响） |
| `docs/skills-guide.md` | 已有 6 分类表格但只覆盖 13 个 skill |

## 决策记录

1. **分类仅在源码，安装打平** — 用户澄清。绕开 Claude Code 单层扫描限制。
2. **未选中 skill 不 copy + 不注册** — 双保险，不依赖 Claude Code 的路径替换语义。
3. **耦合组塞进 core-workflow** — 不另建 SKILL_DEPS 表。
4. **首装只预选 recommended 分类** — 4 类预选、3 类不选。
5. **存量用户当新用户处理** — 无 selection 记录时走 recommended，不反推已装目录。
6. **全局配置 `~/.ace/`，配置文件 `~/.ace/config/`** — 用户明确要求，新增 ACE_HOME 概念（此前只有 `~/.claude/`）。

---

## 交付记录（2026-08-13）

### 与上表的偏差：7 类收敛为 4 类

实际落地为 `coding` / `general` / `meta` / `docs`，不是上表的 7 类。原因：上表把 `core-workflow`、`requirement`、`quality`、`knowledge` 拆开，而这些分类之间存在文件级硬引用（`spec-coding` → `subagent-execute`、`llm-wiki-generator` → `llm-wiki-reader`）。分类是**选择粒度**，拆开就意味着用户可以只勾 `core-workflow` 不勾 `quality`，此时 `spec-coding` 的 `../subagent-execute/SKILL.md` 在运行时 Read 失败——这正是分类要避免的失败模式。把互相引用的 skill 收在同一分类内，取消勾选才是安全操作。

代价：`coding` 有 16 个 skill，类内列表偏长。由两级选择的第二步（类内逐个勾选）兜住。

### 最终结构

| 分类 | 默认安装 | 数量 |
|---|---|---|
| coding | ✅ | 16 |
| general | ✅ | 2 |
| meta | ⬜ | 2 |
| docs | ⬜ | 3 |

默认安装集 = coding + general = 18 个 skill。

### 实现要点

- 分类清单单一真相源：`src/core/constants.js` 的 `SKILL_CATEGORIES`（只存 label/description/recommended）
- 成员关系不写清单，由 `src/core/skills-catalog.js` 从目录树推导；同名跨分类抛错（打平后会覆盖）
- 选择持久化：`src/core/skills-selection.js` → `~/.ace/config/skills-selection.json`（带 schema version，读不懂就退回推荐集）
- 安装前先清理目标 skills/：取消勾选的语义是"目标目录不存在"，否则在装过的机器上取消纯属装饰
- `doctor` 按 `resolveSelection(catalog, readSelection())` 校验，不用硬编码列表
- `uninstall` 一并删 `~/.ace/`，否则残留选择文件静默驱动下次安装

### 过程中发现并修掉的问题

1. **init 的 "Next Steps" 硬编码槽命令** — 原先固定打印 `/spec-coding`、`/auto-goal-v2` 等。在只装了 general+meta 的安装里，这是教给用户三个不存在的命令，读起来像装坏了而不是像用户自己的取消。改为由已安装集合推导（`suggestedEntryPoints`），并把列宽也改为按实际名字长度计算（原 `padEnd(13)` 在 `requirement-analysis` 上就错位）。
2. **docs/architecture.md 的分类表是手维护的** — 加/改/挪 skill 都会让它静默失真。用 `tests/docs-skill-catalog.test.mjs` 钉住（对照 `discoverCatalog` 与 `SKILL_CATEGORIES`，含默认安装标记）。

两处都做了变异验证：改坏实现，相应断言转红（entry-points 4/5 红，docs 2/3 红），确认不是空转测试。

### 验证

- `node scripts/run-tests.mjs`：**tests 542 / pass 537 / fail 0 / skipped 5**（skipped 全部是 `capability-live.test.mjs` 需 `ACE_LIVE_SPIKE=1` 的 live 用例）
- 新增测试：`tests/{flattened-plugin-refs,init-entry-points,docs-skill-catalog}.test.mjs`；扩充 `tests/{installer-skill-deploy,skills-catalog}.test.mjs`
- 临时 HOME 沙箱全生命周期实测：默认装（18 skill，doctor 50 pass / 0 fail）→ 收窄到 docs 单 skill（skills/ 只剩 text-to-image，doctor 34 pass / 0 fail）→ uninstall（`~/.ace` 与 plugin 目录均消失）
- 打平后引用可解析：`spec-coding/phases/apply.md` 的 `{skill_dir}/../subagent-execute/SKILL.md` 在安装目标处存在
- git 将目录迁移识别为 rename（`R`），历史保留

### 遗留（不在本任务范围）

`npm run lint` 失败：仓库从未有过 eslint 配置文件（`git log -- .eslintrc* eslint.config.*` 为空），eslint 9 报 config migration 错误。属先存问题，与本次改动无关。

---

## 追加修订（同日，用户要求）

**meta 与 docs 改为默认勾选** —— 四个分类 `recommended` 全为 `true`，默认安装即全量（24 个 skill，含期间新出现的 `auto-goal-v3`）。理由见 D0027：分类是取消入口，不是替用户预判的入口；默认不装 ≈ 用户永远发现不了这些能力。

连带处理：
- 两处 fixture 用 `meta` 当"未推荐分类"样例，随之失效。改用**未声明分类**（`not-declared-anywhere`）承担该角色——无元数据故永不预勾，且这就是新目录补元数据前的真实形态。保留测试而非删除：默认集≠全集的行为仍需守护。
- `docs/architecture.md` 表格四行标记改 ✅ 并补 `auto-goal-v3`；`docs/getting-started.md` 的"默认预勾选 coding 与 general"改为四类全选。
- README 三处陈旧计数（14 个 skill / 8 个协议）修正为 24 / 11 —— 本任务前就已失真。Skill 概览表补 `auto-goal-v3`，并加一行说明该表是**使用场景**维度的精选，与**安装分类**维度不同，完整清单指向 architecture.md。

**`auto-goal-v3` 的发现方式值得记一笔**：它是本会话之外落到 `plugin/skills/general/` 的未跟踪文件，我并不知道它存在——是 `tests/docs-skill-catalog.test.mjs` 在跑全量时报出"docs 少了 auto-goal-v3"才暴露。这正是给手维护文档表格加测试的收益：它同时也是新 skill 的落地检测器。

验证：542 tests / 537 pass / 0 fail / 5 skipped；沙箱实测 装（24/24，doctor 全绿）→ 取消 meta+docs（只剩 2 个，doctor 全绿）；docs ✅ 标记经变异验证仍会转红。
