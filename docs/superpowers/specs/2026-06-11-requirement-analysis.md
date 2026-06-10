# Requirement Analysis 演进设计

> 将 `requirement-anchors-analysis` 演进为 `requirement-analysis`，新增"原始需求 → 用户故事 PRD"阶段，与现有"PRD → 代码锚点分析"阶段组成完整需求分析流水线。

## 动机

现有 `requirement-anchors-analysis` Skill 直接以自然语言需求为输入做代码锚点分析，缺少结构化的中间产物。问题：

- 自然语言需求歧义多，直接跳入代码分析容易跑偏
- 缺少用户故事拆分步骤，需求粒度不可控
- 下游编码 Skill 缺少标准 PRD 作为统一输入

## 目标

- 新增 Phase A：原始需求 → 澄清 → 用户故事 → PRD（`prd.md`）
- 保留 Phase B：PRD → wiki 漏斗 → 代码确认 → 锚点分析（`requirement-anchors-analysis.md`，增加故事追溯）
- 两阶段自动衔接，按产物完整性决定是否跳过

## 产物

| 产物 | 阶段 | 格式 |
|------|------|------|
| `prd.md` | Phase A | 背景目标 + 用户角色 + 用户故事（Given/When/Then + 业务规则 + 优先级）+ 非功能需求 + 范围边界 |
| `requirement-anchors-analysis.md` | Phase B | 需求概要 + 锚点总览（含覆盖故事）+ 入口变更分析（覆盖故事/关联原因/当前行为/目标行为/逻辑变更5项/关键依赖8类） |
| `issues/requirement-issues.md` | A+B 共享 | 澄清问题（VOI分级）+ 记录假设 |

## 流水线

```
Phase A: 需求结构化
  A.1 输入获取 → A.2 场景理解 → A.3 需求澄清[Gate] → A.4 故事拆分 → A.5 PRD确认[Gate] → A.6 写入prd.md

Phase B: 代码锚点分析 (自动衔接)
  B.1 加载PRD → B.2 锚点初筛(逐故事) → B.3 锚点确认[Gate] → B.4 深度分析 → B.5 生成报告
```

## 跳过条件

| prd.md | anchors.md | 行为 |
|--------|-----------|------|
| 不存在 | 不存在 | 完整 A→B |
| 存在 | 不存在 | 跳过 A，从 B 开始 |
| 存在 | 存在 | 复用已有产物 |

## 文件结构

```
plugin/skills/requirement-analysis/          # 从 requirement-anchors-analysis 演进
├── SKILL.md                                  # 主 Skill（两阶段）
└── templates/
    ├── prd.md                                # 新增
    ├── requirement-anchors-analysis.md       # 增加覆盖故事字段
    └── requirement-issues.md                 # 不变
```

## 集成变更

- 删除旧 `plugin/skills/requirement-anchors-analysis/`
- `src/core/constants.js:105`：更新 skill 名
- `src/commands/doctor.js:44`：更新 skillNames 数组
