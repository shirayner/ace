# Ace Spec Coding 能力设计增强版

> 基于初版设计 + superpowers / OpenSpec / ECC 三个开源仓库能力综合分析
> 目标：确保 AI 高质量交付需求代码

---

## 背景：为什么需要 Spec Coding

AI 编码助手功能强大但结果不可预测。核心矛盾：
- 需求只存在于聊天历史，没有持久化规格
- AI 直接写代码，跳过对齐、设计、验证
- 代码质量标准缺失，每次输出因 Agent 不同而差异巨大
- 长任务上下文污染，导致偏离原始需求

Spec Coding 的解法：在 AI 写代码前，加入一层**规范化的规格驱动流程**，让 AI 从"随机输出工具"变为"可预测的规格执行引擎"。

---

## 三个开源仓库能力速览

### Superpowers（AI 编码方法论）
核心能力：
- **Brainstorming**：苏格拉底式需求澄清 + 多方案设计 + HARD-GATE 审批
- **Writing Plans**：细粒度任务计划（含精确文件路径、完整代码、验证命令）
- **Subagent-Driven Development**：每任务独立子 Agent，规格审查 + 代码质量审查双门禁
- **Test-Driven Development**：RED→GREEN→REFACTOR 铁律
- **Systematic Debugging**：4 阶段根因调试，禁止猜测式修复
- **Verification Before Completion**：声明完成前必须贴实际命令输出
- **Using Git Worktrees**：隔离环境执行，保护主线

关键设计哲学：Evidence over Claims（用数据说话，禁止主观断言）

### OpenSpec（规格驱动开发框架）
核心能力：
- **制品 DAG 图**：将 `proposal→specs→design→tasks` 建模为有向无环图，可计算依赖
- **Delta Spec 机制**：ADDED/MODIFIED/REMOVED 三种变更类型，只描述变化
- **Artifact 模板系统**：每种制品对应 Markdown 模板，AI 按模板生成
- **结构化校验**：校验制品必要章节，支持 CI 集成
- **归档机制**：变更完成后合并 delta spec 进主 specs，保留完整历史
- **多工具命令生成**：统一 CLI 自动生成 30+ AI 工具对应格式的 skill 文件
- **跨仓库协调**：Workspace + Initiative + Context Store 三层机制

关键设计哲学：流动而非僵化（fluid not rigid），适配存量系统

### ECC（AI 编码 harness 操作系统）
核心能力：
- **64 专家子 Agent**：architect、planner、code-reviewer、security-reviewer 等领域专家
- **持续学习 Instinct 机制**：从会话中自动提取最佳实践 → 生成 Skill，置信度评分驱动
- **编码规则层（rules/）**：始终注入系统提示，20 个语言/框架方向约束
- **AgentShield**：102 条静态分析规则 + 3 Agent 对抗红蓝审计，AI 配置安全扫描
- **Hooks 系统**：PreToolUse/PostToolUse/Stop 触发式自动化，运行时质量门控
- **上下文管理三件套**：strategic-compact、context-budget、suggest-compact
- **多 Agent 编排**：multi-plan、multi-execute、multi-backend 并行调度

关键设计哲学：将"与 AI 协作编程"的最佳实践**产品化**，可分发、可演化、可安全审计

---

## Ace Spec Coding 能力全景图（增强版）

```
┌─────────────────────────────────────────────────────────────────────┐
│                        通用基础能力层                                 │
│   深度思考 │ SubAgent 执行引擎 │ 并行调度 │ 澄清对齐 │ 经验进化        │
│            │ 上下文管理        │          │ HARD-GATE│ Instinct 机制  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ 驱动
┌───────────────────────────────▼─────────────────────────────────────┐
│                       Spec Coding 编排层                              │
│  阶段流程管理 │ 状态机 │ HARD-GATE 门禁 │ 并行任务调度                  │
└──────┬─────────────────────────────────────────┬──────────────────--─┘
       │                                         │
┌──────▼──────────┐                   ┌──────────▼──────────────────┐
│  Spec 生命周期   │                   │      代码质量保障层           │
│  proposal       │                   │  TDD 铁律                   │
│  → specs        │                   │  Code Review（多维专家）      │
│  → design       │                   │  Verification 门控           │
│  → tasks        │                   │  规则注入（语言/框架约束）      │
│  delta spec     │                   │  根因调试（禁猜测式修复）       │
│  归档 & 合并     │                   │  AgentShield（安全审计）      │
└─────────────────┘                   └─────────────────────────────┘
```

---

## 能力详细设计

### 一、通用基础能力层（原有 + 增强）

| 能力 | 原有 | 增强点 | 来源 |
|------|------|--------|------|
| 深度思考 | ✅ | 苏格拉底式逐步澄清，2-3 方案对比 | Superpowers brainstorming |
| SubAgent 执行引擎 | ✅ | 每任务独立子 Agent，上下文隔离，双门禁 | Superpowers subagent-driven |
| 并行调度 | ✅ | 识别独立域，并发派发，结果整合 | Superpowers dispatching-parallel-agents |
| 澄清对齐 | ✅ | HARD-GATE：未通过设计审批，禁止任何实现动作 | Superpowers brainstorming |
| 经验进化 | ✅ | **Instinct 机制**：自动从会话提取模式 → 生成 Skill，置信度评分管理 | ECC continuous-learning-v2 |
| **上下文管理** | ❌新增 | strategic-compact + context-budget + suggest-compact 三层优化 | ECC |
| **Git Worktree 隔离** | ❌新增 | 每个变更创建独立 worktree，基线测试验证，保护主线 | Superpowers using-git-worktrees |

### 二、Spec 生命周期（增强）

**来源**：OpenSpec 制品 DAG 图 + Delta Spec 机制

#### 2.1 制品流水线（DAG 驱动）

```
proposal（问题定义 + 边界约束）
    │
    ▼
specs（当前系统行为规格）
    │
    ▼
design（技术方案 + API 契约 + 数据结构）
    │
    ▼
tasks（细粒度实现计划，含验证命令）
```

每个制品：
- 有固定 Markdown 模板（AI 按模板生成，确保结构一致）
- 有必要章节校验（结构校验 gate，缺章节不允许进入下一阶段）
- 有依赖关系（上游未完成，下游不可开始）

#### 2.2 Delta Spec 机制（适配存量系统）

```yaml
# delta spec 格式
ADDED:
  - 新增的规格节点

MODIFIED:
  - 变更的规格节点（含 diff 描述）

REMOVED:
  - 删除的规格节点
```

- 每次变更只描述 delta，不重写全量 spec
- 多个并行变更互不干扰（独立文件夹）
- 归档时将 delta 合并进主 specs，保留完整历史

#### 2.3 Spec 可合并性与可累积性

- Spec 版本控制：每次 delta 带时间戳 + 变更 ID
- 归档（archive）：合并 delta 进主 specs → 保留完整历史 → 清理工作变更目录
- `/opsx:verify`：验证实现与规格的一致性（完整性/正确性/连贯性）

### 三、需求理解（增强）

**来源**：Superpowers brainstorming + OpenSpec proposal 模板

#### 3.1 需求澄清协议（HARD-GATE）

```
步骤 1：逐一提问（每次最多 1 个问题，避免轰炸）
步骤 2：提出 2-3 种实现方案（含技术路径对比）
步骤 3：分段展示设计（先整体，再细节）
步骤 4：用户确认 ← HARD-GATE：未确认禁止实现
步骤 5：写 proposal 文档 → 写 specs 文档
```

#### 3.2 范围检测 + 子项目分解

- 检测需求规模（小/中/大），大型需求强制分解为子变更
- 识别边界问题（影响哪些模块、服务、数据结构）
- 约束边界：明确哪些**不在**本次变更范围内

#### 3.3 多种需求输入源适配

- 自然语言描述（从对话提取）
- Spec 文档（从 specs/ 读取上下文）
- 代码库探索（从代码理解当前行为，生成 AS-IS 规格）

### 四、技术设计（增强）

**来源**：ECC architect agent + OpenSpec design 模板

#### 4.1 架构探索（代码库理解）

- 读取 `project-profile.md`（技术画像）
- 多维并行探索：API 层、数据层、服务层、测试层
- 生成 AS-IS 规格（当前系统行为描述）
- 识别受影响模块和变更影响半径

#### 4.2 设计制品生成（有模板约束）

```markdown
## Design 模板必要章节
- 方案概述（1-3 句话）
- 技术路径选择（方案 A vs B，含 tradeoff）
- API 契约（接口签名 + 参数 + 返回值）
- 数据结构变更（entity/schema diff）
- 测试策略（单元/集成/E2E 覆盖点）
- 实现顺序（task 依赖图）
```

#### 4.3 任务计划细粒度要求

- 每任务：2-5 分钟完成
- 每任务包含：文件路径、完整代码片段、验证命令
- 任务依赖图（⟂ 独立 / depends: X 依赖）
- 强制 TDD 格式：每任务先写测试

### 五、代码质量保障层（大幅增强）

#### 5.1 TDD 铁律（来自 Superpowers）

```
RED   → 先写失败测试（没有测试 = 违规，删代码重来）
GREEN → 最小实现让测试通过（不允许跳过测试）
REFACTOR → 重构，保持测试绿色
```

违规检测：
- 检测是否存在测试文件（新功能必须有对应测试）
- 检测测试覆盖率（目标 80%+）
- 未见 RED→GREEN 记录 → 质量门禁拒绝

#### 5.2 多维 Code Review（来自 ECC）

| 维度 | 专家 Agent | 检查点 |
|------|-----------|--------|
| 正确性 | code-reviewer | 逻辑错误、边界条件、异常处理 |
| 安全性 | security-reviewer | 注入、权限、敏感信息泄露 |
| 数据库 | database-reviewer | N+1 查询、索引缺失、事务边界 |
| 语言规范 | java-reviewer / ts-reviewer / ... | 语言特定最佳实践 |
| 架构合规 | architect | 层间依赖、设计原则遵循 |

#### 5.3 Verification Gate（来自 Superpowers）

**铁律：任何"完成"声明前，必须执行**：
```
1. 运行测试命令并贴实际输出
2. 运行构建命令并验证成功
3. 运行 lint/类型检查
4. 贴出实际输出（禁止"应该没问题"式断言）
```

无实际输出 = 未完成 = 禁止标记 completed

#### 5.4 规则注入层（来自 ECC rules/）

- 始终注入系统提示，约束 AI 编码行为
- 覆盖 Java / TypeScript / Python / Go 等多语言
- 包含：命名规范、函数长度限制、SOLID 原则、禁用模式清单
- 可扩展：项目本地规则 > 用户全局规则 > 默认规则（三级优先级）

#### 5.5 根因调试协议（来自 Superpowers systematic-debugging）

```
阶段 1：读错误（完整错误信息 + 堆栈）
阶段 2：模式分析（是什么类型的错误？在哪一层？）
阶段 3：单一假设验证（一次验证一个假设，禁止多线并进）
阶段 4：根因修复（根因未找到，禁止提出修复方案）
```

### 六、编排器（增强）

#### 6.1 阶段流程（状态机）

```
IDLE
  → [需求输入] → CLARIFYING（澄清对齐，HARD-GATE）
  → [澄清通过] → PLANNING（生成 proposal + specs + design + tasks）
  → [计划审批] → IMPLEMENTING（subagent 执行，每任务独立 Agent）
  → [实现完成] → REVIEWING（多维 Code Review）
  → [审查通过] → VERIFYING（运行测试 + 构建 + lint）
  → [验证通过] → ARCHIVING（delta spec 归档，worktree 清理）
  → [归档完成] → DONE
```

每个状态转换都有明确的门禁条件（Gate Function），不满足条件不允许进入下一状态。

#### 6.2 子 Agent 调度策略

- **独立任务** → 并行 Agent（多 worktree 并发）
- **依赖任务** → 串行（等待前置完成）
- **Review 维度** → 并行 Agent（多维度同时审查）
- **调试任务** → 串行（单一假设验证，禁止并发修复）

#### 6.3 中断恢复

- 状态持久化到 `.tasks/{change-id}/state.md`
- 用户说"继续"时：读 state.md → 验证制品存在 → 重建进度 → 继续
- 每个子 Agent 完成后立即更新状态（原子更新）

### 七、新增能力：AgentShield 安全层（来自 ECC）

对 AI 生成的配置和代码进行安全审计：
- 检测 secrets 硬编码
- 检测权限过宽配置
- 检测 Hook 注入风险
- MCP 服务器风险画像
- 支持 CI 集成（`--json` 输出）

### 八、新增能力：Instinct 持续学习（来自 ECC）

```
会话结束 → evaluate-session 提取可复用模式
       → 计算置信度评分（基于出现频次 + 成功率）
       → 高置信度模式 → 生成新 Skill 文件
       → 注入到后续会话的规则层
```

这使得 Ace Spec Coding 具备**自我进化**能力：每次成功交付都会沉淀为下次更好的执行依据。

---

## 能力纳入决策矩阵

| 能力 | 来源 | 纳入优先级 | 理由 |
|------|------|-----------|------|
| HARD-GATE 澄清对齐 | Superpowers | P0 | 防止方向错误，是 spec coding 最核心门禁 |
| Delta Spec 机制 | OpenSpec | P0 | 存量系统适配，spec 可累积性核心 |
| 制品 DAG + 结构校验 | OpenSpec | P0 | Spec 格式一致性、可合并性保障 |
| TDD 铁律 | Superpowers | P0 | 代码质量底线，不可妥协 |
| Verification Gate | Superpowers | P0 | 杜绝"声称完成"的虚假交付 |
| 多维 Code Review | ECC | P1 | 多角度质量保障，语言感知审查 |
| 规则注入层 | ECC | P1 | 始终在线的编码约束，标准化输出 |
| Git Worktree 隔离 | Superpowers | P1 | 并行开发安全基础 |
| 根因调试协议 | Superpowers | P1 | 防止猜测式修复引入新 bug |
| Instinct 持续学习 | ECC | P2 | 自我进化，长期价值高但初版可不包含 |
| 上下文管理三件套 | ECC | P2 | 长任务质量保障，防偏离 |
| AgentShield 安全审计 | ECC | P2 | 交付物安全保障，CI 集成 |
| 跨仓库协调 | OpenSpec | P3 | 复杂场景，初版可选 |

---

## 与初版对比：新增/增强项

| 初版模块 | 增强点 |
|---------|--------|
| Spec 生命周期 | **Delta Spec 机制**（增量描述变更），**制品 DAG**（依赖驱动），**结构校验 gate** |
| 编排器 | **状态机门禁**（每阶段有明确 Gate Function），**中断恢复**（state.md 持久化） |
| 需求理解 | **HARD-GATE 澄清**（未审批禁止实现），**多输入源适配**（对话/文档/代码库） |
| 技术设计 | **设计制品模板约束**（强制必要章节），**任务计划细粒度要求** |
| Code Review | **多维专家 Agent**（正确性/安全/数据库/语言/架构），**规则注入层** |
| ——新增—— | **TDD 铁律**（RED→GREEN→REFACTOR 强制执行） |
| ——新增—— | **Verification Gate**（完成声明前必须贴实际输出） |
| ——新增—— | **根因调试协议**（4 阶段，禁猜测式修复） |
| ——新增—— | **Git Worktree 隔离**（每变更独立环境） |
| ——新增—— | **Instinct 持续学习**（会话经验 → Skill 自动生成） |
| ——新增—— | **上下文管理**（长任务防偏离） |
| ——新增—— | **AgentShield 安全审计**（交付物安全保障） |

---

## 实现路径建议

### Phase 1 — 核心流程（P0，最小可用版本）
1. 实现 proposal → specs → design → tasks 四制品流水线（含模板 + 校验）
2. 接入 OpenSpec CLI 管理 Spec 生命周期（delta spec + 归档）
3. 实现 HARD-GATE 澄清对齐（未审批禁止实现）
4. 实现 Verification Gate（完成声明必须有实际输出）
5. TDD 铁律注入（任务计划强制包含测试步骤）

### Phase 2 — 质量增强（P1）
6. 多维 Code Review（至少 2 个专家 Agent：code-reviewer + security-reviewer）
7. 语言规则注入层（Java/TypeScript 优先）
8. Git Worktree 隔离（大型变更启用）
9. 根因调试协议（替代当前的调试模式）

### Phase 3 — 自我进化（P2）
10. Instinct 持续学习机制（会话评估 → Skill 生成）
11. 上下文管理优化（strategic-compact 集成）
12. AgentShield CI 集成（生成产物安全扫描）

---

*生成时间：2026/06/10*  
*参考仓库：superpowers / OpenSpec / ECC*
