# SpecHub-Coding 高层架构设计

> 产出日期：2026-05-26
> 定位：面向架构评审的概念级设计文档
> 核心问题：如何让 AI 编码 Agent 可靠地将 SpecHub 平台产物转化为高质量代码

---

## 1. 设计理念

### 核心定位

SpecHub-Coding 是 ACE（AI Coding Engine）插件体系中的一个 **领域编码 Skill**。它解决的核心问题是：

> SpecHub 平台产出了需求文档、架构设计、API 契约等产物，如何让 AI Agent 基于这些产物可靠、可控、可追溯地完成编码？

### 三个设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 产物是输入，不是 Spec | SpecHub 产物作为"参考输入"，经 openspec 流程规范化后才驱动编码 | 平台产物可能有遗漏/冲突/歧义，直接跳到编码风险不可控 |
| 复用而非重建 | 最大化复用 ACE 共享基础设施 | 减少维护成本，保证跨 skill 行为一致性 |
| 知识可累积 | 每次编码产出的 Spec 增量合并到主 specs | 项目知识不随 session 消失，越用越聪明 |

### 一句话总结

**SpecHub 产物告诉 AI "做什么"，ACE 基础设施保证 AI "做得对"，Playbook 告诉 AI "在这个项目里怎么做"。**

---

## 2. 全景架构图

![ACE 插件体系全景架构](http://download2.ctrip.com/swift/v1/ChengguanjiaTmp/feishu2mdTemp/CTF-8dbdde6e-e5d7-4f97-b35e-537f7980892b/html2img_b38182f89cde.png?temp_url_sig=62996cbe5ca9e0c3d04a4869ad09c4fea988a232&temp_url_expires=1779813220)

---

## 3. SpecHub-Coding 内部架构

![SpecHub-Coding 内部架构](http://download2.ctrip.com/swift/v1/ChengguanjiaTmp/feishu2mdTemp/CTF-4371e8d2-ddfb-4476-9ba3-caf3392c4f0f/html2img_cc47dec400ab.png?temp_url_sig=693fb0dfbda03fee45a599ef51410d1652dd0514&temp_url_expires=1779813286)

---

## 4. 共享基础设施层 — 模块说明

这些能力是 ACE 体系的"公共底座"，被多个 Skill（auto-goal / spec-coding / spechub-coding / code-review 等）共同使用。

### 4.1 Project Profile（项目技术画像）

| 维度 | 说明 |
|------|------|
| **生成者** | `ace:init` skill |
| **产物** | `.claude/project-profile.md` |
| **核心内容** | 架构分层（包路径 + 职责）、中间件使用（关键类/配置）、编码约定、构建运行命令 |
| **在 spechub-coding 中的作用** | 作为"项目事实基线"——AI 不需要每次从零分析仓库，profile 提供已验证的项目知识 |

**价值**：
- 减少 70% 的仓库分析 token 消耗（从"5 步全量扫描"降为"2 步增量定位"）
- 保证生成代码与现有代码风格一致（编码约定注入子任务）
- 减少 AI 推断发散（profile 是"经用户确认的事实"）

---

### 4.2 对齐协议（Alignment Protocol）

| 维度 | 说明 |
|------|------|
| **核心理念** | 对齐优先于效率。准确完成用户真正想要的 > 高效完成 AI 以为的 |
| **机制** | 三步法（理解→展示→确认）+ 惊讶测试 + 硬性门禁 |
| **门禁体系** | G0 理解确认 → G1 需求对齐 → G2 设计对齐 → G3 实现审批 → G4 交付验证 |
| **在 spechub-coding 中的作用** | 5 道门禁确保每个关键决策点都有用户参与，防止 AI 基于错误理解一路跑偏 |

**价值**：
- 平台产物有歧义/遗漏时，通过门禁强制澄清而非猜测
- 每个决策都有证据（AskUserQuestion 记录），出问题可追溯
- 用户始终掌控方向，而非"交给 AI 就完事"

---

### 4.3 并行执行协议（Parallel Protocol）

| 维度 | 说明 |
|------|------|
| **核心理念** | 可并行但串行执行 = 浪费；独立任务必须并行调度 |
| **机制** | 依赖分析 → 标注 `⟂`（可并行）/`depends: X`（有依赖）→ 并行 Agent 调度 |
| **在 spechub-coding 中的作用** | apply 阶段多个独立模块的编码任务并行执行，显著缩短总实现时间 |

**价值**：
- 6 个中间件相关任务中，通常 3-4 个可并行 → 实现时间减半
- 子任务间上下文隔离，避免交叉污染

---

### 4.4 OpenSpec 引擎（Spec 累积维护）

| 维度 | 说明 |
|------|------|
| **核心理念** | 代码是一次性的，Spec 是累积的。每次编码都应该让项目"变得更有知识" |
| **机制** | openspec CLI — new change / instructions / archive 三步闭环 |
| **产物** | proposal.md（需求 Spec）→ design.md（设计 Spec）→ delta specs → 合并到主 specs |
| **在 spechub-coding 中的作用** | SpecHub 产物经规范化后进入 openspec 体系，编码产出的 spec 增量永久累积 |

**价值**：
- 知识不随 session 消失 — 第 10 次使用时，AI 已掌握前 9 次积累的项目规范
- 跨需求一致性 — 新需求的设计决策受已有 specs 约束
- 决策可追踪 — 每个 design 决策清单（D1, D2…）贯穿从设计到验证的全流程

---

### 4.5 上下文纪律（Context Discipline）& 验证协议（Verification Protocol）

| 能力 | 解决的问题 | 在 spechub-coding 中的体现 |
|------|-----------|--------------------------|
| **上下文纪律** | AI 上下文窗口有限，需精细管理 | 子任务用独立 Agent 隔离，主流程只保留结论 |
| **验证协议** | 如何确认"真的做完了" | G4 门禁：design 决策清单逐项对照实现代码 |

---

## 5. SpecHub-Coding 特有层 — 模块说明

这些是 spechub-coding 独有的能力，解决"从平台产物到代码"这个特定问题。

### 5.1 SpecHub Connector（平台对接）

| 维度 | 说明 |
|------|------|
| **职责** | 与 SpecHub 平台的双向数据交互 |
| **拉取方向** | pull-bundle.py → 调用 getHandoffBundle API → 下载 PRD/架构/契约/proposal 到本地 |
| **推送方向** | archive-report.py → 调用 archiveHandoff API → 上报编码完成状态 + 决策摘要 |
| **需求发现** | getHandoffInbox → 列出当前仓库关联的"待编码"需求 |

**设计关键**：
- 仅需 `requirementId` 一个参数 — 服务端通过 git remote URL 自动匹配项目
- 纯 Python3 stdlib 实现，零外部依赖
- 幂等设计 — 同一需求重复拉取/上报不会产生副作用

---

### 5.2 产物校验 & 理解引擎

| 维度 | 说明 |
|------|------|
| **职责** | 将平台产物从"原始输入"转化为"可执行的理解" |
| **Infrastructure Footprint** | 双层识别 — profile 基线（existing）+ 产物推断（newlyRequired）= 本需求涉及的中间件清单 |
| **产物完整性** | 必需产物缺失 → 阻断；可选产物缺失 → 跳过 |
| **冲突检测** | 产物提议的命名/方案与现有代码的矛盾 → G0 阶段暴露给用户 |
| **契约验证** | API 契约 JAR 是否已发布到 Maven 仓库 → 未发布则暂停等待 |

**Infrastructure Footprint 核心逻辑**：
```
Profile "中间件使用"表 → existing (项目已有什么)
     +
产物关键词/章节分析   → newlyRequired (本需求新增什么)
     =
effective footprint  → 决定哪些 Playbook 被激活
```

---

### 5.3 Playbook 系统（中间件编码知识库）

| 维度 | 说明 |
|------|------|
| **职责** | 告诉 AI "中间件在这个项目里怎么用" |
| **覆盖范围** | DAL / SOA / QMQ / QConfig / QSchedule / CRedis 六大中间件 |
| **结构** | 每份 = 决策树（选型判断）+ 骨架代码（标准写法）+ 检查清单（硬性规范） |
| **注入策略** | Playbook 通用骨架 + Profile 项目特定模式 = 子任务 prompt |

**三层知识融合**：
```
What（做什么）  ← SpecHub 平台产物
How（怎么做）   ← Playbook 通用骨架
How Here（这里怎么做） ← Profile 项目特定模式
```

**按需注入，避免 token 浪费**：只有 effective footprint 命中的中间件才注入对应 playbook。

---

## 6. 端到端工作流

![SpecHub-Coding 端到端工作流](http://download2.ctrip.com/swift/v1/ChengguanjiaTmp/feishu2mdTemp/CTF-1cebd063-afa2-49c4-ac49-6f45bc8aba4a/html2img_6a04813a9e4a.png?temp_url_sig=75ff901b32ce9b9443b3193233872a95695e8b3a&temp_url_expires=1779813288)

---

## 7. 能力归属矩阵

> 一张表说清楚：哪些是共享的，哪些是独有的。

| 能力 | 归属 | 使用者 | 核心价值 |
|------|------|--------|----------|
| **Project Profile** | ACE 共享 | init / spec-coding / spechub-coding / code-review | 项目知识一次生成，全体 skill 复用 |
| **对齐协议 & 门禁体系** | ACE 共享 | auto-goal / spec-coding / spechub-coding | 关键决策必须有用户参与 |
| **并行执行协议** | ACE 共享 | auto-goal / spechub-coding | 独立任务并行执行，缩短总时间 |
| **OpenSpec Spec 累积** | ACE 共享 | spec-coding / spechub-coding | 项目知识跨需求累积 |
| **上下文纪律** | ACE 共享 | 全体 skill | 精细管理有限的上下文窗口 |
| **验证协议** | ACE 共享 | auto-goal / spec-coding / spechub-coding | Spec-Code 对照验证 |
| **SpecHub Connector** | spechub-coding 独有 | — | 与 SpecHub 平台双向数据交互 |
| **产物校验 & 理解引擎** | spechub-coding 独有 | — | 平台产物 → 可执行理解 |
| **Playbook 系统** | spechub-coding 独有 | — | 中间件编码的决策树+骨架 |
| **Infrastructure Footprint** | spechub-coding 独有 | — | 精准识别本需求涉及的中间件 |

---

## 8. 与 spec-coding 的关系（核心差异）

```
spec-coding:
  输入 = 用户口述
  流程 = [需求澄清]─G1→[proposal]─[设计澄清]─G2→[design]─G3→[apply]─G4→[archive]

spechub-coding:
  输入 = SpecHub 平台产物
  流程 = [pull]→[understand]─G0→[需求澄清]─G1→[proposal]─[设计澄清]─G2→[design]─G3→[apply]─G4→[archive+report]
                                  ↑                                          ↑
                          平台产物作为澄清基础                         Playbook 注入 + SpecHub 上报
```

**设计思想**：spechub-coding 不是 spec-coding 的"替代品"，而是在 spec-coding 的标准流程**前面加了产物获取和理解**，**过程中增强了 Playbook 注入**，**末尾追加了平台上报**。核心的门禁体系和 Spec 累积逻辑完全复用。

---

## 9. 关键设计价值总结

### 对"可靠性"的保障

| 风险 | 应对机制 |
|------|----------|
| 平台产物有歧义/遗漏 | G0 + G1 两道门禁强制澄清 |
| AI 编码偏离设计决策 | design 决策清单 D1-D{N} → G4 逐项对照 |
| 生成代码风格不一致 | Profile 编码约定注入 + Playbook 骨架 |
| 中间件用法错误 | Playbook 检查清单 + handoff-check 自检 |

### 对"效率"的优化

| 优化点 | 机制 |
|--------|------|
| 仓库分析成本 | Profile 基线 → 2 步增量定位（非 5 步全量扫描） |
| 实现时间 | 并行执行协议 → 独立任务并行（时间减半） |
| Playbook 注入 | footprint 精准匹配 → 只注入需要的知识（不浪费 token） |
| 跨需求复用 | Spec 累积 → 第 N+1 次使用基于 N 次积累 |

### 对"可追溯性"的保障

| 追溯需求 | 产物 |
|----------|------|
| 为什么这么做？ | design.md 决策清单（D1-D{N}） |
| 做了什么？ | delta specs + git diff |
| 是否符合设计？ | G4 Spec-Code 验证报告 |
| 项目知识在哪？ | openspec/specs/ 累积主 specs |

---

## 附录: 架构分层视图（另一视角）

从"分层"而非"模块"的视角看 spechub-coding：

![SpecHub-Coding 分层视图](http://download2.ctrip.com/swift/v1/ChengguanjiaTmp/feishu2mdTemp/CTF-4264925e-2ba5-4894-a3e8-93a9dd7e2fd2/html2img_73da98196fcc.png?temp_url_sig=005f2233bf5e580369d5e0ac3997af945abc9c72&temp_url_expires=1779813290)
