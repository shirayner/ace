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

# === 经验收集提醒（非阻塞） ===
if [[ -d ".tasks" ]] && [[ ! -f ".tasks/experience.md" ]]; then
    TASK_COUNT=$(find .tasks -name "*.md" 2>/dev/null | wc -l)
    if [[ "$TASK_COUNT" -gt 0 ]]; then
        echo "💡 经验反思提醒：本次任务有 .tasks/ 目录但无 experience.md。"
        echo "如有意外发现、踩坑或策略转换，请写入 .tasks/experience.md 再结束。"
        echo "若无新经验则忽略此提醒。"
    fi
fi

exit 0
