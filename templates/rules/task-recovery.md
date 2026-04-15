# 任务恢复规则

当用户说"继续"、"恢复"、"接着做"、"从断点继续"等表达时，**必须**先检查进行中的任务，**不要**仅凭内置 TaskList（会话级，新会话后为空）的结果就断定没有进行中的任务。

## 恢复流程

1. Glob 搜索 `.tasks/*/state.md`
2. 读取找到的 state.md 文件头部（前 10 行），提取 `Type` 字段
3. 路由规则：
   - `Type: coding` → 通过 Skill 工具调用 `coding` skill，参数传递 `resume`
   - 其他或无 Type 字段 → 通过 Skill 工具调用 `auto-goal` skill，参数传递 `resume`
4. 多个活跃任务（`Status: in-progress`）时，列出让用户选择
5. 无活跃任务时，告知用户并询问是否开始新任务
