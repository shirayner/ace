---
name: safe-git-commands
enabled: true
event: bash
pattern: git\s+push\s+.*(-f|--force)|git\s+reset\s+--hard|git\s+clean\s+-fd|git\s+rebase\s+-i|git\s+commit\s+--amend
action: warn
---

**Git 危险操作警告!**

即将执行可能影响团队协作的 Git 命令，请确认：

## 受保护命令

### Force Push (`git push --force`)
⚠️ 这会覆盖远程分支历史，可能影响其他协作者
- **建议**: 使用 `git push --force-with-lease`
- **确认**: 已通知团队成员，无人基于此分支工作

### Reset Hard (`git reset --hard`)
⚠️ 这会丢弃所有未提交的更改
- **建议**: 先用 `git stash` 保存更改
- **确认**: 已备份重要修改

### Clean Force (`git clean -fd`)
⚠️ 这会删除未跟踪的文件和目录
- **建议**: 先用 `git clean -n` 预览将被删除的文件
- **确认**: 不会误删重要文件

### Interactive Rebase (`git rebase -i`)
⚠️ 修改已发布的提交会改变历史
- **建议**: 仅对本地未推送的提交使用
- **确认**: 了解变基后需要 force push

### Amend Commit (`git commit --amend`)
⚠️ 修改已推送的提交需要 force push
- **建议**: 仅修改本地最新提交
- **确认**: 尚未推送到远程
