# Spec-Coding Skill 设计方案审查报告

> **审查日期**：2026-06-10
> **审查基准**：OpenSpec 源码实现 + Superpowers 实际 skill 设计
> **审查范围**：design.md v2 + exploration-strategy.md

---

## Critical（阻塞实施的结构性问题）

### C1: OpenSpec CLI 命令接口不正确

**位置**：design.md §4.4 Phase 2, §4.3 自动恢复检测

**问题**：设计中引用的 CLI 命令与实际实现不匹配。

| 设计中写的 | 实际命令 | 差异 |
|-----------|---------|------|
| `openspec new {name}` | `openspec new change <name>` | 缺少 `change` 子命令 |
| `openspec instructions --json` | `openspec instructions <artifact> --change <id> --json` | 缺少必需的 `artifact` 参数和 `--change` 选项 |

**影响**：直接导致 Phase 2 执行失败（`new` 无效）和 Phase 4 参考失败（`instructions` 报错）。

**建议**：
1. 修正为 `openspec new change {name}` + 可用选项（`--description`, `--schema`）
2. `instructions` 修正为 `openspec instructions {artifact} --change {name} --json`，或评估是否真的需要此命令（Phase 4 可能不需要它）

---

### C2: 并行执行策略与 Superpowers 核心原则冲突

**位置**：design.md §5.6 并行执行策略, §6 `/parallel-dispatch`

**问题**：设计方案允许在 Build 阶段并行派遣多个 implementer 执行代码修改。但 Superpowers 的 `subagent-driven-development` 有一条**铁律**：

> "Never dispatch multiple implementation subagents in parallel (conflicts)"

Superpowers 的并行 skill（`dispatching-parallel-agents`）定位是**调试/探索的战术工具**（独立故障域并行诊断），不是实现阶段的并行代码编写。两者使用场景根本不同：
- `dispatching-parallel-agents`：并行调查/修复**已知独立的 bug**
- `subagent-driven-development`：串行实现**计划中的任务**

**根因**：设计混淆了"并行探索"和"并行实现"两种截然不同的并行模式。

**影响**：
- 并行写代码导致文件冲突（即使标记 ⟂，运行时仍可能发现隐含依赖）
- 审查流程无法对并行产物做有效交叉验证
- 与 Superpowers 经过实战验证的"串行实现+审查"模式冲突

**建议**：
1. `/parallel-dispatch` 的定位改为**探索/调研并行**（Phase 1/3 场景）+ **独立修复并行**（debugfix 场景）
2. Build 阶段保持串行执行（与 Superpowers 一致）
3. 如果确实需要并行 Build，必须增加一个"并行安全验证"步骤：隔离工作区（worktree per agent）+ 合并后集成测试

---

### C3: 缺少 Verification 横切机制

**位置**：设计全文

**问题**：Superpowers 有一个关键横切 skill —— `verification-before-completion`，其铁律是：

> "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE"

这意味着：
- 每个任务标记完成前 → 必须运行验证命令
- 每个 review 通过前 → 必须独立检查（不信任 agent 报告）
- 每个阶段转换前 → 必须确认产出物存在且有效

设计方案中的 `spec-reviewer` 和 `code-reviewer` 只是审查机制的一部分。缺少的是：
1. **Build 阶段每个任务完成后的自动化验证**（运行测试、检查编译）
2. **Controller 不信任 implementer 报告**的显式规则
3. **验证失败后的处理流程**

**影响**：没有此机制，subagent 可能报告 DONE 但实际代码有编译错误或测试失败。

**建议**：
1. 在 `/subagent-execute` 中增加 "verification gate"：每个 implementer 报告完成后，Controller 独立运行验证命令
2. 显式声明 "Never trust subagent reports" 原则
3. 在 `implementer.md` prompt 中要求报告验证命令输出（但 Controller 仍独立运行）

---

## Important（影响正确性或一致性的问题）

### I1: experience.md 定位不清——不是 OpenSpec 概念

**位置**：design.md §4.4 Phase 1 (Step A), §4.6 项目文件系统结构

**问题**：设计多次引用 `openspec/experience.md` 作为输入源，并声明由 "spec-coding 维护"。但事实是：

- OpenSpec 的标准 artifact 只有 `proposal`, `specs`, `design`, `tasks`
- OpenSpec 中不存在 `experience.md` 概念
- OpenSpec 的 config.yaml 也没有 experience 相关配置

**当前状态**：experience.md 实际上是 ace/aspec 框架的私有概念，被放到了 OpenSpec 的目录下。

**影响**：
- 如果放在 `openspec/` 目录下，可能被 `openspec validate` 报告为异常文件
- 语义混淆：OpenSpec 管什么？spec-coding 管什么？
- 未来如果 OpenSpec 增加自己的经验机制，会冲突

**建议**：三选一
1. **自定义 Schema**：通过 OpenSpec 的自定义 schema 机制把 experience 正式定义为 artifact（OpenSpec 完全支持自定义 artifact 类型——只需在项目中创建 `openspec/schemas/spec-coding/schema.yaml`）
2. **独立位置**：把 experience.md 放在 OpenSpec 目录外（如项目根的 `.spec-coding/experience.md`）
3. **文档明确**：保持当前位置，但明确标注"这不是 OpenSpec 管理的文件，只是 spec-coding 借用位置"

推荐方案 1——利用 OpenSpec 原生扩展机制，最干净。

---

### I2: 阶段编号内部混乱

**位置**：design.md 全文

**问题**：文档中阶段编号不一致：

| 位置 | 编号方式 |
|------|---------|
| §4.2 状态机 | understand=Phase 1, propose=Phase 2, ... archive=Phase 6 |
| §4.3 决策核心 | "Phase 0 (understand)", "Phase 1 (clarify)" — 旧编号 |
| §4.3 范围检测 | "Phase 0 Understand 末尾" — 使用 Phase 0 |
| §4.4 各阶段标题 | "Phase 1: Understand" — 正确 |
| §7 示例 | "Phase 0 (understand)", "Phase 1 (clarify)" — 旧的 7 阶段编号 |
| §附录 A | "Phase 0 Understand", "Phase 1 Clarify" — 旧编号 |

**根因**：从 7 阶段合并为 6 阶段时，部分内容遗留了旧编号。

**影响**：实现时必然产生歧义——"Phase 0" 到底是什么？是 understand 还是有一个独立的初始化阶段？

**建议**：统一为 6 阶段编号（Phase 1-6），全文搜索替换：
- Phase 0 → Phase 1 (understand)
- Phase 1 (旧 clarify) → 合并入 Phase 1
- 后续依次调整

---

### I3: "两步确认"设计在 Design 阶段可能过度

**位置**：design.md §4.4 Phase 3 步骤 5 和 11

**问题**：设计要求 Design 阶段有两次 AskUserQuestion：
- 确认 1（步骤 5）：概念性——"方向对吗？"
- 确认 2（步骤 11）：文档性——"写出来的完整吗？"

但 Superpowers brainstorming 的"分段呈现"是因为设计过程中每段都可能被用户否决需要修改。它的模式是：

```
方案选择（一次确认）→ 分段呈现（多段交织展开，每段默认通过除非用户打断）→ 文档写入 → 用户审阅（一次确认）
```

而非两个硬性 AskUserQuestion 门禁。

**影响**：
- 对于小型 change，两次强制确认是冗余摩擦
- 用户可能在确认 1 时说"好"，但你还没开始写 design.md——在确认 2 时才有文档可看。信息量差异导致确认 1 几乎没有实质价值

**建议**：
- 确认 1 改为**方案选择**（有 2-3 方案时触发，只有 1 个显然方案时跳过）
- 确认 2 保留为设计文档审批（真正的门禁）
- 小型 change 只需要确认 2

---

### I4: Skill 间通信协议缺乏错误处理

**位置**：design.md §附录 C

**问题**：通信协议只定义了正常路径：

```
/spec-coding → /subagent-execute:
  传入：tasks_path, design_context, dependency_marks
  返回：{status, completed_count, total_count, files_changed, issues}
```

但缺少：
- 部分完成时的状态（5/8 任务完成时用户中断怎么办？）
- 错误/回退信号（subagent-execute 发现设计缺陷怎么通知 spec-coding？）
- 恢复信号（从哪个 task 继续？）

**Superpowers 方案**：subagent-driven 的 implementer 有 4 种状态（DONE/DONE_WITH_CONCERNS/NEEDS_CONTEXT/BLOCKED），Controller 对每种有明确处理。但 **spec-coding ↔ subagent-execute** 之间的状态通信更粗糙。

**建议**：
- 增加 `partial_completion` 状态（含 `last_completed_task_id`）
- 增加 `escalation` 信号（设计缺陷 → spec-coding 决定是否回退）
- 明确中断恢复：spec-coding 重新调用 subagent-execute 时传入 `resume_from: task_id`

---

### I5: Delta Spec 编写缺乏 AI 可操作的格式指导

**位置**：design.md §4.4 Phase 2 步骤 3

**问题**：设计只说"严格 OpenSpec 格式"并列出了几条格式要求。但实际的 OpenSpec validate 规则远比列出的复杂：

OpenSpec 的 delta spec 验证规则（从源码）：
- **必须有 `## ADDED/MODIFIED/REMOVED/RENAMED Requirements` 分区 header**
- 每个 Requirement 标题必须是 `### Requirement: {Name}`
- 正文中必须含 `SHALL` 或 `MUST`（RFC 2119 关键词）
- Scenario 必须是 `#### Scenario: {Name}`（四级标题）
- Scenario 内容必须含 `WHEN` 和 `THEN`

设计文档列出了这些但**没有给 AI 一个可参考的完整示例**。而 OpenSpec 自身提供了模板（`schemas/spec-driven/templates/spec.md`）。

**建议**：
- Phase 2 中增加："Read OpenSpec spec 模板作为格式参考"
- 或在 `knowledge/` 目录中内置一个 delta-spec 编写示例
- 利用 `openspec instructions specs --change {name} --json` 获取 OpenSpec 的富化写作指令

---

### I6: 恢复协议与 OpenSpec status 命令对接不完整

**位置**：design.md §4.5 恢复协议

**问题**：恢复逻辑写的是：
1. `openspec list --json` 获取活跃变更
2. 检查 `.spec-coding.yaml` 是否存在
3. 读 phase → 路由

但 OpenSpec 的 `status --change {name} --json` 返回丰富的 artifact 图状态：
```json
{
  "changeName": "...",
  "artifacts": [
    {"id": "proposal", "status": "done"},
    {"id": "specs", "status": "done"},
    {"id": "design", "status": "pending"},
    ...
  ],
  "isComplete": false
}
```

**遗漏**：如果 `.spec-coding.yaml` 丢失但 OpenSpec artifacts 存在（用户手动删了状态文件，或者用 OpenSpec CLI 直接工作了一段），应该从 artifact 图反推 phase 并重建 `.spec-coding.yaml`。

**建议**：
- 恢复逻辑增加降级路径：`.spec-coding.yaml` 缺失 → 调用 `openspec status --change {name} --json` → 从 artifact 完成状态推断当前 phase → 重建 `.spec-coding.yaml`
- 映射关系：proposal done → propose 完成；design done → design 完成；等

---

## Minor（建议改进但不阻塞）

### M1: `design-reviewer` 子代理与 `spec-reviewer` 概念重叠

**位置**：design.md §4.4 Phase 3 步骤 10

**问题**：Phase 3 有一个 `design-reviewer` 审查 design.md，Phase 5 有 `spec-reviewer` 审查每个 task 实现。两者名称类似但职责不同：
- design-reviewer：审查设计文档的完整性/一致性
- spec-reviewer：审查代码实现是否符合 task 规范

**建议**：更明确的命名——`design-doc-reviewer` vs `implementation-spec-reviewer`，避免混淆。

---

### M2: 协作示例（§7）仍使用旧的 7 阶段编号

**位置**：design.md §7 三 Skill 协作示例

**问题**：示例中写：
```
→ spec-coding Phase 0 (understand)
→ spec-coding Phase 1 (clarify)
```

这是旧的 7 阶段编号，与正文的 6 阶段定义冲突。

**建议**：更新为 Phase 1 understand（含对齐）→ Phase 2 propose → ...

---

### M3: `knowledge/dimensions.md` 引用但未定义内容

**位置**：design.md §4.4 Phase 1 步骤 4

**问题**：设计说"Read knowledge/dimensions.md"做维度分析，并在文件结构中预留了位置（~150 行），但没有定义这个文件应该包含什么内容。

"对照 8 个需求维度识别缺失"——这 8 个维度是什么？

**建议**：至少列出维度名称（如：功能性、性能、安全、可用性、兼容性、可维护性、可测试性、可运维性），否则实现时不知道写什么。

---

### M4: 降级策略的 direct 模式缺乏详细设计

**位置**：design.md §4.4 Phase 5

**问题**：Build 阶段 direct 模式只写了"主代理直接执行，逐任务更新 checkbox"。但这意味着：
- 无 spec-reviewer 审查
- 无 code-reviewer 审查
- 无 verification gate

direct 模式下质量保证如何替代？是完全没有审查？还是用简化审查？

**建议**：定义 direct 模式的最小质量保证——至少要：
- 每个任务完成后运行验证命令
- 完成后做一次整体 self-review（对照 design.md）
- 明确 direct 模式是"轻量快速"但"质量风险自负"

---

### M5: OpenSpec config.yaml 的 context/rules 注入未利用

**位置**：设计全文

**问题**：OpenSpec 的 `config.yaml` 支持 `context`（全局上下文）和 `rules`（per-artifact 规则），这是一个强大的质量保证机制。例如：

```yaml
schema: spec-driven
context: |
  Tech stack: Java, Spring Boot, Maven
  Architecture: Microservice, DDD
rules:
  specs:
    - Use RFC 2119 keywords precisely
    - Include Windows path scenarios
  design:
    - Document all API contracts with input/output types
  tasks:
    - Each task must have a verification command
```

设计方案没有提到如何利用这个机制来注入项目级约束。

**建议**：
- Phase 2 生成 proposal/specs 时，先检查 config.yaml 中的 rules 并遵循
- 或在初始化时建议用户配置 config.yaml（如果缺失）
- 这是让 spec-coding 适配不同项目风格的关键扩展点

---

### M6: 自定义 Schema 的机会未被利用

**位置**：设计全文

**问题**：OpenSpec 完全支持自定义 schema——可以定义新的 artifact 类型、自定义依赖图、自定义模板。当前设计使用默认的 `spec-driven` schema，意味着 artifact DAG 是：

```
proposal → specs → tasks
proposal → design → tasks
```

但 spec-coding 实际的 artifact 依赖是：
```
proposal → specs → design → tasks（串行，因为 design 依赖 specs 确定的行为边界）
```

与默认 schema 的 DAG 不一致（默认 schema 中 design 和 specs 是并行的，都只依赖 proposal）。

**建议**：评估是否需要创建 spec-coding 专用的自定义 schema，使 artifact 依赖图与实际工作流一致。如：

```yaml
name: spec-coding-workflow
version: 1
artifacts:
  - id: proposal
    generates: proposal.md
    requires: []
  - id: specs
    generates: "specs/**/*.md"
    requires: [proposal]
  - id: design
    generates: design.md
    requires: [specs]  # ← 关键：design 依赖 specs
  - id: tasks
    generates: tasks.md
    requires: [design]
```

---

### M7: Write-back to Spec 机制缺失

**位置**：设计 Phase 5 (Build)

**问题**：OpenSpec 的哲学是"实现中发现问题 → 随时回溯更新 artifact"：

> "If you discover something during implementation that changes the spec...update the artifact directly."

设计方案的 Build 阶段只提到"偏差记录 → notes.md"和"重大偏差 → 回退"，但没有定义**轻微偏差如何回写到 specs/design**。

实际场景：实现时发现 scenario 描述不精确，需要微调 delta spec 的某个 WHEN/THEN。按 OpenSpec 理念应该直接改，而非只记在 notes.md 等归档时处理。

**建议**：
- 定义"轻微偏差回写"流程：implementer 发现 spec 不精确 → 报告 DONE_WITH_CONCERNS → Controller 评估 → 直接更新 delta spec → 继续
- 这与"重大偏差 → 回退 Design"形成层级处理

---

## 结构性观察（非问题，但值得思考）

### O1: 与 Superpowers 的本质区别

Superpowers 是一个**通用软件开发方法论框架**——它不依赖任何外部 spec 管理工具，所有设计文档存于 `docs/superpowers/` 目录。

Spec-coding 则是**在 OpenSpec 生态之上的编排层**——它依赖 OpenSpec CLI 提供 spec 生命周期管理。

这意味着：
- Superpowers 的 brainstorming → writing-plans → subagent-driven 是松耦合的（每个 skill 独立）
- Spec-coding 的六阶段是紧耦合的（Phase 2 强依赖 OpenSpec CLI）

这个差异是合理的设计选择，但需要在实现时注意：如果 OpenSpec CLI 不可用或行为变化，spec-coding 需要清晰的降级路径。

### O2: 三 Skill 拆分 vs 两 Skill 可能更合适

当前：
- `/spec-coding`：编排器
- `/subagent-execute`：执行引擎
- `/parallel-dispatch`：并行调度

但根据 C2 的发现（Build 阶段不应并行实现），`/parallel-dispatch` 的实际使用场景缩窄为：
1. Phase 1/3 并行探索
2. 独立 bug 并行修复（独立入口）

场景 1 中，并行探索其实就是并行 Agent 调用——这是 Claude Code 原生能力，不需要一个独立 skill 来管理。真正需要管理的是**独立 bug 并行修复**（独立使用）。

可以考虑：把并行探索的逻辑内联到 spec-coding 的 Phase 1/3 中，让 `/parallel-dispatch` 纯粹作为独立使用的并行修复工具。

---

*审查完成 | 2026-06-10*
*方法：OpenSpec 源码验证 + Superpowers 实战 skill 对照 + 设计内部一致性检查*
