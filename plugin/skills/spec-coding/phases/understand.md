# Phase 1: Understand（需求理解 + 对齐）

**目的**：深度理解需求并与用户形成共识。内部严格执行"先想后问"。

**交互规范**：所有 AskUserQuestion 调用遵循 `references/ask-user-guide.md`。

---

## Step A: 内部深度分析（先想，无用户交互）

### 1. 解析用户输入

提取核心意图、关键实体、约束条件。

### 2. 鸟瞰式探索项目上下文

≥3 源时并行 Agent：
- `.ace/experience.md`（历史经验）
- 项目结构 Glob（技术栈识别）
- `openspec/specs/` 相关领域（已有规范）
- Git log --oneline -20（近期方向）

**注意**：不深入代码实现，只看结构和高层信息。代码深入探索留给 Phase 3 Design。

### 3. 苏格拉底四追问（内部思考）

- **追问目的**：为什么做？解决什么根本问题？谁受益？
- **追问完整性**：全貌还是冰山一角？关联问题？前置依赖？
- **追问前提**：假设成立吗？更好的问题框架？
- **追问约束**：什么不能动？硬限制？时间/资源/技术债？

### 4. 维度分析

Read `knowledge/dimensions.md`：
- 对照 8 个需求维度识别缺失
- 生成 unknowns 列表

### 5. 范围评估（主检测点）

信号检测：
- 描述了 ≥2 个独立子系统？
- 涉及 ≥3 个无关技术层变更？
- "平台"、"系统"等宏大词汇 + 无明确边界？

IF 触发 → `scope_assessment = "needs_decomposition"`

### 6. Defeater 搜索

对用户核心断言 Steel-man → Attack：
- 构建断言的最强版本
- 尝试攻破（与代码现状矛盾？推理跳跃？）

---

## Step B: 交互对齐（后问，基于 Step A 的分析）

### 7. 范围分解路由

```
IF scope_assessment == "needs_decomposition":
  第一个 AskUserQuestion = 分解策略确认：
  "我识别到这包含 N 个独立部分：[列表]。
   建议按 A → B → C 顺序。同意先做 A 吗？"
  → 确认后只对选中的子项目继续澄清
  → 其余记为 Future Changes
```

### 8. 基于 unknowns 设计问题

- 暴露取舍（方案 A vs B）
- 关联问题（"X 还涉及 Y？"）
- 优先级（时间/质量/范围）

### 9. AskUserQuestion（引导性澄清）

### 10. 展示四要素对齐（markdown 文本输出）

直接用 markdown 呈现，**不放入 AskUserQuestion**：

```markdown
**我的理解**
（1-2 句核心意图 + 关联问题）

**计划方向**
（1-2 句高层策略）

**关键假设**
- 假设 1
- 假设 2

**完成标准**
- 可测试条件 1
- 可测试条件 2
```

### 11. AskUserQuestion（对齐审批）

在同一 response 中，紧接四要素文本后调用 AskUserQuestion：

```
AskUserQuestion(questions: [{
  header: "对齐确认",
  question: "以上理解是否准确？",
  options: [
    {label: "通过", description: "理解正确，继续下一步"},
    {label: "拒绝", description: "理解有偏差，需要重新对齐"}
  ]
  // 用户选 Other 并输入内容 = 有补充的通过
}])
```

处理逻辑：
- 通过 → 事件 `aligned` → Phase 2
- Other（用户输入补充）→ 读取补充 → 更新理解 → 进入 Phase 2
- 拒绝 → 回到 Step 8 重新澄清

### 12. 写入 issues/requirement-issues.md

记录发现的问题、风险、待确认事项。

### 13. 事件 `aligned` → Phase 2

---

## 门禁

<HARD-GATE>
未调用 AskUserQuestion 获得确认 = Phase 1 未完成。
文本提示不能替代工具调用。
</HARD-GATE>

## 跳过条件（Step B 可跳过，**全部**满足）

- 同会话已完整表达意图
- 无 unknowns
- 无惊讶假设
- 延续性修复

## Red Flags

| 想法 | 真相 |
|------|------|
| "任务很简单" | 简单 = 隐含决策被忽略 |
| "用户说清楚了" | 说清楚 ≠ 理解正确 |
| "先探索代码再对齐" | 对齐在深入代码之前（代码探索留给 Design） |
