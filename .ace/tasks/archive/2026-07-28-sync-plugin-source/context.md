# 同步插件改动回源码仓

## 目标
把本会话对 marketplace 插件副本（`.claude/plugins/marketplaces/ace-local/`）的改动，同步回源码仓 `plugin/`。

## 映射
- marketplace `shared/decision-log-protocol.md` → 源码 `plugin/shared/decision-log-protocol.md`（新建）
- marketplace `skills/auto-goal/SKILL.md` → 源码 `plugin/skills/auto-goal/SKILL.md`（3 处编辑）

## 决策
- 仅同步插件源码；`.ace/project/decisions.md` 样例不进源码仓（工作产物非发布物，用户确认）

## 完成标准
见 state.json completion_criteria
