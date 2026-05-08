#!/bin/bash
# File Guard — PreToolUse Hook
# 规则: protect-secrets
# 检测对敏感文件的编辑操作，输出警告
# exit 0 + stdout = 警告（不阻止）

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//')

[[ -z "$FILE_PATH" ]] && exit 0

SENSITIVE_PATTERNS='\.env$|\.env\.|credentials|\.key$|secrets|\.pem$|\.p12$|password|\.keystore$|\.jks$'

if echo "$FILE_PATH" | grep -qiE "$SENSITIVE_PATTERNS"; then
    echo "⚠️ 敏感文件编辑警告"
    echo ""
    echo "文件: $FILE_PATH"
    echo ""
    echo "请确认:"
    echo "- 文件已加入 .gitignore"
    echo "- 未硬编码任何凭据或密钥"
    echo "- 使用环境变量引用敏感值"
fi

exit 0
