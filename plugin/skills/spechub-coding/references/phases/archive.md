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
- SpecHub archive（远程）— **由脚本自动完成 decisions 构建 + API 调用**
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

### 2. OpenSpec 归档

调用 `/opsx:archive` 对 openspec change 进行归档：

如果 `/opsx:archive` 不可用，手动执行：
```bash
openspec archive {slug}
```

### 3. SpecHub 上报（一次调用完成）

```bash
python3 {skillDir}/scripts/spechub-workflow.py archive {reqId} --repo-root {repoRoot} \
  --branch {branchName} --commit {commitHash}
```

脚本自动完成：
- ✅ 读取 state.json.divergences[]
- ✅ 过滤 minor → 按 category 分组 → 生成 decisions.md
- ✅ 调用 SpecHub archiveHandoff API
- ✅ 更新 state.json → phase: "done"
- ✅ 删除 spechub/.active

脚本输出：
```json
{
  "status": "ok",
  "archiveRecordId": "...",
  "requirementStatus": "...",
  "decisionsFile": "spechub/{reqId}/decisions.md",
  "divergenceCount": 3
}
```

### 4. 完成报告

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

**Git + Archive 是流程的终结动作，不是可选项。**
AI 不得以"等待用户指示"为由停止——必须主动完成直到 state.json 标记为 done。
