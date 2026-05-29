# Phase: COMPREHEND — 深度理解 + 代码验证

## 职责
以代码事实验证产物假设，发现错误/冲突/过度设计，产出理解报告和校验清单。

## 输入
- `spechub/{reqId}/artifacts/` — 原始产物
- `.claude/project-profile.md` — 项目技术画像

## 产出（全部 MUST-WRITE）
- `spechub/{reqId}/comprehension.md`
- `spechub/{reqId}/artifact-inventory.json`
- `spechub/{reqId}/readiness-manifest.json`
- state.json 更新

---

## 执行步骤

### 1. 读取输入
- Read `.claude/project-profile.md` → 提取架构分层、中间件使用表
- Read `spechub/{reqId}/artifacts/` 全部产物
- Read `spechub/{reqId}/manifest.json` → 需求标题和元信息

### 2. 五维度并行探索 [MUST PARALLEL]

**必须**以并行 Agent 执行以下 5 个维度：

| 维度 | Agent 任务 | 产出 |
|------|-----------|------|
| D1: 语义分析 | 提取业务目标、核心流程、边界场景、隐含约束 | comprehension.md §业务目标 |
| D2: 代码验证 | 对产物中 [新增]/[修改] 声明搜索代码，确认是否已存在/可复用 | comprehension.md §验证结论 + divergences |
| D3: 架构一致性 | 产物技术选型 vs 现有架构模式（分层/命名/依赖方向） | comprehension.md §架构一致性 |
| D4: 中间件 Gap + 校验清单 | 从产物提取所有中间件需求 + 具体标识符，生成 readiness-manifest.json | artifact-inventory.json + readiness-manifest.json |
| D5: 必要性审计 | 对每个设计决策：最简实现是什么？差异由何需求驱动？ | comprehension.md §简化建议 |

**违规**：逐个串行执行 D1-D5 = 违规。

### 3. 聚合结果

将 5 个 Agent 的结果聚合为以下产出物：

#### comprehension.md 格式
```markdown
# 需求理解 — {title}

## 业务目标（D1）
（1-2 句核心目标 + 关键流程）

## 代码验证结论（D2）
| # | 产物声明 | 验证结论 | 证据 |
|---|---------|---------|------|
| 1 | [新增] XXX Service | should-extend: 现有 YYY 可扩展 | grep: path/to/file:line |
| 2 | [新增] ZZZ Table | confirm-new: 不存在 | grep: no match |

## 架构一致性（D3）
（产物选型 vs 现有模式的一致/冲突点）

## 中间件 Footprint（D4）
（已有中间件 + 新增中间件列表）

## 简化建议（D5）
| # | 功能点 | 产物方案 | 最简方案 | 差异驱动力 | 建议 |
```

#### readiness-manifest.json 生成规则

从产物中提取中间件标识符，按 `references/readiness-schema.json` 的 checkType 分类：

```json
{
  "reqId": {reqId},
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

### 4. 记录差异

D2 验证发现的每个矛盾 → 记录到 state.json.divergences[]：
```json
{
  "id": "DIV-{seq}",
  "type": "artifact_error",
  "severity": "significant|minor",
  "phase": "comprehend",
  "category": "分类描述",
  "expected": "产物声明",
  "actual": "代码事实",
  "reason": "结论及证据",
  "evidence": "具体代码路径或 grep 结果",
  "userApproved": false
}
```

### 5. 更新状态

state.json：
```json
{
  "currentPhase": "comprehend",
  "phases": { "comprehend": { "status": "done", "ts": "{ISO}", "outputs": ["comprehension.md", "artifact-inventory.json", "readiness-manifest.json"] } }
}
```

### 6. 进入 G0

Read `references/gate-formats.md` §G0，按格式展示 + AskUserQuestion 确认。
