# Phase: PULL — 需求获取 + 分支管理

## 职责
从 SpecHub 获取需求元信息，决定 changeName，创建/切换分支，拉取产物。

## 执行步骤

### 1. 确定 requirementId

**有 reqId（用户提供了）**：直接进入 Step 2。

**无 reqId** [HARD RULE — 禁止弹出选择框询问用户"要查看 inbox 还是手动输入 ID"]：

立即执行 inbox 脚本，获取需求列表：
```bash
python3 {skillDir}/scripts/spechub-workflow.py inbox --repo-root {repoRoot}
```

脚本输出 JSON：
```json
{"status": "ok", "gitRemoteUrl": "...", "items": [{requirementId, title, status, ...}]}
```

→ 然后 AskUserQuestion 展示 items 列表让用户选择需求（附加一个"手动输入 ID"选项）

**脚本输出 status=precondition_failed**：
→ 向用户展示 issues 列表，终止流程

### 2. 获取需求元信息

```bash
python3 {skillDir}/scripts/spechub-workflow.py info {reqId} --repo-root {repoRoot}
```

脚本输出：
```json
{"status": "ok", "reqId": 687, "title": "黑钻升降保级规则", "requirementStatus": "DEVELOPING", "gitRemoteUrl": "..."}
```

### 3. 决定 changeName
<HARD-GATE>
changeName 必须是语义化的英文 kebab-case
</HARD-GATE>

从 title 生成语义化的英文 kebab-case changeName：

**规则**：
- 将中文标题翻译为 2-4 个英文单词
- 使用 kebab-case（全小写 + 连字符）
- 语义优先，能从名字理解需求内容
- 不超过 40 个字符

**示例**：
| 中文标题 | changeName |
|---------|------------|
| 黑钻升降保级规则 | `black-diamond-retention` |
| 会员权益过期提醒 | `member-rights-expiry-notify` |
| 订单池金额同步优化 | `order-pool-amount-sync` |
| 批量UID升级功能 | `batch-uid-upgrade` |

### 4. 分支管理

<HARD-GATE>
**分支切换是 PULL 阶段的必经步骤，不可跳过。**
Step 5（拉取产物）执行前，必须已完成分支切换。
违规形式：changeName 确定后直接执行 start 脚本而未切换分支 = 违规。
</HARD-GATE>

**分支命名约定**：`feat/{changeName}`

```
检查当前分支状态：
  git branch --show-current

决策逻辑：
  IF 当前分支 == "feat/{changeName}":
    → 直接继续（已在目标分支）
  ELIF 已存在 "feat/{changeName}" 分支：
    → git checkout feat/{changeName}
  ELIF 当前分支是 master/main：
    → git checkout -b feat/{changeName}
  ELIF 当前分支是用户手动创建的相关分支（名字含 changeName 关键词）：
    → AskUserQuestion: "检测到当前分支 {currentBranch}，是否使用此分支？还是创建 feat/{changeName}？"
  ELSE:
    → AskUserQuestion: "当前在分支 {currentBranch}，是否切换到新分支 feat/{changeName}？"
```

### 5. 拉取产物

**前置断言**：执行 start 前，当前分支必须已是 `feat/{changeName}`（或用户确认使用的其他分支）。未切换 = 禁止执行。

**脚本强制检查（exit 12）**：start 命令会自检当前分支，不匹配 `feat/{changeName}` 时直接拒绝执行并返回 exit 12（输出 `status: branch_mismatch`）。这是脚本级硬约束，AI 无法绕过。

```bash
python3 {skillDir}/scripts/spechub-workflow.py start {reqId} --change-name {changeName} --repo-root {repoRoot}
```

**遇到 exit 12（branch_mismatch）时的处理**：
- 正常情况 → 回到 Step 4 切换分支后重试
- 用户已明确选择使用其他分支（Step 4 中用户回答了 AskUserQuestion）→ 附加 `--allow-branch-mismatch` 重试

脚本自动完成：
- ✅ 前置检查（openspec/）
- ✅ 获取 git remote URL
- ✅ 调用 SpecHub API 拉取产物
- ✅ 写入 `$TASK_DIR/input/artifacts/` + `$TASK_DIR/input/manifest.json`
- ✅ 初始化 `$TASK_DIR/state.json`（phase=prepare, type="spechub", changeName={changeName}）

脚本输出：
```json
{"status": "ok", "reqId": 687, "title": "...", "changeName": "black-diamond-retention", "taskDir": "...", "inputDir": "...", "writtenFiles": [...], "missingArtifacts": ["contracts"], "artifactsIncomplete": true, "nextPhase": "prepare"}
```

**产物不完整处理**：当 `artifactsIncomplete: true` 时，表示平台返回了 ARTIFACTS_INCOMPLETE 但脚本仍成功拉取了已有产物。这是正常情况——很多需求合法地没有契约/数据库设计。

- `missingArtifacts` 列出缺失的产物类型（contracts / database-design / qmq-design）
- 缺失产物 ≠ 阻塞：PREPARE 阶段基于实际拉到的产物提取信息即可
- 不要因为缺少 contracts/database-design 而终止流程

### 6. 错误处理与降级

**核心原则**：SpecHub 是获取产物的渠道，不是流程的前置条件。平台不可用时，流程可以降级继续。

#### 脚本成功（exit 0）

直接进入 PREPARE。如果 `artifactsIncomplete: true`，只是产物不全（正常）。

#### 脚本失败（exit 非 0）— 降级路径

```
脚本失败时，AskUserQuestion：
```

```
AskUserQuestion(questions: [{
  header: "平台异常",
  question: "SpecHub 拉取失败（{错误原因}）。如何继续？",
  options: [
    {label: "重试 (推荐)", description: "可能是临时网络问题"},
    {label: "手动提供产物", description: "我会把产物文件放到指定目录"},
    {label: "终止", description: "放弃本次需求"}
  ]
}])
```

**各选项处理**：

| 用户选择 | 处理 |
|---------|------|
| 重试 | 重新执行脚本（最多 2 次） |
| 手动提供产物 | 执行手动降级流程（见下） |
| 终止 | 停止 |

#### 手动降级流程

当用户选择"手动提供产物"时：

```
1. 创建目录：mkdir -p $TASK_DIR/input/artifacts/
2. 告知用户将产物文件放入 $TASK_DIR/input/artifacts/ 目录：
   "请将需求产物文件（prd.md、architecture.md 等）放入：
    {$TASK_DIR}/input/artifacts/
    放好后告诉我。"
3. 用户确认后，手动创建 state.json + manifest.json（基本信息从用户提供的 reqId/title 推导）
4. 继续进入 PREPARE
```

**manifest.json 最小格式**（手动创建时）：
```json
{
  "requirementId": "{reqId}",
  "title": "{用户提供或从产物中提取}",
  "source": "manual"
}
```

### 7. 自动推进

成功后（含降级成功）直接进入 PREPARE Phase（无 Gate）。
