# 决策日志机制 — 目标与完成标准

## 用户目标
给 auto-goal 加"项目级决策落盘"机制：把 **agent 跟用户探讨过的** 和 **用户主动拍板/否决的** 核心决策，实时汇聚到 `.ace/project/decisions.md`，跨任务累积。未来凭该文档在新目录复刻功能等价项目。

## 锁定的设计决策（六条，均经用户确认）
1. **捕获范围** = AskUserQuestion 问答 + 用户对话中主动决策（否 仅AskUserQuestion）
2. **捕获时机** = 实时追加，不等归档（用户主动指正在任意轮次，中断不丢）
3. **组织** = 线性时间序 + 轻量 tag，不预设分类（YAGNI）
4. **演进** = 不可变 + supersede 留痕（A→B = 新增B条 supersedes A + A标superseded）
5. **准入判据** = "换个选择，复刻的项目会不同"才进；拿不准默认收（用户事后删）
6. **实现** = 纯 SKILL/LLM 驱动，不改 ace CLI（对话语义决策 CLI 抓不到）

## 准入判据（核心铁律）
> 一个决策进 decisions.md，当且仅当——换一个选择，复刻出来的项目会不同。

刷掉四类噪声：澄清型（理解非决策）、过程型（影响流程非形态）、交付格式（一次性）、跨领域岔题（与本项目形态无关）。

## 完成标准
- shared/decision-log-protocol.md：准入判据 + 捕获时机 + 条目模板 + supersede + tag
- auto-goal/SKILL.md：新增落盘节 + 触发规则 + 参考索引
- agent 能确定性执行"何时写/写什么/写哪"
- decisions.md 条目含：内容/来源/否决项/tag/时间/来源任务/状态

## 现状锚点（已勘查）
- state.json.simple.decisions[] 已有结构化格式 {decision,reason,alternatives}（state-template.md:106-119），可作 decisions.md 条目字段基础
- 无任何项目级决策汇聚（详见 memory: ace_decisions_no_project_home）
- experience-protocol 有"完成必触发 + 一行式告知 + append 项目文件"成熟模式，可平行借鉴写法
- 改的是全局插件 D:\Users\r.shi\.claude\plugins\marketplaces\ace-local\，对所有项目生效
