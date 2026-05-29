# Phase: PULL — 需求获取

## 职责
从 SpecHub 拉取产物到本地。

## 执行步骤

### 1. 获取 Git Remote URL
```bash
git remote -v
```
提取 origin 的 fetch URL 作为 `gitRemoteUrl`。

### 2. 确定 requirementId

**有 reqId**：直接进入 Step 3。

**无 reqId**：拉取 inbox 列表供用户选择：
```bash
python3 {skillDir}/scripts/spechub-pull-bundle.py --inbox {gitRemoteUrl}
```
→ 返回 JSON `{items: [{requirementId, title, status, ...}]}`
→ AskUserQuestion 让用户选择需求

### 3. 拉取产物
```bash
python3 {skillDir}/scripts/spechub-pull-bundle.py {reqId} {gitRemoteUrl} {repoRoot}
```

**错误处理**：
- Exit 1: HTTP/网络错误 → 报错终止
- Exit 2: 响应解析失败 → 报错终止
- Exit 3: 业务错误 → 报错终止

### 4. 初始化状态

Write `spechub/{reqId}/state.json`：
```json
{
  "reqId": {reqId},
  "title": "{manifest.title}",
  "currentPhase": "comprehend",
  "phases": {
    "pull": { "status": "done", "ts": "{ISO}", "outputs": ["manifest.json", "artifacts/"] },
    "comprehend": { "status": "pending" },
    "readiness": { "status": "pending" },
    "design": { "status": "pending" },
    "implement": { "status": "pending" },
    "verify": { "status": "pending" },
    "archive": { "status": "pending" }
  },
  "gates": {},
  "decisions": [],
  "divergences": []
}
```

Write `spechub/.active` → 内容仅为 `{reqId}`

### 5. 自动推进
PULL 无 Gate，直接进入 COMPREHEND Phase。
