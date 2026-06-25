---
name: spechub-coding
description: |
  SpecHub 产物驱动的规范编码。当用户需要基于 SpecHub 平台产物进行本地编码时触发。
  适用于：用户提供 requirementId 或从 SpecHub inbox 选择需求后，基于平台产物完成编码。
  前提：项目中已有 openspec/ 目录（由 OpenSpec CLI 初始化）。

  DO NOT TRIGGER: 无平台产物的纯本地开发；单文件 bug 修复（→ 直接 Edit）；
  纯探索/学习（→ auto-goal）；代码审查（→ code-review）；写测试（→ ut）。
---
# SpecHub-Coding — 平台产物驱动的规范编码

核心信念：**产物是确定的需求输入。本地核心价值 = 理解需求 + 技术设计 + 高质量实现 + 双向归档。**

---

## 前置检查

**项目根目录确定**：运行 `pwd` 获取当前工作目录作为 `$PROJECT_ROOT`。

**Step 1 — openspec/ 目录 + CLI 可用性**：

```
执行: bash {skillDir}/scripts/openspec-init.sh $PROJECT_ROOT
```

脚本自动处理：

- openspec CLI 未安装 → 全局安装（`npm install -g @anthropic/openspec`）
- openspec/ 目录不存在 → 创建最小目录结构
- 都已就绪 → 跳过

脚本失败（exit 1）→ 终止流程，提示用户手动安装。

<HARD-GATE>
- ✅ 使用 skill 自带的 `scripts/openspec-init.sh` 处理初始化
</HARD-GATE>

**Step 2 — 继续执行**：

前置检查完成 → 进入状态机执行协议（PULL phase）。

> **关于 project-profile.md**：如果 `.ace/project-profile.md` 存在则各阶段可读取作为加速参考（编码约定、中间件配置等）。
> 不存在时不阻塞——各阶段通过代码探索（Grep pom.xml/build.gradle、Read 已有代码）现场推导所需信息。

---

## 状态机

| Phase     | 进入条件       | 产出                                                         | 退出 Gate |
| --------- | -------------- | ------------------------------------------------------------ | --------- |
| PULL      | 用户触发       | input/artifacts/ + input/manifest.json                       | — (auto) |
| PREPARE   | pull.done      | prepare-summary.md + readiness-manifest.json                 | G1        |
| DESIGN    | G1 passed      | proposal.md + design.md + tasks.md (via OpenSpec)            | G2        |
| IMPLEMENT | G2 passed      | 代码实现 + 测试 + tasks.md 勾选（逐 task TDD 微循环）        | — (auto) |
| VERIFY    | implement.done | handoff-check.md（全量回归确认）                             | G3 (auto) |
| ARCHIVE   | G3 passed      | openspec archive → ACE mv → git commit → API 上报 → push | DONE      |

---

## 目录结构

```
$PROJECT_ROOT/
├── .ace/
│   ├── tasks/{changeName}/           # $TASK_DIR — ACE 状态与过程产物
│   │   ├── state.json                # 状态机（type: "spechub"）
│   │   ├── input/                    # SpecHub 拉取的原始产物（只读，由脚本写入）
│   │   │   ├── manifest.json
│   │   │   └── artifacts/            # 原始平台产物
│   │   └── artifacts/                # ACE 过程产出物
│   │       ├── prepare-summary.md
│   │       ├── readiness-manifest.json
│   │       ├── handoff-check.md
│   │       └── decisions.md
├── openspec/changes/{changeName}/    # $CHANGE_DIR — OpenSpec 标准产物（同名耦合）
│   ├── proposal.md
│   ├── design.md
│   └── tasks.md
```

**变量约定**：

- `$TASK_DIR` = `$PROJECT_ROOT/.ace/tasks/{changeName}`
- `$CHANGE_DIR` = `$PROJECT_ROOT/openspec/changes/{changeName}`（同名耦合：changeName == openspec slug）
- `$INPUT_DIR` = `$TASK_DIR/input/`（spechub 类型特有：平台产物只读目录）
- `changeName` = slug（kebab-case 简写，如 `grade-retention-rules`）

**状态文件规范**：见 `references/state-schema.md`（自包含完整定义）。

**路径推导约定**（与 spec-coding 统一，无需存储冗余链接字段）：

| 需求              | 推导方式                                           |
| ----------------- | -------------------------------------------------- |
| 活跃 change 路径  | `openspec/changes/{changeName}/`                 |
| 归档 change 路径  | `glob: openspec/changes/archive/*-{changeName}/` |
| 活跃 ACE 任务路径 | `.ace/tasks/{changeName}/`                       |
| 归档 ACE 任务路径 | `glob: .ace/tasks/archive/*-{changeName}/`       |

---

## 执行协议

```
1. Read $TASK_DIR/state.json → currentPhase
2. Read references/phases/{currentPhase}.md → 按指令执行
3. 执行完毕 → 更新 state.json
4. 检查 Gate 条件 → 通过则推进到下一 Phase
```

**每进入一个 Phase 必须 Read 对应的 reference 文件。不可跳过。**

---

## 分级介入架构（Tiered Intervention）

人工介入级别基于**风险 × 置信度 × 争议度**动态决定，而非固定流程：

| Level | 名称       | 行为                                    | 适用条件                       |
| ----- | ---------- | --------------------------------------- | ------------------------------ |
| 0     | 静默执行   | 自动完成，仅日志                        | 零偏离 + 高置信度 + 纯机械操作 |
| 1     | 通知式前进 | 通知摘要 + 默认继续 + 保留回溯点        | 低偏离 + 高置信度 + 可逆       |
| 2     | 精简确认   | 仅展示 ≤5 项关键判断 + AskUserQuestion | 中偏离 OR 有真实选择需做       |
| 3     | 深度对齐   | 完整展示 + 讨论 + 确认                  | 高偏离 + 低置信度 + 不可逆     |

**核心原则**：减少频次，提高单次质量。用户角色从"审批者"变为"监控者 + 关键决策者"。

---

## Gate 定义

### G1 — 基础设施 Ready 确认

<HARD-GATE>
**位置**: PREPARE → DESIGN  
**条件**: 
- 无 BLOCKED → 自动通过（Level 0，不需要 AskUserQuestion）
- 有 BLOCKED → 按类型处理（详见 `references/phases/prepare.md` §G1 判定）
**通过动作**: state.json.gates.G1.passed = true
</HARD-GATE>

### G2 — 技术方案确认（条件式）

<HARD-GATE>
**位置**: DESIGN → IMPLEMENT  
**级别决定**: 基于方案确定性（详见 `references/phases/design.md` §G2 条件式判定）

| 确定性                          | 级别    | 行为                                                  |
| ------------------------------- | ------- | ----------------------------------------------------- |
| HIGH（所有决策唯一解）          | Level 1 | 通知式前进：决策摘要 + 任务列表 + [有异议?]，默认继续 |
| MEDIUM（1-2 个多选项决策）      | Level 2 | 精简确认：仅展示多选项决策 + AI 推荐                  |
| LOW（架构级偏离/多 divergence） | Level 3 | 完整 G2：当前完整流程                                 |

**通过动作**: state.json.gates.G2.passed = true
**格式**: 见 `references/phases/design.md` §G2 条件式判定
`</HARD-GATE>`

### G3 — 最终确认（VERIFY → ARCHIVE）

**位置**: VERIFY → ARCHIVE
**行为**: VERIFY 完成后展示**统一最终确认**（偏离摘要 + 测试结果 + 归档确认三合一）

| 条件                                  | 行为                                |
| ------------------------------------- | ----------------------------------- |
| 编译✅ + 测试✅ + 无 significant 偏离 | Level 1：通知式前进                 |
| 编译✅ + 测试✅ + 有 significant 偏离 | Level 2：展示偏离摘要 + [确认归档]  |
| 有失败或违规                          | Level 3：完整展示 + AskUserQuestion |

**通过动作**: 进入 ARCHIVE

`<HARD-GATE name="G3→ARCHIVE 转换约束">`
G3 通过（用户确认或 Level 1 通知式前进）后：

1. **必须 Read `references/phases/archive.md`**（执行协议的通用规则在此重申：`每进入一个 Phase 必须 Read 对应的 reference 文件`）
2. **禁止将"用户确认归档"理解为"立即 commit"** — 用户确认的是验证通过+授权进入 ARCHIVE phase，而非跳过 ARCHIVE 的 6 步流程
3. **ARCHIVE 的 6 步必须顺序完整执行** — 尤其 Step 2（Git 完整性检查）和 Step 3（ACE 本地归档 mv）不可遗漏
   `</HARD-GATE>`

---

## 恢复协议

用户说"继续"时：

```
1. Glob `.ace/tasks/*/state.json`（跳过 .ace/tasks/archive/）
   → 逐个读取 → 筛选 type=="spechub" && status!="completed"
   → 多个活跃任务 → AskUserQuestion 选择
   → 无活跃任务 → 提示用户重新开始
2. Read $TASK_DIR/state.json → spechub.currentPhase + phases[].outputs
3. 验证当前 Phase 的前置产出都存在：
   | Phase      | 必须存在                                                                          |
   |------------|-----------------------------------------------------------------------------------|
   | prepare    | $INPUT_DIR/artifacts/, $INPUT_DIR/manifest.json                                   |
   | design     | $TASK_DIR/artifacts/prepare-summary.md                                            |
   | implement  | $CHANGE_DIR/design.md, $CHANGE_DIR/tasks.md                                       |
   | verify     | 代码变更（git diff 非空）                                                          |
   | archive    | $TASK_DIR/artifacts/handoff-check.md                                              |
4. 前置存在 → 继续当前 Phase；缺失 → 回退到产出该文件的 Phase
5. Read references/phases/{currentPhase}.md → 执行
```

**降级路径**（state.json 丢失但 openspec change 存在）：

- `openspec list --json` 获取活跃变更 → 找到同名 change → 推断 phase
- 重建 state.json → AskUserQuestion 确认

---

## 交互规则（HARD RULE）

<HARD-GATE>
**所有需要用户决策/确认/选择的地方，必须使用 AskUserQuestion 工具。**
禁止用纯文本提问后等待用户回复——这会导致交互断裂（用户无法通过选项快速响应）。

违规形式：

- "是否需要我执行 git commit？" ← 纯文本提问 = 违规
- "你想先 review 还是直接归档？" ← 纯文本提问 = 违规
- 任何以问号结尾、期望用户做选择的文本，且未伴随 AskUserQuestion 工具调用 = 违规
  `</HARD-GATE>`

### 模式一：问题澄清（多选择）

场景：需要用户做具体选择（设计决策、范围确认、参数补全）。

```
AskUserQuestion(questions: [{
  header: "≤12字符标签",
  question: "具体问题？",
  options: [
    {label: "推荐选项 (推荐)", description: "推荐理由"},
    {label: "选项 B", description: "权衡说明"}
  ]
}])
```

规则：

- 推荐项加"(推荐)"后缀，放第一位
- 每次 ≤4 个 question
- 系统自动附加 Other 选项，不要手动添加

### 模式二：审批确认（通过/拒绝）

场景：已用 markdown 展示内容，需要用户做通过/不通过决策（G2/G3 确认、归档确认）。

**先** markdown 展示完整信息，**然后**同一 response 中：

```
AskUserQuestion(questions: [{
  header: "确认",
  question: "确认归档？",
  options: [
    {label: "确认", description: "继续执行"},
    {label: "拒绝", description: "需要调整"}
  ]
}])
```

规则：

- 信息展示在 markdown 中，**不塞进 AskUserQuestion**
- AskUserQuestion 只做轻量决策
- Other（用户输入补充）= 有补充的通过

### 适用场景映射

| 场景                    | 模式 | 示例                           |
| ----------------------- | ---- | ------------------------------ |
| PULL: inbox 选需求      | 澄清 | options = 各需求项             |
| PREPARE: 参数补全       | 澄清 | options = 参数值选项           |
| PREPARE: G1 有 BLOCKED  | 澄清 | "重新校验" / "跳过" / "终止"   |
| DESIGN: 技术决策        | 澄清 | 多选项 + AI 推荐               |
| DESIGN: G2 Level 2/3    | 审批 | markdown 展示 → 通过/拒绝     |
| IMPLEMENT: blocker 偏离 | 审批 | 偏离详情 → 接受/回退          |
| VERIFY: G3 Level 2/3    | 审批 | handoff-check → 确认归档/修复 |

---

## 运行时规则

- **文档语言 [HARD RULE]**: 所有生成的文档产物（proposal.md、design.md、tasks.md、prepare-summary.md、handoff-check.md 等）**必须使用中文**。代码、技术标识符、CLI 命令保持英文。
- **惊讶测试**: 决策让用户惊讶 → 暂停 AskUserQuestion
- **进度心跳**: Phase 切换报告 / 5+ 工具调用插入说明 / blocker 偏离立即告知
- **Divergence 分级处理**: 偏离按严重度分级处理（详见 implement.md §偏离检测）：
  - minor → AUTO_ABSORB（记录 + 继续，不中断）
  - significant → BATCH_REPORT（累积到 VERIFY 后统一展示）
  - blocker → IMMEDIATE_ESCALATE（立即 AskUserQuestion）
- **Scope 守护**: 实现过程中发现需要超出产物定义范围的代码 → 停下确认（blocker 级别）
- **回溯点保留**: 每个 Level 1 通知式前进的节点，在 state.json.spechub.snapshots[] 中记录 `{phase, ts, outputs}`。用户说"回到 X 阶段"时，回退 currentPhase 并重新执行。

---

## Divergence（差异）管理

差异是预期产物——平台产物是 AI 生成的初版，本地基于代码事实做修正。

**类型**：design_choice | scope_change | implementation_drift | infra_override

**存储**：`$TASK_DIR/artifacts/divergences.jsonl`（每行一个 JSON 对象，append-only）

**生命周期**：产生 → 分级 → 追加到 divergences.jsonl → G3 确认 → ARCHIVE 聚合为 decisions.md → SpecHub 上报

**聚合规则**（ARCHIVE 阶段）：Read divergences.jsonl → 过滤 minor → 按 category 分组 → 生成 decisions.md → 上报 SpecHub

**分级逻辑**：详见 `references/phases/implement.md` §偏离检测（分级处理）

---

## 脚本路径

统一 CLI：`scripts/spechub-workflow.py`

```bash
# 获取需求元信息（仅元数据，不拉取产物、不创建目录）
python3 {skillDir}/scripts/spechub-workflow.py info {reqId} --repo-root {repoRoot}

# 列出 inbox 需求（无 reqId 时）
python3 {skillDir}/scripts/spechub-workflow.py inbox --repo-root {repoRoot}

# 前置检查 + 拉取产物 + 初始化状态（有 reqId + changeName 时）
# --change-name 由 AI 从标题翻译生成（英文 kebab-case）；缺省时 fallback 到 _title_to_slug
# 产物写入 .ace/tasks/{changeName}/input/
python3 {skillDir}/scripts/spechub-workflow.py start {reqId} --change-name {changeName} --repo-root {repoRoot}

# 归档：构建 decisions + 上报 SpecHub + 清理
python3 {skillDir}/scripts/spechub-workflow.py archive {reqId} --repo-root {repoRoot} \
  --branch {branchName} --commit {commitHash}
```

脚本职责：前置检查、git remote 获取、SpecHub API 调用、state.json 初始化/更新、divergences 聚合。
AI 职责：changeName 决策、分支管理、PREPARE（产物消化+校验）、DESIGN、IMPLEMENT、VERIFY。
