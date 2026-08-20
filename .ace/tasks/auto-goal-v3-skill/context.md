# auto-goal-v3 通用目标达成 Skill

## 目标

新建 `auto-goal-v3`：给一个目标 → 理解 → 决策树 grill 澄清 → 对齐 → 拆分并行派发 → 独立 verifier 收口。
简洁直击要害，依赖脚本用 Python。跑通后删除 v2。

## v2 的根因诊断（实测）

| 测量 | 结果 |
|---|---|
| v2 SKILL.md 本身 | 6.1 KB |
| v2 非测试运行时文件 | 375 KB / 60 个文件 |
| v2 实测单会话摄入 | 1,002,190 字符 / 821 次文件读取 |
| `dispatch-worker.mjs` 单文件被摄入 | 296,803 字符 |
| v2 真实被调用 | 1 次（同期 v1 8 次） |

**根因**：入口不大，成本在级联加载。更深一层——v2 把模型的**判断**翻译成了 JS
（`reducer.mjs` 推导状态、`semantic-validator.mjs` 判角色权限、`outcome.mjs` 派生终态）。
这些是认知工作，写成代码后模型既读协议语义又读实现核对，两头付费。
20 个测试文件（300 KB）测的是这套翻译层的自洽，不是目标达成质量。

对照 `mattpocock/skills` 的 `grilling`：整套机制 5.2 KB，一个数据结构（design tree）
+ 一个计算（frontier）+ 一个循环（rounds），全在模型上下文，零运行时。

## 设计

```
auto-goal-v3/
  SKILL.md            五阶段主流程（唯一每次必读，≤6 KB）
  references/
    grill.md          决策树 + frontier + 批量提问 + 歧义扫描
    dispatch.md       拆分与并行派发契约
    accept.md         验收 agent 独立取证契约
  scripts/
    goal.py           单文件 CLI，只管账
```

峰值摄入 = SKILL.md + 当前阶段 1 份 reference ≈ 10 KB。

## 让 agent 真正穿透需求的三个机制（进 SKILL.md，其余压进 reference）

1. **方案→目标反推** — 打掉"解决方案伪装需求"
2. **frontier 排序** — 不问已被上游答案决定的问题
3. **半成功探针** — "如果这一步只成功了一半，系统应该处于什么状态？"一句话穿透事务/幂等/补偿/反馈

## 决策

见 state.json 的 `simple.decisions`（4 条）。

## 已知弱化

放弃 v2 的 clean-context 硬阻塞（D0019）。v3 用原生 Agent（天然新上下文）+ 要求 subagent
只回结构化摘要。用户已确认接受此弱化。

## 已修改文件

（执行中）
