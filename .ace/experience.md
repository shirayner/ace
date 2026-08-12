
### E1: FleetView TaskUpdate 与 ACE CLI 归档的混淆风险
- **场景**：auto-goal 任务完成后未执行 `ace task complete/archive`，state.json 停留在 in_progress
- **发现**：FleetView `TaskUpdate(status=completed)` 与 `ace task complete` 词形相似但完全独立；两步归档命令可分离，AI 完成第一步后注意力转向汇报，第二步被遗漏；规范文字说明不足以阻止行为——必须配合机械约束（原子命令 + 规范 HARD-GATE）
- **适用范围**：所有 simple 类型任务（auto-goal / requirement-analysis / code-review）的收尾流程
- **验证记录**：首次记录（2026-06-15）

### E2: 复杂场景的方法路由需要可观察触发信号
- **场景**：需求理解 Skill 仅规定“按需读取”方法包时，Normal 场景复核遗漏了条件组合和失败补偿检查。
- **发现**：方法路由不能只列问题类型；应在主流程中把多角色/多条件、失败/超时/部分成功、规则冲突等可观察输入信号直接映射到对应方法包，同时保留 Frontier 与低价值过滤，避免方法清单既漏检又变成固定问卷。
- **适用范围**：依靠渐进披露、检查包或按需参考文件处理复杂输入的 Agent Skill。
- **验证记录**：首次记录（2026-08-12）

### E3: ACE 归档失败可能留下状态与目录不一致
- **场景**：Windows 上执行 `ace task done` 时，complete 成功但目录 rename 因 `EPERM` 失败。
- **发现**：归档失败后不能只看命令退出码或 `state.json`；CLI 可能已写入 `completed` 和 `archived_at`，但任务目录仍在活跃区。应同时检查源目录与归档目标，确认目标不存在且源目录属于本次任务后，再恢复物理目录一致性。
- **适用范围**：Windows 环境下 ACE simple 任务的完成与归档。
- **验证记录**：首次记录（2026-08-12）
