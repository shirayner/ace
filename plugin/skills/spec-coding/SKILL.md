---
name: spec-coding
description: |
  全生命周期规范驱动编码。单命令启动：深度理解 → 澄清 → 对齐 → 创建提案 → 技术设计 →
  实现规划 → 代码实施 → 规范归档。自包含、文件持久化、可恢复。

  触发：用户需要从零开始做一个功能/变更时（有 OpenSpec 环境）。
  前提：项目中已有 openspec/ 目录（由 OpenSpec CLI 初始化）。

  DO NOT TRIGGER: 无 openspec 环境的普通编码（→ auto-goal）；单文件 bug 修复（→ 直接 Edit）；
  基于 SpecHub 平台产物的编码（→ spechub-coding）；纯探索/学习（→ auto-goal）。
---
# Spec Coding — Full-Lifecycle Spec-Driven Development

核心信念：**规范驱动的可累积式开发。每个变更都有完整的 spec 生命周期，产物可追溯、可归档、可组合。**

---

## Hard Gate

<HARD-GATE>
未通过 AskUserQuestion 获得用户确认，不得进入 propose 阶段。
未通过 AskUserQuestion 获得用户设计批准，不得进入 plan 阶段。
未通过 AskUserQuestion 获得用户计划批准，不得进入 apply 阶段。
</HARD-GATE>

---

## 前置检查

<HARD-GATE>
前置检查必须按顺序全部完成后，才可进入阶段路由。
禁止在前置检查完成前 Read 任何 phases/*.md 文件或执行阶段逻辑。
</HARD-GATE>

**项目根目录确定**：运行 `pwd` 获取当前工作目录作为 `$PROJECT_ROOT`。
不使用 `git rev-parse --show-toplevel`（用户可能不在 git 仓库中，或 git 根不是意图的项目根）。
所有文件操作使用 `$PROJECT_ROOT` 为基准的绝对路径。

**Step 1 — openspec/ 目录**：

```
IF $PROJECT_ROOT/openspec/ 存在:
  → 继续 Step 2
ELSE:
  → 执行: bash {skill_dir}/scripts/openspec-init.sh $PROJECT_ROOT
  → 告知用户："openspec/ 目录不存在，已自动初始化。"
  → 继续 Step 2
```

**Step 2 — .ace/project-profile.md**：

```
IF $PROJECT_ROOT/.ace/project-profile.md 存在:
  → Read 一次（后续 phase 引用已加载内容，不重复 Read）
  → 继续 Step 3
ELSE:
  → 必须执行以下 Agent 调用（不可跳过）:
    Agent(description="初始化项目画像", run_in_background=true,
      prompt="执行 /ace:init 为当前项目生成 .ace/project-profile.md。
        当前项目根：$PROJECT_ROOT。按 init skill 的完整流程执行。")
  → 告知用户："project-profile.md 不存在，已在后台启动初始化。"
  → 继续 Step 3（不等待，profile 在 Phase 3 Design 阶段使用时再 Read）
```

**Step 3 — .ace/config.yaml**：

```
IF $PROJECT_ROOT/.ace/config.yaml 不存在:
  → mkdir -p $PROJECT_ROOT/.ace/
  → 使用默认配置创建 .ace/config.yaml（内容见 references/config-template.yaml）
  → 向用户展示配置项：
    "已创建 .ace/config.yaml，当前配置：
     - mode: manual（需人工澄清对齐）
     - auto_archive: false（归档前需确认）
     - auto_push: false（不自动提交远程）
     - use_subagent: true（使用子代理执行）
     如需调整，直接编辑 .ace/config.yaml。"
  → 继续
ELSE:
  → Read .ace/config.yaml → 解析 spec-coding 节
  → 继续

所有 Step 完成 → 进入"自动恢复检测"（跳转到该节）→ 然后"阶段路由"
```

**执行流总结**：`前置检查 (Step 1→2→3)` → `自动恢复检测` → `阶段路由` → `Read phases/{phase}.md`。
中间的"配置驱动行为"、"状态机"等节是参考文档，不是执行步骤。

---

## 配置驱动行为

Read `.ace/config.yaml` 中的 `spec-coding` 节，配置决定全流程行为：

```yaml
spec-coding:
  mode: manual        # auto | manual
  auto_archive: false # 实施完成后是否自动归档（不等确认）
  auto_push: false    # 归档后是否自动提交代码到远程（commit + push）
  use_subagent: true  # Phase 5 是否使用子代理
```

### 配置读取与行为路由（伪代码）

```
启动时 Read .ace/config.yaml → 解析 spec-coding 节 → 存为 CONFIG

## mode 控制人工交互
IF CONFIG.mode == "auto":
  Phase 1: 执行 Step A（内部分析）→ 跳过 Step B/C → 直接 Phase 2
  Phase 3: 跳过设计决策澄清 + 审批 → AI 自主选推荐方案
  Phase 4: 跳过计划审批 → 直接 Phase 5
ELSE (manual):
  Phase 1: 完整 Step A → Step B（澄清循环）→ Step C（对齐审批）
  Phase 3: 设计决策澄清 + 用户审批
  Phase 4: 计划审批

## auto_archive 控制归档时机
IF CONFIG.auto_archive == true:
  Phase 5 apply 完成 → 直接进入 Phase 6（复盘 + openspec archive + 经验提取）
ELSE:
  Phase 5 apply 完成 → AskUserQuestion 确认后再进入 Phase 6

## auto_push 控制代码提交
IF CONFIG.auto_push == true:
  Phase 6 归档完成 → git add + git commit + git push -u origin {branch}
ELSE:
  Phase 6 归档完成 → AskUserQuestion 选择（合并/PR/保持）

## use_subagent 控制执行方式
IF CONFIG.use_subagent == true:
  Phase 5 → Read subagent-execute/SKILL.md 并按协议执行（不使用 Skill() 工具）
ELSE:
  Phase 5 → direct 模式（主代理逐任务执行）
```

### 配置缺失时的默认值

`.ace/config.yaml` 不存在或字段缺失时，使用：

- `mode`: manual
- `auto_archive`: false
- `auto_push`: false
- `use_subagent`: true

---

## 状态机：六阶段生命周期

```
  [understand] → [propose] → [design] → [plan] → [apply] → [archive]
       │             │           │          │         │          │
  需求理解+对齐   创建提案    技术设计   实现规划  代码实施   归档收尾
```

### 状态转换

| 当前阶段   | 事件         | 目标阶段   | 守护条件                                          |
| ---------- | ------------ | ---------- | ------------------------------------------------- |
| -          | `init`     | understand | 用户触发 /spec-coding                             |
| understand | `aligned`  | propose    | AskUserQuestion 确认对齐                          |
| propose    | `proposed` | design     | proposal.md + delta-spec + openspec validate 通过 |
| design     | `designed` | plan       | design.md 生成 + 用户审批                         |
| plan       | `planned`  | apply      | tasks.md 生成 + 用户批准                          |
| apply      | `applied`  | archive    | 所有任务完成                                      |
| archive    | `archived` | (终态)     | 归档完成                                          |

### 回退路径

| 阶段   | 回退条件     | 目标                      |
| ------ | ------------ | ------------------------- |
| design | 用户否决设计 | → understand（重新对齐） |
| apply  | 发现设计缺陷 | → design                 |

---

## 自动恢复检测

<HARD-GATE>
自动恢复检测在前置检查（Step 1-3）**之后**执行。
即使发现活跃任务，也不得跳过前置检查中的任何 Step。
执行顺序：前置检查 → 自动恢复检测 → 阶段路由。
</HARD-GATE>

```
启动时（用户调用 /spec-coding 或说"继续"）：
前提：前置检查已全部完成（Step 1-3）。

1. 检查 .ace/tasks/ 下是否有 type="spec" 的活跃任务
   → Glob `.ace/tasks/*/state.json` → 逐个读取 → 筛选 type=="spec" && status!="completed"
2. 有活跃 spec 任务 → 读 state.json 的 spec.phase → 路由到对应阶段
3. 多个活跃 spec 任务 → AskUserQuestion 选择
4. 无活跃 spec 任务 → Phase 1 (understand)

降级路径（state.json 丢失但 openspec change 存在）：
  1. 运行 `openspec list --json` 获取活跃变更列表
  2. 运行 `openspec status --change {changeName} --json`
  3. 从 artifact 完成状态推断当前 phase：
     proposal done + specs done + design done → phase = plan
     proposal done + specs done → phase = design
     proposal done → phase = propose（完成）或 design（开始）
     无 artifact → phase = understand
  4. 重建 .ace/tasks/{changeName}/state.json
  5. AskUserQuestion 确认推断是否正确
```

---

## 阶段路由

进入每阶段时 Read `phases/{phase}.md`，按其指令执行。

| phase      | 行为                                                   |
| ---------- | ------------------------------------------------------ |
| understand | Read `phases/understand.md` → 内部分析 + 交互对齐   |
| propose    | Read `phases/propose.md` → 创建提案（OpenSpec CLI） |
| design     | Read `phases/design.md` → 深入代码探索 + 技术设计   |
| plan       | Read `phases/plan.md` → 任务编排                    |
| apply      | Read `phases/apply.md` → subagent 或 direct 模式    |
| archive    | Read `phases/archive.md` → 归档收尾                 |

---

## 复杂度分级器（Size Classifier）

Phase 1 对齐完成后，根据需求特征自动确定流程深度：

```
分级信号：
  file_count:       预估受影响文件数
  design_ambiguity: 设计方案是否不明确
  new_dependency:   是否引入新外部依赖
  cross_module:     是否跨模块边界
```

| 分级     | Phase 1   | Phase 2    | Phase 3 | Phase 4            | Phase 5  | Phase 6 |
| -------- | --------- | ---------- | ------- | ------------------ | -------- | ------- |
| trivial  | 简化对齐  | 跳过       | 跳过    | 跳过（内联 tasks） | TDD 实现 | 简化    |
| small    | ✅        | tasks only | 跳过    | ✅                 | TDD 实现 | ✅      |
| standard | ✅        | ✅         | ✅      | ✅                 | ✅       | ✅      |
| large    | ✅ + 分解 | ✅         | ✅      | ✅                 | ✅       | ✅      |

**分级时机**：Phase 1 结束后、进入 Phase 2 前。
**存储**：写入 `state.json` 的 `spec.workflow` 字段。
**降级路径**：执行中发现比预估复杂 → 升级 workflow 等级（不回退已完成阶段）。

---

## 范围检测

**主检测（Phase 1 末尾）**：

- 信号：≥2 独立子系统 / "平台"等宏大词汇 / ≥3 无关技术层
- 触发后：Phase 1 首要议题变为分解策略确认
- 分解后：只对第一个子项目继续，其余记为 Future Changes

**兜底（Phase 4 开头）**：

- 设计展开后发现无法收敛为单个 plan → 拆为多个 plan
- 不回退 design，只拆 plan

---

## 交互规则

- 每条消息只问一个问题
- 优先多选题（AskUserQuestion with options）
- 开放式仅在无法给选项时使用
- 需深入的话题 → 拆为多消息逐步追问

## 产物语言规则

- 所有产出文档使用**中文**编写（proposal.md、spec.md、design.md、tasks.md、issues/*.md）
- spec 中的 RFC 2119 关键词保持英文大写（SHALL、MUST、WHEN、THEN、GIVEN、AND）
- 代码标识符、文件路径、命令保持英文
- OpenSpec validate 不检查语言，只检查格式结构

---

## 状态文件：`state.json`

**完整模板**：见 `references/state-template.jsonc`

**位置**：`$PROJECT_ROOT/.ace/tasks/{changeName}/state.json`
**创建时机**：Phase 1 Step A 完成后（确定 changeName 时）
**更新时机**：每个阶段转换时 + 阶段内关键状态变更时

**为什么放在 .ace/tasks/ 下**（而非 openspec/changes/）：

- ACE 工作流状态属于 ACE 管理范畴，与 OpenSpec CLI 的产物状态解耦
- `.ace/tasks/` 统一所有任务类型，通过 `type: "spec"` 区分
- 恢复时扫描 `.ace/tasks/` 即可发现所有任务（无论 spec 还是 goal）

**与 openspec/ 的关联**：通过 `state.json` 中的 `spec.openspec_change` 字段指向 `openspec/changes/{changeName}/`。

**字段分层**：

| 层级    | 字段路径                                                                                  | 写入时机                      |
| ------- | ----------------------------------------------------------------------------------------- | ----------------------------- |
| 基础    | name, type("spec"), status, created_at                                                    | Phase 1 创建时                |
| 阶段    | spec.phase                                                                                | 每次阶段转换                  |
| 时间    | spec.timestamps.{phase}_started                                                           | 进入该阶段时                  |
| Phase 1 | spec.scope_assessment, spec.aligned                                                       | Phase 1 完成时                |
| Phase 2 | spec.openspec_change                                                                      | Phase 2 创建 change 后        |
| Phase 3 | spec.approvals.design                                                                     | Phase 3 审批后                |
| Phase 4 | spec.approvals.plan, tasks (数组)                                                         | Phase 4 完成时                |
| Phase 5 | spec.apply.mode, spec.apply.branch_name, tasks[].status                                   | Phase 5 进入时 + 每任务完成时 |
| Phase 6 | status → "completed"                                                                      | Phase 6 完成时                |

**更新规则**：

- 阶段转换时更新 `spec.phase` + 对应 timestamp
- Phase 5 每完成一个任务更新 tasks 数组中对应项的 status
- 只追加/更新字段，不删除已有字段

---

## OpenSpec CLI 集成点

| 阶段        | CLI 命令                                                  | 用途                 |
| ----------- | --------------------------------------------------------- | -------------------- |
| 启动/恢复   | `openspec list --json`                                  | 检测活跃变更         |
| Phase 1     | `openspec new change {changeName}`                            | 创建 change 目录结构 |
| Phase 2     | `openspec instructions proposal --change {changeName} --json` | 获取写作指令         |
| Phase 2     | `openspec instructions specs --change {changeName} --json`    | 获取 spec 写作指令   |
| Phase 2/3/4 | `openspec validate --json`                              | 验证 artifact 格式   |
| Phase 3     | `openspec instructions design --change {changeName} --json`   | 获取 design 指令     |
| Phase 4     | `openspec instructions tasks --change {changeName} --json`    | 获取 tasks 指令      |
| Phase 5     | `openspec status --change {changeName} --json`                | 查看工件图状态       |
| Phase 6     | `openspec archive {changeName} --yes`                         | 归档合并             |

---

## 项目文件系统结构

```
$PROJECT_ROOT/
├── .ace/
│   ├── project-profile.md                  # 项目技术画像
│   ├── experience.md                       # 项目经验库
│   ├── config.yaml                         # ACE 框架配置
│   ├── wiki/                               # 项目知识库
│   └── tasks/{changeName}/                 # spec 任务工作区
│       ├── state.json                      # 工作流状态 (type: "spec")
│       ├── context.md                      # 决策记录 + 中间结论
│       └── artifacts/                      # ACE 过程产物
│           ├── technical-design.md         # 完整技术设计
│           ├── prd.md                      # 需求文档 (来自 requirement-analysis)
│           ├── requirement-anchors-analysis.md
│           └── issues/                     # 问题追踪
│               ├── requirement-issues.md   # 业务/技术澄清
│               └── design-issues.md        # 设计决策记录
│
├── openspec/
│   ├── specs/{domain}/spec.md              # 源代码真理（OpenSpec 维护）
│   ├── changes/{changeName}/               # 由 `openspec new change` 创建
│   │   ├── .openspec.yaml                  # OpenSpec 管理（工件图状态）
│   │   ├── proposal.md                     # 提案
│   │   ├── design.md                       # 精简设计（OpenSpec validate）
│   │   ├── tasks.md                        # 任务规划
│   │   ├── notes.md                        # 归档复盘
│   │   └── specs/{domain}/spec.md          # Delta specs
│   ├── changes/archive/                    # 已完成（openspec archive 移动至此）
│   └── config.yaml                         # OpenSpec 项目配置
└── ...
```

### 产物归属边界

| 产物 | 位置 | 管理者 |
|------|------|--------|
| state.json | `.ace/tasks/{changeName}/` | ACE (spec-coding skill) |
| context.md | `.ace/tasks/{changeName}/` | ACE (spec-coding skill) |
| technical-design.md | `.ace/tasks/{changeName}/artifacts/` | ACE (spec-coding skill) |
| issues/ | `.ace/tasks/{changeName}/artifacts/` | ACE (spec-coding skill) |
| prd.md, anchors-analysis | `.ace/tasks/{changeName}/artifacts/` | ACE (requirement-analysis) |
| proposal.md | `openspec/changes/{changeName}/` | OpenSpec CLI |
| design.md | `openspec/changes/{changeName}/` | OpenSpec CLI |
| tasks.md | `openspec/changes/{changeName}/` | OpenSpec CLI |
| notes.md | `openspec/changes/{changeName}/` | OpenSpec CLI |
| specs/ | `openspec/changes/{changeName}/` | OpenSpec CLI |
| .openspec.yaml | `openspec/changes/{changeName}/` | OpenSpec CLI |

---

## 经验闭环

Phase 6 归档后触发经验提取：

- 触发条件：意外 / 踩坑 / 反直觉 / 可复用模式
- 存储：`.ace/experience.md`
- 格式：`E{N}: {描述} | 来源: {change-name} | 日期: {date}`
- 收敛：经验 > 20 条时提议合并/淘汰
