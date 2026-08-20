# Phase: PULL — 需求获取 + 分支切换 + 产物拉取

## 职责
确定需求 → 切换到远程分支 → 拉取产物。分支优先、最短路径。

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

### 2. Fetch + 切换分支

<HARD-GATE>
分支切换是 PULL 阶段第一个动作（reqId 确定后立即执行），不可跳过。
拉取产物（Step 3）前必须已完成分支切换。
</HARD-GATE>

**立即执行**（不需要先调 info）：

```bash
git fetch origin
git branch -r --list "origin/feature/spec-{reqId}-*"
```

**决策逻辑**：

```
IF 远程存在 "origin/feature/spec-{reqId}-*" 分支:
  → remoteBranch = 匹配到的分支名（去掉 origin/ 前缀）
  → changeName = 分支名中 "spec-{reqId}-" 之后的部分
    例: feature/spec-2682-remove-benefit-expiry-info-icon → changeName = remove-benefit-expiry-info-icon
  → 切换分支（见下方切换逻辑）

ELIF 远程不存在匹配分支:
  → 调用 info 获取标题：
    python3 {skillDir}/scripts/spechub-workflow.py info {reqId} --repo-root {repoRoot}
  → 从 title 生成 changeName（AI 翻译为英文 kebab-case）
  → targetBranch = "feature/spec-{reqId}-{changeName}"
  → 切换分支（见下方切换逻辑）
```

**分支切换逻辑**：

```
IF 当前分支 == targetBranch（或 remoteBranch）:
  → 直接继续
ELIF 本地已存在该分支：
  → git checkout {targetBranch}
ELIF 远程存在该分支：
  → git checkout -b {remoteBranch} origin/{remoteBranch}
ELIF 当前分支是 master/main：
  → git checkout -b {targetBranch}
ELSE:
  → AskUserQuestion: "当前在分支 {currentBranch}，是否切换到 {targetBranch}？"
```

**changeName 生成规则**（仅远程无分支时使用）：
- 将中文标题翻译为 2-5 个英文单词
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

### 3. 拉取产物

**前置断言**：当前分支必须已是 `feature/spec-{reqId}-{changeName}`（或用户确认使用的其他分支）。

**脚本强制检查（exit 12）**：start 命令会自检当前分支，不匹配时直接拒绝执行并返回 exit 12（`status: branch_mismatch`）。

```bash
python3 {skillDir}/scripts/spechub-workflow.py start {reqId} --change-name {changeName} --repo-root {repoRoot}
```

**遇到 exit 12（branch_mismatch）时的处理**：
- 正常情况 → 回到 Step 2 切换分支后重试
- 用户已明确选择使用其他分支 → 附加 `--allow-branch-mismatch` 重试

脚本自动完成：
- ✅ 前置检查（openspec/）
- ✅ 获取 git remote URL
- ✅ 调用 SpecHub API 拉取产物
- ✅ 写入 `$TASK_DIR/input/artifacts/` + `$TASK_DIR/input/manifest.json`
- ✅ 初始化 `$TASK_DIR/state.json`（phase=prepare, type="spechub", changeName={changeName}）

脚本输出：
```json
{"status": "ok", "reqId": 687, "title": "...", "changeName": "...", "taskDir": "...", "inputDir": "...", "writtenFiles": [...], "missingArtifacts": ["contracts"], "artifactsIncomplete": true, "nextPhase": "prepare"}
```

**产物不完整处理**：当 `artifactsIncomplete: true` 时，仅向用户展示一行提示（如"⚠️ 需求 {reqId} 的平台产物尚未全部就绪，将基于已有产物继续"），**不阻断流程**。

- `missingArtifacts` 列出缺失的产物类型（contracts / database-design / qmq-design）
- 缺失产物 ≠ 阻塞：PREPARE 阶段基于实际拉到的产物提取信息即可

### 4. 错误处理与降级

**核心原则**：SpecHub 是获取产物的渠道，不是流程的前置条件。平台不可用时，流程可以降级继续。

#### 脚本成功（exit 0）

直接进入 PREPARE。

#### 脚本失败（exit 非 0）— 降级路径

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
2. 告知用户将产物文件放入 $TASK_DIR/input/artifacts/ 目录
3. 用户确认后，手动创建 state.json + manifest.json
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

### 5. 自动推进

成功后（含降级成功）直接进入 PREPARE Phase（无 Gate）。
