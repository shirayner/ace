# Phase 1: Understand（需求理解 + 对齐）

**目的**：深度理解需求并与用户形成共识。内部严格执行"先想后问"。

**交互规范**：所有 AskUserQuestion 调用遵循 `references/ask-user-guide.md`。

---

## Step A: 需求深度分析（先想，无用户交互）

### 0. 检测 requirement-analysis 产物

检查 `.ace/changes/{name}/` 是否存在：
- **存在** → 读取 `prd.md`（替代原始需求输入）、读取 `.ace/changes/{name}/issues/requirement-issues.md`（继承已有澄清结论）
  - 后续 Step A 分析基于 prd.md 内容进行
  - Step B 只识别**技术实现层面**的新 unknowns（业务澄清已在 requirement-analysis 完成）
- **不存在** → 按当前逻辑从零开始

### 1. 解析用户输入

提取核心意图、关键实体、约束条件。

### 2. 鸟瞰式并行探索项目上下文

<HARD-GATE>
以下探索 SHALL 通过单条 response 中的多个 Agent tool 并行发起。
禁止改为串行直接工具调用（逐个 Read/Grep/Glob）。
Terminal state = 单条 response 中出现 ≥2 个 Agent tool 调用。
为什么用 Agent 而不是直接工具：Agent 并行运行减少等待时间；code-explorer 的多轮 glob+grep 探索是直接工具调用无法在单步完成的。
</HARD-GATE>

并行发起以下 Agent（来源存在则探索，不存在则跳过该 Agent）：

| Agent | 探索目标 | 存在条件 |
|---|---|---|
| context-reader | `.ace/experience.md` + `openspec/specs/` 下与需求相关的规范文件，返回摘要 | `.ace/` 目录存在 |
| code-explorer | 定位需求涉及的核心文件，返回文件路径 + 关键接口签名（不深入实现）| 项目有 src 目录 |
| git-reader | `git log --oneline -20` 近期方向 + `git status` 当前状态 | 有 `.git` |

**降级路径**：所有来源均不存在（纯新项目）→ 跳过并行 Agent，直接进入 Step 3。
**来源 < 2 个存在**（如只有 git）→ 仍用单个 Agent 异步执行，不退化为直接工具调用。

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

### 7. 确定 change_name + 创建工作目录

<HARD-GATE>
Step A 完成后、进入 Step B 之前，必须创建工作目录和状态文件。
这是后续所有文件操作的基础。
</HARD-GATE>

```
1. 根据需求意图生成 change_name（kebab-case，2-4 个英文单词，如 add-avatar-upload）
2. 执行 openspec new change {change_name}
   → 创建 openspec/changes/{change_name}/ 目录
3. 创建 .ace-state.json（参见 references/state-template.jsonc）：
   Write $PROJECT_ROOT/openspec/changes/{change_name}/.ace-state.json
```

```json
{
  "change_name": "{change_name}",
  "created_at": "{YYYY-MM-DD}",
  "phase": "understand",
  "workflow": "pending",
  "timestamps": {
    "understand_started": "{ISO时间}"
  },
  "understand": {
    "scope_assessment": null,
    "aligned": false,
    "issues_file": "issues/requirement-issues.md"
  }
}
```

后续所有文件操作路径：`$PROJECT_ROOT/openspec/changes/{change_name}/`（简称 `$CHANGE_DIR`）

---

## Step B: 需求澄清（先解决信息缺口，确定需求）

**配置驱动**：
```
IF mode == "auto":
  → 跳过 Step B 和 Step C
  → AI 自主完成所有决策（假设走推荐选项）
  → 直接进入 Phase 2
IF mode == "manual":
  → 执行完整的澄清 + 对齐流程
```

### 8. 范围分解路由

```
IF scope_assessment == "needs_decomposition":
  第一个 AskUserQuestion = 分解策略确认：
  "我识别到这包含 N 个独立部分：[列表]。
   建议按 A → B → C 顺序。同意先做 A 吗？"
  → 确认后只对选中的子项目继续澄清
  → 其余记为 Future Changes
```

### 9. 识别待澄清问题 + 分级 + 写入文件

基于 Step A 的分析，整理所有 unknowns/待澄清事项，**写入 issues 文件**：

```
Write $CHANGE_DIR/issues/requirement-issues.md
```

```markdown
# Requirement Issues

| id | question | level | status | answer | source |
|----|----------|-------|--------|--------|--------|
| R1 | 头像尺寸限制多少？ | 必须澄清 | open | - | - |
| R2 | 存储方式选本地还是 OSS？ | 必须澄清 | open | - | - |
| R3 | 上传格式支持哪些？ | 记录假设 | assumed | JPEG/PNG/WebP | 参照现有上传逻辑 |
```


#### 问题分级（VOI 简化模型）

| 维度 | 高 | 低 |
|------|---|---|
| **假设失败成本** | 错了需回退阶段/重做大量工作 | 错了后续微调即可 |
| **可推断性** | 代码/文档/上下文无法推断 | 有明确信号可推断 |

| 级别 | 判定条件 | 处理方式 |
|------|---------|---------|
| 必须澄清 | 假设失败成本高 + 不可推断 | 向用户提问，status=open |
| 记录假设 | 假设失败成本低，或可从上下文推断 | AI 做出假设，status=assumed |

### 10. 澄清循环（问→回写文件→检查新问题）

```
LOOP:
  1. 从 $CHANGE_DIR/issues/requirement-issues.md 中取所有 status=open 的问题
  2. 按问题澄清模式（参见 references/ask-user-guide.md）向用户提问
     - 每轮 ≤4 个问题
     - 每个问题给推荐选项
  3. 收到回答后回写文件：
     - Edit requirement-issues.md: status=open → resolved, answer=用户回答
  4. 检查：用户回答是否引发新问题？
     IF 有新问题 → 追加到文件（评估分级）→ 回到 1
     IF 无新问题 → 退出循环
```

**退出条件**：所有 status=open 的问题已 resolved。

---

## Step C: 认知对齐（需求确定后，展示 AI 的理解供用户确认）

**前置条件**：Step B 的澄清循环已完成，所有"必须澄清"的问题已 resolved。

<HARD-GATE>
Step C 禁止夹带新问题。对齐是"展示确定性认知"，不是"补问遗漏"。
如果写对齐内容时发现还有不确定的点 → 停止，回到 Step B 继续澄清。
AskUserQuestion 必须严格按审批模式：只有"通过"和"拒绝"两个选项。
</HARD-GATE>

### 11. 展示四要素对齐（markdown 文本输出）

基于已澄清的需求 + 已记录的假设，形成确定性认知，用 markdown 呈现：

```markdown
**我的理解**
（1-2 句核心意图 + 关联问题 — 基于澄清后的确定信息）

**计划方向**
（1-2 句高层策略 — 不应有 ⚠️ 标记，因为疑问已澄清）

**关键假设**
- 假设 1（来自 requirement-issues.md 中 status=assumed 的条目）
- 假设 2

**完成标准**
- [具体可测试条件，如：蛇可在 canvas 上移动且方向键控制有效]
- [具体可测试条件，如：吃到食物后身体增长 1 格]
- [具体可测试条件，如：碰壁或碰自身后显示游戏结束]
```

<HARD-GATE>
四要素缺一不可。"完成标准"必须是从需求直接推导出的可测试条件（能用来验收），不是泛泛的"功能可用"。缺失完成标准 = 未完成 Step 11，不得进入审批。
</HARD-GATE>

**自检**：
- 四要素中是否有问句？→ 有则回到 Step B
- 关键假设中是否有"待确认"？→ 有则回到 Step B
- 计划方向中是否有 ⚠️？→ 有则回到 Step B
- 完成标准是否为具体可测试条件（而非"功能可用"之类空话）？→ 不是则重写

通过自检 → 进入 Step 12 审批。未通过 → 回到 Step 10。

### 12. AskUserQuestion（对齐审批）

在同一 response 中，紧接四要素文本后调用 AskUserQuestion：

```
AskUserQuestion(questions: [{
  header: "认知对齐",
  question: "以上理解是否准确？",
  options: [
    {label: "通过", description: "理解正确，继续下一步"},
    {label: "拒绝", description: "理解有偏差，需要重新对齐"}
  ]
  // 用户选 Other 并输入内容 = 有补充的通过
}])
```

处理逻辑：
- 通过 → 更新 .ace-state.json: phase="propose" → Phase 2
- Other（用户输入补充）→ 更新 requirement-issues.md → 进入 Phase 2
- 拒绝 → 回到 Step 9 重新澄清

### 13. 更新状态 + 事件 `aligned` → Phase 2

```
Edit $CHANGE_DIR/.ace-state.json:
  "phase": "propose",
  "workflow": "{分级结果: trivial|small|standard|large}",
  "timestamps.propose_started": "{ISO时间}",
  "understand": {
    "scope_assessment": "{appropriate|needs_decomposition}",
    "aligned": true,
    "issues_file": "issues/requirement-issues.md"
  }
```

---

## 门禁

<HARD-GATE>
未调用 AskUserQuestion 获得确认 = Phase 1 未完成。
文本提示不能替代工具调用。
</HARD-GATE>

## 跳过条件（Step B 澄清可跳过，**全部**满足）

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
