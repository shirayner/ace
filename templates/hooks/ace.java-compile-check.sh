#!/bin/bash
# Java Compile Check — PostToolUse Hook
# 设计原则：静默成功，喧嚣失败，增量编译，超时保护
# 触发条件：Edit|Write 工具修改 .java 文件后自动运行

set -euo pipefail

# 读取 stdin（Claude Code 传入的 JSON）
INPUT=$(cat)

# 提取 tool_input.file_path（无 jq 依赖，用 grep+sed）
FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//;s/"$//')

# 如果提取不到 file_path，静默退出
[[ -z "$FILE_PATH" ]] && exit 0

# 只处理 .java 文件
[[ "$FILE_PATH" != *.java ]] && exit 0

# Windows 路径转换：C:\foo\bar → /c/foo/bar, D:\foo\bar → /d/foo/bar
normalize_path() {
    local p="$1"
    # 已经是 Unix 路径
    if [[ "$p" == /* ]]; then
        echo "$p"
        return
    fi
    # Windows 绝对路径 D:\... 或 D:/...
    if [[ "$p" =~ ^([A-Za-z]):[/\\] ]]; then
        local drive="${BASH_REMATCH[1]}"
        drive=$(echo "$drive" | tr '[:upper:]' '[:lower:]')
        p="/$drive/${p:3}"
    fi
    # 反斜杠 → 正斜杠
    echo "${p//\\//}"
}

FILE_PATH=$(normalize_path "$FILE_PATH")

# 检查文件是否存在
[[ ! -f "$FILE_PATH" ]] && exit 0

# 向上查找 pom.xml 或 build.gradle（项目根）
find_project_root() {
    local dir="$1"
    while [[ "$dir" != "/" && "$dir" != "." ]]; do
        if [[ -f "$dir/pom.xml" ]]; then
            echo "$dir"
            return 0
        fi
        if [[ -f "$dir/build.gradle" || -f "$dir/build.gradle.kts" ]]; then
            echo "$dir"
            return 0
        fi
        dir=$(dirname "$dir")
    done
    return 1
}

PROJECT_ROOT=$(find_project_root "$(dirname "$FILE_PATH")") || exit 0

# 修复 JAVA_HOME 路径（Windows → Unix）
if [[ -n "${JAVA_HOME:-}" ]]; then
    JAVA_HOME=$(normalize_path "$JAVA_HOME")
    export JAVA_HOME
fi

# 确定构建工具和编译命令
COMPILE_CMD=""
if [[ -f "$PROJECT_ROOT/pom.xml" ]]; then
    # Maven：仅编译，跳过测试，静默模式
    MVN_CMD="mvn"
    if [[ -f "$PROJECT_ROOT/mvnw" || -f "$PROJECT_ROOT/mvnw.cmd" ]]; then
        MVN_CMD="$PROJECT_ROOT/mvnw"
    fi
    COMPILE_CMD="$MVN_CMD compile -q -T 1C -DskipTests -f $PROJECT_ROOT/pom.xml"
elif [[ -f "$PROJECT_ROOT/build.gradle" || -f "$PROJECT_ROOT/build.gradle.kts" ]]; then
    # Gradle：增量编译
    GRADLE_CMD="gradle"
    if [[ -f "$PROJECT_ROOT/gradlew" || -f "$PROJECT_ROOT/gradlew.bat" ]]; then
        GRADLE_CMD="$PROJECT_ROOT/gradlew"
    fi
    COMPILE_CMD="$GRADLE_CMD compileJava -q -p $PROJECT_ROOT"
fi

[[ -z "$COMPILE_CMD" ]] && exit 0

# 带超时执行编译（30秒上限）
COMPILE_OUTPUT=$(timeout 30 bash -c "$COMPILE_CMD" 2>&1) || {
    EXIT_CODE=$?
    if [[ $EXIT_CODE -eq 124 ]]; then
        echo "⏱ Java 编译超时（30s），跳过本次检查。请手动验证。"
        exit 0
    fi
    # 编译失败 — 喧嚣输出
    echo "❌ Java 编译失败！修改文件: $(basename "$FILE_PATH")"
    echo "项目: $PROJECT_ROOT"
    echo ""
    echo "$COMPILE_OUTPUT" | tail -30
    echo ""
    echo "请修复编译错误后再继续。"
    exit 1
}

# 编译成功 — 静默退出
exit 0
