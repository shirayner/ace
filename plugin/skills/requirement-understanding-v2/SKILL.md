---
name: requirement-understanding-v2
description: 当用户带着功能诉求、产品想法、已有 PRD/文档或半成品，需要先理解、澄清并对齐需求时使用。将输入建模为 RequirementModel，使用 RequirementIssue 处理缺失、歧义、冲突、决策、验证、范围和术语问题；只向用户提出高价值问题，低风险可逆项允许 AI 给出显式默认；通过精确 revision 门禁确认后，在同一会话交给 requirement-writing 撰写 PRD。当用户说“帮我理需求”“需求还没想清楚”“先澄清”“对齐目标”“基于这份文档确认需求”“复述一下我的需求”时应触发。DO NOT TRIGGER：需求已经对齐且只需撰写 PRD；已有定稿只需编码；纯技术架构或实现方案设计；只要求修改现有 PRD 文案而不需要重新理解需求。
---

# 需求理解 V2

**核心目标：建立可追溯的需求模型，只处理值得处理的问题，并让用户确认精确的模型版本。**

本 Skill 在同一 Session 内完成：

```text
构建模型 → 处理问题 → 确认 revision → 交接 requirement-writing
```

不要求落盘中间状态，不维护跨 Session 工作流，不直接撰写 PRD。

---

## 一、运行契约

只维护两个核心领域模型：

- `RequirementModel`：当前需求全貌；
- `RequirementIssue[]`：理解过程中发现、处理和保留历史的问题集合。

只有 RequirementIssue 保存显式状态：

```text
open | resolved | parked | superseded
```

RequirementModel 不保存 `model_status`：

- `confirmed_revision === revision` → `confirmed`；
- 未确认但满足门禁 → `ready`；
- 其他情况 → `draft`。

**失效不变量**：已确认版本中新发现 blocker、conflicted 理解，或其他会改变模型完整性/风险暴露的 Issue 时，必须在创建 Issue 前或同一原子更新中增加 revision，先让旧确认失效。

工作流不保存 `workflow_phase`。完整字段、不变量和状态规则见 `references/state-model.md`。

---

## 二、不可违反的原则

### 1. 来源、认知状态、确认方式分离

一个 AI 默认被用户批准后仍然是：

```yaml
origin: ai_default
understanding_status: confirmed
confirmation_mode: batch_confirmation
```

不得把来源改写为 `user_statement`。

### 2. 不为正常事实制造 Issue

输入中无冲突且 authority 已知的事实或规则直接进入 RequirementModel。只有真正存在缺失、歧义、冲突、决策、验证、范围或术语问题时才创建 RequirementIssue。

### 3. 未知不等于 AI 默认

当前没人知道答案时，只能：

- 保持 blocker；
- 建立验证计划；
- 明确停车；
- 让用户明确接受风险。

高风险未知不得因为用户说“别问了”“先这样”而变成 AI 默认。

### 4. 只问高价值问题

提问价值由“错误返工成本 × 可推断性”决定：

- 高成本、低可推断 → 问用户或保持 blocker；
- 高成本、高可推断 → 先调查，再按需确认；
- 低成本、低可推断 → AI 显式默认，门禁统一批准；
- 低成本、高可推断 → 直接建模。

### 5. 历史追加，不覆盖过去

用户改变已作出的决定时，新建 Issue 并通过 `supersedes_issue_id` 指向旧 Issue；旧 Issue 变为 `superseded`，旧 Interaction 和 Resolution 必须保留。

### 6. 对齐必须有显式证据

<HARD-GATE name="需求模型确认门禁">
对用户宣告需求已对齐或交接 requirement-writing 前，必须向用户展示包含明确 revision 的结构化确认请求，并收到显式回复。
无 AskUserQuestion 工具时使用 Markdown A/B/C 选项。
没有显式回复，不得设置 confirmed_revision，不得宣告对齐，不得交接。
</HARD-GATE>

---

## 三、主流程

### Step 1：构建 RequirementModel

加载 `references/flow.md` 和 `references/state-model.md`：

1. 从用户输入和来源材料中提取 problem、desired outcome、target users、success signals；
2. 建立 in-scope/out-of-scope、关键术语和 RequirementItem；
3. 保留影响语义的来源引用；
4. 不补写用户未表达且无法合理推断的高风险规则。

### Step 2：识别并处理 RequirementIssue

对每个真实问题：

1. 标记 issue type、目标、影响、可逆性、证据置信度和 blocker；
2. 选择一种 `resolution_route`：
   - `investigate_evidence`
   - `ask_user`
   - `apply_ai_default`
   - `define_validation_plan`
   - `record_user_decision`
3. 按依赖关系先处理前置 Issue；
4. 通过 Interaction、Parking 或 Resolution 留下可追溯结果。

完整分流、依赖和收敛规则见 `references/flow.md`。

### Step 3：与用户交互

准备提问时加载 `references/interaction-contract.md`：

- 无法合理枚举答案 → `open_ended`；
- 可枚举且需要决策 → `option_selection`；
- 选项使用 A/B/C 短标题，description 单独说明完整含义；
- 只有 choice question 才可给 AI 推荐；
- AI 推荐理由单独展示；
- 必须允许用户自定义答案；
- 最终审批选项不得标推荐。

用户说不清或抽象沟通失效时加载 `references/prototyping.md`，用 Markdown 表格、Mermaid、GWT 或低保真线框帮助认知。

### Step 4：确认与交接

准备收敛时加载 `references/alignment-handoff.md`：

1. 派生 RequirementModel 是否 ready；
2. 将非阻塞未知归一化为 Parking、Validation Plan 或 Accepted Risk；
3. 生成一个屏幕内的 revision 确认；
4. 用户确认后原子更新 confirmation metadata；
5. 确认后不得残留任何 open Issue；
6. 用户选择继续时，同一 Session 直接交给 requirement-writing。

---

## 四、References 按需加载

| 当前任务 | 必须读取 |
|---|---|
| 建立或更新模型、判断状态和 revision | `references/state-model.md` |
| 执行理解、问题识别、路由和收敛 | `references/flow.md` |
| 向用户提问、记录选项和用户响应 | `references/interaction-contract.md` |
| 用户难以抽象表达，需要可视化制品 | `references/prototyping.md` + `references/interaction-contract.md` |
| 最终确认、revision 更新和下游交接 | `references/alignment-handoff.md` |

不要每轮加载全部 references；只在进入对应行为前读取。

---

## 五、输出与用户体验

### 面向用户

不要输出内部 JSON 或完整状态对象。用户应看到的是：

- 聚焦的问题；
- 简短的影响说明；
- 必要时 1–3 个清晰选项；
- 独立的 AI 建议与理由；
- 可快速扫描的最终确认。

### 内部维护

随会话维护：

- 当前 RequirementModel revision；
- 当前有效 RequirementIssues；
- Interaction、Resolution 和 supersede 历史；
- confirmed revision。

### 下游交接

handoff 不是第三个模型。requirement-writing 直接消费同一 Session 中：

- 已确认的 RequirementModel；
- 非 superseded 的 RequirementIssues；
- 原始来源材料和用户确认上下文。

---

## 六、Red Flags

出现以下念头时立即纠正：

| 错误念头 | 正确行为 |
|---|---|
| “先问了再说” | 先判断能否调查、是否高价值 |
| “所有缺失信息都问用户” | 低风险可逆项允许 AI 默认 |
| “用户说够了，所以 blocker 变默认” | 高风险未知只能验证、停车或接受风险 |
| “文档里写了，所以一定 authoritative” | authority 针对被引用信息判断 |
| “用户选择推荐项，所以推荐正确” | 只记录接受/保留/反转，不称准确率 |
| “模型摘要差不多就算确认” | 必须确认精确 revision |
| “门禁通过后还能留几个 open Issue” | handoff 前不得残留 open Issue |
| “决定变了就改旧 Resolution” | 新建 Issue supersede 旧 Issue |
| “没有问答工具就跳过门禁” | 使用 Markdown A/B/C |
| “V1 的 Ask/Assume/frontier 继续作为 V2 模型” | V2 只使用 RequirementModel 与 RequirementIssue[] |
