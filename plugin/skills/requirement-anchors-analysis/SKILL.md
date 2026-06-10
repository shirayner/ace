---
name: requirement-anchors-analysis
description: |
  将原始需求拆分为代码锚点分析。识别需要变更的入口（API/MQ/Job/Page），
  逐个入口产出业务语言/伪代码级逻辑变更描述和关键依赖清单。
  产物供 spec-coding、auto-goal 等编码 Skill 消费。

  触发条件：
  - "分析这个需求" / "需求拆分" / "代码锚点分析"
  - "这个需求要改哪些入口" / "影响范围分析"
  - "需求锚点分析" / "anchor analysis"
  - spec-coding/auto-goal 检测到无产物时自动调用

  DO NOT TRIGGER:
  单文件 bug 修复（→ 直接 Edit）；纯技术重构（→ auto-goal）；
  已有 requirement-issues.md 仅做需求澄清（→ 直接编码 Skill 接力）；
  产物 requirement-anchors-analysis.md 已存在且用户未要求重建。
---

# Requirement Anchors Analysis — 需求代码锚点分析

核心信念：**需求到代码的映射需要系统化分析而非直觉猜测。先用业务语义筛选候选入口，再用代码确认变更点，最终产物是编码 Skill 的结构化输入。**

---

## 前置检查

1. 检查 `.ace/changes/{{需求名}}/requirement-anchors-analysis.md` 是否存在
   - **存在** → 告知用户"产物已存在"，AskUserQuestion 确认：复用 / 重新分析
   - **不存在** → 继续流程

2. 检查 `.ace/wiki/SUMMARY.md` 是否存在
   - **存在** → 标记 `wiki_available = true`，后续走 wiki 优先路径
   - **不存在** → 标记 `wiki_available = false`，回退代码关键词搜索兜底

---

## 执行流程

```
P1 输入获取 → P2 需求理解 → P2.5 需求澄清 → P3 锚点初筛 → P4 锚点确认 → P5 深度分析 → P6 生成报告
```

### 交互规范

所有 AskUserQuestion 调用遵循以下规则：
- 每轮 ≤4 个问题
- 每个问题给推荐选项
- 多选问题明确标注 `multiSelect: true`

---

### Phase 1: 输入获取

**目标**：识别需求来源，确定需求名，创建目录结构。

#### 1.1 识别来源

| 输入形式 | 处理方式 |
|----------|---------|
| 文件路径 | Read 读取内容 |
| URL | WebFetch 或对应 MCP 工具读取 |
| 对话中的自然语言描述 | 直接提取需求文本 |
| 以上都没有 | AskUserQuestion 反问"请提供需求文档路径/URL/或直接描述需求" |

#### 1.2 确定需求名

- LLM 根据需求内容生成 kebab-case 短名称（≤30字符，如 `blacklist-filter`、`team-convention-init`）
- AskUserQuestion 回显确认：`header: "需求名"`，推荐选项为生成的名称，用户可修改

#### 1.3 创建目录

```
.ace/changes/{{需求名}}/
└── issues/
```

产物路径：
- `.ace/changes/{{需求名}}/requirement-anchors-analysis.md`
- `.ace/changes/{{需求名}}/issues/requirement-issues.md`

---

### Phase 2: 需求理解

**目标**：深度理解需求，识别歧义点。**先想后问，内部思考完成前不调用用户交互。**

#### 2.1 解析需求文本

提取：核心意图、关键实体、约束条件、预期行为变化。

#### 2.2 加载项目上下文

- **wiki 可用时**：读 `.ace/wiki/SUMMARY.md`，获取核心业务流程和领域模型概览
- **wiki 不可用时**：Glob 项目结构，了解技术栈和代码组织

#### 2.3 苏格拉底四追问（内部思考）

- **追问目的**：为什么做？解决什么根本问题？谁受益？
- **追问完整性**：全貌还是冰山一角？关联问题？前置依赖？
- **追问前提**：假设成立吗？更好的问题框架？
- **追问约束**：什么不能动？硬限制？

#### 2.4 识别待澄清问题 + VOI 分级

按两维评估每个问题的严重性：

| 维度 | 高 | 低 |
|------|----|----|
| **假设失败成本** | 错了需回退重做（方向偏移、scope 错判） | 错了后续微调即可（细节偏好、格式） |
| **可推断性** | 代码/文档/上下文无法推断（业务规则、验收标准） | 有明确信号可推断（技术栈约定、现有模式） |

分级结果：

| 级别 | 判定条件 | 处理方式 |
|------|---------|---------|
| 必须澄清 | 假设失败成本高 + 不可推断 | 进入 P2.5 向用户提问 |
| 记录假设 | 假设失败成本低，或可从上下文推断 | AI 做出假设，写入 issues 文档 |

---

### Phase 2.5: 需求澄清

**目标**：解决信息缺口，确定需求。**Hard Gate — 未完成不得进入 P3。**

<HARD-GATE>
P2.5 完成条件：所有"必须澄清"的问题已通过 AskUserQuestion 获得用户回答。
如果澄清过程中发现新问题 → 评估分级 → 继续澄清循环。
</HARD-GATE>

#### 澄清循环

```
LOOP:
  1. 取所有"必须澄清"的问题
  2. AskUserQuestion 向用户提问（≤4问/轮，给推荐选项）
  3. 记录答案
  4. 检查：用户回答是否引发新问题？
     IF 有新问题 → 评估分级 → 回到 1
     IF 无新问题 → 退出循环
```

#### 写入澄清产物

澄清完成后，写入 `.ace/changes/{{需求名}}/issues/requirement-issues.md`。

模板参见 `templates/requirement-issues.md`。

---

### Phase 3: 锚点初筛

**目标**：两级漏斗定位候选入口，产出带置信度的候选清单。

#### 路径 A：wiki 可用

**第一级 — 语义筛选**：

1. 读 `.ace/wiki/SUMMARY.md` → 对比需求概要，按"快速查找"表和"核心业务流程"语义匹配
2. 读 `.ace/wiki/INDEX.md` → 按入口目录逐条读 frontmatter（description、business_scenario、related_business）
3. LLM 判断每个入口的相关性，标记置信度

**第二级 — 入口确认**：

1. 对第一级标记"确认"和"可能"的入口，读取 `.ace/wiki/entries/<type>/<name>.md` 全文
2. 交叉验证：wiki 中描述的业务规则/调用链路是否与需求变更点相关
3. 修正置信度（可能→确认 / 可能→不可能）
4. 丢弃"不可能"

#### 路径 B：wiki 不可用

1. 从需求文本提取关键词（业务概念、实体名、操作名）
2. grep/find 搜索代码仓库中匹配的文件/类/函数
3. LLM 基于搜索结果判断每个命中项是否是入口 + 相关性 + 置信度
4. 丢弃"不可能"

#### 产出

候选入口列表（每个附带：入口名、类型、置信度、变更概要、关联原因）。

---

### Phase 4: 锚点确认

**目标**：用户确认变更范围。**Hard Gate — 未确认不得进入 P5。**

<HARD-GATE>
必须通过 AskUserQuestion 获得用户对入口清单的确认。
</HARD-GATE>

1. 展示候选入口表格（入口、类型、置信度、一句话变更概要）
2. AskUserQuestion — `multiSelect: true`：
   - 列出每个候选入口（含置信度标记）作为选项
   - 用户选择"确认变更"的入口
   - 用户可通过 Other 补充遗漏入口
3. 处理：
   - 用户选中的入口 → 进入 P5 深度分析
   - 用户未选的入口 → 丢弃，不写入产物
   - 用户补充的入口 → 加入清单，进入 P5
4. 最终确认清单无入口 → 告知用户"未发现需要变更的入口"，终止流程。

---

### Phase 5: 深度分析

**目标**：对确认入口逐个分析，按产物格式填充完整内容。

对每个确认入口：

1. **读入口 wiki 全文**（如有）— `.ace/wiki/entries/<type>/<name>.md`
2. **读入口源码** — 定位实现函数/类，沿调用链读取关键依赖（2-3层深度）
3. **填充变更分析**：
   - 关联原因：为什么该入口需要改
   - 当前行为：从 wiki + 源码提炼，1-2句业务语言
   - 目标行为：变更后的产品行为，1-2句
   - 逻辑变更（5项，无变更则省略该项）：
     1. 入参变更、2. 出参变更、3. 领域模型变更、4. 业务流程变更、5. 其他规则变更
   - 关键依赖（8类表格，无变更则省略该行）

**注意**：
- 描述使用业务语言或伪代码，不引用行号
- 变更描述聚焦"做什么"，不展开"怎么做"（具体实现留给编码 Skill）
- 如果某个入口分析后发现实际不需要变更 → 在锚点总览中移除

---

### Phase 6: 生成报告

**目标**：写入产物文件 + 校验完整性。

1. 按 `templates/requirement-anchors-analysis.md` 格式组装最终产物
2. 写入 `.ace/changes/{{需求名}}/requirement-anchors-analysis.md`
3. 校验：
   - frontmatter 必填字段：requirement、source、generated_at、wiki_available、total_anchors
   - 锚点总览中入口数 == 入口变更分析章节数
   - 每个入口变更分析含：关联原因、当前行为、目标行为、逻辑变更、关键依赖

---

## 门禁

| Gate | 阶段 | 条件 | 验证方式 |
|------|------|------|---------|
| **G1** | P2.5→P3 | 所有"必须澄清"问题已获用户回答 | requirement-issues.md 已写入 + 无未决"必须澄清"问题 |
| **G2** | P4→P5 | 用户已确认入口清单 | AskUserQuestion 已调用且用户已选择 |
| **G3** | P6 完成后 | 产物通过校验 | frontmatter 必填 + 入口数一致 |

---

## 跳过条件

**全部满足**时跳过整个 Skill，直接返回已有产物：

- `.ace/changes/{{需求名}}/requirement-anchors-analysis.md` 已存在
- 用户确认"复用"（非"重新分析"）

仅 `requirement-issues.md` 已存在 → 仍需执行完整流程（澄清已有记录可加速 P2.5）。

---

## 产物模板

### requirement-anchors-analysis.md

参见 `templates/requirement-anchors-analysis.md`。

### requirement-issues.md

参见 `templates/requirement-issues.md`。

---

## 与其他 Skill 的关系

| Skill | 关系 | 说明 |
|-------|------|------|
| `llm-wiki-generator` | 上游依赖 | wiki 知识库提供入口目录和业务上下文 |
| `llm-wiki-reader` | 协议复用 | 渐进式加载 wiki 的协议 |
| `spec-coding` | 下游消费 | Phase 1 检测产物→存在则直接消费，不存在则调用本 Skill |
| `auto-goal` | 下游消费 | 需求型目标检测产物→不存在则调用本 Skill |
| `spechub-coding` | 下游消费 | 同上，平台产物驱动时可跳过本 Skill 直接进入编码 |
