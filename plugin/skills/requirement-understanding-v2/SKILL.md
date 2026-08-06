---
name: requirement-understanding-v2
description: 当用户带着功能诉求、产品想法、已有 PRD/文档或半成品，需要先理解、澄清并对齐需求时使用。将输入建模为 RequirementModel，使用 RequirementIssue 处理缺失、歧义、冲突、决策、确认前事实核验、范围和术语问题；只向用户提出会改变 PRD 且无法可靠推断的高价值问题，低风险可逆项允许 AI 给出显式默认；最终让用户确认精确 revision，并输出可无损投影为 PRD 的 ConfirmedRequirementOutput。当用户说“帮我理需求”“需求还没想清楚”“先澄清”“对齐目标”“基于这份文档确认需求”“复述一下我的需求”时应触发。DO NOT TRIGGER：需求已经确认且只需整理文档；已有定稿只需编码；纯技术架构或实现方案设计；只要求修改现有文案而不需要重新理解需求。
---

# 需求理解 V2

**核心目标：建立可追溯的需求模型，只处理值得处理的问题，并让用户确认一个足以无新增业务语义地投影为 PRD 的精确模型版本。**

本 Skill 的完整职责是：

```text
构建模型 → 处理问题 → PRD 投影预检 → 确认 revision → 输出已确认需求
```

不要求落盘中间状态，不维护跨 Session 工作流，不撰写最终交付文档，也不决定或调用任何后续流程。

---

## 一、运行契约

只维护两个核心领域模型：

- `RequirementModel`：当前需求全貌；
- `RequirementIssue[]`：理解过程中发现、处理和保留历史的问题集合。

只有 RequirementIssue 保存显式状态：

```text
open | resolved | superseded
```

RequirementModel 不保存 `model_status`：

- `confirmed_revision === revision` 且满足确认输出不变量 → `confirmed`；
- 未确认但满足 PRD-ready 条件 → `ready`；
- 其他情况 → `draft`。

等待门禁批准的 AI 默认可以暂时保持 `proposed + open apply_ai_default`。这是门禁候选状态，不是 ready 或 confirmed；只有用户确认时将条目与 Issue 原子更新为 `confirmed + resolved` 后才可输出。

**失效不变量**：已确认版本中新发现任何产品语义缺口时，无论它是否阻塞或立即影响风险，都必须在创建 Issue 前或同一原子更新中增加 revision，先让旧确认失效。只有不创建 Issue、也不改变需求事实的纯表达或组织问题例外。

工作流不保存 `workflow_phase`。完整字段、不变量和状态规则见 `references/state-model.md`。

---

## 二、不可违反的原则

### 1. 来源、认知状态、确认方式分离

AI 默认被用户批准后仍然是：

```yaml
origin: ai_default
understanding_status: confirmed
confirmation_mode: batch_confirmation
```

不得把来源改写为 `user_statement`。

### 2. 不为正常事实制造 Issue

输入中无冲突且 authority 已知的事实或规则直接进入 RequirementModel。只有真正存在缺失、歧义、冲突、决策、确认前事实核验、范围或术语问题时才创建 RequirementIssue。

### 3. 未知事实必须在确认前查明

`issue_type=validation` 只表示“确认 PRD 前必须完成的事实核验”。它只能通过 `investigate_evidence` 查明，并以 `verified_fact` 解决；证据不足时保持 `open` blocker。产品本人不知道业务事实时，应等待其咨询有权人员并带回可追溯结论，不得猜测或确认。

### 4. 只问高价值问题

提问价值由“错误返工成本 × 可推断性”决定：

- 高成本、低可推断 → 问正确的决策者，或保持 blocker；
- 高成本、高可推断 → 先调查，再按需确认；
- 低成本、低可推断 → AI 显式默认，门禁统一批准；
- 低成本、高可推断 → 直接建模。

只问会改变 PRD、无法可靠推断且错误会造成明显返工的问题。

`apply_ai_default` 只允许整体返工成本低、`error_impact=low`、`reversibility=easy` 的非核心语义。每个可独立批准或反转的默认必须创建独立的 `open + apply_ai_default` Issue。

### 5. 已知取舍必须成为明确需求边界

用户确认的取舍使用 `user_decision`，并把采用结论、适用边界和理由写入 confirmed ScopeItem、RequirementItem 或 rationale。任何尚无答案、尚未核验或仍冲突的业务事项都不能进入 confirmed 输出。

### 6. 历史追加，不覆盖过去

决定反转时创建新 Issue，通过 `supersedes_issue_id` 指向旧 Issue。旧 Interaction、Resolution 和来源证据保留。

---

## 硬门禁

<HARD-GATE name="需求模型确认门禁">
对用户宣告需求已对齐或输出 ConfirmedRequirementOutput 前，必须展示包含明确 revision 的结构化确认请求，并收到用户显式回复。
无 AskUserQuestion 工具时使用 Markdown 选项。
没有显式回复，不得设置 confirmed_revision，也不得宣告对齐或输出已确认结果。
</HARD-GATE>

---

## 三、主流程

### Step 1：构建 RequirementModel

加载 `references/flow.md` 和 `references/state-model.md`：

1. 提取 problem、desired outcome、target users，以及输入明确提供的定性或部分量化 success signals；
2. 建立 in_scope/out_of_scope、关键术语和 RequirementItem；每个 RequirementItem 通过 `scope_item_ids` 关联 disposition 一致的 ScopeItem；
3. 对每个 in-scope RequirementItem，确认仅凭当前 confirmed 模型语义足以形成至少一个可判定真假的完成条件；不强制 GWT，也不增加 Example 模型；
4. 保留影响语义的来源引用；
5. 不补写用户未表达且无法可靠推断的高风险规则；
6. 按信号最小化选择 5 Whys/JTBD、Impact Mapping、苏格拉底/反证、决策表、状态图、少量 GWT/反例或低保真制品，不把方法建成领域模型。

### Step 2：识别并处理 RequirementIssue

对每个真实问题：

1. 标记 type、目标、影响、可逆性、证据置信度和 blocker；
2. 选择 `investigate_evidence`、`ask_user`、`apply_ai_default` 或 `record_user_decision`；
3. 按依赖关系处理；
4. 通过 Interaction 或 Resolution 保留结果；
5. `deferred` 只记录延后，Issue 仍为 open；影响 PRD 时必须是 blocker。

完整规则见 `references/flow.md`。

### Step 3：适用维度扫描与用户交互

按需扫描角色、主流程、规则、异常/失败、边界/重复、状态、权限、数据口径、集成/依赖、质量要求、成功信号和范围，并逐一预检每个 in-scope RequirementItem 是否足以形成至少一个可判定真假的完成条件。每个适用维度只能是：已明确；不适用且有理由；或创建 RequirementIssue。定性和部分量化 success signal 按已确认内容原样保留；只有完整四要素才形成结构化量化指标，缺失本身不制造 Issue，除非验收或发布门槛因此无法判定。

准备提问时加载 `references/interaction-contract.md`：

- 无法合理枚举答案 → `open_ended`；
- 可枚举且需要决策 → `option_selection`；
- 选项使用短 label，description 单独承载完整语义；
- 推荐只用于 choice question，理由独立展示；
- 允许用户自定义答案；
- 最终审批选项不得标推荐。

抽象沟通失效时，同时加载 `references/prototyping.md` 与 `references/interaction-contract.md`。

### Step 4：确认并输出

准备收敛时加载 `references/alignment-output.md`：

1. 检查 PRD-ready 条件或仅剩待门禁批准 AI 默认的门禁候选条件；
2. 完成适用维度扫描，确保不存在未闭合业务事项；
3. 生成与复杂度匹配的 revision 确认；
4. 用户确认后，原子更新 AI 默认、Issue 状态和 confirmation metadata；
5. 执行 `alignment-output.md` 的输出前最终断言；
6. 输出 `ConfirmedRequirementOutput`，结束本 Skill。

---

## 四、References 按需加载

| 当前任务 | 必须读取 |
|---|---|
| 建立或更新模型、判断状态和 revision | `references/state-model.md` |
| 执行理解、问题识别、方法路由和收敛 | `references/flow.md` |
| 向用户提问、记录选项和用户响应 | `references/interaction-contract.md` |
| 用户难以抽象表达，需要诊断制品 | `references/prototyping.md` + `references/interaction-contract.md` |
| 最终确认、边界校验和输出 | `references/alignment-output.md` |

只在进入对应行为前加载所需 reference。

---

## 五、输出契约

本 Skill 只输出：

```text
ConfirmedRequirementOutput
├── requirement_model
├── requirement_issues
├── source_references
└── confirmation_evidence
```

输出必须满足 `references/alignment-output.md` 的最终断言和 `references/state-model.md` 的 Confirmed Output 不变量。该对象是当前模型及证据的传递视图，不是第三套需求模型。

ConfirmedRequirementOutput 中 RequirementModel 的每个模型条目都必须是 `understanding_status=confirmed`；草稿、待核验或冲突认知不得进入输出。每个 in-scope RequirementItem 还必须仅凭当前 confirmed 语义足以形成至少一个可判定真假的完成条件。

面向用户只展示聚焦问题、必要影响说明、清晰选项和可快速扫描的最终确认；不输出内部 JSON 或完整审计历史，除非用户要求。

---

## 六、Red Flags

| 错误念头 | 正确行为 |
|---|---|
| “先问了再说” | 先判断能否调查、是否高价值 |
| “所有缺失信息都问用户” | 低风险可逆项允许显式默认 |
| “用户说够了，所以 blocker 变默认” | 未知事实保持 open blocker，直到取得证据 |
| “文档里写了，所以一定 authoritative” | authority 针对被引用信息判断 |
| “用户选择推荐项，所以推荐正确” | 只记录接受、保留和反转，不称准确率 |
| “模型摘要差不多就算确认” | 必须确认精确 revision |
| “确认后还能留几个 open Issue” | 输出已确认结果前不得残留 open Issue |
| “决定变了就改旧 Resolution” | 新建 Issue supersede 旧 Issue |
| “没有问答工具就跳过门禁” | 使用 Markdown 选项 |
| “为了短而省略关键规则” | Normal 确认展示全部 in-scope Requirement 索引和关键规则 |
| “旧清单继续作为 canonical 模型” | 只使用 RequirementModel 与 RequirementIssue[] |
