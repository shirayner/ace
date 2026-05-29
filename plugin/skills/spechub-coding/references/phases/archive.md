# Phase: ARCHIVE — 双归档

## 职责
本地归档（OpenSpec）+ 远程上报（SpecHub）+ 差异同步。

## 输入
- 所有产出文件
- state.json.divergences[]
- 实现代码

## 产出
- Git 分支 + commit + push
- OpenSpec archive（本地）
- SpecHub archive（远程）
- state.json → DONE

---

## 执行步骤

### 1. Git 操作

```bash
git checkout -b feature/spechub-{reqId}-{slug}
git add -A
git commit -m "feat(spechub-{reqId}): {title}"
git push -u origin feature/spechub-{reqId}-{slug}
```

记录 branchName 和 commitHash。

### 2. 构建 Decisions（核心！）

从 state.json.divergences[] 聚合为 decisions markdown：

```
过滤：severity != "minor"
按 category 分组
每组格式：
  ## {category}
  - 平台方案: {expected}
  - 本地实现: {actual}
  - 理由: {reason}
```

Write `spechub/{reqId}/decisions.md` — 作为归档上报的输入。

如果无 divergences（全部一致）→ decisions = "无偏离，完全按平台产物实现"

### 3. OpenSpec 归档

调用 `/opsx:archive` 对 openspec change 进行归档：
- 评估 delta specs 是否同步到主 specs
- 移动到 archive 目录

如果 `/opsx:archive` 不可用，手动执行：
```bash
openspec archive {slug}
```

### 4. SpecHub 上报

```bash
python3 {skillDir}/scripts/spechub-archive-report.py {reqId} {gitRemoteUrl} \
  --branch {branchName} \
  --commit {commitHash} \
  --decisions spechub/{reqId}/decisions.md
```

**脚本从 decisions.md 文件读取内容上报到 SpecHub 平台。**

平台收到的 decisions 字段 = 本地实现与平台产物的全部有意义差异，帮助平台侧：
- 了解产物质量（artifact_error 类型说明产物有误）
- 了解本地技术选择（design_choice 类型）
- 了解范围裁剪（scope_change 类型）

### 5. 最终清理

更新 state.json：
```json
{
  "currentPhase": "done",
  "phases": { "archive": { "status": "done", "ts": "{ISO}", "outputs": ["decisions.md", "git branch", "openspec archive", "spechub archive"] } }
}
```

删除 `spechub/.active`

### 6. 完成报告

向用户输出最终摘要：
```
✅ 需求 {reqId}「{title}」已完成
- 分支: feature/spechub-{reqId}-{slug}
- 决策偏离: {N} 项已同步到 SpecHub
- OpenSpec: 已归档到 openspec/changes/archive/
- SpecHub: archiveRecordId = {id}
```

---

## 硬规则

**Git + Archive 是流程的终结动作，不是可选项。**
AI 不得以"等待用户指示"为由停止——必须主动完成直到 state.json 标记为 done。
