---
name: protect-secrets
enabled: true
event: file
conditions:
  - field: file_path
    operator: regex_match
    pattern: \.env$|\.env\.|credentials|\.key$|secrets|\.pem$|\.p12$|password
action: warn
---

**敏感文件编辑警告!**

正在编辑可能包含敏感信息的文件。请确认:
- 文件已加入 .gitignore
- 未硬编码任何凭据或密钥
- 使用环境变量引用敏感值
