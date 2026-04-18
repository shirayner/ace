---
name: block-dangerous-ops
enabled: true
event: bash
pattern: rm\s+-rf|git\s+push\s+.*(-f|--force)|DROP\s+TABLE|TRUNCATE\s+TABLE|git\s+reset\s+--hard|git\s+clean\s+-fd
action: block
---

**危险操作已阻止!**

检测到高风险命令，已自动拦截。请确认:
- 是否真的需要执行此操作？
- 是否有更安全的替代方案？
- 数据是否已备份？

如确需执行，请手动在终端中运行。
