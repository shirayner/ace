#!/bin/bash
# Bash Command Guard — PreToolUse Hook
# 合并规则: block-dangerous-ops, dangerous-commands, safe-git-commands
# exit 0 = 允许（stdout 作为警告信息传递给模型）
# exit 2 = 阻止执行

set -euo pipefail

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//')

[[ -z "$COMMAND" ]] && exit 0

# === BLOCK: 高危操作，直接阻止 ===

BLOCK_PATTERNS=(
    'rm\s+-rf'
    'rm\s+-r\s'
    'rm\s+.*--recursive'
    'git\s+push\s+.*(-f|--force)[^-]'
    'git\s+push\s+.*--force$'
    'DROP\s+TABLE'
    'TRUNCATE\s+TABLE'
    'git\s+reset\s+--hard'
    'git\s+clean\s+-fd'
    'git\s+clean\s+-ffd'
    'sudo\s+'
    'dd\s+if='
    'mkfs\.'
    'format\s+[A-Za-z]:'
)

for pattern in "${BLOCK_PATTERNS[@]}"; do
    if echo "$COMMAND" | grep -qiE "$pattern"; then
        echo "⛔ 危险操作已阻止!"
        echo ""
        echo "匹配规则: $pattern"
        echo "命令: $COMMAND"
        echo ""
        echo "如确需执行，请手动在终端中运行。"
        exit 2
    fi
done

# === WARN: 风险操作，允许但警告 ===

WARN_PATTERNS=(
    'git\s+push\s+.*--force-with-lease'
    'git\s+rebase\s+-i'
    'git\s+commit\s+--amend'
)

for pattern in "${WARN_PATTERNS[@]}"; do
    if echo "$COMMAND" | grep -qiE "$pattern"; then
        echo "⚠️ Git 风险操作提醒"
        echo ""
        echo "命令: $COMMAND"
        echo ""
        case "$COMMAND" in
            *force-with-lease*) echo "提醒: --force-with-lease 相对安全，但仍会覆盖远程历史" ;;
            *rebase*) echo "提醒: 仅对本地未推送的提交使用 rebase -i" ;;
            *amend*) echo "提醒: 仅修改本地最新未推送的提交" ;;
        esac
        exit 0
    fi
done

exit 0
