# Phase: DESIGN — 技术方案

## 职责

生成 proposal + design + tasks（通过 OpenSpec），形成可追溯的技术方案。

## 输入

- `$TASK_DIR/artifacts/prepare-summary.md` — 功能清单 + 校验结果
- `.ace/project-profile.md` — 项目编码约定（可选，无则通过代码探索推导）
- `$INPUT_DIR/artifacts/` — 原始平台产物（架构设计、接口契约等）

## 代码探索规则

```
✅ 允许 Read 项目代码文件来确认扩展点、现有接口签名、架构模式
✅ 允许 Grep/Glob 定位相关类和方法
✅ 允许基于代码事实做技术决策
⛔ 禁止派大量 Agent 做全项目遍历（保持探索的精确性和效率）
```

**设计原则**：DESIGN 阶段需要了解代码现状来做出正确的技术决策。允许按需读取代码，但应保持目标明确——定位锚点、定位扩展点、确认接口签名、理解现有模式，而非无目的遍历。

### 代码探索策略（何时必须探索）

**必须探索的场景**（不探索 = 设计可能出错）：

| 场景                   | 探索目标                             | 方法                                    |
| ---------------------- | ------------------------------------ | --------------------------------------- |
| 产物声明"扩展现有功能" | 确认扩展点的精确位置、签名、当前逻辑 | Grep 关键类名 → Read 目标方法          |
| 产物声明"新增接口"     | 确认同层接口的命名模式和依赖注入方式 | Glob 同层目录 → Read 一个典型接口      |
| 产物涉及表结构变更     | 确认现有 Entity/DAO 的字段映射方式   | Grep 表名 → Read 对应 Entity           |
| 产物涉及消息消费/发送  | 确认项目的 QMQ 使用模式（注解/手动） | Grep`@QmqConsumer` 或 MessageListener |
| 设计决策有多方案       | 确认项目已有的技术选型偏好           | 参考 profile + Grep 相关组件使用        |

**可以跳过探索的场景**：

| 场景                           | 理由           |
| ------------------------------ | -------------- |
| 纯新增独立模块，不涉及现有代码 | 无扩展点需确认 |
| 产物已详细给出接口签名和类设计 | 信任产物即可   |
| DDL/配置类变更                 | 无代码交互     |

**探索输出**：探索结果应直接体现在 design.md 的决策清单中：

```markdown
D2: 保级判定扩展点
- 选择: 扩展 MembershipExpirationJob.processGradeExpiration()
- 代码事实: 该方法当前仅处理过期逻辑(Line 89-120)，可在末尾插入保级判定分支
- 签名: void processGradeExpiration(MemberGrade grade)
- 扩展方式: 在 switch-case 中增加保级 case
```

## 产出

- `$CHANGE_DIR/proposal.md`
- `$CHANGE_DIR/design.md`
- `$CHANGE_DIR/tasks.md`
- `$TASK_DIR/state.json` 更新（含 changeName）

---

## 执行步骤

### 1. 创建 OpenSpec Change

```bash
openspec new change {changeName} --description "{title}"
```

changeName 规则：需求标题的 kebab-case 简写（如 `grade-retention-rules`），与 `$TASK_DIR` 同名

### 2. 生成 Proposal

```bash
openspec instructions proposal --change {changeName}
```

基于指令 + 以下输入生成 `proposal.md`：

- prepare-summary.md 中的功能点清单
- prepare-summary.md 中的业务目标
- 原始产物中的详细需求描述

**语言要求**：proposal.md 全文使用中文撰写（代码标识符保持英文）。

**Proposal 质量要求**：

- 问题陈述清晰（不是解决方案）
- 范围界定明确（与 prepare-summary.md 功能点清单一致）
- ≥2 个可测试验收条件

### 3. 技术方案澄清

基于产物中的架构设计 + profile + prepare-summary.md + **代码探索结果**：

AskUserQuestion 确认关键技术决策（仅存在真实不确定性时）：

- 中间件选型（有多个可行方案时）
- 接口设计（契约定义的关键选择）
- 数据模型（表结构的关键决策）

**如果产物 + profile + 代码探索已足够确定方案 → 不追问，直接进入生成。**

### 4. 生成 Design + Tasks

```bash
openspec instructions design --change {changeName}
```

生成 `design.md`：

- 决策清单：D1, D2, D3...（每条含：决策标题 / 选项对比 / 选择 / 理由 / 驱动需求）
- 接口契约引用
- 数据流描述
- **语言要求**：design.md 全文使用中文撰写（代码标识符、类名、方法签名保持英文）

生成 `tasks.md`：

- 每 task 关联决策点（如 `→ D1, D3`）
- 拓扑顺序：DDL → DAO → SOA → QMQ → QConfig → QSchedule → Service → Test
- 每 task 有明确的"做完了"标准
- 每 task 标注测试策略：FULL_TDD / COMPILE_ONLY / SKIP_TEST
- FULL_TDD 类 task 附带测试用例方向提示（正常/异常/边界）
- 测试策略选择：Service/Logic → FULL_TDD；DAO/Entity/DTO → COMPILE_ONLY；DDL/SQL/Config → SKIP_TEST
- **语言要求**：tasks.md 使用中文撰写（task 描述、完成标准均用中文）

### 5. 记录设计偏离

本地方案与平台产物建议的差异 → 记录 divergences：

```json
{
  "id": "DIV-{seq}",
  "type": "design_choice",
  "severity": "significant",
  "phase": "design",
  "category": "技术选型 | 架构决策 | 接口设计",
  "expected": "平台建议方案",
  "actual": "本地选择方案",
  "reason": "选择理由",
  "userApproved": false
}
```

追加到 `$TASK_DIR/artifacts/divergences.jsonl`（每行一个 JSON 对象）。

### 6. G2 条件式判定

**G2 不再固定要求完整确认，而是根据方案确定性自动选择介入级别。**

#### 方案确定性评估

```
certainty = HIGH  # 默认

# 降级条件（任一触发 → 降级）
if count(divergences, type='design_choice', severity='significant') >= 2:
    certainty = LOW
if 存在跨模块架构变更:
    certainty = LOW
if count(决策点中有多个可行选项的) >= 3:
    certainty = LOW
elif count(决策点中有多个可行选项的) >= 1:
    certainty = MEDIUM

# 最终判定
if certainty == HIGH:
    所有决策点只有唯一解（profile + 代码约束决定）
    无新增 significant divergence
    tasks.md 中所有 task 可直接映射到 prepare-summary.md 功能点
```

#### 分流执行

**HIGH_CERTAINTY → Level 1：通知式前进**

```markdown
✅ 技术方案已生成，所有决策由约束唯一确定。

**决策摘要**: {N} 个决策点，均由项目约定/代码现状确定
**任务清单**: {M} 个 task（{TDD}个 FULL_TDD + {CO}个 COMPILE_ONLY + {ST}个 SKIP_TEST）
**偏离**: 无新增 design_choice

[查看 design.md] [查看 tasks.md] [有异议?]
```

行为：不阻塞，直接进入 IMPLEMENT。

---

**MEDIUM_CERTAINTY → Level 2：精简确认**

仅展示有多选项的决策点（其余自动采纳唯一解）：

```markdown
以下决策需要你确认（其余 {N-K} 个决策已由约束确定）：

| D# | 决策 | 选项 A | 选项 B | AI 推荐 | 推荐理由 |
|----|------|--------|--------|---------|---------|
| D3 | 缓存策略 | Redis | 本地缓存 | Redis | 已有 cluster |
```

AskUserQuestion 选项：

- "接受 AI 推荐" — 采纳所有推荐选项
- "需要调整" — 用户选择不同方案

---

**LOW_CERTAINTY → Level 3：完整 G2**

展示完整决策信息：

```markdown
**决策清单**
| D# | 决策 | 选择 | 理由 | 驱动需求 |
|----|------|------|------|---------|

**任务清单**
| T# | 任务 | 关联决策 | 测试策略 | 顺序 |
|----|------|---------|---------|------|

**新增差异**（design_choice divergences）
| # | 平台建议 | 本地方案 | 偏离理由 |
|---|---------|---------|---------|
```

AskUserQuestion 选项：

- "确认，开始实现"
- "需要调整设计"
- "有技术问题需讨论"

---

### 7. 更新状态

G2 通过后（`$TASK_DIR/state.json`）：

```json
{
  "currentPhase": "implement",
  "phases": { "design": { "status": "done", "ts": "{ISO}", "outputs": ["proposal.md", "design.md", "tasks.md"] } },
  "gates": { "G2": { "passed": true, "ts": "{ISO}" } }
}
```

> **$CHANGE_DIR 推导**：`openspec/changes/{changeName}/`（同名耦合，无需额外字段存储）
