# Phase: PREPARE — 产物消化 + 基础设施校验（条件触发）

## 职责
读取平台产物，提取功能清单。**仅当产物声明了新增中间件时**才执行基础设施校验。

## 核心原则
**产物已经过充分人工澄清。** 本阶段不做"理解"或"审计"——只做信息提取和按需校验。

## 输入
- `$INPUT_DIR/artifacts/` — 原始产物（已澄清）
- `$INPUT_DIR/manifest.json` — 需求元数据
- `.ace/project-profile.md` — 项目技术画像（可选，无则从代码推导）
- `references/readiness-schema.json` — 静态校验规则定义（仅校验时需要）

## 产出
- `$TASK_DIR/artifacts/prepare-summary.md` — 功能清单 + 校验结果（如有）
- `$TASK_DIR/state.json` 更新

---

## 执行步骤

### Step 1: 读取产物 + 提取功能清单

Read `$INPUT_DIR/artifacts/` 下所有文件。如果 `.ace/project-profile.md` 存在则一并读取。

提取：
1. **功能点清单** — 所有需要实现的点（直接从产物表格/列表中提取）
2. **中间件依赖** — 涉及哪些中间件（SOA/QMQ/Redis/DB 等）
3. **关键约束** — 性能、兼容性、数据迁移等硬约束

### Step 2: 判定是否需要 readiness 校验

```
IF 产物中声明了以下任一 → 触发 readiness 校验（进入 Step 3）：
  - 新增 SOA 接口（provider 或 consumer）
  - 新增数据库表
  - 新增/修改 QMQ topic
  - 新增 Redis/MongoDB 资源
  - 新增 QSchedule 任务
  - 新增 DRC 同步
ELSE → 跳过校验，直接进入 Step 4
```

**判定依据**：产物中是否出现相关关键词/章节（如 "新增接口"、"DDL"、"消息设计"、contracts/ 目录非空）。

### Step 3: 基础设施校验（条件触发）

> 仅当 Step 2 判定需要时执行此步骤。

**3.1 生成 readiness-manifest.json**

从产物中提取中间件标识符，按 `references/readiness-schema.json` 分类：

```json
{
  "reqId": "{reqId}",
  "title": "{title}",
  "checks": [
    {
      "id": "RC-001",
      "type": "checkType",
      "description": "人类可读描述",
      "params": {},
      "paramGaps": ["缺失参数"],
      "source": "来源产物"
    }
  ]
}
```

Write `$TASK_DIR/artifacts/readiness-manifest.json`

**参数推导优先级**：
1. 产物中直接提取
2. project-profile.md 推导（如存在）
3. Grep pom.xml / 构建配置推导 appId、dbName
4. 推导不出 → paramGaps

**SOA 接口识别**：
- 新增/修改接口（provider）→ `soa_new_interface`
- 依赖外部接口（consumer）→ `soa_dependency`

**3.2 参数补全 + MCP 校验**

1. 先尝试自动推断 paramGaps（从 profile/产物/pom.xml）
   - 全部推断成功 → 跳过人工输入
   - 仍有缺失 → 批量 AskUserQuestion 一次补全

2. 对参数完整的 check，调用对应 MCP 工具并行验证
   - SOA check：paramGaps 未补全 = **BLOCKED**（编译依赖，不可绕过）
   - 其他 check：可降级为 WARN

3. **BLOCKED 自动降级规则**：
   - `db_new_table` + DDL 在产物中 → WARN（实现阶段创建）
   - `qconfig_file` 未创建 → WARN（实现阶段创建）
   - SOA 契约/JAR 不存在 → 保持 BLOCKED（编译依赖）

### Step 4: 产出 + G1 判定

Write `$TASK_DIR/artifacts/prepare-summary.md`：

**语言要求**：prepare-summary.md 全文使用中文（表头、描述、结论均中文；技术标识符保持英文）。

```markdown
# Prepare Summary — {title}

## 功能清单
| # | 功能点 | 实现方向 | 来源 |
|---|--------|---------|------|

## 基础设施校验（如执行）
| # | 中间件 | 资源 | 状态 | 详情 |
|---|--------|------|------|------|

## 结论
- 校验: {已执行/已跳过（无新增中间件）}
- BLOCKED: {N} | WARN: {N} | READY: {N}
```

**G1 判定**：
- **未执行校验（无中间件依赖）** → 自动通过 G1
- **校验结果无 BLOCKED** → 自动通过 G1
- **有 BLOCKED**：
  - SOA BLOCKED → AskUserQuestion："已在 MOM 创建契约，重新校验" / "终止"
  - 其他 BLOCKED → AskUserQuestion："已补全，重新校验" / "跳过（我负责补全）" / "终止"
  - 用户选择"跳过" → 记录 divergence（type: infra_override）→ 通过 G1

### Step 5: 更新状态

```json
{
  "currentPhase": "design",
  "phases": { "prepare": { "status": "done", "ts": "{ISO}", "outputs": ["prepare-summary.md"] } },
  "gates": { "G1": { "passed": true, "ts": "{ISO}" } }
}
```
