# Tasks.md 门禁注入方案可行性分析

> 分析日期: 2026-04-24
> 分析主题: 将经验进化门禁写入 tasks.md，利用 apply 的 checkbox 解析机制控制流程

## 1. 核心发现：apply 阶段的 tasks.md 解析机制

### 1.1 解析器行为

OpenSpec 的 `parseTasksFile()` (位于 `instructions.js:144-163`) 是一个**扁平正则扫描器**：

```javascript
// 实际正则
/^[-*]\s*\[([ xX])\]\s*(.+)\s*$/
```

**关键特征**：

| 特征 | 行为 | 对门禁方案的影响 |
|------|------|-----------------|
| 扫描范围 | 全文逐行匹配 checkbox | 任何位置的 checkbox 都会被捕获 |
| 分组/层级 | **完全忽略** — `##` 标题、缩进、嵌套全部丢弃 | 无法区分"代码任务"和"门禁任务" |
| 返回结构 | `{id, description, done}` 数组，id 为顺序编号 | 所有 checkbox 同质化 |
| 类型判别 | **无** — 不区分任务类型 | 经验提取 checkbox 等同于代码 checkbox |

### 1.2 "all_done" 判定逻辑

```javascript
// instructions.js:287-289
const remaining = tasks.filter(t => !t.done).length;
const total = tasks.length;
const allDone = tracksFile && remaining === 0 && total > 0;
```

**核心约束**：`remaining === 0` — 所有 checkbox 必须标记为完成，apply 才会进入"全部完成"状态。

### 1.3 apply 模板的任务处理循环

`apply-change.js` 的 Step 6 核心循环：

> "For each pending task: show task, make code changes, mark complete, continue to next"

模板**不验证**任务内容是否为代码变更。它只是逐一处理 pending 的 checkbox，尝试"执行"每个任务的 description 文本。

**这意味着**：如果 description 写的是"复盘与经验提取"，AI 会尝试执行这个"任务"——即进行复盘和经验提取。

## 2. 方案设计：tasks.md 门禁注入

### 2.1 注入位置与格式

在 tasks artifact 的 rules 中指示 AI 在 tasks.md **末尾**添加门禁段落：

```markdown
## 实施任务

- [ ] 任务 1：实现用户认证模块
- [ ] 任务 2：添加 JWT 中间件
- [ ] 任务 3：编写认证单元测试

## 收尾（实施完成后执行）

- [ ] 复盘：对照 design.md 检查实施偏差，记录到 spec/notes.md
- [ ] 经验提取：从本次实施中提取经验写入 experience.md
- [ ] 经验验证：验证本次应用的历史经验（✓有效 / ✗无效 / —不适用）
- [ ] 经验收敛：检查 experience.md 条目数量，若 >20 条则提议合并/淘汰（需用户确认）
- [ ] 归档确认：通过 AskUserQuestion 询问用户是否归档
```

### 2.2 为什么这能工作

**门禁机制的数学保证**：

1. 解析器扫描全文 → 收尾段的 checkbox 会被捕获为 tasks
2. apply 逐个处理 pending tasks → 代码任务完成后，会轮到收尾 tasks
3. `all_done = remaining === 0` → 收尾 checkbox 未勾选时，apply 不会进入完成状态
4. AI 读取 description 并尝试执行 → "经验提取：…" 会被当作任务来执行

**信息传递链**：

```
config.yaml rules.tasks → AI 生成 tasks.md 时写入门禁 checkbox
                                    ↓
tasks.md checkbox → parseTasksFile() 解析为 tasks 数组
                                    ↓
apply 模板逐一处理 → AI 执行"经验提取"这个 task
                                    ↓
all_done 检查 → 门禁 checkbox 未完成则阻塞
```

### 2.3 具体注入规则（写入 config.yaml rules.tasks）

```yaml
rules:
  tasks:
    - "[PRE] 展示 design.md 核心摘要，通过 AskUserQuestion 获得审批后创建任务"
    - |
      [CONSTRAINT] tasks.md 末尾必须包含"收尾"段落，包含以下门禁 checkbox：
      - [ ] 复盘：对照 design.md 检查实施偏差，将发现记录到 spec/notes.md
      - [ ] 经验提取：按 experience-template.md 格式从实施过程提取经验写入 experience.md
      - [ ] 经验验证：验证本次应用的历史经验条目，标记 ✓有效 / ✗无效 / —不适用
      - [ ] 经验收敛：检查 experience.md 条目数量，若 >20 条则提议合并/淘汰（需用户确认）
      - [ ] 归档确认：通过 AskUserQuestion 询问用户是否归档
      这些 checkbox 必须排在所有代码实施任务之后
    - "[POST] 通过 AskUserQuestion 询问是否立即实施，确认后调用 Skill 执行 opsx:apply"
```

## 3. 信号质量分析：checkbox description 作为 AI 指令

### 3.1 信号传递的双重性

tasks.md 中的门禁 checkbox 需要同时满足两个角色：

| 角色 | 消费者 | 需求 |
|------|--------|------|
| 进度追踪项 | `parseTasksFile()` 正则 | 格式正确的 checkbox 语法 |
| AI 行动指令 | apply 模板中的 LLM | 足够具体的 description 指导执行 |

### 3.2 信号强度评估

**强信号（高可靠）**：

- ✅ **阻塞保证**：纯机械逻辑，`remaining === 0` 是硬约束，不依赖 AI 理解
- ✅ **顺序保证**：门禁 checkbox 排在末尾 → 代码任务先完成
- ✅ **格式兼容**：checkbox 是 tasks.md 的原生格式，零违和感

**弱信号（需要加强）**：

- ⚠️ **执行指导不足**：`"经验提取：从实施过程提取反直觉经验"` 作为一行 description，信息密度不够。AI 需要知道：写到哪里？什么格式？什么算"反直觉"？
- ⚠️ **无规则注入通道**：apply 模板不读 config.yaml rules → description 是唯一的指令载体
- ⚠️ **description 长度限制**：作为 checkbox 的一行文本，塞不下复杂指令

### 3.3 信号增强策略

单靠 checkbox description 不足以精确指导 AI 执行经验提取。需要补充信号：

**策略 A — Description 内嵌文件引用**：
```markdown
- [ ] 经验提取：按 experience-template.md 格式，从本次实施中提取经验写入 experience.md（参考 spec/notes.md 中的观察记录）
```
将"怎么做"编码在引用的文件中，description 只负责"做什么"和"参考什么"。

**策略 B — Context 背景铺垫**：
config.yaml 的 `context:` 字段在 tasks 生成阶段注入。虽然 apply 不直接读 context，但 tasks.md 本身可以包含非 checkbox 的说明文本（解析器只提取 checkbox，忽略其他文本）。在门禁段前加入说明：

```markdown
## 收尾（实施完成后执行）

> 经验提取规范：参照 experience-template.md 格式。重点记录反直觉发现、
> 踩坑经验、跨项目可复用的模式。每条经验包含：编号/场景/发现/适用范围。

- [ ] 复盘：对照 design.md 检查实施偏差，将发现记录到 spec/notes.md
- [ ] 经验提取：按上述规范从本次实施中提取经验写入 experience.md
- [ ] 经验验证：验证本次应用的历史经验条目，标记 ✓有效 / ✗无效 / —不适用
- [ ] 经验收敛：检查 experience.md 条目数量，若 >20 条则提议合并/淘汰（需用户确认）
- [ ] 归档确认：通过 AskUserQuestion 询问用户是否归档
```

解析器忽略 `>` 引用块，但 AI 在处理任务时会看到完整的 tasks.md 上下文。

**策略 B 是关键洞见**：tasks.md 中的非 checkbox 文本对解析器透明，但对 AI 可见。这是一个天然的"带内注释"通道。

## 4. 风险与局限

### 4.1 硬性风险

| 风险 | 严重度 | 说明 | 缓解 |
|------|--------|------|------|
| AI 跳过门禁 checkbox | Medium | apply 模板说"make code changes"，AI 可能认为非代码 checkbox 不需要执行就直接标记完成 | 在 description 中明确动作动词（"写入 experience.md"而非"经验提取"） |
| 用户手动标记跳过 | Low | 用户可以手动编辑 tasks.md 把门禁 checkbox 标记为 `[x]` | 这实际上是合理的——用户有权跳过 |
| tasks artifact 不生成门禁 | Medium | rules.tasks 的指令是给生成 tasks 的 AI 的，AI 可能不遵守 | 用 `[CONSTRAINT]` 前缀强化；策略 B 提供格式模板 |

### 4.2 架构局限

**1. 经验进化完整闭环已在 apply 阶段门禁中覆盖**

通过将经验收敛（条目 >20 合并淘汰）也纳入 tasks.md 收尾门禁，经验进化的完整生命周期（提取→验证→收敛）统一在 apply 阶段完成。`rules.archive` 可以完全清空，archive 退化为纯 OpenSpec 原生的 git 归档操作。

**2. 无法注入结构化规则**

apply 模板是硬编码的 JS 字符串。checkbox description 是自然语言，不是结构化规则。复杂的条件逻辑（"如果经验条目 >20 则提议合并"）可通过 checkbox description 编码条件——AI 读取后检查条件、执行或跳过、然后标记完成。但更复杂的多分支逻辑仍难以表达。

**3. 门禁粒度受限于 checkbox**

每个门禁是一个 checkbox，只有"完成/未完成"两态。无法表达条件门禁（"仅当发现偏差时才需要"）或多步门禁（"先提取，再验证，再确认"——除非拆成多个 checkbox）。

**4. 依赖 tasks AI 的配合**

门禁 checkbox 的质量取决于生成 tasks.md 的 AI 是否忠实遵循 rules.tasks 中的约束。这是一个"AI 指导 AI"的链条：

```
rules.tasks → tasks AI 生成 tasks.md（含门禁）→ apply AI 执行门禁
```

两个 AI 环节都可能不遵守，但这与现有的 context/rules 注入机制面临的风险相同。

### 4.3 与当前 rules.apply 死数据的关系

现在 config.yaml 中 `rules.apply` 的 5 条规则是死数据（apply 不读 config.yaml）。tasks.md 门禁方案**部分替代**了 rules.apply 的意图：

| rules.apply 原意 | tasks.md 门禁等效 | 覆盖度 |
|------------------|-------------------|--------|
| `[PRE] 读取 issues/ 下决策文件` | 可编码为门禁前置 checkbox 或 description 引用 | 部分 |
| `[CONSTRAINT] 新问题暂停评估` | 无法编码——需要实时干预，不是完成/未完成 | ❌ |
| `[POST] 复盘提取经验` | ✅ 直接门禁化 | ✅ |
| `[POST] 询问是否归档` | ✅ 可编码为最后一个 checkbox | ✅ |

**rules.archive 覆盖度**：

| rules.archive 原意 | tasks.md 门禁等效 | 覆盖度 |
|-------------------|-------------------|--------|
| `[POST] 条目>20 时提议合并/淘汰` | ✅ 经验收敛 checkbox（条件逻辑编码在 description 中） | ✅ |

**结论**：tasks.md 门禁覆盖了 POST 类规则和 archive 的收敛规则。唯一无法覆盖的是 CONSTRAINT 类规则（执行过程中的实时约束）。

## 5. 方案对比与组合策略

### 5.1 与前报告方案的对比

| 维度 | 方案 C (Wrapper Skill) | 方案 G (Tasks.md 门禁) |
|------|----------------------|----------------------|
| 侵入性 | 中 — 替换 apply/archive 入口 | **低** — 仅修改 rules.tasks |
| 实现复杂度 | 高 — 需编写 wrapper skill | **低** — 仅调整 config.yaml |
| 控制精度 | 高 — 完整流程控制 | 中 — POST 动作门禁 + 条件逻辑 |
| apply 阶段控制 | ✅ 完全控制 | ⚠️ 门禁有效，实时约束无效 |
| archive 阶段控制 | ✅ 完全控制 | ✅ 经验收敛前移至 apply 门禁，archive 清空 |
| 维护成本 | 高 — 需跟踪 OpenSpec 更新 | **低** — 利用原生机制 |
| 抗 OpenSpec 升级 | 脆弱 — API 变化需适配 | **稳健** — checkbox 是基础格式 |
| 信号路径 | 显式编程控制 | 隐式 AI 推理执行 |

### 5.2 推荐：组合方案 G+

**核心思路**：以 tasks.md 门禁（方案 G）为基础，用最小成本补足其短板。

#### 层 1：tasks.md 门禁（即时可用）

修改 `rules.tasks`，注入收尾门禁 checkbox。这是零成本改动——只改 config.yaml。

```yaml
rules:
  tasks:
    - "[PRE] 展示 design.md 核心摘要，通过 AskUserQuestion 获得审批后创建任务"
    - |
      [CONSTRAINT] tasks.md 末尾必须包含收尾段落：
      ## 收尾（代码任务全部完成后执行）
      > 经验提取规范见 experience-template.md。重点：反直觉发现、踩坑经验、可复用模式。
      - [ ] 复盘：对照 design.md 检查实施偏差，将发现记录到 spec/notes.md
      - [ ] 经验提取：按 experience-template.md 格式提取经验写入 experience.md
      - [ ] 经验验证：验证本次应用的历史经验（标记 ✓有效/✗无效/—不适用）
      - [ ] 经验收敛：检查 experience.md 条目数量，若 >20 条则提议合并/淘汰（需用户确认）
      - [ ] 归档确认：通过 AskUserQuestion 询问用户是否归档
    - "[POST] 通过 AskUserQuestion 询问是否立即实施，确认后调用 Skill 执行 opsx:apply"
```

#### 层 2：Schema Fork 增强 apply.instruction（可选）

如果需要覆盖 CONSTRAINT 类规则（实施过程中的实时约束），可以 fork schema 覆盖 `apply.instruction`：

```yaml
# openspec/schemas/spec-driven/schema.yaml (project-local override)
apply:
  requires: [tasks]
  tracks: tasks.md
  instruction: |
    Read context files, work through pending tasks sequentially.
    CONSTRAINTS during implementation:
    - 新发现的问题暂停评估，记录到 spec/notes.md
    - 代码与 design.md 偏差须在 spec/notes.md 记录理由
    - 遇到与 experience.md 中历史经验相关的场景，遵循经验指导
```

Schema 的 `apply.instruction` 会被传入 apply 模板的 `{instruction}` 占位符。这是 OpenSpec 原生支持的扩展点。

#### 层 3：rules.archive 清空

经验收敛已移入 tasks.md 收尾门禁（经验提取后、归档确认前），archive 阶段不再需要 ACE 定制。`rules.archive` 清空，archive 退化为纯 OpenSpec 原生的 git 归档操作。

### 5.3 实施路径

```
Phase 1（立即）: 修改 config.yaml rules.tasks → 注入完整五步门禁（含收敛）
                 清空 rules.archive
                 移除 rules.apply 中的 POST 规则（已迁移到门禁）
                 保留 rules.apply 中的 PRE/CONSTRAINT（作为文档意图，即使是死数据）

Phase 2（验证）: 实际运行一次完整流程，验证：
                 - tasks AI 是否生成了门禁 checkbox
                 - apply AI 是否正确执行门禁任务
                 - all_done 是否被门禁阻塞

Phase 3（可选）: 如 CONSTRAINT 覆盖不足，fork schema 增强 apply.instruction
```

## 6. 结论

### 可行性判定：✅ 可行，且是当前最优的低成本方案

**核心论据**：

1. **数学保证**：`all_done = remaining === 0` 是硬编码逻辑，不依赖 AI 理解。门禁 checkbox 未完成 → apply 不终结。这是机械性保证，不是概率性的。

2. **零侵入**：只改 config.yaml 的 `rules.tasks`，不改 OpenSpec 源码、不 fork schema、不写 wrapper。利用的完全是 OpenSpec 的原生行为。

3. **信号双通道**：checkbox 提供阻塞保证（硬信号），非 checkbox 文本提供执行指导（软信号）。两者配合，解决了"门禁存在但不知道怎么执行"的问题。

4. **抗升级**：checkbox 格式和 `all_done` 逻辑是 OpenSpec 的核心机制，不太可能在升级中改变。相比 wrapper skill 需要跟踪内部 API，这个方案的生命周期更长。

**主要局限**：

- 不覆盖 CONSTRAINT 类规则（实施中实时约束），需 schema fork 补足
- 依赖 AI 链条（tasks AI 生成门禁 → apply AI 执行门禁），有两个不确定性节点
- description 承载的指令密度有限，复杂逻辑需要借助文件引用

**最终推荐**：采用方案 G+ 组合策略。以 tasks.md 门禁为核心（Phase 1 即时实施），经验进化完整闭环（提取→验证→收敛→归档确认）统一在 apply 收尾门禁中完成，`rules.archive` 清空。辅以 schema fork 覆盖 CONSTRAINT 需求（Phase 3 按需实施）。
