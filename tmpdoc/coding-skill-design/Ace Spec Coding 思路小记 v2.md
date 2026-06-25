# Ace Spec Coding 能力清单 v2

> 基于 Superpowers / OpenSpec / ECC 三库深度分析，提炼出 Spec Coding 所需的核心能力体系。
> 原则：**能力 = 确保 AI 高质量交付代码的必要条件**

---

## 一、通用能力层（Spec Coding 的地基）

| # | 能力 | 核心作用 | 主要参考 |
|---|------|---------|---------|
| G1 | 深度思考 & 苏格拉底式澄清 | 确保理解正确，方向不偏 | Superpowers brainstorming |
| G2 | SubAgent 执行引擎 | Controller-Worker 隔离，每任务新鲜上下文 | Superpowers subagent-driven |
| G3 | 并行调度 | 独立任务并发，缩短交付时间 | Superpowers parallel-dispatch |
| G4 | 澄清对齐 + HARD-GATE | 未审批禁止实现，防方向性错误 | Superpowers + ACE 既有 |
| G5 | 经验进化（Instinct 模型） | 原子模式提取 → 置信度评分 → 自动 Skill 生成 | ECC continuous-learning-v2 |
| G6 | 上下文管理 | context-budget + strategic-compact + 逻辑断点压缩 | ECC context 三件套 |
| G7 | 防合理化系统 | Red Flags Table + Rationalization Table，堵住 AI 绕过规则的借口 | Superpowers anti-rationalization |

---

## 二、Spec 生命周期层（做对的事）

| # | 能力 | 核心作用 | 主要参考 |
|---|------|---------|---------|
| S1 | Artifact DAG 依赖引擎 | 产物间拓扑排序，文件存在即完成，零额外状态存储 | OpenSpec artifact-graph |
| S2 | Schema 驱动的制品定义 | YAML 定义产物类型/依赖/模板/指令，项目可定制 | OpenSpec schema system |
| S3 | Delta Spec 增量变更 | ADDED/MODIFIED/REMOVED/RENAMED，面向存量系统 | OpenSpec delta-spec |
| S4 | Instruction Generation（四层分离） | template(结构) + instruction(指导) + context(背景) + rules(约束) | OpenSpec instruction-gen |
| S5 | Spec 验证器 | 结构校验(Zod) + 语义规则(SHALL/MUST) + 场景覆盖检查 | OpenSpec verify |
| S6 | 三维验证模型 | Completeness / Correctness / Coherence | OpenSpec verify |
| S7 | Archive 归档 & 合并 | Delta 合并到主 spec，变更归档保留审计轨迹 | OpenSpec archive |
| S8 | Fluid Iteration | 无阶段锁，随时回去改任何制品 | OpenSpec philosophy |

---

## 三、需求理解层（知道要做什么）

| # | 能力 | 核心作用 | 主要参考 |
|---|------|---------|---------|
| R1 | 范围检测 + 复杂度分级 | trivial/small/standard/large 四级，自动决定走轻/全流程 | ECC size-classifier |
| R2 | 边界约束 + Out-of-Scope 声明 | 明确不做什么，防范围蔓延 | Superpowers brainstorming |
| R3 | 子项目分解机制 | 大需求拆为独立可交付的子变更 | OpenSpec change model |
| R4 | 多输入源适配 | 对话/Spec 文档/代码库探索/外部平台产物 | 综合 |

---

## 四、技术设计层（知道怎么做）

| # | 能力 | 核心作用 | 主要参考 |
|---|------|---------|---------|
| D1 | Pattern Grounding（模式锚定） | 编码前搜索代码库约定(Naming/Error/Logging/Data/Test)，禁止发明模式 | ECC pattern-grounding |
| D2 | 设计制品模板（强制结构） | 方案概述/技术选型/API 契约/数据结构/测试策略/实现顺序 | OpenSpec design template |
| D3 | No Placeholder 原则 | 计划中禁止 TBD/模糊描述，每步必须有完整可执行内容 | Superpowers writing-plans |
| D4 | 任务粒度控制 | 2-5 分钟/任务，含精确文件路径+完整代码+验证命令 | Superpowers writing-plans |
| D5 | Model Selection 策略 | 机械实现→cheap / 集成判断→standard / 架构审查→capable | Superpowers model-selection |

---

## 五、编码执行层（做得好）

| # | 能力 | 核心作用 | 主要参考 |
|---|------|---------|---------|
| E1 | TDD 铁律 | RED→GREEN→REFACTOR，无失败测试则无代码 | Superpowers TDD |
| E2 | GateGuard 事实强制 | 写代码前强制查看 importers/schema/spec，改变认知状态 | ECC gateguard |
| E3 | Git Worktree 隔离 | 每变更独立环境，并行实现不冲突 | Superpowers worktree |
| E4 | 实时验证（PostToolUse） | 每次文件编辑后自动 format + typecheck | ECC quality-gate hook |
| E5 | 结构化状态报告 | DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED | Superpowers subagent |

---

## 六、质量门控层（确保交付质量）

| # | 能力 | 核心作用 | 主要参考 |
|---|------|---------|---------|
| Q1 | 两阶段审查 | Spec Compliance Review（做对事）→ Code Quality Review（做好事） | Superpowers two-phase review |
| Q2 | Verification Gate | 完成声明前必须贴实际命令输出，Evidence over Claims | Superpowers verification |
| Q3 | 6 级验证循环 | Build→Type→Lint→Test→Security→Diff | ECC verification-loop |
| Q4 | Pre-Report Gate（4 问检验） | 报告 finding 前：有行号？有失败模式？看过上下文？严重度可辩护？ | ECC code-reviewer |
| Q5 | 置信度过滤 | >80% 才报告，零 finding 是合法结果 | ECC code-reviewer |
| Q6 | 根因调试协议 | 4 阶段单假设验证，3 次失败质疑架构，禁猜测式修复 | Superpowers debugging |

---

## 七、编排层（流程可控）

| # | 能力 | 核心作用 | 主要参考 |
|---|------|---------|---------|
| O1 | 门控流水线 | Research→Plan→[GATE]→Implement→Review→[GATE]→Commit | ECC orch-pipeline |
| O2 | 复杂度自适应 | Size Classifier 驱动弹性流程，trivial 跳过设计直接 TDD | ECC size-classifier |
| O3 | 状态机 + 持久化 | 每阶段有明确 Gate Function，state.md 中断恢复 | 综合 |
| O4 | Controller-Worker 上下文隔离 | 主代理只编排，每任务新鲜 Agent 执行 | Superpowers subagent |
| O5 | Iterative Retrieval | 子代理上下文获取循环：Dispatch→Evaluate→Refine→Loop (≤3轮) | ECC iterative-retrieval |

---

## 三库能力来源汇总

| 来源 | 贡献的核心维度 | 关键能力项 |
|------|-------------|-----------|
| **Superpowers** | 方法论 + 质量文化 | 防合理化、TDD 铁律、No Placeholder、两阶段审查、Evidence over Claims |
| **OpenSpec** | Spec 格式 + 生命周期引擎 | Artifact DAG、Delta Spec、Schema 驱动、四层 Instruction、三维验证 |
| **ECC** | 工程基础设施 + 自适应 | GateGuard、Size Classifier、Pattern Grounding、Instinct 学习、门控流水线 |

---

## 优先级分层

### P0 — 最小可交付核心
G4(HARD-GATE) + S1(DAG) + S3(Delta Spec) + D1(Pattern Grounding) + E1(TDD) + Q1(两阶段审查) + Q2(Verification Gate) + O1(门控流水线)

### P1 — 质量放大器
G7(防合理化) + R1(复杂度分级) + D3(No Placeholder) + E2(GateGuard) + Q3(6级验证) + O2(复杂度自适应) + O4(Controller-Worker)

### P2 — 长期价值
G5(Instinct 学习) + G6(上下文管理) + S8(Fluid Iteration) + E3(Worktree 隔离) + O5(Iterative Retrieval)

---

*v2 生成时间：2026/06/10*
*分析来源：superpowers / OpenSpec / ECC 深度探索*
