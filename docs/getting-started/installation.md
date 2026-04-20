# 安装指南

详细安装步骤、配置选项与故障排除

---

## 系统要求

### 必须
- **Node.js** ≥ 18.0.0
- **Claude Code** CLI（`@anthropic-ai/claude-code`）
- **操作系统**：Windows 10+ / macOS 12+ / Linux（Ubuntu 20.04+ 推荐）

### 推荐
- **Git** ≥ 2.30（用于 Hookify 的 Git 钩子功能）
- **Python** ≥ 3.8（用于 Skill-Creator 的评估脚本）

---

## 安装方式

### 方式一：npm 全局安装（推荐）

```bash
npm install -g @shirayner/ace
```

验证：
```bash
ace --version
```

### 方式二：npx 临时使用

不想全局安装？使用 npx：

```bash
npx @shirayner/ace init
```

### 方式三：源码安装

```bash
git clone https://github.com/shirayner/ace.git
cd ace
npm install
npm link  # 创建全局链接
```

---

## 初始化配置

### 交互式初始化

```bash
ace init
```

ACE 采用**零配置**设计，首次安装无需回答任何问题。系统会自动：
- 安装所有组件（Core、Rules、Plugin、Hooks、Hookify、Memory）
- 使用 `fullstack` 作为默认角色（安装后可编辑修改）

### 命令行参数

```bash
# 强制覆盖现有配置（会创建备份）
ace init --force

# 预览将要执行的操作，不实际修改
ace init --dry-run
```

### 完整参数列表

| 参数 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--force` | `-f` | 覆盖现有文件 | `false` |
| `--dry-run` | - | 预览模式 | `false` |

---

## 安装位置

ACE 在以下位置安装文件：

```
~/.claude/                    # Claude Code 配置根目录
├── CLAUDE.md                 # 全局配置索引（智能合并）
├── settings.json             # 基础设置（深度合并）
├── rules/
│   └── ace/                  # 8 条规则目录
│       ├── thinking.md
│       ├── clean-code.md
│       ├── code-quality.md
│       ├── reporting.md
│       ├── task-recovery.md
│       ├── context-hygiene.md
│       ├── memory-policy.md
│       └── interactive-clarify.md
├── memory/
│   ├── MEMORY.md             # 记忆索引模板
│   └── user_profile.md       # 开发者画像（按角色生成）
└── plugins/
    └── ace/                  # ACE 插件目录
        └── skills/           # 4 个 Skills
            ├── auto-goal/
            ├── coding/
            ├── skill-creator/
            └── skill-optimize/

~/.claude/                    # Hookify 规则配置（通过 hookify 插件启用）
├── hookify.ace.block-dangerous-ops.local.md
├── hookify.ace.protect-secrets.local.md
├── hookify.ace.safe-git-commands.local.md
├── hookify.ace.code-quality-gate.local.md
├── hookify.ace.require-verification.local.md
├── hookify.ace.dangerous-commands.local.md
└── hookify.ace.sensitive-data.local.md

你的项目目录/               # 执行 ace spec init 的项目
└── openspec/               # 规范驱动工作流文件
```

---

## 验证安装

### 基础检查

```bash
ace doctor
```

输出示例：
```
Checking ACE installation...

✓ CLAUDE.md
  - File exists: ~/.claude/CLAUDE.md
  - ace references: 8/8 present

✓ Rules
  - thinking.md: present
  - clean-code.md: present
  - code-quality.md: present
  - reporting.md: present
  - task-recovery.md: present
  - context-hygiene.md: present
  - memory-policy.md: present
  - interactive-clarify.md: present

✓ Skills
  - ace:auto-goal: loadable
  - ace:coding: loadable
  - ace:skill-creator: loadable
  - ace:skill-optimize: loadable

✓ Hookify
  - Plugin enabled in settings
  - Guards configured: 5/5

✓ Memory
  - Directory exists: ~/.claude/memory
  - Templates present

All systems operational ✓
```

### 查看组件状态

```bash
ace list
```

输出示例：
```
Component          Status     Path
────────────────────────────────────────────────
core               installed  ~/.claude/CLAUDE.md
rules              installed  ~/.claude/rules/ace/
plugin             installed  ~/.claude/plugins/ace/
hookify            installed  ~/.hookify/
hooks              installed  ~/.hookify/hooks/
memory             installed  ~/.claude/memory/
spec (project)     not init   ./openspec/
```

---

## 配置详解

### CLAUDE.md 结构

ACE 安装的 `CLAUDE.md` 是一个**配置索引**：

```markdown
# 全局配置索引

## 核心原则
- @~/.claude/rules/ace/thinking.md - 深度思考原则

## 代码规范
- @~/.claude/rules/ace/clean-code.md - Clean Code
- @~/.claude/rules/ace/code-quality.md - 代码质量标准

## 工作流规则
- @~/.claude/rules/ace/reporting.md - 报告输出规则
...
```

`@` 引用语法告诉 Claude Code 自动加载这些规则文件。

### settings.json 配置

ACE 自动配置 `settings.json`，包含权限管理和 Hookify 插件集成：

```json
{
  "permissions": {
    "allow": [
      "Bash(git:*)",
      "Bash(ls*)",
      "Bash(cat*)",
      "Bash(npm*)",
      "Bash(node*)",
      "Read", "Glob", "Grep"
    ],
    "deny": [
      "Bash(rm -rf*)",
      "Bash(sudo*)",
      "Write(*.env)"
    ]
  },
  "enabledPlugins": {
    "hookify@claude-plugins-official": true,
    "ace@ace-local": true
  },
  "hooks": {}
}
```

> **注意**：ACE 使用 **Hookify 插件**（而非原生 hooks）实现安全守卫。规则文件位于 `~/.claude/hookify.ace.*.local.md`，由 hookify 插件自动加载。

**权限配置说明**：

| 类别 | 配置项 | 说明 |
|------|--------|------|
| **允许** | `Bash(git:*)` | 所有 git 命令直接执行 |
| **允许** | `Bash(ls*)` | 基础文件命令 |
| **允许** | `Read`, `Glob`, `Grep` | 内置工具 |
| **禁止** | `Bash(rm -rf*)` | 危险删除命令 |
| **禁止** | `Bash(sudo*)` | 提权命令 |
| **禁止** | `Write(*.env)` | 写入敏感文件 |

### settings.json 合并

ACE 使用**深度合并**策略：

```json
// 你的原有配置
{
  "model": "claude-sonnet-4-6",
  "theme": "dark"
}

// ACE 添加的配置
{
  "permissions": { "allow": [...], "deny": [...] },
  "enabledPlugins": { "hookify@claude-plugins-official": true }
}

// 合并结果
{
  "model": "claude-sonnet-4-6",  // 保留你的设置
  "theme": "dark",               // 保留你的设置
  "permissions": { ... },         // ACE 添加
  "enabledPlugins": { ... }       // ACE 添加
}
```

### 角色配置

不同角色安装的开发者画像示例：

**Backend (`~/.claude/memory/user_profile.md`)**：
```markdown
---
name: Backend Developer
type: user
---

- 主要语言：Java/Kotlin
- 框架：Spring Boot, Spring Cloud
- 关注领域：微服务、性能优化、API 设计
- 常用工具：Maven/Gradle, Docker, Kubernetes
```

**Frontend**：
```markdown
---
name: Frontend Developer
type: user
---

- 主要语言：TypeScript/JavaScript
- 框架：React/Vue/Angular
- 关注领域：用户体验、性能优化、组件设计
- 常用工具：npm/yarn, Vite/Webpack
```

---

## 故障排除

### 问题：命令未找到

```bash
ace: command not found
```

**解决**：
```bash
# 检查 npm 全局路径
npm config get prefix

# 确保该路径在 PATH 中
export PATH="$PATH:$(npm config get prefix)/bin"

# 或使用 npx
npx @shirayner/ace
```

### 问题：权限错误

```bash
EACCES: permission denied
```

**解决**：
```bash
# 方案 1：修改 npm 全局目录权限
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# 方案 2：使用 npx（无需全局安装）
npx @shirayner/ace init
```

### 问题：Claude Code 未检测到配置

**检查清单**：
1. `~/.claude/CLAUDE.md` 是否存在？
2. 文件内容是否包含 `@~/.claude/rules/ace/` 引用？
3. Claude Code 是否在 `~` 目录启动？（CLAUDE.md 只在启动目录或 `~/.claude/` 加载）

**解决**：
```bash
# 检查 CLAUDE.md
ls -la ~/.claude/CLAUDE.md

# 从主目录启动 Claude Code
cd ~
claude
```

### 问题：Skills 未触发

**诊断步骤**：
1. 检查 settings.json 是否包含 ACE 插件：
   ```bash
   cat ~/.claude/settings.json | grep ace
   ```

2. 验证 Skill 文件存在：
   ```bash
   ls ~/.claude/plugins/ace/skills/
   ```

3. 重启 Claude Code 以加载新配置

---

## 更新与卸载

### 更新 ACE

```bash
# 更新到最新版本
npm update -g @shirayner/ace

# 重新初始化（保留记忆，更新组件）
ace init --force
```

### 卸载 ACE

```bash
ace uninstall
```

这会：
1. 恢复 `.pre-ace` 备份（如果存在）
2. 或从配置中移除 ACE 相关内容
3. 删除 ACE 安装的文件
4. 清理备份文件

**完全移除（包括备份）**：
```bash
ace uninstall --yes
rm -rf ~/.claude/.pre-ace
```

---

## 高级配置

### 自定义规则路径

编辑 `~/.claude/CLAUDE.md`，添加你自己的规则：

```markdown
# 我的自定义规则
- @~/my-rules/security.md - 安全规范
- @~/my-rules/team-style.md - 团队风格
```

### 扩展 Skills

在 `~/.claude/skills/` 目录添加自定义 Skills，ACE 不会触碰此目录。

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ACE_PRESET` | 默认预设 | `full` |
| `ACE_ROLE` | 默认角色 | - |
| `ACE_DEBUG` | 调试模式 | `false` |

---

## 相关文档

- [第一个项目](first-project.md) — 实战入门
- [CLI 参考](../reference/cli.md) — 完整命令手册
- [合并策略](../reference/merge-strategy.md) — 配置合并详情
