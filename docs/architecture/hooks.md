# Hooks 角色脚本

基于角色的自动化检查脚本

---

## 什么是 Hooks

Hooks 是**角色特定的自动化脚本**，在特定事件触发时执行检查。

```
修改文件 → 触发 Hook → 执行检查 → 通过/失败
```

---

## 可用 Hooks

| Hook | 角色 | 触发时机 | 功能 |
|------|------|---------|------|
| **ace.java-compile-check.sh** | backend, fullstack | 修改 .java 后 | Java 编译检查 |
| **ace.ts-type-check.sh** | frontend, fullstack | 修改 .ts/.tsx 后 | TypeScript 类型检查 |
| **ace.kt-compile-check.sh** | client, fullstack | 修改 .kt 后 | Kotlin 编译检查 |

---

## Java 编译检查 Hook

### 功能

- 检测 Java 语法错误
- 检查编译依赖
- 快速反馈（通常在 1-3 秒内）

### 配置

```bash
#!/bin/bash
# ~/.hookify/hooks/ace.java-compile-check.sh

# 检测 Maven 或 Gradle
if [ -f "pom.xml" ]; then
    mvn compile -q -pl $(find_module)
elif [ -f "build.gradle" ]; then
    ./gradlew compileJava -q
fi

exit $?
```

### 触发示例

```
修改 UserService.java
    ↓
自动触发 ace.java-compile-check.sh
    ↓
编译成功 → 继续操作
编译失败 → 显示错误，阻止后续操作
```

---

## TypeScript 类型检查 Hook

### 功能

- 类型错误检测
- 接口一致性检查
- 快速反馈

### 配置

```bash
#!/bin/bash
# ~/.hookify/hooks/ace.ts-type-check.sh

if [ -f "package.json" ]; then
    npx tsc --noEmit
fi

exit $?
```

---

## Kotlin 编译检查 Hook

### 功能

- Android/iOS 开发支持
- Kotlin 语法检查
- 与 Gradle 集成

### 配置

```bash
#!/bin/bash
# ~/.hookify/hooks/ace.kt-compile-check.sh

if [ -f "build.gradle.kts" ]; then
    ./gradlew compileKotlin -q
fi

exit $?
```

---

## 角色映射

```
Backend Developer
    └─ ace.java-compile-check.sh

Frontend Developer
    └─ ace.ts-type-check.sh

Client Developer
    └─ ace.kt-compile-check.sh

Fullstack Developer
    ├─ ace.java-compile-check.sh
    └─ ace.ts-type-check.sh
```

---

## 自定义 Hooks

### 创建自定义 Hook

```bash
# 1. 创建脚本文件
cat > ~/.hookify/hooks/ace.lint-check.sh << 'EOF'
#!/bin/bash
# 自定义 lint 检查

echo "Running linter..."
npm run lint

exit $?
EOF

# 2. 添加执行权限
chmod +x ~/.hookify/hooks/ace.lint-check.sh

# 3. 配置触发条件
echo '
triggers:
  - pattern: "*.js"
    hook: ace.lint-check.sh
' > ~/.hookify/hook-config.yaml
```

### 可用环境变量

| 变量 | 说明 |
|------|------|
| `$HOOK_FILE` | 触发 Hook 的文件路径 |
| `$HOOK_EVENT` | 触发事件（modify/create/delete） |
| `$PROJECT_ROOT` | 项目根目录 |

---

## 最佳实践

1. **快速反馈** — Hook 应该在 3 秒内完成
2. **增量检查** — 只检查变更相关部分
3. **清晰输出** — 错误信息要明确指出问题
4. **可跳过** — 紧急情况下可以跳过

---

## 故障排除

### Hook 未触发

```bash
# 检查 Hook 是否安装
ls -la ~/.hookify/hooks/

# 检查执行权限
chmod +x ~/.hookify/hooks/*.sh
```

### Hook 执行太慢

```bash
# 使用增量编译
mvn compile -pl module -am

# 或使用守护进程
./gradlew compileJava --daemon
```
