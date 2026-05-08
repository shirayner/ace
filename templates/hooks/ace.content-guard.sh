#!/bin/bash
# Content Guard — PostToolUse Hook
# 检测写入内容中的硬编码凭证和调试代码残留
# exit 0 = 无问题, exit 1 = 发现问题（反馈给模型）

# NOTE: 不使用 set -e — grep 无匹配返回 1 会导致脚本崩溃
set -uo pipefail

INPUT=$(cat)

# 提取 file_path（文件路径不含转义引号，简单模式安全）
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//' || true)

[[ -z "$FILE_PATH" ]] && exit 0

# 提取待检查内容：取 "new_string": 或 "content": 之后的全部文本
# 策略：不做精确 JSON value 提取（转义引号会截断），而是检查 key 之后的原始文本
# 在 Claude Code 的 JSON 中，old_string 位于 new_string 之前，不会误报
CHECK_CONTENT=""
if echo "$INPUT" | grep -q '"new_string"'; then
    CHECK_CONTENT=$(echo "$INPUT" | sed 's/.*"new_string"[[:space:]]*:[[:space:]]*//')
elif echo "$INPUT" | grep -q '"content"'; then
    CHECK_CONTENT=$(echo "$INPUT" | sed 's/.*"content"[[:space:]]*:[[:space:]]*//')
fi

[[ -z "$CHECK_CONTENT" ]] && exit 0

ISSUES=""

# === 检测硬编码凭证 ===
if echo "$CHECK_CONTENT" | grep -qiE '(API_KEY|API_SECRET|SECRET_KEY|ACCESS_TOKEN|PASSWORD|PWD)\s*[=:]\s*["\x27][^"\x27]+["\x27]'; then
    ISSUES="${ISSUES}⚠️ 检测到可能的硬编码凭证 (API_KEY/SECRET/TOKEN/PASSWORD)\n"
fi

# === 检测源代码中的调试残留（仅针对代码文件）===
case "$FILE_PATH" in
    *.java)
        if echo "$CHECK_CONTENT" | grep -qE 'System\.(out|err)\.print'; then
            ISSUES="${ISSUES}⚠️ 检测到 System.out/err.print — 请使用 Logger\n"
        fi
        ;;
    *.js|*.ts|*.tsx)
        if echo "$CHECK_CONTENT" | grep -qE 'console\.(log|debug|warn|error)'; then
            ISSUES="${ISSUES}⚠️ 检测到 console.log — 请确认是否为调试残留\n"
        fi
        if echo "$CHECK_CONTENT" | grep -qE '\bdebugger\b'; then
            ISSUES="${ISSUES}⚠️ 检测到 debugger 语句\n"
        fi
        ;;
    *.py)
        if echo "$CHECK_CONTENT" | grep -qE 'print\('; then
            ISSUES="${ISSUES}⚠️ 检测到 print() — 请确认是否为调试残留\n"
        fi
        if echo "$CHECK_CONTENT" | grep -qE 'breakpoint\(\)'; then
            ISSUES="${ISSUES}⚠️ 检测到 breakpoint()\n"
        fi
        ;;
esac

if [[ -n "$ISSUES" ]]; then
    echo "🔍 内容安全检查发现问题:"
    echo ""
    printf "%b" "$ISSUES"
    echo "文件: $FILE_PATH"
    exit 1
fi

exit 0
