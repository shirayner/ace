# Phase: ARCHIVE — 双归档

## 职责
本地归档（OpenSpec）+ 本地状态清理 + Git 提交 + 远程上报（SpecHub）。

## 输入
- 所有产出文件
- `$TASK_DIR/state.json` 中的 divergences[]
- 实现代码

## 产出
- OpenSpec archive（本地）
- Git 分支 + commit + push
- SpecHub archive（远程 API 上报）
- `$TASK_DIR/state.json` → DONE

---

## 执行步骤

### 1. OpenSpec 归档 [不可跳过]

**slug = state.json.openspecChange**（DESIGN 阶段写入的值）

按优先级执行：
1. 调用 `/opsx:archive` — 如果可用，直接调用并传入 slug
2. 如果 `/opsx:archive` 不可用 → 执行 CLI：
   ```bash
   openspec archive {slug}
   ```
3. 如果 openspec CLI 也不可用 → 至少确保 `$CHANGE_DIR/` 目录下有完整的 proposal.md + design.md + tasks.md（全部 `[x]`），并在完成报告中标注 "OpenSpec 归档需手动执行"

⚠️ **跳过此步 = 违规。** OpenSpec 归档是流程完整性的一部分，不可因"不确定如何执行"而静默跳过。

### 2. 本地状态清理 + ACE 双归档

AI 直接执行以下操作：

1. **更新 state.json 阶段状态**（`$TASK_DIR/state.json`）：
   ```json
   {
     "currentPhase": "done",
     "phases": { "archive": { "status": "done", "ts": "{ISO}", "outputs": ["decisions.md", "spechub-archive"] } }
   }
   ```

2. **删除 .active-spechub**：
   ```bash
   rm .ace/tasks/.active-spechub
   ```

3. **ACE 双归档**（详见 `../../shared/archive-protocol.md` 协议 B）：

   <HARD-GATE name="ACE 归档门禁">
   ACE 本地归档是流程的必要终结步骤，必须在 SpecHub 上报之前完成。
   禁止以任何理由跳过，包括：
   - "交付了就算完成" → 未归档 = state.json 永远 in_progress。
   - "FleetView TaskUpdate completed 了" → 两套系统完全独立，不可替代。

   **Terminal state = 以下命令执行成功：**

   ```bash
   # 一条命令完成 complete + archive
   ace task done {changeName}
   ```

   `ace task done` 执行成功输出 `✓ Task '...' archived to .ace/tasks/archive/...`
   未出现此输出 = 归档门禁未通过，禁止继续执行 SpecHub 上报。
   </HARD-GATE>

   > **顺序说明**：`ace task done`（本地归档）必须先于 SpecHub 上报。
   > `spechub-workflow.py archive` 已支持扫描已归档目录，不依赖任务在活跃路径。
   > 注：双归档协议 Step 1（OpenSpec 归档）已在上方 Step 1 完成，SpecHub 上报在下方 Step 4 执行。

### 3. Git 提交

```bash
git checkout -b feature/spechub-{reqId}-{slug}
git add -A
git commit -m "feat(spechub-{reqId}): {title}"
```

记录 branchName 和 commitHash（从 git log 获取）。

**此时一个 commit 包含全部变更**：功能代码 + 测试 + openspec 归档产物 + state.json + .active-spechub 删除。

### 4. SpecHub 远程上报

```bash
python3 {skillDir}/scripts/spechub-workflow.py archive {reqId} --repo-root {repoRoot} \
  --branch {branchName} --commit {commitHash}
```

脚本职责（仅 API 调用，不修改本地文件）：
- ✅ 读取 state.json.divergences[] → 生成 decisions.md（幂等）
- ✅ 调用 SpecHub archiveHandoff API（带 branch + commitHash）

脚本输出：
```json
{
  "status": "ok",
  "archiveRecordId": "...",
  "requirementStatus": "...",
  "decisionsFile": ".ace/tasks/{changeName}/artifacts/decisions.md",
  "divergenceCount": 3
}
```

**上报失败处理**：
- 网络错误 → 重试 1 次
- 持续失败 → 先执行 Step 5 push 代码，向用户报告"SpecHub 上报失败，需手动处理"

### 5. Git Push

```bash
git push -u origin feature/spechub-{reqId}-{slug}
```

### 6. 完成报告

向用户输出最终摘要：
```
✅ 需求 {reqId}「{title}」已完成
- 分支: feature/spechub-{reqId}-{slug}
- 决策偏离: {divergenceCount} 项已同步到 SpecHub
- OpenSpec: 已归档
- SpecHub: archiveRecordId = {id}
```

---

## 硬规则

**归档 + Git + 上报是流程的终结动作，不是可选项。**
VERIFY G3 通过后自动进入 ARCHIVE，AI 必须主动完成直到 state.json 标记为 done 且代码已 push。
