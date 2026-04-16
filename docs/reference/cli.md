# CLI 完整参考

ACE 命令行工具完整手册

---

## 命令概览

| 命令 | 用途 |
|------|------|
| `ace init` | 初始化 ACE 环境 |
| `ace doctor` | 健康检查 |
| `ace list` | 查看组件状态 |
| `ace uninstall` | 卸载 ACE |
| `ace spec init` | 初始化规范驱动工作流 |
| `ace spec doctor` | 检查规范工作流健康 |
| `ace spec update` | 更新规范模板 |

---

## ace init

初始化你的 Claude Code 开发环境。

```bash
ace init [options]
```

### 选项

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--preset` | `-p` | 安装预设: `full`/`safe`/`minimal` | `full` |
| `--role` | `-r` | 开发者角色 | 交互式 |
| `--force` | `-f` | 覆盖现有文件 | `false` |
| `--dry-run` | - | 预览模式 | `false` |
| `--no-interaction` | - | 跳过提示 | `false` |

### 示例

```bash
# 交互式初始化
ace init

# 指定角色和预设
ace init --role backend --preset full

# 强制覆盖（会创建备份）
ace init --force

# 预览将要执行的操作
ace init --dry-run

# 无交互模式
ace init --role frontend --preset safe --no-interaction
```

---

## ace doctor

验证安装完整性。

```bash
ace doctor
```

### 检查项

- CLAUDE.md 配置
- 8 条规则文件
- 4 个 Skills 可加载性
- Hookify 插件状态
- 记忆目录可访问性

### 输出示例

```
✓ CLAUDE.md 配置正常
✓ 8 条规则文件完整
✓ 4 个 Skills 可正常加载
✓ Hookify 插件运行中
✓ 记忆目录可访问
All systems operational.
```

---

## ace list

显示各组件安装状态。

```bash
ace list
```

### 输出示例

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

状态说明：
- `installed` — 已安装
- `partial` — 部分安装
- `missing` — 未安装

---

## ace uninstall

移除所有 ACE 管理的文件。

```bash
ace uninstall [options]
```

### 选项

| 选项 | 简写 | 说明 | 默认值 |
|------|------|------|--------|
| `--yes` | `-y` | 跳过确认 | `false` |

### 恢复机制

1. 如果存在 `.pre-ace` 快照 → 恢复它
2. 如果没有 →  surgically 移除 ACE 内容
3. 清理备份文件

### 示例

```bash
# 交互式卸载
ace uninstall

# 强制卸载
ace uninstall --yes
```

---

## ace spec init

初始化规范驱动开发工作流。

```bash
ace spec init [path] [options]
```

### 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `path` | 项目路径 | `.` |

### 选项

| 选项 | 说明 | 默认值 |
|------|------|--------|
| `--force` | 覆盖现有配置 | `false` |
| `--dry-run` | 预览 | `false` |
| `--skip-openspec` | 跳过 openspec CLI 安装 | `false` |

### 示例

```bash
# 在当前目录初始化
ace spec init

# 在指定路径初始化
ace spec init ./my-project

# 强制覆盖
ace spec init --force
```

---

## ace spec doctor

检查规范工作流健康。

```bash
ace spec doctor [path]
```

### 检查项

- OpenSpec 配置完整性
- 目录结构正确性
- 必需文件存在性

---

## ace spec update

更新规范模板到最新版本。

```bash
ace spec update [path]
```

### 行为

- 更新模板文件
- 保留现有需求/设计文档
- 创建备份

---

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ACE_PRESET` | 默认预设 | `full` |
| `ACE_ROLE` | 默认角色 | - |
| `ACE_DEBUG` | 调试模式 | `false` |

### 示例

```bash
export ACE_PRESET=safe
export ACE_ROLE=backend
ace init --no-interaction  # 使用环境变量
```

---

## 退出码

| 码 | 含义 |
|---|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 2 | 配置错误 |
| 3 | 网络错误 |
| 4 | 权限错误 |

---

## 故障排除

### 命令未找到

```bash
# 检查安装
npm list -g @shirayner/ace

# 检查 PATH
echo $PATH | grep npm
```

### 权限错误

```bash
# 方案 1：修改 npm 全局目录权限
sudo chown -R $(whoami) $(npm config get prefix)

# 方案 2：使用 npx
npx @shirayner/ace init
```
