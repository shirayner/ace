# Spec 规范驱动开发

OpenSpec 集成的需求管理与设计决策追踪。

> **进阶阅读**: [aspec — 寄生模式增强型 OpenSpec](aspec.md) 详细介绍了 ACE 的 spec coding 完整工作流（三个命令），包含需求/设计澄清门禁、对齐确认协议和知识进化体系。

---

## 什么是 Spec

Spec 是 ACE 集成的**规范驱动开发工作流**，基于 OpenSpec 框架：

```
需求澄清 → 需求文档 → 设计决策 → 代码实现
    ↑                                    ↓
    └────────── 可追溯 ←─────────────────┘
```

---

## 目录结构

```
openspec/
├── config.yaml              # OpenSpec 配置（aspec 通过 context/rules 注入增强）
├── dimensions.md            # 澄清维度（需求 6 维 + 设计 7 维 + 项目已知盲区）
└── experience-template.md   # 项目经验库（技术决策/领域词汇/风险图谱/复盘记录）
```

---

## 初始化

```bash
ace spec init [path]
```

选项：
- `--force` — 覆盖现有配置
- `--dry-run` — 预览不执行
- `--skip-openspec` — 跳过 openspec CLI 安装

---

## 核心组件

### 1. config.yaml（中枢配置）

aspec 的所有流程控制通过 config.yaml 的两个通道注入：

- **context**：背景知识（流程概览、门禁条件、澄清协议、知识进化规则、语言指令）
- **rules**：阶段门禁（以字符串数组格式注入到 OpenSpec 各阶段的 pre/post/constraint）

### 2. dimensions.md（澄清维度）

定义需求和设计澄清的参考维度，用于系统性识别不确定性：

| 类型 | 维度 |
|------|------|
| 需求 | 功能完整性 · 数据关切 · 用户体验 · 边界异常 · 集成依赖 · 优先级范围 |
| 设计 | 架构决策 · 技术选型 · 接口设计 · 数据状态 · 安全合规 · 性能可靠性 · 部署运维 |

维度作为参考而非约束，AI 可自主探索新的不确定性。文件底部的"项目已知盲区"段由知识进化自动维护。

### 3. experience-template.md（项目经验库）

统一的知识沉淀文件，包含四个段：

| 段 | 内容 | 更新时机 |
|----|------|----------|
| 技术决策 (ADR) | 选择 + 理由 + 备选方案 | 每次 apply 完成后 |
| 领域词汇 | 定义 + 首次出现 | 每次 apply 完成后 |
| 风险图谱 | 代码热点 + 问题模式 | 每次 apply 完成后 |
| 复盘记录 | 变更概述 · 澄清质量 · 过程经验 | 每次 apply 完成后 |

---

## 工作流程

### 完整流程

```
explore → [需求澄清 → 对齐确认] → proposal → specs
       → [设计澄清 → 对齐确认] → design.md → [用户审批] → tasks
       → apply → [复盘与知识进化] → archive → [收敛检查]
```

### 运行时产物（spec/ 目录）

在开发过程中，OpenSpec 在 `spec/` 目录下生成运行时工件：

- `spec/proposal.md` — 需求提案
- `spec/requirement-issues.md` — 需求澄清问题
- `spec/design-issues.md` — 设计澄清问题
- `spec/design.md` — 技术设计文档
- `spec/tasks.md` — 实施任务计划
- `spec/notes.md` — 实施观察笔记

---

## 可追溯性

```
需求澄清 → proposal → specs → design → tasks → apply
    ↑                                              ↓
    └──────── experience.md 知识沉淀 ←─────────────┘
```

所有澄清决策、设计理由、实施观察形成完整链路，沉淀到 experience.md。

---

## 最佳实践

1. **每个需求必须有 REQ 文档** — 口头需求转化为书面
2. **重大决策必须有 ADR** — 记录决策理由
3. **保持可追溯** — 文档间相互引用
4. **定期回顾** — 更新过时的文档
5. **版本控制** — openspec/ 目录纳入 Git

---

## 故障排除

### 规范冲突

```
多个项目使用不同规范
```

**解决**：在项目级 openspec/config.yaml 中定义项目特定规则

### 文档过时

```
代码已改，文档未更新
```

**解决**：在代码审查中检查文档同步，或定期执行 `ace spec audit`
