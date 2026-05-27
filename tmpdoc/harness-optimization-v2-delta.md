# Claude Code Harness 优化空间分析 v2 — 增量报告

> 分析日期: 2026-04-15
> 基于: v1 报告 + 三路并行研究（Harness Engineering / Agent 设计哲学 / Claude Code 最新特性）
> 定位: v1 报告的**补充与升级**，聚焦新发现的优化方向

---

## 0. 执行进度追踪

### v1 报告的 P0 项落实情况

| 项目 | 状态 | 备注 |
|------|------|------|
| P0-3: 移除 exploration-methodology.md | **已完成** | rules/ 目录已精简为 4 个文件 |
| P0-4: 修复 CLAUDE.md 悬空引用 | **已完成** | naming.md 引用已移除 |
| Skill 三角重叠简化 | **部分完成** | task-driver 已移除，但 auto-goal 与 coding 边界仍需明确 |
| P0-1: Stop Hook | **未完成** | |
| P0-2: PreCompact Hook | **未完成** | |
| P1-2: Memory 系统初始化 | **未完成** | |

---

## 1. 新发现：v1 报告未覆盖的优化维度

以下是三路研究发现的、v1 报告中**未提及或未深入**的关键优化方向。

---

### 1.1 CLAUDE.md 过长风险 — Anthropic 内部基准

**新发现（FACT）**: Anthropic 内部团队的 root CLAUDE.md 通常**不超过 60 行**。官方建议上限 100-200 行，超过 300 行开始出现上下文退化。

**当前状态评估**:

你的 CLAUDE.md 本身只有 ~13 行（纯索引），这很好。但通过 `@` 引用加载的 rules 文件总量：

| 文件 | 估算行数 | 估算 Token |
|------|----------|-----------|
| thinking.md | ~30 行 | ~300 |
| clean-code.md | ~200 行 | ~2000 |
| reporting.md | ~15 行 | ~150 |
| task-recovery.md | ~20 行 | ~200 |
| **总计** | **~265 行** | **~2650** |

**结论**: 你的"有效 CLAUDE.md"约 265 行，处于官方建议的上限区域。其中 `clean-code.md`（~200 行）贡献了 75% 的总量。

**优化方向**: 此条与 v1 报告的 P1-4（拆分 clean-code.md）一致，但现在有了更硬的数据支撑——Anthropic 自己的团队用 60 行。

---

### 1.2 Hookify 插件 — 比手写 Hook 更高效的方案

**新发现**: 官方市场的 `hookify` 插件提供了一个**声明式 Hook 管理系统**，用 Markdown 文件定义规则，支持正则匹配、多条件组合、warn/block 两种动作，且无需重启即可生效。

**为什么这比 v1 建议的手写 JSON Hook 更好**:

| 维度 | 手写 settings.json | Hookify |
|------|-------------------|---------|
| 创建方式 | 手动编辑 JSON | `/hookify <描述>` 自然语言 |
| 管理方式 | 编辑 JSON 数组 | 独立 .local.md 文件，各自开关 |
| 灵活性 | shell 命令 | 正则匹配 + 多条件 + 多事件类型 |
| 热更新 | 需重启 | 即时生效 |
| 可维护性 | 随 Hook 增多 JSON 变复杂 | 每条规则一个文件，独立管理 |

**具体场景示例**:

```markdown
# .claude/hookify.require-tests.local.md
---
name: require-tests-run
enabled: true
event: stop
action: warn
conditions:
  - field: transcript
    operator: not_contains
    pattern: npm test|pytest|mvn test|cargo test
---

**Tests not detected!**
Before stopping, please run tests to verify changes work correctly.
```

**建议**: 启用 hookify 插件，用它替代手写 JSON Hook 来实现 v1 报告中的所有 Hook 需求（Stop 质量门禁、PreToolUse 安全护栏、PostToolUse 格式化等）。

---

### 1.3 熵管理（Entropy Management）— 全新维度

**新发现（来自 OpenAI Codex 实验）**: OpenAI 在用 Codex 生成 100 万行代码的过程中，发现了 **"AI 坡度"（AI Slope）** 问题——Agent 大规模生成代码时，代码风格、模式、命名会逐渐漂移（pattern drift），积累隐性技术债。

**解决方案**: 部署**后台质量 Agent**作为"自动垃圾回收器"，持续扫描代码偏差并开重构 PR。

**对你的启示**:

当前环境中没有任何**主动的代码质量监控机制**。所有质量检查都是被动的（code-review 需手动触发）。

**优化方向（新增 P2 级）**:

1. **定期代码健康检查** — 可通过 Claude Code 的 `/loop` 机制实现：
   ```
   /loop 30m /code-review --quick-scan
   ```
   或创建一个轻量的 `code-health` skill，定期扫描最近修改的文件，检查是否偏离了 clean-code 规范。

2. **Hookify + stop 事件** — 在每次 Agent 完成任务时，自动检查是否引入了与项目风格不一致的模式。

3. **利用 auto-memory 特性** — Claude Code 现在有 auto-memory 功能，会自动将调试洞察、架构笔记保存到 CLAUDE.md。你应该**主动利用而非抑制**这个特性，让它积累项目级的 pattern knowledge。

---

### 1.4 Agent Teams — 实验性但高潜力

**新发现**: Claude Code 已支持 **Agent Teams**（实验性功能）——多个 Agent 通过共享任务列表和邮箱系统协作。Anthropic 自己用 16 个 Agent 协作构建了一个 C 编译器（10 万行 Rust 代码）。

**当前状态**: 完全未使用。

**适用场景**:
- 大规模重构（>20 个文件）
- 全栈功能开发（前端 + 后端 + 测试并行）
- 代码迁移项目

**注意**: Token 成本约为单 Agent 的 3-4 倍。适合高复杂度任务，不适合日常编码。

**优化方向**: 标记为 P3 实验项。在下次遇到大规模任务时尝试。

---

### 1.5 Feature-Dev 插件 — 可能替代 coding skill

**新发现**: 官方 `feature-dev` 插件提供了**7 阶段开发工作流**，内置 3 个专用 Agent：
- `code-explorer` — 并行探索代码库
- `code-architect` — 生成多个架构方案供选择
- `code-reviewer` — 并行质量审查

**与你的 coding skill 对比**:

| 维度 | 自建 coding skill | feature-dev 插件 |
|------|-------------------|------------------|
| 探索阶段 | 手动调用 Task 子代理 | 自动启动 2-3 个 code-explorer |
| 架构设计 | 无专门阶段 | 自动生成 2-3 个架构方案 |
| 代码审查 | 需手动触发 code-review | 集成为 Phase 6，自动执行 |
| 澄清阶段 | 依赖 AskUserQuestion | 专门 Phase 3 批量提问 |
| 状态管理 | 自建 .tasks/ 状态文件 | TodoList 集成 |
| 成熟度 | 自建，经过你的迭代 | Anthropic 官方维护 |

**建议**: 不急于替换，而是**并行评估**。在下 3-5 个功能开发任务中，交替使用 `/coding` 和 `/feature-dev`，对比效果。你自建的 coding skill 的优势在于它与你的 clean-code 规则和 task-recovery 机制深度集成。

---

### 1.6 上下文焦虑（Context Anxiety）— 命名为现象

**新发现**: "Context Anxiety" 是一个已被命名的现象——当 Agent 的上下文窗口接近容量时，它会**过早结束任务**或**做出质量下降的决策**。这不是提示词问题，而是架构问题。

**当前防护**:
- 你使用 opus[1m]（100 万 token），远大于默认的 200K，这大大缓解了问题
- 但即使 1M 窗口，长任务（如大规模重构）也会触及限制

**优化方向**:
1. **PreCompact Hook**（v1 已建议但未实施）— 这是最直接的防护
2. **Compaction 指导规则** — 在 CLAUDE.md 或 rules 中添加压缩策略：
   ```
   When compacting, always preserve:
   - Full list of modified files
   - Current task state and next steps
   - Key architectural decisions made in this session
   ```
3. **"One task, one context" 纪律** — 社区共识的最高杠杆实践。在不同任务之间使用 `/clear`。

---

### 1.7 分层模型选择（Tiered Model Selection）

**新发现（来自 OpenAI Agent SDK）**: 使用**廉价模型处理简单任务**、**昂贵模型处理复杂推理**。

**当前状态**: 你固定使用 `opus[1m]`，所有任务都用最强模型。

**优化方向**:
- 自定义 Agent 定义中可以指定 `model: haiku` 用于简单的代码探索、格式化等任务
- trip-member-grade-bot 已使用 `model: inherit`，可以考虑为纯查询类 Agent 设置 `model: haiku` 以节省 token
- 日常简单编码可以用 `/fast` 切换到快速模式

---

### 1.8 仓库作为真相源（Repository as Source of Truth）

**新发现（来自 OpenAI Codex 实验）**: "编码规范编码到代码库本身（linters、结构测试、类型系统），而非指令文件。机器验证是指令无法强制执行的。"

**对你的启示**:

你的 `clean-code.md` 规则（~7.4KB）尝试通过**指令**约束 Agent 的编码风格。但这是概率性的——Agent 可能不遵守。更有效的方式是：

1. **通过 linter 配置强制执行**：
   - Java: Checkstyle / SpotBugs / PMD + Maven 集成
   - JS/TS: ESLint + Prettier
   - 通过 PostToolUse Hook 自动运行

2. **通过结构测试验证**：
   - ArchUnit（Java 架构测试）
   - 自定义 lint 规则检查命名、方法长度等

3. **clean-code.md 只保留 linter 无法覆盖的部分**：
   - 设计原则（SOLID）→ 保留，linter 检查不了设计
   - 命名规范 → 可通过 Checkstyle 规则自动化
   - 函数长度 → 可通过 Checkstyle 规则自动化
   - 嵌套深度 → 可通过 PMD 规则自动化

**优化方向**: 这是一个长期方向。逐步将 clean-code.md 中可自动化的规则迁移到项目级 linter 配置中，然后精简 clean-code.md。

---

### 1.9 LSP 插件 — 类型感知代码生成

**新发现**: 官方插件市场提供了多个 LSP（Language Server Protocol）插件：
- `jdtls-lsp` — Java
- `typescript-lsp` — TypeScript
- `pyright-lsp` — Python
- `gopls-lsp` — Go

LSP 插件让 Claude 获得**类型推断、自动补全、引用查找**等能力，显著提升代码生成质量。

**对你的 Java 开发场景**:
- `jdtls-lsp` 可以让 Claude 在生成代码时有类型信息，减少类型错误
- 与 `ut` skill 配合，生成更准确的 Mock 和断言

**优化方向**: P2 级，评估 `jdtls-lsp` 对 Java 开发的提升效果。

---

### 1.10 Worktree 集成 — 安全的隔离工作

**新发现**: Claude Code 支持自动创建 git worktree，让 Agent 在隔离的分支上工作，不影响主分支。

**当前状态**: 未使用。

**优化方向**: 在执行大规模重构或实验性修改时，指示 Claude 使用 worktree。这提供了天然的"可回滚"保障。

---

## 2. 认知科学与控制论视角的新优化

### 2.1 认知负荷理论应用

Agent 的上下文窗口类似人类工作记忆（7 +/- 2 块）。三种认知负荷映射：

| 认知负荷类型 | 在 Harness 中的对应 | 优化策略 |
|-------------|---------------------|----------|
| **外在负荷**（extraneous） | 冗余指令、仪式性语言、不影响行为的规则 | 删除——v1 的 P0-3 已完成 |
| **内在负荷**（intrinsic） | 任务本身的复杂度，不可约简 | 分解——coding skill 的分阶段设计 |
| **相关负荷**（germane） | 帮助理解和推理的结构化框架 | 增加——thinking.md 的六字原则 |

**当前评估**: 你的 `thinking.md`（相关负荷）设计很好。主要的外在负荷来自 `clean-code.md` 中的详细检查表——这些对 Agent 的"理解"帮助不大，但消耗上下文。

**优化方向**: 将 clean-code.md 中的**检查表**（质量标准、反模式表）移到 `references/`，只保留**原则和推理框架**在 rules 中。

### 2.2 PID 控制论应用

有效的 Agent Harness 实现闭环控制系统：

| 控制类型 | 含义 | 当前实现 | 差距 |
|----------|------|----------|------|
| **P（比例）** | 基于当前误差的即时纠正 | 每步验证（coding skill） | Hook 验证未配置 |
| **I（积分）** | 累积误差跟踪，避免重复犯错 | Memory 系统（应该记住过去错误） | **Memory 完全空白** |
| **D（微分）** | 变化率检测（Agent 是否在震荡/循环） | 无 | **完全缺失** |

**关键差距**: 
- **I 控制**：Memory 系统空白意味着没有跨会话的错误累积记忆。同一个错误可能在不同会话中反复出现。
- **D 控制**：没有检测 Agent 是否在两个方案之间震荡（反复尝试-放弃-再尝试）。auto-goal 的 Reflect-then-Retry 机制部分弥补了这点，但没有跨会话持久化。

**优化方向**: 
1. 初始化 Memory 系统的 `feedback` 类型记忆，记录 Agent 的常见错误模式
2. 在 auto-goal 的 reflections.md 中增加"震荡检测"——如果同一问题在 3 次反思后仍未解决，强制上报

### 2.3 分布式认知视角

人 + Agent 是一个分布式认知系统。关键是**明确的交接协议**。

**当前状态**: 
- coding skill 的 Phase 分界 + AskUserQuestion = 较好的交接点
- 但缺少**交接文档**——当会话结束时，如何让下一个会话继续？

**优化方向**: 在 coding skill 的状态文件中增加 **"如何继续"** section，不仅记录进度，还记录给下一个 Agent（可能是不同会话）的上下文摘要。

---

## 3. 更新后的优先级矩阵

综合 v1 报告和本次新发现，更新后的优先级：

### P0 — 立即做（最高 ROI，<1 小时）

| # | 行动 | 来源 | 预期效果 |
|---|------|------|----------|
| 1 | **启用 hookify 插件** + 配置 stop/bash 规则 | v1 P0-1/P0-2 升级 | 声明式 Hook 管理，比手写 JSON 更易维护 |
| 2 | **初始化 Memory 系统** | v1 P1-2 + PID I 控制 | 开启跨会话学习，填补"积分控制"空白 |
| 3 | **添加 compaction 保护指令到 rules** | 1.6 Context Anxiety | 防止上下文压缩时丢失关键状态 |

### P1 — 本周做（高 ROI，2-4 小时）

| # | 行动 | 来源 | 预期效果 |
|---|------|------|----------|
| 4 | **明确 auto-goal vs coding 边界** | v1 P1-1 + 简化 | 消除最后的触发歧义 |
| 5 | **拆分 clean-code.md** | v1 P1-4 + 认知负荷理论 | 节省 ~1300 tokens/会话 |
| 6 | **启用 commit-commands 插件** | v1 P1-3 | 标准化 Git 工作流 |
| 7 | **评估 feature-dev 插件** | 1.5 新发现 | 可能补充或替代 coding skill |

### P2 — 计划做（中 ROI，持续改进）

| # | 行动 | 来源 | 预期效果 |
|---|------|------|----------|
| 8 | 仓库级 linter 配置替代部分 clean-code 规则 | 1.8 Repo as Source of Truth | 从概率约束升级为确定性强制 |
| 9 | 评估 jdtls-lsp 插件（Java LSP） | 1.9 新发现 | 类型感知的代码生成 |
| 10 | 建立"One task, one context"纪律规则 | 1.6 + v1 P2-3 | 上下文卫生的核心实践 |
| 11 | 探索 worktree 集成 | 1.10 新发现 | 安全的隔离工作 |

### P3 — 实验性

| # | 行动 | 来源 | 预期效果 |
|---|------|------|----------|
| 12 | Agent Teams 大规模任务实验 | 1.4 新发现 | 并行开发能力 |
| 13 | 分层模型选择（Haiku for 简单 Agent） | 1.7 新发现 | Token 成本优化 |
| 14 | 熵管理 — 后台代码健康检查 | 1.3 新发现 | 主动质量监控 |

---

## 4. 立即可执行的 Top 3 行动（具体步骤）

### 行动 1: 启用 Hookify + 配置核心规则

```bash
# 步骤 1: 启用 hookify 插件
# 在 settings.json 中添加:
# "enabledPlugins": { "hookify@claude-plugins-official": true }

# 步骤 2: 创建质量门禁规则
# 文件: .claude/hookify.require-verification.local.md
---
name: require-verification
enabled: true
event: stop
action: warn
---

**验证检查提醒**

请确认以下事项：
- 所有代码变更已通过编译
- 相关测试已运行且通过
- 变更符合项目编码规范

# 步骤 3: 创建安全护栏规则
# 文件: .claude/hookify.block-dangerous-ops.local.md
---
name: block-dangerous-ops
enabled: true
event: bash
pattern: rm\s+-rf|git\s+push\s+.*(-f|--force)|DROP\s+TABLE|truncate\s+table
action: block
---

**危险操作已阻止!**

检测到高风险命令。请确认操作意图后手动执行。

# 步骤 4: 创建敏感文件保护
# 文件: .claude/hookify.protect-secrets.local.md
---
name: protect-secrets
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.env$|credentials|\.key$|secrets
action: warn
---

**敏感文件编辑警告!**

请确保敏感信息不被提交到版本控制。
```

### 行动 2: 初始化 Memory 系统

需要你提供以下信息后创建：
- 你的角色和技术栈（Java 后端? 全栈?）
- 常用项目类型
- 过去纠正 Claude 的经验
- 外部系统地址（Jira/CI/Wiki 等）

### 行动 3: 添加 Compaction 保护规则

在 `~/.claude/rules/` 中创建 `context-hygiene.md`:

```markdown
# 上下文卫生

## Compaction 保护
When compacting, always preserve:
- Full list of modified files in this session
- Current task state and next steps
- Key decisions and their rationale
- Any state.md file contents

## 会话纪律
- 不同类型任务之间 /clear
- 大范围探索委派给子代理
- 关键中间结果外化到文件
```

---

## 5. 元观察：你的 Harness 的独特优势

在分析了大量社区配置后，你的环境有几个**值得保留和强化**的独特优势：

1. **thinking.md 的六字原则** — 这是一个非常精炼的元认知框架（序验深广辨简），比大多数社区配置中冗长的"思考链指令"更高效。它传递的是**推理模式**而非**具体步骤**，完全符合 Anthropic "传意不传形"的设计哲学。

2. **auto-goal 的 OODA 循环** — 与 Claude Code 的原生 Agent Loop 架构高度一致。它的信息分级（FACT/INFER/ASSUME）和 Reflect-then-Retry 机制在社区中少见，是高质量的元认知工具。

3. **ut skill 的自优化系统** — 内建的执行日志 + 经验模式 + 周期性总结，实现了闭环学习。这是大多数 skill 缺少的。

4. **skill-optimize 的七条原则** — 基于认知科学的 skill 优化方法论，本身就是一个高水平的"元 skill"。

**建议**: 这些是你的核心竞争力。不要在追求"启用更多插件"的过程中稀释它们。插件提供广度，你的自建 skill 提供深度。

---

## 6. 终极总结

### 与 v1 报告的关键差异

| 维度 | v1 报告 | v2 增量发现 |
|------|---------|-------------|
| Hook 实现方式 | 手写 JSON | Hookify 插件（声明式，更优） |
| 熵管理 | 未提及 | 新增——后台质量监控概念 |
| 上下文焦虑 | 提到 PreCompact | 上升为独立优化维度 + compaction 规则 |
| Agent Teams | 未提及 | 新增实验性方向 |
| feature-dev 插件 | 仅列为可选 | 提升为评估优先级（可能替代 coding skill） |
| 仓库即真相源 | 未提及 | 新增——linter 替代部分 rules |
| 认知负荷理论 | 隐含 | 显式应用——拆分理由更充分 |
| PID 控制论 | 未提及 | 新增——Memory 的 I 控制角色 |
| LSP 插件 | 仅提及 | 提升优先级（Java 开发场景价值高） |
| 模型分层 | 未提及 | 新增——Haiku for 简单 Agent |

### 一句话总结

> **你的 Harness 基础架构（原则 + skill 生态）是优秀的，关键差距在"控制层"和"记忆层"——用 Hookify 实现确定性控制，用 Memory 实现跨会话学习，就能把一个好的环境升级为一个自进化的系统。**
