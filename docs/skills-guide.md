# Skill 使用手册

## 分类总览

| 分类           | 名称                 | 触发命令                      | 一句话用途                                                        |
| -------------- | -------------------- | ----------------------------- | ----------------------------------------------------------------- |
| 万能通用       | auto-goal            | `/ace:auto-goal`            | 自主完成开放式目标或学习需求                                      |
| 万能通用       | auto-goal-v2         | `/ace:auto-goal-v2`         | 证据驱动的目标控制器，确定性终态判定                              |
| 需求分析       | requirement-analysis | `/ace:requirement-analysis` | 需求分析流水线                                                    |
| 核心编码流水线 | spec-coding          | `/ace:spec-coding`          | Spec 驱动开发，交互友好、Spec生命周期管理、并行化、隔离化、配置化 |
| 核心编码流水线 | spechub-coding       | `/ace:spechub-coding`       | 对接 SpecHub 平台，本地接力开发产物的本地编码                     |
| 质量保障       | code-review          | `/ace:code-review`          | 代码审查，发现 bug 和潜在问题                                     |
| 质量保障       | ut                   | `/ace:ut`                   | 单元测试生成与修复                                                |
| 质量保障       | verify               | `/ace:verify`               | 横切验证门控，确保变更真正生效                                    |
| 知识与分析     | init                 | `/ace:init`                 | 初始化项目技术画像                                                |
| 知识与分析     | llm-wiki-generator   | `/ace:llm-wiki-generator`   | 为仓库生成 LLM-friendly 知识库                                    |
| 知识与分析     | llm-wiki-reader      | `/ace:llm-wiki-reader`      | 渐进式消费 wiki 知识库                                            |
| 元工具         | skill-creator        | `/ace:skill-creator`        | 创建新 skill                                                      |
| 元工具         | skill-optimize       | `/ace:skill-optimize`       | 深度优化现有 skill                                                |

---

## 一、核心编码流水线

### auto-goal

- **定位**：自主目标编排——处理开放式目标和学习需求
- **触发命令**：`/ace:auto-goal`
- **触发场景**：用户描述期望结果而非具体代码变更；涉及调研/规划/多步执行的目标
- **核心流程**：首轮对齐（MANDATORY） → 状态初始化 → 任务分解 → 并行执行 → 验证 → 经验进化
- **关键特性**：
  - 首轮对齐硬门禁不可跳过
  - 强制并行：≥3 独立任务必须并行
  - 惊讶测试：决策会让用户惊讶时暂停
- **典型场景**："重构这个模块的错误处理"、"调研 X 方案的可行性"、"帮我理解这个系统"

---

### auto-goal-v2

- **定位**：证据驱动的目标控制器——与 auto-goal V1 并存，V1 任务不迁移
- **触发命令**：`/ace:auto-goal-v2`
- **核心流程**：对齐目标差量 → 规划可验证短步 → clean-context worker 执行 → 独立验证 → 由判据台账推导确定性终态（DONE/PARTIAL/BLOCKED/UNVERIFIABLE）
- **关键特性**：
  - 终态由判据台账推导，不由 Agent 自述
  - 主 Agent 只读 ≤2 KiB checkpoint 与 ≤1 KiB envelope，worker 原文只落盘
  - 零新增第三方依赖，运行时依赖内聚在 `plugin/skills/auto-goal-v2/`
- **典型场景**：需要可核验完成度的多步目标

---

### spec-coding

- **定位**：全生命周期规范驱动编码
- **触发命令**：`/ace:spec-coding`
- **触发场景**：从零开始做一个功能/变更（需 openspec/ 目录）
- **前置条件**：项目中已有 `openspec/` 目录（由 OpenSpec CLI 初始化）
- **6 Phase 流转**：
  1. **Understand** — 深度需求分析 + 用户对齐
  2. **Propose** — 创建提案 + delta spec
  3. **Design** — 技术设计（代码库深入探索 + Pattern Grounding）
  4. **Plan** — 原子化实现任务规划
  5. **Apply** — 代码实施（可调用 subagent-execute）
  6. **Archive** — 复盘 + 知识固化 + spec 归档
- **门禁机制**：G1-G4 每个关键节点需用户确认才能推进
- **典型场景**："新增用户积分功能"、"重构订单状态机"

---

### spechub-coding

- **定位**：基于 SpecHub 平台产物的本地编码
- **触发命令**：`/ace:spechub-coding`
- **触发场景**：用户提供 requirementId 或从 SpecHub inbox 选择需求
- **与 spec-coding 的区别**：产物来源不同——spechub-coding 从平台拉取已有技术方案，本地做质量把关和代码实现
- **7 Phase 流转**：Comprehend → Pull → Readiness → Design → Implement → Verify → Archive
- **典型场景**："实现 REQ-12345 的需求"

---

### subagent-execute

- **定位**：子代理驱动执行引擎
- **触发命令**：`/ace:subagent-execute`
- **触发场景**：已有 tasks.md / 计划文件，需要逐任务执行
- **核心流程**：逐任务派遣隔离子代理 → 规范合规审查 → 代码质量审查
- **与 spec-coding 的关系**：可作为 spec-coding Phase 5 Apply 的执行后端
- **典型场景**：有明确的实现计划后批量执行

---

## 二、质量保障

### code-review

- **定位**：代码审查
- **触发命令**：`/ace:code-review`
- **触发场景**："review"、"审查"、"检查代码"、"找问题"、"看看有没有 bug"
- **能力层次**：正确性分析 → 设计评估 → 风格审查
- **产出**：结构化审查报告，标注严重程度
- **典型场景**："审查一下这个 PR"、"帮我检查这段代码"

---

### ut

- **定位**：单元测试生成/修复
- **触发命令**：`/ace:ut`
- **两种模式**：
  - **批量模式**：独立调用，为指定范围生成测试
  - **增量模式**：作为 implement 内嵌步骤
- **覆盖率目标**：行覆盖 ≥80%、分支覆盖 ≥70%
- **典型场景**："为 UserService 写单元测试"

---

### verify

- **定位**：横切验证门控
- **触发命令**：`/ace:verify`
- **核心理念**：无新鲜验证证据不可声称通过
- **5 步 Gate Function**：确认验证手段 → 执行 → 采集证据 → 判定 → 标记
- **被调用方**：auto-goal、spec-coding、spechub-coding 在完成声明前自动调用
- **典型场景**：验证 PR 是否真正修复了问题

---

## 三、知识与分析

### init

- **定位**：项目技术画像初始化
- **触发命令**：`/ace:init`
- **触发场景**："初始化项目画像"、"分析项目架构"、首次使用 ACE 编码类 skill
- **产出**：`.ace/project-profile.md`（项目系统定位/架构分层/中间件使用/编码约定）
- **后续影响**：所有编码类 skill 读取此画像作为项目上下文
- **典型场景**：clone 新项目后第一件事

---

### requirement-analysis

- **定位**：需求分析流水线
- **触发命令**：`/ace:requirement-analysis`
- **流程**：原始需求 → PRD → 代码锚点分析
- **产出**：`prd.md` + `requirement-anchors-analysis.md`
- **典型场景**：拿到模糊需求，需要梳理清楚再开始编码

---

### llm-wiki-generator

- **定位**：为仓库生成 LLM-friendly 知识库
- **触发命令**：`/ace:llm-wiki-generator`
- **产出**：`.ace/wiki/` 目录（`_meta.yml` + `INDEX.md` + `SUMMARY.md` + `anchors/`）
- **锚点类型**：api / component / job / mq / page
- **典型场景**：大型仓库首次使用 ACE，让 AI 快速了解业务

---

### llm-wiki-reader

- **定位**：渐进式消费 wiki 知识库
- **触发命令**：`/ace:llm-wiki-reader`
- **三层加载策略**：SUMMARY（概览） → INDEX（地图） → anchors（详情）
- **典型场景**：skill 内部自动调用，按需加载项目知识

---

## 四、元工具

### skill-creator

- **定位**：创建新 skill
- **触发命令**：`/ace:skill-creator`
- **流程**：需求分析 → Draft → Eval（独立评估代理评分） → Iterate → Description 优化
- **典型场景**："我需要一个自动生成 API 文档的 skill"

---

### skill-optimize

- **定位**：深度优化现有 skill
- **触发命令**：`/ace:skill-optimize`
- **7 条优化原则**：基于认知科学/信息论/控制论
- **典型场景**："优化一下 auto-goal 这个 skill"

---

### parallel-dispatch

- **定位**：并行代理调度
- **触发命令**：`/ace:parallel-dispatch`
- **适用**：2+ 个独立探索/调研任务
- **铁律**：Apply 阶段（代码修改）禁止并行
- **典型场景**："同时调研 3 个技术方案"

---

## Skill 选择决策树

```
用户请求
 ├─ 描述目标/学习 → auto-goal
 ├─ 目标需可核验完成度 → auto-goal-v2
 ├─ 从零做功能（有 openspec/）→ spec-coding
 ├─ 有 requirementId → spechub-coding
 ├─ 有 tasks.md → subagent-execute
 ├─ "review/审查" → code-review
 ├─ "写测试" → ut
 ├─ "验证" → verify
 ├─ "初始化/分析架构" → init
 ├─ "需求分析" → requirement-analysis
 ├─ "生成 wiki" → llm-wiki-generator
 ├─ "创建 skill" → skill-creator
 ├─ "优化 skill" → skill-optimize
 └─ 并行调研 → parallel-dispatch
```

---

## 常见组合模式

| 场景               | 推荐组合                                      |
| ------------------ | --------------------------------------------- |
| 新项目首次使用     | `init` → `llm-wiki-generator`            |
| 完整功能开发       | `init` → `spec-coding`（内含 verify）    |
| 平台需求落地       | `init` → `spechub-coding`                |
| 模糊需求澄清后开发 | `requirement-analysis` → `spec-coding`   |
| 批量任务执行       | `spec-coding`(Plan) → `subagent-execute` |
| 开发后质量检查     | `code-review` → `ut` → `verify`       |
| 技术调研           | `auto-goal` + `parallel-dispatch`         |
