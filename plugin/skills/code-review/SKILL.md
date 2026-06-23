---
name: code-review
description: |
  审查代码质量，发现 bug 和潜在问题。用户提到"review""审查""检查代码""找问题""看看有没有 bug"时触发。
  DO NOT TRIGGER: 写代码/修 bug（→ auto-goal 或直接 Edit）；写测试（→ ut）。
---

# Code Review — 代码审查编排

> 设计哲学：渐进式展示（Progressive Disclosure）+ 认知负荷控制。
> 每一层信息只在需要时展开，审查者在任何时刻只需处理 ≤4 个信息块。

---

## Effort 分级

审查深度由 effort 参数控制（用户可在 args 中指定，如 `--effort high`）：

| Effort | 覆盖范围 | 适用场景 |
|--------|---------|---------|
| **low** | 仅 Critical + Warning（高置信度） | 快速检查、小改动 |
| **medium**（默认） | Critical + Warning + Suggestion | 日常 review |
| **high** | 全维度 + 需求一致性 + 架构影响 | 重要功能、大变更 |
| **max** | high + 交叉验证 + 认知负荷审查 | 核心系统、高风险变更 |

未指定时默认 medium。effort 决定加载的分析框架深度和报告详细程度。

---

## 执行流程

### Phase 1: 上下文建立

```bash
# 自动探测远程默认分支（优先 origin/main，fallback 到 origin/master）
BASE=$(git rev-parse --verify origin/main 2>/dev/null && echo origin/main || echo origin/master)

# 获取变更范围
git diff --stat $BASE...HEAD
git diff --name-only $BASE...HEAD
git diff $BASE...HEAD
```

如果无 diff 可获取 → AskUserQuestion 询问审查范围（目标分支 or 指定文件）。

**需求输入（可选）：** 若用户在 args 中提供了需求文档路径或需求描述，Read 该文档作为审查基准。
格式：`/code-review --requirement path/to/spec.md` 或 `--requirement "需求描述文本"`

---

### Phase 2: 变更意图识别

在逐行分析前，先整体理解：

1. **变更目的**：这次改动在解决什么问题？（从 commit messages + diff 整体推断）
2. **影响范围**：哪些模块/接口的行为会改变？
3. **设计决策**：作者做了哪些关键取舍？

产出一段 2-3 句话的「变更意图摘要」，作为报告开头。

---

### Phase 3: 分层分析

#### 基础层 — 正确性（所有 effort 级别）

| 维度 | 分析方法 |
|------|---------|
| 逻辑正确性 | 数据流 + 控制流跟踪 |
| 边界条件 | 空值、零值、极端输入、整数溢出 |
| 并发安全 | 竞态、可见性、原子性 |
| 资源管理 | 泄漏、异常路径释放 |

#### 质量层 — 设计与可维护性（medium+）

| 维度 | 分析方法 |
|------|---------|
| 命名与意图 | 名副其实？读者无需跳转即可理解？ |
| 职责边界 | 单一职责？修改理由唯一？ |
| 耦合与依赖 | 依赖方向正确？抽象稳定？ |
| DRY 与简洁 | 重复？过度工程？ |

#### 需求一致性层 — spec 对照（high+ 且有需求输入时）

| 检查项 | 方法 |
|--------|------|
| 功能完整性 | 需求中的每个 AC 是否都有对应实现？ |
| 边界语义 | 需求隐含的边界（如"最多""至少"）是否正确实现？ |
| 缺失场景 | 需求提到但代码未覆盖的异常路径？ |
| 过度实现 | 代码做了需求未要求的事（范围蔓延）？ |

#### 认知负荷层 — 可读性深度（max 级别）

| 检查项 | 原理 |
|--------|------|
| 工作记忆超载 | 单个函数需要同时记住 >4 个状态变量？ |
| 外在认知负荷 | 复杂条件未提取为命名变量？深嵌套？ |
| 知识诅咒 | 依赖只有作者知道的隐含知识？ |
| 注意力竞争 | 关键逻辑被样板代码淹没？ |

详细分析框架：Read `references/code-review-guide.md`
Bug/坏味道速查：Read `references/code-smells.md`

---

### Phase 4: 分级输出

严重度定义（借鉴控制论反馈信号强度）：

| 级别 | 语义 | 行动要求 |
|------|------|---------|
| **Critical** | 生产事故 / 安全漏洞 / 数据损坏 | 必须修复才能合并 |
| **Warning** | 潜在风险 / 坏味道 / 需求偏离 | 强烈建议修复 |
| **Suggestion** | 可改进的设计 / 认知负荷优化 | 可选择采纳 |
| **Positive** | 值得肯定的实践 | 知识传播 + 正向激励 |

---

## 复杂度适配

### 轻量（单文件 / <100 行 diff）
直接分析，无需规划。effort 默认 low。

### 标准（多文件 / 100-500 行 diff）
Read references → 按文件分析 → 合并输出报告。effort 默认 medium。

### 深度（>500 行 diff / 架构级变更）
创建如下 state.json 后按模块分批审查：
```json
{
  "changeName": "review-{slug}",
  "type": "simple",
  "skillName": "code-review",
  "status": "in_progress",
  "created_at": "{ISO时间}",
  "updated_at": "{ISO时间}",
  "completed_at": null,
  "archived_at": null,
  "completion_criteria": ["审查报告已生成"],
  "tasks": [],
  "simple": { "phase": "executing", "decisions": [] }
}
```
可并行：Read `../../shared/parallel-protocol.md`，每个 Agent 审查一个模块。
effort 默认 high。

审查完成后执行归档：
```bash
ace task complete review-{slug}
ace task archive review-{slug}
```

---

## 交付格式

```markdown
# Code Review Report

## 变更意图
> 一段话概括本次变更的目的和设计决策。帮助 reviewer 建立心智模型。

## 概览
| 指标 | 值 |
|------|------|
| 分支 | `<current-branch>` → `<base-branch>` |
| 审查文件 | N 个（生产代码 M 个） |
| 变更行数 | +X / -Y |
| Effort | medium |
| 发现 | 🔴 Critical M / 🟡 Warning K / 🔵 Suggestion J |

## 🔴 Critical — 必须修复

### C1. [文件路径:行号] 问题标题
**问题**: 具体描述（一句话，可独立理解）
**影响**: 可能造成什么后果
**修复**:
```语言
// 修复示例
```

---

## 🟡 Warning — 强烈建议修复

### W1. [文件路径:行号] 问题标题
**问题**: 具体描述
**风险**: 什么条件下会出问题
**建议**: 修复方向

---

## 🔵 Suggestion — 可选优化

### S1. [文件路径:行号] 建议标题
**现状**: 当前实现的问题
**建议**: 改进方向和理由

---

## ⚠️ 需求一致性（仅当提供需求时）

### R1. [需求条目] 偏差标题
**需求**: 引用原文
**现状**: 代码实际行为
**差距**: 具体差异

---

## ✅ Positive — 值得肯定

- [文件路径] 简述亮点和设计理由

## 总结
| 级别 | 数量 | 关键发现 |
|------|------|---------|
| Critical | M | 最重要的 1-2 条摘要 |
| Warning | K | 最重要的 1-2 条摘要 |
| Suggestion | J | — |
```

深度审查保存到：`.ace/tasks/review-{slug}/artifacts/code-review-report.md`

---

## 反模式

| 反模式 | 表现 | 解药 |
|--------|------|------|
| **噪声轰炸** | 充斥"建议添加注释"等通用建议 | 只报告该上下文特有的发现 |
| **漏高风险** | 纠结命名忽略并发 bug | 优先级：Critical > Warning > Suggestion |
| **无行号** | "某处有问题" | 精确到文件和行号 |
| **无方案** | 只说问题不给修复 | 每个问题附具体修复建议 |
| **全面肯定** | "代码质量很好" | 至少找到 1 个可改进点 |
| **认知超载** | 单条发现需要读 5 遍才懂 | 问题描述一句话可独立理解 |
| **需求盲区** | 只看代码不看业务语义 | 有需求时必须做 spec 对照 |
| **假阳性堆砌** | 列了 20 条 Suggestion 全是可选项 | 按 effort 控制输出量 |
| **重复条目** | 同一问题出现多次 | 合并同类项，引用多处出现位置 |

---

## 深度参考

| 文件 | 内容 |
|------|------|
| `references/code-review-guide.md` | 分层分析框架、报告模板、diff 获取方法、认知负荷原理 |
| `references/code-smells.md` | Bug 风险模式、坏味道清单、设计问题、需求偏离模式 |
