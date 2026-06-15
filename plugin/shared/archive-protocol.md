# 双归档通用协议

所有经过 OpenSpec 的任务（spec-coding / spechub-coding）在完成后执行双归档。
simple 类型（auto-goal / requirement-analysis / code-review）只执行 ACE 侧归档。

---

## 协议 A：spec-coding（三步）

```bash
# Step 1: OpenSpec 归档（失败则停，不继续）
openspec archive {changeName} --yes

# Step 2: 标记 ACE 任务完成
ace task complete {changeName}

# Step 3: ACE 归档
ace task archive {changeName}
```

## 协议 B：spechub-coding（两步，无 OpenSpec 依赖）

```bash
# Step 1: 标记完成 + ACE 本地归档（推荐合并命令）
ace task done {changeName}

# Step 2: SpecHub 远程上报（本地归档完成后再上报平台）
python3 {skillDir}/scripts/spechub-workflow.py archive {reqId} \
  --repo-root {repoRoot} --branch {branchName} --commit {commitHash}
```

> **顺序说明**：本地归档（`ace task done`）先于远程上报。
> `spechub-workflow.py archive` 已支持扫描已归档目录，无需任务在活跃路径。
> 语义上本地整理完毕再通知平台，出现异常时回滚成本更低。

## 协议 C：simple 类型（推荐单命令）

```bash
# 推荐：一条命令完成 complete + archive（原子两步，任一失败中止）
ace task done {changeName}
```

如需单步执行（调试、分步操作），可拆开：

```bash
# Step 1: 标记 ACE 任务完成
ace task complete {changeName}

# Step 2: ACE 归档
ace task archive {changeName}
```

> ⚠️ 拆开执行时，**Step 1 执行后必须立即执行 Step 2**，不得以任何理由中断。
> `ace task list` 会对 completed 但未归档的任务标注 `⚠ awaiting-archive`。

---

## 幂等性与失败处理

- 每个步骤独立幂等，可重试
- 不追求跨双根原子性
- OpenSpec 归档失败 → 停止，不执行后续步骤，向用户报告错误原因

---

## 路径推导约定（替代 openspec_link 字段）

| 需求                 | 推导方式                                              |
| -------------------- | ----------------------------------------------------- |
| 活跃 change 路径     | `openspec/changes/{changeName}/`                    |
| 归档 change 路径     | `glob: openspec/changes/archive/*-{changeName}/`    |
| 活跃 ACE 任务路径    | `.ace/tasks/{changeName}/`                          |
| 归档 ACE 任务路径    | `glob: .ace/tasks/archive/*-{changeName}/`          |

**核心**：`changeName` 是唯一的跨双根关联 key，不存储冗余路径。
