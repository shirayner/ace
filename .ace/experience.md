
### E1: FleetView TaskUpdate 与 ACE CLI 归档的混淆风险
- **场景**：auto-goal 任务完成后未执行 `ace task complete/archive`，state.json 停留在 in_progress
- **发现**：FleetView `TaskUpdate(status=completed)` 与 `ace task complete` 词形相似但完全独立；两步归档命令可分离，AI 完成第一步后注意力转向汇报，第二步被遗漏；规范文字说明不足以阻止行为——必须配合机械约束（原子命令 + 规范 HARD-GATE）
- **适用范围**：所有 simple 类型任务（auto-goal / requirement-analysis / code-review）的收尾流程
- **验证记录**：首次记录（2026-06-15）
