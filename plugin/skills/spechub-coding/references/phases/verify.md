# Phase: VERIFY — 验证

## 职责
编译 + 测试 + 代码一致性检查。

## 输入
- 实现后的代码变更

## 产出
- 编译/测试通过
- `spechub/{reqId}/handoff-check.md`
- state.json 更新

---

## 执行步骤

### 1. 编译验证

```bash
mvn compile -DskipTests
```

- 编译失败 → 修复后重新编译，循环直到通过
- 最大重试 3 次，仍失败 → AskUserQuestion 告知用户

### 2. 运行单测

```bash
mvn test
```

- 测试失败 → 修复后重新运行，循环直到通过
- 项目无法本地测试 → 标注跳过原因，AskUserQuestion 确认

### 3. Scope 覆盖检查

对照 G0 确认的 Scope In 功能点：
| 功能点 | Scope 决策 | 代码覆盖 | 状态 |
|--------|-----------|---------|------|
| ... | Scope In | ✅ 已实现 | OK |
| ... | Scope Out | ❌ 未出现 | OK |

任何 Scope In 未覆盖 → 告警

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
| 功能点 | Scope 决策 | 代码覆盖 | 状态 |

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
