# 交接物模板

> 所有终态都必须产出交接物 —— 包括 `DONE`。**永不空手而归**是字段约束，不是口号。
> 机械校验：`validateHandoff()`（不变量 I15）。

## 通用骨架

```markdown
# <目标差量一句话>

**终态**：<DONE | PARTIAL | BLOCKED | UNVERIFIABLE>
**scope_version**：<N>（已由 <decider> 批准）

## 判据结论

| ID | 类型 | 状态 | required | achieved | 证据 |
|---|---|---|---|---|---|
| c-1 | STATE | SATISFIED | E2 | E2 | <artifact pointer> |

## Residual

<Agent 不可达或本轮未完成的部分；为空时写「无」，字段不可省略>

- **项**：<具体内容>
  - 责任人：<谁>
  - 下一动作：<人类可独立执行的最小充分指令>
  - 所需输入：<需要什么>
  - 验收方式：<如何确认完成>
```

## 各终态必带内容

| 终态 | 除骨架外必带 |
|---|---|
| `DONE` | scope_version；逐判据证据指针与等级；constraints 结果 |
| `PARTIAL` | coherent 已完成集；未完成集；residual；责任人与 next action |
| `BLOCKED` | reason；缺口；已尝试什么；为何必须改计划；安全状态/回滚结果 |
| `UNVERIFIABLE` | 已达最高等级；上限原因；谁能最终判定；已有产物 |
| `NEEDS_INPUT` | 单一问题；所需主体；resume token；不回复时的默认动作 |

## PARTIAL 的额外要求

已交付部分必须是**自身可用的前缀**（coherent）。若中断处状态不自洽（半改坏），正确终态是 `BLOCKED` + 先回滚，不是 `PARTIAL`。

```markdown
## 已完成（自身可用）

- <可独立使用的成果>

## 未完成

- <未完成项，及其与已完成部分的边界>
```

## BLOCKED 的额外要求

```markdown
## 阻塞原因

**reason**：<FALSIFIED | EXHAUSTED | PLAN_CHANGE_REQUIRED | CONSTRAINT_VIOLATED | INCOHERENT_STATE | INVARIANT_VIOLATED>

**缺什么**：<继续推进所需之物，及为何当前无可触达行为者能提供>
**已尝试**：<尝试过的路径与结果>
**为何必须改计划**：<而非仅需一句回答>
**安全状态**：<当前世界状态是否自洽；已执行的回滚>
**可选替代方向**：<若有>
```

若「缺什么」能由某个 principal 一句回答提供，则终态应为 `NEEDS_INPUT` 而非 `BLOCKED`——分界不是「谁的错」，而是**可恢复性**。

## UNVERIFIABLE 的额外要求

```markdown
## 验证上限

**已达最高等级**：<E_n>，通过 <什么手段>
**为何无法更高**：<判据类型上限 / 观测能力缺失 / acceptor 不可触达>
**谁能最终判定**：<具体主体>
**已有产物**：<artifact pointers>
```

声称 `UNVERIFIABLE` 前必须已尝试最高可得等级。可用的验证尚未运行时，状态是 `UNTESTED`，属尽责失败，应报 `PARTIAL` 或去找 acceptor。

## 反模式

| 写法 | 问题 |
|---|---|
| 「已完成，无遗留」但 residual 字段缺失 | 字段不可省略，为空要显式写「无」 |
| 「已发送请求，任务完成」 | 请求成功只是 E1，不是 STATE 满足 |
| 「没有任何问题」 | 全称否定不可证，改为有界检查面 |
| 「按我的评分标准质量达标」 | 判定型判据不可自评 |
| BLOCKED 但未说明为何不能靠提问解决 | 应先判断是否为 NEEDS_INPUT |
| 交接物只列问题不给下一动作 | residual 必须可被人独立执行 |
