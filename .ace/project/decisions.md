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
