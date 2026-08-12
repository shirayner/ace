---
name: requirement-understanding
description: 当用户希望澄清一句话想法、PRD 内容或 PRD/文档链接，或需要在写作、设计、实现前建立可显式确认的需求共识时使用。适用于“帮我理需求”“先澄清这个想法”“基于这份 PRD 对齐目标”等场景；需求已明确确认且只需执行、或纯技术方案设计时不触发。
---

# 需求理解

**核心信念：先理解并确认，再进入任何下游工作。**

本 skill 只负责把需求澄清到可确认。它不编写 PRD、不设计技术方案、不开始实现，也不引入 Requirement Canvas 或任何准 PRD 中间产物。

## 不可破坏的规则

1. 用户已经明确的业务规则、约束和决定必须保留原意；只澄清其中的缺口、冲突与歧义，不以“优化”为名篡改。
2. 可从输入、链接、代码或环境查明的事实由执行者查证；只把价值取舍和业务决策交给用户，不把用户当搜索引擎。
3. 唯一提交给用户确认的产物是固定五段式**需求对齐卡**：用户诉求、目标、非目标、关键假设、完成标准。不得附加 glossary、决策清单、Canvas 或其他确认附件。
4. Frontier 只是在每轮推导出的当前可问问题集合，不持久化为状态对象。
5. Readiness 通过前不得生成需求对齐卡；生成后必须调用 AskUserQuestion，并收到用户显式确认，才可宣告“需求已对齐”。沉默、未反对、继续执行指令都不等于确认。

## 执行入口

进入本 skill 后，完整读取并执行 [`references/flow.md`](references/flow.md)。它是需求画像、因果决策树、Frontier 推导、逐轮澄清和 Readiness 检查的单一真相源。

仅在流程要求时按需读取：

- 向用户提问：[`references/ask-user-guide.md`](references/ask-user-guide.md)
- 命中问题信号时选择发现方法：[`references/packs.md`](references/packs.md)
- Readiness 通过后生成并确认对齐卡：[`references/alignment-gate.md`](references/alignment-gate.md)

## 完成边界

只有 `alignment-gate.md` 定义的确认门禁通过，本 skill 才完成。确认未通过时返回主流程修正；确认通过后停止，不擅自代替下游动作。
