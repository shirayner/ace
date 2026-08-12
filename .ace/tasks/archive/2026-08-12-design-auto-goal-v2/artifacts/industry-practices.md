# auto-goal-v2 业界一手实践调研

调研范围：durable execution / checkpointing、event sourcing 与 append-only journal、stateless workers、
human-in-the-loop approvals、structured outputs / schema validation、context engineering、
tool output offloading、agent observability / evaluation。

访问日期：2026-08-12（全部来源当日抓取，WebSearch 通道不可用，全部为直接抓取一手页面）。

调研纪律：每个主题都同时找支持证据和反证。文末单列"不可直接照搬"与"明确反证"两节。

---

## 1. Durable execution / checkpointing

### 1.1 Temporal（durable execution 参考实现）

- 来源：https://docs.temporal.io/evaluate/understanding-temporal （访问 2026-08-12）
- 来源：https://docs.temporal.io/workflow-execution/limits （访问 2026-08-12）

要点：

- Event History 定义为 "a complete and durable log of everything that has happened in the lifecycle of a
  Workflow Execution"。Worker 崩溃后靠 replay 这份 history 重建执行态，然后"从失败点继续，如同失败从未发生"。
- 分层：Workflow 表达业务步骤序列（必须可确定性重放），Activity 是"individual units of work"，
  承载所有易失败的外部交互，由平台按配置自动重试。
- 硬限制（关键，直接影响我们设计）：
  - "The Workflow Execution's Event History is limited to 51,200 Events or 50 MB and will warn you after
    10,240 Events or 10 MB."
  - 每类未完成操作（Activity / Child Workflow / Signal / Cancellation）默认上限 2,000。
  - 未完成 Nexus Operation 默认上限 30，接近时必须 Continue-As-New。

可借鉴原则：

1. **journal 是权威事实，不是日志**。恢复语义 = 从 journal 重建，不是从人写的 summary 猜。
2. **确定性核心 + 非确定性边缘的分层**。把"决策/编排"和"实际副作用"分成两类记录：前者可重放，
   后者必须幂等且带结果记录。V2 的主 Agent 编排 ≈ workflow，worker 的工具调用 ≈ activity。
3. **journal 必须有显式上限和续接机制**。业界最成熟的实现都给 history 设了硬上限并提供
   Continue-As-New（等价于"归档旧段 + 用压缩后的起始状态开新段"）。我们必须自带这个逃逸阀，
   否则长目标必然撑爆。

### 1.2 LangGraph persistence（agent 场景的 checkpointing）

- 来源：https://docs.langchain.com/oss/python/langgraph/persistence （访问 2026-08-12）

要点：

- checkpointer 持久化 "graph state snapshots"，按 `thread_id` 划分作用域，同时服务三件事：
  会话续接、human-in-the-loop、故障恢复。
- 明确 caveat：
  - 内存型 saver（MemorySaver / InMemorySaver）进程重启即全丢。
  - 长会话 checkpoint 会累积，"increasing latency and costs"，官方建议周期性裁剪（pruning）。
  - 子图有独立 checkpoint namespace，"potentially hiding updates from parent graphs"。

可借鉴原则：

4. **checkpoint 与 journal 是两种东西**。journal = append-only 事实流（用于审计/重放/溯源）；
   checkpoint = 可直接加载的当前态快照（用于低成本恢复）。二者都要，但读取成本不同：
   主 Agent 常态只读 checkpoint（小），只在需要溯源时才读 journal 片段。
5. **状态增长必须有裁剪策略**，且裁剪本身要是显式动作（可审计），不是静默丢弃。
6. **子 worker 的状态命名空间要显式挂回父级**，否则会出现"worker 做了但主 Agent 视图里没有"的
   幽灵更新——这与 12-factor 的"统一执行态与业务态"是同一个坑。

---

## 2. Event sourcing / append-only journal：可用性与反证

### 2.1 Martin Fowler 原始定义与其自陈的难点

- 来源：https://martinfowler.com/eaaDev/EventSourcing.html （访问 2026-08-12）

要点（收益）：完整重建历史态、时间点查询、通过反向事件+重放修正历史错误、天然审计轨迹。

要点（作者自陈的成本，这是我们最该关注的部分）：

- **外部系统交互是最棘手的一环**："One of the tricky elements to Event Sourcing is how to deal with
  external systems that don't follow this approach (and most don't)." 重放会误触发对第三方的重复通知，
  必须引入 gateway 区分"真实处理"与"重放模式"。
- **外部查询破坏可重放性**：过去查询返回的是时点数据（汇率、报价），换个日期重放结果不一致，
  必须把历史查询响应与事件一起缓存。
- **接口风格代价**："Packaging up every change to an application as an event is an interface style that
  not everyone is comfortable with, and many find to be awkward."

### 2.2 microservices.io 的 drawback 列表

- 来源：https://microservices.io/patterns/data/event-sourcing.html （访问 2026-08-12）

要点：

- 两大缺点：一是 "a different and unfamiliar style of programming and so there is a learning curve"；
  二是查询困难——"the event store is difficult to query since it requires typical queries to reconstruct
  the state of the business entities"。
- 因此该模式**强制**拉入 CQRS："the application must use Command Query Responsibility Segregation (CQRS)
  to implement queries"，并需要 snapshot 优化长历史的重放开销，且应用必须处理最终一致性读。

### 反证结论：事件溯源对我们是否过重？

**是部分过重的，必须裁剪后使用。** 依据：

- 完整 ES 的成本主要来自它的两个"配套强制项"：CQRS 读模型 + 事件版本演进治理。我们的场景没有
  多消费者读模型的需求（唯一消费者是主 Agent 和恢复流程），因此**引入 CQRS 是纯负债**。
- ES 最棘手的"外部系统重放"问题在我们场景里被放大而非缩小：agent 的副作用是写文件、调 MCP、发消息，
  几乎全是不可重放的外部效应。所以我们**不能把"重放 journal 重建世界"当作恢复手段**，
  只能把 journal 当作"已发生事实的证据"，恢复靠"读事实 + 跳过已完成步骤"，不靠重演副作用。
- 结论：采用 **append-only journal（事实日志）+ 派生 checkpoint（可加载快照）**，
  显式放弃完整 event sourcing 的重放语义、CQRS 读模型和事件版本迁移机制。
  这是"借鉴 ES 的可审计性与幂等恢复"，不是"实现一个 ES 系统"。

可借鉴原则：

7. **journal 只记事实，不记意图推断**。每条记录要能回答"发生了什么、谁做的、产物在哪、是否成功"，
   而不是"我认为下一步应该"。后者属于 checkpoint 的可变字段。
8. **副作用必须幂等或带完成标记**。恢复时先读"已完成清单"再决定跳过，禁止盲目重跑外部写操作。
9. **journal schema 要极简且向前兼容**（少字段、可选字段、未知字段忽略），因为我们不打算建事件迁移工具链。

---

## 3. Stateless workers / 控制流归属

- 来源：https://github.com/humanlayer/12-factor-agents （访问 2026-08-12）

相关 factor：

- **Factor 3 Own your context window**：主动构造喂给模型的信息，不依赖默认拼接。
- **Factor 5 Unify execution state and business state**：避免"agent 以为发生的"与"系统真实状态"分叉，
  同步二者可减少错误并简化生产环境调试。
- **Factor 6 Launch/Pause/Resume with simple APIs**：暂停/恢复要简单，不需要复杂状态重建。
- **Factor 7 Contact humans with tool calls**：人工介入应内建在执行层，作为一次标准工具调用，
  而非事后补丁；文中提到 "good agents are comprised of mostly just software"。
- **Factor 8 Own your control flow**：不要把全部决策交给 LLM 循环，工程侧显式定义分支与执行路径。
- **Factor 10 Small, focused agents**：窄职责 agent 更可靠、更可维护，优于单体大 agent。
- **Factor 12 Make your agent a stateless reducer**：把 agent 当作纯函数式状态变换，
  提升可测试性、可调试性和跨环境一致性。

可借鉴原则：

10. **worker 无状态、纯函数化**：worker 输入 =（任务契约 + 显式上下文切片），输出 =（有界结论 + 产物路径 + 事件）。
    worker 不持有跨调用记忆，不读全局历史，恢复时可原样重放（因为它的副作用被约束在声明的产物路径内）。
11. **控制流归主 Agent 与协议，不归模型自由发挥**：状态机的合法转移、终止条件、BLOCKED/NEEDS_INPUT 处理
    应写成显式规则，而非依赖模型每次自行判断。
12. **人工介入是一次显式动作（工具/事件），不是 prompt 里的一句提醒**——它必须能被 journal 记录、能被恢复。

---

## 4. Human-in-the-loop approvals

- 来源：https://docs.langchain.com/oss/python/langgraph/interrupts （访问 2026-08-12）

要点：

- `interrupt()` 在指定点暂停执行等待外部输入，依赖 checkpointer 保存状态，靠 `Command(resume=value)` 恢复，
  resume 值成为 `interrupt()` 的返回值。
- 常见模式：审批（approve/reject 后分流）、内容审阅（人改 LLM 输出）、关键工具调用前拦截（API/发邮件）、
  输入校验（无效则重新提问）。
- **关键 caveat（必须内化）**：
  - "the node restarts from the beginning of the node where the interrupt was called when resumed,
    so any code before the interrupt runs again" —— 恢复时中断点之前的代码会重跑，
    因此**任何副作用必须幂等**。
  - 不要把 `interrupt()` 包在裸 try-except 里（会吞掉用于暂停的异常）。
  - 不要在单个节点里做条件式/循环式中断，应拆成多个节点 + 条件边。
  - 只能传 JSON-serializable 值。

可借鉴原则：

13. **审批点必须落在"副作用之前"且该点前的代码幂等**。设计 V2 的 NEEDS_INPUT 时，
    要求"提问前不得产生不可回滚的外部副作用"，否则用户答复后重入会造成重复执行。
14. **一个中断点 = 一个独立步骤**，不要在一个 worker 内部做多轮条件中断——拆成多个可恢复步骤更可控。
15. **中断载荷必须是可序列化的结构化数据**（问题、选项、默认值、影响范围），
    这样才能被 journal 记录、被恢复、被审计。

---

## 5. Structured outputs / schema validation

- 来源：https://platform.claude.com/docs/en/build-with-claude/structured-outputs （访问 2026-08-12）

要点（能力）：

- 通过约束采样保证输出符合 schema：结构始终有效、类型与必填字段有保证、"No retries needed for schema violations"。
- 支持：基础类型、`enum`（仅 string/number/bool/null）、`const`、`anyOf`/`allOf`（有限制，
  `allOf` + `$ref` 不支持）、内部 `$ref`/`$defs`、常见 string format、`required`/`default`、
  `additionalProperties: false`（对象**必须**设为 false）、`minItems` 仅支持 0 或 1。

要点（限制，反证向）：

- **不支持**：递归 schema、enum 中的复杂类型、外部 `$ref` URL、数值约束（`minimum`/`maximum`/`multipleOf`）、
  字符串长度约束（`minLength`/`maxLength`）、复杂数组约束、`additionalProperties: true`、
  正则反向引用与前后向断言、词边界。不支持的特性会返回 400。
- **模型仍可能不符合语义约束**：数值/长度约束被"从发给模型的 schema 中剥离"，改由 SDK 事后校验；
  复杂正则可能不按预期工作；流式场景下必须累积完整 JSON 后再校验。
- 结论句值得原文引用：结构化输出 "guarantee valid JSON structure, but not all semantic constraints
  without SDK post-validation"。
- 性能：首次请求有 grammar 编译延迟，编译结果缓存 24 小时；schema 结构变更会失效缓存
  （名称/描述变更不会）。

可借鉴原则：

16. **schema 只能保证形状，不能保证语义**。V2 的所有 worker 返回必须走"schema 校验（形状）
    + 独立语义校验（值域、引用存在性、路径可达性、状态转移合法性）"两道关。
    把"路径必须存在""状态必须是合法枚举转移"当成语义校验器的职责，而不是指望 schema。
17. **schema 设计要保守**：避免递归结构（用扁平数组 + 显式 parent id 表达树）、
    避免依赖数值/长度约束、所有对象显式 `additionalProperties: false`、
    值域用 `enum` 表达。这既贴合约束采样能力，也让本地校验器实现简单。
18. **schema 要稳定**（利于 grammar 缓存与提示缓存），把易变的说明放 description 而非结构。

---

## 6. Context engineering

- 来源：https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents （访问 2026-08-12）

要点：

- **context rot**："as the number of tokens in the context window increases, the model's ability to
  accurately recall information from that context decreases."
  应把上下文视为 "a finite resource with diminishing marginal returns"，模型有类似人类工作记忆的
  "attention budget"。
- **等更大窗口不解决问题**：更大窗口仍面临 "context pollution and information relevance concerns"，
  transformer 的 n² token 关系是架构性约束，注意力退化不可避免。
- **compaction**：总结历史后重启，做"高保真压缩"——保留架构决策、未解决的 bug、实现细节，
  丢弃冗余工具输出。策略是"先最大化 recall，再迭代提升 precision"。
- **结构化记事**：agent 定期把笔记写到上下文窗口之外的持久化存储，以极小开销获得持久记忆。
- **子 agent**："Specialized sub-agents can handle focused tasks with clean context windows"，
  只回传 "condensed, distilled summary"（典型 1,000–2,000 tokens）。
- **just-in-time 检索**：不预载全部数据，而是保存轻量标识符（文件路径、查询、链接），
  运行时按需用工具加载。

补充一手来源（子 agent 的机制与代价）：

- 来源：https://code.claude.com/docs/en/sub-agents （访问 2026-08-12）
  每个 subagent 有独立上下文窗口、自定义 system prompt、限定的工具访问与独立权限；
  用途正是"避免副线任务用搜索结果/日志/文件内容淹没主对话"，只回传摘要；
  同时可通过路由到更快更便宜的模型控制成本。
- 来源：https://www.anthropic.com/engineering/multi-agent-research-system （访问 2026-08-12）
  orchestrator-worker：lead agent 分解任务，subagent 并行、各自独立上下文窗口。
  内部评测提升 "90.2%"；但成本代价明确："agents consume approximately 4× more tokens than chat
  interactions, and multi-agent systems use about 15× more tokens than chats"，
  且 "token usage by itself explains 80% of the variance"。

### 反证：为什么"仅在 prompt 里限长"不足

三条独立证据链：

1. **机制层**：context rot 是注意力机制的架构性退化，不是"模型不听话"。
   prompt 里写"请简短"约束的是**生成端**，而污染主要来自**摄入端**（工具输出、文件内容、
   子任务中间产物）。约束生成端对已经进入上下文的 150k tokens 毫无作用。
2. **可靠性层**：prompt 指令是软约束，服从率不可保证且随上下文变长而下降；
   而"worker 独立上下文 + 只回传摘要"和"工具输出在摄入前被代理裁剪"是**结构性约束**，
   不依赖模型服从。这正是 V2 采用 Tool Proxy 的核心理由：
   把限长从"请求模型自律"变成"物理上无法看到多余内容"。
3. **量化层**：code-execution-with-mcp 给出 150,000 → 2,000 tokens（-98.7%）的实测降幅，
   来源：https://www.anthropic.com/engineering/code-execution-with-mcp （访问 2026-08-12）。
   这种量级的削减只能靠"不让数据流经上下文"实现，任何 prompt 措辞都做不到。

可借鉴原则：

19. **摄入前拦截优于生成后约束**。Tool Proxy 必须在"模型看到之前"完成裁剪/摘要/落盘，
    并回传引用句柄（路径 + 摘要 + 如何进一步取用的指令）。
20. **主 Agent 只读小 checkpoint**，worker 产物落盘并以路径引用；just-in-time 按需加载。
21. **压缩是显式的、高保真的、可审计的**：保留决策/未决问题/约束，丢弃冗余工具输出；
    压缩动作本身应记入 journal（"何时压缩了什么"），避免"静默失忆"。
22. **子 agent 的价值是上下文隔离，代价是 token 与协调**。不要为一切都开 worker，
    只在"会产生大量一次性中间内容"或"需要独立视角"时开。

---

## 7. Tool output offloading

- 来源：https://www.anthropic.com/engineering/code-execution-with-mcp （访问 2026-08-12）
- 来源：https://www.anthropic.com/engineering/writing-tools-for-agents （访问 2026-08-12）
- 来源：https://platform.claude.com/docs/en/build-with-claude/context-editing （访问 2026-08-12）

要点（code execution with MCP）：

- 两类浪费：一是 "Tool definitions overload the context window"（全部工具定义预载）；
  二是中间结果反复穿过上下文（例文：2 小时会议转录被处理两次，可能多出 50,000 tokens）。
- 解法是渐进披露：工具以文件系统形式呈现，agent 按需读取 `./servers/` 下具体工具文件。
- 实测：150,000 → 2,000 tokens，"a time and cost saving of 98.7%"。
- **代价**（重要反证）："Running agent-generated code requires a secure execution environment with
  appropriate sandboxing, resource limits, and monitoring."

要点（writing tools for agents）：

- `response_format` 提供 concise / detailed 两档，例中 206 → 72 tokens（约 -65%）；
  但强调 "there is no one-size-fits-all solution"，要按自己的评测选。
- 返回"有意义的引用"而非完整载荷；避免暴露 `uuid`、`256px_image_url`、`mime_type` 这类低层标识，
  优先人类可读名称；需要技术句柄时同时给两者。
- 实现 "pagination, range selection, filtering, and/or truncation with sensible default parameter values"；
  错误信息应引导 agent 走更省 token 的路径（如多次小范围精确搜索）。
- 工具命名做前缀 namespacing（`asana_search` 等），前缀 vs 后缀在评测中有可测差异。
- "even small refinements to tool descriptions can yield dramatic improvements"——工具接口要靠评测迭代。

要点（context editing，平台侧机制）：

- `clear_tool_uses_20250919` 默认在 **100,000 input tokens** 触发，按时间顺序清理最旧的工具结果，
  默认保留最近 **3** 次工具使用，被清内容替换为占位文本让模型知道"这里被移除了"；
  可配 `clear_at_least`、`exclude_tools`、`clear_tool_inputs`。
- 与 memory tool 配合：模型在清理前收到警告，可先把要点写入记忆文件，之后按需回查。
- **缓存影响**：清理工具结果会**失效**已缓存前缀（产生写入成本，之后复用新前缀）。
- 状态：Beta（需 `context-management-2025-06-27` header）；文档**未给出**量化基准提升。

可借鉴原则：

23. **Tool Proxy 的输出契约固定三段**：摘要（有界）+ 产物路径（可再取）+ 下一步取用指令。
    禁止原样透传大载荷。
24. **默认省、按需详**：所有取用类工具默认 concise + 分页/截断 + 合理默认值；
    详细模式必须显式请求。截断处要写清"如何取剩余部分"。
25. **清理/截断必须留痕**（占位文本 + journal 条目），让模型知道"信息被移除但可回取"，
    避免它把缺失当作"不存在"。
26. **注意缓存代价**：频繁裁剪历史会打掉提示缓存前缀。倾向"一次性大幅裁剪 + 稳定前缀"，
    而不是每步小修小补。
27. **沙箱代价要正视**：若走"代码执行式工具编排"，必须配沙箱、资源上限和监控；
    在 Skill 脚本层面这意味着脚本要限定读写范围、超时、输出上限。

---

## 8. Agent observability / evaluation

- 来源：https://platform.claude.com/docs/en/test-and-evaluate/develop-tests （访问 2026-08-12）
- 来源：https://www.anthropic.com/engineering/multi-agent-research-system （访问 2026-08-12）
- 来源：https://opentelemetry.io/docs/specs/semconv/gen-ai/ （访问 2026-08-12）

要点（评测方法）：

- 两类 grader：**code-based**（exact match、字符串相似度、任务专属指标）快速、可复现、零方差；
  **LLM-as-judge**（Likert 量表、二分类、有序量表）覆盖语气/共情/连贯等主观维度。
- 官方倾向"数量优先"："More questions with slightly lower signal automated grading is better than
  fewer questions with high-quality human hand-graded evals."
- 成功标准应多维且各自独立可测（任务保真、一致性、相关性、语气、隐私、延迟、成本）。
- 评测集分布要贴真实用法，显式覆盖边界（错别字、超长输入、反讽、歧义、无关上下文）。
- LLM-judge 的坑：跨次不一致（需明确 rubric、约束输出为单 token）、对 prompt 措辞敏感、
  偏好更长输出、带来成本与延迟（建议主观维度才用 judge，客观维度用 code grader，
  并用比生成模型不同/更便宜的模型评分）。

要点（agent 评测）：

- 多 agent 研究系统采用 LLM-as-judge，按事实准确性、引用精确性、完整性打分，
  且"不做逐步骤规定式校验"（因为达成路径多样）；人工测试仍不可替代，用于发现边界失败。

要点（可观测标准）：

- OpenTelemetry 的 GenAI semantic conventions 已迁出主 semconv 仓库到独立仓库
  `open-telemetry/semantic-conventions-genai`；主站页面现在只是重定向说明。
  **状态判定：该标准仍在演进/迁移中，字段名不稳定，不宜作为 V2 的硬依赖。**
  （本次抓取未能取到具体 span/attribute 定义页，属未解决项。）

可借鉴原则：

28. **可观测性先落在 journal 上**：每个 worker 调用记录 输入契约摘要 / 耗时 / 结果状态 /
    产物路径 / 失败原因。这是零依赖的 tracing，比对齐外部标准更实用。
29. **验收分两类**：结构性检查用确定性校验器（schema、路径存在、状态机合法、必填章节齐备）；
    质量性检查才用模型判定，且要有明确 rubric 与固定输出格式。
30. **按最终态而非固定步骤验收**：通用目标的达成路径多样，验收应校验"目标产物与约束是否满足"，
    不应要求 agent 走某条预设路径。
31. **judge 的偏差要设防**：不同模型/角色打分、约束输出格式、避免因输出更长而给高分。

---

## 9. 通用 planner 是否可靠：明确反证

- 来源：https://arxiv.org/abs/2402.01817（LLMs Can't Plan, But Can Help Planning in LLM-Modulo
  Frameworks，访问 2026-08-12）
- 来源：https://arxiv.org/html/2409.13373（PlanBench 上评测 LRM/o1，访问 2026-08-12）

要点：

- 立场句："auto-regressive LLMs cannot, by themselves, do planning or self-verification
  (which is after all a form of reasoning)"；作者定位在两个极端之间，
  提出 **LLM-Modulo**：LLM 与**外部基于模型的校验器**做紧密双向交互，
  LLM 被当作 "universal approximate knowledge sources"。
- PlanBench 具体数字（这是最硬的反证材料）：
  - 标准 Blocksworld（600 实例，3–5 blocks）最佳 LLM：**376/600（62.6%）**（LLaMA 3.1 405B, zero-shot）。
  - 语义等价但语法混淆的 Mystery Blocksworld，最强 LLM 仅 **5/600（0.8%）**。
  - o1-preview：Blocksworld **587/600（97.8%）**；Mystery Blocksworld **317/600（52.8%）**；
    随机化 Mystery **224/600（37.3%）**。
  - 更长问题（110 个需 20–40 步解的实例）：o1-preview 仅 **23.63%**。
  - 不可解实例上：Blocksworld 仅 **27%** 被正确判定为不可解，**54%** 的情况给出自信但错误的计划。
  - 作者结论：o1 缺少安全关键部署所需的 "correctness guarantees"，且是 "a fully black box system"。

### 反证结论：通用 planner 不可信作单点权威

设计含义（这直接约束 V2 架构）：

32. **禁止把"模型生成的计划"当作事实**。计划是提案，必须经过外部校验器（确定性规则 + 人工确认）
    才能进入 journal 成为已承诺状态。这就是 LLM-Modulo 的本质：LLM 生成，外部校验。
33. **必须显式处理"不可达/不可解"**。上面 54% 的自信错误说明：模型倾向给出貌似可行的计划，
    而不是承认做不到。V2 必须有 `BLOCKED` / 能力边界声明作为一等公民状态，
    并要求"声明前置条件与验证方式"，让不可达在校验阶段暴露，而不是在执行阶段才发现。
34. **步长越长越不可靠**（23.63% vs 97.8%）。因此要偏好**短步 + 每步验收**，
    而不是让模型一次规划 20+ 步再执行。计划应可增量修订（re-plan），
    并把每次修订记为事件。
35. **表述形式敏感性**（62.6% → 0.8% 仅因换了词表）说明：领域术语陌生会让规划质量崩塌。
    对通用目标而言，必须先做**术语落地/领域锚定**（把陌生领域映射到已知结构与可用工具），
    否则规划质量不可控。这为 V2 的"目标建模/领域锚定"阶段提供了硬证据。

---

## 10. Agent 复杂度的反证：不要默认多 agent

- 来源：https://www.anthropic.com/engineering/building-effective-agents （访问 2026-08-12）

要点：

- 区分 workflow（"LLMs and tools are orchestrated through predefined code paths"）与
  agent（"systems where LLMs dynamically direct their own processes and tool usage"）。
  前者适合定义清晰的任务，后者适合灵活/不可预测的场景。
- 明确劝退："agentic systems often trade latency and cost for better task performance"，
  这个权衡并不总划算；很多应用 "optimizing single LLM calls with retrieval and in-context examples
  is usually enough"。
- 三原则：保持简单、优先透明、精心设计 ACI（agent-computer interface），
  即充分的工具文档与测试；"reduce abstraction layers and build with basic components as you
  move to production"。
- 模式：orchestrator-workers（中心 LLM 动态分解并协调，适合子任务无法预定义的场景）；
  evaluator-optimizer（生成器与评估器迭代反馈）。
- 工具设计用 poka-yoke（防错）思路，例如强制绝对路径以避免常见错误。

- 来源：https://www.anthropic.com/engineering/multi-agent-research-system （访问 2026-08-12）
  反证段落："most coding tasks involve fewer truly parallelizable tasks than research,
  and LLM agents are not yet great at coordinating and delegating to other agents in real time"；
  需要所有 agent 共享同一上下文或彼此强依赖的系统"prove problematic"。

可借鉴原则：

36. **默认最简，按需升级**：能用确定性脚本/单次调用解决的，不要开 worker。
    V2 的复杂度必须有明确触发条件（目标开放、跨领域、需多方案比较、长时程）。
37. **并行只用于真正独立的子任务**，共享状态或强依赖的工作应串行。
38. **ACI 防错优先**：工具签名要让错误难以发生（绝对路径、显式枚举、必填契约字段），
    而不是靠 prompt 提醒。

---

## 不可直接照搬的点（must-not-copy）

1. **完整 event sourcing（含 CQRS + 事件版本迁移）**——我们只有单一消费者，
   引入读模型与迁移工具链是纯负债。只取 append-only 事实日志 + 派生快照。
2. **"重放 journal 重建世界"式恢复**——agent 副作用几乎全是不可重放的外部效应
   （写文件、调 MCP、发消息）。恢复只能是"读已完成事实 + 跳过 + 幂等续做"。
3. **Temporal 的确定性重放约束**——它要求 workflow 代码严格确定性；LLM 编排天生非确定性。
   借鉴其"journal 权威 + 硬上限 + Continue-As-New"，不借鉴"重放等价性"假设。
4. **具体数值阈值**（如 context editing 的 100k trigger / keep 3、Temporal 的 51,200 events）——
   这些是各自平台的工程取值，我们要设自己的阈值，但必须**有**阈值和续接机制。
5. **LangGraph 的 interrupt/checkpointer API 形态**——我们没有图运行时。
   借鉴其语义（恢复点前代码会重跑 ⇒ 幂等；一个中断一个节点；载荷可序列化），不借鉴 API。
6. **依赖 structured outputs 保证语义约束**——数值/长度约束会被剥离，递归 schema 不支持。
   必须自带语义校验器。
7. **OpenTelemetry GenAI semantic conventions 作为硬依赖**——该规范正在迁仓、仍在演进，
   字段不稳定。先做自有 journal 字段，未来可映射。
8. **"prompt 里写限长"作为上下文控制手段**——软约束、服从率不保证、且约束的是生成端而非摄入端。
   必须用结构性手段（独立上下文 worker + 摄入前 Tool Proxy）。
9. **多 agent 作为默认形态**——15× token 成本、实时协调能力不足、强依赖场景表现更差。
   必须有升级触发条件。
10. **信任模型自评/自我验证**——LLM 无法可靠自验证；验收必须有外部确定性校验器兜底。

---

## 未解决项

1. **OpenTelemetry GenAI agent span 的具体字段**（`gen_ai.operation.name` 的
   `create_agent`/`invoke_agent`/`execute_tool` 取值、必填/推荐属性、稳定性等级）未取到一手页面：
   主站页面已重定向，新仓库的 docs 路径多次 404。影响：无法给出"未来可映射"的精确字段名，
   但不影响"先自定义 journal 字段"的结论。
2. **event sourcing 反面案例的专文**（jorgeacetozi / chrisrichardson 的 "event sourcing is hard"）
   抓取失败（404 / DNS 超时）。当前反证依赖 Fowler 与 microservices.io 的自陈缺点段落，
   证据链成立但缺少"实战踩坑叙述"这一类补强材料。
3. **journal 上限与压缩阈值的具体取值**没有可直接照搬的一手依据（各平台取值差异大且与其存储模型绑定），
   需要在 V2 设计阶段结合"主 Agent 单次读取预算"自行推导。
