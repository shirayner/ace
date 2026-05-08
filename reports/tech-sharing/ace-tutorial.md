# Ace — AI Coding Environment 完全指南

> 本文档是技术分享的配套教程，供感兴趣的同学深入阅读。
>
> 项目地址：`npm install -g @shirayner/ace`

---

## 目录

1. [Harness Engineering 是什么](#1-harness-engineering-是什么)
2. [Ace 概览](#2-ace-概览)
3. [快速开始](#3-快速开始)
4. [五层架构详解](#4-五层架构详解)
5. [auto-goal：复杂任务自主完成](#5-auto-goal复杂任务自主完成)
6. [coding：代码域认知协议](#6-coding代码域认知协议)
7. [aspec：规范驱动开发](#7-aspec规范驱动开发)
8. [进阶：自定义与扩展](#8-进阶自定义与扩展)
9. [参考资料](#9-参考资料)

---

## 1. Harness Engineering 是什么

### 1.1 范式演进

AI 辅助编程经历了三代范式：

| 阶段 | 时间 | 核心关注 | 做法 |
|------|------|---------|------|
| **Prompt Engineering** | 2020-2023 | 单次交互的措辞 | "请用简洁方式回答..." |
| **Context Engineering** | 2024-2025 | 模型看到的全部信息 | System prompt + RAG + 历史管理 |
| **Harness Engineering** | 2025-2026 | Agent 的完整运行时系统 | 环境 + 约束 + 反馈循环 + 记忆 + 工具链 |

三者是包含关系：Harness Engineering ⊃ Context Engineering ⊃ Prompt Engineering。

### 1.2 核心定义

> **Harness Engineering**：设计环境、约束、反馈循环和基础设施，使 AI Agent 在规模化场景下可靠运行的工程学科。
>
> 核心理念：当 AI Agent 犯了一个错误，**改进环境**让它永远不再犯同类错误——而不是仅仅改进 prompt。

核心公式：

```
Agent 表现 = 模型能力 × Harness 质量

Harness = 模型之外的一切
       = 上下文组装 + 工具链 + 反馈循环 + 约束系统 + 记忆层级
```

### 1.3 Guides vs Sensors

这是 Harness Engineering 的核心分类框架（来自 Martin Fowler 技术博客，Birgitta Boeckeler 提出）：

| 类型 | 性质 | 保证强度 | 比喻 | 示例 |
|------|------|---------|------|------|
| **Guides（前馈/指导）** | 概率性遵守 | ~95% | 路标 | CLAUDE.md、Rules、Skills、Memory |
| **Sensors（反馈/检测）** | 确定性执行 | 100% | 围栏 | Hooks、CI/CD、Linter、编译器 |

**关键洞察**：生产级 Agent 的基本架构模式是——**确定性系统（Sensors）包裹概率性系统（Guides/LLM）**。

### 1.4 定量证据

| 指标 | 仅优化模型 | 仅优化 Harness | 两者结合 |
|------|-----------|---------------|---------|
| Terminal Bench 2.0 得分 | +3-5% | +14% | +18-20% |
| 工程师投入 | 数月 | 1-2 小时 | 数月 |
| 可迁移性 | 模型特定 | 跨模型复用 | 部分复用 |

LangChain 仅修改 Harness 架构，在 Terminal Bench 2.0 上从 52.8% → 66.5%，Top 30 → Top 5。

### 1.5 谁提出的

| 里程碑 | 来源 | 时间 |
|--------|------|------|
| "Effective harnesses for long-running agents" | Anthropic | 2025-11 |
| "My AI Adoption Journey" | Mitchell Hashimoto (HashiCorp) | 2026-02-05 |
| "Harness engineering: leveraging Codex" | OpenAI | 2026-02-11 |
| Guides and Sensors 分类框架 | Birgitta Boeckeler / Martin Fowler | 2026-04 |

---

## 2. Ace 概览

### 2.1 定位

Ace 是一个**一键部署的 Claude Code Harness Engineering 方案**。

```
Ace = Guides (Rules + Skills + Memory)
   + Sensors (Hooks + Hookify)
   + 认知科学 + 软件工程
   + 一键部署
```

### 2.2 解决什么问题

| 问题 | 根因 | Ace 的解法 |
|------|------|-----------|
| AI 思考深度波动 | 缺乏元认知 | `thinking` 规则 — 六字原则 |
| 代码质量不一致 | 无持久标准 | `clean-code` + `code-quality` 规则 |
| 复杂任务迷失 | 工作记忆有限 | `auto-goal` skill — 状态外化 |
| 没有安全护栏 | 缺乏防护 | Hookify — 7 个运行时守卫 |
| 需求理解偏差 | 跳过澄清 | aspec — 双重门禁 |

### 2.3 组成一览

| 组件 | 数量 | 功能 |
|------|------|------|
| 认知规则 (Rules) | 8 条 | 始终加载的行为标准 |
| 智能技能 (Skills) | 4 个 | 复杂任务的结构化认知协议 |
| 安全守卫 (Hookify) | 7 个 | 运行时危险操作拦截 |
| 角色钩子 (Hooks) | 按角色 | 编译/类型检查自动化 |
| 记忆模板 (Memory) | 4 类 | 跨会话知识持久化 |
| 规范工作流 (aspec) | 3 文件 | 需求-设计-实现可追溯 |

---

## 3. 快速开始

### 3.1 安装

```bash
# 全局安装
npm install -g @shirayner/ace

# 初始化（交互式）
ace init
```

安装过程会引导你选择：
- **Preset**：`full`（全部组件）/ `safe`（无 shell hooks）/ `minimal`（仅核心）
- **Role**：`backend` / `frontend` / `client` / `fullstack`

### 3.2 验证安装

```bash
# 检查健康状态
ace doctor

# 查看已安装组件
ace list
```

### 3.3 卸载

```bash
# 完全卸载，恢复原状
ace uninstall
```

### 3.4 非侵入设计

Ace 绝不会覆盖你的已有配置：
- **CLAUDE.md**：使用 `<!-- ace:managed:start/end -->` 标记管理自有内容
- **settings.json**：深度合并，用户配置优先
- **命名空间隔离**：所有文件用 `ace` 前缀（`rules/ace/`、`hooks/ace.*`）

---

## 4. 五层架构详解

```
┌─── Layer 5: Skills（智能技能层）──── Guides ── 复杂任务的认知协议
├─── Layer 4: Rules（认知规则层）──── Guides ── 始终加载的行为标准
├─── Layer 3: Memory（记忆层）─────── Guides ── 跨会话的知识持久化
├─── Layer 2: Hooks（角色钩子层）──── Sensors ─ 编译/类型检查自动化
└─── Layer 1: Hookify（安全层）────── Sensors ─ 运行时危险操作拦截
```

### 4.1 Layer 1: Hookify（安全层）

7 个运行时守卫，提供三层防护：

| 层级 | 守卫 | 作用 |
|------|------|------|
| 命令拦截 | block-dangerous-ops | 拦截 `rm -rf`、`DROP TABLE` 等 |
| 命令拦截 | dangerous-commands | 拦截 `sudo`、`dd`、`mkfs` 等 |
| 命令警告 | safe-git-commands | 警告 `force push`、`reset --hard` |
| 文件保护 | protect-secrets | 警告编辑 `.env`、密钥文件 |
| 文件保护 | sensitive-data | 检测硬编码 API_KEY/SECRET |
| 质量门禁 | code-quality-gate | 保存代码文件时自检清单 |
| 流程验证 | require-verification | 交付前验证提醒 |

### 4.2 Layer 2: Hooks（角色钩子层）

基于角色的自动化检查脚本：

| Hook | 触发条件 | 功能 |
|------|---------|------|
| ace.java-compile-check.sh | 修改 .java 文件后 | 增量编译检查（Maven/Gradle） |

**特点**：静默成功（不干扰正常工作）、失败时报错（提供编译错误信息）。

### 4.3 Layer 3: Memory（记忆层）

三层记忆架构：

```
工作记忆（上下文窗口）
  └── 当前对话 + Rules + 激活的 Skill
短期记忆（Session）
  └── .tasks/{task-id}/state.md — 任务状态
长期记忆（Cross-Session）
  └── ~/.claude/memory/ — 开发者画像、反馈、项目上下文
```

四种记忆类型：

| 类型 | 内容 | 保存时机 |
|------|------|---------|
| **user** | 角色、偏好、技能 | 了解用户信息时 |
| **feedback** | 行为纠正/确认 | 用户纠正或确认时 |
| **project** | 决策、架构、进展 | 项目里程碑时 |
| **reference** | 外部资源链接 | 发现有用资源时 |

### 4.4 Layer 4: Rules（认知规则层）

8 条规则通过 `CLAUDE.md` 的 `@` 引用自动加载：

| 规则 | 核心内容 | Harness 作用 |
|------|---------|-------------|
| **thinking** | 六字原则：序验深广辨简 | 元认知——何时深想、何时快做 |
| **clean-code** | 6 原则 + 反模式表 + 优先级 | 代码质量底线 |
| **code-quality** | 函数/命名/结构/SOLID 清单 | 细节质量标准 |
| **context-hygiene** | 压缩保护 + 状态外化策略 | 对抗上下文丢失 |
| **memory-policy** | 严格准入：跨会话复用 + 不可推导 | 记忆质量控制 |
| **task-recovery** | 恢复流程：搜索 → 读取 → 路由 | 中断恢复能力 |
| **reporting** | 自动触发报告 Skill | 输出格式规范 |
| **interactive-clarify** | 批量提问 + 选项呈现 | 减少打断 |

### 4.5 Layer 5: Skills（智能技能层）

4 个 Skill 的渐进式加载模型：

```
Metadata (~100 tokens)  ← 始终在上下文（用于触发匹配）
Trigger (~50 tokens)    ← 始终在上下文（触发判断）
Cognitive (SKILL.md)    ← 触发时加载（核心协议）
Resource (references/)  ← 按需加载（深度参考）
```

| Skill | 触发场景 | 核心机制 |
|-------|---------|---------|
| **auto-goal** | 复杂目标/学习研究 | 三条硬规则 + 生成式原则 + 经验进化 |
| **coding** | 代码实现/测试/审查 | 意图路由 + OODA 循环 + 复杂度适配 |
| **skill-creator** | 创建新 Skill | 生命周期管理 + Eval + Benchmark |
| **skill-optimize** | 优化现有 Skill | 七条优化原则 + 四维诊断 |

---

## 5. auto-goal：复杂任务自主完成

### 5.1 核心信念

> **对齐优先于效率**。准确完成用户真正想要的，胜过高效完成 AI 以为的。

### 5.2 三条硬规则

#### 规则 1：首轮对齐（不可跳过）

```
Step 1: 初步分析（探索 + 上下文）
Step 2: 澄清（AskUserQuestion 批量提问）
Step 3: 对齐确认
  → 我的理解
  → 计划方向
  → 关键假设
  → 完成标准（可测试）
  → 用户确认后才开始执行
```

#### 规则 2：替用户做选择时必须暂停

判断标准（Surprise Test）：
> "如果用户此刻看到我的决策会惊讶 → 暂停询问。"

触发条件：
- 多个方案各有取舍
- 依赖用户偏好
- 范围超出原始描述
- 不可逆操作
- 用自己的理解填补空白

#### 规则 3：长任务外化状态

预估超过 10 步 → 创建分层状态文件：

```
.tasks/auto-goal-{id}/
├── state.md       # Tier 1：核心索引（≤40 行，始终加载）
├── context.md     # Tier 2：环境上下文（按需加载）
├── decisions.md   # Tier 2：决策日志（按需加载）
└── reflections.md # Tier 2：反思日志（按需加载）
```

### 5.3 五条生成式原则

| # | 原则 | 含义 |
|---|------|------|
| 1 | 先定义完成，再开始执行 | 可测试的完成标准优先 |
| 2 | 承诺当前计划，卡住时换方向 | 三次失败质疑前提 |
| 3 | 永不空手而归 | 任意时刻中断都有可用产出 |
| 4 | 上下文是稀缺资源 | 隔离/压缩/外化 |
| 5 | 对齐不是一次性事件 | 发现偏差时回到对齐 |

### 5.4 经验进化系统

**结构性规则**：经验进化是交付的前置条件——不写 `experience.md`，不交付结果。

```
每次任务完成后：
  1. 提取经验 → experience.md（反直觉的、踩坑才知道的）
  2. 更新 state.md Phase Final
  3. 交付结果

下次任务启动时：
  → 读取 experience.md
  → 主动应用："基于经验 E3，建议..."
  → 标记验证结果：✓有效 / ✗无效

经验累计 3+ 次有效 → 提议提升到全局 memory
条目 >20 → 合并相似、淘汰无效
```

---

## 6. coding：代码域认知协议

### 6.1 核心洞察

> 代码变更即假设检验；编译和测试是天然证伪器；版本控制提供安全回退。

### 6.2 意图路由

| 意图 | 信号 | 加载参考 | 交付物 |
|------|------|---------|--------|
| **实现** | 功能开发、bug 修复、重构 | implement-guide.md | 可编译运行的代码 |
| **测试** | 生成/修复单元测试 | unit-test-guide.md | 通过的测试 + 覆盖率 |
| **审查** | Review、检查质量 | code-review-guide.md | 分级审查报告 |

### 6.3 复杂度适配

| 层级 | 判据 | 执行方式 |
|------|------|---------|
| **轻量** | 单文件、位置明确 | Read → Edit → 验证 |
| **标准** | 多文件、边界清晰 | Plan Mode → 探索 → 规划 → 确认 → 执行 |
| **深度** | 跨系统、需分阶段 | 创建 .tasks/ → 分 Phase → 每阶段验证 |

升级信号：验证失败、影响超预期、依赖复杂。
降级信号：进展顺利、不确定性收敛。

### 6.4 代码域 OODA 循环

```
Sense ─→ Orient ─→ Decide ─→ Act ─→ Observe ─→ Adapt
  │         │         │        │        │          │
  │         │         │        │        │          └─ 失败分类:
  │         │         │        │        │             理解偏差/知识不足/
  │         │         │        │        │             规划缺陷/执行错误/环境变化
  │         │         │        │        │             三次失败 → 熔断换策略
  │         │         │        │        │
  │         │         │        │        └─ 编译 = 第一道证伪
  │         │         │        │           测试 = 第二道证伪
  │         │         │        │           意外成功也要分析
  │         │         │        │
  │         │         │        └─ 每次变更是一个假设
  │         │         │           原子变更，改一步验一步
  │         │         │           核心路径优先
  │         │         │
  │         │         └─ 方案评估（不可逆变更 → 生成备选）
  │         │            验证策略选择:
  │         │            微验证/标准验证/深度验证
  │         │
  │         └─ 域判断 (Cynefin):
  │            Clear → 识别即行动
  │            Complicated → 探索后规划
  │            Complex → 小步试探
  │            Chaotic → 先止血再诊断
  │
  └─ 读代码前先建假设
     识别上下游依赖
     弱信号：废弃 API、异常命名、过深嵌套
     大范围探索 → sub-agent
```

### 6.5 上下文工程

| 策略 | 何时使用 | 做法 |
|------|---------|------|
| **隔离** | 不确定找什么/跨多文件/结果量大 | Agent(subagent_type: "Explore") |
| **压缩** | Phase 完成后 | 保留：改了什么、关键决策、验证结果 |
| **外化** | 深度任务 | .tasks/coding-{slug}/state.md |
| **按需加载** | 意图确定后 | 才加载对应 reference 文件 |

---

## 7. aspec：规范驱动开发

### 7.1 核心问题

> 跳过澄清 = AI 基于假设实现 = 高概率返工

### 7.2 三命令工作流

```
/opsx:proposal  ──→  /opsx:apply  ──→  /opsx:archive
  创建提案              代码实现            归档复盘
```

### 7.3 双重门禁

#### 门禁 1：需求澄清（6 维度）

| 维度 | 关注点 |
|------|--------|
| 功能完整性 | 核心功能是否说清 |
| 数据关注 | 来源、格式、量级 |
| 用户体验 | 交互方式、反馈 |
| 边界/异常 | 极端情况处理 |
| 集成依赖 | 外部系统交互 |
| 优先级/范围 | MVP vs 完整版 |

#### 门禁 2：设计澄清（7 维度）

| 维度 | 关注点 |
|------|--------|
| 架构决策 | 分层、模式、组件 |
| 技术选型 | 框架、库、工具 |
| 接口设计 | API 格式、入参出参 |
| 数据/状态 | 数据结构、状态管理 |
| 安全/合规 | 认证、授权、隐私 |
| 性能/可靠性 | 并发、缓存、降级 |
| 部署/运维 | 环境、配置、监控 |

#### 门禁流程

```
分析不确定性 → 写入 issues/*.md → 批量提问 → 对齐确认 → 通过后进入下一步
```

**不可跳过**：不满足门禁条件就不能生成下一个制品。

### 7.4 寄生模式

aspec 不修改 OpenSpec schema，通过 `config.yaml` 的 context/rules 字段注入：
- `PRE` 规则：进入阶段前加载经验
- `GATE` 规则：定义通过条件
- `POST` 规则：阶段完成后提取知识

### 7.5 经验进化

每次 `/opsx:apply` 完成后强制触发：

| 经验类型 | 内容 |
|---------|------|
| 技术决策 (ADR) | 选了什么、为什么、排除了哪些 |
| 领域词汇 | 项目专有术语定义 |
| 风险地图 | 代码"地雷区"标记 |
| 复盘记录 | 澄清命中率、流程经验 |

循环：提取 → 存储 → 主动应用 → 验证 → 收敛

---

## 8. 进阶：自定义与扩展

### 8.1 自定义 Rules

```bash
mkdir -p ~/.claude/rules/custom
echo "# 团队代码规范" > ~/.claude/rules/custom/team-style.md
```

在 `~/.claude/CLAUDE.md` 中添加 `@` 引用即可加载。

### 8.2 自定义 Skills

使用 `skill-creator` 创建：
```
给 Claude Code 输入：帮我创建一个 xxx skill
→ skill-creator 自动引导完成 interview → draft → test → eval
```

### 8.3 团队共享

Rules 和 Skills 可以通过 Git 仓库共享给团队：
1. 将自定义规则放入项目的 `.claude/rules/` 目录
2. 团队成员 clone 后自动生效

### 8.4 角色定制

| 角色 | 额外获得 |
|------|---------|
| backend | Java 编译检查 Hook |
| frontend | TypeScript 类型检查 Hook |
| client | Kotlin 编译检查 Hook |
| fullstack | 上述所有 |

---

## 9. 参考资料

### Harness Engineering 核心文献

| 资料 | 作者 | 时间 | 要点 |
|------|------|------|------|
| Effective harnesses for long-running agents | Anthropic | 2025-11 | 奠基文章 |
| My AI Adoption Journey | Mitchell Hashimoto | 2026-02 | 首次正式定义 |
| Harness engineering: leveraging Codex | OpenAI | 2026-02 | 机构级验证 |
| Guides and Sensors | Boeckeler / Martin Fowler | 2026-04 | 分类框架 |
| Awesome CC Harness 完全指南 | wanlanglin | 2026 | Claude Code Harness 源码级分析 |

### Ace 内部文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 架构详解 | `docs/architecture/index.md` | 五层架构 + 组件交互 |
| 理论基础 | `docs/theory/index.md` | 跨学科理论映射 |
| 快速开始 | `docs/getting-started/index.md` | 5 分钟上手 |
| CLI 参考 | `docs/reference/cli.md` | 命令详解 |

### 跨学科理论

| 学科 | 理论 | Ace 应用 |
|------|------|---------|
| 认知科学 | 元认知 | thinking 规则 |
| 认知科学 | 认知负荷理论 | 渐进式披露 |
| 认知科学 | 延展心灵 | 状态外化 |
| 控制论 | OODA 循环 | coding skill |
| 控制论 | 必要多样性 | 复杂度适配 |
| 软件工程 | Clean Code / SOLID | Rules 层 |
| 决策科学 | 有限理性 | aspec 门禁 |

---

## 附录：Harness Engineering 七大原则 × Ace 实践

| # | 原则 | 来源 | Ace 实践 |
|---|------|------|---------|
| 1 | 最小充分上下文 | 信息论 (SNR) | 渐进式加载（4 层模型） |
| 2 | 分层反馈循环 | 控制论 | Hookify → Hooks → 经验进化 |
| 3 | 认知分块 | 认知科学 | Sub-agent 隔离 + 状态外化 |
| 4 | 高杠杆干预 | 系统论 | 改范式（Rules）> 调参数（prompt） |
| 5 | 延展而非限制 | 心灵哲学 | 赋能工具（Skills）> 限制规则 |
| 6 | 渐进式自主 | 教育心理学 | 三层复杂度适配 |
| 7 | 确定性包裹概率性 | 控制论 | Sensors 包裹 Guides |
