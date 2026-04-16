# 第一个项目

通过构建一个实际的 Web API，体验 ACE 的完整工作流程

---

## 项目目标

构建一个**任务管理 API**，功能包括：
- 创建、读取、更新、删除任务
- 任务状态管理（待办/进行中/已完成）
- 简单的用户认证

技术栈：Spring Boot + PostgreSQL

---

## 第一步：初始化项目

### 1.1 创建项目目录

```bash
mkdir task-api
cd task-api
```

### 1.2 初始化规范驱动工作流

```bash
ace spec init .
```

这会创建 `openspec/` 目录，用于管理需求和设计。

### 1.3 启动 Claude Code

```bash
claude
```

---

## 第二步：需求分析

使用 ACE 的规范驱动流程，先定义需求再开发。

### 2.1 创建需求文档

在 Claude Code 中输入：

```
帮我为任务管理 API 创建需求文档，包括：
1. 功能需求：CRUD 操作、状态流转
2. 非功能需求：性能、安全
3. API 端点设计

使用 openspec 目录结构。
```

ACE 的 `reporting` 规则会自动将分析结果写入 `openspec/issues/requirements/`。

### 2.2 查看生成的需求

```bash
ls openspec/issues/requirements/
```

你会看到结构化的需求文档：
```
requirements/
├── functional/
│   ├── task-crud.md
│   └── task-status.md
├── non-functional/
│   ├── performance.md
│   └── security.md
└── api-design.md
```

---

## 第三步：架构设计

### 3.1 让 Claude 设计架构

```
基于刚才的需求，帮我设计系统架构：
1. 实体关系图
2. 分层架构
3. 主要组件职责

输出到 openspec/issues/designs/
```

### 3.2 创建架构决策记录

```
为以下决策创建 ADR：
1. 为什么使用 Spring Boot
2. 数据库选择 PostgreSQL 的理由
3. 认证方案选择 JWT

输出到 openspec/evolution/adr/
```

---

## 第四步：初始化代码项目

### 4.1 生成 Spring Boot 项目

```bash
# 使用 Spring Initializr
curl https://start.spring.io/starter.zip \
  -d dependencies=web,data-jpa,postgresql,security,lombok \
  -d type=maven-project \
  -o starter.zip
unzip starter.zip
```

### 4.2 让 Claude 理解项目

在 Claude Code 中：

```
请阅读项目结构，理解：
1. 当前目录结构
2. 已有的依赖和配置
3. 需要添加的组件
```

ACE 的 `coding` skill 会自动识别这是**实现意图**，并加载实现指南。

---

## 第五步：开发核心功能

### 5.1 实体设计

```
根据需求和架构设计，创建 Task 实体类：
- 基本字段：id, title, description, status, createdAt, updatedAt
- 使用 JPA 注解
- 放在 entity 包下

请使用 Plan Mode，让我确认方案后再执行。
```

**预期行为**：
1. Claude 进入 Plan Mode
2. 展示实体设计方案
3. 你确认后执行
4. 自动编译检查（Backend 角色的 Hook）

### 5.2 Repository 层

```
为 Task 实体创建 Repository：
- 继承 JpaRepository
- 添加自定义查询：按状态查找、按创建时间排序
```

### 5.3 Service 层

```
创建 TaskService：
- CRUD 操作
- 业务逻辑验证
- 异常处理

遵循 Clean Code 原则，保持方法单一职责。
```

### 5.4 Controller 层

```
创建 TaskController：
- RESTful API 端点
- 请求/响应 DTO
- 统一异常处理
```

---

## 第六步：测试与验证

### 6.1 生成单元测试

```
为 TaskService 生成单元测试：
- 使用 JUnit 5 和 Mockito
- 覆盖正常和异常场景
- 目标覆盖率：行 80%，分支 70%
```

ACE 的 `coding` skill 会加载测试指南，生成高质量测试代码。

### 6.2 运行测试

```bash
./mvnw test
```

### 6.3 代码审查

```
审查 TaskController 和 TaskService：
- 代码质量
- 潜在问题
- 改进建议

输出审查报告。
```

ACE 会生成结构化的审查报告，分级显示问题。

---

## 第七步：观察 ACE 的工作

在开发过程中，注意 ACE 如何增强 Claude Code：

### 7.1 深度思考规则

当遇到复杂设计决策时，Claude 会：
- **序** — 先理解需求再设计
- **验** — 每个方案都有验证标准
- **深** — 追问根因，不只是表面
- **广** — 考虑系统影响
- **辨** — 区分事实和假设
- **简** — 追求简洁方案

### 7.2 Clean Code 原则

代码生成时会自动遵循：
- 意图清晰的命名
- 单一职责的方法
- 最小化 Surprise
- DRY 原则
- 显性错误处理

### 7.3 安全防护

尝试执行危险操作：

```bash
rm -rf /
```

Hookify 会拦截并警告。

---

## 第八步：迭代优化

### 8.1 添加分页功能

```
为任务列表 API 添加分页支持：
- 使用 Spring Data 分页
- 支持按字段排序
- 返回分页元数据
```

### 8.2 添加搜索功能

```
添加任务搜索功能：
- 按标题模糊搜索
- 按状态过滤
- 按日期范围过滤
```

### 8.3 完善认证

```
完善 JWT 认证：
- 登录/注册端点
- Token 刷新机制
- 受保护的路由
```

---

## 第九步：项目收尾

### 9.1 生成 API 文档

```
为所有 API 端点生成文档：
- 使用 OpenAPI/Swagger 注解
- 包含请求/响应示例
- 错误码说明
```

### 9.2 回顾与复盘

使用 ACE 的 retrospective 模板：

```
帮我完成项目复盘：
1. 做得好的地方
2. 遇到的问题
3. 改进建议
4. 学到的经验

使用 openspec/retrospective-template.md 格式。
```

---

## 学到的技能

通过这个项目，你体验了：

✅ **规范驱动开发** — 先定义需求再编码  
✅ **分层架构** — Controller/Service/Repository  
✅ **ACE Skills** — auto-goal、coding、reporting  
✅ **代码质量保证** — 测试、审查、Clean Code  
✅ **安全防护** — Hookify 危险操作拦截

---

## 下一步

- 🏗️ [深入理解 ACE 架构](../architecture/index.md)
- 🧠 [探索理论基础](../theory/index.md)
- 🛠️ [查看 CLI 完整功能](../reference/cli.md)
- 📚 [阅读更多最佳实践](https://docs.anthropic.com/claude-code)

---

## 常见问题

**Q: 如果我不想要 Plan Mode？**

可以在请求中明确：
```
直接实现，不用 Plan Mode
```

**Q: 如何跳过测试生成？**

```
实现功能，暂时不用生成测试
```

**Q: 项目完成后如何清理 ACE 配置？**

```bash
# 仅清理当前项目的 spec
rm -rf openspec/

# 或完整卸载 ACE
ace uninstall
```
