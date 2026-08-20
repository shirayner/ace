---
name: verify
description: |
  在任何完成声明前使用——任务完成、测试通过、编译成功、Bug 修复、需求满足。
  证据先于断言。绝不跳过，绝不信任未经独立验证的报告。

  独立使用：/verify [claim] 验证当前工作状态
  被动触发：其他 skill 在完成声明时执行 Gate Function

  DO NOT TRIGGER: 无需验证的纯对话/探索场景。
---
# Verify — 横切验证门控

**铁律**：NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.

**本质**：这不是一个"阶段"——它是所有阶段共享的**质量约束**。任何时刻，任何 skill，任何 agent，在声称任何事情"完成"之前，必须通过此门控。

---

## Gate Function（核心机制 — 5 步）

任何完成声明触发此流程：

### Step 1: IDENTIFY — 什么命令能证明这个声明？

| 声明类型 | 验证方式 |
|---------|---------|
| "测试通过" | 运行测试命令，看 0 failures |
| "编译成功" | 运行 build 命令，看 exit 0 |
| "Lint 干净" | 运行 linter，看 0 errors |
| "Bug 已修复" | 重现原始症状 → 确认不再出现 |
| "需求已满足" | 逐条 checklist 验证 |
| "Agent 完成了" | 检查 VCS diff → 独立验证变更 |
| "格式正确" | 运行格式化/验证工具 |
| "回归测试通过" | Red-Green 循环验证 |

### Step 2: RUN — 执行验证命令

- 必须是**新鲜执行**（不复用之前的结果）
- 必须是**完整执行**（不跑部分）
- 由**验证方独立执行**（不信任被验证方的报告）

### Step 3: READ — 检查输出

- 读**完整输出**（不只看最后一行）
- 检查 exit code
- 计数失败/错误/警告

### Step 4: VERIFY — 输出是否确认声明？

- ✅ 是 → 声明成立，附上证据继续
- ❌ 否 → 声明不成立，陈述实际状态 + 证据

### Step 5: ONLY THEN — 发出完成声明

- 声明中必须引用验证证据
- `"Tests pass (8/8, 0 failures)"` ✅
- `"Tests pass"` ❌（无证据）

---

## 触发时机（横切所有 Skill）

```
/spec-coding 触发点：
  Phase 2: proposal 写完 → validate 命令验证格式
  Phase 3: design.md 写完 → Placeholder 扫描 + 自审查
  Phase 4: tasks.md 写完 → spec 覆盖度检查
  Phase 5: 每个 task 完成 → 运行验证命令
  Phase 6: 归档前 → validate + 分支可合并确认

/subagent-execute 触发点：
  每个 implementer 报告 DONE → Controller 独立运行验证
  spec-reviewer 通过后 → 运行完整测试确认无回归
  所有任务完成后 → 最终集成验证

/parallel-dispatch 触发点：
  所有 agent 返回后 → 冲突检测 + 集成测试
```

---

## 独立使用模式

```
/verify [claim]
  → 解析 claim
  → 自动选择验证方式（基于项目技术栈）
  → 执行 Gate Function 5 步
  → 返回 Verification Report

/verify（无参数 — 自动检测）
  → 检查 git status（有未提交变更？）
  → 检查最近 task（有标记完成但未验证的？）
  → 推断最可能需要验证的声明
  → 执行验证
```

---

## Red-Green 回归验证（Bug 修复专用）

当声称"bug 已修复"或"回归测试有效"时，单次通过不够：

```
1. Write 回归测试
2. Run → 确认通过（测试本身正确）
3. Revert 修复代码
4. Run → 必须失败（证明测试真的能检测到 bug）
5. Restore 修复代码
6. Run → 再次通过（修复有效）
```

只有完成全部 6 步，"bug 已修复"声明才成立。

---

## 反合理化对照表

当你发现自己在想以下任何一条 → 你正在跳过验证 → **立即停止**：

| 你的想法 | 真相 |
|---------|------|
| "Should work now" | "Should" ≠ evidence. Run it. |
| "I'm confident" | Confidence ≠ proof. Run it. |
| "Agent said success" | Agent reports are claims, not proof. |
| "Tests passed last time" | Code changed since. Run again. |
| "Linter passed so build works" | Linter ≠ compiler ≠ runtime. |
| "Just this once" | No exceptions. Ever. |
| "Partial check is enough" | Partial proves nothing. |
| "It's a trivial change" | Trivial changes break things too. |
| "I already know it works" | Then running it costs nothing. |
| "The user is in a hurry" | Shipping broken is slower. |

**Iron Law**: 如果验证成本低于重做成本 → 验证。（答案几乎总是 yes。）

---

## 输出格式（Verification Report）

```markdown
## Verification Report

**Claim:** [被验证的声明]
**Method:** [验证命令/方式]
**Evidence:**
[命令输出摘要]
**Verdict:** ✅ Confirmed | ❌ Refuted | ⚠️ Partial

[如 Refuted] **Actual State:** [实际状态描述]
[如 Partial] **Gaps:** [未验证的部分]
```

---

## 与其他 Skill 的集成方式

**被动集成**（其他 Skill 内部调用 verify 逻辑）：
- 不需要字面上 `invoke /verify`
- 而是在完成声明前执行 Gate Function 的 5 步
- 本 SKILL.md 作为认知锚点确保 agent 不遗忘

**主动集成**（用户独立使用）：
- `/verify [claim]` → 执行 Gate Function → 返回 Verification Report
