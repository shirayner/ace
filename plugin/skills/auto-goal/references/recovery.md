# 恢复协议

恢复中断的 auto-goal 任务时，按以下步骤执行：

## 标准恢复流程

1. **定位** — 读取 `.tasks/auto-goal-{id}/state.md`（Tier 1）
2. **验证** — Glob/Read 轻量确认声称的产出是否真实存在
3. **加载上下文** — 根据当前需要加载 Tier 2 文件（context.md / decisions.md / reflections.md）
4. **读经验** — 读取项目经验文件（优先 `openspec/experience.md`，不存在则尝试 `.tasks/experience.md`）
5. **重建 UI** — 用 TaskCreate 重建进度显示
6. **继续** — 从 state.md 的"下一步"继续执行

## Fallback：state.md 不存在时

如果 `.tasks/` 目录不存在或为空（用户换了环境、清理了文件）：

1. **从 git 重建** — `git log --oneline -20` + `git diff --stat` 了解最近工作
2. **从文件重建** — Glob 查找最近修改的文件，推断进度
3. **向用户确认** — 呈现你重建的理解，确认后继续
4. **创建新 state.md** — 基于重建的理解创建，避免再次丢失

## 恢复后验证清单

- [ ] state.md 中标记 [done] 的 Phase，产出文件确实存在
- [ ] 当前 Phase 的"已完成子任务"对应的代码变更确实存在
- [ ] 没有遗留的半完成修改（编译错误、broken import 等）

验证失败 → 将对应项标回 pending，从正确的状态重新开始。
