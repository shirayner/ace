---
name: protect-secrets
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.env$|\.env\.|credentials|\.key$|secrets|\.pem$|\.p12$|password|token|api[_-]?key
action: warn
---

**敏感文件编辑警告!**

正在编辑可能包含敏感信息的文件。请确认:
- 文件已加入 .gitignore
- 未硬编码任何凭据或密钥
- 使用环境变量引用敏感值

## 检测模式

```regex
# API Keys
(api[_-]?key|apikey)\s*[:=]\s*["']?[a-zA-Z0-9]{16,}["']?

# Passwords
(password|passwd|pwd)\s*[:=]\s*["'][^"']+["']

# Tokens
token\s*[:=]\s*["']?[a-zA-Z0-9_-]{20,}["']?

# Secrets
secret\s*[:=]\s*["'][^"']{8,}["']

# Private Keys
-----BEGIN (RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----
```
