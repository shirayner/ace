# 并行调度协议（HOW）

本文件只回答"如何并行"。"何时并行"由各 skill 自行声明。

---

## 依赖测试

**核心判断**：A 的结果完全不同时，B 的执行方式会变吗？
- **不会** → 并行
- **会** → 串行

---

## 硬约束

- 并行 Agent **≤ 8**
- 每个 Agent prompt **必须自包含**（目标 + 上下文 + 交付格式）
- **不修改同一文件**（冲突风险）
- 在**单个 response** 中发出多个 Agent tool 调用
- 结果回收后，主 agent 负责整合与冲突解决

---

## Prompt 模板

### 探索型（调研/分析）

```
分析 {target} 的 {aspect}。
上下文：{relevant context}
约束：只读操作，不修改文件。
输出格式：发现列表 + 风险评估 + 行动建议（200 字内）
```

### 实现型（代码变更）

```
实现 {task}。
上下文：{project structure + constraints}
完成标准：{criteria}
验证：完成后运行 {verify command}
输出：状态（DONE/BLOCKED/NEEDS_CONTEXT）+ 变更摘要 + 验证结果
```

### Review 型（审查）

```
审查 {scope} 的 {aspect}。
检查重点：{checklist}
输出格式：
✅ 通过 — {确认}
或
❌ 问题列表（文件:行号:问题:建议）
```

---

## state.md 并行标注约定

- `⟂` 标记可并行子任务
- `(depends: X)` 标记串行依赖

示例：
```markdown
## Tasks
- [x] T1: 需求分析
- [ ] T2: 模块 A 实现 ⟂
- [ ] T3: 模块 B 实现 ⟂
- [ ] T4: 集成测试 (depends: T2, T3)
```

---

## 反模式

### ❌ 串行探索轰炸
对 ≥3 个独立目标逐个 Read/Grep/Explore，浪费多轮往返。

### ✅ 并行 Agent 一轮完成
识别独立维度 → 构造自包含 prompt → 单条 response 并行发出。
