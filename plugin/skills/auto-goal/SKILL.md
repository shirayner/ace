---
name: auto-goal
description: |
  自主完成复杂目标或学习需求。当用户描述期望结果（而非具体代码变更）时触发。

  两类意图：
  **目标达成** — 需规划/调研/多步执行的目标或项目。
  **学习研究** — 系统性学习、理解原理、技术调研。

  关键判据：目标开放式、涉及多领域、需方案选择、或用户明确要求学习/调研/规划。

  DO NOT TRIGGER: 明确代码变更（修 bug、加功能、重构、写测试 → ut / code-review / 直接 Edit）；优化/创建 skill（→ skill-optimize / skill-creator）；单步可完成的简单操作（→ 直接执行）。
---

# Auto Goal — 自主目标编排

核心信念：对齐优先于效率。准确完成用户真正想要的，胜过高效完成 agent 以为的。

---

## 硬规则（不可跳过）

<HARD-GATE>
修改性工具调用（Edit/Write/Bash 创建文件/TaskCreate）前，对齐协议必须通过。
证据 = AskUserQuestion 已调用且用户回复了确认。
无证据 = 禁止一切修改性操作。
</HARD-GATE>

**违反形式 = 违反精神。** "心里确认了" = 没确认。"之前对齐过了" = 新目标需新对齐。

### 规则 1：首轮对齐（MANDATORY）

Read `../../shared/alignment-protocol.md`，按其三步流程执行。
输入源：memory + CLAUDE.md + git status + 会话历史。

### 规则 2：状态初始化（对齐通过后第一个动作）

1. `Bash(pwd)` → 获取 `$ROOT`
2. `mkdir -p $ROOT/.tasks/auto-goal-{id}`（id = 2-4 英文单词 kebab-case）
3. TaskCreate 分解为 ≥3 个离散任务
4. Write `$ROOT/.tasks/auto-goal-{id}/state.md`（参考 `../../shared/state-template.md`）
5. 完成后才进入执行阶段

路径硬规则：禁止 `~`、`$HOME`、裸相对路径。所有 Write/Edit 使用 `$ROOT` 前缀。

### 规则 3：惊讶测试

用户此刻看到我的决策会惊讶 → 暂停 AskUserQuestion。
（详见 `../../shared/alignment-protocol.md` 惊讶测试段）

---

## 执行原则

1. **先定义完成，再开始执行** — 每个目标需可测试的完成标准
2. **承诺计划，卡住时换方向** — 三次失败质疑前提
3. **永不空手而归** — 任意时刻中断都应有可用产出
4. **上下文是稀缺资源** — Read `../../shared/context-discipline.md`
5. **对齐不是一次性事件** — 发现偏差时回到对齐

---

## 并行执行

独立子任务识别后，Read `../../shared/parallel-protocol.md` 按其规则调度。

---

## 验证与交付

标记 TaskUpdate completed 前：
Read `../../shared/verification-protocol.md`，按 Gate Function 执行。

---

## 经验进化

交付后检查触发条件（意外/踩坑/反直觉/可复用模式）：
Read `../../shared/experience-protocol.md`，满足条件时执行。

**无论是否有新经验，必须一行式告知用户**：
- 有经验：`📝 经验提取：E{N} 已写入（简述发现）`
- 无经验：`📝 经验检查：本次无新发现`

---

## 进度心跳

- 完成 Phase → 一句话报告
- 连续 5+ 工具调用无文本 → 插入说明
- 方向变化 → 立即告知

---

## 运行时规则

- TaskUpdate 每次变更后同步更新 state.md
- TaskCreate 累计 ≥6 → 升级为完整状态管理（参考 `../../shared/state-template.md` 完整模板）
- 新目标 = 新目录，不复用上一个

---

## 恢复协议

用户说"继续"时：Read `references/recovery.md`。
简要：读 state.md → 验证产出存在 → 读 experience.md → TaskCreate 重建进度 → 继续。

---

## 介入模式

- **协作**（默认）：自主执行，方向性决策前确认
- **全自动**：仅不可逆操作前确认

---

## 参考文件索引

| 文件 | 何时加载 |
|------|---------|
| `../../shared/alignment-protocol.md` | 规则 1 执行时 |
| `../../shared/verification-protocol.md` | 标记完成前 |
| `../../shared/experience-protocol.md` | 交付后 |
| `../../shared/parallel-protocol.md` | 识别并行机会时 |
| `../../shared/context-discipline.md` | 上下文管理时 |
| `../../shared/state-template.md` | 创建状态文件时 |
| `references/recovery.md` | 恢复中断任务时 |
