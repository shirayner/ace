# Phase: COMPREHEND — 深度理解 + 代码验证 + 综合重建

## 职责
以代码事实验证产物假设，**基于验证结果重建正确的需求理解**，产出修正后的理解报告。

## 核心原则
**验证结论 > 产物声明。** D2/D3 发现的冲突必须回写覆盖 D1 的初始理解。
用户最终看到的 comprehension.md 是**修正后**的版本，不是"原始产物声明 + 附注冲突"。

## 输入
- `.ace/spechub/{reqId}/artifacts/` — 原始产物
- `.ace/project-profile.md` — 项目技术画像

## 产出（全部 MUST-WRITE）
- `$TASK_DIR/artifacts/comprehension.md` — **修正后**的统一理解
- `$TASK_DIR/artifacts/artifact-inventory.json`
- `$TASK_DIR/artifacts/readiness-manifest.json`
- `$TASK_DIR/state.json` 更新

---

## 执行步骤（3 阶段）

### Step 0: 等待 project-profile.md 就绪

**为什么在此处检查**：profile 是本 Phase 的直接输入（D2/D3/D4 Agent 都引用它），
但 profile 初始化（ace:init）是在前置检查阶段以后台 Agent 启动的，不阻塞 PULL。
PULL 通常需要网络调用（几秒~数十秒），COMPREHEND 开始时 init 大概率已完成。

```
IF $PROJECT_ROOT/.ace/project-profile.md 存在:
  → Read 一次，记录到上下文（后续 Step A 各维度 Agent 直接引用，不重复 Read）
  → 进入 Step A

ELSE:
  → 通知用户："project-profile.md 尚未生成，等待后台初始化完成（最多 3 分钟）..."
  → 每 30 秒检查一次文件是否存在（Glob + 判断）
  → 超时（3 分钟）后仍不存在：
      AskUserQuestion(questions: [{
        header: "初始化超时",
        question: "后台 ace:init 超时未完成，如何处理？",
        options: [
          {label: "重新初始化", description: "重新运行 /ace:init，完成后继续"},
          {label: "手动等待", description: "我去查看后台任务状态，完成后告知继续"},
          {label: "跳过（风险）", description: "不使用 profile 继续，D2/D3/D4 分析质量会下降"}
        ]
      }])
  → 用户选 "跳过" → 继续 Step A，各 Agent 提示中标注 "⚠️ 无 profile，依赖代码直接分析"
```

<HARD-GATE>
不得跳过此步骤直接进入 Step A。
profile 是 D4（中间件 Gap 识别）的关键输入——没有 profile 的中间件清单会导致 readiness-manifest.json 不完整，后续 READINESS 校验失效。
</HARD-GATE>

---
### Step A: 并行探索（发现原始事实）[MUST PARALLEL]

**必须**以并行 Agent 执行以下 5 个维度：

| 维度 | Agent 任务 | 产出 |
|------|-----------|------|
| D1: 语义分析 | 提取业务目标、核心流程、边界场景、隐含约束 | 原始需求理解（Prior） |
| D2: 代码验证 | 对产物中 [新增]/[修改] 声明搜索代码，确认是否已存在/可复用 | 验证结论 + 冲突清单 + **代码插入点** |
| D3: 架构一致性 | 产物技术选型 vs 现有架构模式（分层/命名/依赖方向） | 架构冲突点 |
| D4: 中间件 Gap + 校验清单 | 从产物提取所有中间件需求 + 标识符 | artifact-inventory.json + readiness-manifest.json |
| D5: 必要性审计 | 对每个设计决策：最简实现是什么？差异由何需求驱动？ | 简化建议 |

**违规**：逐个串行执行 D1-D5 = 违规。

#### Agent 输出预算约束 [HARD RULE]

每个 Agent 的 prompt **必须**包含以下指令：

```
## 输出预算约束（不可违反）
1. 返回到主 context 的内容 ≤ 20 行
2. 使用表格格式呈现结论
3. 详细分析（grep 结果、文件内容、完整推理过程）→ Write 到 {outputFile}
4. 返回中只引用文件路径，不贴原始代码内容
5. 你的返回是给主编排 Agent 看的摘要，不是给用户的最终报告
```

**各维度 outputFile 路径**：
- D1 → `$TASK_DIR/artifacts/analysis/d1-semantic.md`
- D2 → `$TASK_DIR/artifacts/analysis/d2-verification.md`
- D3 → `$TASK_DIR/artifacts/analysis/d3-architecture.md`
- D4 → `$TASK_DIR/artifacts/analysis/d4-infra-gaps.md`
- D5 → `$TASK_DIR/artifacts/analysis/d5-simplification.md`

**D2 Agent 额外要求**：对每个 `should-extend` 或 `conflict` 结论，必须同时输出：
1. **代码插入点**信息（类名、方法名、行号、扩展方式）
2. **精确方法签名**（含参数类型和返回类型）— 包括插入点方法本身和该方法调用的关键依赖方法

写入 d2-verification.md 中，并在返回摘要中包含一行式插入点引用。

**D2 签名输出格式**（在 d2-verification.md 中，每个插入点必须包含）：
```markdown
### 插入点 X: {功能点名}
- 文件: `{模块/相对路径}`
- 类/方法: `{ClassName}.{methodName}()` (Line {N})
- 方法签名: `{ReturnType} {methodName}({ParamType1} param1, ParamType2 param2})`
- 当前逻辑: {一句话描述}
- 扩展方式: {具体怎么扩展}
- 目标类依赖的关键方法签名:
  - `{ClassName}.{method}({params}): {ReturnType}` — {一句话说明}
  - `{ClassName}.{method}({params}): {ReturnType}` — {一句话说明}
  - ...（列出 IMPLEMENT 阶段会调用到的所有跨层方法签名）
```

> **设计意图**：IMPLEMENT 阶段 §2.5 签名预读可直接引用此处签名，减少 Read 调用。
> 如果方法签名因类太长而无法在 D2 探索时确认，至少标注 `[需 IMPLEMENT 时确认]`。

**Agent 返回格式示例**（D2）：
```
| 产物声明 | 结论 | 插入点 | 签名 | 证据文件位置 |
|---------|------|--------|------|------------|
| [新增] 保级Job | should-extend | ExpirationJob.java:89 processGradeExpiration() | void processGradeExpiration(MemberGrade) | d2-verification.md §1 |
| [新增] 降级Service | should-extend | GradeChangeService.java:45 handleGradeChange() | IBUErrorCode handleGradeChange(MemberGrade, TriggerSource) | d2-verification.md §2 |
| [新增] 规则配置 | confirm-new | — | — | d2-verification.md §3 |

详情已写入 $TASK_DIR/artifacts/analysis/d2-verification.md
```

---

### Step B: 综合重建（Reconciliation）— 不可跳过

**目的**：将 D2/D3/D5 的验证结论**回写**到 D1 的初始理解中，产出一个**统一的、修正后的**需求理解。

**认知模型**：
```
Prior（D1 产物声明）+ Evidence（D2/D3/D5 验证结果）= Posterior（修正后理解）

这不是并列呈现 Prior 和 Evidence，
而是用 Evidence 修改 Prior，只输出 Posterior。
```

**执行规则**：

对 D2 验证结论中的每个条目：

| D2 结论 | 对 D1 理解的修改动作 |
|---------|-------------------|
| `confirm-new`（确认不存在） | 保留产物声明原文 |
| `should-extend`（应扩展现有） | **重写**该功能点描述为"扩展现有 X 增加 Y 能力"，删除"新建"字样 |
| `reuse-existing`（直接复用已有） | **删除**该功能点（已有能力，无需实现） |
| `conflict`（方案与代码矛盾） | **重写**为代码事实支持的方向，标注原产物有误 |

对 D5 审计中标记为"过度设计"的条目：
- 功能点描述改为最简方案
- 标注 "⚠️ 产物原方案可能过度设计，建议用户裁决"

**输出格式变化**：comprehension.md 的 "业务目标" 和 "功能点" 部分是**修正后**的版本：

```markdown
## 修正后的需求理解（Posterior）

### 业务目标
（基于代码事实修正后的 1-2 句核心目标）

### 功能点清单（已按代码验证修正）
| # | 功能点 | 实现方向 | 修正说明 |
|---|--------|---------|---------|
| 1 | 黑钻保级判定 | 扩展现有等级过期 Job | 原产物声明"新建保级Job"，D2 发现 MembershipExpirationJob 已有保级链路 |
| 2 | 黑钻降级执行 | 扩展现有等级变更 Service | 原产物声明"新建降级Service"，D2 发现 GradeChangeService 已有降级接口 |
| 3 | 保级规则配置化 | 新建 QConfig 配置 | D2 确认不存在，confirm-new |

## 代码插入点详情（DESIGN 阶段直接引用，无需再次探索）

### 插入点 1: {功能点名}
- 文件: `{模块/相对路径}`
- 类/方法: `{ClassName}.{methodName}()` (Line {N})
- 方法签名: `{ReturnType} {methodName}({ParamType1} param1, {ParamType2} param2)`
- 当前逻辑: {一句话描述当前该方法做什么}
- 扩展方式: {具体怎么扩展——加分支/加 case/注入新依赖}
- 影响范围: {影响哪些调用方/测试}
- 依赖方法签名:
  - `{Class}.{method}({params}): {Return}` — {说明}
  - `{Class}.{method}({params}): {Return}` — {说明}

### 插入点 2: ...
（每个 should-extend/conflict 结论对应一个插入点）
```

**关键设计：代码插入点的作用**

此 section 是 DESIGN 阶段的**直接输入**。有了它，DESIGN 阶段不需要再派 Agent 去读代码文件——直接基于插入点信息做技术设计。这节省 ~20% context 和 ~10 分钟时间。

插入点信息来源：D2 Agent 在验证过程中已经定位了具体代码位置，顺手产出即可，不增加额外工作。

---

### Step C: G0 智能分流（争议度驱动）

**G0 不再是固定的完整确认，而是根据争议度评分自动选择介入级别。**

#### 争议度评分算法

```
contention_score = 0

# D2 代码验证冲突（每个 conflict/should-extend +3）
contention_score += count(d2.conclusions, status IN ['conflict', 'should-extend']) × 3

# D5 简化建议中的 scope 争议（每个 +2）
contention_score += count(d5.suggestions, type='scope_question') × 2

# D3 架构不一致项（每个 +2）
contention_score += count(d3.results, status='inconsistent') × 2

# D2 reuse-existing 不计分（直接删除功能点，无争议）
# D2 confirm-new 不计分（产物正确，无修正）
```

#### 分流规则

**争议度 = 0（零冲突）→ Level 1：通知式前进**

展示格式：
```markdown
✅ 需求理解完成，无冲突无争议。

**业务目标**: {一句话}
**Scope**: {N} 个功能点确认 In，{M} 个删除（已有实现）
**中间件**: {K} 项待校验

[查看完整 comprehension.md] [有异议?]
```

行为：不阻塞，直接进入 READINESS。用户可随时回溯查看或提出异议。

state.json 记录：
```json
{
  "gates": { "G0": { "passed": true, "level": 1, "contentionScore": 0, "ts": "ISO" } }
}
```

---

**争议度 1-4（少量冲突）→ Level 2：精简确认**

仅展示需要用户裁决的项（≤5 项），不展示完整理解：

```markdown
**需裁决项**（{N} 项冲突需你确认方向）

| # | 产物声明 | 代码事实 | AI 建议 | 你的判断 |
|---|---------|---------|---------|---------|
| 1 | 新建保级 Job | 已有 ExpirationJob | → 扩展现有 | ✅/❌ |

**Scope 争议**（如有）
| # | 功能点 | AI 建议 | 理由 |
|---|--------|---------|------|
| 1 | 扩展积分 | ⚠️ 非必需 | D5: 最简实现不需要 |

[查看完整 comprehension.md]
```

AskUserQuestion 选项：
- "确认 AI 建议，继续"
- "需要调整"（用户输入修正）

---

**争议度 > 4（多冲突/高争议）→ Level 3：完整 G0**

按原有完整格式展示（Read `references/gate-formats.md` §G0 Level 3）：
- 完整修正后需求理解
- 冲突清单 + Scope 裁决表 + 中间件 Footprint + 完成标准

AskUserQuestion 选项：
- "确认并继续"
- "需要调整 Scope"
- "有疑问需讨论"

---

### 完整的 comprehension.md 格式

```markdown
# 需求理解 — {title}

## 修正后的需求理解

### 业务目标
（修正后的核心目标）

### 功能点清单（Posterior）
| # | 功能点 | 实现方向 | 修正说明 |
|---|--------|---------|---------|

## 验证详情

### 代码验证结论（D2）
| # | 产物声明 | 验证结论 | 证据 |
|---|---------|---------|------|

### 架构一致性（D3）
（产物选型 vs 现有模式的冲突点）

### 中间件 Footprint（D4）
（已有中间件 + 新增中间件列表）

### 简化建议（D5）
| # | 功能点 | 产物方案 | 最简方案 | 差异驱动力 | 建议 |
```

---

## 关键设计约束

1. **comprehension.md 的"需求理解"部分必须是 Posterior（修正后）版本** — 不可照搬产物原文
2. **G0 展示给用户的是"修正 + 确认请求"** — 用户确认的是修正方向，不是验证通过
3. **Scope 裁决基于修正后功能点** — D2=should-extend 的功能点描述为"扩展"而非"新建"
4. **divergences 在 Step B 产出** — 每个修正即一个 divergence（type: artifact_error）

---

## readiness-manifest.json 生成规则

从产物中提取中间件标识符，按 `references/readiness-schema.json` 的 checkType 分类：

```json
{
  "reqId": "{reqId}",
  "title": "{title}",
  "generatedAt": "{ISO}",
  "checks": [
    {
      "id": "RC-001",
      "type": "从 readiness-schema.json 的 checkTypes 中选择",
      "description": "人类可读描述",
      "params": { "按 checkType 的 requiredParams + optionalParams 填充" },
      "paramGaps": ["缺失的参数名列表"],
      "source": "从哪个产物文件提取的",
      "relatedScope": ["关联的功能点"]
    }
  ]
}
```

**paramGaps 处理规则**：此阶段**不追问**缺失参数，只标记。留给 READINESS Phase 统一处理。

### SOA 接口识别规则（D4 Agent 必须执行）

**前提假设**：SOA 接口的契约必须在 READINESS 校验之前由用户在 MOM 上创建并发布。READINESS 阶段校验的是"契约是否已就绪"，而非"是否需要契约"。如果契约尚未创建 → READINESS 应阻塞等待用户创建，而非 WARN 跳过。

D4 Agent 必须结合产物声明 + D2 代码验证结论，识别以下 SOA 场景：

| 场景 | 识别方法 | 生成的 check type | version 处理 |
|------|---------|-----------------|-------------|
| 新增接口（provider） | 产物中标注"新增接口" / D2 确认代码中不存在该接口 | soa_new_interface | paramGaps，用户提供 |
| 修改已有接口（provider） | 产物中标注"修改接口" / D2 发现现有接口签名需变更 | soa_new_interface | paramGaps，用户提供 |
| 依赖外部接口（consumer） | 产物中出现外部服务调用 / D2 发现需引入新的远程调用 | soa_dependency | paramGaps，用户提供 |

**统一原则**：所有 SOA 场景的 `version` 一律放入 paramGaps，由用户在 READINESS 阶段提供。AI 不做任何版本号推测。

**params 推导优先级**：
1. 从产物中直接提取（如果产物标注了 appId/operationName）
2. 从 project-profile.md 的 SOA 配置中推导（本服务的 appId）
3. 推导不出 → 放入 paramGaps

**示例**：
```json
{
  "id": "RC-003",
  "type": "soa_new_interface",
  "description": "新增会员等级查询接口",
  "params": { "appId": "100012345", "operationName": "", "version": "" },
  "paramGaps": ["operationName", "version"],
  "source": "artifacts/architecture.md §接口设计",
  "relatedScope": ["会员等级查询"]
}
```

---

## Divergence 记录

Step B 中每个修正 → state.json.divergences[]：
```json
{
  "id": "DIV-{seq}",
  "type": "artifact_error",
  "severity": "significant",
  "phase": "comprehend",
  "category": "分类描述",
  "expected": "产物声明（Prior）",
  "actual": "修正后的理解（Posterior）",
  "reason": "代码证据 + 修正逻辑",
  "evidence": "具体代码路径或 grep 结果",
  "userApproved": false
}
```

G0 用户确认后 → `userApproved: true`

---

## 状态更新

state.json（`$TASK_DIR/state.json`）：
```json
{
  "currentPhase": "comprehend",
  "phases": { "comprehend": { "status": "done", "ts": "{ISO}", "outputs": ["comprehension.md", "artifact-inventory.json", "readiness-manifest.json"] } }
}
```
