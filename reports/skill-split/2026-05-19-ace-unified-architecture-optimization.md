# ACE 统一架构优化方案：aspec × auto-goal 模块抽取与重构

> 日期：2026-05-19（v2）
> 前置报告：`ace-workflow-optimization-report.md`（Superpowers 对比）、`2026-05-19-aspec-workflow-optimization.md`（aspec 单独分析）
> 本报告聚焦：aspec 与 auto-goal 的重复识别 + 公共层抽取 + 借鉴 Superpowers 的统一重构方案

---

## 一、重复识别：aspec 与 auto-goal 共享了什么

### 1.1 逐项对照表

| 能力模块 | aspec 中的实现 | auto-goal 中的实现 | 重复度 |
|----------|---------------|-------------------|--------|
| **苏格拉底分析** | config.yaml context 中的"深度认知方法论"段（4 追问） | 规则 1 Step 1（完全相同的 4 追问） | **100%** |
| **引导性提问** | config.yaml context 中的"引导性提问"段 | 规则 1 Step 2 的澄清描述 | **90%** |
| **对齐确认四要素** | config.yaml context 中的"对齐确认四要素" | 规则 1 Step 3（相同格式） | **100%** |
| **惊讶测试** | config.yaml context "元规则" | 规则 2（相同一句话判断） | **100%** |
| **经验进化** | config.yaml rules 中的 tasks 收尾 + experience-template.md | "经验进化（条件触发）"整段 | **80%** |
| **并行探索策略** | config.yaml context 中的"并行探索策略" | "并行执行"整段 | **60%** |
| **批量提问** | config.yaml context "行为约束" | 规则 1 Step 2（AskUserQuestion） | **70%** |
| **状态外化** | 隐式（issues 文件 + experience.md） | 规则 3 完整的 state.md 体系 | **30%**（结构不同但理念相同） |
| **门禁机制** | config.yaml rules `🚫 GATE:` | 规则 0 Pre-execution Checkpoint | **70%**（目的相同，形式不同） |

### 1.2 重复的根因

```
aspec 定位：规范驱动开发工作流（OpenSpec 增强）
auto-goal：自主完成复杂目标的赋能系统

两者共享的深层需求：
┌──────────────────────────────────────────────┐
│  在 AI 自主执行前，确保理解正确（对齐）          │
│  在执行过程中，确保方向正确（门禁）              │
│  在完成之后，确保知识积累（进化）                │
└──────────────────────────────────────────────┘
```

**根因**：aspec 和 auto-goal 独立演化，各自实现了同一套"对齐 + 门禁 + 进化"基础设施。没有公共层导致：
1. **维护成本 ×2**：改一处要同步改两处
2. **一致性风险**：两处实现可能漂移（已经有微小差异）
3. **Token 浪费**：如果两者都加载（虽然不会同时），相同内容占了两份空间
4. **优化碎片化**：Superpowers 的改进建议需要在两处分别实施

### 1.3 差异（不可合并的部分）

| 能力 | aspec 独有 | auto-goal 独有 |
|------|-----------|---------------|
| **维度引导** | dimensions.md（需求 6 维 + 设计 7 维 + 盲区） | 无 |
| **Spec 产出物** | proposal / design / tasks 结构化产出 | 无结构化中间产出 |
| **知识库体系** | ADR / Glossary / Risk Map / Retrospective | experience.md（扁平列表） |
| **多阶段门禁** | proposal 前 + design 前 + tasks 前（三级门禁） | 仅执行前一级门禁 |
| **state.md 体系** | 无 | 响应式状态文件 + Tier 2 |
| **复杂度适配** | 无（固定流程） | 轻量/标准/深度三级适配 |
| **恢复协议** | 无 | recovery.md 完整流程 |
| **并行子代理执行** | 仅探索阶段并行 | 执行阶段并行 |

---

## 二、架构重构方案：公共层抽取

### 2.1 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│                    ACE Skill 架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────── 编排层 ────────────────────┐        │
│  │  ace:auto-goal (自主目标)                       │        │
│  │  ace:coding (代码实现)                          │        │
│  │  opsx:proposal / apply / archive (规范驱动)     │        │
│  └─────────────────────────────────────────────────┘        │
│         ↕ 调用                                              │
│  ┌──────────────────── 公共层 ────────────────────┐        │
│  │  ace:align       — 对齐协议（苏格拉底+澄清+确认）│        │
│  │  ace:verify      — 验证 Iron Law               │        │
│  │  ace:evolve      — 经验进化体系                 │        │
│  │  ace:parallel    — 并行调度模板                 │        │
│  └─────────────────────────────────────────────────┘        │
│         ↕ 引用                                              │
│  ┌──────────────────── 基础设施层 ────────────────┐        │
│  │  rules/          — Clean Code / Git / 等规则文件│        │
│  │  hooks/          — SessionStart / 安全守卫      │        │
│  │  templates/      — 状态文件/知识库模板          │        │
│  └─────────────────────────────────────────────────┘        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 公共层设计

#### `ace:align` — 统一对齐协议

**职责**：从 aspec 和 auto-goal 中抽取对齐三步骤，成为独立 skill。

```markdown
---
name: align
description: |
  任何需要确认用户意图的场景触发：新目标、新功能、设计决策、范围变更。
  auto-goal 的规则 1、aspec 的澄清流程共用此协议。
  DO NOT TRIGGER: 已在同一会话对齐过的延续性任务。
---

# ace:align — 统一对齐协议

<HARD-GATE>
此协议完成前，禁止发出任何修改性工具调用（Edit/Write/Bash 创建文件）。
AskUserQuestion 的调用记录是通过证据。没有记录 = 未通过。
</HARD-GATE>

## 三步协议

### Step 1: 深度分析（内部推理，不展示给用户）

结合已有上下文 + 探索性工具，在内部执行四追问：
- **追问目的**：为什么做？解决什么根本问题？谁受益？
- **追问完整性**：全貌还是冰山一角？关联问题？前置依赖？
- **追问前提**：假设成立吗？更好的问题框架？是否在解决错误的问题？
- **追问约束**：什么不能动？硬限制？时间/资源/技术债？

输入源（按场景加载）：
- aspec 场景：Read dimensions.md，用维度深度提问 + 盲区表启发分析
- auto-goal 场景：Read memory、CLAUDE.md、git status
- 共通：会话历史、项目结构

输出：识别出的不确定性列表（用于 Step 2）。

### Step 2: 引导性澄清

基于 Step 1 结论，设计面向用户的具体问题，调用 AskUserQuestion 批量澄清。

设计原则：
- 具体、可行动、关联用户业务场景
- 主动指出关联："我注意到 X 还涉及 Y——是否在范围内？"
- 暴露取舍："方案 A 更简单但有 X 风险，方案 B 更复杂但更全——优先级？"

跳过条件（必须同时满足全部）：
- 同一会话中已明确表达完整意图
- Step 1 未发现隐含决策点
- 不存在"用户可能惊讶"的假设
- 延续性修复（而非新目标）

**如不确定是否需要澄清 → 澄清。**

### Step 3: 对齐确认（不可跳过）

用 markdown 展示四要素（每要素标题独占一行，内容换行后写）：

```
**我的理解**
（1-2 句核心意图）

**计划方向**
（1-2 句高层策略）

**关键假设**
- 假设 1
- 假设 2

**完成标准**
- 可测试条件 1
- 可测试条件 2
```

展示后调用 AskUserQuestion 确认。确认后才能开始执行。

## 惊讶测试（替用户做选择时的暂停规则）

一句话判断：如果用户此刻看到我的决策会惊讶 → 暂停询问。

触发条件：
- 多个可行方案且各有取舍
- 决策依赖用户偏好
- 范围超出原始目标
- 不可逆操作
- 正在填补用户未说明的部分

## Red Flags — 正在跳过对齐

| 你的想法 | 真相 |
|---------|------|
| "这个任务很简单" | 简单 = 隐含决策被忽略 |
| "用户已经说清楚了" | 说清楚 ≠ 你理解 100% 正确 |
| "auto mode 要求立即执行" | auto mode 不覆盖对齐门禁 |
| "先探索再对齐" | 对齐在任何操作之前 |
| "上一轮已经对齐过了" | 新目标 = 新对齐 |
| "读文件就知道怎么做" | 读文件是探索，不是对齐 |
| "先出初版再迭代" | 先对齐再出初版 |
```

#### `ace:verify` — 统一验证门禁

```markdown
---
name: verify
description: |
  声称完成、准备提交、或 TaskUpdate completed 前触发。
  确保所有完成声明有对应的新鲜证据。
---

# ace:verify — 验证 Iron Law

## Iron Law
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

## Gate Function
1. IDENTIFY — 什么命令能证明这个声称？
2. RUN — 执行完整命令（fresh，不复用旧结果）
3. READ — 完整阅读输出，检查 exit code
4. VERIFY — 输出确认声称？
   - YES → 携带证据声称完成
   - NO → 报告实际状态，不声称完成

跳过任何步骤 = 虚假声称。

## Red Flags
| 想法 | 真相 |
|------|------|
| "应该没问题" | RUN 验证 |
| "我有信心" | 信心 ≠ 证据 |
| "部分检查够了" | 部分什么也不证明 |
| "刚改过肯定好" | 改过 ≠ 验证过 |
```

#### `ace:evolve` — 统一经验进化

```markdown
---
name: evolve  
description: |
  任务完成后触发经验进化。aspec 的 archive 复盘、auto-goal 的经验进化共用。
  触发条件：遇到意外/踩坑/策略转换/反直觉发现。
---

# ace:evolve — 经验进化协议

## 触发判断
满足任一 → 执行经验提取：
- 执行中遇到意外、踩坑、策略转换
- 发现反直觉的技术事实
- 找到跨任务可复用的模式

全部不满足 → 标注"无新经验"，跳过。

## 执行

### 通用格式（适用于 auto-goal 的 .tasks/experience.md）
每条：编号 / 场景 / 发现 / 适用范围

### 结构化格式（适用于 aspec 的 experience.md）
按 experience-template.md 结构：
- 技术决策 (ADR) → openspec/decisions/adr.md
- 领域词汇 → openspec/glossary.md
- 风险事件 → openspec/risk-map.md
- 复盘记录 → retrospectives/

### 经验应用
新任务启动时读取（如存在），应用时告知用户（"基于经验 EX，采用…"）。
每次应用记录验证结果：✓有效 / ✗无效 / —不适用。

### 收敛
条目 >20 → 合并相似、淘汰无效（需用户确认）。
累计 3+ 次 ✓有效 → 提议提升至 ~/.claude/memory/。
```

#### `ace:parallel` — 统一并行调度

```markdown
---
name: parallel
description: |
  面对 2+ 个独立子任务时触发。提供并行调度模板和协调规则。
  aspec 的并行探索策略、auto-goal 的并行执行共用。
---

# ace:parallel — 并行调度协议

## 触发判断
如果 A 的结果完全不同，B 的执行方式会变吗？不会 → 并行。

## 约束
- 并行 Agent ≤ 8
- 每个 prompt 自包含（目标 + 上下文 + 交付格式）
- 不修改同一文件
- 结果回收后主 agent 整合

## Prompt 模板

### 探索型
```
分析 {target} 的 {aspect}。
上下文：{relevant context}
输出：发现列表 + 风险评估 + 行动建议
```

### 实现型
```
实现 {task}。
上下文：{project structure + constraints}
完成标准：{criteria}
输出：状态（DONE/BLOCKED/NEEDS_CONTEXT）+ 变更摘要
```

### Review 型
```
审查 {scope} 的 {aspect}。
检查重点：{checklist}
输出：✅ 通过 + 确认 / ❌ 问题列表（文件:行号:问题:建议）
```
```

### 2.3 编排层改造

#### auto-goal 瘦身后

```markdown
---
name: auto-goal
description: |
  自主完成复杂目标或学习需求。当用户描述期望结果（而非具体代码变更）时触发。
  DO NOT TRIGGER: 明确代码变更（→ coding）；优化 skill（→ skill-optimize）。
---

# Auto Goal — 自主目标编排

## 硬规则

### 规则 0：Pre-execution Checkpoint
<HARD-GATE>
修改性工具调用前，REQUIRED: 调用 ace:align 完成对齐协议。
无 AskUserQuestion 确认记录 = 未通过。
</HARD-GATE>

### 规则 1：对齐（委托）
**REQUIRED SUB-SKILL: Use ace:align**
- aspec 场景加载 dimensions.md；auto-goal 场景用 memory/会话上下文
- align 完成后返回此处继续

### 规则 2：进度追踪
- TaskCreate/TaskUpdate 始终使用
- 状态文件：对齐后根据完成标准条目数声明级别

### 规则 3：执行管理
- 独立子任务：**REQUIRED: Use ace:parallel**
- 执行原则：先定义完成再执行；承诺当前计划卡住时换方向；永不空手而归

### 规则 4：验证与交付
- 交付前：**REQUIRED SUB-SKILL: Use ace:verify**
- 经验归档：**REQUIRED SUB-SKILL: Use ace:evolve**（满足触发条件时）

## 执行原则（保留）
1. 先定义完成，再开始执行
2. 承诺当前计划，卡住时换方向
3. 永不空手而归
4. 上下文是稀缺资源
5. 对齐不是一次性事件

## 上下文纪律（保留）
- 隔离 / 压缩 / 外化 / 预算感知

## 恢复协议（保留）
Read references/recovery.md
```

**对比**：原 264 行 → 约 80 行。核心逻辑通过 REQUIRED SUB-SKILL 委托到公共层。

#### aspec config.yaml 瘦身后

```yaml
schema: spec-driven
version: 7.0.0
context: |
  ## 语言
  所有交互使用中文。OpenSpec 英文标题保留。

  ## aspec 模式
  寄生于 OpenSpec，通过 context/rules 注入增强。
  核心理念：对齐优先于效率。

  ## 流程
  [需求澄清→对齐] → proposal → specs → [设计澄清→对齐] → design → [审批] → tasks → apply → [经验提取] → archive

  ## 门禁（不可跳过）
  | 产物 | 前置条件 |
  |------|----------|
  | proposal | requirement-issues clarified + 对齐确认通过 |
  | design.md | design-issues clarified + 对齐确认通过 |
  | tasks | 用户审批 design.md |

  ## 对齐协议
  需求澄清和设计澄清均委托 ace:align 执行。
  ace:align 加载时，额外输入：Read dimensions.md 的维度和盲区启发分析。

  ## Spec 产出物完成标准
  - proposal: Why / Capabilities（唯一 ID）/ Impact，引用 requirement-issues
  - design: 每个技术决策四要素，已知风险有应对
  - tasks: 追溯到 design 决策，粒度支持原子验证

  ## Spec 变更协议（apply 阶段）
  - 微调（不影响设计决策）→ 更新问题清单，继续
  - 重大偏差（影响 High 级决策）→ 暂停 → re-spec

  ## 知识库索引
  explore/propose: ADR + Glossary
  design: ADR + Risk Map + 盲区
  apply: ADR + Risk Map + Spec 决策
  archive: 全部 → 进化

rules:
  proposal:
    - "REQUIRED: ace:align（输入 dimensions.md 需求维度 + 盲区）"
    - "🚫 GATE: requirement-issues 未 clarified 前禁止创建 proposal"
    - "产出符合 Spec 完成标准"
  design:
    - "REQUIRED: ace:align（输入 dimensions.md 设计维度 + 盲区）"
    - "🚫 GATE: design-issues 未 clarified 前禁止创建 design.md"
    - "产出符合 Spec 完成标准"
  tasks:
    - "REQUIRED: 展示 design.md 摘要 → AskUserQuestion 审批"
    - "tasks.md 末尾含收尾段：REQUIRED ace:evolve"
  apply:
    - "实施前读取所有 Spec 决策"
    - "偏差处理按 Spec 变更协议"
    - "完成后 REQUIRED: ace:verify 验证 Spec-Code 一致性"
  archive:
    - "REQUIRED: ace:evolve（结构化格式）"
```

**对比**：
- 原 config.yaml：~150 行（大量过程描述重复了 auto-goal 的内容）
- 新 config.yaml：~50 行（委托公共层，只保留 aspec 特有的门禁和 Spec 标准）

---

## 三、重构前后对比

### 3.1 Token 预算对比

| 组件 | 重构前 | 重构后 | 变化 |
|------|--------|--------|------|
| auto-goal SKILL.md | ~3,500 tokens | ~1,200 tokens | -66% |
| aspec config.yaml | ~2,500 tokens | ~800 tokens | -68% |
| **公共层 total** | N/A | ~2,800 tokens | 新增 |
| **系统总 token** | ~6,000（两者共存时） | ~4,800 | -20% |

注意：公共层 token 是**共享**的，不论从 auto-goal 还是 aspec 进入都只加载一次。如果两者从不同时加载，净节省更大。

### 3.2 能力矩阵对比

| 能力 | 重构前 | 重构后 |
|------|--------|--------|
| 对齐协议 | 两处各自实现，微有差异 | 统一 ace:align，一处维护 |
| 验证门禁 | coding OODA 内嵌 + auto-goal 自检 | 统一 ace:verify，独立 skill |
| 经验进化 | 两处各自实现（格式不同） | 统一 ace:evolve，支持两种格式 |
| 并行调度 | 两处各自描述原则 | 统一 ace:parallel，含 prompt 模板 |
| 门禁强度 | markdown 标题级 | `<HARD-GATE>` + REQUIRED SUB-SKILL |
| 反合理化 | 规则 0 一条自问 | Red Flags 表（7 条拦截） |
| Spec 质量标准 | 无（aspec 特有问题） | 在 aspec config 中声明式定义 |
| 复杂度适配 | auto-goal 独有 | 保留在 auto-goal 中 |

### 3.3 维护成本对比

| 维度 | 重构前 | 重构后 |
|------|--------|--------|
| 改"对齐确认格式" | 改 auto-goal + aspec 两处 | 改 ace:align 一处 |
| 改"验证规则" | 改 auto-goal + coding 两处 | 改 ace:verify 一处 |
| 改"经验进化流程" | 改 auto-goal + aspec 两处 | 改 ace:evolve 一处 |
| 添加新 Red Flags | 每个 skill 各加一遍 | ace:align 加一条全局生效 |
| Superpowers 建议迁移 | 分散到各个 skill | 公共层统一承接 |

---

## 四、实施路线图

### Phase 1：创建公共层（优先级 P0，工作量 1 天）

| 步骤 | 产出 | 依赖 |
|------|------|------|
| 1.1 创建 `plugin/skills/align/SKILL.md` | 统一对齐协议 | 无 |
| 1.2 创建 `plugin/skills/verify/SKILL.md` | 统一验证 Iron Law | 无 |
| 1.3 创建 `plugin/skills/evolve/SKILL.md` | 统一经验进化 | 无 |
| 1.4 创建 `plugin/skills/parallel/SKILL.md` | 统一并行调度 | 无 |

### Phase 2：编排层瘦身（优先级 P0，工作量 1 天）

| 步骤 | 产出 | 依赖 |
|------|------|------|
| 2.1 改造 auto-goal SKILL.md | 规则委托到公共层 | Phase 1 |
| 2.2 改造 aspec config.yaml | 澄清委托到 ace:align | Phase 1 |
| 2.3 改造 coding SKILL.md | 验证委托到 ace:verify | Phase 1 |

### Phase 3：强化（优先级 P1，工作量 2-3 天）

| 步骤 | 产出 | 依赖 |
|------|------|------|
| 3.1 创建 SessionStart hook | 对齐门禁注入 system prompt | Phase 2 |
| 3.2 创建 sub-agent review prompts | spec-reviewer + quality-reviewer | Phase 2 |
| 3.3 CSO 优化所有 skill description | 去掉流程摘要 | Phase 2 |
| 3.4 压力测试验证 | 用 sub-agent 测试流程遵循率 | Phase 2 |

### Phase 4：aspec v7 精简（优先级 P2，工作量 3-5 天）

| 步骤 | 产出 | 依赖 |
|------|------|------|
| 4.1 dimensions.md 精简 | 维度枚举 + 盲区（按前次分析） | Phase 2 |
| 4.2 模板最小化 | issues schema 化 | Phase 2 |
| 4.3 双向进化机制 | ace:evolve 支持退化 | Phase 3 |
| 4.4 Spec-Code 验证闭环 | ace:verify 在 apply 后检查一致性 | Phase 3 |

---

## 五、设计决策与取舍

### 5.1 为什么不把 aspec 完全并入 auto-goal？

| 保持独立的理由 | 说明 |
|---------------|------|
| **触发场景不同** | aspec 由 `/opsx:proposal` 显式命令触发；auto-goal 由目标描述隐式触发 |
| **产出物不同** | aspec 产出 Spec 文件体系；auto-goal 产出任意交付物 |
| **外部依赖** | aspec 寄生于 OpenSpec，受其 schema 约束 |
| **知识体系不同** | aspec 有结构化知识库（ADR/Glossary/Risk Map）；auto-goal 只有 experience.md |
| **用户心智模型** | 用户用 `/opsx:proposal` 明确知道自己在走 Spec 流程 |

### 5.2 为什么选择"公共层 + 编排层"而非"一个巨型 skill"？

借鉴 Superpowers 的核心设计智慧：

1. **单一职责 Skill 执行率更高** — 100-150 行 skill 比 300+ 行 skill 遵循率高
2. **Skill 边界即门禁** — 不加载下一个 skill = 无法继续
3. **可独立测试和优化** — ace:align 可以被单独压力测试
4. **复用性** — 未来新 skill 可直接引用公共层

### 5.3 ace:align 如何适配不同场景？

```
ace:align 被调用时，调用者提供"输入源"参数：
- auto-goal 调用：输入源 = memory + 会话历史 + git status
- aspec proposal 调用：输入源 = dimensions.md 需求维度 + 盲区表 + experience.md
- aspec design 调用：输入源 = dimensions.md 设计维度 + 盲区表 + ADR

ace:align 内部 Step 1 根据输入源执行分析，Step 2/3 通用。
```

这样一个 skill 适配多场景，不需要为每个场景写单独的对齐 skill。

### 5.4 如何处理"轻量任务不需要完整对齐"的场景？

保留 auto-goal 的复杂度适配机制：

```
轻量任务（单文件、位置明确）：
  → ace:align 的 Step 2 跳过条件更容易满足
  → Step 3 对齐确认可以很短（1-2 句话）
  → 不需要 state.md

标准/深度任务：
  → 完整走 ace:align 三步
  → 根据规模创建 state.md
```

关键点：不是"跳过 ace:align"，而是"ace:align 根据复杂度自适配深度"。即使轻量任务也要经过 Step 3 确认（哪怕只是一句话）——这是 Superpowers 的教训："simple projects are where unexamined assumptions cause the most wasted work"。

---

## 六、与 Superpowers 的借鉴映射

| Superpowers 机制 | ACE 公共层实现 | 差异说明 |
|-----------------|---------------|---------|
| SessionStart hook 注入 | hooks/session-start（Phase 3.1） | 注入对齐门禁核心规则 |
| using-superpowers（1% 规则） | ace:align 的 Red Flags 表 | 拦截合理化思维 |
| brainstorming（HARD-GATE） | ace:align 的 `<HARD-GATE>` 标签 | 结构性屏障 |
| writing-plans（bite-sized tasks） | aspec tasks 质量标准 | 声明式而非过程式 |
| subagent-driven-development | ace:parallel + review prompts | 并行 + 双阶段 review |
| verification-before-completion | ace:verify（Iron Law） | 独立验证 skill |
| finishing-a-development-branch | 暂不引入（ACE 无 worktree 依赖） | 用户 git 流程自行管理 |
| REQUIRED SUB-SKILL 标记 | 编排层中使用相同标记 | 链式强制 |
| Terminal state 声明 | 公共 skill 完成后返回调用者 | 自然边界 |

---

## 七、风险评估

| 风险 | 可能性 | 影响 | 缓解 |
|------|--------|------|------|
| 公共层加载增加 token | 中 | 低 | 每个公共 skill <150 行；按需加载不预加载 |
| skill 切换中断执行流 | 低 | 中 | REQUIRED SUB-SKILL 是语义标记，不强制上下文切换 |
| aspec OpenSpec 兼容性 | 极低 | 高 | 所有改动在 config.yaml 注入层，不触及 schema |
| 重构期间两套并存 | 中 | 低 | Phase 1-2 一天内完成，过渡期极短 |
| 公共层过度抽象 | 低 | 中 | 只抽取明确重复 >80% 的模块 |

---

## 八、成功标准

| 指标 | 当前基线 | 目标 | 验证方式 |
|------|---------|------|---------|
| 对齐步骤遵循率 | ~70% | >95% | 5 个任务 transcript 审查 |
| 验证步骤执行率 | ~60% | >90% | 完成声明前有验证命令输出 |
| 代码重复率 | 两处各实现 | 单一公共层 | Grep 对齐四要素出现次数 |
| 单 skill 行数 | 264 行（auto-goal） | <100 行 | wc -l |
| Token 总预算 | ~6,000 | ~4,800 | 估算 |

---

## 九、总结

### 核心公式

```
ACE v2 = (aspec ∩ auto-goal) 提取为公共层
       + aspec 保留 Spec 特有逻辑（门禁 + 产出标准 + 知识体系）
       + auto-goal 保留目标执行特有逻辑（复杂度适配 + 状态 + 恢复）
       + Superpowers 的强制机制（HARD-GATE + REQUIRED SUB-SKILL + Red Flags + Iron Law）
```

### 一句话定位

| 组件 | 一句话 |
|------|--------|
| **ace:align** | 确保 AI 理解正确再动手 |
| **ace:verify** | 确保 AI 做对了再说完成 |
| **ace:evolve** | 确保做完了的经验不丢失 |
| **ace:parallel** | 确保独立工作不串行浪费 |
| **auto-goal** | 编排复杂目标的自主执行 |
| **aspec** | 编排规范驱动的结构化开发 |
| **coding** | 执行具体的代码变更 |

### 哲学

> **公共层做"模型不会自发做的事"（对齐、验证、进化）。**
> **编排层做"场景特有的决策路由"（auto-goal 路由目标、aspec 路由 Spec 阶段）。**
> **两者通过 REQUIRED SUB-SKILL 形成刚性链接，不可绕过。**

---

*报告完成。建议从 Phase 1（创建 4 个公共层 skill）开始，一天内可完成。*
