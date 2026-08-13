# 方法路由表

> 唯一真相源。方法包按命中信号加载，未命中的不进入上下文。
> 机械实现：`protocols/runtime/router.mjs` 的 `SIGNALS` 表。

## 路由原则

**按目标形状路由，不按领域路由**。领域（软件/写作/调研/线下）不是分流依据——同一领域的两个目标可能需要完全不同的方法，而不同领域的两个目标可能共享同一个方法。

三条不做的事：

1. 不用固定问卷（十步澄清法作为顺序流程被否决）；
2. 不全文加载后在 prompt 内用 `[IF]` 跳过（对已进入上下文的内容无效）；
3. 不为每个领域写一套流水线（只测三轴取值，其余由取值推导）。

## 信号表

| 信号 | 可观察条件 | 方法包 | 更新目标 |
|---|---|---|---|
| `INPUT_IS_SOLUTION` | 输入描述的是动作/方案而非世界差量 | `outcome-reframing` | `intent` |
| `SUBJECT_AMBIGUOUS` | subject 无法解析到唯一指称，或 scope 未定义 | `ambiguity` | `subject/scope` |
| `RULE_DENSE` | 规则数 ≥3 或存在条件组合 | `decision-table` | criteria |
| `VAGUE_TERMS_PRESENT` | 存在模糊谓词 | `ambiguity` | criteria/constraints |
| `JUDGMENT_CRITERION` | 存在 `JUDGMENT/KNOWLEDGE` 判据 | `judgment-sampling` | evidence contract |
| `HIGH_BLAST_RADIUS` | `blast_radius` 为 `bounded_many/unbounded` | `target-enumeration` | approval scope |
| `DOMAIN_UNFAMILIAR` | 领域术语/惯例不熟 | `domain-anchoring` | assumptions/evidence |
| `SHADOW_PROCESS` | 存在人工补偿或影子流程 | `current-flow` | constraints |
| `LOAD_BEARING_ASSUMPTION` | 存在承重假设 | `examples-defeaters` | assumption status |
| `MANDATE_UNCLEAR` | Mandate 未评估或存在缺口 | `mandate-probe` | attainable/residual |

多个信号可命中同一方法包，包只加载一次。

## 方法包

| 包 | 一句话 | 文件 |
|---|---|---|
| `outcome-reframing` | 从方案反推目标差量 | `packs/outcome-reframing.md` |
| `ambiguity` | 六类歧义扫描与量化 | `packs/ambiguity.md` |
| `decision-table` | 规则穷举与半成功状态 | `packs/decision-table.md` |
| `judgment-sampling` | 尽早取样获取 acceptor 判定 | `packs/judgment-sampling.md` |
| `target-enumeration` | 枚举目标集并就枚举取批准 | `packs/target-enumeration.md` |
| `domain-anchoring` | 术语落地与先例查证 | `packs/domain-anchoring.md` |
| `current-flow` | 还原现状流程找隐含风控 | `packs/current-flow.md` |
| `examples-defeaters` | Steel-man 与 Defeater | `packs/examples-defeaters.md` |
| `mandate-probe` | 五分量能力探针 | `packs/mandate-probe.md` |

## 使用方式

```text
1. 观察当前 Goal / Mandate / 台账，填出信号输入
2. route(signals) → 命中的包列表
3. 只加载命中的包
4. 按包内方法更新对应目标字段
5. 更新后重新派生 Frontier（旧 Frontier 立即失效）
```

信号是**每轮重算**的，不是一次性分类。目标在推进中形状会变：一个原本清晰的 subject 可能在查证后发现有歧义，此时 `SUBJECT_AMBIGUOUS` 才命中。
