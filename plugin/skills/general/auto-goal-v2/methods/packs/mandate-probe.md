# Mandate 探针

> 命中信号：`MANDATE_UNCLEAR` —— Mandate 未评估或存在缺口。
> 更新：attainable、residual。

## 五个独立探针

能力不是布尔值。逐个探，因为**缺哪一个决定完全不同的正确终态**：

| 分量 | 探针问题 | 探测方式 |
|---|---|---|
| `effector` | 存在通往目标物的改变机制吗 | 列出可用工具/API/人类中介，检查是否真能改变 subject |
| `access` | 在该效应器上有凭证吗 | 尝试最小只读调用，确认凭证有效 |
| `authority` | 主体允许把它用于此事吗 | 检查是否有针对**此目标此动作**的授权 |
| `competence` | 用它能做对吗 | 检查领域知识、既有先例、失败模式认知 |
| `observation` | 行动后能独立读回吗 | 确认存在独立于动作本身的查询通路 |

## access 与 authority 必须分开探

**有密码不等于有授权**。这是最常被合并的两项，合并后「我有 token」会直接推导出「我可以发」。

```text
有凭证、无授权 → NEEDS_INPUT(APPROVAL_REQUIRED)，不执行
无凭证、有授权 → NEEDS_INPUT(ACCESS_REQUIRED)
两者皆无      → 先要授权，再要凭证（顺序不可反）
```

顺序有实际意义：先拿到凭证再问要不要用，等于把权限决策后置到已经具备执行能力之后。

## observation 是最常被忽略的分量

**能改变 ≠ 能验证**。外部系统类目标典型形态：

```text
effector：有（能发请求）
access：有（有 API key）
authority：有（用户批准）
observation：无（拿不到状态查询接口）
→ 动作可执行，但最高只能到 E1
→ 终态 UNVERIFIABLE，不是 DONE
```

探测方式：问「动作之后，我用什么**独立于该动作**的方式确认它生效了」。答案是「响应码 200」的话，observation 不存在——那只是动作痕迹。

## 探测时机

**规划期**，不是执行期。`partitionGoal()` 在 PLANNING 阶段计算 `attainable / residual`，因为：

```text
执行期才发现缺口 → 已经产生了副作用和成本，且用户在最后才知道
规划期发现缺口   → 可以当场重定范围或取得所需授权
```

「执行到最后才发现做不到」不是能力问题，是流程缺陷。

## 探针的最小侵入原则

探测本身不应产生副作用：

```text
好：只读调用确认凭证；查询接口确认存在;列出工具确认可用
坏：发一条测试消息看能不能发；改一个文件看有没有写权限
```

若只能通过产生副作用来探测，该探测本身需要走批准门。

## 缺口的正确处理

| 缺失 | 终态方向 | 交接物必须写 |
|---|---|---|
| `effector` | 重定为可达前缀 + residual | 需要人做什么，按什么顺序 |
| `access` | `NEEDS_INPUT` | 需要哪个凭证，从哪获取 |
| `authority` | `NEEDS_INPUT` | 需要谁批准什么 |
| `competence` | 有界重试后 `BLOCKED` | 需要什么专业能力 |
| `observation` | 可能 `UNVERIFIABLE` | 谁能确认生效，怎么确认 |

**头号失效**：用户说「帮我退订健身房」，Agent 发现无 effector，于是写了封邮件草稿报 DONE。

合法形态只有一种：

```markdown
我不能操作该网站（无 effector）。我能做到的是 <可达前缀>，
剩余 <residual> 需要你执行 <具体三步>。按此推进？
```

且需 decider 同意，且原始目标终态最多 `PARTIAL`。

## mandate 过期

```text
mandate.expires_at < now → authority 缺口重新打开
```

过期的授权不是授权。`assessStep()` 会在 mandate 过期时重新报出 `APPROVAL_REQUIRED`，即使之前批准过。
