#!/bin/bash
# Stop Hook — 交付前验证
# 合并规则: require-verification + Java 编译检查
# exit 0 = 允许停止, exit 2 = 阻止停止（强制继续）

set -euo pipefail

INPUT=$(cat)

ISSUES=""

# === 检查 Java 编译失败标记 ===
FAIL_MARKER="/tmp/.claude-java-compile-failed"
if [[ -f "$FAIL_MARKER" ]]; then
    ISSUES="${ISSUES}❌ Java 编译未通过，请先修复编译错误\n"
    rm -f "$FAIL_MARKER"
fi

# 如果有阻塞性问题，阻止停止
if [[ -n "$ISSUES" ]]; then
    echo "⛔ 交付前验证未通过:"
    echo ""
    echo -e "$ISSUES"
    echo "请修复以上问题后再结束任务。"
    exit 2
fi

exit 0
