# Hookify 安全体系

ACE 的三层安全防护：危险操作拦截、敏感文件保护、验证要求

---

## 安全架构

```
┌─────────────────────────────────────────┐
│           第一层：命令拦截                │
│    Hookify 守卫 — 拦截危险命令            │
├─────────────────────────────────────────┤
│           第二层：文件保护                │
│    敏感文件编辑警告                       │
├─────────────────────────────────────────┤
│           第三层：验证要求                │
│    提交前强制检查                         │
└─────────────────────────────────────────┘
```

---

## 第一层：block-dangerous-ops

### 拦截的命令

| 命令模式 | 风险 | 处理方式 |
|---------|------|---------|
| `rm -rf /` | 系统删除 | 完全拦截 |
| `git push --force` | 覆盖远程历史 | 要求确认 |
| `DROP TABLE` | 数据库删除 | 要求确认 |
| `DELETE FROM` (无 WHERE) | 误删数据 | 警告 |
| `>` 重定向到系统文件 | 覆盖系统文件 | 警告 |

### 实现机制

```javascript
// 正则匹配 + 语义分析
const dangerousPatterns = [
  /rm\s+-rf\s+\/($|\s)/,
  /git\s+push\s+--force/,
  /DROP\s+TABLE/i,
  // ...
];

function checkCommand(command) {
  for (const pattern of dangerousPatterns) {
    if (pattern.test(command)) {
      return { dangerous: true, pattern };
    }
  }
  return { dangerous: false };
}
```

### 用户交互

```
检测到危险命令: git push --force

⚠️  这将覆盖远程分支历史，可能导致数据丢失。

确认执行? [y/N] 
```

---

## 第二层：protect-secrets

### 保护的文件模式

| 模式 | 说明 | 处理方式 |
|------|------|---------|
| `*.env` | 环境变量文件 | 编辑前警告 |
| `*secret*` | 密钥文件 | 编辑前警告 |
| `*private-key*` | 私钥文件 | 编辑前警告 |
| `.aws/credentials` | AWS 凭证 | 编辑前警告 |
| `.ssh/id_*` | SSH 密钥 | 编辑前警告 |

### 敏感内容检测

```javascript
const sensitivePatterns = [
  /password\s*=\s*['"][^'"]+['"]/i,
  /api[_-]?key\s*=\s*['"][^'"]+['"]/i,
  /secret\s*=\s*['"][^'"]+['"]/i,
  /BEGIN\s+(RSA|OPENSSH|PGP)\s+PRIVATE\s+KEY/,
];
```

### 用户交互

```
⚠️  你正在编辑敏感文件: .env

此文件可能包含密钥、密码或其他敏感信息。
建议:
1. 确保不提交到版本控制
2. 检查文件权限
3. 使用环境变量或密钥管理服务

确认继续编辑? [y/N]
```

---

## 第三层：require-verification

### 提交前检查

| 检查项 | 说明 | 失败处理 |
|--------|------|---------|
| 编译检查 | 代码是否能编译 | 阻止提交 |
| 测试检查 | 测试是否通过 | 警告或阻止 |
| Lint 检查 | 代码风格是否符合规范 | 警告 |

### Git 钩子集成

```bash
# pre-commit hook
#!/bin/bash

echo "Running pre-commit checks..."

# 编译检查
if ! mvn compile -q; then
  echo "❌ 编译失败，请修复后再提交"
  exit 1
fi

# 测试检查
if ! mvn test -q; then
  echo "⚠️  测试失败，确认要继续提交? [y/N]"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "✓ 检查通过"
exit 0
```

---

## 分级确认策略

| 风险级别 | 示例 | 处理方式 |
|---------|------|---------|
| **低风险** | 读取文件、编译代码 | 直接执行 |
| **中风险** | 修改配置文件 | 执行后简报 |
| **高风险** | 删除文件、修改接口 | 执行前确认 |
| **不可逆** | 强制推送、删除数据库 | 多重确认 |

---

## 配置

### 配置文件

```yaml
# ~/.hookify/config.yaml
version: 1.0

guards:
  block-dangerous-ops:
    enabled: true
    blocked_commands:
      - pattern: "rm -rf /"
        action: block
        message: "这将删除整个文件系统"
      - pattern: "git push --force"
        action: confirm
        message: "这将覆盖远程历史"
      
  protect-secrets:
    enabled: true
    protected_patterns:
      - "*.env"
      - "*secret*"
      - ".ssh/id_*"
    sensitive_content_patterns:
      - "(?i)password\\s*=\\s*['\"][^'\"]+['\"]"
      
  require-verification:
    enabled: true
    pre_commit_checks:
      - name: compile
        command: "mvn compile -q"
        required: true
      - name: test
        command: "mvn test -q"
        required: false
```

### 自定义规则

```bash
# 添加自定义危险命令
echo '
- pattern: "custom-dangerous-command"
  action: confirm
  message: "这是一条危险命令"
' >> ~/.hookify/custom-rules.yaml
```

---

## 绕过与禁用

### 临时绕过

```bash
# 使用 --no-verify 跳过 git 钩子
git commit --no-verify

# 使用 --force 强制执行
ace command --force
```

### 禁用特定守卫

```yaml
# ~/.hookify/config.yaml
guards:
  block-dangerous-ops:
    enabled: false  # 禁用此守卫
```

> ⚠️ 不建议禁用安全守卫，除非你完全理解风险。

---

## 最佳实践

1. **不要禁用守卫** — 绕过应该是例外，非常态
2. **团队统一配置** — 共享 `.hookify/config.yaml`
3. **定期审查日志** — 了解触发情况
4. **教育优先** — 让团队理解为什么有这些限制

---

## 故障排除

### 守卫误触发

```
正常命令被拦截
```

**解决**：
- 检查命令是否确实有风险
- 添加到白名单：`~/.hookify/whitelist.yaml`
- 临时使用 `--force`

### 钩子未运行

```
git commit 时没有执行检查
```

**解决**：
```bash
# 检查钩子是否安装
ls -la .git/hooks/pre-commit

# 重新安装钩子
ace hookify install
```
