# 并行调度协议

面对 2+ 个独立子任务时的并行执行规则和模板。

---

## 依赖测试

**核心判断**：如果 A 的结果完全不同，B 的执行方式会变吗？
- **不会** → 并行
- **会** → 串行

## 并行机会识别

- 多文件/模块独立调研 → 并行 Agent
- 多个不相关代码修改 → 并行 Agent（配合 worktree）
- 信息收集 + 不依赖其结果的准备工作 → 并行
- 多个独立验证步骤（测试、lint、类型检查）→ 并行 Bash
- aspec 多维度分析（≥3 个独立维度）→ 并行 Agent

---

## 约束

- 并行 Agent **≤ 8**
- 每个 Agent prompt **必须自包含**（目标 + 上下文 + 交付格式）
- **不修改同一文件**（冲突风险）
- 结果回收后，主 agent 负责整合、冲突解决
- 在**单个 response** 中发出多个 Agent tool 调用

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
