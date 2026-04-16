# 记忆系统

跨会话持久化开发者信息和项目上下文

---

## 记忆架构

```
┌─────────────────────────────────────────┐
│           工作记忆 (上下文窗口)            │
│    当前对话 + 相关 Rules + 激活 Skill      │
└─────────────────┬───────────────────────┘
                  │ 压缩/外化
                  ▼
┌─────────────────────────────────────────┐
│           短期记忆 (Session)             │
│    .tasks/{task-id}/state.md            │
│    任务状态、决策、进度                   │
└─────────────────┬───────────────────────┘
                  │ 归档/总结
                  ▼
┌─────────────────────────────────────────┐
│           长期记忆 (Cross-Session)        │
│    ~/.claude/memory/                    │
│    - MEMORY.md (索引)                    │
│    - user_profile.md (开发者画像)         │
│    - projects/ (项目记忆)                │
└─────────────────────────────────────────┘
```

---

## 三层记忆

### 1. 工作记忆

**位置**：Claude Code 上下文窗口

**内容**：
- 当前对话历史
- 加载的 Rules
- 激活的 Skill

**管理策略**：
- 压缩：已完成阶段摘要化
- 外化：关键决策写入文件

### 2. 短期记忆

**位置**：`.tasks/{task-id}/`

**内容**：
```markdown
# Task State
Type: auto-goal
Status: in-progress

## Goal
{目标 + 验收标准}

## Mental Model
{当前理解}

## Progress
- Phase 1: Done
- Phase 2: In Progress

## Decisions
- {决策}: {理由}
```

**用途**：任务中断恢复

### 3. 长期记忆

**位置**：`~/.claude/memory/`

**类型**：

| 文件 | 内容 | 更新时机 |
|------|------|---------|
| `MEMORY.md` | 记忆索引 | 手动维护 |
| `user_profile.md` | 开发者画像 | ace init 时 |
| `feedback_*.md` | 反馈记录 | 获得反馈时 |
| `projects/` | 项目记忆 | 项目结束时 |

---

## 开发者画像

### 角色模板

**Backend Developer**：
```markdown
---
name: Backend Developer
type: user
---

- 主要语言：Java/Kotlin
- 框架：Spring Boot, Spring Cloud
- 关注领域：微服务、性能优化、API 设计
- 常用工具：Maven/Gradle, Docker, Kubernetes
- 代码偏好：显式优于隐式，强调可读性
```

**Frontend Developer**：
```markdown
---
name: Frontend Developer
type: user
---

- 主要语言：TypeScript/JavaScript
- 框架：React/Vue/Angular
- 关注领域：用户体验、组件设计
- 常用工具：npm/yarn, Vite/Webpack
```

### 自动生成

ACE 根据选择的角色自动生成开发者画像：

```bash
ace init --role backend
# 生成 ~/.claude/memory/user_profile.md
```

---

## 记忆保存策略

### 保存门槛

**必须满足**（AND）：
1. 跨会话复用
2. 不可推导

**至少一项**（OR）：
3. 反直觉
4. 高复用
5. 纠错信号

### 绝不保存

- 项目特定的构建命令
- 临时状态
- 代码模式（可从代码推导）
- Git 历史

### 写入格式

```markdown
---
name: {name}
description: {one-line}
type: {user | feedback | project | reference}
---

{内容}

**Why:** {原因}

**How to apply:** {应用方法}
```

---

## 记忆使用

### 自动加载

```
Claude Code 启动
    ↓
加载 ~/.claude/CLAUDE.md
    ↓
解析 @ 引用
    ↓
加载 Rules
    ↓
加载 Memory（根据类型）
```

### 手动查询

```
用户：我之前的项目用什么数据库？
Claude：查询记忆系统...
        找到 projects/my-app/glossary.md
        回答：PostgreSQL
```

---

## 最佳实践

1. **定期整理** — 每月 review MEMORY.md
2. **保持精简** — 每条记忆 ≤ 10 行
3. **更新而非新建** — 已有记忆直接更新
4. **索引维护** — MEMORY.md 保持 < 100 行

---

## 故障排除

### 记忆未加载

```bash
# 检查文件存在
ls ~/.claude/memory/

# 检查格式正确
cat ~/.claude/memory/user_profile.md
```

### 记忆过时

```bash
# 更新记忆
# 直接编辑 ~/.claude/memory/*.md

# 或重新生成
cp templates/memory/roles/backend.md \
   ~/.claude/memory/user_profile.md
```
