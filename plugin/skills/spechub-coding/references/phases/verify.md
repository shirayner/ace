# Phase: VERIFY — 回归验证

## 职责
全量回归 + 覆盖率检查 + Scope 一致性确认。

> 由于 IMPLEMENT 阶段每个 task 已通过编译+测试，VERIFY 是**回归确认**而非首次验证。

## 输入
- 实现后的代码变更（已逐 task 验证过）
- IMPLEMENT 阶段产出的测试类

## 产出
- 全量编译/测试通过
- `$TASK_DIR/artifacts/handoff-check.md`
- `$TASK_DIR/state.json` 更新

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

Write `$TASK_DIR/artifacts/handoff-check.md`：
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

### 6. G3 最终确认（统一：偏离摘要 + 验证结果 + 归档确认）

**G3 不再仅仅是验证通过判定，而是整个流程的唯一统一确认点。**

将 IMPLEMENT 阶段累积的偏离 + VERIFY 验证结果合并为一次最终确认。

#### 最终确认级别判定

```
if 编译✅ AND 测试✅ AND count(divergences, batchDeferred=true) == 0 AND 无违规:
    → Level 1：通知式前进
elif 编译✅ AND 测试✅:
    → Level 2：展示偏离摘要 + 确认归档
else:
    → Level 3：完整展示 + 讨论
```

#### Level 1：通知式前进

```markdown
✅ 验证全部通过，无偏离。

**测试**: {N} 类 {M} 用例全部通过
**覆盖**: Scope In 功能 100% 覆盖
**偏离**: 无（或仅 minor 自动吸收 ×{K}）

即将自动归档到分支 feature/spechub-{reqId}-{slug}。
[查看 handoff-check.md] [有异议?]
```

行为：不阻塞，直接进入 ARCHIVE。

#### Level 2：展示偏离摘要 + 确认归档

```markdown
## 最终确认

### 验证结果 ✅
- 编译: 通过
- 测试: {N} 类 {M} 用例全部通过
- Scope 覆盖: 100%

### 实现偏离摘要（共 {total} 项）

**自动吸收（minor × {N}）** — 仅记录，不影响方案
| Task | 偏离描述 | 原因 |
|------|---------|------|
| ... | ... | ... |

**需确认（significant × {K}）**
| # | Task | 设计方案 | 实际实现 | 偏离原因 | 你的判断 |
|---|------|---------|---------|---------|---------|
| 1 | T3 | 用 Redis 缓存 | 用本地 Guava Cache | 实测 QPS 不需要分布式 | ✅/❌ |
| 2 | T5 | 同步调用 | 改为异步 QMQ | 避免阻塞主流程 | ✅/❌ |

### 归档信息
- 分支: feature/spechub-{reqId}-{slug}
- OpenSpec: 归档到 $CHANGE_DIR/
- SpecHub: 偏离上报（{M} 项 decisions）
```

AskUserQuestion 选项：
- "全部接受，确认归档" — 所有 batchDeferred 偏离 userApproved=true，进入 ARCHIVE
- "逐项审查" — 用户逐个确认/拒绝
- "有问题需修复" — 回到 IMPLEMENT 修复

#### Level 3：完整展示

在 Level 2 基础上增加：
- 违规项详情
- 测试失败详情
- 修复建议

AskUserQuestion 选项：
- "接受违规，继续归档"
- "修复后重新验证" — 回到 IMPLEMENT 修复
- "终止" — 用户处理

### 7. 更新状态

```json
{
  "currentPhase": "archive",
  "phases": { "verify": { "status": "done", "ts": "{ISO}", "outputs": ["handoff-check.md"] } },
  "gates": { "G3": { "passed": true, "ts": "{ISO}" } }
}
```
