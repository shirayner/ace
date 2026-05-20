# 经验进化协议

任务完成后提取可复用经验的流程。

---

## 触发判断

满足任一 → 执行经验提取：
- 执行中遇到意外、踩坑、策略转换
- 发现反直觉的技术事实
- 找到跨任务可复用的模式

**全部不满足** → 标注"无新经验"，跳过。不要为仪式感编造经验。

---

## 执行流程

### 1. 提取

按场景选择格式：

**通用格式**（auto-goal → `.tasks/experience.md`）：

```markdown
### E{N}: {场景标题}
- **场景**：{触发情境}
- **发现**：{具体经验}
- **适用范围**：{何时可复用}
- **验证记录**：{首次记录/待验证}
```

**结构化格式**（aspec → 项目知识库）：
- 技术决策 → `openspec/decisions/adr.md`
- 领域词汇 → `openspec/glossary.md`
- 风险事件 → `openspec/risk-map.md`
- 复盘记录 → `retrospectives/`（按 `experience-template.md` 结构）

### 2. 应用

新任务启动时读取 experience.md（如存在）：
- 应用时告知用户："基于经验 E{N}，采用…"
- 每次应用记录验证结果：✓有效 / ✗无效 / —不适用

### 3. 收敛

- 条目 >20 → 合并相似、淘汰无效（需用户确认）
- 累计 3+ 次 ✓有效 → 调用 AskUserQuestion 提议提升至 `~/.claude/memory/`

---

## aspec 特有：收尾 Checklist

aspec tasks 完成后，按以下顺序执行：
1. 复盘：对照 design.md 检查实施偏差 → `spec/notes.md`
2. 经验提取：按上述格式写入 `experience.md`
3. 经验验证：标记本次应用的历史经验（✓/✗/—）
4. 经验收敛：>20 条则提议合并
5. 归档确认：AskUserQuestion 询问用户
