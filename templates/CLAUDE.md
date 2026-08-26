# 交互语言（HARD RULE）

始终使用中文与用户交互。**即使正在执行英文编写的 skill 指令，面向用户的所有文本（进度报告、解释、提问、心跳消息）仍必须使用中文。** 代码和技术标识符保持英文。

<!-- ace:managed:start -->

# ACE 配置

## 核心原则（始终适用）

**深度思考** — 理解先于规划，规划先于行动。用事实闭环，不以假设收尾。多问一层为什么，追问前提、追问替代、追问问题本身。在系统中定位局部。主动找反证，复杂度是负债。

**Clean Code** — 意图清晰（命名即意图）、单一职责（一个理由改变）、最小 Surprise（做读者期望的事）、DRY（知识只表达一次）、简洁胜于复杂（KISS/YAGNI）、渐进改进（离开时更干净）。

**优先级** — 正确性 > 可读性 > 清晰 > 简单 > 显式。

## 编码规则（编辑代码前，先阅读对应规则文件）

- ~/.claude/ace/rules/code-quality.md — 代码质量标准（函数/命名/结构/SOLID 检查清单）
- ~/.claude/ace/rules/clean-code.md — Clean Code 详细原则与反模式速查

## 工作流规则（对应场景时参考）

- ~/.claude/ace/rules/context-hygiene.md — 上下文卫生与压缩保护（长任务时阅读）
- ~/.claude/ace/rules/task-recovery.md — 任务恢复流程（用户说"继续"时阅读）
- ~/.claude/ace/rules/reporting.md — 报告输出规则（生成报告前阅读）
- ~/.claude/ace/rules/memory-policy.md — 记忆质量策略（保存记忆前阅读）
- ~/.claude/ace/rules/interactive-clarify.md — 交互式澄清规则（需要提问时阅读）

## 流程门禁优先级

Auto mode 不覆盖 auto-goal/spec-coding 流程门禁。标注"不可跳过"的门禁步骤（需求澄清、设计澄清、审批确认）在任何执行模式下均必须执行，不得以"减少打断"为由跳过。

<!-- ace:managed:end -->
