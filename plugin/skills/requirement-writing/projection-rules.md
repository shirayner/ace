# Projection Rules — 唯一规则源

> RequirementModel 是需求语义的唯一 canonical 输入。本 Skill 只投影或报告问题，不修改 canonical 输入。

---

## Semantic Rules（保真底线）

保真对象是通过本 Skill 输入门禁的当前 RequirementModel，不是原始文档全文，也不是旧清单。RequirementItem 的 scope 由 `scope_item_ids` 指向的同 disposition ScopeItem 派生。以下任一违反 = Blocker。

- **R-S1 不遗漏**：每个会进入 PRD 的 confirmed Intent、Vocabulary、in_scope ScopeItem、派生为 in_scope 的 RequirementItem，以及相关规则、约束、边界和数据口径，都必须在 PRD 或 Coverage 中有明确落点。out_of_scope 按 R-S5 处理。
- **R-S2 不改义**：PRD 与当前 revision 一致，不收窄、不放大，不把任何非 confirmed 语义带入正文。
- **R-S3 不静默删**：不因“看着次要”省略 in_scope 条目。out_of_scope 按 R-S5 裁剪。
- **R-S4 不臆造与可追溯**：每条 PRD 需求事实必须能追溯到 RequirementModel item ID，以及有效 SourceReference 或当前有效 Resolution。
  - 当前有效 Resolution 必须属于 `resolved` 且非 superseded 的 Issue，与模型条目双向精确关联，Resolution 语义与当前条目一致，`resolved_model_revision <= current revision`；其 `confirmation_model_revision` 和原始确认证据非空、可追溯且不晚于当前 revision；
  - Resolution 的确认 revision 无需等于当前 revision；无关语义增加 revision 时仍可继续支撑，语义改变时必须由新 Issue supersede 旧 Issue；
  - `origin=user_statement/source_document/verified_evidence`：保留 source ref；
  - `origin=ai_default`：条目必须为 `confirmed + batch_confirmation`，并由当前有效的 `apply_ai_default + low impact + easy reversibility + blocks_confirmation=false + accepted_default + resolved_by=user` Issue 支撑；默认目标不得是 problem、desired outcome、核心范围、关键业务规则或关键数据语义；
  - 顶层 `confirmation_evidence` 始终精确绑定当前整个模型 revision；
  - TL;DR、章节引导和过渡句不得引入新需求事实；
  - 找不到模型依据的产品语义不得写入 PRD，按 R-S7 返回 ProjectionGap。
- **R-S5 Scope 投影**：只消费 `ScopeItem.scope_disposition=in_scope|out_of_scope`，不建立 deprecated/deferred 三态。RequirementItem 的派生 scope 必须来自非空、有效且 disposition 一致的 `scope_item_ids`；混合 disposition 在输入门禁失败。

| scope | 投影规则 |
|---|---|
| `ScopeItem=in_scope` | 用于当前边界；关联 RequirementItem 可形成 REQ/BR/AC/正文 |
| `ScopeItem=out_of_scope` | 关联 RequirementItem 不形成当前 REQ/BR/AC；只按 ScopeItem 的明确 statement/rationale 展示 |

out_of_scope 展示规则：

1. 明确用于划定本次边界 → 写入“非目标”；
2. rationale 明确承诺未来期次/触发条件 → “后续规划”只写一句；
3. rationale 明确表示废弃、移除或不再采用 → 不进入 PRD；
4. rationale 不足且影响 PRD 语义 → 返回 ProjectionGap。

- **R-S6 真实链接不可占位**：输入中的 UI、设计稿、关联 PRD、依赖文档真实 URL 必须原样落入。
  - 可确定租户域的 `<cite doc-id=...>` 应还原为可点 URL；
  - 缺少影响交付的 URL 时返回 ProjectionGap；
  - 裸 doc-id 或虚构占位链接视为 Blocker。
- **R-S7 状态投影与缺口报告**：
  - `confirmed` → 正常投影；
  - 已知风险或取舍仅在模型有明确 confirmed RequirementItem、ScopeItem 或 rationale 时，作为普通风险内容保真投影，不新增“已接受”等语义；
  - `superseded` → 仅作历史，不进入当前 PRD；
  - `proposed/unresolved/unverified/conflicted/open Issue` → 返回 InputContractFailure；
  - 新产品语义缺口 → 返回 ProjectionGap 并停止受影响部分；
  - 不向 PM 追问、不应用默认、不创建 RequirementIssue、不修改 revision、不选择回流或重试路径。

---

## Style Rules

- **R-T1 ⛔ 不写实现**：PRD 只承载需求、业务、产品逻辑与规则。接口契约、DDL/ER、纯技术状态机、prompt 工程、工具编排 = Blocker。
  - 源材料含实现细节时，业务语义翻译为需求语言，纯技术形式剥离；
  - 删除技术形式后产品语义不明确时，按 R-S7 返回 ProjectionGap。
- **R-T2 背景从业务切入**：写业务问题，不写“工具做不到”。
- **R-T3 Feature Rule 不上提**：只服务单个 REQ 的规则留在 REQ；跨 ≥2 个 REQ 才升 BR。
- **R-T4 One Fact One Place**：权威细节只在一个主章节，其余位置引用；摘要不得引入新事实。
- **R-T5 成功信号与指标保真**：定性和部分量化 success signal 都按 confirmed 模型内容原样投影为叙述或列表，不擅自量化或补齐。只有模型同时明确提供完整基线、目标、测量口径和时间窗时，才渲染结构化量化指标表。缺少四要素本身不产生 ProjectionGap，也不要求显式声明“无量化指标”；仅当该指标被模型定义为验收或发布门槛，且缺失口径使业务语义无法判定时才返回 ProjectionGap。
- **R-T6 非目标**：优先来自 out_of_scope。没有 out_of_scope 时写“RequirementModel 未定义额外非目标”。
- **R-T7 每 REQ 有可验证完成条件**：每个 REQ 至少包含一种可判定真假的验收表达，但不强制 Given/When/Then。
  - 简单功能：清晰验收结果或检查表；
  - 条件分支、异常、边界：可选 Given/When/Then；
  - 条件组合：决策表；
  - 状态需求：状态转换表；
  - 数据或质量属性：测量口径或指标阈值；
  - 模型不足以形成可验证结果时返回 ProjectionGap，不推断、不创建新的 canonical 模型对象。
- **R-T8 ≥3 REQ 给总览表**：功能需求 ≥3 个 REQ 时，给编号、标题、优先级、关联 BR 和职责总览。
- **R-T9 空值语义**：使用 `已确认无`、`模型未提供（非需求事实）`、`不适用（说明原因）`，禁止裸写“无”。影响产品判断的缺失返回 ProjectionGap。
- **R-T10 交付前清占位**：删除 `<...>`、HTML 注释、未选用的验收格式和示例值。
- **R-T11 同指标多口径显式区分**：相同口径全文同措辞，不同口径不得共用未限定名词。
- **R-T12 结论先行 + 渐进披露**：TL;DR 首句答“为谁做什么”；背景、REQ 和规则先给结论。
- **R-T13 保真简洁**：删除元话语、同义反复和重复细节；保护范围、条件、数值、规则、例外、风险、来源和验收。

---

## 自检（P0 → P1 → P2）

1. **P0 输入有效**：重新执行 `SKILL.md` 的完整输入门禁；写作期间 revision 未变化。
2. **P0 Coverage**：每个会进入 PRD 的 confirmed Intent/Vocabulary、in_scope ScopeItem 和派生为 in_scope 的 RequirementItem 有 PRD 落点及来源；out_of_scope 只按 R-S5 展示。
3. **P0 状态渲染**：正文只含 confirmed 模型语义；superseded 不进入正文；风险/取舍有明确 confirmed 模型依据且未新增语义。
4. **P0 门禁与结构**：R-T1、R-T5、R-T6、R-T7 通过；链接为真实绝对 URL。
5. **P1 一致性**：术语、角色、流程、规则和数值口径不冲突；新产品语义冲突返回 ProjectionGap。
6. **P1 可扫描性**：长块按主题拆分，比较用表，条件与步骤用列表。
7. **P2 保真简洁**：删减后用保护集做语义回归。

Coverage 和自检记录是内部工作态，不默认输出。失败时只输出 PRD、InputContractFailure 或 ProjectionGap 三者之一。
