# Phase: IMPLEMENT — 代码实现

## 职责
按 tasks.md 逐步实现代码，跟踪偏离。

## 输入
- `openspec/changes/{slug}/design.md` — 决策清单
- `openspec/changes/{slug}/tasks.md` — 任务清单
- `.claude/project-profile.md` — 项目编码约定

## 产出
- 实际代码变更
- tasks.md 中已完成 task 打勾 `[x]`
- state.json 更新（含实现偏离记录）

---

## 执行步骤

### 1. 调用 OpenSpec Apply

调用 `/opsx:apply` — 这将读取 change 的完整上下文并逐步实现。

如果 `/opsx:apply` 不可用，则手动逐 task 实现：

### 2. 逐 Task 实现

对 tasks.md 中的每个 task，执行以下**子协议**：

#### 2.1 明确依赖

读取 task 描述 + 关联决策（如 → D1, D3），识别该 Task 涉及的文件和**跨层调用的目标接口/类**。

#### 2.2 读取设计方案

读取 design.md 中对应决策的详细方案。

#### 2.3 参照编码约定

参照 project-profile.md 的编码约定实现。

#### 2.4 编写代码

基于 §2.5 签名预读结果编写代码。

#### 2.5 签名预读（Read-Before-Write）[HARD RULE]

对每个 Task 中涉及的**跨层调用**（调用其他模块的方法），编写调用代码前：

1. 从 comprehension.md §代码插入点详情 获取目标类路径
2. **Read 目标类/接口文件**，提取精确方法签名（方法名、参数类型、返回类型）
3. 将签名作为编码依据，**不可依赖记忆**

**触发条件**（满足任一即触发）：
- 调用 domain 层 Repository 接口的方法
- 调用 data 层工具类（CLoggerUtil、QConfigUtil 等）的方法
- 继承/实现 base 类的方法
- 使用其他模块的实体类 getter
- 调用枚举的静态值或方法

**违规判定**：编写调用代码时未在同一 turn 内 Read 过目标接口/类 = 违规。

#### 2.6 增量编译验证（Compile-Per-Task）[RECOMMENDED]

每完成一个 Task 的代码编写后：

1. 确定该 Task 涉及的 Maven 模块
2. 执行 `mvn compile -pl <modules> -DskipTests -am -q`
3. 编译通过 → 继续下一个 Task
4. 编译失败 → **立即修复**（在同一 Task 内），不推迟到后续

**优势**：
- 错误在产生时立即修复，上下文新鲜（文件刚读过/写过）
- 避免错误累积（后续 Task 可能依赖前序产出）
- 减少"全量编译后批量修错"的反复轮次

#### 2.7 完成标记

完成后将 `- [ ]` 改为 `- [x]`

#### 2.8 偏离自检

自检：实现是否偏离对应决策点？（见 §3 偏离检测）

### 3. 偏离检测

每完成一个 task，检查实际实现与 design.md 决策是否一致：

**一致** → 继续下一个 task

**偏离** → 记录 + 暂停确认：
```json
{
  "id": "DIV-{seq}",
  "type": "implementation_drift",
  "severity": "significant",
  "phase": "implement",
  "category": "实现偏离",
  "expected": "design.md 中 D{N} 的方案",
  "actual": "实际实现方式",
  "reason": "偏离原因（如：实现中发现约束）",
  "userApproved": false
}
```

→ AskUserQuestion："实现偏离了设计 D{N}，是否接受？"
- 接受 → userApproved=true，继续
- 拒绝 → 按设计重新实现

### 4. 回退条件

**≥2 个 task 偏离设计** → 建议回退到 DESIGN Phase（re-spec）：
- AskUserQuestion："已有 {N} 处偏离设计，建议回到设计阶段重新规划。继续/回退？"
- 回退 → state.json.currentPhase = "design"，重新进入 DESIGN

### 5. 更新状态

所有 task 完成后：
```json
{
  "currentPhase": "verify",
  "phases": { "implement": { "status": "done", "ts": "{ISO}", "outputs": ["tasks.md (all checked)"] } }
}
```

自动进入 VERIFY Phase（无 Gate）。

---

## Context Budget 规则

IMPLEMENT 阶段的上下文消耗应受控：

| 操作 | 允许？ | 说明 |
|------|--------|------|
| 大范围探索（派 Agent 遍历项目） | ⛔ 禁止 | COMPREHEND 已完成，不应重新探索 |
| 精确签名确认（Read 特定接口文件的特定方法声明，≤10 行） | ✅ 允许 | §2.5 签名预读的必要支撑 |
| 增量编译验证 | ✅ 允许 | §2.6 的必要支撑 |
| 读取 comprehension.md / design.md / tasks.md 引用 | ✅ 允许 | 正常实现流程 |
| 读取 project-profile.md 查编码约定 | ✅ 允许 | 正常实现流程 |

**设计原理**：DESIGN 阶段禁止重新探索是合理的（产物已固定）。但 IMPLEMENT 阶段**必须允许精确的签名确认 Read**——因为"不再探索"≠"不可确认事实"。记忆 ≠ 事实，签名确认是低成本高收益的防错手段。
