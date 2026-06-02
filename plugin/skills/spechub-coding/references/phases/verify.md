# Phase: VERIFY — 回归验证

## 职责
全量回归 + 覆盖率检查 + Scope 一致性确认。

> 由于 IMPLEMENT 阶段每个 task 已通过编译+测试，VERIFY 是**回归确认**而非首次验证。

## 输入
- 实现后的代码变更（已逐 task 验证过）
- IMPLEMENT 阶段产出的测试类

## 产出
- 全量编译/测试通过
- `spechub/{reqId}/handoff-check.md`
- state.json 更新

---

## 执行步骤

### 1. 全量编译

```bash
mvn compile -DskipTests
```

- 预期：一次通过（每个 task 已单独编译过）
- 若失败 → 检查 task 间交互问题（跨 task 类型引用冲突），修复后重新编译
- 最大重试 2 次，仍失败 → AskUserQuestion 告知用户

### 2. 全量测试（回归）

```bash
mvn test
```

- 预期：一次通过（每个 task 的测试已单独跑过）
- 若失败 → 分析是否为**跨 task 集成问题**（IMPLEMENT 阶段的单 task 测试未覆盖的交互）
- 修复后重新运行
- 项目无法本地测试 → 标注跳过原因，AskUserQuestion 确认

### 3. Scope 覆盖检查

对照 G0 确认的 Scope In 功能点：
| 功能点 | Scope 决策 | 代码覆盖 | 测试覆盖 | 状态 |
|--------|-----------|---------|---------|------|
| ... | Scope In | ✅ 已实现 | ✅ 有测试 | OK |
| ... | Scope Out | ❌ 未出现 | — | OK |

任何 Scope In 未覆盖 → 告警
任何 Scope In 无测试 → 补充测试

### 4. 清理临时文件

```bash
git status
```
移除非功能性的临时文件（如果有）。

### 5. 生成 Handoff Check

Write `spechub/{reqId}/handoff-check.md`：
```markdown
# Handoff Check — {title}

## git diff 摘要
（`git diff --stat` 输出）

## Scope 覆盖矩阵
| 功能点 | Scope 决策 | 代码覆盖 | 测试覆盖 | 状态 |

## 测试摘要
- 测试类数: N
- 测试用例数: M
- 全部通过: ✅/❌

## 编码约定一致性
- 命名规范: ✅/❌
- 分层依赖方向: ✅/❌
- 日志/异常处理: ✅/❌

## 违规项
（无 / 具体描述）
```

### 6. G3 自动判定

编译通过 + 测试通过 + handoff-check.md 存在 → 自动通过 G3

有违规项 → AskUserQuestion 确认是否继续

### 7. 更新状态

```json
{
  "currentPhase": "archive",
  "phases": { "verify": { "status": "done", "ts": "{ISO}", "outputs": ["handoff-check.md"] } },
  "gates": { "G3": { "passed": true, "ts": "{ISO}" } }
}
```
