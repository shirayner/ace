#!/bin/bash
# Content Guard — PostToolUse Hook
# 合并规则: sensitive-data, code-quality-gate
# 检测写入内容中的硬编码凭证和调试代码残留
# exit 0 = 无问题, exit 1 = 发现问题（反馈给模型）

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//')

[[ -z "$FILE_PATH" ]] && exit 0

# 提取写入的新内容（new_string 用于 Edit, content 用于 Write）
NEW_CONTENT=$(echo "$INPUT" | grep -o '"new_string"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"new_string"[[:space:]]*:[[:space:]]*"//;s/"$//')
if [[ -z "$NEW_CONTENT" ]]; then
    NEW_CONTENT=$(echo "$INPUT" | grep -o '"content"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"content"[[:space:]]*:[[:space:]]*"//;s/"$//')
fi

[[ -z "$NEW_CONTENT" ]] && exit 0

ISSUES=""

# === 检测硬编码凭证 ===
if echo "$NEW_CONTENT" | grep -qiE '(API_KEY|API_SECRET|SECRET_KEY|ACCESS_TOKEN|TOKEN|PASSWORD|PWD)\s*[=:]\s*["'"'"'][^"'"'"']+["'"'"']'; then
    ISSUES="${ISSUES}⚠️ 检测到可能的硬编码凭证 (API_KEY/SECRET/TOKEN/PASSWORD)\n"
fi

# === 检测源代码中的调试残留（仅针对代码文件）===
case "$FILE_PATH" in
    *.java)
        if echo "$NEW_CONTENT" | grep -qE 'System\.(out|err)\.print'; then
            ISSUES="${ISSUES}⚠️ 检测到 System.out/err.print — 请使用 Logger\n"
        fi
        ;;
    *.js|*.ts|*.tsx)
        if echo "$NEW_CONTENT" | grep -qE 'console\.(log|debug|warn|error)'; then
            ISSUES="${ISSUES}⚠️ 检测到 console.log — 请确认是否为调试残留\n"
        fi
        if echo "$NEW_CONTENT" | grep -qE '\bdebugger\b'; then
            ISSUES="${ISSUES}⚠️ 检测到 debugger 语句\n"
        fi
        ;;
    *.py)
        if echo "$NEW_CONTENT" | grep -qE '^\s*print\('; then
            ISSUES="${ISSUES}⚠️ 检测到 print() — 请确认是否为调试残留\n"
        fi
        if echo "$NEW_CONTENT" | grep -qE '^\s*breakpoint\(\)'; then
            ISSUES="${ISSUES}⚠️ 检测到 breakpoint()\n"
        fi
        ;;
esac

if [[ -n "$ISSUES" ]]; then
    echo "🔍 内容安全检查发现问题:"
    echo ""
    echo -e "$ISSUES"
    echo "文件: $FILE_PATH"
    exit 1
fi

exit 0
