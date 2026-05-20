# 状态文件模板

响应式状态管理——让中断后的新 agent 能快速定位并继续。

---

## 轻量模板（TaskCreate < 6 个时使用）

```markdown
# {Task Title}
Type: {auto-goal | coding | ut | review}
Status: {pending | in-progress | done}
Created: {YYYY-MM-DD}
Updated: {YYYY-MM-DD HH:MM}

## Goal
{目标描述 + 完成标准}

## Tasks
- [ ] T{N}: {任务描述} ⟂
- [ ] T{N}: {任务描述} (depends: T{X})

## Decisions
- {决策}: {理由} (备选: {被否方案})
```

---

## 完整模板（TaskCreate ≥ 6 个时升级）

```markdown
# {Task Title}
Type: {type}
Status: in-progress
Created: {YYYY-MM-DD}
Updated: {YYYY-MM-DD HH:MM}

## Goal
{目标 + 完成标准}

## Phase Plan
### Phase 1: {title} — {pending|in-progress|done}
- Objective: {阶段目标}
- Tasks: T1, T2, T3
- Verification: {如何验证阶段完成}
- Summary: {完成后填写}

### Phase 2: {title} — pending
...

## Tasks
- [x] T1: {描述} — done
- [ ] T2: {描述} — in-progress ⟂
- [ ] T3: {描述} — pending ⟂
- [ ] T4: {描述} — pending (depends: T2, T3)

## Mental Model
{当前理解：关键假设、已验证事实、未知区域}

## Decisions
- {决策}: {理由} (备选: {被否方案})

## Risks
- {风险}: {缓解方案}

## Files Modified
- {path}: {变更说明}
```

---

## 使用规则

1. **创建时机**：对齐确认通过后，第一个动作
2. **更新频率**：每次 TaskUpdate 变更状态后同步更新
3. **升级信号**：TaskCreate 累计 ≥6 个 → 使用完整模板
4. **新目标 = 新目录**：不复用上一个目标的目录
5. **设计目标**：新 agent 读完 state.md + TaskList 后能以 80% 效率继续

---

## 并行标注约定

- `⟂` = 可并行子任务
- `(depends: X, Y)` = 必须等 X、Y 完成后执行
- 无标注 = 默认串行（按列表顺序）
