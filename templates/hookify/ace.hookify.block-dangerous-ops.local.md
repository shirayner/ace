---
name: block-dangerous-ops
enabled: true
event: bash
pattern: rm\s+-rf|DROP\s+TABLE|TRUNCATE\s+TABLE|sudo\s+|curl\s+.*--data|>\s*/dev/null\s*2>&1.*rm
action: block
---

**危险操作已阻止!**

检测到高风险命令，已自动拦截。请确认:
- 是否真的需要执行此操作？
- 是否有更安全的替代方案？
- 数据是否已备份？

## 阻止的命令类型

| 命令 | 风险 | 替代方案 |
|------|------|----------|
| `rm -rf` | 递归强制删除 | 先 `ls` 确认，再用 `rm -i` |
| `DROP TABLE` | 删除数据库表 | 先备份，使用事务 |
| `TRUNCATE TABLE` | 清空表数据 | 先备份，使用 DELETE |
| `sudo` | 提权操作 | 使用最小权限原则 |
| `curl --data` | 可能泄露数据 | 检查 URL 和数据内容 |

如确需执行，请手动在终端中运行。
