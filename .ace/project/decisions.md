# 项目决策日志

<!-- TOC：每新增/取代一条决策后同步更新。检索靠这里，不靠 tag。 -->
- D0001 auto-goal 增加项目级决策落盘机制
- D0002 复刻语义：决策一致（非功能等价/字节精确）
- D0003 捕获范围：AskUserQuestion + 用户主动决策
- D0004 捕获时机：实时追加，不等归档
- D0005 组织形态：线性时间序（不预设分类）
- D0006 演进记法：不可变 + supersede 移档
- D0007 准入判据：换个选择项目会不同；拿不准默认收
- D0008 实现方式：纯 SKILL/LLM 驱动，不改 CLI
- D0009 决策条字段激进极简（标题/日期/状态/决策/否决）
- D0010 TOC 顶部索引取代 tag 检索
- D0011 体积伸缩：active/archive 分层
- D0012 2026-08-12 requirement-understanding 中间产物：不建立 Requirement Canvas，仅由用户确认五段式需求对齐卡 ｜否决 Canvas 正式语义载体(重复确认成本高)
- D0013 需求画像拆分业务域与研发交付类型
- D0014 auto-goal-v2 采用独立新 Skill
- D0015 auto-goal-v2 覆盖任意通用目标
- D0016 摄入前代理内置于 Skill scripts 目录
- D0017 auto-goal-v2 私有依赖完全目录内聚
- D0018 auto-goal-v2 使用零新增依赖与最小仓库接线
- D0019 clean-context 不成立时硬阻塞
- D0020 预算超标时压缩被约束内容，不调大预算
- D0021 每个预算声明必须有量真实字节的门禁，且门禁须经变异验证
- D0022 不为可测性在产品代码留测试后门
- D0023 时序容差必须由实测分布导出，不得手挑（处方部分已被 D0024 取代）
- D0024 前提用观测量断言，不用前提式断言
- D0025 auto-goal-v2 审计后直接优化，语言迁移由总体成本证据决定
- D0029 auto-goal-v3 采用 Controller–Worker 强制分工
- D0031 DeepSeek Harness 使用私有扁平 Skill 投影并保护同名目录

---

## D0001 — auto-goal 增加项目级决策落盘机制
- 2026-07-28 · accepted
- 决策: 给 auto-goal 加机制，把核心决策汇聚到 `.ace/project/decisions.md`，跨任务累积作复刻真相源
- 否决: 三层档案（Kiro steering+specs+ADR，过重）；决策+features 双文件（一份 decisions 足够）

## D0002 — 复刻语义：决策一致
- 2026-07-28 · accepted
- 决策: decisions.md 只保证"复刻时不在用户拍过板的地方翻案"（决策一致）
- 否决: 精确字节复刻（需归档代码）；功能等价复刻（需完整功能清单，用户不要）

## D0003 — 捕获范围：AskUserQuestion + 用户主动决策
- 2026-07-28 · accepted
- 决策: 两类都捕获——agent 探讨型（AskUserQuestion 问答）+ 用户对话中主动拍板/否决
- 否决: 仅 AskUserQuestion（会漏用户对话里直接拍的板）

## D0004 — 捕获时机：实时追加，不等归档
- 2026-07-28 · accepted
- 决策: 命中触发点即当轮 append
- 否决: 归档时统一汇聚（用户主动指正发生在任意轮次，对话中断会丢）

## D0005 — 组织形态：线性时间序
- 2026-07-28 · accepted
- 决策: 纯线性追加，不预设主题分类
- 否决: 按主题预分节（产生"其他"和跨类维护负担，违反 YAGNI）

## D0006 — 演进记法：不可变 + supersede 移档
- 2026-07-28 · accepted
- 决策: A→B 升级 = 新增 B（supersedes A）+ 把 A 移到 decisions-archive.md，内容永不覆盖
- 否决: 就地覆盖只留最新（丢失"为什么改"的教训）；就地保留（主文件无限膨胀）

## D0007 — 准入判据：换个选择项目会不同；拿不准默认收
- 2026-07-28 · accepted
- 决策: 铁律刷掉澄清/过程/格式/岔题四类噪声；边界情况默认收（用户事后删）
- 否决: 默认弃（漏关键决策代价更大）；停下问用户（打断太多）

## D0008 — 实现方式：纯 SKILL/LLM 驱动，不改 ace CLI
- 2026-07-28 · accepted
- 决策: 捕获逻辑写进 auto-goal/SKILL.md + shared/decision-log-protocol.md
- 否决: 改 archive.js CLI 层（对话语义决策 CLI 拿不到，只有 LLM 现场知道）

## D0009 — 决策条字段激进极简
- 2026-07-28 · accepted
- 决策: 每条只留 标题/日期/状态/决策/否决 五项
- 否决: 保留全 8 字段（来源/任务对复刻零贡献、审查边际）；砍两项保留 tag（tag 早期是负担）

## D0010 — TOC 顶部索引取代 tag 检索
- 2026-07-28 · accepted
- 决策: 文件头维护一行一条的 TOC（D号+标题）做检索
- 否决: tag 标签筛选（决策少时纯负担，多时不如 TOC 直观且需持续维护）

## D0011 — 体积伸缩：active/archive 分层
- 2026-07-28 · accepted
- 决策: 主文件只留 accepted 现行决策；被 supersede 的旧条移到 decisions-archive.md，复刻只读主文件
- 否决: 就地保留 superseded（主文件膨胀 + 复刻读噪声）；日志 rollup 压缩（有损，丢用户拍板原文）

## D0013 — 需求画像拆分业务域与研发交付类型
- 2026-08-12 · accepted
- 决策: 业务域描述会员、活动、支付、旅游、酒店等业务归属；研发交付类型描述 Web 前端、客户端、服务端、数据、AI/算法等研发承接面，可多选并标主类型
- 否决: 继续使用混合 C端/B端、Backend、Data、AI 的产品类型；以交易流程、运营后台等产品形态代替研发交付归属

## D0014 — auto-goal-v2 采用独立新 Skill
- 2026-08-12 · accepted
- 决策: 从零设计并后续新建 `auto-goal-v2`，与 V1 并存，不在现有 `auto-goal` 上增量修补
- 否决: 直接按上一轮报告改造 V1（不利于全部机制重新设计和并行验证）

## D0015 — auto-goal-v2 覆盖任意通用目标
- 2026-08-12 · accepted
- 决策: V2 的目标领域不设限，除软件工程外也支持其他可执行或可研究的目标
- 否决: 首版仅覆盖软件工程或代码目标（偏离通用目标定位）

## D0016 — 摄入前代理内置于 Skill scripts 目录
- 2026-08-12 · accepted
- 决策: 模型摄入前 Tool Proxy 由 `auto-goal-v2/scripts/` 内脚本承载
- 否决: 封装为 `ace goal` CLI 命令（扩大外部耦合且不符合 Skill 内置要求）

## D0017 — auto-goal-v2 私有依赖完全目录内聚
- 2026-08-12 · accepted
- 决策: V2 的协议、schema、模板、脚本、恢复与验证规则等全部私有运行时依赖位于 `auto-goal-v2/` 目录树
- 否决: 把依赖文件放到外部 `shared/` 或引用其他 Skill 私有文件（破坏独立安装、升级和删除）

## D0018 — auto-goal-v2 使用零新增依赖与最小仓库接线
- 2026-08-13 · accepted
- 决策: V2 运行时仅使用 Node 标准库，私有实现全部留在 Skill 目录；允许修改根测试入口、Skill 注册、doctor 与文档等必要发现性接线
- 否决: 引入 Ajv 等第三方依赖（扩大安装边界）；绝对禁止目录外改动（会使测试和发现性断裂）

## D0019 — clean-context 不成立时硬阻塞
- 2026-08-13 · accepted
- 决策: 完整 V2 必须证明 worker 不继承主会话且截断发生在模型摄入前；能力不可用时保留已验证产物并报告阻塞
- 否决: 使用普通 Agent 返回后裁剪作为软降级（裁剪发生时内容已经进入主 Agent 上下文）

## D0020 — 预算超标时压缩被约束内容，不调大预算
- 2026-08-13 · accepted
- 决策: 声明的预算被突破时，压缩被约束的内容使其落回预算内。`SKILL.md` 实测 6325 字节超出自声明的 6 KiB，压至 6125 字节而非把 `SKILL_MD` 调到 6.5 KiB
- 否决: 调大预算以适配现状（等于让声明迁就现实；SKILL.md 是唯一每次调用都进主模型上下文的文件，其预算即上下文保证本身）

## D0021 — 每个预算声明必须有量真实字节的门禁，且门禁须经变异验证
- 2026-08-13 · accepted
- 决策: 预算常量不得只有定义处、常量断言与文档三处引用。必须存在量运行时或磁盘真实字节的门禁；新增门禁须人为注入超额确认其会失败后再恢复
- 否决: 只修超标数值不加门禁（`BUDGETS.SKILL_MD` 与 `BUDGETS.RECOVERY_TOTAL` 两次出现「声明了却无人校验」，空声明会在下次编辑时静默漂移；未经变异验证的断言可能永远为真，等于没加）

## D0022 — 不为可测性在产品代码留测试后门
- 2026-08-13 · accepted
- 决策: 需要离线覆盖 worker 派发路径时，使用既有的 `ACE_CLAUDE_BIN` 注入点构造真实可执行 stub backend
- 否决: 在 `dispatch-worker.mjs` 内加测试分支（该后门本身即是绕过 clean-context 硬阻塞的路径；可测性不应以削弱被测的正确性约束为代价）

## D0023 — 时序容差必须由实测分布导出，不得手挑
- 2026-08-13 · superseded by D0024（后半条"前提断言引用独立量"的处方被证伪，前半条容差导出仍有效）
- 决策: 涉及进程派生的超时/容差常量由实测延迟分布导出（如 `3*max(detach)+200`），并在断言中显式引用两侧独立的量；测试的前提断言必须包含被测常量之外的独立量，否则形如 `writeAt < timeoutMs + GRACE`（两侧同含 `timeoutMs`，退化为 `200 < 2000`）的恒真式会伪装成保护
- 否决: 手挑经验值（原 `150ms` 在安静机器上过审，在负载下即红）；用整测试族的绿/红代替边界余量测量（通过只证明"此刻此机在界内"，从不证明"界被守住"）

## D0024 — 前提用观测量断言，不用前提式断言
- 2026-08-13 · accepted · supersedes D0023 的处方部分
- 决策: 测试前提（fixture premise）由**运行中实际观测到的量**承担，不新增"前提断言"。观测量天然可假（本例 `raw_bytes > 0` 实测 1/16 会红），而前提断言两类失效模式都已实测证实：
  - **代数恒真**：`assert(measureDetachLatency() < timeoutMs)` 而 `timeoutMs = 3*measureDetachLatency()+200`，化简为 `d < 3d+200`，对一切 `d≥0` 恒真——为修 D0023 而写的断言复现了 D0023
  - **采样错位**：即便不恒真也无预测力。唯一复现出 flake 的那轮，该函数返回 52ms，而当次 dispatch 真实 detach 已超 150ms（采样对象是另一个进程，并发下偏差达 3x）
  失败信息里区分"被测组件有缺陷"与"fixture 前提未成立"，取代前置拦截
- 否决: 保留 D0023 的"引用独立量"处方（独立量≠有预测力的量，本例即反例）；用"强化前提后全绿"证明修复有效（变异实测：删掉两条前提断言，pass 数 494 不变——它们从未覆盖任何东西）
- 依据: 变异测试四臂 + 全量 16 轮，见 `.ace/tasks/implement-auto-goal-v2/artifacts/{mutate-premise,mutate-under-load,hunt-mutant-flake,measure-detach-distribution}.mjs`。手挑 150ms 全量 1/16 红（`raw_bytes=0`），实测导出容差 0/13 红——D0023 前半条（容差导出）由此坐实
- 附带教训: 变异测试若把 `run-tests.mjs` 过滤到单个 suite，就抽掉了 flake 所需的并发压力，M2/M3 因此"存活"并给出错误结论。这是本任务第三次同类错误（cmd.exe 循环、`node --test <dir>`、过滤变异）：**harness 擅自改变条件后照常报告结论**

## D0025 — auto-goal-v2 审计后直接优化，语言迁移由总体成本证据决定
- 2026-08-13 · accepted
- 决策: 对 V2 先实测真实 transcript 注入成本、审计协议—实现—测试断层，再直接实施高置信优化；Node.js/Python 取舍依据等价能力、依赖、跨平台、启动与维护总成本，不以 LOC 单点决定
- 否决: 只出审计报告不修改；未经测量直接压缩文档；因 Python 表面行数更少就全量重写


## D0026 — Skill 分类只存在于仓库，安装时打平；选择持久化在 ~/.ace/config
- 2026-08-13 · accepted
- 决策: `plugin/skills/<category>/<skill>/` 加一层分类目录用于可读性与选择粒度，但 `ace init` 安装时去掉分类层，落成 `~/.claude/plugins/.../skills/<skill>/`。约束来自 Claude Code 只发现 `skills/<skill>/SKILL.md` 且不递归——分类层若保留则一个 skill 都发现不了。因此 skill 之间的 `../<sibling>/SKILL.md` 与 `../../shared/x.md` 引用按**打平后**布局书写，仓库内相对路径故意差一层
- 决策: 分类清单单一真相源为 `src/core/constants.js` 的 `SKILL_CATEGORIES`（label/description/recommended），成员关系不写清单、直接由目录树推导（含 `SKILL.md` 才算 skill）；同名 skill 跨分类重复必须抛错，因为打平后会互相覆盖
- 决策: 用户选择持久化在 `~/.ace/config/skills-selection.json`（带 schema version）。`ace init --force` 与 `ace upgrade` 复用它且不提问——升级若重新提问，要么阻塞非交互运行，要么悄悄装回用户取消掉的 skill。`ace uninstall` 一并删除 `~/.ace/`，否则残留的选择文件会静默驱动下一次安装
- 决策: 取消勾选的语义是**目标目录中不存在**，不是"拷贝了但不注册"——未注册但存在的 skill 仍会被发现。因此安装前先清理，否则在装过该 skill 的机器上取消勾选纯属装饰
- 否决: 保留平铺目录仅在 CLI 侧做过滤（分类信息无处安放，无法做两级选择）；分类成员关系写死在 constants.js 清单里（新增 skill 必须改两处，清单必然漂移）；doctor 用硬编码 skill 列表校验（会把用户主动取消的 skill 报成失败，且新增 skill 检查不到）
- 依据: 打平后引用可解析、取消勾选真删除、doctor 跟随选择，均由 `tests/{flattened-plugin-refs,installer-skill-deploy,skills-catalog,init-entry-points,docs-skill-catalog}.test.mjs` 覆盖（542 tests / 0 fail），并在临时 HOME 沙箱做了 装→收窄→卸载 全生命周期实测
- 附带教训: 面向用户的收尾文案（init 的 "Next steps" 槽命令清单）也是选择的函数。原先硬编码 `/spec-coding` 等三条，在只装了 general+meta 的安装里会教给用户三个不存在的命令——读起来像装坏了，而不是像用户自己的取消。同类风险在 docs 的分类表上，已用测试钉住

## D0027 — 四个分类默认全部预勾选：分类是取消入口，不是预判入口
- 2026-08-13 · accepted · 修订 D0026 中 meta/docs 不推荐的部分
- 决策: `SKILL_CATEGORIES` 四类（coding/general/meta/docs）`recommended` 全部为 `true`，即默认安装 = 全量安装（24 个 skill）。分类的价值在于让用户**主动取消**不需要的部分，而不是由我们预判"你大概用不上写 skill 和画图"——预判错了的代价是用户根本不知道这些能力存在（默认不装 = 事实上不存在），而全装的代价仅是一份可自行取消的清单
- 否决: 保留 meta/docs 默认不勾（用户明确要求勾上，且 D0026 的"最小默认集"论据经不起"用户发现不了未安装能力"这一反证）
- 附带效应: `recommendedSelection === fullSelection`，此前用 `meta` 作"未推荐分类"样例的两处 fixture 前提随之失效（`tests/skills-catalog.test.mjs`、`tests/installer-skill-deploy.test.mjs`）。改用**未声明分类**（`not-declared-anywhere`）承担该角色——它在 `SKILL_CATEGORIES` 里没有元数据，因此永不预勾，且这正是新增目录在补元数据之前的真实形态。改 fixture 而非删测试：默认集不等于全集的行为仍需被守护，否则将来任何一类改回不推荐都无人拦截
- 依据: 临时 HOME 沙箱实测 装（24/24，doctor 全绿）→ 取消 meta+docs（skills/ 只剩 2 个，doctor 全绿）；542 tests / 0 fail；docs 表格的 ✅ 标记经变异验证仍会转红

## D0029 — auto-goal-v3 采用 Controller–Worker 强制分工
- 2026-08-14 · accepted
- 决策: 主 Agent 只负责目标对齐、任务拆分、调度、状态推进、产物核验与关闭；独立探索域直接委派，每个实现或修复 work item 必须由 fresh subagent 执行。依赖与资源冲突只决定串行或并行，不决定是否委派；强制建立 Work Graph，但不设人为任务数量下限
- 否决: 保留当前“只有多个无冲突 ready item 才派发、单任务由主 Agent 实现”的条件式委派；恢复 V1 的固定 ≥3 任务数量门槛

## D0028 — skill 体积预算量的是"进模型上下文的字节"，脚本不计入
- 2026-08-14 · accepted · 修订 auto-goal-v3 立项时"全目录 ≤30 KB"的声明
- 决策: skill 的上下文预算只约束**会被模型读取的文本**：`SKILL.md`（每次调用必进）+ 单阶段加载的 reference（峰值 1 份）。`scripts/*` 只在 Bash 里执行、内容从不进上下文，不计入预算。auto-goal-v3 实测：SKILL.md 6028 B ≤ 6144，峰值摄入 = 6028 + 7336（grill.md，三份 reference 中最大）= 13.4 KB；全目录 38.6 KB 里 goal.py 占 15.6 KB，与上下文成本无关
- 否决: 守住"全目录 ≤30 KB"并压缩 goal.py（压缩对象会落在注释与错误提示文本上，而那些提示正是七个门禁能拦住误用的原因——为一个量错对象的指标损害真实可用性）；拆成"上下文 ≤20 KB + 脚本不限"两个声明（多一个概念，且脚本侧无需门禁）
- 依据: v2 的真实病根是**级联加载**而非目录大小——v2 SKILL.md 仅 6.1 KB 却实测单会话摄入 1,002,190 字符，其中 `dispatch-worker.mjs` 单文件被摄入 296,803 字符。注意 v2 那个脚本之所以被摄入，是因为协议要求模型读它去核对语义；v3 的 goal.py "只管账不做判断"（见本任务决策）就切断了这条路径。**"目录大小"与"上下文成本"的解耦，是靠脚本不承载语义实现的，不是靠脚本小。**
- 附带教训: 立项时把"目录 ≤30 KB"写进 completion_criteria，是把易测量的代理指标当成了目标本身。代理指标失真时应改指标，而非削目标——但前提是能说清新指标为什么才是真的那个量。

## D0031 — DeepSeek Harness 使用私有扁平 Skill 投影并保护同名目录
- 2026-08-30 · accepted
- 决策: 选择 DeepSeek Harness 时，将每个已选 skill 完整复制到 `${DSH_HOME:-~/.dsh}/skills/<skill>/`；仅移除仓库分类层，保留 skill bundle 内部目录。共享 `~/.agents/skills/ace-<category>/<skill>/` 布局继续服务 Codex/OpenCode。目标存在未由 ACE 回执托管的同名目录时汇总报错，不静默覆盖
- 否决: 全局打平共享 canonical store（无谓影响 Codex/OpenCode 且扩大冲突面）；后者覆盖前者（可能删除用户文件）；自动添加来源前缀（改变 skill 调用名）

## D0030 — 常驻交互规则改为给可照抄的调用骨架，而非抽象描述
- 2026-08-26 · accepted · 取代 interactive-clarify.md
- 决策: `ace/rules/interactive-clarify.md` 由 `ace/rules/ask-user-guide.md` 取代，仍留在**常驻 @import** 层。新规则的核心是两段可逐字照抄的 `AskUserQuestion(...)` 调用骨架（问题澄清 / 审批确认），外加 Other 语义（"Other + 输入内容 = 有补充的通过"）、`preview` 用法与跨平台降级说明；同时剥离原 spec-coding 专属措辞与 Phase 1/3/4/5/6 编号列表——那些编号在全局规则里既无所指又会误导。98 行 → 69 行
- 否决: 降级为按需加载的"工作流规则"（澄清与审批是 auto-goal/spec-coding 的硬门禁，按需加载意味着 agent 可能不读就提问，门禁形同虚设——省下的几十行上下文换不来这个风险）；原样常驻 98 行（其中 spec-coding Phase 列表对全局场景是纯噪音）
- 依据: 精简的下限是**代码骨架必须逐字保留**。原 interactive-clarify 只有"批量组织问题""提供明确选项"这类抽象描述，agent 需自行发明参数结构；骨架的价值正是消除这层发明成本，删掉它就退回到了被取代的那个文件
- 附带效应: `installRulesDir` 只做覆盖拷贝、不清理孤儿文件，已安装用户的 `~/.claude/ace/rules/interactive-clarify.md` 会残留在磁盘，但 merger 已从 CLAUDE.md 摘除对应 @import → 不再被加载，属无害残留，未为此增加清理逻辑
- 待收敛: `templates/ace/rules/ask-user-guide.md` 与 `plugin/skills/coding/spec-coding/references/ask-user-guide.md` 内容近乎重复（DRY 隐患）。本次不动——spec-coding 是独立分发的插件技能，不应假设全局 rules 已安装。注意 `requirement-understanding/references/ask-user-guide.md` 是**另一套更严格的独立契约**（Other 一律视为不通过、单候选项须标"待确认建议"），不是副本，不要一并收敛
