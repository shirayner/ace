# 快速开始

> **5 分钟** 从零开始，搭建专业级 AI 开发环境

---

## 你将获得什么

完成本指南后，你将拥有一个：

✅ **配置完善的 Claude Code** — 8 条认知规则、4 个 AI Skills  ✅ **安全防护体系** — Hookify 守卫自动拦截危险操作  
✅ **角色定制配置** — 根据你的技术栈自动适配  
✅ **规范驱动工作流** — 可选的 OpenSpec 项目管理框架

---

## 前置要求

- **Node.js** ≥ 18.0.0
- **Claude Code** 已安装（`npm install -g @anthropic-ai/claude-code`）

验证环境：

```bash
node --version  # 应显示 v18.x.x 或更高
claude --version # 应显示已安装版本
```

---

## 第一步：安装 ACE

```bash
npm install -g @shirayner/ace
```

验证安装：

```bash
ace --version
# 输出: 0.1.0
```

---

## 第二步：初始化开发环境

运行初始化命令：

```bash
ace init
```

ACE 会引导你完成配置：

```
? 选择你的开发者角色: (使用方向键选择)
❯ Backend Developer    # Java/Kotlin 后端开发
  Frontend Developer   # TypeScript/JavaScript 前端开发  
  Client Developer     # Kotlin/Swift 客户端开发
  Fullstack Developer  # 全栈开发

? 选择安装预设: (使用方向键选择)
❯ full     # 完整功能（推荐）
  safe     # 安全优先（适合团队）
  minimal  # 最小安装
```

### 角色选择建议

| 角色 | 适合场景 | 获得特性 |
|------|---------|---------|
| **Backend** | Spring Boot、微服务、后端 API 开发 | Java 编译检查、后端最佳实践 |
| **Frontend** | React/Vue/Angular、Node.js 项目 | TypeScript 类型检查、前端规范 |
| **Client** | Android、iOS 原生应用开发 | Kotlin/Swift 相关检查 |
| **Fullstack** | 前后端都做的全栈开发者 | Java + TypeScript 双重支持 |

### 预设选择建议

| 预设 | 包含内容 | 适合场景 |
|------|---------|---------|
| **full** | 所有组件 + Hooks + Memory | 个人开发，追求完整体验 |
| **safe** | 核心组件 + Hookify + Memory | 团队协作，强调安全 |
| **minimal** | 仅核心规则和 Skills | 已有配置，只想增强 |

---

## 第三步：验证安装

运行健康检查：

```bash
ace doctor
```

期望输出：

```
✓ CLAUDE.md 配置正常
✓ 8 条规则文件完整
✓ 4 个 Skills 可正常加载
✓ Hookify 插件运行中
✓ 记忆目录可访问
All systems operational.
```

如有问题，运行 `ace list` 查看各组件状态。

---

## 第四步：开始开发（可选增强）

### 初始化规范驱动工作流

如果你想使用 OpenSpec 管理项目需求和设计：

```bash
# 进入你的项目目录
mkdir my-project && cd my-project

# 初始化 aspec 工作流
ace spec init
```

这会创建：

```
my-project/
├── openspec/
│   ├── config.yaml              # aspec 配置（流程/约束/协议/门禁）
│   ├── dimensions.md            # 澄清维度（需求 6 维 + 设计 7 维 + 盲区）
│   └── experience-template.md   # 项目经验库模板
```

---

## 快速体验

现在启动 Claude Code 测试你的新环境：

```bash
claude
```

尝试以下指令，感受 ACE 的增强：

```
# 测试 auto-goal skill
帮我实现一个用户登录功能

# 测试 coding skill  
审查这个文件 src/auth.js

# 测试规范驱动（如果初始化了 spec）
为这个功能创建需求文档
```

---

## 下一步

- 📖 [详细安装指南](installation.md) — 了解每个配置项
- 🎯 [第一个项目教程](first-project.md) — 完整项目实战
- 🏗️ [架构详解](../architecture/index.md) — 理解 ACE 如何工作
- 🧠 [理论基础](../theory/index.md) — 探索背后的科学原理

---

## 常见问题

### Q: ACE 会覆盖我现有的 Claude Code 配置吗？

**不会。** ACE 采用**非破坏性合并**策略：
- CLAUDE.md：仅添加缺失的 `@` 引用，保留现有内容
- settings.json：深度合并，保留你的个性化设置
- 其他文件：如已存在则跳过（除非使用 `--force`）

首次安装前会自动创建备份，随时可 `ace uninstall` 恢复。

### Q: 安装后可以更改角色吗？

可以。运行 `ace init --role <new-role> --force` 重新初始化。

### Q: 如何只更新某个组件？

ACE 目前不支持单独更新组件。如需更新，建议：
1. `ace uninstall` 卸载
2. 重新 `ace init` 安装

或者手动编辑 `~/.claude/` 下的相应文件。

### Q: 团队协作时需要注意什么？

建议：
- 统一使用 `safe` 预设
- 将 `.pre-ace` 备份加入 `.gitignore`
- 共享 `openspec/` 目录以同步需求规范

---

## 需要帮助？

- 📋 查看 [CLI 参考](../reference/cli.md)
- 🐛 在 GitHub 提交 Issue
- 💬 加入讨论区交流经验
