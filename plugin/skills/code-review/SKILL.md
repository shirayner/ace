---
name: code-review
description: |
  审查代码质量，发现 bug 和潜在问题。用户提到"review""审查""检查代码""找问题""看看有没有 bug"时触发。
  DO NOT TRIGGER: 写代码/修 bug（→ auto-goal 或直接 Edit）；写测试（→ ut）。
---

# Code Review — 代码审查编排

## 执行流程

### 1. 获取变更范围

```bash
# 标准：分支对比
git merge-base HEAD master
git diff master...HEAD

# 变更文件列表
git diff --name-only master...HEAD
```

如果无 diff 可获取 → AskUserQuestion 询问审查范围（目标分支 or 指定文件）。

---

### 2. 三层分析

| 层 | 关注点 | 分析方法 |
|----|--------|---------|
| **正确性** | 逻辑错误、边界、并发竞态 | 数据流 + 控制流分析 |
| **健壮性** | 异常处理、资源释放、输入验证 | 故障注入思维 |
| **设计质量** | 命名、职责、耦合、DRY | Clean Code 原则对照 |

详细分析框架：Read `references/code-review-guide.md`
Bug/坏味道速查：Read `references/code-smells.md`

---

### 3. 分级输出

按严重度分级：

- **Critical** — 可能导致生产事故的 bug 或安全漏洞
- **Warning** — 代码坏味道或潜在风险
- **Suggestion** — 可改进的设计和最佳实践
- **Positive** — 值得肯定的设计和实现

每个发现的格式：
```
[Critical] src/main/java/XxxService.java:42 — 并发修改共享状态无锁保护
  建议：使用 ConcurrentHashMap 或加 synchronized
```

---

## 复杂度适配

### 轻量（单文件 / <100 行 diff）
直接分析，无需规划

### 标准（多文件 / 100-500 行 diff）
Read references → 按文件分析 → 合并输出报告

### 深度（>500 行 diff / 架构级变更）
创建 `.tasks/review-{slug}/state.md` → 按模块分批审查
可并行：Read `shared/parallel-protocol.md`，每个 Agent 审查一个模块

---

## 交付格式

```markdown
# Code Review Report

## 统计
- 审查文件: N 个
- 变更行数: +X / -Y
- 发现: Critical M / Warning K / Suggestion J

## Critical
[Critical] file:line — 描述
  建议: 修复方案

## Warning
...

## Suggestion
...

## Positive
[Positive] file:line — 值得肯定的点
```

深度审查保存到：`.tasks/review-{slug}/code-review-report.md`

---

## 反模式

| 反模式 | 表现 | 解药 |
|--------|------|------|
| 噪声报告 | 充斥"建议添加注释"等通用建议 | 只报告该上下文特有的发现 |
| 漏高风险 | 纠结命名忽略并发 bug | 优先级：Critical > Warning > Suggestion |
| 无行号 | "某处有问题" | 精确到文件和行号 |
| 无方案 | 只说问题不给修复 | 每个问题附具体修复建议 |
| 全面肯定 | "代码质量很好" | 至少找到 1 个可改进点 |

---

## 深度参考

| 文件 | 内容 |
|------|------|
| `references/code-review-guide.md` | 三层分析框架、报告模板、diff 获取方法 |
| `references/code-smells.md` | Bug 风险模式、坏味道清单、设计问题速查 |
