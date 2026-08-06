# Chapter Tree — 文档结构

> Structure 层定义已确认 RequirementModel 的信息如何组织成章节。节点定义见 `prd-language.md`，规则见 `projection-rules.md`，骨架见 `templates/`。

---

## 章节体系

Core = 常用骨架；Extension = 按模型内容出现；Common = 跨功能共享收纳。章节是否出现取决于当前 confirmed 模型是否有对应信息。

```text
├── Core                                      → templates/core.md
│   ├── 文档信息      Doc Meta
│   ├── TL;DR         一句话总结
│   ├── 背景与目标    Background & Goals
│   ├── 成功信号与指标 Success Signals & Metrics
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
└── Common
    └── 公共业务规则  Shared Business Rules   → templates/core.md
```

### 模型内容到章节

| confirmed 模型内容 | 章节 |
|---|---|
| Intent.problem / desired_outcome | 背景与目标 |
| Intent.target_users | 用户与场景 |
| Intent.success_signals 中的定性或部分量化信号 | 成功信号与指标：按已确认内容原样写成叙述或列表 |
| Intent.success_signals 或 RequirementItem 中同时明确基线、目标、测量口径和时间窗的量化指标 | 成功信号与指标：渲染结构化量化指标表 |
| RequirementItem 的全部 scope_item_ids 指向 in_scope | 功能需求 / 业务流程 / 对应 Extension |
| RequirementItem 的全部 scope_item_ids 指向 out_of_scope | 不生成当前需求；仅由关联 ScopeItem 决定非目标/后续规划/不展示 |
| out_of_scope 且明确当前边界 | 非目标 |
| out_of_scope 且 rationale 明确未来承诺 | 后续规划，一句话 |
| 明确的 confirmed RequirementItem、ScopeItem 或 rationale 描述风险/取舍 | 风险与依赖：作为普通风险内容保真投影 |
| superseded Issue | 不进入当前 PRD |

量化信号缺少基线、目标、测量口径或时间窗时，按已确认内容原样写成叙述或列表，不生成结构化量化表，也不因此产生 ProjectionGap。仅当模型将其定义为验收或发布门槛，且缺失口径导致业务上无法判定时才返回 ProjectionGap。

---

## 章节标题序号

- 最终出现的 `##` / `###` / 必要 `####` 按实际顺序连续编号；模板保持裸标题。
- 章节序号只用于阅读导航，REQ/BR/AC 才是跨引用语义编号。
- 示例：`### 3.1 REQ-001 <标题>`；引用时写 `REQ-001`，不写 `3.1`。

---

## 推荐投影顺序

```text
已确认 RequirementModel revision
+ scope_items + vocabulary + requirements
+ confirmed success signals / risks / dependencies
        ├──→ Why：背景 → 目标/非目标 → 成功信号与指标
        ├──→ Who：用户与场景
        └──→ Rules：公共 BR 候选与规则归属

Why + Who + Rules
        └──→ Flow：业务流程 / 分支 / 异常

Why + Who + Rules + [Flow]
        └──→ Features：逐个 REQ + 可验证验收表达
                  └──→ Extensions

Why + Features + Extensions
        └──→ Delivery：发布 → 风险与依赖

全部主体完成
        └──→ TL;DR（最后生成）
```

推荐顺序是同一 Session 内的章节依赖指引，不是持久状态或恢复协议：先确定文档信息与 Why/Who，再处理共享规则、流程、逐项 REQ、Extension 和交付信息，最后压缩 TL;DR。若前置语义不足，按输入门禁或 ProjectionGap 处理，不写占位正文。

---

## 选章：三问 + 归一

1. 当前 confirmed RequirementModel 有这块内容吗？没有 → 不出。
2. 删除该章会影响理解、交付或 confirmed 语义显式表达吗？不会 → 删除或合并。
3. 是否有更合适的既有章？有 → 并入，不新开。

章数越少越好，但不得删除 in_scope 内容或已有明确 confirmed 模型依据的风险与依赖。

### 常见内容归一

| 输入内容 | 归到 | 说明 |
|---|---|---|
| 目标与整体概述 | TL;DR + 背景与目标 | 不保留 megachapter |
| 端到端步骤/分支 | 业务流程 | 简单独立能力可不出流程章 |
| AB 实验 | 成功信号与指标或发布计划 | 指标与灰度节奏分开 |
| 文案 key / 多语言 | 国际化与多端 | 不放功能正文重复 |
| 数据口径 | 数据规则/指标 | 不写接口契约 |
| 已确认的产品风险、取舍或跨团队事项 | 风险与依赖 | 仅按明确 confirmed requirement/scope/rationale 投影，不新增语义 |
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
| 风险与依赖 | 已确认的风险、取舍、责任和应对 | 模型未确认的风险结论或 Writer 新增的接受语义 |

---

## 分支裁决

- 无跨 REQ 公共规则 → 跳过 Shared Business Rules；
- 无端到端时序/分支/回流 → 跳过 Business Flow；
- Extension 无模型信息增量 → 不生成；
- 无 confirmed 产品风险或依赖 → 可跳过 Risks；
- out_of_scope 无明确未来承诺 → 不生成 Future Scope；
- 章节依赖未完成 → 停止，不猜写。
