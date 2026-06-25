# 恢复协议

恢复中断的 auto-goal 任务时，按以下步骤执行：

## 标准恢复流程

1. **扫描活跃任务** — Glob `.ace/tasks/*/state.json`（**显式跳过 `.ace/tasks/archive/` 子目录**）
   筛选 `type=="simple"` 且 `status!="completed"` 的任务
2. **定位** — 读取 `.ace/tasks/{changeName}/state.json`
3. **验证** — Glob/Read 轻量确认声称的产出是否真实存在
4. **加载上下文** — 读取 `.ace/tasks/{changeName}/context.md` 获取决策和中间结论
5. **读经验** — 读取 `.ace/experience.md`（如存在）
6. **重建 UI** — 用 TaskCreate 重建进度显示
7. **继续** — 从 state.json 的当前任务状态继续执行

## Fallback：state.json 不存在时

如果 `.ace/tasks/` 目录不存在或为空（用户换了环境、清理了文件）：

1. **从 git 重建** — `git log --oneline -20` + `git diff --stat` 了解最近工作
2. **从文件重建** — Glob 查找最近修改的文件，推断进度
3. **向用户确认** — 呈现你重建的理解，确认后继续
4. **创建新 state.json** — 基于重建的理解创建，避免再次丢失

## 恢复后验证清单

- [ ] state.json 中标记 done 的任务，产出文件确实存在
- [ ] 当前任务的"已完成子任务"对应的代码变更确实存在
- [ ] 没有遗留的半完成修改（编译错误、broken import 等）

验证失败 → 将对应项标回 pending，从正确的状态重新开始。
