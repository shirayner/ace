#!/bin/bash
# OpenSpec 目录初始化 + CLI 安装检测
# 用法：bash openspec-init.sh [project_root]

PROJECT_ROOT="${1:-$(pwd)}"
OPENSPEC_DIR="$PROJECT_ROOT/openspec"

# 1. 检测 openspec CLI，未安装则全局安装
if ! command -v openspec &> /dev/null; then
  echo "openspec CLI 未安装，正在全局安装..."
  npm install -g @anthropic/openspec
  if [ $? -ne 0 ]; then
    echo "openspec CLI 安装失败，请手动执行: npm install -g @anthropic/openspec"
    exit 1
  fi
  echo "openspec CLI 安装完成: $(openspec --version)"
fi

# 2. 初始化 openspec 目录（仅创建最小结构，不执行 openspec init）
if [ -d "$OPENSPEC_DIR" ]; then
  echo "openspec/ 目录已存在，跳过初始化"
  exit 0
fi

mkdir -p "$OPENSPEC_DIR/changes/archive"
mkdir -p "$OPENSPEC_DIR/specs"

cat > "$OPENSPEC_DIR/config.yaml" << 'EOF'
schema: spec-driven
EOF

echo "已初始化 openspec/ 目录：$OPENSPEC_DIR"
