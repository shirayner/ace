# Phase: COMPREHEND — 深度理解 + 代码验证 + 综合重建

## 职责
以代码事实验证产物假设，**基于验证结果重建正确的需求理解**，产出修正后的理解报告。

## 核心原则
**验证结论 > 产物声明。** D2/D3 发现的冲突必须回写覆盖 D1 的初始理解。
用户最终看到的 comprehension.md 是**修正后**的版本，不是"原始产物声明 + 附注冲突"。

## 输入
- `spechub/{reqId}/artifacts/` — 原始产物
- `.claude/project-profile.md` — 项目技术画像

## 产出（全部 MUST-WRITE）
- `spechub/{reqId}/comprehension.md` — **修正后**的统一理解
- `spechub/{reqId}/artifact-inventory.json`
- `spechub/{reqId}/readiness-manifest.json`
- state.json 更新

---

## 执行步骤（3 阶段）

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
- D1 → `spechub/{reqId}/analysis/d1-semantic.md`
- D2 → `spechub/{reqId}/analysis/d2-verification.md`
- D3 → `spechub/{reqId}/analysis/d3-architecture.md`
- D4 → `spechub/{reqId}/analysis/d4-infra-gaps.md`
- D5 → `spechub/{reqId}/analysis/d5-simplification.md`

**D2 Agent 额外要求**：对每个 `should-extend` 或 `conflict` 结论，必须同时输出"代码插入点"信息（类名、方法名、行号、扩展方式），写入 d2-verification.md 中，并在返回摘要中包含一行式插入点引用。

**Agent 返回格式示例**（D2）：
```
| 产物声明 | 结论 | 插入点 | 证据文件位置 |
|---------|------|--------|------------|
| [新增] 保级Job | should-extend | ExpirationJob.java:89 processGradeExpiration() | d2-verification.md §1 |
| [新增] 降级Service | should-extend | GradeChangeService.java:45 handleGradeChange() | d2-verification.md §2 |
| [新增] 规则配置 | confirm-new | — | d2-verification.md §3 |

详情已写入 spechub/{reqId}/analysis/d2-verification.md
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
- 当前逻辑: {一句话描述当前该方法做什么}
- 扩展方式: {具体怎么扩展——加分支/加 case/注入新依赖}
- 影响范围: {影响哪些调用方/测试}

### 插入点 2: ...
（每个 should-extend/conflict 结论对应一个插入点）
```

**关键设计：代码插入点的作用**

此 section 是 DESIGN 阶段的**直接输入**。有了它，DESIGN 阶段不需要再派 Agent 去读代码文件——直接基于插入点信息做技术设计。这节省 ~20% context 和 ~10 分钟时间。

插入点信息来源：D2 Agent 在验证过程中已经定位了具体代码位置，顺手产出即可，不增加额外工作。

---

### Step C: 冲突展示 + 用户确认（G0）

**G0 展示给用户的内容**（关键设计）：

```markdown
**修正后的需求理解**
（Step B 的 Posterior — 这是 AI 基于代码事实得出的最终理解）

**代码验证发现的冲突**（需要用户确认修正方向是否正确）
| # | 产物原始声明 | 代码事实 | AI 建议的修正 | 请确认 |
|---|-------------|---------|-------------|--------|
| 1 | 新建保级 Job | 已有 MembershipExpirationJob 含保级逻辑 | → 扩展现有 Job | ✅/❌ |
| 2 | 新建降级 Service | 已有 GradeChangeService 含降级接口 | → 扩展现有 Service | ✅/❌ |

**Scope 裁决表**（基于修正后理解）
| # | 功能点（修正后描述） | 建议 | 理由 |

**完成标准**（基于修正后的实现方向）
```

**用户确认的是**：
1. AI 的修正方向是否正确（可能用户确实需要新建，有 AI 不知道的理由）
2. 最终 Scope

**如果用户否决某个修正** → 恢复产物原始声明，记录为 "用户确认采用产物方案（理由：...）"

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

state.json：
```json
{
  "currentPhase": "comprehend",
  "phases": { "comprehend": { "status": "done", "ts": "{ISO}", "outputs": ["comprehension.md", "artifact-inventory.json", "readiness-manifest.json"] } }
}
```
