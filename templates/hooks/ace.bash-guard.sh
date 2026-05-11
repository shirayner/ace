#!/bin/bash
# Bash Command Guard — PreToolUse Hook (路径感知型)
# exit 0 = 允许（stdout 作为警告信息传递给模型）
# exit 2 = 阻止执行

# NOTE: 不使用 set -e — grep 无匹配返回 1 会导致脚本崩溃
set -uo pipefail

INPUT=$(cat)

# 提取命令：替换转义引号为占位符，用 grep -o 精确匹配 JSON value，再还原
COMMAND=$(echo "$INPUT" | sed 's/\\"/\x01/g' | grep -o '"command"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"command"[[:space:]]*:[[:space:]]*"//;s/"$//' | sed 's/\x01/\\"/g' || true)

[[ -z "$COMMAND" ]] && exit 0

# === 辅助函数：判断 rm 目标路径是否安全 ===
is_rm_safe() {
    local cmd="$1"

    # 提取 rm 命令中的路径参数（跳过 flags）
    local paths=()
    local in_rm=false
    for word in $cmd; do
        if [[ "$word" == "rm" ]]; then
            in_rm=true
            continue
        fi
        if $in_rm; then
            # 跳过 flags（-rf, -r, -f, --recursive 等）
            if [[ "$word" == -* ]]; then
                continue
            fi
            # 去除引号
            word="${word//\"/}"
            word="${word//\'/}"
            paths+=("$word")
        fi
    done

    for path in "${paths[@]}"; do
        # 绝对禁止：系统根路径
        if [[ "$path" == "/" || "$path" == "/*" || "$path" == "/usr"* || "$path" == "/etc"* || \
              "$path" == "/opt"* || "$path" == "/bin"* || "$path" == "/sbin"* || \
              "$path" == "/var"* || "$path" == "/lib"* || "$path" == "/boot"* ]]; then
            return 1
        fi

        # 绝对禁止：home 目录根
        if [[ "$path" == "~" || "$path" == "~/" || "$path" == "~/*" || \
              "$path" == "$HOME" || "$path" == "$HOME/" || "$path" == "$HOME/*" ]]; then
            return 1
        fi

        # 绝对禁止：Windows 系统盘根
        if echo "$path" | grep -qiE '^[A-Z]:[/\\]?$'; then
            return 1
        fi

        # 绝对禁止：.git 目录
        if echo "$path" | grep -qE '(^|/)\.git(/|$)'; then
            return 1
        fi

        # 绝对禁止：删除当前目录自身（项目根）
        if [[ "$path" == "." || "$path" == "./" ]]; then
            return 1
        fi

        # 其他路径（项目子目录）→ 允许
    done

    return 0
}

# === BLOCK: 系统级高危操作，直接阻止 ===

BLOCK_PATTERNS=(
    'git\s+push\s+(.*\s)?-f(\s|$)'
    'git\s+push\s+.*--force(\s|$)'
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

# === rm 路径感知检查 ===

if echo "$COMMAND" | grep -qE '(^|[;&|]\s*)rm\s'; then
    if echo "$COMMAND" | grep -qE 'rm\s+(-[a-zA-Z]*r[a-zA-Z]*\s|--recursive)'; then
        # 递归删除 → 检查路径安全性
        if ! is_rm_safe "$COMMAND"; then
            echo "⛔ 危险的递归删除已阻止!"
            echo ""
            echo "命令: $COMMAND"
            echo "原因: 目标路径不在安全范围内（系统路径/.git/项目根）"
            echo ""
            echo "如确需执行，请手动在终端中运行。"
            exit 2
        fi
    fi
fi

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
