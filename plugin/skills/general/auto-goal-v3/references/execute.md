# EXECUTE — Work Graph、委派与生命周期

EXECUTE 阶段加载。

## 零、Controller 的位置

**Controller 调度，不实现。** 这一阶段你做四件事：建图、派发、收/核/审、记账。
**你不写交付产物**——写产物的是 subagent。

Controller 亲自动手的唯一后果不是"省了一次派发"，而是：

- 实现者即审查者，独立复审面消失（你会用意图补全证据的缺口）
- `delegation` 记录为空，图走不到 `reviewed`，`done` 会拒绝关闭

Controller 自己可以做的：读文件取证、跑门禁命令、`goal.py` 记账、写 `context.md`、
汇总 subagent 结论、写报告。

## 一、Work Graph

工作单元不是"话题分类"，也不必来自某棵树的叶子。每个 work item：

```text
{
  id, title, output, acceptance,
  criterion_ids,     该项推进哪些冻结标准（不能为空）
  depends_on,        信息依赖：需要别人的产出才能开始
  resources: { reads, writes, external, exclusive }
}
```

**一个 work item 的最小要件**：

- 有自己的产出物（文件、报告、可运行的东西）
- 有自己的完成判据（能独立判通过/失败）
- 不需要知道兄弟 item 的内部过程

不满足第三条 → 它不是 work item，是某个 item 的步骤，合并进去。

**`criterion_ids` 不能全空**：不推进任何冻结标准的 item，要么遗漏了标准，要么是范围外的
工作。两种都该在建图时发现，而不是等验收时发现没人验它。`plan` 会直接拒绝空值。

## 二、委派与并行：两个独立决定

把它们合并，就会得出"只有一个任务所以我自己做"——这句话里两个判断都错了。

| 决定 | 判据 | 结论 |
|---|---|---|
| **要不要委派** | 无条件 | 每个实现/修复 item 各派一个 fresh subagent |
| **要不要并行** | 依赖边 / 资源冲突 / 语义耦合 | 三者皆无 → 同轮并行；任一有 → 串行 |

- 图上只有一个 item：**照样派**，只是这一轮只派一个。
- 图上有 3 个 ready 且互不冲突：**必须在同一条 response 里派 3 个**。
- 图上有 3 个 ready 但 W2 与 W3 写同一文件：派 W1 与 W2，W3 等下一轮。

**没有数量门槛。** 不存在"必须拆 ≥3 个 item"或"≥2 个文件就必须并行"；也不存在
"只有一个所以自己做"。判据是依赖与冲突，不是计数。

### 并行判据

```text
parallel(A, B)  iff  无依赖边  且  资源不冲突
```

| 资源类 | 含什么 | 冲突条件 |
|---|---|---|
| `writes` | 要修改/创建的文件 | 交集非空 → 冲突 |
| `reads` | 要读且**可能被对方改**的文件、API、schema、配置 | 与对方 writes 交集非空 → 冲突 |
| `external` | 数据库、消息队列、远程环境、生成目录、git index | 同一目标 → 冲突 |
| `exclusive` | 端口、临时目录、构建产物、测试运行器 | 同一资源 → 冲突 |

**写入面无交集只排除了文本合并冲突。** 它不能排除 B 读取 A 将要修改的 API、两者共同
改变同一行为契约、或者抢同一个端口。所以**写入面是一项输入，不是唯一判据**。

补一道语义检查（比资源清单更接近真实依赖）：

> **如果 A 的结果完全不同，B 的执行方式会变吗？** 会 → 有依赖边。

| 关系 | 判定 | 动作 |
|---|---|---|
| 无依赖边 + 资源不冲突 | ⟂ 可并行 | 单条 response 并行派发 |
| 资源冲突 | 冲突 | 串行，或合并成一个 item |
| B 需要 A 的**产出**做输入 | 依赖 | `depends_on: [A]` |
| B 只需要 A 的**结论**且结论已知 | ⟂ | 把结论写进 B 的 prompt，并行 |

最后一行是压缩关键路径的主要手段：把已知结论固化进 prompt，依赖就消失了。

同时派多个时，**所有 Agent 调用放在同一条 response 里**——分散到多条就变回串行了。

## 三、生命周期：五步，一步不能跳

```text
planned → dispatched → returned → verified → reviewed
```

| 迁移 | 命令 | 谁做 | 门禁 |
|---|---|---|---|
| → planned | `plan --from <json>` | Controller | 整图校验：id 唯一、`criterion_ids` 非空且已知、依赖不悬空不成环、资源四类齐全 |
| planned → dispatched | `dispatch <id> --agent --invocation` | Controller 派 subagent | 依赖全部 ≥ verified；invocation 未用过；agent 未当过 reviewer；agent 未在本 item 被 FAIL 过 |
| dispatched → returned | `collect <id> --self-report --summary` | Controller 收返回 | summary 非空 |
| returned → verified | `verify <id> --evidence` | Controller 亲自取证 | evidence 非空 |
| verified → reviewed | `review <id> --agent --invocation --verdict --evidence` | 独立 reviewer | reviewer ∉ 实现者集合；invocation 未用过 |

标准覆盖不全时 `plan` 只**警告**不拦（允许分批建图），但 `done` 会因此拒绝关闭——
看到那条 stderr 就要么补 item，要么承认它本来不该是标准。

```bash
S={skill_dir}/scripts/goal.py; R=<root>; N=<name>

python3 $S plan     --root $R --name $N --from work-graph.json
python3 $S dispatch W1 --root $R --name $N --agent general-purpose --invocation w1-impl-1
python3 $S collect  W1 --root $R --name $N --self-report DONE --summary "改了 a.py:12-40"
python3 $S verify   W1 --root $R --name $N --evidence "wc -c a.py → 2048；grep 命中新函数"
python3 $S review   W1 --root $R --name $N --agent code-reviewer --invocation w1-review-1 \
                       --verdict PASS --evidence "实跑 pytest → 12 passed"
python3 $S graph    --root $R --name $N        # 看整图与各 item 当前 stage
```

**为什么是五个子命令而不是 `--status <值>`**：一个能接受终态的开关等于一条绕过所有中间
门禁的捷径。写 `--status done` 无法区分"Controller 顺手改完了"和"派了 fresh subagent、
收了返回、Controller 复核、又经独立审查"。拆成相邻迁移后，"必须委派"从一句自觉遵守的话
变成了状态不可跳跃。

### 三条身份规则

1. **依赖到 `verified` 才解锁下游。** 不是 `reviewed`——独立审查是关闭条件，不是产出
   条件；产出在 verified 时已在盘上且被 Controller 看过。但也不能更早：`returned` 只是
   subagent 的声明，下游拿到的会是未经核对的猜测。
2. **`invocation` 全局唯一。** 它标识一次具体调用。复用它等于声明那些工作是同一次运行，
   于是"每个 item 一个 fresh subagent"不成立。含历史记录：被 FAIL 烧掉的调用也占用它。
3. **实现者与审查者身份集合不相交。** 跨 item 也算——W1 的 reviewer 不能是 W2 的
   implementer。反之，同一个独立审查者审多个 item 合法：独立性是角色关系，不是人头数。

### review FAIL 的处理

`review --verdict FAIL` 会：把这次审查记进 `review_history`、把 `delegation` 挪进
`delegation_history`、清掉 controller 复核、**把 item 打回 `planned`**、退出码 2。

于是修复必须重新走一遍 `dispatch → collect → verify → review`，而且：

> **修复不能派给已声称过 DONE 的原 agent。** 它会倾向于论证 reviewer 判错了，而不是
> 重看证据。`dispatch` 会拦住这个 agent（`burnt_implementers` 是 per-item 的，
> 该 agent 实现图上别的 item 仍合法）。

也不要 Controller 自己修——那是把 FAIL 的产物交给了没有独立复审面的人。**派 fresh
implementer**，新 agent 身份 + 新 invocation。

### 整图重建

`plan` 只在**处女图**上可以重跑：任何 item 一旦发生过委派或审查，重建就会连带丢掉那些
记录（含 FAIL 与已烧掉的调用身份）。要改图，先把在途 item 走完，或换新目标 = 新目录。

## 四、自包含 prompt

subagent 有全新上下文：**它看不到本次对话的任何内容**。prompt 里缺的东西它只能猜。

```text
## 目标
<一句话：要造成什么差量>

## 背景（agent 无法自行得知的部分）
- 项目根：<绝对路径>
- 相关文件：<路径清单，含行号范围>
- 已定决策：<ALIGN 里定下的、会约束本 item 的取值>
- 已排除的方案：<以及为什么排除——防止它绕回来>

## 约束
- <技术约束、不许碰的文件、必须沿用的既有模式>

## 完成标准
- [ ] <可独立判定>

## 上下文预算纪律
- Grep/Glob 优于 Read；大文件带 offset/limit 局部读
- 不要全文读取：<点名具体文件与体积>
- 不要读 node_modules、构建产物、锁文件

## 返回格式
只返回结构化摘要（≤<N> 行）：
- 改了哪些文件（路径 + 一句话）
- 每条完成标准的自评：DONE / PARTIAL / BLOCKED + 一句话证据
- 遇到的意外与你的处置
不要粘贴文件全文，不要复述过程。
```

**"已排除的方案"这段不能省。** 少了它，subagent 会独立重新发现那个被否掉的方案，
理由看着还挺充分——然后你要么接受被推翻的决策，要么白烧一轮。

**上下文预算纪律**这段同样不能省：默认行为是大量 Read，一个 agent 就能把自己撑爆。
点名具体文件比泛泛说"注意节约"有效得多。

修复类 prompt 额外带上：**reviewer 的 FAIL 证据原文**，以及"上一轮做了什么"。不带前者，
新 agent 会重犯同一个问题；不带后者，它会重做已经对的部分。

## 五、返回值处理

subagent 的返回是**声明，不是证据**。所以 `collect` 的三个自评值都停在 `returned`，
由 `verify` 那一步的 Controller 取证决定能否前进。

- `DONE` → 你去现场核对（跑命令、读关键行），核对到了才 `verify`
- `PARTIAL` / `BLOCKED` → 先判是**卡在环境**（缺权限、缺依赖）还是**卡在语义**
  （需求本身没定）。语义类回 DISCOVER 补问，不要让 agent 再试一次
- 返回值自相矛盾（说改了文件但文件没动）→ 当 `BLOCKED` 处理，去看现场

**`verify` 的 `--evidence` 必须是你亲眼看到的东西**，命令 + 输出片段或文件路径 + 行号。
把 subagent 的 summary 重说一遍不是复核。

**三次同向失败 → 停下质疑前提。** 不要第四次重试。同向 = 同一路径、同一假设、只换参数。
三次都失败通常意味着前提错了，而不是姿势不对。

## 六、状态所有权

| 类别 | 载体 | 性质 |
|---|---|---|
| 规范状态 | `state.json`（只走 `goal.py`） | criterion identity、item 生命周期、委派与审查身份、归档。**必须机械一致** |
| 叙事产物 | `context.md`、`artifacts/` | 分析过程、决策树视图、研究笔记。人读 |
| UI 投影 | TaskCreate / TaskUpdate | 可丢弃、可重建，不是真相源 |

只有第一类必须机械一致，所以只有它走脚本。**TaskUpdate completed 不推进任何 item**，
也不关闭目标。新目标 = 新目录，不复用上一个。

## 七、永不空手而归

任意时刻被中断，磁盘上都应该有可用产出。

- 先做**不依赖未决问题**的部分，把不确定的推到后面
- 每个 item 一走完一步就记账，不要攒到最后一起写
- 发现方向错了 → 保留已产出的可用部分，说清哪些作废及原因，不要静默丢弃
