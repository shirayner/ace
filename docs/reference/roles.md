# 角色说明

ACE 支持的开发者角色及其配置

---

## 可用角色

| 角色 | 标签 | 主要语言 | 条件 Hooks |
|------|------|---------|-----------|
| `backend` | Backend Developer | Java/Kotlin | Java 编译检查 |
| `frontend` | Frontend Developer | TypeScript | TypeScript 类型检查 |
| `client` | Client Developer | Kotlin/Swift | Kotlin 编译检查 |
| `fullstack` | Fullstack Developer | TypeScript + Java | Java + TypeScript 检查 |

---

## Backend Developer

### 技术栈

- **主要语言**: Java, Kotlin
- **框架**: Spring Boot, Spring Cloud
- **构建工具**: Maven, Gradle
- **基础设施**: Docker, Kubernetes

### 安装内容

1. **Hooks**: `ace.java-compile-check.sh`
2. **Memory**: Java 后端开发者画像

### 开发者画像示例

```markdown
---
name: Backend Developer
type: user
---

- 主要语言：Java/Kotlin
- 框架：Spring Boot, Spring Cloud
- 关注领域：微服务、性能优化、API 设计、数据一致性
- 常用工具：Maven/Gradle, Docker, Kubernetes, PostgreSQL
- 代码偏好：显式优于隐式，强调可读性
- 架构偏好：分层架构，领域驱动设计
```

---

## Frontend Developer

### 技术栈

- **主要语言**: TypeScript, JavaScript
- **框架**: React, Vue, Angular
- **构建工具**: Vite, Webpack, Rollup
- **样式**: CSS-in-JS, Tailwind, Sass

### 安装内容

1. **Hooks**: `ace.ts-type-check.sh`
2. **Memory**: 前端开发者画像

### 开发者画像示例

```markdown
---
name: Frontend Developer
type: user
---

- 主要语言：TypeScript/JavaScript
- 框架：React/Vue/Angular
- 关注领域：用户体验、组件设计、性能优化、可访问性
- 常用工具：npm/yarn, Vite/Webpack, ESLint, Prettier
- 代码偏好：函数式编程，组件化，类型安全
- 设计偏好：响应式设计，移动端优先
```

---

## Client Developer

### 技术栈

- **Android**: Kotlin, Java
- **iOS**: Swift, Objective-C
- **框架**: Android SDK, SwiftUI/UIKit
- **工具**: Android Studio, Xcode

### 安装内容

1. **Hooks**: `ace.kt-compile-check.sh`
2. **Memory**: 客户端开发者画像

### 开发者画像示例

```markdown
---
name: Client Developer
type: user
---

- 主要语言：Kotlin/Swift
- 平台：Android/iOS
- 关注领域：原生性能、用户体验、平台特性
- 常用工具：Android Studio, Xcode, Gradle
- 代码偏好：平台最佳实践，原生 API 优先
- 架构偏好：MVVM, MVI
```

---

## Fullstack Developer

### 技术栈

- **后端**: Java/Kotlin + Spring Boot
- **前端**: TypeScript + React/Vue
- **数据库**: PostgreSQL, MongoDB
- **DevOps**: Docker, CI/CD

### 安装内容

1. **Hooks**: `ace.java-compile-check.sh` + `ace.ts-type-check.sh`
2. **Memory**: 全栈开发者画像

### 开发者画像示例

```markdown
---
name: Fullstack Developer
type: user
---

- 后端语言：Java/Kotlin
- 前端语言：TypeScript
- 框架：Spring Boot + React/Vue
- 关注领域：端到端交付、系统架构、DevOps
- 常用工具：Maven/Gradle, npm, Docker, Kubernetes
- 代码偏好：全栈思维，端到端类型安全
- 架构偏好：微前端 + 微服务
```

---

## 角色选择指南

### 如何选择

| 你的工作重点 | 推荐角色 |
|-------------|---------|
| 主要写后端 API | `backend` |
| 主要写前端界面 | `frontend` |
| 写 Android/iOS 应用 | `client` |
| 前后端都做 | `fullstack` |

### 切换角色

```bash
# 切换到新角色
ace init --role frontend --force
```

这会：
1. 更新开发者画像
2. 更新 Hooks 配置
3. 保留其他 ACE 配置

---

## 自定义角色

### 创建自定义画像

```bash
# 1. 复制模板
cp templates/memory/roles/backend.md \
   ~/.claude/memory/user_profile.md

# 2. 编辑自定义内容
vim ~/.claude/memory/user_profile.md
```

### 创建自定义 Hooks

```bash
# 创建自定义编译检查
cat > ~/.hookify/hooks/ace.python-check.sh << 'EOF'
#!/bin/bash
# Python 类型检查

if [ -f "requirements.txt" ]; then
    mypy .
fi
EOF

chmod +x ~/.hookify/hooks/ace.python-check.sh
```

---

## 角色对比

| 特性 | Backend | Frontend | Client | Fullstack |
|------|---------|----------|--------|-----------|
| Java 编译检查 | ✅ | ❌ | ❌ | ✅ |
| TypeScript 检查 | ❌ | ✅ | ❌ | ✅ |
| Kotlin 检查 | ❌ | ❌ | ✅ | ❌ |
| 后端最佳实践 | ✅ | ❌ | ❌ | ✅ |
| 前端最佳实践 | ❌ | ✅ | ❌ | ✅ |
| 移动端最佳实践 | ❌ | ❌ | ✅ | ❌ |

---

## 故障排除

### 角色未生效

```bash
# 检查画像文件
cat ~/.claude/memory/user_profile.md

# 检查角色类型
grep "^name:" ~/.claude/memory/user_profile.md
```

### 钩子未触发

```bash
# 检查钩子是否存在
ls ~/.hookify/hooks/

# 检查执行权限
chmod +x ~/.hookify/hooks/*.sh
```
