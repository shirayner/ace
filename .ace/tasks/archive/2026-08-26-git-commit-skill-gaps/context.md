# git-commit skill 缺口补全

## 目标

补全 `plugin/skills/coding/git-commit/SKILL.md` 中三个由真实使用暴露的空白：

1. **merge / revert / release 等特殊提交无规定** — 导致每次 merge 都在重新猜格式
2. **Co-Authored-By 等 trailer 无规定** — agent 行为随机
3. **发布提交无规定** — 历史里出现过 `release:` 非法 type

## 起因

用户在 `spec-portal-service` 提交 merge commit `13d6874a` 时，发现 skill 的 type 枚举里没有 merge 类型，
无从判断 merge commit 是否该套 Conventional Commits，要求给出判断。

## 关键判断：merge commit 豁免 Conventional Commits

证据（`spec-portal-service`，21 人协作仓库）：

| 事实 | 数据 |
| --- | --- |
| 标准 `Merge ...` 格式的 merge commit | 221 个 |
| 其中由 GitLab MR 自动生成（`into 'main'`） | 70 个 |
| 脱离默认格式的野 merge | 14 个（`merge code`、`add logic`、`merge with main`…） |

推论：
- 70 个由平台生成 → 要求它们合规等于要求改 GitLab 行为，不可落地
- 14 个野格式恰恰是脱离默认格式后的产物，信息量更低 → 默认格式是更优解
- 工具链（commitlint defaultIgnores、semantic-release）靠 `Merge ` 前缀识别并跳过；
  改成 `chore(merge): ...` 会让 merge 进入 changelog，形成污染

## 关键判断：13d6874a 历史不动

- 该 commit 未推送（`feat/clarify` ahead 15），技术上 amend 安全
- 但 amend merge commit 有丢失第二 parent 的风险 → 会丢掉整个合并拓扑
- 其 body 是**全仓库唯一有实质内容的 merge body**（12 行；其他 8 个带 body 的都是 MR 自动生成的 2 行模板），
  记录了 `streamingHandleRef` 必须置于 `isCurrentTurn` 守卫之前（否则流泄漏）
  与 `partialBuffer` 处 git 未标记的语义冲突 —— 均无法从 diff 看出
- 结论：格式"违规"仅在 subject 的 type 前缀，而 subject 恰是 merge 场景该豁免的部分；body 判据本就满足

## 本轮范围（用户确认）

**做**：缺口 1/3/4 —— 新增「特殊提交」节 + trailer 说明
**不做**：description 补 DO NOT TRIGGER、收敛「唯一真相源」措辞、密钥防护强化
**不做**：spec-portal-service 跑测试（用户明确只改 skill）

## 未纳入本轮的已核实缺口（备查）

| # | 问题 | 证据 |
| --- | --- | --- |
| 2 | 「唯一真相源」声称不成立 | `ace/CONTRIBUTING.md` 也定提交规范，type 仅 6 个，缺 style/perf/build/ci/revert，未提中文 subject 与 30 字上限 |
| 5 | description 缺 DO NOT TRIGGER | 体系 27 个 skill 中 15 个有显式边界声明 |
| 6 | 密钥防护无兜底 | skill 只说「扫一遍文件名」；`ace/.gitignore` 无任何 `.env`/密钥条目 |
| 7 | 规范零机器兜底 | 两仓库均无 commitlint、无 hook、CI 不校验提交信息 |
