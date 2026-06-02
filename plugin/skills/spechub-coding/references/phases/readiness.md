# Phase: READINESS — 基础设施准备度校验

## 职责
验证所需中间件/服务是否已就位。**本 Phase 是机械执行**——所有"判断"已在 COMPREHEND 阶段完成。

## 输入
- `spechub/{reqId}/readiness-manifest.json` — 动态校验实例（COMPREHEND 产出）
- `references/readiness-schema.json` — 静态校验规则定义

## 产出
- `spechub/{reqId}/readiness-check.md`
- state.json 更新

---

## 执行步骤

### 1. 读取 Manifest
Read `spechub/{reqId}/readiness-manifest.json` → `checks[]`

### 2. 参数自动推断 + 补全

#### 自动推断规则（减少人工输入）

在 AskUserQuestion 之前，先尝试自动填充 paramGaps：

```
推断优先级（从高到低）：

1. 从 project-profile.md 提取：
   - appId → 项目自身的 SOA appId（profile §SOA 配置）
   - dbName → 项目使用的数据库名（profile §数据库配置）
   - 项目的 groupId/artifactId → pom.xml

2. 从产物 artifacts/ 中提取：
   - operationName → artifacts/architecture.md 中的接口定义
   - tableName → artifacts/data-model.md 中的表名

3. 从历史经验复用：
   - 同项目历史 state.json 中相同 checkType 的参数

4. 无法推断 → 保留为 paramGaps
```

**推断后行为**：
- 推断成功的参数：标记来源为 `[auto-inferred: {source}]`，编译/校验失败时可追溯
- 仅剩余无法推断的参数才 AskUserQuestion

#### 人工补全（仅无法推断的参数）

收集所有 check 中**推断后仍有**的 `paramGaps`（非空的）：
- 若存在 paramGaps → AskUserQuestion 批量展示所有缺失参数，一次性收集
- **若所有参数已自动推断完成 → 跳过此步骤，零人工输入**
- 展示格式：
  ```
  以下中间件校验需要补全参数（已自动推断 {N}/{Total} 项）：
  | # | 中间件 | 描述 | 缺失参数 | 已推断参数 |
  |---|--------|------|---------|-----------|
  | RC-002 | SOA 依赖 | 积分查询接口 | version | appId=100012345[auto] |
  ```
- 用户补全后 → 更新 readiness-manifest.json 的对应 params + 清空 paramGaps

#### SOA 参数补全引导

对 SOA 类型的 check（soa_new_interface / soa_dependency），提问时附加引导说明：

```
以下 SOA 接口校验需要补全参数：
| # | 场景 | 接口描述 | 缺失参数 |
|---|------|---------|---------|
| RC-001 | 新增接口(provider) | 会员等级查询 | operationName, version |
| RC-002 | 依赖接口(consumer) | 积分服务查询 | appId, operationName, version |

参数说明：
- appId: MOM 平台上的应用 ID（项目详情中查看）
- operationName: 接口在 MOM 上注册的操作名称
- version: 契约版本号（在 MOM 上已发布的版本）
- mavenGroupId/ArtifactId/Version: 契约 client JAR 的 Maven 坐标
```

### 3. 执行校验

对每个 check：

```
schema = readiness-schema.json.checkTypes[check.type]
for step in schema.checkSteps:
  if step.skipIf 条件满足 → skip
  if step.tool == "manual_confirm" → 加入 manual_batch
  if step.tool == "param_check" → 本地逻辑判断
  else → 调用对应 MCP 工具（并行执行所有 MCP 调用）
```

**并行规则**：所有 MCP 工具调用（非 manual_confirm）在单条 response 中并行执行。

#### SOA check 的特殊规则 [HARD RULE]

SOA 类型（soa_new_interface / soa_dependency）的 check：
- paramGaps 未补全（用户未提供 appId/operationName/version）→ **BLOCKED**（不是 WARN），提示用户先提供参数
- 参数已补全但 get_single_operation 查不到契约 → **BLOCKED**，提示用户先去 MOM 创建并发布契约
- ⚠️ **不允许**将 SOA check 标记为 WARN — "本次新建所以还没有"不是合理理由
- **原因**：SOA 契约必须先于代码实现存在（否则无法编译 client JAR 依赖）

### 4. 处理人工确认（优化：自动决策 + 升级）

#### BLOCKED 自动决策规则

在 AskUserQuestion 之前，先按规则自动处理可预判的 BLOCKED：

```
自动降级为 WARN（createDuringImpl=true）：
- db_new_table 且 DDL 已在 tasks.md 中 → WARN（实现阶段创建）
- qconfig_file 未创建 → WARN（实现阶段创建）

自动生成解决方案：
- db_new_table BLOCKED → 自动将 DDL task 提升到 tasks.md 第一位
- qmq_topic 未注册 → 通知用户需注册，标记 WARN 继续

保持 BLOCKED（不可自动降级）：
- SOA 契约/JAR 不存在 → 保持 BLOCKED（编译依赖，不可绕过）
- 权限/网络/环境问题 → 保持 BLOCKED（需人工解决）
```

#### 人工确认批次（仅自动决策后仍需人工的项目）

将所有 `manual_confirm` 类型 + 无法自动处理的 BLOCKED 合并为一个 AskUserQuestion：
```
以下中间件需要人工确认（已自动处理 {N} 项）：
| # | 类型 | 问题 | 自动处理结果 |
|---|------|------|------------|
| RC-004 | QMQ | topic 'member.grade.change.event' 是否已注册？ | 需确认 |
| RC-006 | QSchedule | 任务 'gradeExpirationJob' 是否已创建？ | 需确认 |
```
选项：对每个可选 "已就绪" / "实现阶段处理" / "未就绪"

**若所有 manual_confirm 项都可通过历史经验或产物信息自动确认 → 跳过此步骤**

### 5. 聚合结果

对每个 check 标注最终状态：
- ✅ READY — 校验通过
- 🟡 WARN — 不阻塞（createDuringImpl=true 或用户选择"实现阶段处理"）
- 🔴 BLOCKED — 必须解决
- 🔵 MANUAL — 人工已确认就绪

### 6. 产出

Write `spechub/{reqId}/readiness-check.md`：
```markdown
# Infrastructure Readiness Check — {title}

## 校验结果
| # | ID | 中间件 | 资源 | 校验方式 | 状态 | 详情 |
|---|----|----- --|------|---------|------|------|

## 🔴 BLOCKED 补全清单（如有）
| # | 缺失项 | 需要的 Action | 负责方 |

## 结论
- BLOCKED: {N} 项
- WARN: {N} 项
- READY: {N} 项
- MANUAL: {N} 项
```

### 7. G1 判定

- **无 BLOCKED** → 自动通过 G1，更新 state.json，进入 DESIGN
- **有 BLOCKED** → 按类型处理：

#### SOA 类型的 BLOCKED（contract_exists / maven_jar_published 失败）

SOA 契约/JAR 不存在意味着后续编译必然失败，**不可跳过**：
- AskUserQuestion 选项：
  1. "已在 MOM 上创建并发布契约，重新校验" → 回到 Step 3 重新执行该 check
  2. "终止本次需求，先处理契约" → 停止

#### 其他类型的 BLOCKED

- AskUserQuestion：
  - "已补全，重新校验" → 回到 Step 3
  - "跳过阻塞项（我负责后续补全）" → 记录 divergence（type: infra_override），通过 G1
  - "终止本次需求" → 停止

### 8. 更新状态

state.json：
```json
{
  "currentPhase": "design",
  "phases": { "readiness": { "status": "done", "ts": "{ISO}", "outputs": ["readiness-check.md"] } },
  "gates": { "G1": { "passed": true, "ts": "{ISO}" } }
}
```
