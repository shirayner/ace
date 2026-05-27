# SpecHub-Coding — 三层架构设计方案

> 产出日期：2026-05-27（v2 重构）
> 定位：ACE Claude Code plugin 原生 skill，与 spec-coding 共享通用引擎
> 核心理念：**输入/输出是适配，中间是通用的规范驱动编码引擎。**

---

## 1. 设计目标

### 核心架构变更

从"两个独立 skill 各自定义完整流程"重构为**三层架构**：

```
┌─────────────────────────────────────────────────────────────────────┐
│  适配层 (输入)               通用引擎                适配层 (输出)    │
│                                                                      │
│  ┌────────────────┐    ┌───────────────────────┐    ┌────────────┐  │
│  │ spec-coding:   │    │  shared/spec-engine.md │    │ spec-coding│  │
│  │  用户口述      │───▶│                       │───▶│  (无额外)  │  │
│  └────────────────┘    │  Phase 1: Proposal    │    └────────────┘  │
│                        │  Phase 2: Design      │                     │
│  ┌────────────────┐    │  Phase 3: Apply       │    ┌────────────┐  │
│  │ spechub-coding:│    │  Phase 4: Archive     │    │ spechub:   │  │
│  │  Select+Pull   │───▶│                       │───▶│  Git提交   │  │
│  │  Understand+G0 │    │  + G1-G4 门禁         │    │  SpecHub   │  │
│  └────────────────┘    │  + 澄清质量门槛       │    │  上报      │  │
│                        │  + Playbook 系统       │    └────────────┘  │
│                        │  + 验证闭环            │                     │
│                        └───────────────────────┘                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 设计动机

| 问题 | 旧设计（v1） | 新设计（v2） |
|------|-------------|-------------|
| 代码重复 | spec-coding 和 spechub-coding 90%+ 流程相同，各自完整定义 | 引擎定义一次，两端引用 |
| 维护成本 | 改门禁/澄清逻辑需同步两处 | 改引擎一处即可 |
| 扩展性 | 新增来源需完整 copy | 仅需新写适配层 |
| 概念清晰度 | "区别在哪"不够直观 | 输入→执行→输出，三段式一目了然 |

### 核心收益

1. **DRY**：通用流程只定义一次
2. **清晰**：每层职责边界明确，输入层不关心如何编码，引擎不关心产物从哪来
3. **可扩展**：未来接入新来源（如 Jira、Confluence）只需写新的输入适配层
4. **Playbook 通用化**：spec-coding 场景也能享受 playbook 指导

---

## 2. 三层职责划分

### 2.1 输入适配层

**职责**：获取需求、校验前提、准备上下文、执行适配层专属门禁

| 活动 | spec-coding | spechub-coding |
|------|-------------|----------------|
| 前置检查 | openspec/ 存在 | openspec/ + project-profile.md 存在 |
| 需求获取 | 用户口述（无动作） | Select + Pull（脚本拉取产物） |
| 上下文准备 | 无额外准备 | Understand（深度理解 + footprint 识别） |
| 专属门禁 | 无 | G0（理解确认） |
| 交付给引擎 | 用户需求文本 | 用户需求 + 产物路径 + footprint + profile |

### 2.2 通用引擎（shared/spec-engine.md）

**职责**：规范化编码的完整流程——澄清、生成、实现、归档

- Phase 1 (Proposal)：需求澄清 → G1 → 生成 proposal.md + delta specs
- Phase 2 (Design)：设计澄清 → G2 → 生成 design.md + tasks.md
- Phase 3 (Apply)：G3 → /opsx:apply + 偏离检测
- Phase 4 (Archive)：Spec-Code 验证 → G4 → /opsx:archive

内置能力：
- 门禁系统（G1-G4）
- 澄清质量门槛
- Playbook 系统（按需激活）
- 验证闭环

### 2.3 输出适配层

**职责**：引擎完成后的后处理

| 活动 | spec-coding | spechub-coding |
|------|-------------|----------------|
| 交付自检 | 无 | Handoff Check（diff + 编码约定） |
| 版本控制 | 无（用户自行 commit） | 创建 feature 分支 + commit + push |
| 外部上报 | 无 | SpecHub archiveHandoff 上报 |
| 经验提取 | 引擎内完成 | 引擎内完成 |

---

## 3. 通用引擎设计（shared/spec-engine.md 核心内容）

### 3.1 Context 模型

引擎通过读取前文上下文（适配层已 Read 的信息）来获得运行所需数据。以下是引擎依赖的上下文结构：

```yaml
# 引擎执行前，适配层需确保以下信息已存在于对话上下文中：
EngineContext:
  # 必须
  userRequest: string           # 需求描述（口述 或 产物理解摘要）
  specRoot: path                # openspec/ 目录路径
  changeName: string            # openspec change 名称

  # 可选（有则引擎利用）
  artifacts: path[] | null      # 外部产物文件路径列表（引擎会在澄清/生成时 Read）
  profile: path | null          # 项目画像路径
  footprint:                    # 基础设施足迹
    existing: map[mw → bool]
    newlyRequired: map[mw → bool]
    effective: map[mw → bool]   # 引擎按需激活 playbook
  playbooks: map[mw → path]    # 中间件 → playbook 文件路径
  dimensions: path              # 澄清维度文件路径
  qualityCriteria: path         # 质量标准文件路径
```

**关键设计**：Context 不是"传参"，而是适配层通过 Read 操作让信息进入 LLM 上下文，引擎通过引用这些信息来执行。这是 skill 作为 markdown 指令的本质特征。

### 3.2 注入点（Injection Points）

引擎在关键阶段定义"注入点"——适配层在这些时机提供的额外信息将被引擎使用：

| 注入点 | 时机 | 内容 | spec-coding | spechub-coding |
|--------|------|------|-------------|----------------|
| **澄清背景** | Phase 1/2 澄清开始时 | 额外背景知识 | 无 | 产物内容 + profile 分析 |
| **生成约束** | Phase 1/2 生成前 | 必须参考的文档 | 仅 openspec/specs/ | openspec/specs/ + 平台产物 |
| **设计辅助** | Phase 2 设计澄清 | 决策树/选型参考 | 无 playbook | effective playbook 决策树 |
| **实现指导** | Phase 3 每个 task | 编码骨架+模式 | 无 playbook | playbook 骨架 + profile 模式 |
| **后处理** | Phase 4 archive 后 | 额外动作触发 | 经验提取 | 经验提取 + 自检 + Git + 上报 |

**实现方式**：引擎文档中以条件指令表达：
```markdown
## Phase 1 澄清

[IF artifacts 存在] Read 产物文件作为澄清背景知识
[IF profile 存在] Read profile 作为架构参考
[ALWAYS] Read dimensions.md 获取澄清维度
```

### 3.3 门禁系统

引擎内置 G1-G4，适配层可在引擎外增加自有门禁（如 G0）。

```
<HARD-GATE id="G1" phase="proposal">
何时: 生成 proposal.md 之前
条件: 澄清质量门槛通过 + AskUserQuestion 对齐确认（4要素 + 用户确认）
无证据: 禁止调用 openspec new 或生成任何 spec 文件
</HARD-GATE>

<HARD-GATE id="G2" phase="design">
何时: 生成 design.md 之前
条件: proposal.md 已完成 + 澄清质量门槛通过 + AskUserQuestion 对齐确认
无证据: 禁止生成 design.md 或 tasks.md
</HARD-GATE>

<HARD-GATE id="G3" phase="apply">
何时: 调用 /opsx:apply 之前
条件: design.md + tasks.md 已完成 + 用户审批 design 决策清单
无证据: 禁止开始代码实现
</HARD-GATE>

<HARD-GATE id="G4" phase="archive">
何时: 调用 /opsx:archive 之前
条件: apply 已完成 + Spec-Code 验证通过
验证: design 决策清单逐项对照实现代码
不一致时: AskUserQuestion（修代码 / 更新 spec / 接受偏离）
</HARD-GATE>
```

### 3.4 Playbook 系统（通用能力）

Playbook 是引擎的内置能力，由 `footprint.effective` 驱动激活。

**激活逻辑**：
```
footprint.effective 中 true 的中间件 → 在对应阶段读取对应 playbook
```

**使用时机**：
| 阶段 | Playbook 注入 | 目的 |
|------|---------------|------|
| Phase 2 (Design 澄清) | 决策树部分 | 辅助技术选型 |
| Phase 3 (Apply) | 骨架代码 + profile 项目模式 | 生成一致风格代码 |

**通用化设计**：
- spec-coding 场景：用户声明"需要加 QMQ 消费者" → 从 profile/对话推断 footprint → 激活 qmq playbook
- spechub-coding 场景：产物 + profile 双层推断 footprint → 激活多个 playbook

### 3.5 澄清质量门槛

| 维度 | 门槛 | 自检 |
|------|------|------|
| 新洞察 | ≥1 个未提及的发现 | "未提及但我发现..." |
| 前提审计 | ≥2 个影响决策的假设 | 标记已验证/需确认 |
| Defeater | 对核心断言尝试反驳 | 攻破→呈现 / 未攻破→不提 |
| 元认知 | 两个触发器通过 | "返工最高的误解？""什么让我不确定？" |

### 3.6 Spec-Code 验证闭环

1. Read design.md → 提取 D1, D2... 决策点
2. 对每个决策点定位实现代码
3. 输出：`验证: D{N} → {文件:行号}（一致/偏离）`
4. 偏离 → AskUserQuestion

---

## 4. spechub-coding 输入适配层详细设计

### 4.1 Phase 0: Select + Pull

**触发**：用户提供 `requirementId` 或指定从 inbox 选择

**动作**：
1. `git remote -v` → 获取 `gitRemoteUrl`
2. 若无 `requirementId`：
   ```bash
   python3 scripts/spechub-pull-bundle.py --inbox <gitRemoteUrl>
   ```
   → AskUserQuestion 让用户选择
3. 拉取产物：
   ```bash
   python3 scripts/spechub-pull-bundle.py <reqId> <gitRemoteUrl> <repoRoot>
   ```
4. 写入 `spechub/{reqId}/artifacts/` + `manifest.json`

**前置检查**：
- `openspec/` 不存在 → 提示 `npx @fission-ai/openspec@1.2.0 init`
- `.claude/project-profile.md` 不存在 → 提示 `/ace:init`

**错误处理**：
- Exit 1: HTTP/网络错误 → 报错终止
- Exit 2: 响应解析失败 → 报错终止
- Exit 3: 业务错误（REQUIREMENT_NOT_FOUND / NO_PROJECT_MATCH / ARTIFACTS_INCOMPLETE）→ 报错终止

### 4.2 Phase 0.5: Understand + G0

**目的**：形成全面理解，为引擎提供高质量上下文。

**动作**：
1. Read `.claude/project-profile.md` → 架构分层 + 中间件使用表
2. Read `spechub/{reqId}/artifacts/` 全部产物
3. 分析产出：
   - 业务目标一句话
   - 改动范围（结合 profile 定位目标层）
   - `infrastructureFootprint` 计算：
     - `existing`：profile "中间件使用"表（自动填充）
     - `newlyRequired`：从产物推断的新中间件
     - `effective`：existing∩relevant ∪ newlyRequired
   - 冲突点 / 歧义 / 遗漏

**G0 门禁**：
```
<HARD-GATE id="G0" phase="understand">
何时: 进入引擎（Phase 1）之前
条件: AskUserQuestion 展示理解摘要 + infrastructureFootprint + 用户确认
无证据: 禁止进入引擎
</HARD-GATE>
```

### 4.3 Context 准备（交付引擎）

G0 通过后，以下信息已存在于对话上下文中，引擎可直接使用：
- 用户需求：manifest.title + 确认的理解摘要
- 产物路径：`spechub/{reqId}/artifacts/`（prd.md, architecture.md, contracts/, proposal.md 等）
- 项目画像：`.claude/project-profile.md`
- 基础设施足迹：`infrastructureFootprint` 结构
- Playbook 映射：`effective` 中为 true 的中间件 → `references/playbooks/{mw}.md`

---

## 5. spechub-coding 输出适配层详细设计

### 5.1 Handoff Check（交付自检）

引擎 Phase 4 (Archive) 完成后执行：
1. `git diff` 对照 proposal "涉及文件" 清单 — 是否有遗漏/超出
2. 对照 profile 编码约定检查生成代码一致性
3. 输出自检摘要
4. 若有违规 → AskUserQuestion 确认继续

### 5.2 Git 操作

```bash
# 创建 feature 分支
git checkout -b feature/spechub-{reqId}-<slug>

# 提交
git add -A  # 仅添加 openspec/ 和业务代码变更
git commit -m "feat(spechub-{reqId}): <需求标题简述>"

# 推送
git push -u origin feature/spechub-{reqId}-<slug>
```

### 5.3 SpecHub 上报

```bash
python3 scripts/spechub-archive-report.py <reqId> <gitRemoteUrl> \
  --branch <branchName> \
  --commit <commitHash> \
  --decisions <design decisions markdown> \
  --operator <operator>
```

**输出**：archiveRecordId + requirementStatus 更新确认

---

## 6. spec-coding 适配层设计（对照）

### 6.1 输入适配（极简）

```
前置检查: openspec/ 目录存在
Context:  用户口述需求（无产物、无 profile 强依赖、无 G0）
```

若 `.claude/project-profile.md` 存在，可作为可选上下文提供给引擎（但不强制）。

### 6.2 输出适配（几乎为空）

引擎 archive 完成即为 spec-coding 流程终点。仅向用户报告完成状态。

### 6.3 Playbook 使用（可选）

spec-coding 场景下，若 profile 存在且用户需求涉及中间件：
- 从对话/profile 推断 `footprint.effective`
- 引擎自动激活对应 playbook

这使得 spec-coding 也能享受 playbook 指导——不再是 spechub 独占能力。

---

## 7. 引擎阶段详细编排

### Phase 1: Proposal（需求规范化）

**澄清**：
- [IF artifacts] Read 产物文件作为澄清背景
- [IF profile] Read profile 作为架构参考
- Read dimensions.md（需求维度）
- 深度探索不确定性 → 满足澄清质量门槛
- 对齐确认（4要素 + 用户确认）→ **G1 通过**

**生成**（G1 后）：
```bash
openspec new change "<name>"
openspec instructions proposal --change "<name>" --json
```
- **[MUST]** Read `openspec/specs/` 已有主 specs
- **[IF artifacts]** Read 产物作为需求基础
- 基于模板 + 已有 specs + (产物) + 澄清结论 → 生成 proposal.md
- 生成 delta specs（ADDED/MODIFIED/REMOVED/RENAMED）

### Phase 2: Design（设计规范化）

**澄清**：
- [IF artifacts] Read architecture.md + contracts/ 作为设计约束
- [IF footprint] 读取 effective playbook 决策树部分
- [IF profile] 中间件用法 + 编码约定作为技术选型参考
- Read dimensions.md（设计维度）
- 深度探索不确定性 → 满足澄清质量门槛
- 对齐确认（4要素 + 用户确认）→ **G2 通过**

**生成**（G2 后）：
```bash
openspec instructions design --change "<name>" --json
```
- **[MUST]** Read `openspec/specs/` 已有主 specs
- **[IF artifacts]** Read 产物作为设计输入
- 生成 design.md（**含 D1, D2... 决策清单**）
- 生成 tasks.md：
  - 每个 task 关联决策点
  - [IF playbooks] 每个 task 标注命中的 playbook（`<!-- playbook: xxx.md#section -->`）
  - 拓扑顺序：DDL → DAO → 契约/SOA → QMQ → QConfig → QSchedule → CRedis → Service

### Phase 3: Apply（代码实现）

**G3 通过后**调用 `/opsx:apply`。

**增强约束**（持续生效）：
- 提取 design.md 决策清单作为验证锚点
- 每个 task 完成后自检：是否偏离决策清单
- 偏离时暂停 → AskUserQuestion（继续/修正/re-spec）
- [IF playbooks] Playbook 注入策略：
  ```
  playbook 通用骨架（how to do X in general）
          +
  profile 项目特定模式（how X is done in THIS repo）
          =
  实现上下文（生成代码与现有代码风格一致）
  ```
- ≥2 决策点偏离 → 建议回退 Phase 2（re-spec）

### Phase 4: Archive（归档 + Spec 累积）

**Spec-Code 验证**（G4 前置）：
1. Read design.md → 提取 D1, D2... 决策点
2. 对每个决策点定位实现代码
3. 输出：`验证: D{N} → {文件:行号}（一致/偏离）`
4. 偏离 → AskUserQuestion（修代码 / 更新 spec / 接受偏离）

**G4 通过后**：
- 调用 `/opsx:archive` — delta specs 合并到主 specs
- 经验提取（Read experience-protocol.md）
- **[返回控制权给适配层输出端]**

---

## 8. Infrastructure Footprint 机制

### 双来源推断

```yaml
infrastructureFootprint:
  existing:        # 来自 project-profile.md "中间件使用"表 (或用户声明)
    dal: true
    soa: true
    qmq: false
    qconfig: true
    qschedule: false
    credis: false

  newlyRequired:   # 从产物/需求描述推断
    qmq: true      # 产物中出现 QMQ 消息设计 / 用户说"需要异步消息"
    credis: true    # 产物中出现缓存需求 / 用户说"需要加缓存"

  effective:       # 本需求实际涉及 = existing∩relevant ∪ newlyRequired
    dal: true
    soa: true
    qmq: true
    qconfig: true
    credis: true
```

### 推断来源差异

| 来源 | spec-coding | spechub-coding |
|------|-------------|----------------|
| existing | profile（若有）/ 用户声明 | profile（必须有） |
| newlyRequired | 从对话推断 | 从产物推断（更可靠） |
| effective 计算 | 引擎统一计算 | 引擎统一计算 |

### Playbook 触发规则

- `effective` 中为 `true` → 对应 playbook 在 design/apply 阶段激活
- `existing` 有但 `effective` 无 → 本需求不涉及，不注入
- `newlyRequired` 新增 → design 阶段需额外技术选型决策（D{N}）

---

## 9. 文件结构设计

### 9.1 共享引擎

```
plugin/shared/
├── spec-engine.md                    通用 SpecCoding 引擎（Phase 1-4 + G1-G4）
└── playbooks/                        通用 Playbook 系统
    ├── dal.md                        DAL 决策树 + 骨架
    ├── soa.md                        SOA 决策树 + 骨架
    ├── qmq.md                        QMQ 决策树 + 骨架
    ├── qconfig.md                    QConfig 决策树 + 骨架
    ├── qschedule.md                  QSchedule 决策树 + 骨架
    └── credis.md                     CRedis 决策树 + 骨架
```

### 9.2 spec-coding（轻量适配）

```
plugin/skills/spec-coding/
├── SKILL.md                          适配层定义（精简）
└── references/
    ├── dimensions.md                 澄清维度（通用版）
    └── quality-criteria.md           质量标准
```

### 9.3 spechub-coding（重适配）

```
plugin/skills/spechub-coding/
├── SKILL.md                          适配层定义（输入+输出）
├── scripts/
│   ├── spechub-pull-bundle.py        拉取产物
│   └── spechub-archive-report.py     归档上报
└── references/
    ├── dimensions.md                 澄清维度（含产物专属维度）
    ├── quality-criteria.md           质量标准
    └── api-contract.md               SOA 接口契约
```

### 9.4 本地产物目录（运行时）

```
{repoRoot}/
├── spechub/{reqId}/                  (spechub-coding 专属)
│   ├── manifest.json                 需求元信息 + 进度追踪
│   └── artifacts/                    平台产物（只读）
│       ├── prd.md
│       ├── architecture.md
│       ├── proposal.md
│       ├── contracts/{filename}.md
│       ├── qmq-message-design.md     (可选)
│       ├── ddl-change.md             (可选)
│       └── ddl-change.sql            (可选)
│
└── openspec/                         (两者共用)
    ├── specs/                        主 specs（累积）
    └── changes/{name}/               当前 change 工作目录
        ├── proposal.md               ← G1 后生成
        ├── design.md                 ← G2 后生成
        └── tasks.md                  ← G2 后生成
```

---

## 10. SKILL.md 结构预览

### 10.1 spec-coding/SKILL.md（重构后）

```markdown
---
name: spec-coding
description: |
  规范驱动开发。需求→设计→实现的结构化流程。
  前提：openspec/ 目录。
  DO NOT TRIGGER: bug 修复；探索学习；code review；ut。
---
# Spec-Coding — 规范驱动开发

核心信念：**Spec 是契约，Code 是兑现。**

## 输入适配

### 前置检查
- openspec/ 目录存在

### Context 准备
- userRequest: 用户口述需求
- [可选] Read .claude/project-profile.md → 提供 profile + footprint

## 执行

Read `../../shared/spec-engine.md` — 执行通用引擎。

## 输出适配

无额外动作。向用户报告完成状态。

## 恢复
"继续" → 检测 openspec/changes/ → 定位 phase → 继续
```

### 10.2 spechub-coding/SKILL.md（重构后）

```markdown
---
name: spechub-coding
description: |
  SpecHub 产物驱动的规范编码。
  前提：openspec/ + .claude/project-profile.md。
  DO NOT TRIGGER: 无平台产物→spec-coding；bug修复；探索学习；code review；ut。
---
# SpecHub-Coding — 平台产物驱动的规范编码

核心信念：**SpecHub 产物是输入参考，Spec 是契约，Code 是兑现。**

## 输入适配

### 前置检查
- openspec/ + .claude/project-profile.md 存在

### Phase 0: Select + Pull
[... 脚本调用 ...]

### Phase 0.5: Understand + G0
[... 深度理解 + 门禁 ...]

### Context 准备
- userRequest + artifacts + profile + footprint + playbooks

## 执行

Read `../../shared/spec-engine.md` — 执行通用引擎。

引擎注入增强：
- Phase 1/2: 产物作为澄清背景
- Phase 2: playbook 决策树辅助设计
- Phase 3: playbook 骨架 + profile 模式 = 实现指导

## 输出适配

### 1. Handoff Check
### 2. Git 操作
### 3. SpecHub 上报

## 恢复
"继续" → 检测 spechub/{reqId}/manifest.json → 定位 phase → 继续
```

---

## 11. 引擎条件逻辑设计

引擎是 markdown 指令文档，通过条件标注实现对不同适配层的差异化行为：

```markdown
## 条件约定

引擎使用以下条件标注，根据上下文中是否存在对应信息来决定行为：

[IF artifacts]     — 上下文中存在外部产物路径
[IF profile]       — 上下文中存在项目画像
[IF footprint]     — 上下文中存在 infrastructureFootprint
[IF playbooks]     — 上下文中存在 playbook 配置
[ALWAYS]           — 无条件执行
```

**设计理由**：这比 Hook/回调更自然——LLM 读取引擎指令时，根据前文上下文中已有的信息自然决定是否执行条件分支。无需形式化的接口定义，markdown 条件指令就是最适合 skill 的"接口"。

---

## 12. 恢复协议

### 状态持久化

**spec-coding**：
- `openspec/changes/{name}/` 目录及其内容即为状态
- 检测方式：Glob `openspec/changes/*/proposal.md` → 找到活跃 change

**spechub-coding**：
- `spechub/{reqId}/manifest.json` 追踪进度：
```json
{
  "requirementId": 12345,
  "requirementTitle": "...",
  "currentPhase": "design",
  "openspecChangeName": "spechub-12345-xxx",
  "infrastructureFootprint": { ... },
  "completedGates": ["G0", "G1"]
}
```

### 恢复逻辑

用户说"继续"时：
1. **检测**（适配层负责）：找到活跃的 change / reqId
2. **定位**（适配层负责）：确定 currentPhase + 已通过门禁
3. **验证**（通用逻辑）：前置产物存在性检查
   - `currentPhase=design` 但 `proposal.md` 不存在 → 回退 Phase 1
   - `currentPhase=apply` 但 `design.md` 不存在 → 回退 Phase 2
4. **继续**（引擎负责）：从断点 phase 继续执行

---

## 13. 与原 v1 设计的对比

| 维度 | v1（独立 skill） | v2（三层架构） |
|------|------------------|----------------|
| 引擎定义 | 各自内嵌完整流程 | 共享 spec-engine.md |
| 门禁代码 | 两处定义 G1-G4 | 引擎一处定义 |
| Playbook | spechub 独有 | 通用能力，两者均可用 |
| 维护成本 | 改一处需同步两处 | 改引擎一处即可 |
| SKILL.md 体积 | 各 250+ 行 | spec-coding ~40 行, spechub ~80 行 |
| 概念模型 | "两个并列 skill" | "适配层 + 共享引擎" |
| 新来源扩展 | 完整 copy + 改 | 仅写适配层（<100 行） |

---

## 14. 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| 引擎条件逻辑复杂 | LLM 可能误判条件分支 | 条件标注语义清晰；仅 4 个条件变量 |
| 过度抽象 | 调试困难 | 引擎文档保持可独立阅读，不依赖运行时状态 |
| Playbook 通用化后体积大 | 引擎上下文膨胀 | 按需 Read（仅 effective=true 的 playbook） |
| 适配层与引擎边界模糊 | 职责溢出 | RACI 矩阵明确（§2），定期审查 |
| spec-coding 用户不需要 playbook | 无用信息干扰 | [IF footprint] 条件确保无 footprint 时不触发 |

---

## 15. 实现计划

### 阶段一：引擎抽取 + 适配层重写

1. 编写 `shared/spec-engine.md` — 通用引擎（从现有 spec-coding 抽取 + 加条件逻辑）
2. 重写 `spec-coding/SKILL.md` — 精简为适配层 + 引擎引用
3. 重写 `spechub-coding/SKILL.md` — 输入/输出适配层 + 引擎引用
4. 迁移 `playbooks/` 到 `shared/playbooks/` — 通用化

### 阶段二：增强 + 联调

5. 为 spec-coding 增加可选 Playbook 能力（基于 profile 推断）
6. 端到端验证：spec-coding + spechub-coding 分别走一遍完整流程
7. 验证恢复协议在两种场景下都正常工作

### 阶段三：SOA 对接

8. scripts/spechub-pull-bundle.py 实现
9. scripts/spechub-archive-report.py 实现
10. 与 spec-portal-service 联调

---

## 附录 A: 术语对照

| 术语 | 含义 |
|------|------|
| 通用引擎 | shared/spec-engine.md，定义 Phase 1-4 + G1-G4 + Playbook + 验证闭环 |
| 输入适配层 | SKILL.md 中引擎调用前的部分（前置检查、产物获取、Context 准备） |
| 输出适配层 | SKILL.md 中引擎完成后的部分（Git、上报、自检） |
| 条件标注 | `[IF xxx]` 语法，引擎根据上下文有无某信息决定是否执行 |
| 注入点 | 引擎中适配层提供额外信息的时机（澄清背景、生成约束、实现指导、后处理） |
| effective footprint | 本需求实际涉及的中间件集合，驱动 Playbook 激活 |
| SpecHub 产物 | 平台侧生成的 PRD/architecture/contracts/proposal 等文档 |
| openspec 产物 | 本地 openspec 流程生成的 proposal.md/design.md/tasks.md |
| 主 specs | openspec/specs/ 目录下的累积规范 |
| delta specs | 每次 change 新增/修改/删除的规范增量 |
| playbook | 中间件编码的决策树 + 骨架代码（通用能力） |
| profile | .claude/project-profile.md，由 ace:init 生成的项目画像 |

---

## 附录 B: SOA 接口契约（摘要）

详见 `references/api-contract.md`。

### getHandoffBundle
```
Request:  { requirementId: long, gitRemoteUrl: string }
Response: { manifest, prd, architecture, proposal, contracts[], qmqDesign?, ddlChange? }
```

### getHandoffInbox
```
Request:  { gitRemoteUrl: string }
Response: { items[]: { requirementId, title, status, updatedAt } }
```

### archiveHandoff
```
Request:  { requirementId, gitRemoteUrl, archiveStatus, branchName, commitHash, decisionsMarkdown, operator }
Response: { archiveRecordId, requirementProjectStatus, requirementStatus }
```

---

## 附录 C: Playbook 系统详细设计

详见 `shared/playbooks/` 目录。每个 playbook 统一格式：

```markdown
# {中间件} Playbook

## 决策树
### 场景: {场景名}
- 前提条件 / 选项 / 推荐 / 判断依据

## 骨架代码
### {场景名} 骨架
// Java 标准骨架

## 检查清单
- [ ] ...
```

覆盖中间件：DAL / SOA / QMQ / QConfig / QSchedule / CRedis
