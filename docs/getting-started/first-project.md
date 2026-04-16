# 第一个项目

通过构建一个实际的任务管理 API，体验 aspec 的完整 spec coding 工作流程。

---

## 项目目标

构建一个**任务管理 API**，功能包括：
- 创建、读取、更新、删除任务
- 任务状态管理（待办/进行中/已完成）
- 简单的用户认证

技术栈：Spring Boot + PostgreSQL

---

## 准备工作

### 1. 创建项目目录

```bash
mkdir task-api
cd task-api
```

### 2. 初始化 aspec 工作流

```bash
ace spec init
```

这会创建 `openspec/` 目录，用于管理需求澄清、设计决策和知识累积。

### 3. 启动 Claude Code

```bash
claude
```

---

## 完整 Spec Coding 流程

aspec 的开发流程由**三个命令**驱动：

```
/opsx:proposal  ──→  /opsx:apply  ──→  /opsx:archive
  创建提案              代码实现            归档复盘
```

---

## Step 1: `/opsx:proposal` — 创建提案

在 Claude Code 中输入：

```
/opsx:proposal 我想开发一个任务管理 API
```

Claude 会自动执行以下流程：

### 1.1 需求澄清（门禁检查）

Claude 首先基于需求问题分类学（6 维度）扫描需求，识别不确定性：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
需求澄清 — 发现 4 个待确认问题
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

需要确认 4 个问题（2 High，2 Medium）：

1. 【High】任务状态流转规则
   选项：A) 任意状态可跳转 B) 待办→进行中→已完成 C) 自定义工作流

2. 【High】用户认证方式
   选项：A) JWT Token B) Session Cookie C) 暂不需要

3. 【Medium】任务是否支持标签/分类？
   选项：A) 是 B) 否 C) 后续迭代

4. 【Medium】是否需要任务优先级？
   选项：A) 是（高/中/低）B) 否 C) 后续迭代

────────────────────────────────────────
```

### 1.2 创建提案

澄清完成后，Claude 创建 `spec/proposal.md`：

```markdown
# Proposal: 任务管理 API

## Why
需要一个轻量级任务管理后端服务，支持个人或小团队的任务跟踪。

## Capabilities
1. 任务 CRUD 操作（基于澄清：需完整 CRUD）
2. 状态流转：待办 → 进行中 → 已完成（基于澄清：线性流转）
3. JWT 认证（基于澄清：选择 JWT）
4. 任务优先级：高/中/低（基于澄清：需要优先级）
5. 标签支持（基于澄清：后续迭代，本期不做）

## Impact
- 提供 RESTful API 供前端调用
- 支持多用户隔离
- 可扩展的架构设计
```

### 1.3 技术澄清（门禁检查）

Claude 基于技术设计问题分类学（7 维度）扫描设计方案，识别技术不确定性：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
设计澄清 — 发现 2 个待确认问题
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 【High】JWT Token 有效期设置？
   选项：A) 1小时 B) 24小时 C) 7天

2. 【Medium】是否需要软删除任务？
   选项：A) 是（保留数据）B) 否（物理删除）

────────────────────────────────────────
```

### 1.4 确定技术方案和任务

澄清完成后，Claude 生成完整产出：

**`spec/design.md`** — 技术设计：
```markdown
# Design: 任务管理 API 技术设计

## 架构
三层架构：Controller → Service → Repository

## 技术决策
### 1. 认证方案：JWT
选择: Spring Security + JJWT
理由: 无状态、跨域支持好、社区成熟
备选: Session + Cookie
放弃原因: 有状态，扩展性差

### 2. 数据库：PostgreSQL 14+
...
```

**`spec/tasks.md`** — 实施任务计划：
```markdown
# Tasks: 任务清单

## 环境准备
- [ ] 1. 初始化 Spring Boot 项目
- [ ] 2. 配置数据库连接
- [ ] 3. 配置 JWT 工具类

## 认证模块
- [ ] 4. 创建 User 实体和 Repository
- [ ] 5. 实现注册接口
- [ ] 6. 实现登录接口（返回 JWT）
- [ ] 7. 配置 Spring Security

## 任务模块
- [ ] 8. 创建 Task 实体和 Repository
- [ ] 9-14. 实现 CRUD + 状态变更接口

## 测试与完善
- [ ] 15-17. 单元测试 + 集成测试 + 代码审查
```

---

## Step 2: `/opsx:apply` — 代码实现

```
/opsx:apply
```

Claude 按 `spec/tasks.md` 逐项执行，严格遵循 proposal 阶段的澄清决策：

### 执行过程

```
执行 tasks 1-3：环境准备
变更: pom.xml, application.yml, JwtUtil.java
验证: mvn compile 成功

执行 tasks 4-7：认证模块
变更: User.java, UserRepository.java, AuthService.java, AuthController.java, SecurityConfig.java
验证: 注册/登录 API 测试通过

执行 tasks 8-14：任务模块
变更: Task.java, TaskRepository.java, TaskService.java, TaskController.java, DTO/*
验证: 所有 CRUD API + 状态流转验证通过

执行 tasks 15-17：测试
变更: TaskServiceTest.java, TaskControllerIntegrationTest.java
验证: mvn test 全部通过，行覆盖率 85%
```

每步完成后自动标记 `- [x]`，并将实施观察记录到 `spec/retrospective-notes.md`。

---

## Step 3: `/opsx:archive` — 归档复盘

```
/opsx:archive
```

### 复盘摘要

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
复盘摘要
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

完成：任务管理 API 全部功能
文件：17 个（实体 2，Repository 2，Service 2，Controller 2，DTO 6，配置 3）
测试：27 个用例，通过率 100%

亮点：
- 需求澄清避免了状态流转的返工
- 统一异常处理提升了代码一致性

改进点：
- 下次可提前约定 API 响应格式
- Repository 层可添加更多自定义查询

────────────────────────────────────────
```

### 知识库更新

**Layer A 立即更新**：
- **ADR 决策账本**：记录 JWT 认证方案选择
- **领域词汇表**：Task、Status、Priority 等术语
- **风险图谱**：TaskRepository 自定义查询需索引优化
- **效率指标**：本次开发数据

---

## 学到的技能

通过这个项目，你体验了完整的 **spec coding** 流程：

| 命令 | 做了什么 |
|------|----------|
| `/opsx:proposal` | 需求澄清 → 提案 → 技术澄清 → 设计 + 任务 |
| `/opsx:apply` | 按任务逐项实现，每步验证 |
| `/opsx:archive` | 复盘总结，知识库三层进化 |

---

## 对比传统开发

| 环节 | 传统开发 | spec coding (aspec) |
|------|----------|---------------------|
| **需求** | 口头描述，隐性假设 | 显式澄清，门禁阻断 |
| **设计** | 边做边想 | 先决策，后编码 |
| **编码** | 一次性大改 | 原子变更，持续验证 |
| **知识** | 丢失在代码中 | 沉淀到知识库 |
| **返工** | 频繁 | 大幅减少 |

---

## 下一步

- [深入理解 aspec](../architecture/aspec.md) — 设计理念与完整流程
- [探索理论基础](../theory/index.md)
- [查看 CLI 完整功能](../reference/cli.md)
- [阅读更多最佳实践](https://docs.anthropic.com/claude-code)

---

## 常见问题

**Q: 小改动也需要完整流程吗？**

不需要。aspec 的复杂度适配机制会自动调整：
- **轻量**：单文件改动 → 跳过部分阶段
- **标准**：多文件功能 → 完整流程
- **深度**：架构重构 → 分阶段状态外化

**Q: 如何跳过某个阶段？**

明确说明即可：
```
直接实现，跳过设计澄清阶段
```

**Q: 项目完成后如何查看知识库？**

```bash
ls openspec/
# evolution/  — ADR 技术决策、领域词汇表、风险图谱
# retrospectives/ — 复盘记录
```
