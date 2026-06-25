# Phase: ARCHIVE — 双归档

## 职责
OpenSpec 归档 + ACE 本地归档 + Git 提交 + SpecHub 远程上报 + Push。

## 归档协议

本文件定义 spechub-coding 的完整归档流程。核心原则：**所有文件系统操作在 Git commit 之前完成，commit 之后仅做 API 调用和 Push。**

## 输入
- 所有产出文件
- `$TASK_DIR/artifacts/divergences.jsonl` — 偏离记录
- 实现代码

## 产出
- OpenSpec archive（本地）
- ACE task archive（本地归档）
- Git 分支 + commit + push
- SpecHub archive（远程 API 上报）

---

## 执行步骤

<HARD-GATE name="ARCHIVE 入口约束">
ARCHIVE phase 是 G3 通过后的**独立执行阶段**，不是"确认后立即 commit"。
G3 用户确认 = 授权进入 ARCHIVE phase，AI 必须按以下 6 步顺序执行，不可合并或跳过。
</HARD-GATE>

<HARD-GATE name="时序不变量">
所有文件系统变更（Step 1-3）必须在 Git commit（Step 4）之前完成。
Git commit 之后禁止任何文件写入（否则 push 后 git status 不干净）。
Step 5 仅做 API 调用（脚本的 decisions.md 幂等写入不影响 git status，因为内容与 Step 3 产出相同）。
</HARD-GATE>

### Step 1. OpenSpec 归档 [不可跳过]

**changeName 即 OpenSpec slug**（同名耦合，无需额外字段）。

按优先级执行：
1. 调用 `/opsx:archive` — 如果可用，直接调用并传入 changeName
2. 如果 `/opsx:archive` 不可用 → 执行 CLI：
   ```bash
   openspec archive {changeName} --yes
   ```
3. 如果 openspec CLI 也不可用 → 至少确保 `$CHANGE_DIR/` 目录下有完整的 proposal.md + design.md + tasks.md（全部 `[x]`），并在完成报告中标注 "OpenSpec 归档需手动执行"

⚠️ **跳过此步 = 违规。** OpenSpec 归档是流程完整性的一部分，不可因"不确定如何执行"而静默跳过。

### Step 2. ACE 本地归档

<HARD-GATE name="ACE 归档门禁">
ACE 本地归档必须在 Git commit 之前完成（确保归档后的目录结构被 commit 捕获）。

**执行方式**：直接执行以下命令（内联逻辑，无外部 CLI 依赖）：

```bash
# 计算归档路径
ARCHIVE_DIR="$PROJECT_ROOT/.ace/tasks/archive/$(date +%Y%m%d)-{changeName}"
# 移动任务目录到归档位置
mkdir -p "$PROJECT_ROOT/.ace/tasks/archive"
mv "$PROJECT_ROOT/.ace/tasks/{changeName}" "$ARCHIVE_DIR"
```

移动完成后，更新归档目录中的 state.json：
```json
{
  "status": "completed",
  "completed_at": "{ISO时间}",
  "archived_at": "{ISO时间}",
  "spechub.currentPhase": "archive",
  "spechub.phases.archive.status": "done"
}
```

**成功判定**：`$ARCHIVE_DIR/state.json` 存在且 status == "completed"。
</HARD-GATE>

### Step 3. 生成 decisions.md

从 `$ARCHIVE_DIR/artifacts/divergences.jsonl` 读取偏离记录，生成 `$ARCHIVE_DIR/artifacts/decisions.md`。

规则：
- divergences.jsonl 不存在或为空 → decisions.md 内容为 "无偏离，完全按平台产物实现"
- 过滤 minor 级别，仅保留 significant+ → 按 category 分组输出
- 格式：每个偏离包含 平台方案 / 本地实现 / 理由

此步确保 decisions.md 在 commit 前已生成，随其他产物一起入库。

### Step 4. Git 提交 [文件清单策略]

<HARD-GATE name="Git add 完整性">
commit 必须包含本次需求的**全部产出**，不可遗漏。Claude Code 系统规则禁止 `git add -A`，
因此必须使用**显式文件列表**覆盖以下三类产出：

```bash
# 1. 功能代码 + 测试（通过 git status 中的 modified/untracked 确认路径）
git add <所有功能代码文件>
git add <所有测试文件>

# 2. OpenSpec 产物（含归档产物）
git add openspec/
# 包含: openspec/changes/{changeName}/ 或 openspec/changes/archive/*-{changeName}/
# 包含: openspec/config.yaml（如有变更）

# 3. ACE 归档产物（注意：Step 2 已 mv 到 archive/ 下）
git add .ace/tasks/archive/*-{changeName}/
```

**验证步骤（不可跳过）**：commit 前执行 `git status`，确认无残留 untracked/modified 文件属于本次需求。
若发现遗漏 → 补 add 后再 commit。
</HARD-GATE>

分支策略：
- 如果当前已在 feature 分支（如用户提前创建的 `feat/...`）→ 直接在当前分支 commit
- 否则 → 创建分支 `feature/spechub-{reqId}-{changeName}`

```bash
git commit -m "feat(spechub-{reqId}): {title}"
```

记录 branchName 和 commitHash（从 `git log --oneline -1` 获取）。

### Step 5. SpecHub 远程上报

```bash
python3 {skillDir}/scripts/spechub-workflow.py archive {reqId} --repo-root {repoRoot} \
  --branch {branchName} --commit {commitHash}
```

脚本职责：
- ✅ 读取 divergences → 生成 decisions.md（幂等：内容与 Step 3 相同，不改变 git status）
- ✅ 调用 SpecHub archiveHandoff API（带 branch + commitHash）

脚本输出：
```json
{
  "status": "ok",
  "archiveRecordId": "...",
  "requirementStatus": "...",
  "decisionsFile": ".ace/tasks/archive/{date}-{changeName}/artifacts/decisions.md",
  "divergenceCount": 3
}
```

**上报失败处理**：
- 网络错误 → 重试 1 次
- 持续失败 → 先执行 Step 6 push 代码，向用户报告"SpecHub 上报失败，需手动处理"

### Step 6. Git Push + 完成报告

```bash
git push -u origin {branchName}
```

**Push 后验证**：执行 `git status`，预期结果为 clean（nothing to commit, working tree clean）。
如果不 clean → 说明时序有 bug，向用户报告。

向用户输出最终摘要：
```
✅ 需求 {reqId}「{title}」已完成
- 分支: {branchName}
- 决策偏离: {divergenceCount} 项已同步到 SpecHub
- OpenSpec: 已归档
- SpecHub: archiveRecordId = {id}
```

---

## 硬规则

**归档 + Git + 上报是流程的终结动作，不是可选项。**
VERIFY G3 通过后自动进入 ARCHIVE，AI 必须主动完成直到代码已 push 且 SpecHub 已上报。

**Git commit 完整性是最高优先级**：宁可多 add 一个无关文件，也不可遗漏本次需求的产出文件。

**时序约束摘要**：
```
文件写入区（Steps 1-3）    →    commit 边界    →    API + Push 区（Steps 5-6）
OpenSpec归档 + ACE mv +           git commit           SpecHub API + git push
decisions.md 生成                  (commitHash)
```
