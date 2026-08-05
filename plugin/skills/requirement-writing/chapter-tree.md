# Chapter Tree — 文档结构

> Structure 层定义已确认 RequirementModel 的信息如何组织成章节。节点定义见 `prd-language.md`，规则见 `projection-rules.md`，骨架见 `templates/`。

---

## 章节体系

Core = 常用骨架；Extension = 按模型内容出现；Common = 跨功能共享收纳。章节是否出现取决于当前已确认 V2 模型是否有对应信息。

```text
├── Core                                      → templates/core.md
│   ├── 文档信息      Doc Meta
│   ├── TL;DR         一句话总结
│   ├── 背景与目标    Background & Goals
│   ├── 成功指标      Success Metrics
│   ├── 用户与场景    Users & Scenarios
│   ├── 业务流程      Business Flow
│   └── 功能需求      Features
│
├── Extension
│   ├── 页面交互      Page Interaction        → templates/core.md
│   ├── 埋点          Tracking                → templates/core.md
│   ├── 国际化与多端  i18n & Multi-platform   → templates/extension.md
│   ├── 数据规则/指标 Data Rules/Metrics      → templates/data.md
│   ├── 数据产品规格  Data Product Spec        → templates/data.md
│   ├── 非功能需求    Non-Functional          → templates/backend.md
│   ├── 后台配置      Backend Config          → templates/backend.md
│   ├── Guardrail / Eval (AI)                 → templates/ai.md
│   ├── 发布计划      Rollout                 → templates/extension.md
│   ├── 后续规划      Future Scope            → templates/extension.md
│   └── 风险与依赖    Risks & Dependencies     → templates/extension.md
│
├── Common
│   └── 公共业务规则  Shared Business Rules   → templates/core.md
│
└── 收尾
    └── 待决与验证事项 Open Items             → templates/core.md
```

### V2 状态到章节

| V2 内容 | 章节 |
|---|---|
| Intent.problem / desired_outcome | 背景与目标 |
| Intent.target_users | 用户与场景 |
| Intent.success_signals | 成功指标 |
| RequirementItem 的全部 scope_item_ids 指向 in_scope | 功能需求 / 业务流程 / 对应 Extension |
| RequirementItem 的全部 scope_item_ids 指向 out_of_scope | 不生成当前需求；仅由关联 ScopeItem 决定非目标/后续规划/不展示 |
| out_of_scope 且明确当前边界 | 非目标 |
| out_of_scope 且 rationale 明确未来承诺 | 后续规划，一句话 |
| parked | 待决与验证事项：暂缓 |
| validation_plan | 待决与验证事项：待验证 |
| accepted_risk | 风险与依赖：已接受 |
| superseded Issue | 不进入当前 PRD |

---

## 章节标题序号

- 最终出现的 `##` / `###` / 必要 `####` 按实际顺序连续编号；模板保持裸标题。
- 章节序号只用于阅读导航，REQ/BR/AC 才是跨引用语义编号。
- 示例：`### 3.1 REQ-001 <标题>`；引用时写 `REQ-001`，不写 `3.1`。

---

## Large：展示顺序与编写顺序分离

```text
已确认 RequirementModel revision
+ scope_items + vocabulary + requirements
+ parked / validation_plan / accepted_risk
        ├──→ Why：背景 → 目标/非目标 → 成功指标
        ├──→ Who：用户与场景
        └──→ Rules：公共 BR 候选与规则归属

Why + Who + Rules
        └──→ Flow：业务流程 / 分支 / 异常

Why + Who + Rules + [Flow]
        └──→ Features：逐个 REQ + AC
                  └──→ Extensions

Why + Features + Extensions
        └──→ Delivery：发布 → 风险 → Open Items

全部主体完成
        └──→ TL;DR（最后生成）
```

### Large 编写顺序

1. 骨架与文档信息；
2. Why / Who；
3. Rules；
4. Flow；
5. Features；
6. Extensions；
7. Delivery（含 accepted risk 与 Open Items）；
8. TL;DR。

章节依赖未完成时保持 pending，不写占位正文。回改只重检下游章节与 TL;DR。

---

## 选章：三问 + 归一

1. 当前 confirmed RequirementModel 或有效 RequirementIssue 有这块内容吗？没有 → 不出。
2. 删除该章会影响理解、交付或 V2 状态显式表达吗？不会 → 删除或合并。
3. 是否有更合适的既有章？有 → 并入，不新开。

章数越少越好，但不得删除 in_scope 内容、parked/validation_plan 后续项或 accepted risk。

### 常见内容归一

| 输入内容 | 归到 | 说明 |
|---|---|---|
| 目标与整体概述 | TL;DR + 背景与目标 | 不保留 megachapter |
| 端到端步骤/分支 | 业务流程 | 简单独立能力可不出流程章 |
| AB 实验 | 成功指标或发布计划 | 指标与灰度节奏分开 |
| 文案 key / 多语言 | 国际化与多端 | 不放功能正文重复 |
| 数据口径 | 数据规则/指标 | 不写接口契约 |
| 跨团队事项 | 风险与依赖 | accepted_risk 必须在此显式 |
| 未来承诺 | 后续规划 | 仅来自 out_of_scope 明确 rationale |

### 章节职责边界

| 章节 | 回答的唯一问题 | 不该出现的内容 |
|---|---|---|
| 用户与场景 | 谁在什么情境下使用 | 时序、规则细节 |
| 业务流程 | 事情按什么顺序发生 | 单功能完整验收 |
| 功能需求 | 系统有什么能力、怎样算做对 | 跨功能规则全文、视觉实现 |
| 公共业务规则 | 跨 ≥2 REQ 的规则逻辑 | 单功能局部规则 |
| 页面交互 | 用户与界面如何交互 | 视觉像素与组件实现 |
| 数据规则/指标 | 数据业务口径 | DDL/ER/接口结构 |
| 待决与验证事项 | 输入中已确认保留的 parked/validation_plan | 投影中新发现且尚未由模型确认的未知 |
| 风险与依赖 | 风险、责任和应对 | 未被用户接受的伪 accepted risk |

---

## 分支裁决

- 无跨 REQ 公共规则 → 跳过 Shared Business Rules；
- 无端到端时序/分支/回流 → 跳过 Business Flow；
- Extension 无模型信息增量 → 不生成；
- 无 parked/validation_plan → 跳过 Open Items；
- 无 accepted_risk 和其他产品风险 → 可跳过 Risks；
- out_of_scope 无明确未来承诺 → 不生成 Future Scope；
- 章节依赖未完成 → 停止，不猜写。
