# 合并策略

ACE 如何处理现有配置文件

---

## 核心原则

> **ACE 从不破坏你的现有配置**

---

## 文件处理方式

| 文件 | 策略 | 说明 |
|------|------|------|
| **CLAUDE.md** | 智能合并 | 仅添加缺失的 `@` 引用 |
| **settings.json** | 深度合并 | 保留你的设置，添加 ACE 配置 |
| **MEMORY.md** | 跳过 | 如已存在则不修改 |
| **其他文件** | 跳过 | 除非使用 `--force` |

---

## CLAUDE.md 合并

### 策略

**追加而非覆盖**

```markdown
# 你的原有内容
...

# ACE 添加的内容
## Core
- @~/.claude/rules/ace/thinking.md
...
```

### 行为

1. 保留原有所有内容
2. 仅添加缺失的 `@` 引用
3. 避免重复引用

### 示例

```markdown
# 合并前 (你的文件)
# My Config
- @~/my-rules/custom.md

# 合并后
# My Config
- @~/my-rules/custom.md

## Core
- @~/.claude/rules/ace/thinking.md
...
```

---

## settings.json 合并

### 策略

**深度合并**

```javascript
// 你的原有配置
{
  "model": "claude-sonnet-4-6",
  "theme": "dark",
  "plugins": ["some-plugin"]
}

// ACE 配置
{
  "plugins": ["ace@ace-local"],
  "hookify": { "enabled": true }
}

// 合并结果
{
  "model": "claude-sonnet-4-6",      // 保留你的
  "theme": "dark",                   // 保留你的
  "plugins": ["some-plugin", "ace@ace-local"],  // 合并数组
  "hookify": { "enabled": true }     // 添加 ACE 的
}
```

### 冲突解决

| 场景 | 行为 |
|------|------|
| 键不存在 | 添加 ACE 的值 |
| 键存在，值相同 | 无操作 |
| 键存在，值不同 | 保留你的值 |
| 数组 | 合并去重 |
| 嵌套对象 | 递归合并 |

---

## 备份机制

### 两层备份

1. **Pre-install 快照** (`.pre-ace`)
   - 首次安装时创建
   - 用于 `ace uninstall` 完全恢复

2. **时间戳备份** (`.ace-backup.{timestamp}`)
   - 每次合并操作创建
   - 允许手动恢复到特定时间点

### 备份位置

```
~/.claude/
├── .pre-ace/              # 首次安装快照
│   ├── CLAUDE.md
│   └── settings.json
└── .ace-backup.20240115/  # 时间戳备份
    ├── CLAUDE.md
    └── settings.json
```

---

## Uninstall 恢复

### 恢复流程

```
ace uninstall
    ↓
检查 .pre-ace 存在？
    ├── 是 → 恢复完整快照
    └── 否 →  surgically 移除 ACE 内容
              - 移除 ace/ 规则引用
              - 移除 ace 插件
              - 保留其他内容
    ↓
清理备份文件
```

### 完全恢复示例

```bash
# 恢复到安装 ACE 前的状态
ace uninstall
# 恢复 .pre-ace 快照
```

### 部分清理示例

```bash
#  surgically 移除 ACE 内容
ace uninstall
# 仅移除 ACE 添加的内容
# 保留你的其他配置
```

---

## Force 模式

### 行为

使用 `--force` 会：

1. 创建 `.pre-ace` 快照（如不存在）
2. 覆盖现有文件
3. 仍然可 `uninstall` 恢复

### 使用场景

```bash
# 重新初始化，覆盖所有配置
ace init --force

# 切换角色，强制更新
ace init --role frontend --force
```

---

## 手动恢复

### 从时间戳备份恢复

```bash
# 1. 找到备份
ls -la ~/.claude/.ace-backup.*

# 2. 恢复特定文件
cp ~/.claude/.ace-backup.20240115/CLAUDE.md ~/.claude/CLAUDE.md

# 3. 或恢复全部
cp -r ~/.claude/.ace-backup.20240115/* ~/.claude/
```

### 从 pre-ace 恢复

```bash
cp -r ~/.claude/.pre-ace/* ~/.claude/
```

---

## 最佳实践

1. **首次安装前** — 手动备份重要配置
2. **使用 `--dry-run`** — 预览变更
3. **定期检查** — `ace doctor` 验证配置
4. **版本控制** — 将 `~/.claude/` 纳入 Git（排除敏感信息）

---

## 故障排除

### 配置冲突

```
ACE 配置与我的配置冲突
```

**解决**：
- 检查合并后的文件
- 手动调整冲突部分
- 或使用 `--force` 重新初始化

### 恢复失败

```
uninstall 后配置异常
```

**解决**：
```bash
# 从 pre-ace 恢复
cp -r ~/.claude/.pre-ace/* ~/.claude/ 2>/dev/null || echo "无快照"

# 或手动清理
rm -rf ~/.claude/rules/ace/
rm -rf ~/.claude/plugins/ace/
# 编辑 CLAUDE.md 移除 ace 引用
```
