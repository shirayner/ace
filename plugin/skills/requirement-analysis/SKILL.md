---
name: requirement-analysis
description: |
  完整的需求分析流水线：原始需求 → 用户故事PRD → 代码锚点分析。
  两阶段产出两个产物（prd.md + requirement-anchors-analysis.md），
  供 spec-coding、auto-goal 等编码 Skill 消费。

  触发条件：
  - "分析这个需求" / "需求拆分" / "需求分析"
  - "这个需求要改哪些入口" / "影响范围分析"
  - "需求锚点分析" / "anchor analysis" / "requirement analysis"
  - spec-coding/auto-goal 检测到产物缺失时自动调用

  DO NOT TRIGGER:
  单文件 bug 修复（→ 直接 Edit）；纯技术重构（→ auto-goal）；
  产物 prd.md + requirement-anchors-analysis.md 均已存在且用户未要求重建。
---

# Requirement Analysis — 需求分析流水线

核心信念：**先结构化需求（PRD），再映射到代码锚点。两个阶段独立产出、顺序依赖，产物可追溯。**

---

## 前置检查

1. 检查产物状态：

| prd.md | requirement-anchors-analysis.md | 行为 |
|--------|-------------------------------|------|
| 不存在 | 不存在 | 完整执行 Phase A → Phase B |
| 存在 | 不存在 | 跳过 Phase A，从 Phase B 开始 |
| 存在 | 存在 | 告知用户"产物均已存在"，确认：复用 / 重新分析 |

2. 检查 `.ace/wiki/SUMMARY.md` 是否存在
   - **存在** → 标记 `wiki_available = true`
   - **不存在** → 标记 `wiki_available = false`，代码关键词搜索兜底

---

## 执行流程

```
Phase A: 需求结构化
  A.1 输入获取 → A.2 场景理解 → A.3 需求澄清 → A.4 故事拆分 → A.5 PRD确认 → A.6 写入prd.md

Phase B: 代码锚点分析 (自动衔接)
  B.1 加载PRD → B.2 锚点初筛 → B.3 锚点确认 → B.4 深度分析 → B.5 生成报告
```

### 交互规范

所有 AskUserQuestion 调用遵循以下规则：
- 每轮 ≤4 个问题
- 每个问题给推荐选项
- 多选问题明确标注 `multiSelect: true`

---

# Phase A: 需求结构化

原始需求 → 澄清 → 用户故事 → PRD

## A.1 输入获取

**目标**：识别需求来源，确定需求名，创建目录结构。

### 识别来源

| 输入形式 | 处理方式 |
|----------|---------|
| 文件路径 | Read 读取内容 |
| URL | WebFetch 或对应 MCP 工具读取 |
| 对话中的自然语言描述 | 直接提取需求文本 |
| 以上都没有 | AskUserQuestion 反问"请提供需求文档路径/URL/或直接描述需求" |

### 确定需求名

- LLM 根据需求内容生成 kebab-case 短名称（≤30 字符，如 `blacklist-filter`、`team-convention-init`）
- AskUserQuestion 回显确认：`header: "需求名"`，推荐选项为生成的名称，用户可修改

### 创建目录

```
.ace/changes/{{需求名}}/
└── issues/
```

产物路径：
- `.ace/changes/{{需求名}}/prd.md`
- `.ace/changes/{{需求名}}/requirement-anchors-analysis.md`
- `.ace/changes/{{需求名}}/issues/requirement-issues.md`

---

## A.2 场景理解

**目标**：理解需求全貌，提取角色和场景。**先想后问，内部思考完成前不调用用户交互。**

### 解析需求文本

提取：核心意图、关键实体、约束条件、涉及的用户角色、预期结果。

### 加载项目上下文

- **wiki 可用时**：读 `.ace/wiki/SUMMARY.md`，获取核心业务流程和领域模型概览
- **wiki 不可用时**：Glob 项目结构，了解技术栈和代码组织

### 苏格拉底四追问（内部思考）

- **追问目的**：为什么做？解决什么根本问题？谁受益？
- **追问完整性**：全貌还是冰山一角？关联问题？前置依赖？
- **追问前提**：假设成立吗？更好的问题框架？
- **追问约束**：什么不能动？硬限制？

### 识别待澄清问题 + VOI 分级

按两维评估每个问题的严重性：

| 维度 | 高 | 低 |
|------|----|----|
| **假设失败成本** | 错了需回退重做（方向偏移、scope 错判） | 错了后续微调即可（细节偏好、格式） |
| **可推断性** | 代码/文档/上下文无法推断（业务规则、验收标准） | 有明确信号可推断（技术栈约定、现有模式） |

分级结果：

| 级别 | 判定条件 | 处理方式 |
|------|---------|---------|
| 必须澄清 | 假设失败成本高 + 不可推断 | 进入 A.3 向用户提问 |
| 记录假设 | 假设失败成本低，或可从上下文推断 | AI 做出假设，写入 issues 文档 |

---

## A.3 需求澄清

**目标**：解决信息缺口，确定需求。**Hard Gate — 未完成不得进入 A.4。**

<HARD-GATE>
A.3 完成条件：所有"必须澄清"的问题已通过 AskUserQuestion 获得用户回答。
如果澄清过程中发现新问题 → 评估分级 → 继续澄清循环。
</HARD-GATE>

### 澄清循环

```
LOOP:
  1. 取所有"必须澄清"的问题
  2. AskUserQuestion 向用户提问（≤4问/轮，给推荐选项）
  3. 记录答案
  4. 检查：用户回答是否引发新问题？
     IF 有新问题 → 评估分级 → 回到 1
     IF 无新问题 → 退出循环
```

### 写入澄清产物

澄清完成后，写入 `.ace/changes/{{需求名}}/issues/requirement-issues.md`。

模板参见 `templates/requirement-issues.md`。

---

## A.4 故事拆分

**目标**：将确定的需求拆分为独立可验收的用户故事。

### 拆分原则

- 每个故事从单一用户角色视角出发
- 每个故事可独立验收（有自己的 Given/When/Then）
- 故事之间尽可能独立，减少依赖
- 规模适中：一个故事对应一组内聚的业务规则

### 拆分步骤

1. 列出所有用户角色及其关注点
2. 按角色梳理场景，每个场景一个故事
3. 编写验收条件（Given/When/Then）和业务规则
4. 标注优先级（P0 必须有 / P1 应该有 / P2 锦上添花）

### 产出

结构化的用户故事列表（US-1, US-2, ...），每个包含：
- 角色、功能描述、业务价值
- 验收条件（Given/When/Then）
- 业务规则
- 优先级

---

## A.5 PRD 确认

**目标**：用户确认 PRD。**Hard Gate — 未确认不得进入 Phase B。**

<HARD-GATE>
必须通过 AskUserQuestion 获得用户对 PRD 的确认。
拒绝 → 回到 A.3 或 A.4 修正。
</HARD-GATE>

### 展示 PRD

以结构化文本展示完整 PRD（用户角色表 + 用户故事列表 + 范围边界）。

### 对齐审批

AskUserQuestion（审批模式）：
- `header: "PRD确认"`
- 选项："通过" / "拒绝"
- 用户选 Other = 有补充的通过

处理逻辑：
- 通过 → 进入 A.6
- 拒绝 → 询问拒绝原因，回到 A.3 或 A.4 修正
- Other → 读取补充内容，更新对应故事

---

## A.6 写入 prd.md

按 `templates/prd.md` 格式写入 `.ace/changes/{{需求名}}/prd.md`。

**自动衔接 Phase B**，无需用户再次触发。

---

# Phase B: 代码锚点分析

PRD 用户故事 → wiki 漏斗 → 代码确认 → 变更分析

## B.1 加载 PRD

1. 读 `.ace/changes/{{需求名}}/prd.md`
2. 提取所有用户故事：标题、验收条件、业务规则
3. 读 `issues/requirement-issues.md`（如有），复用已有澄清结论
4. 业务层面的歧义已在 Phase A 解决，本阶段只关注技术实现疑点

---

## B.2 锚点初筛（逐故事）

**目标**：对每个用户故事，两级漏斗定位关联入口，最后合并去重。

### 路径 A：wiki 可用

对每个用户故事执行：

**第一级 — 语义筛选**：
1. 读 `.ace/wiki/SUMMARY.md` → 对比故事验收条件，按"快速查找"表和"核心业务流程"语义匹配
2. 读 `.ace/wiki/INDEX.md` → 按入口目录逐条读 frontmatter（description、business_scenario、related_business）
3. LLM 判断每个入口与该故事的相关性

**第二级 — 入口确认**：
1. 对相关性高的入口，读取 `.ace/wiki/entries/<type>/<name>.md` 全文
2. 交叉验证：wiki 中描述的调用链路/业务规则是否与故事变更点相关
3. 确认该入口是否需要变更

### 路径 B：wiki 不可用

1. 从故事标题 + 验收条件提取关键词
2. grep/find 搜索代码仓库
3. LLM 判断命中项是否入口 + 相关性

### 合并

所有故事分析完后，合并去重，建立映射：`{入口 → [覆盖的故事列表]}`。

### 产出

候选入口列表（每个附带：入口名、类型、覆盖故事列表、变更概要）。

---

## B.3 锚点确认

**目标**：用户确认变更范围。**Hard Gate — 未确认不得进入 B.4。**

<HARD-GATE>
必须通过 AskUserQuestion 获得用户对入口清单的确认。
</HARD-GATE>

1. 展示候选入口表格：**入口 / 类型 / 覆盖故事 / 变更概要**
2. AskUserQuestion — `multiSelect: true`：
   - 列出每个候选入口作为选项
   - 用户选择"确认变更"的入口
   - 用户可通过 Other 补充遗漏入口
3. 处理：
   - 用户选中的入口 → 进入 B.4 深度分析
   - 用户未选的入口 → 丢弃
   - 用户补充的入口 → 加入清单，进入 B.4
4. 最终确认清单无入口 → 告知用户"未发现需要变更的入口"，终止流程。

---

## B.4 深度分析

**目标**：对确认入口逐个分析，按产物格式填充完整内容。

对每个确认入口：

1. **读入口 wiki 全文**（如有）— `.ace/wiki/entries/<type>/<name>.md`
2. **读入口源码** — 定位实现函数/类，沿调用链读取关键依赖（2-3 层深度）
3. **填充变更分析**：
   - 覆盖故事：该入口关联的用户故事编号
   - 关联原因：为什么该入口需要改
   - 当前行为：从 wiki + 源码提炼，1-2 句业务语言
   - 目标行为：变更后的产品行为，1-2 句
   - 逻辑变更（5 项，无变更则省略该项）：
     1. 入参变更、2. 出参变更、3. 领域模型变更、4. 业务流程变更、5. 其他规则变更
   - 关键依赖（8 类表格，无变更则省略该行）

**注意**：
- 描述使用业务语言或伪代码，不引用行号
- 变更描述聚焦"做什么"，不展开"怎么做"（具体实现留给编码 Skill）
- 如果某个入口分析后发现实际不需要变更 → 在锚点总览中移除

---

## B.5 生成报告

**目标**：写入产物文件 + 校验完整性。

1. 按 `templates/requirement-anchors-analysis.md` 格式组装最终产物
2. 写入 `.ace/changes/{{需求名}}/requirement-anchors-analysis.md`
3. 校验：
   - frontmatter 必填字段：requirement、source、generated_at、wiki_available、total_anchors
   - 锚点总览中入口数 == 入口变更分析章节数
   - 每个入口变更分析含：覆盖故事、关联原因、当前行为、目标行为、逻辑变更、关键依赖

---

## 门禁

| Gate | 阶段 | 条件 | 验证方式 |
|------|------|------|---------|
| **G1** | A.3→A.4 | 所有"必须澄清"问题已获用户回答 | requirement-issues.md 已写入 + 无未决问题 |
| **G2** | A.5→A.6 | 用户已确认 PRD | AskUserQuestion 已调用且用户选择通过 |
| **G3** | B.3→B.4 | 用户已确认入口清单 | AskUserQuestion 已调用且用户已选择 |
| **G4** | B.5 完成后 | 产物通过校验 | frontmatter 必填 + 入口数一致 |

---

## 跳过条件

| prd.md | requirement-anchors-analysis.md | 行为 |
|--------|-------------------------------|------|
| 不存在 | 不存在 | 完整执行 A→B |
| 存在 | 不存在 | 跳过 A，从 B 开始 |
| 存在 | 存在 | 告知产物均已存在，确认复用/重新分析 |

仅 `requirement-issues.md` 已存在 → 澄清已有记录可加速 A.3，仍需执行完整流程。

---

## 产物模板

| 模板文件 | 用途 | 阶段 |
|----------|------|------|
| `templates/prd.md` | PRD 产出格式 | A.6 |
| `templates/requirement-anchors-analysis.md` | 代码锚点分析产出格式 | B.5 |
| `templates/requirement-issues.md` | 需求澄清记录格式 | A.3 / B.1 |

---

## 与其他 Skill 的关系

| Skill | 关系 | 说明 |
|-------|------|------|
| `llm-wiki-generator` | 上游依赖 | wiki 知识库提供入口目录和业务上下文 |
| `llm-wiki-reader` | 协议复用 | 渐进式加载 wiki 的协议 |
| `spec-coding` | 下游消费 | 检测 prd.md + requirement-anchors-analysis.md → 存在则直接消费，不存在则调用本 Skill 生成 |
| `auto-goal` | 下游消费 | 需求型目标检测产物→不存在则调用本 Skill |
| `spechub-coding` | 下游消费 | 平台产物驱动时可跳过本 Skill 直接进入编码 |
