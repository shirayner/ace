---
name: block-dangerous-commands
enabled: true
event: bash
pattern: rm\s+-rf|sudo\s+|dd\s+if=|mkfs|format\s+|>:\s*/
action: block
---

**危险命令 detected！**

此命令可能造成数据丢失或系统损坏：
- `rm -rf` - 强制递归删除
- `sudo` - 特权执行
- `dd if=` / `mkfs` / `format` - 磁盘操作
- `> /path` - 重定向到系统文件

请确认：
1. 路径是否正确
2. 是否有备份
3. 是否可以使用更安全的方式
