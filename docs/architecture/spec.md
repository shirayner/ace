# Spec 规范驱动开发

OpenSpec 集成的需求管理与设计决策追踪

---

## 什么是 Spec

Spec 是 ACE 集成的**规范驱动开发工作流**，基于 OpenSpec 框架：

```
需求澄清 → 需求文档 → 设计决策 → 代码实现
    ↑                                    ↓
    └────────── 可追溯 ←─────────────────┘
```

---

## 目录结构

```
openspec/
├── config.yaml              # OpenSpec 配置
├── taxonomy/                # 分类体系
│   ├── functional/          # 功能需求分类
│   ├── non-functional/      # 非功能需求分类
│   └── design/              # 设计模式分类
├── issues/                  # 问题跟踪
│   ├── requirements/        # 需求文档 (REQ-xxx)
│   └── designs/             # 设计文档 (DES-xxx)
├── procedures/              # 流程规范
│   ├── clarification-flow.md
│   └── review-checklist.md
└── evolution/               # 演进记录
    ├── adr/                 # 架构决策记录 (ADR-xxx)
    ├── glossary.md          # 术语表
    └── risk-map.md          # 风险地图
```

---

## 初始化

```bash
ace spec init [path]
```

选项：
- `--force` — 覆盖现有配置
- `--dry-run` — 预览不执行
- `--skip-openspec` — 跳过 openspec CLI 安装

---

## 核心组件

### 1. Taxonomy (分类体系)

定义需求、设计的分类标准。

**示例**：`taxonomy/functional/user-management.yaml`
```yaml
category: 用户管理
description: 用户注册、登录、权限管理
subcategories:
  - authentication: 认证
  - authorization: 授权
  - profile: 用户资料
```

### 2. Requirements (需求文档)

**格式**：`issues/requirements/REQ-{id}-{title}.md`

**示例**：
```markdown
# REQ-001: 用户登录

## 背景
用户需要通过用户名密码登录系统

## 需求描述
### 功能需求
- [ ] 支持用户名/密码登录
- [ ] 支持记住我功能
- [ ] 登录失败 5 次锁定账户

### 非功能需求
- [ ] 响应时间 < 200ms
- [ ] 密码必须加密存储

## 验收标准
1. 合法用户能成功登录
2. 非法用户被拒绝
3. 密码错误提示不暴露用户名是否存在

## 相关
- DES-001: 认证流程设计
- ADR-001: JWT 方案选择
```

### 3. Design (设计文档)

**格式**：`issues/designs/DES-{id}-{title}.md`

**示例**：
```markdown
# DES-001: 认证流程设计

## 方案概述
使用 JWT Token 实现无状态认证

## 流程图
```
登录请求 → 验证凭证 → 生成 Token → 返回客户端
   ↑                                        ↓
   └────── 后续请求携带 Token ──────────────┘
```

## 接口设计

### POST /api/auth/login
Request:
```json
{
  "username": "string",
  "password": "string"
}
```

Response:
```json
{
  "token": "jwt_token",
  "expiresIn": 3600
}
```

## 相关
- REQ-001: 用户登录
- ADR-001: JWT 方案选择
```

### 4. ADR (架构决策记录)

**格式**：`evolution/adr/ADR-{id}-{title}.md`

**示例**：
```markdown
# ADR-001: 使用 JWT 进行认证

## 状态
Accepted

## 上下文
需要选择一种认证机制

## 决策
使用 JWT (JSON Web Token)

## 后果

### 正面
- 无状态，易于水平扩展
- 跨域支持好
- 标准成熟

### 负面
- Token 无法提前失效
- 需要处理 Token 刷新

## 替代方案
- Session + Cookie: 有状态，扩展性差
- OAuth2: 过重，不适合内部系统
```

### 5. Glossary (术语表)

**文件**：`evolution/glossary.md`

**示例**：
```markdown
# 术语表

## 业务术语
- **用户 (User)**: 系统的注册成员
- **角色 (Role)**: 用户的权限分组

## 技术术语
- **JWT**: JSON Web Token
- **Refresh Token**: 用于获取新 Access Token 的凭证
```

---

## 工作流程

### 1. 需求澄清

```
用户提出需求
    ↓
Claude 使用 clarification-flow
    ↓
创建 REQ-xxx 文档
```

### 2. 设计决策

```
基于 REQ-xxx
    ↓
创建 DES-xxx 设计文档
    ↓
如有重大决策，创建 ADR-xxx
```

### 3. 代码实现

```
基于 DES-xxx
    ↓
代码实现
    ↓
在提交信息中引用 REQ/DES/ADR
```

### 4. 变更管理

```
需求变更
    ↓
更新 REQ-xxx
    ↓
评估影响的设计和代码
    ↓
相应更新 DES/代码
```

---

## 可追溯性

```
REQ-001 (需求)
    ↓
DES-001 (设计) ←→ ADR-001 (决策理由)
    ↓
代码实现 (Git 提交引用 REQ-001)
```

查询示例：
```bash
# 查看需求相关的所有设计
grep -r "REQ-001" openspec/issues/designs/

# 查看决策影响的需求
grep -r "ADR-001" openspec/issues/requirements/
```

---

## 集成 with ACE

### 自动引用

ACE 的 `reporting` 规则会自动将分析结果写入相应目录：

```
需求分析 → openspec/issues/requirements/
架构设计 → openspec/issues/designs/
决策分析 → openspec/evolution/adr/
```

### 使用示例

```
用户：帮我设计用户认证模块

Claude：
1. 基于 openspec/taxonomy/ 了解需求分类
2. 创建 openspec/issues/requirements/REQ-xxx.md
3. 创建 openspec/issues/designs/DES-xxx.md
4. 如有需要，创建 ADR-xxx
```

---

## 最佳实践

1. **每个需求必须有 REQ 文档** — 口头需求转化为书面
2. **重大决策必须有 ADR** — 记录决策理由
3. **保持可追溯** — 文档间相互引用
4. **定期回顾** — 更新过时的文档
5. **版本控制** — openspec/ 目录纳入 Git

---

## 故障排除

### 规范冲突

```
多个项目使用不同规范
```

**解决**：在项目级 openspec/config.yaml 中定义项目特定规则

### 文档过时

```
代码已改，文档未更新
```

**解决**：在代码审查中检查文档同步，或定期执行 `ace spec audit`
