---
name: warn-sensitive-data
enabled: true
event: file
action: warn
conditions:
  - field: new_text
    operator: regex_match
    pattern: (API_KEY|SECRET|TOKEN|PASSWORD|PWD)\s*[=:]\s*["'][^"']+["']
---

**敏感信息 detected！**

文件内容可能包含硬编码凭证：
- API_KEY / API_SECRET
- TOKEN / ACCESS_TOKEN
- PASSWORD / PWD

建议：
1. 使用环境变量替代硬编码
2. 确认文件已在 .gitignore 中
3. 考虑使用密钥管理服务
