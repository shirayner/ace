#!/bin/bash
# OpenSpec 目录初始化脚本
# 用法：bash openspec-init.sh [project_root]
# 等效于 openspec init，但不依赖 OpenSpec CLI

PROJECT_ROOT="${1:-$(pwd)}"
OPENSPEC_DIR="$PROJECT_ROOT/openspec"

# 如果已存在则退出
if [ -d "$OPENSPEC_DIR" ]; then
  echo "openspec/ 目录已存在，跳过初始化"
  exit 0
fi

# 创建目录结构
mkdir -p "$OPENSPEC_DIR/changes/archive"
mkdir -p "$OPENSPEC_DIR/specs"

# 创建 config.yaml
cat > "$OPENSPEC_DIR/config.yaml" << 'EOF'
schema: spec-driven

# Project context (optional)
# This is shown to AI when creating artifacts.
# Add your tech stack, conventions, style guides, domain knowledge, etc.
# Example:
#   context: |
#     Tech stack: TypeScript, React, Node.js
#     We use conventional commits
#     Domain: e-commerce platform

# Per-artifact rules (optional)
# Add custom rules for specific artifacts.
# Example:
#   rules:
#     proposal:
#       - Keep proposals under 500 words
#       - Always include a "Non-goals" section
#     tasks:
#       - Break tasks into chunks of max 2 hours
EOF

echo "已初始化 openspec/ 目录：$OPENSPEC_DIR"
