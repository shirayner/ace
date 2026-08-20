#!/bin/bash

# load_roles.sh - 从 resources/roles.json 加载评审角色配置
# 使用方式: source load_roles.sh
# 提供函数: get_enabled_roles, get_role_property, list_roles
# 注意: 纯 bash 实现，不依赖 jq

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SKILL_ROOT="$(dirname "$SCRIPT_DIR")"
ROLES_JSON="$SKILL_ROOT/resources/roles.json"

# 检查 roles.json 是否存在
if [ ! -f "$ROLES_JSON" ]; then
  echo "❌ 错误: roles.json 文件不存在: $ROLES_JSON" >&2
  return 1
fi

# 获取所有已启用的角色 ID 列表
# 使用方式: enabled_roles=$(get_enabled_roles)
get_enabled_roles() {
  grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$ROLES_JSON" | grep -o '"[^"]*"$' | tr -d '"' | while read role_id; do
    # 检查这个角色是否启用
    if grep -A 10 "\"id\"[[:space:]]*:[[:space:]]*\"$role_id\"" "$ROLES_JSON" | grep -q '"enabled"[[:space:]]*:[[:space:]]*true'; then
      echo "$role_id"
    fi
  done | tr '\n' ' '
}

# 获取角色的特定属性
# 使用方式: get_role_property "backend_member" "name"
get_role_property() {
  local role_id="$1"
  local property="$2"

  grep -A 10 "\"id\"[[:space:]]*:[[:space:]]*\"$role_id\"" "$ROLES_JSON" | \
    grep "\"$property\"" | \
    head -1 | \
    sed 's/.*"'"$property"'"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
}

# 获取角色的标准文件路径
# 使用方式: standard_path=$(get_role_standard "backend_member")
get_role_standard() {
  local role_id="$1"
  local standard_path=$(get_role_property "$role_id" "standardPath")

  if [[ "$standard_path" == /* ]]; then
    echo "$standard_path"
  else
    echo "$SKILL_ROOT/$standard_path"
  fi
}

# 获取角色的模板文件路径
# 使用方式: template_path=$(get_role_template "backend_member")
get_role_template() {
  local role_id="$1"
  local template_path=$(get_role_property "$role_id" "templatePath")

  if [[ "$template_path" == /* ]]; then
    echo "$template_path"
  else
    echo "$SKILL_ROOT/$template_path"
  fi
}

# 列出所有角色信息
# 使用方式: list_roles
list_roles() {
  echo "📋 可用的评审角色："
  echo ""

  # 提取所有 ID
  grep -o '"id"[[:space:]]*:[[:space:]]*"[^"]*"' "$ROLES_JSON" | grep -o '"[^"]*"$' | tr -d '"' | while read role_id; do
    # 检查是否启用
    if grep -A 10 "\"id\"[[:space:]]*:[[:space:]]*\"$role_id\"" "$ROLES_JSON" | grep -q '"enabled"[[:space:]]*:[[:space:]]*true'; then
      role_type=$(get_role_property "$role_id" "type")
      role_name=$(get_role_property "$role_id" "name")
      role_desc=$(get_role_property "$role_id" "description")

      printf "  [%s] %s - %s\n" "$role_type" "$role_id" "$role_name"
      printf "           %s\n\n" "$role_desc"
    fi
  done
}

# 验证角色是否存在且已启用
# 使用方式: if is_role_valid "backend_member"; then ... fi
is_role_valid() {
  local role_id="$1"

  grep -A 10 "\"id\"[[:space:]]*:[[:space:]]*\"$role_id\"" "$ROLES_JSON" | grep -q '"enabled"[[:space:]]*:[[:space:]]*true' && return 0 || return 1
}

# 获取角色根目录（用于加载相关资源）
# 使用方式: role_dir=$(get_role_directory "backend_member")
get_role_directory() {
  local role_id="$1"
  local standard_path=$(get_role_standard "$role_id")

  dirname "$standard_path"
}
