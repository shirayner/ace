# 决策日志瘦身 — 目标与完成标准

## 问题
decisions.md 会随使用持续增大。最痛点 = 复刻时 agent 读整份进 context，superseded 决策是纯噪声。

## 锁定决策（均经用户确认）
1. **字段激进极简**：只留 `标题/时间/状态/决策/否决`。去掉 tag、来源、任务三项（来源/任务对复刻零贡献、审查边际；tag 早期是负担）
2. **TOC 检索**：文件头自动索引（D号+标题），取代 tag 检索
3. **active/archive 分层**：主文件 `decisions.md` 只留 accepted 现行决策；被 supersede 的旧条移到 `decisions-archive.md`。复刻只读主文件 = 零噪声、context 最省
4. **落地**：改协议 + 同步源码仓 + 迁移现有样例

## 不采用
- 日志压缩/rollup（有损，丢失用户拍板原文，违背不可变原则）
- 按领域分片（上轮已定不预分类；分层是按现行/被取代拆，不违反）

## 完成标准
见 state.json completion_criteria
