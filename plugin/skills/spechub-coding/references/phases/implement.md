# Phase: IMPLEMENT — TDD 微循环实现

## 职责
按 tasks.md 逐 task 实现代码，每个 task 遵循 **Skeleton → Test → Implement → Verify** 微循环，确保每步都有绿灯确认。

## 输入
- `$CHANGE_DIR/design.md` — 决策清单（含接口契约）
- `$CHANGE_DIR/tasks.md` — 任务清单（含测试策略标注）
- `.ace/project-profile.md` — 项目编码约定（可选，无则从已有代码/pom.xml 推导）

## 产出
- 实际代码变更
- 对应的单元测试
- tasks.md 中已完成 task 打勾 `[x]`
- `$TASK_DIR/state.json` 更新（含实现偏离记录）

---

## 核心原则

**每个绿灯 = 一个安全点。** 下一个 task 从确定状态出发，而非从"应该没问题"出发。

---

## 执行步骤

### 逐 Task TDD 微循环

对 tasks.md 中的每个 task，根据其**测试策略标注**执行对应循环：

---

#### 策略 FULL_TDD（Service/Logic/Listener 类 task）

```
┌───────────────────────────────────────────────────────────┐
│ Step A: 签名预读 + 提取接口契约                            │
│ Step B: 写接口骨架（确定类名/方法签名/返回类型）          │
│ Step C: 编译骨架（COMPILE GATE #1 — 确认签名无误）        │
│ Step D: 写测试（基于已编译通过的真实签名）                 │
│ Step E: 编译测试（COMPILE GATE #2 — 确认测试可编译）      │
│ Step F: 填充实现（GREEN）                                 │
│ Step G: 运行测试（TEST GATE — 绿灯确认）                  │
│ Step H: 偏离自检 + 标记完成                               │
└───────────────────────────────────────────────────────────┘
```

**Step A — 签名预读 + 提取接口契约**

1. 从 design.md 中提取当前 task 关联决策的接口信息（类名、方法签名、返回类型、异常声明、依赖）
2. **利用 DESIGN 探索结果**：如果 design.md 决策中包含"代码事实"/"扩展点"/"签名"信息，直接引用（DESIGN 阶段已探索过的无需重复 Read）
3. **签名预读（Read-Before-Write）[HARD RULE]**：对该 task 涉及的**跨层调用**，编写代码前必须 Read 目标类/接口文件，提取精确方法签名

**签名预读触发条件**（满足任一即触发）：
- 调用 domain 层 Repository 接口的方法
- 调用 data 层工具类（CLoggerUtil、QConfigUtil 等）的方法
- 继承/实现 base 类的方法
- 使用其他模块的实体类 getter
- 调用枚举的静态值或方法

**快速定位策略**（代替原来的预定位信息）：
- 优先从 design.md 决策描述中获取文件路径和类名
- 不确定时用 Grep 精确搜索类名/方法名（而非全目录遍历）
- 单次 Read 控制在目标方法 ±20 行范围内（不读整个文件）

**违规判定**：编写调用代码时未在同一 turn 内 Read 过目标接口/类 = 违规。

**Step B — 写接口骨架**

创建/更新被测类，仅包含：
- 类定义 + 正确的包声明
- 方法签名（空方法体，return null/0/false/Collections.emptyList()）
- 依赖字段声明（`@Autowired` / 构造注入）

```java
// 骨架示例 — 仅签名，无逻辑
@Service
public class UserGradeService {
    @Autowired
    private GradeRepository gradeRepository;
    
    public GradeResult calculateGrade(String userId, List<Order> orders) {
        return null; // Step F 填充
    }
}
```

**Step C — 编译骨架（COMPILE GATE #1）**

```bash
mvn compile -pl {module} -am -DskipTests
```

- 通过 → 签名确认，进入 Step D
- 失败 → 修复签名（类型导入、包路径等）→ 重新编译
- 最多重试 2 次，仍失败 → AskUserQuestion

**本步的意义**：确保 Step D 写测试时引用的类/方法/类型都真实存在，消除"猜签名"问题。

**Step D — 写测试**

基于 **已编译通过的真实签名** + task 测试用例提示：
- 正常路径 1~2 个 case
- 关键异常/边界路径 1 个 case（如有）
- 测试命名：`test_{行为}_{条件}_{期望结果}`
- 测试粒度：仅覆盖当前 task 的行为

**测试类型区分**：
- **行为测试**（验证业务逻辑正确性）→ 必写。assert 具体业务结果。
- **契约测试**（验证输入输出格式符合 design.md）→ 选写。验证返回类型/异常类型。

**Mock 决策规则**：
- 当前模块内**已实现**的依赖（前序 task 完成） → 优先使用真实实现
- 当前模块内**本 task 的骨架类**（return null）→ mock
- 跨模块依赖（远程调用、DB、缓存、MQ）→ mock
- 外部 SDK → mock

**编写规则**：
- 第一个 task 的测试 → Write 新测试类
- 后续 task 同类的测试 → Edit 追加到已有测试类
- 参照 project-profile.md（如存在）或 Grep 已有测试类确定框架（JUnit4/5 + Mockito/PowerMock）
- 参照 `references/testing-guide.md` Mock 陷阱避坑

**Step E — 编译测试（COMPILE GATE #2）**

```bash
mvn compile -pl {module} -am
```

- 通过 → 继续 Step F
- 失败 → 修复测试中的引用（通常是 import 缺失或类型不匹配）→ 重新编译
- 最多重试 2 次

**Step F — 填充实现（GREEN）**

将 Step B 的空骨架填充为真实实现：
- 参照 design.md 对应决策方案
- 参照 project-profile.md（如存在）或已有代码风格确定编码约定
- 不超出当前 task scope
- **注意**：此时方法签名已锁定（Step C 确认），只需填充方法体

**Step G — 运行测试（TEST GATE）**

```bash
mvn test -pl {module} -Dtest={TestClass}#{method1}+{method2} -am
```

- 全部通过 ✅ → 进入 Step H
- 失败 → 分析原因：
  - 实现逻辑错误 → 修复实现
  - 测试预期不合理 → 修复测试（但需确认不是降低标准）
  - Mock 不完整 → 补充 mock
- 最多 3 次循环，仍失败 → AskUserQuestion 报告问题

**Step H — 偏离自检 + 标记完成**

1. 自检：实现是否偏离对应决策点？（见 §3 偏离检测 — 分级处理）
   - 无偏离 → 直接标记完成
   - 有偏离 → 按分级规则处理（AUTO_ABSORB/BATCH_REPORT/IMMEDIATE_ESCALATE）
2. **[必须执行 Edit]** 打开 `$CHANGE_DIR/tasks.md`（`$CHANGE_DIR` = `openspec/changes/{changeName}/`），将当前 task 的 `- [ ]` 改为 `- [x]`
   - 这是文件系统操作（Edit 工具），不是心理标记
   - 每完成一个 task 必须立即 Edit，不可攒到最后批量改

---

#### 策略 COMPILE_ONLY（DAO/Entity/DTO 类 task）

```
┌───────────────────────────────────────────────────────────┐
│ Step A: 签名预读（如有跨层依赖）                           │
│ Step B: 写实现代码                                        │
│ Step C: 编译门控                                          │
│ Step D: 偏离自检 + Edit tasks.md 标记 [x]                 │
└───────────────────────────────────────────────────────────┘
```

仅编译验证，不写测试（纯数据层，VERIFY 阶段通过全量测试覆盖）。

---

#### 策略 SKIP_TEST（DDL/SQL/Config 文件类 task）

```
┌───────────────────────────────────────────────────────────┐
│ Step A: 写变更内容                                        │
│ Step B: Edit tasks.md 标记 [x]                            │
└───────────────────────────────────────────────────────────┘
```

无需编译/测试（纯配置或 schema 变更）。

---

### 偏离检测（分级处理）

每完成一个 task，检查实际实现与 design.md 决策是否一致。

**偏离不再逐个确认，而是按严重度分级处理。**

#### 偏离分级规则

| 级别 | 条件 | 处理方式 | 示例 |
|------|------|---------|------|
| **AUTO_ABSORB** | minor：不改变对外接口签名的实现细节差异 | 记录 + 继续（不中断） | 方法名微调、参数顺序、内部算法选择、类型精确化 |
| **BATCH_REPORT** | significant：改变了方法签名/依赖/流程，但不影响其他未完成 task 的前提 | 累积 → VERIFY 完成后统一展示 | 方法签名变更、依赖替换、流程调整 |
| **IMMEDIATE_ESCALATE** | blocker：scope 蠕动、架构模式偏离、影响其他 task 前提 | 立即 AskUserQuestion | 超出产物定义范围的功能、改变分层方向、≥2 task 累积偏离 |

#### AUTO_ABSORB 处理

```json
{
  "id": "DIV-{seq}",
  "type": "implementation_drift",
  "severity": "minor",
  "phase": "implement",
  "category": "实现细节",
  "expected": "design.md 描述",
  "actual": "实际实现",
  "reason": "偏离原因",
  "autoAbsorbed": true,
  "userApproved": false
}
```

记录到 `$TASK_DIR/artifacts/divergences.jsonl`（追加一行）→ 继续下一个 task。无需任何中断。

#### BATCH_REPORT 处理

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
  "batchDeferred": true,
  "userApproved": false
}
```

记录到 `$TASK_DIR/artifacts/divergences.jsonl`（追加一行）→ 继续下一个 task。在 VERIFY 完成后的最终确认中统一展示。

#### IMMEDIATE_ESCALATE 处理

立即 AskUserQuestion：

```markdown
⚠️ 实现偏离（需立即确认）

| 决策 | 设计方案 | 实际实现 | 偏离原因 |
|------|---------|---------|---------|
| D{N} | ... | ... | ... |

**升级原因**: {scope蠕动 / 架构模式偏离 / 累积偏离≥2}
```

选项：
- "接受偏离，继续" → userApproved=true
- "按设计重新实现" → 回退当前 task
- "回退到 DESIGN 重新规划" → re-spec

### 回退条件

**≥2 个 IMMEDIATE_ESCALATE 级别偏离** → 建议回退到 DESIGN Phase（re-spec）：
- AskUserQuestion 自动触发（在第 2 个 IMMEDIATE_ESCALATE 时）："已有 {N} 处重大偏离设计，建议回到设计阶段重新规划。继续/回退？"
- 回退 → state.json.currentPhase = "design"，重新进入 DESIGN

### 更新状态

所有 task 完成后（`$TASK_DIR/state.json`）：
```json
{
  "currentPhase": "verify",
  "phases": { "implement": { "status": "done", "ts": "{ISO}", "outputs": ["tasks.md (all checked)", "test classes"] } }
}
```

自动进入 VERIFY Phase（无 Gate）。

---

## Context Budget 规则

IMPLEMENT 阶段的上下文消耗应受控：

| 操作 | 允许？ | 说明 |
|------|--------|------|
| 大范围探索（派 Agent 遍历项目） | ⛔ 禁止 | PREPARE 已完成，不应重新探索 |
| 精确签名确认（Read 特定接口文件的特定方法声明，≤10 行） | ✅ 允许 | Step A 签名预读的必要支撑 |
| 增量编译验证 | ✅ 允许 | COMPILE GATE 的必要支撑 |
| 读取 prepare-summary.md / design.md / tasks.md 引用 | ✅ 允许 | 正常实现流程 |
| 读取 project-profile.md 查编码约定 | ✅ 允许（可选） | 有则读，无则从代码推导 |

**设计原理**：DESIGN 阶段禁止重新探索是合理的（产物已固定）。但 IMPLEMENT 阶段**必须允许精确的签名确认 Read**——因为"不再探索"≠"不可确认事实"。记忆 ≠ 事实，签名确认是低成本高收益的防错手段。

---

## 测试问题排查

遇到测试编译失败、Mock NPE、框架选择不确定时 → Read `references/testing-guide.md`。
包含：框架检测表、Mock 陷阱速查、Mock 决策速查、粒度控制规则。
