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

1. `openspec/` 目录存在 — 否则提示 `openspec init`
2. OpenSpec CLI 可用 — 否则提示安装 `@anthropic-ai/openspec`
3. `.ace/config.yaml` 存在 → Read 并解析 `spec-coding` 节
   - 不存在 → 使用默认配置（mode: manual, auto_archive: false, auto_push: false, use_subagent: true）

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
  Phase 5 → invoke /subagent-execute
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

| 当前阶段 | 事件 | 目标阶段 | 守护条件 |
|---------|------|---------|---------|
| - | `init` | understand | 用户触发 /spec-coding |
| understand | `aligned` | propose | AskUserQuestion 确认对齐 |
| propose | `proposed` | design | proposal.md + delta-spec + openspec validate 通过 |
| design | `designed` | plan | design.md 生成 + 用户审批 |
| plan | `planned` | apply | tasks.md 生成 + 用户批准 |
| apply | `applied` | archive | 所有任务完成 |
| archive | `archived` | (终态) | 归档完成 |

### 回退路径

| 阶段 | 回退条件 | 目标 |
|------|---------|------|
| design | 用户否决设计 | → understand（重新对齐） |
| apply | 发现设计缺陷 | → design |

---

## 自动恢复检测

```
启动时（用户调用 /spec-coding 或说"继续"）：
1. 运行 `openspec list --json`（获取活跃变更列表）
2. 对每个变更检查 .ace-state.json 是否存在
3. 有 spec-coding 管理的活跃变更 → 读 phase → 路由
4. 多个活跃变更 → AskUserQuestion 选择
5. 无活跃变更 → Phase 1 (understand)

降级路径（.ace-state.json 丢失但 change 存在）：
  1. 运行 `openspec status --change {name} --json`
  2. 从 artifact 完成状态推断当前 phase：
     proposal done + specs done + design done → phase = plan
     proposal done + specs done → phase = design
     proposal done → phase = propose（完成）或 design（开始）
     无 artifact → phase = understand
  3. 重建 .ace-state.json
  4. AskUserQuestion 确认推断是否正确
```

---

## 阶段路由

进入每阶段时 Read `phases/{phase}.md`，按其指令执行。

| phase | 行为 |
|-------|------|
| understand | Read `phases/understand.md` → 内部分析 + 交互对齐 |
| propose | Read `phases/propose.md` → 创建提案（OpenSpec CLI） |
| design | Read `phases/design.md` → 深入代码探索 + 技术设计 |
| plan | Read `phases/plan.md` → 任务编排 |
| apply | invoke `/subagent-execute`（或 direct 模式） |
| archive | Read `phases/archive.md` → 归档收尾 |

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

| 分级 | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 | Phase 6 |
|------|---------|---------|---------|---------|---------|---------|
| trivial | 简化对齐 | 跳过 | 跳过 | 跳过（内联 tasks） | TDD 实现 | 简化 |
| small | ✅ | tasks only | 跳过 | ✅ | TDD 实现 | ✅ |
| standard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| large | ✅ + 分解 | ✅ | ✅ | ✅ | ✅ | ✅ |

**分级时机**：Phase 1 结束后、进入 Phase 2 前。
**存储**：写入 `.ace-state.json` 的 `workflow` 字段。
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

## 状态文件：`.ace-state.json`

存放于 `openspec/changes/{name}/.ace-state.json`，与 `.openspec.yaml` 共存：

```json
{
  "change_name": "add-user-auth",
  "created_at": "2026-06-08",
  "workflow": "standard",
  "phase": "apply",
  "phase_started_at": "2026-06-08T14:30:00",
  "understanding": {
    "insights_count": 3,
    "assumptions_count": 4,
    "scope_assessment": "appropriate",
    "aligned": true
  },
  "proposal": "proposal.md",
  "delta_specs": ["specs/auth/spec.md"],
  "design_doc": "design.md",
  "design_approved": true,
  "tasks_file": "tasks.md",
  "total_tasks": 8,
  "completed_tasks": 5,
  "apply_mode": "subagent",
  "isolation": "branch",
  "branch_name": "feat/spec-add-user-auth",
  "current_task": 6,
  "archived": false,
  "experience_extracted": false
}
```

---

## OpenSpec CLI 集成点

| 阶段 | CLI 命令 | 用途 |
|------|---------|------|
| 启动/恢复 | `openspec list --json` | 检测活跃变更 |
| Phase 2 | `openspec new change {name}` | 创建 change 目录结构 |
| Phase 2 | `openspec instructions proposal --change {name} --json` | 获取写作指令 |
| Phase 2 | `openspec instructions specs --change {name} --json` | 获取 spec 写作指令 |
| Phase 2/3/4 | `openspec validate --json` | 验证 artifact 格式 |
| Phase 3 | `openspec instructions design --change {name} --json` | 获取 design 指令 |
| Phase 4 | `openspec instructions tasks --change {name} --json` | 获取 tasks 指令 |
| Phase 5 | `openspec status --change {name} --json` | 查看工件图状态 |
| Phase 6 | `openspec archive {name} --yes` | 归档合并 |

---

## 项目文件系统结构

```
$PROJECT_ROOT/
├── .ace/
│   ├── experience.md              # 项目经验库（spec-coding 维护）
│   └── config.yaml                # ACE 框架配置
│
├── openspec/
│   ├── specs/{domain}/spec.md     # 源代码真理（OpenSpec 维护）
│   ├── changes/{change-name}/     # 由 `openspec new change` 创建
│   │   ├── .openspec.yaml         # OpenSpec 管理（工件图状态）
│   │   ├── .ace-state.json        # spec-coding 管理（工作流状态）
│   │   ├── proposal.md
│   │   ├── design.md              # 精简决策记录（OpenSpec validate）
│   │   ├── technical-design.md    # 完整设计参考（spec-coding 私有）
│   │   ├── tasks.md
│   │   ├── specs/{domain}/spec.md # Delta specs
│   │   ├── issues/
│   │   └── notes.md
│   ├── changes/archive/           # 已完成（openspec archive 移动至此）
│   └── config.yaml                # OpenSpec 项目配置
└── ...
```

---

## 经验闭环

Phase 6 归档后触发经验提取：
- 触发条件：意外 / 踩坑 / 反直觉 / 可复用模式
- 存储：`.ace/experience.md`
- 格式：`E{N}: {描述} | 来源: {change-name} | 日期: {date}`
- 收敛：经验 > 20 条时提议合并/淘汰
