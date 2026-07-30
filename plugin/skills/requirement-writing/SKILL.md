---
name: requirement-writing
description: 将已完成理解和澄清的需求投影为结构清晰、信息保真的标准 PRD。用户要求"写 PRD""出产品需求文档""把对齐后的需求整理成 PRD"时触发。只做投影：范围裁剪、文档组织、正文生成、规则自检；不做需求澄清、需求评审、技术方案、UI 设计或任务拆分。输入应含原始需求 + 已确认的决策 Q&A；需求尚未澄清或用户要技术设计时不触发。
---
# PRD Projection Engine — PRD 投影引擎

**核心信念：需求本身不变，变的只是「信息如何在文档里组织」。** 本 skill 不收录通用写作理论，但“LLM 知道”不等于它会在长 PRD 中稳定执行。只有被样例或回归证明会反复违反、且能转成 PRD 专属规则 / 骨架 / 检查的失败模式才进入。把已理解澄清、已界定范围的需求，**投影**成标准 PRD。

**先界定范围，再谈保真。** 输入文档 ≠ 本次需求：常含删除线的**废弃**、分期的**二/三期**。投影前先分三态（见 projection-rules R-S5），保真只对 in-scope。

---

## 四象限判据（设计宪法）

本 skill 只装四类知识。**每新增一条内容，先问它属于哪类；四类都不属于 → 不进本 skill。**

| 这是……                                        | 归宿                | 文件                                                                                      |
| ----------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------- |
| PRD 用什么语言表达？（REQ/BR/AC/编号/空值三态） | **Language**  | `prd-language.md`                                                                       |
| LLM 默认会做错 / 绝不能违反？                   | **Rules**     | `projection-rules.md`                                                                   |
| 信息如何组织成章节？                            | **Structure** | `chapter-tree.md`                                                                       |
| 每种节点最终长什么样？                          | **Rendering** | `templates/*.md`（字段准入：去掉会漏 in-scope 信息或违反某条 Rule 才留，见 core.md 头） |
| 通用写作理论 / 名人方法论？                     | **默认删除**  | 若已证实为稳定失败模式，只留名称锚点，并转写到 Rules / Rendering / Check；不收理论正文 |

> Workflow 不是知识，是算法：`投影 = Apply(Language, Rules, Structure, Template)`。故只剩下面四步，不单列文件。

**写作原则入场门槛**：知识测试让位于行为证据。每条候选原则必须同时写清 **PRD 中出现在哪里 / 什么现象算违规 / 命中后如何修复**；缺一项就是泛泛常识，删除。已证实的结构失败归 R-T12，简洁失败归 R-T13；原则名称只在对应 Rule 中作记忆锚点。

---

## 四步（投影过程）

```
① Scope    分三态（in-scope / deprecated / deferred），保真只对 in-scope
② Plan     选章裁剪 + 识别共享规则（跨≥2 REQ 升 BR）+ 定信息归属与阅读顺序
③ Project  按 chapter-tree 选章 → 照 templates 填骨架 → 严守 projection-rules
④ Check    按 projection-rules 自检 P0→P1→P2，命中即回改；P0 未过不输出
```

- 四步是思考顺序，不是四份产物。Micro 可合并；默认只交付最终 PRD，不展示中间态。
- **Plan 是价值所在**：动笔前决定整份 PRD 如何组织，避免重复与结构漂移。规模不硬触发章节；但 Large 必须切换到下面的分阶段执行路径。

### 复杂度分流

- **Micro / Normal**：直接执行四步；Normal 可先列内部章清单，但不强制创建临时状态文件。
- **Large**：禁止在一个生成回合里规划并写完整篇正文。先外化计划和骨架，再按依赖逐章落盘。
- **Large 强信号**：输入明确标为 Large；主材料需要分块读取；多份来源文档共同决定需求；跨多个业务域且含多组 REQ / BR / Extension；预计正文无法在一次稳定生成中完成。命中任一强信号即可走 Large 路径。

### Large 路径（Freeze → Scaffold → Fill → Check）

<HARD-GATE name="Large 先骨架后正文">
写任何正文前，必须先完成 Freeze 和 Scaffold，并留下可恢复证据。没有 projection-state 或目标 PRD 骨架，禁止进入 Fill。
</HARD-GATE>

| 阶段 | 动作 | 完成证据 |
|------|------|----------|
| **Freeze** | 冻结三态范围、术语/角色、已确认决策、BR 候选、章节归属和 Coverage | 目标 PRD 同目录存在 `.<PRD basename>.projection-state.md`，如 `.PRD-会员页权益推荐.projection-state.md` |
| **Scaffold** | 按 chapter-tree 选章，把完整标题骨架写入目标 PRD；每个待写章放 `<!-- PRD-WORKING: pending -->` | 目标 PRD 已落盘且只有骨架，无成段正文 |
| **Fill** | 按 chapter-tree 的 Large 编写依赖顺序，每次只写一个章节；功能需求每次只写一个 REQ + 其 AC；写入时替换该章 working 标记 | 章节内容已写入目标 PRD，state 中该章标为 done |
| **Chapter Check** | 每章写完立即核对来源覆盖、R-T1、术语/编号/引用和未决项；失败只回改本章 | 本章检查通过后才进入下章 |
| **Global Check** | 全章完成后生成 TL;DR，再执行 Coverage 与 P0→P1→P2 全局检查 | 无 pending / 工作标记 / 临时状态文件 |

projection-state 至少记录：

- 输出路径与整体状态。
- 来源索引：文档 / 本地缓存路径 / 标题或行区间；不要复制整份原文。
- 三态范围、冻结术语/角色/决策、BR 候选。
- 章节清单：`id / depends / status / source_items`；status 只用 `pending / in-progress / done / blocked`。
- Coverage：每条 in-scope 信息 → 主章节 / REQ / BR。

```markdown
# Projection State
- output: <目标 PRD 绝对路径>
- status: in-progress

## Frozen
- scope: <in-scope / deprecated / deferred 索引>
- terms_roles_decisions: <冻结项>
- br_candidates: <BR 候选及适用 REQ>
- sources: <来源标识 + 本地路径/标题/行区间>

## Chapters
| id | depends | status | source_items |
|----|---------|--------|--------------|
| background-goals | - | pending | S01, S02 |

## Coverage
| source_item | scope | destination | status |
|-------------|-------|-------------|--------|
| S01 | in-scope | background-goals | mapped |
```

**上下文隔离**：若主材料需要分块读取、已加载多份大文档，或进入写作前上下文明显接近容量，完成 Freeze + Scaffold 后停止在当前上下文继续写。新写作上下文只读取 projection-state、目标 PRD、当前章节对应的来源片段、`projection-rules.md` 和该章模板；禁止每章重读全部原文。章节默认串行；并行只能把互不依赖的扩展章写到独立临时文件，再由单一协调者合入目标 PRD。

**局部修复**：任何章节或终检失败，只修受影响章节及其摘要引用，不重新生成全文。

---

## 前置门禁（不可跳过）

<HARD-GATE name="输入契约与范围">
投影前，输入契约必须齐备且范围已界定。
证据 = 手上同时有「原始需求文档」+「前序澄清 Q&A」，且能读出三态（in-scope / deprecated / deferred）。
无契约 = 禁止投影，先走需求理解 / 澄清 skill。
冲突消解、需求澄清由上游负责。发现阻塞缺口时停止投影，列出最小缺口并退回上游澄清 skill；本 skill 不向 PM 追问、不代替上游决策。
</HARD-GATE>

**惊讶测试贯穿全程**（projection-rules R-S7）：遇未被 Q&A 决策的点，禁止选默认值冒充「已对齐」。三选一：阻塞→列最小缺口并退回上游澄清 / 不阻塞→记 Open Question / 范围外→按三态裁剪。违反 = 臆造 = 违反保真底线。

**违反形式 = 违反精神。**「需求看着挺清楚」≠ 已澄清；「选个默认值标可调整」= 伪造对齐；「二期也顺手写全」= 越范围臆造；「废弃内容留着」= 未做裁剪。

---

## 交付门禁（Blocker，缺一不可交付）

自检细则见 `projection-rules.md`。速查：

1. **保真 100%**（R-S1~S6）——in-scope 全映射，遗漏/篡改/静默删/臆造任一即失败。
2. **不写实现**（R-T1）——正文出现接口/表结构/状态机/prompt/编排 = Blocker。源文档已含实现细节时按 R-T1 裁决：业务语义翻译保留、纯技术形式剥离，不直接删（保真 > 不写实现）。
3. **验收**（R-T7）——每 REQ 有 Given/When/Then；探索型豁免须显式声明。
4. **非目标非空**（R-T6）。
5. **成功指标四要素**（R-T5）——无量化指标须显式声明豁免。

---

## Loader（按需加载，不一次读全）

| 何时                           | 读                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 需要节点定义 / 编号 / 空值三态 | `prd-language.md`                                                                                                                                        |
| 任何规则、门禁、自检判据       | `projection-rules.md`（唯一规则源）                                                                                                                      |
| 选章 / 归一 / 防重复           | `chapter-tree.md`                                                                                                                                        |
| 写某章要骨架                   | `templates/core.md`（Core+页面+埋点+BR+Open Q）；AI 章→`templates/ai.md`；后台/非功能→`templates/backend.md`；数据→`templates/data.md`；i18n/发布/后续/风险→`templates/extension.md` |

> Template 按加载单元分组：写哪类章才读哪个文件，不整包 Read。

---

## 输出与恢复

- **默认只交付 PRD**：落盘到 PM 指定路径；未指定则当前目录 `PRD-<主题>.md`。
- 范围清单 / Plan / 自检记录均为内部工作态，不默认展示、不要求确认。Coverage 映射**必须建**（P0 保真的强制证据，见 projection-rules 自检 P0）；Large 将其持久化在 projection-state，最终交付前删除。
- 用户说「继续」且存在 projection-state：先读 state → 校验目标 PRD 已完成章节 → 找到第一个依赖已满足的 pending / in-progress 章节 → 只加载该章来源片段与模板继续。禁止重读全部原文或重写已完成章节。
- state 丢失但目标 PRD 仍有 `PRD-WORKING` 标记：根据已填章节和 Coverage 重建最小 state 后继续，不从头生成。
- 全局检查通过后：删除所有 `PRD-WORKING` 标记和 projection-state；默认仍只向用户交付最终 PRD。
