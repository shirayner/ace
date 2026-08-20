# VERIFY / CLOSE — 独立验收与关闭

VERIFY/CLOSE 阶段加载。

## 一、两层独立审查，别混为一谈

这个 skill 有两层独立性，作用面不同：

| 层 | 对象 | 命令 | 作用 |
|---|---|---|---|
| **per-item review** | 单个 work item 的产出 | `goal.py review <id>` | 该 item 的实现被独立看过一遍 |
| **目标级 verify** | 冻结标准整体 | 独立 verifier Agent + `accept-report` | 用户确认的每条标准都有现场证据 |

item 全部 `reviewed` 不等于目标达成——每块砖都合格，墙可能还是砌歪的。
目标级验收全 PASS 也不等于工作被真正委派过——报告可以在一张没人做过的图上全绿。
所以 `done` 同时要求两者，缺一不可。

## 二、为什么验收者必须独立

执行者验收自己的产出，会把"我做了这个动作"当成"目标达成了"。这不是态度问题——
执行者知道自己的意图，会不自觉地用意图补全证据的缺口。

所以 verifier：

- **不看执行过程**：不给它执行日志、不给它 subagent 的返回摘要、不告诉它谁做了什么
- **只拿冻结标准 + 项目现场**：标准文本 + 项目根路径，其余自己取证
- **不参与修复**：修复者即审查者会失去独立复审面。它只判定

给了执行摘要，verifier 就会顺着摘要去"确认"，而不是独立取证。这是最容易破的一条。

同一条判据在 per-item 层由脚本强制：`review --agent` 不能是本 item 的实现者，也不能是
本图任何 item 的实现者（`impl_agents ∩ review_agents = ∅`），`--invocation` 不能复用。

## 三、取冻结标准

**不要手抄标准给 verifier。** 手抄会改措辞，改了措辞就等于验收另一件事。

```bash
python3 {skill_dir}/scripts/goal.py criteria --root <root> --name <name> --json
```

输出即 verifier 需要的全部：每条标准的 `id` + 原文，以及集合指纹 `criteria_sha256`。
把它整段贴进 prompt。

## 四、verifier prompt 模板

```text
你是独立验收者。你**不知道**这个项目是怎么做出来的，也不需要知道。
你的任务：对下列每条完成标准，在项目现场取证，判定通过或失败。

## 项目根
<绝对路径>

## 完成标准（逐条判定，不合并、不增删、不跳过）
<粘贴 `goal.py criteria --json` 的输出>

## 取证规则
- 每条判定必须附**可复现的证据**：命令 + 实际输出片段，或文件路径 + 行号
- 能跑就跑：测试、脚本、CLI 实跑优于读代码推断
- 只读代码推断出的"应该能行" = 证据不足，判 UNVERIFIABLE 而非 PASS
- 不要修任何东西。发现问题只记录，不动手
- 上下文纪律：Grep/Glob 优于 Read，大文件带 offset/limit

## 判定词汇（三选一，不得自造）
- PASS — 取到了直接证据，标准成立
- FAIL — 取到了反证，标准不成立
- UNVERIFIABLE — 已取到最高可得证据仍无法判定（说明缺什么证据、为什么取不到）

## 返回格式（严格 JSON，无代码块外文字）
{
  "criteria_sha256": "<原样回显上面给你的集合指纹>",
  "verdicts": [
    {"criterion_id": "C001", "verdict": "PASS", "evidence": "npm test → 384 passing 0 failing"},
    {"criterion_id": "C002", "verdict": "FAIL", "evidence": "execute.md 不存在，find 返回空"}
  ],
  "notes": "<可选：标准没覆盖但值得知道的问题>"
}

每条标准恰好一条 verdict，用它的 criterion_id 标明判的是哪条。
```

**`criterion_id` 与 `criteria_sha256` 都是必填。** 脚本靠它们证明"用户确认的每条标准
都有且仅有一条现场证据判定"。按数组位置对齐的旧格式已废弃——错位与重复都无法被发现。

## 五、判定词汇的语义

**只有三个值，不得自造第四个。**

| 判定 | 含义 | 常见误用 |
|---|---|---|
| `PASS` | 取到直接证据 | 把"代码看起来对"当 PASS —— 那是 UNVERIFIABLE |
| `FAIL` | 取到反证 | 把"没找到证据"当 FAIL —— 那是 UNVERIFIABLE |
| `UNVERIFIABLE` | 已尽力仍无法判定 | 当逃避出口 —— 必须说明缺什么证据、为什么取不到 |

`UNVERIFIABLE` 是**合法终态**，比假 DONE 好得多。假 DONE 把不确定性转移给了用户，
而且掩盖了它；UNVERIFIABLE 把不确定性明确交还。

## 六、判定不由叙述宣布

**做了某动作 ≠ 目标已达成。**

- 写了文件 ≠ 文件内容正确
- 测试全绿 ≠ 测试测了该测的东西
- 声明了预算 ≠ 有人校验预算（**每个数字约束都要有量真实字节的门禁**）
- 脚本存在 ≠ 脚本能跑（**必须实跑，不能读代码推断**）
- 门禁存在 ≠ 门禁生效（**对实现侧做变异，看测试是否转红**）
- item 标成 done ≠ 有人做过它（**所以状态是五步迁移，不是一个布尔值**）

倒数第二条是本 skill 自己的翻车点：上一版 `accept-report` 只数数组长度，
0 条标准可初始化、重复 `id` 可聚合成全 PASS，而所有测试都是绿的。

## 七、聚合与机械校验

```bash
python3 {skill_dir}/scripts/goal.py accept-report --root <root> --name <name> --from <verdict.json>
```

脚本在这里**只做机械校验**，不判断证据够不够：

1. criteria 非空、每条文本 hash 与冻结值一致
2. 报告回显的 `criteria_sha256` 等于 state 中的冻结值
3. 每个 `criterion_id` 都是已知 ID
4. 无重复 ID、无遗漏标准（**完全双射**）
5. verdict 属于三值枚举，evidence 非空
6. `FAIL` → 退出码 2，阻止关闭

任一条不满足即报错退出。**这些是字符串与集合运算，不是语义判断**——
脚本不评价证据质量，那是模型的工作。

结果处理：

- **任一条 FAIL** → 修复后**重新完整验收**（不是只补验那一条：修复可能破坏别的条目）。
  修复期间**不得声称完成**
- **有 UNVERIFIABLE 无 FAIL** → 先判断能否补出证据（加测试、加日志、实跑）。
  能补就补完再验；确实补不出，走 partial 关闭
- **全 PASS** → 走关闭门禁

**FAIL 的修复不交给已声称过 DONE 的原 agent，也不由 Controller 自己改** —— 前者会倾向
论证 verifier 判错了，后者没有独立复审面。**派 fresh implementer**：走一遍
`dispatch → collect → verify → review`（细则见 `execute.md`），然后重跑整份验收。

## 八、关闭

<HARD-GATE>
关闭是任务生命周期的**必要结束步骤**。TaskUpdate completed ≠ 关闭（两套系统独立，
TaskUpdate 是可丢弃的 UI 投影，它不推进任何 item，也不写 outcome）。
未关闭 = state.json 永远 in_progress，任务悬空，对话结束后无法补救。

Terminal state = 此命令执行成功：

```bash
# 全 PASS
python3 {skill_dir}/scripts/goal.py done --root <root> --name <name>

# 有 UNVERIFIABLE、无 FAIL：必须显式承认交付不完整
python3 {skill_dir}/scripts/goal.py done --root <root> --name <name> --accept-partial
```
</HARD-GATE>

`done` **重新推导一切，不信任 state 里存着的任何结论**——手改 tally、事后改标准、
手写 lifecycle 都在这里被抓住。它按诊断精度排序检查（"没人做过 C002" 比 "C002 证据不足"
更接近根因）：

**图门禁**（先跑，早于验收报告）：

1. 整图结构重校验：id 唯一、`criterion_ids` 非空且已知、依赖不悬空不成环、资源四类齐全
2. **每条冻结标准至少被一个 item 覆盖** —— 没有 item 推进它 = 没人做过它
3. **所有 item 都在 `reviewed`** —— 未走完的 item 意味着产出没经过独立审查
4. 每个 reviewed item 的五步记录都在盘上：`delegation`（agent / invocation / summary /
   returned_at / self_report ∈ 三值）、`controller_verification.evidence`、
   `independent_review`（agent / invocation / evidence，verdict = PASS）
5. 图级身份约束：实现者集合 ∩ 审查者集合 = ∅；invocation 全局唯一

**验收门禁**：重跑双射校验并从 verdicts 重算 tally，然后：

| 判定分布 | 结果 |
|---|---|
| 有 `FAIL` | 拒绝关闭 |
| 有 `UNVERIFIABLE`，无 `--accept-partial` | 拒绝关闭 |
| 有 `UNVERIFIABLE` + `--accept-partial` | `outcome=partial` 后归档 |
| 全 `PASS` | `outcome=completed` 后归档 |

**`outcome` 与 `status` 是两件事**：`status` 是生命周期（归档需要 `completed`），
`outcome` 是交付结论。分开记，才能既诚实报告 partial 又正常归档——
合并它们就必须二选一。

归档走 `ace task done`（`done` 会调用它），找不到 `ace` CLI 时直接报错、不降级：
手工挪目录会让 state.json 与磁盘失配。

**以 partial 交付时，向用户报告必须点明哪条标准未能验证及原因。** 归档成功不等于
目标达成，隐去这句话就是用流程状态冒充交付结论。

## 九、关闭前顺手做

- 核心决策落 `<root>/.ace/project/decisions.md`（准入铁律见 SKILL.md）
- 经验检查：意外 / 踩坑 / 反直觉 / 可复用模式 → 写 `<root>/.ace/experience.md`
- **无论有无新经验都要一行式告知用户**：
  - 有：`📝 经验提取：E{N} 已写入（简述发现）`
  - 无：`📝 经验检查：本次无新发现`
