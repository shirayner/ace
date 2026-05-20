# ACE Skill 架构优化方案 v3：Shared 知识库模式

> 日期：2026-05-20
> 分支：feat/skill_split_v3
> 前置：v1（Superpowers 对比）+ v2（统一架构）+ shared 架构实践
> 核心决策：**弃用 skill 链式调用，改用 shared 知识库 + skill 内联引用**

---

## 一、设计哲学：为什么不用 skill 互调

### 1.1 链式调用的实践问题

v2 方案提出了 `REQUIRED SUB-SKILL: Use ace:align` 模式——skill A 执行到某步后强制调用 skill B。实践中暴露三个根因性问题：

| 问题 | 根因 | 表现 |
|------|------|------|
| **上下文漂移** | skill 切换时，模型的 attention 重心从当前任务转移到"寻找并加载 skill"的元操作 | 切换后丢失当前进度、重复已做工作 |
| **Routing 不稳定** | Claude 的 skill routing 本质是基于 description 的模式匹配，在链式场景下触发错 skill 的概率叠加 | 偶尔触发错误 skill 或完全跳过 |
| **状态断裂** | 每个 skill 是独立 prompt 加载，skill B 不自动继承 skill A 的执行上下文 | 子 skill 需要重新理解场景，增加 token 消耗和时延 |

### 1.2 Shared 模式的核心公式

```
skill = 编排器（workflow + routing + 门禁）
shared = 知识库（可复用的协议、规范、模板）
references = 深度参考（skill 特有的详细指南）
```

**引用方式**：skill 内用 `Read shared/xxx.md` 加载知识到当前上下文中执行。知识在 skill 内展开，不触发 skill 切换。

**关键区别**：
- 链式调用 = 控制流转移（你去执行这个流程）
- shared 引用 = 知识注入（把这个知识加载到我这里来，我来执行）

### 1.3 设计原则

1. **skill 不要互相调用** — 每个 skill 是独立编排器
2. **skill 尽量短**（200-800 行最佳）— 超过后 routing 变差、attention 下降
3. **shared 才是长期知识库** — 维护一次，多处引用
4. **一个编排器 skill > 多碎 skill** — 但拆分基于"不同触发场景"而非"不同步骤"

---

## 二、重复内容识别与抽取方案

### 2.1 逐段对照表

| 能力模块 | auto-goal 中的位置 | aspec config.yaml 中的位置 | coding 中的位置 | 重复度 | 抽取建议 |
|----------|-------------------|--------------------------|----------------|--------|---------|
| **苏格拉底四追问** | 规则 1 Step 1（10 行） | context "深度认知方法论"（8 行） | 无 | **100%** | → `shared/alignment-protocol.md` |
| **引导性提问原则** | 规则 1 Step 2（8 行） | context "引导性提问"（5 行） | 无 | **90%** | → `shared/alignment-protocol.md` |
| **对齐确认四要素** | 规则 1 Step 3（15 行） | context "对齐确认四要素"（15 行） | 无 | **100%** | → `shared/alignment-protocol.md` |
| **惊讶测试** | 规则 2（7 行） | context "元规则" 惊讶测试（2 行） | 无 | **100%** | → `shared/alignment-protocol.md` |
| **验证闭环** | "执行后自检"（6 行） | 无显式 | OODA Observe 段（7 行） | **70%** | → `shared/verification-protocol.md` |
| **经验进化** | "经验进化"段（20 行） | rules tasks 收尾（10 行） | 无 | **80%** | → `shared/experience-protocol.md` |
| **并行执行** | "并行执行"段（20 行） | context "并行探索策略"（10 行） | 无 | **60%** | → `shared/parallel-protocol.md` |
| **上下文纪律** | "上下文纪律"表（8 行） | 无 | "上下文工程"段（20 行） | **50%** | → `shared/context-discipline.md` |
| **状态文件模板** | references/state-template.md | 无 | "外化"段的 state.md 结构（20 行） | **40%** | → `shared/state-template.md`（合并） |
| **恢复协议** | references/recovery.md + "恢复协议"段 | 无 | "恢复协议"段（4 行） | **60%** | → `shared/recovery-protocol.md` |
| **反合理化 Red Flags** | 规则 0 解释（5 行） | 无 | 无 | 单点 | → `shared/alignment-protocol.md`（附 Red Flags 表） |
| **OODA 循环** | 无 | 无 | "代码域 OODA 循环"（50 行） | 单点 | 保留在 coding-specific references |
| **维度深度提问** | 无 | 引用 dimensions.md | 无 | aspec 独有 | 保留在 templates/openspec/ |
| **Spec 质量标准** | 无 | context "Spec 质量标准" | 无 | aspec 独有 | 保留在 aspec config |

### 2.2 抽取后的 Token 预算估算

| 组件 | 当前 token（估） | 抽取后 token（估） | 变化 |
|------|-----------------|-------------------|------|
| auto-goal SKILL.md | ~3,500 | ~1,800 | -49% |
| aspec config.yaml | ~2,500 | ~1,500 | -40% |
| coding SKILL.md（拆分前） | ~3,200 | 拆为 ut ~800 + review ~800 | N/A |
| **shared/ 总量** | 0 | ~2,000 | 新增 |
| **系统总量（单 skill 加载时）** | ~3,500 | ~1,800 + 按需 Read ~600 = ~2,400 | -31% |

关键优势：shared 文件是**按需加载**的，不是预加载。如果某个执行路径不需要对齐（延续性任务），则不加载 alignment-protocol.md。

---

## 三、Shared 目录结构设计

### 3.1 推荐结构

```
plugin/
├── skills/
│   ├── auto-goal/
│   │   ├── SKILL.md                    ← 编排器（瘦身后）
│   │   └── references/
│   │       ├── state-template.md       ← auto-goal 特有的状态管理
│   │       └── recovery.md             ← 恢复协议详细流程
│   ├── ut/
│   │   ├── SKILL.md                    ← 单元测试编排器
│   │   └── references/
│   │       └── unit-test-guide.md      ← 框架适配、mock 陷阱
│   ├── code-review/
│   │   ├── SKILL.md                    ← 代码审查编排器
│   │   └── references/
│   │       ├── code-review-guide.md    ← 三层分析框架
│   │       └── code-smells.md          ← Bug/坏味道清单
│   ├── skill-creator/
│   │   └── ...（不变）
│   └── skill-optimize/
│       └── ...（不变）
│
├── shared/                              ← 公共知识库（核心新增）
│   ├── alignment-protocol.md           ← 对齐协议（苏格拉底+澄清+确认+Red Flags）
│   ├── verification-protocol.md        ← 验证 Iron Law
│   ├── experience-protocol.md          ← 经验进化流程
│   ├── parallel-protocol.md            ← 并行调度规则和模板
│   ├── context-discipline.md           ← 上下文卫生（隔离/压缩/外化）
│   └── state-template.md              ← 通用状态文件模板
│
└── templates/
    └── openspec/                        ← aspec 专用（不变）
        ├── config.yaml
        ├── dimensions.md
        └── experience-template.md
```

### 3.2 各 shared 文件职责

#### `shared/alignment-protocol.md`

**职责**：统一的"确保 AI 理解正确再动手"协议。被 auto-goal 和 aspec 引用。

**内容概要**（~120 行）：
```markdown
# 对齐协议

## 三步流程

### Step 1: 深度分析（内部推理）
四追问：目的 / 完整性 / 前提 / 约束
输入源由调用方上下文决定：
- auto-goal：memory、CLAUDE.md、git status
- aspec proposal：dimensions.md 需求维度
- aspec design：dimensions.md 设计维度 + ADR

### Step 2: 引导性澄清
设计原则 + 跳过条件 + AskUserQuestion 调用

### Step 3: 对齐确认
四要素格式 + AskUserQuestion 确认

## 惊讶测试
判断规则 + 触发条件列表

## Red Flags 表
11 条合理化拦截
```

**引用方式**（在 auto-goal SKILL.md 中）：
```markdown
### 规则 1：首轮对齐
Read `shared/alignment-protocol.md`，按其流程执行。
输入源：memory、CLAUDE.md、git status、会话历史。
```

#### `shared/verification-protocol.md`

**职责**：统一的"确保做对了再说完成"协议。被所有 skill 在标记完成前引用。

**内容概要**（~50 行）：
```markdown
# 验证 Iron Law

NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

## Gate Function
1. IDENTIFY — 什么能证明？
2. RUN — fresh 执行
3. READ — 检查 exit code + 完整输出
4. VERIFY — YES 携证据完成 / NO 不声称完成

## 验证手段选择
- 代码变更 → 编译 + 测试
- 配置/文档 → 格式检查 + 一致性
- 设计/方案 → 对照完成标准逐条检查

## Red Flags 表
7 条反跳过验证
```

#### `shared/experience-protocol.md`

**职责**：统一的经验进化流程。被 auto-goal 和 aspec archive 引用。

**内容概要**（~40 行）：
```markdown
# 经验进化协议

## 触发条件（满足任一）
- 意外/踩坑/策略转换
- 反直觉技术事实
- 可复用模式

全部不满足 → "无新经验"，跳过。

## 格式
通用（auto-goal）：编号/场景/发现/适用范围
结构化（aspec）：按 experience-template.md

## 应用规则
新任务读取 → 告知用户 → 记录验证结果（✓/✗/—）

## 收敛
>20 → 合并淘汰 | 3+✓ → 提议提升 memory
```

#### `shared/parallel-protocol.md`

**职责**：并行调度判断规则和 prompt 模板。被 auto-goal 和 aspec 引用。

**内容概要**（~50 行）：
```markdown
# 并行调度协议

## 依赖测试
A 结果不影响 B 执行 → 并行。否则 → 串行。

## 约束
- Agent ≤ 8
- 每个 prompt 自包含
- 不修改同一文件
- 单个 response 发出多个 Agent 调用

## Prompt 模板
探索型 / 实现型 / Review 型

## 标注约定
⟂ 可并行 / (depends: X) 串行依赖
```

#### `shared/context-discipline.md`

**职责**：上下文管理的四策略。被 auto-goal 和编码类 skill 引用。

**内容概要**（~30 行）：
```markdown
# 上下文纪律

| 策略 | 时机 | 方法 |
|------|------|------|
| 隔离 | 探索性工作 | sub-agent |
| 压缩 | 大阶段完成 | 只保留决策和结论 |
| 外化 | 重要发现 | 写入状态文件 |
| 预算感知 | 对话过长 | 主动压缩或外化 |

压缩时必须保留：目标、完成标准、关键决策、已修改文件、未完成待办。
```

#### `shared/state-template.md`

**职责**：通用状态文件模板，合并 auto-goal 和 coding 的模板。

---

## 四、指令遵循强度模式

在不依赖 skill 互调的前提下，以下 5 种模式可在**单个 skill 内部**提升模型的流程遵循率。

### 模式 1：HARD-GATE XML 标签

**原理**：XML 标签在 Claude 的训练数据中与"系统级约束"强关联。`<HARD-GATE>` 在 attention 中的权重高于普通 markdown 标题。

**用法**：
```markdown
<HARD-GATE>
此步骤完成前，禁止发出任何修改性工具调用（Edit/Write/Bash 创建文件）。
完成证据 = AskUserQuestion 工具已调用且用户已回复。
没有 AskUserQuestion 调用记录 = 未完成 = 后续操作无效。
</HARD-GATE>
```

**设计要点**：
- GATE 内声明**什么被禁止**（不只是什么必须做）
- 定义**完成的客观证据**（工具调用记录，不是主观判断）
- 声明**违反后果**（后续操作无效——给模型一个"为什么要遵守"的逻辑）

**适用场景**：对齐前禁止执行、验证前禁止声称完成

---

### 模式 2：Red Flags 拦截表

**原理**：模型在合理化跳过时，内部会产生特定思维模式。将这些模式**显式列举并标记为合理化信号**，相当于给模型装了一个"思维防火墙"——检测到自己在想这些时，立即触发"正在跳过"的警报。

**用法**：
```markdown
## Red Flags — 正在跳过 [X]

以下想法 = 正在合理化，**立即停止当前动作**：

| 你的想法 | 真相 |
|---------|------|
| "这个太简单了" | 简单 = 隐含决策被忽略 |
| "用户已经说清楚了" | 说清楚 ≠ 你理解 100% 正确 |
| ... |

**如果你正在想上述任何一条 → 你正在合理化 → 回到 [步骤 N]**
```

**设计要点**：
- 每条 flag 对应一个**具体的**跳过场景（不是通用告诫）
- "真相"列给出**一句话反驳**（模型可以用来说服自己不跳过）
- 表后有明确的**行动指令**（回到哪一步）
- 每个门禁步骤配备自己的 Red Flags 表（对齐 Red Flags、验证 Red Flags）

**适用场景**：每个不可跳过的流程门禁

---

### 模式 3：Terminal State = 工具调用

**原理**：文本输出是模型可以自由发挥的——它可以"写出对齐内容但不实际调用 AskUserQuestion"。将步骤的**完成标志**绑定到**特定工具调用**上，创造了一个不可伪造的检查点。

**用法**：
```markdown
### Step N 的 Terminal State

**Terminal state = AskUserQuestion 工具调用。**

你的 response 必须以 AskUserQuestion 调用结束。
没有 AskUserQuestion 调用的 response = 此步骤未完成。
文本输出是调用的前置准备，不是独立目标。

自检：生成 response 前问自己：这个 response 有 AskUserQuestion 调用吗？
- 有 → 发送
- 没有 → 追加调用
```

**设计要点**：
- 明确声明哪个工具调用是"过关凭证"
- "文本不是目标，工具调用才是目标"——反转模型的默认倾向
- 附带**自检提示**（在生成结束前执行的心理检查）

**适用场景**：对齐确认（AskUserQuestion）、状态创建（Write）、验证执行（Bash）

---

### 模式 4：Pre-execution Checkpoint（双重自问）

**原理**：在执行动作的**最近决策点**放置自检问题。类似飞行员的"起飞前检查清单"——不是在一开始说"记得检查"，而是在即将行动的瞬间强制暂停。

**用法**：
```markdown
### Pre-execution Checkpoint

**在发出第一个修改性工具调用前，回答以下两个问题：**

> ① 对齐协议是否已通过？（证据：AskUserQuestion 已调用且用户回复了确认）
> ② 状态文件是否已创建？（证据：Write 工具已成功）

- **两项均是** → 继续
- **任一为否** → **立即停止**，执行缺失步骤

**此检查点存在的原因**：[解释为什么跳过会导致问题的一句话]
```

**设计要点**：
- 检查项是**是非题**且有**客观证据**（不是主观判断）
- "否"的行动明确（不是"请考虑"，是"立即停止"）
- 附带**理由说明**（让模型理解为什么这不是形式主义）

**适用场景**：auto-goal 的执行入口、aspec 的门禁前

---

### 模式 5：Spirit vs Letter 声明 + 行为绑定

**原理**：模型有时会"遵循规则的精神但跳过形式"——例如"我已经在心里确认了对齐，不需要实际调用 AskUserQuestion"。显式声明"形式就是实质"堵住这条合理化路径。

**用法**：
```markdown
**违反形式 = 违反精神。没有例外。**

对齐的形式（AskUserQuestion 工具调用）就是对齐的实质。
验证的形式（Bash 执行验证命令）就是验证的实质。
"心里已经确认了" = 没有确认。
"之前验证过了" = 没有验证（要 fresh）。
```

**设计要点**：
- 在 skill 的**规则总纲**部分声明（所有具体规则之前）
- 列举 2-3 个**具体的绕过话术**并否定它们
- 每条否定绑定到一个**具体工具调用**（不是抽象原则）

**适用场景**：skill 开头的"元规则"部分

---

### 模式组合建议

对于最关键的门禁（对齐、验证），推荐**三层组合**：

```
1. HARD-GATE（结构性屏障——禁止 + 完成证据）
2. Red Flags 表（心理拦截——检测合理化）
3. Terminal State = 工具调用（行为锚定——不可伪造的检查点）
```

对于次要规则（并行识别、上下文管理），单层即可：
```
1. 明确判据表（if X then Y 格式——减少主观判断空间）
```

---

## 五、Skill 骨架设计

### 5.1 auto-goal（瘦身后）

```markdown
---
name: auto-goal
description: |
  自主完成复杂目标或学习需求。当用户描述期望结果（而非具体代码变更）时触发。
  两类意图：目标达成（需规划/调研/多步执行）；学习研究（系统性学习/调研）。
  DO NOT TRIGGER: 明确代码变更（→ ut / code-review / 直接 Edit）；优化 skill（→ skill-optimize）。
---

# Auto Goal — 自主目标编排

核心信念：对齐优先于效率。

---

## 硬规则

<HARD-GATE>
修改性工具调用前，对齐协议必须通过。
证据 = AskUserQuestion 已调用且用户回复了确认。
无证据 = 禁止 Edit/Write/Bash（创建文件）/ TaskCreate。
</HARD-GATE>

**违反形式 = 违反精神。** "心里确认了" = 没确认。

### 规则 1：首轮对齐

Read `shared/alignment-protocol.md`，按其三步流程执行。
输入源：memory + CLAUDE.md + git status + 会话历史。

### 规则 2：状态初始化

对齐通过后，第一个动作是创建状态文件：
1. `Bash(pwd)` → 获取 $ROOT
2. `mkdir -p $ROOT/.tasks/auto-goal-{id}`
3. TaskCreate 分解任务（≥3 个）
4. Write state.md（Read `shared/state-template.md` 获取模板）

### 规则 3：惊讶测试

用户此刻看到我的决策会惊讶 → 暂停 AskUserQuestion。
（详见 `shared/alignment-protocol.md` 惊讶测试段）

---

## 执行原则

1. 先定义完成，再开始执行
2. 承诺计划，卡住时换方向（三次失败质疑前提）
3. 永不空手而归
4. 上下文是稀缺资源（Read `shared/context-discipline.md`）
5. 对齐不是一次性事件

---

## 并行执行

独立子任务识别后，Read `shared/parallel-protocol.md` 按其规则调度。

---

## 验证与交付

标记 TaskUpdate completed 前：
Read `shared/verification-protocol.md`，按 Gate Function 执行。

## 经验进化

交付后检查触发条件：
Read `shared/experience-protocol.md`，满足条件时执行。

---

## 进度心跳

- 完成 Phase → 一句话报告
- 连续 5+ 工具调用无文本 → 插入说明
- 方向变化 → 立即告知

---

## 恢复协议

用户说"继续"时：Read `references/recovery.md`。

---

## 参考文件索引

| 文件 | 何时加载 |
|------|---------|
| `shared/alignment-protocol.md` | 规则 1 执行时 |
| `shared/verification-protocol.md` | 标记完成前 |
| `shared/experience-protocol.md` | 交付后 |
| `shared/parallel-protocol.md` | 识别并行机会时 |
| `shared/context-discipline.md` | 上下文管理时 |
| `shared/state-template.md` | 创建状态文件时 |
| `references/recovery.md` | 恢复中断任务时 |
```

**行数估算**：~90 行（原 254 行，-65%）

---

### 5.2 ut（单元测试 skill）

```markdown
---
name: ut
description: |
  生成、修复或补充单元测试。用户提到"写测试""补 UT""提升覆盖率""测试失败"时触发。
  DO NOT TRIGGER: 功能开发/bug修复（→ auto-goal 或直接 Edit）；代码审查（→ code-review）。
---

# UT — 单元测试编排

## 执行策略

批量生成 + 统一编译 + 错误修复。不逐个测试方法编写验证。

1. **分析被测类** → 读代码、识别公共方法、确定依赖
2. **框架检测** → 读 pom.xml/build.gradle，确定测试框架（详见 `references/unit-test-guide.md`）
3. **生成完整测试类** → 正常路径 + 异常路径 + 边界条件
4. **编译验证** → `mvn compile -pl {module} -am`
5. **运行修复** → 执行测试，失败则分析修复
6. **覆盖率检查** → 行 ≥80%、分支 ≥70%

---

## 复杂度适配

### 轻量（单类 ≤5 方法）
直接 Read 被测类 → 生成 → 编译 → 运行

### 标准（单类 >5 方法或多依赖）
Read `references/unit-test-guide.md` → 分析依赖注入方式 → 生成 → 验证

### 批量（10+ 类）
创建 `.tasks/ut-{slug}/state.md` → 分批生成 → 每批编译验证

---

## 交付格式

```
被测类: XxxService
测试类: XxxServiceTest
用例数: N (正常M + 异常K + 边界J)
覆盖率: 行 XX% / 分支 XX%
框架: JUnit X + Mockito/PowerMock
验证: mvn test -pl {module} → {N} passed, 0 failed
```

---

## 验证规则

<HARD-GATE>
声称"测试完成"前，必须 fresh 执行：
1. 编译命令 → exit code 0
2. 测试运行命令 → 全部 passed
没有运行 = 没有通过。"应该没问题" = 没有验证。
</HARD-GATE>

---

## 反模式

| 反模式 | 表现 | 解药 |
|--------|------|------|
| mock 过度 | 所有依赖都 mock，测试失去价值 | 只 mock 外部依赖 |
| 假阳性 | 测试通过但逻辑错误 | assert 具体值不是 notNull |
| 框架错配 | JUnit4 写法用 JUnit5 注解 | 先检测框架再生成 |
| 忽略 @Autowired | PowerMock 下未手动注入 | 详见 references |

---

## 深度参考

| 文件 | 内容 |
|------|------|
| `references/unit-test-guide.md` | 框架适配、mock 陷阱、覆盖率策略 |
```

**行数估算**：~80 行

---

### 5.3 code-review（代码审查 skill）

```markdown
---
name: code-review
description: |
  审查代码质量，发现 bug 和潜在问题。用户提到"review""审查""检查代码""找问题"时触发。
  DO NOT TRIGGER: 写代码/修 bug（→ auto-goal 或直接 Edit）；写测试（→ ut）。
---

# Code Review — 代码审查编排

## 执行流程

### 1. 获取变更范围

```bash
# 标准：分支对比
git diff master...HEAD

# 备选：用户提供代码片段或指定文件
```

如果无 diff 可获取 → AskUserQuestion 询问审查范围。

### 2. 三层分析

| 层 | 关注点 | 方法 |
|----|--------|------|
| **正确性** | 逻辑错误、边界、并发 | 数据流 + 控制流分析 |
| **健壮性** | 异常处理、资源释放、输入验证 | 故障注入思维 |
| **设计质量** | 命名、职责、耦合、DRY | Clean Code 原则对照 |

详细分析框架：Read `references/code-review-guide.md`
Bug/坏味道速查：Read `references/code-smells.md`

### 3. 分级输出

按严重度分级报告：

- **Critical** — 可能导致生产事故的 bug 或安全漏洞
- **Warning** — 代码坏味道或潜在风险
- **Suggestion** — 可改进的设计和最佳实践
- **Positive** — 值得肯定的设计和实现

### 4. 格式

每个发现：
```
[级别] file:line — 问题描述
  建议：具体修复方案
```

---

## 复杂度适配

### 轻量（单文件 / <100 行 diff）
直接分析，无需规划

### 标准（多文件 / 100-500 行 diff）
Read references → 分文件分析 → 合并报告

### 深度（>500 行 diff / 架构级变更）
创建 `.tasks/review-{slug}/` → 按模块分批审查（可并行 Agent）

---

## 反模式

| 反模式 | 表现 | 解药 |
|--------|------|------|
| 噪声报告 | 充斥"考虑添加注释"等通用建议 | 只报告该上下文特有的发现 |
| 漏高风险 | 纠结命名忽略并发 bug | 优先级：Critical > Warning > Suggestion |
| 无行号 | "某处有问题" | 精确到文件和行号 |
| 无方案 | 只说问题不给修复建议 | 每个问题附具体修复 |

---

## 深度参考

| 文件 | 内容 |
|------|------|
| `references/code-review-guide.md` | 三层分析框架、报告模板、diff 获取 |
| `references/code-smells.md` | Bug 风险、坏味道、设计问题详细清单 |
```

**行数估算**：~80 行

---

### 5.4 aspec config.yaml（瘦身后）

```yaml
schema: spec-driven
version: 13.0.0
context: |
  ## 语言
  所有交互使用中文。OpenSpec 英文标题保留。

  ## 工作模式
  aspec 寄生于 OpenSpec，通过 context/rules 注入增强。
  核心理念：对齐优先于效率。

  ## 流程
  [需求澄清→对齐] → proposal → specs → [设计澄清→对齐] → design.md → [审批] → tasks → apply → [经验提取] → archive

  ## 门禁（不可跳过）
  | 产物 | 前置条件 |
  |------|----------|
  | proposal | issues/requirement-issues.md 已澄清 + 对齐确认通过 |
  | design.md | issues/design-issues.md 已澄清 + 对齐确认通过 |
  | tasks | 用户审批 design.md |

  ## 对齐协议
  需求澄清和设计澄清均引用 shared/alignment-protocol.md 执行。
  额外输入：Read dimensions.md 获取维度深度提问和盲区表。

  ## 惊讶测试
  替用户做选择时，若用户看到会惊讶 → 暂停展示选项（AskUserQuestion）。

  ## 并行探索
  分析维度 ≥3 个且独立时，引用 shared/parallel-protocol.md 并行探索。

  ## 文件约定
  - 需求问题：issues/requirement-issues.md
  - 设计问题：issues/design-issues.md
  - 实施观察：spec/notes.md
  - 项目经验：experience.md

  ## Spec 质量标准
  - proposal：每个 Capability 有明确边界和可测试验收条件
  - design：每个 High 决策含选择、理由、备选、排除原因
  - tasks：可独立验证，可追溯到 design 决策

rules:
  proposal:
    - |
      [PRE] 需求澄清（三步）：
      1. Read dimensions.md + Read shared/alignment-protocol.md
      2. 内部分析 → 写 issues/requirement-issues.md
      3. 按 alignment-protocol 的 Step 2/3 执行澄清和确认
    - "🚫 GATE: issues 未澄清 + 对齐未通过前，禁止创建 proposal"
    - "[PRE] Read experience.md 需求相关经验，告知用户"

  design:
    - |
      [PRE] 设计澄清（三步）：
      1. Read dimensions.md 设计维度 + Read shared/alignment-protocol.md
      2. 内部分析 → 写 issues/design-issues.md
      3. 按 alignment-protocol 的 Step 2/3 执行澄清和确认
    - "🚫 GATE: issues 未澄清 + 对齐未通过前，禁止创建 design.md"
    - "[PRE] Read experience.md 技术相关经验，告知用户"

  tasks:
    - "[PRE] 展示 design.md 摘要 → AskUserQuestion 获得审批"
    - |
      [CONSTRAINT] tasks.md 末尾含收尾段：
      ## 收尾
      - [ ] 复盘：对照 design.md 检查偏差 → spec/notes.md
      - [ ] 经验提取：Read shared/experience-protocol.md 执行
      - [ ] 归档确认：AskUserQuestion

  apply:
    - "[PRE] 读取 issues/ 下决策文件，遵循所有已澄清决策"
    - "[CONSTRAINT] 偏差记录到 spec/notes.md；重大偏差暂停 re-spec"
    - "[POST] Read shared/verification-protocol.md 验证 Spec-Code 一致性"

  archive: []
```

**行数估算**：~70 行（原 ~150 行，-53%）

---

## 六、引用机制设计

### 6.1 引用语法

在 skill 内使用统一的引用指令格式：

```markdown
Read `shared/alignment-protocol.md`，按其 [段落名] 执行。
```

**设计要点**：
- `Read` 是 Claude Code 原生工具，模型熟悉其语义
- 指定段落名避免加载整个文件（当文件较大时）
- "按其 X 执行"明确是执行而非仅了解

### 6.2 引用时机矩阵

| shared 文件 | auto-goal 引用时机 | aspec 引用时机 | ut 引用时机 | code-review 引用时机 |
|------------|-------------------|---------------|------------|-------------------|
| alignment-protocol.md | 规则 1（首轮对齐） | proposal/design PRE | — | — |
| verification-protocol.md | TaskUpdate completed 前 | apply POST | 声称测试完成前 | — |
| experience-protocol.md | 交付后 | archive / tasks 收尾 | — | — |
| parallel-protocol.md | 识别并行机会时 | 分析维度 ≥3 时 | 批量生成时 | 深度审查时 |
| context-discipline.md | 上下文管理时 | — | — | — |
| state-template.md | 创建状态文件时 | — | 批量任务时 | 深度审查时 |

### 6.3 不引用的 skill

ut 和 code-review 是**轻量 skill**，大部分执行不需要 shared：
- ut：只在"声称完成"时引用 verification-protocol（且是内联化的简版——直接写在 skill 的 HARD-GATE 中）
- code-review：不引用 shared（审查是只读操作，不需要对齐/验证门禁）

这体现了 shared 的按需性——不是每个 skill 都强制引用所有 shared 文件。

---

## 七、与 v2 方案的差异总结

| 维度 | v2（链式调用） | v3（shared 知识库） |
|------|--------------|-------------------|
| **复用机制** | REQUIRED SUB-SKILL 调用独立 skill | Read shared/ 内联引用知识 |
| **控制流** | skill 间跳转（A → B → 返回 A） | 始终在当前 skill 内执行 |
| **上下文** | 每次 skill 切换重新加载 | 知识注入后在原上下文中连续 |
| **稳定性** | 依赖 routing 正确性 | 不依赖 routing（显式 Read） |
| **Token** | 每次 skill 切换有固定开销 | 按需 Read，不需要不加载 |
| **门禁强度** | 依赖"加载不了下一个 skill = 无法继续" | 依赖 HARD-GATE + Red Flags + 工具绑定 |
| **skill 复杂度** | 每个 skill 100 行（但需要 4 个 skill 协作） | 每个 skill 80-100 行（自包含） |
| **失败模式** | routing 错误 → 进入错误 skill → 混乱 | Read 路径写错 → 仅缺失知识 → 降级执行 |

**核心权衡**：v2 的门禁更强（架构级——加载不了就不能继续），但稳定性差。v3 的门禁通过设计模式实现（HARD-GATE + Red Flags），稳定性更高，但需要模型"自觉"遵循。

**v3 的补偿策略**：用第四章的 5 种指令强度模式弥补缺失的"架构级强制"。经验表明，精心设计的指令模式对 Claude 的遵循率可达 90%+，而架构级强制因 routing 不稳定实际执行率可能更低。

---

## 八、实施路线图

### Phase 1：创建 shared/（Day 1）

| 步骤 | 产出 | 工作量 |
|------|------|--------|
| 1.1 | `shared/alignment-protocol.md` | 30min |
| 1.2 | `shared/verification-protocol.md` | 15min |
| 1.3 | `shared/experience-protocol.md` | 15min |
| 1.4 | `shared/parallel-protocol.md` | 15min |
| 1.5 | `shared/context-discipline.md` | 10min |
| 1.6 | `shared/state-template.md`（合并 auto-goal 和 coding 版） | 15min |

### Phase 2：Skill 重构（Day 1-2）

| 步骤 | 产出 | 依赖 |
|------|------|------|
| 2.1 | auto-goal SKILL.md 瘦身 | Phase 1 |
| 2.2 | 创建 ut SKILL.md + 迁移 unit-test-guide.md | Phase 1 |
| 2.3 | 创建 code-review SKILL.md + 迁移 review guides | Phase 1 |
| 2.4 | 删除旧 coding SKILL.md | 2.2 + 2.3 |
| 2.5 | aspec config.yaml v13 瘦身 | Phase 1 |

### Phase 3：验证（Day 2-3）

| 步骤 | 方法 |
|------|------|
| 3.1 | 用 auto-goal 执行一个中等复杂度目标，观察对齐流程 |
| 3.2 | 用 ut 生成一组单元测试，观察验证流程 |
| 3.3 | 用 code-review 审查一个 PR，观察输出质量 |
| 3.4 | 用 aspec 走一个完整 proposal → design 流程 |

---

## 九、风险与缓解

| 风险 | 可能性 | 缓解 |
|------|--------|------|
| 模型忘记 Read shared/ | 中 | skill 内用 HARD-GATE 绑定（"Read alignment-protocol.md 后才能继续"） |
| shared 文件过长被截断 | 低 | 每个 shared 文件控制在 50-120 行 |
| ut/code-review 太轻量缺乏指导 | 低 | 深度逻辑在 references/ 中，skill 只做编排 |
| 失去"实现"意图的编排 | 中 | auto-goal 覆盖复杂实现；简单实现直接 Edit 无需 skill |
| aspec 与 shared 路径不兼容 | 低 | aspec config.yaml 中写相对路径 `shared/`，plugin 结构统一 |

---

## 十、总结

### 核心公式

```
ACE v3 = shared 知识库（对齐 + 验证 + 经验 + 并行 + 上下文 + 状态）
       + 独立编排 skill（auto-goal / ut / code-review / aspec）
       + 指令强度模式（HARD-GATE + Red Flags + Terminal=Tool + Checkpoint + Spirit=Letter）
       + 按需 Read（不预加载、不 skill 互调）
```

### 一句话定位

| 组件 | 定位 |
|------|------|
| **shared/** | 模型不会自发做的事的规范（对齐、验证、进化） |
| **auto-goal** | 复杂目标的自主编排器 |
| **ut** | 单元测试的批量生成器 |
| **code-review** | 代码缺陷的系统发现器 |
| **aspec** | 规范驱动开发的阶段路由器 |
| **references/** | 各 skill 独有的深度知识 |

### 设计哲学

> **skill 是编排器**——决定何时做什么，用 Read 注入知识。
> **shared 是知识库**——存储模型不会自发遵循的协议。
> **指令强度靠设计模式**——HARD-GATE 替代 skill 互调的"架构强制"。
> **每个 skill 自包含**——加载一个 skill 就能完整执行，不依赖外部 skill 配合。

---

*报告完成。建议从 Phase 1（创建 6 个 shared 文件）开始实施。*
