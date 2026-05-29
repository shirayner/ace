# Phase: PULL — 需求获取

## 职责
从 SpecHub 拉取产物到本地。**大部分逻辑由脚本完成，AI 仅负责用户交互。**

## 执行步骤

### 1. 确定 requirementId

**有 reqId（用户提供了）**：直接进入 Step 2。

**无 reqId**：调脚本列出 inbox：
```bash
python3 {skillDir}/scripts/spechub-workflow.py inbox --repo-root {repoRoot}
```

脚本输出 JSON：
```json
{"status": "ok", "gitRemoteUrl": "...", "items": [{requirementId, title, status, ...}]}
```

→ AskUserQuestion 让用户选择需求（展示 items 列表）

**脚本输出 status=precondition_failed**：
→ 向用户展示 issues 列表，终止流程

### 2. 拉取 + 初始化（一次调用完成）

```bash
python3 {skillDir}/scripts/spechub-workflow.py start {reqId} --repo-root {repoRoot}
```

脚本自动完成：
- ✅ 前置检查（openspec/ + project-profile.md）
- ✅ 获取 git remote URL
- ✅ 调用 SpecHub API 拉取产物
- ✅ 写入 artifacts/ + manifest.json
- ✅ 初始化 state.json（phase=comprehend）
- ✅ 写入 spechub/.active
- ✅ 创建 analysis/ 目录（供 COMPREHEND Agent 写入）

脚本输出：
```json
{"status": "ok", "reqId": 1450, "title": "...", "outputDir": "...", "nextPhase": "comprehend"}
```

### 3. 错误处理

| 脚本退出码 | 含义 | 处理 |
|-----------|------|------|
| 0 | 成功 | 进入 COMPREHEND |
| 1 | HTTP/网络错误 | 报错，提示重试 |
| 3 | 业务错误 | 报错，提示用户检查 reqId |
| 10 | 前置检查失败 | 展示 issues，提示用户修复 |
| 11 | git remote 失败 | 提示不在 git 仓库中 |

### 4. 自动推进

成功后直接进入 COMPREHEND Phase（无 Gate）。
