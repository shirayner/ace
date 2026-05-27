# 三、后端 AI 开发全流程 Hooks 应用模式

## 概览：Hooks 在开发流程中的位置

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    后端开发全流程 × Hooks 映射                            │
├──────────┬──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  编码    │  测试    │  提交    │  审查    │  部署    │  状态管理        │
├──────────┼──────────┼──────────┼──────────┼──────────┼─────────────────┤
│PreToolUse│PostTool  │PreToolUse│Stop      │PreToolUse│PreCompact       │
│PostTool  │Stop      │PostTool  │PostBatch │PostTool  │SessionStart     │
│          │          │          │prompt    │          │UserPromptSubmit  │
└──────────┴──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

---

## 3.1 编码阶段

### 场景 A：危险命令拦截

```
触发：PreToolUse[Bash]
策略：分级响应（BLOCK/WARN/ALLOW）
```

| 危险等级 | 命令模式 | 响应 |
|----------|---------|------|
| CRITICAL | `rm -rf /`, `sudo`, `dd if=`, `mkfs` | exit 2 硬阻断 |
| HIGH | `git push --force`, `DROP TABLE`, `git reset --hard` | exit 2 硬阻断 |
| WARN | `git push --force-with-lease`, `git rebase -i` | exit 0 + 警告 |

**最佳实践**：使用 `if` 字段预过滤，避免对 `ls`、`cat` 等安全命令启动进程。

### 场景 B：敏感文件保护

```
触发：PreToolUse[Edit|Write]
策略：路径模式匹配 → 警告/阻断
```

敏感文件模式：`.env*`, `credentials*`, `*.key`, `*.pem`, `*.jks`, `*password*`

### 场景 C：即时编译反馈

```
触发：PostToolUse[Edit|Write]（if: *.java）
策略：增量编译 → 失败则通知 Claude
```

```bash
# 静默成功，喧嚣失败
timeout 30 mvn compile -q -T 1C -DskipTests 2>&1 || {
    echo "❌ 编译失败"
    echo "$COMPILE_OUTPUT" | tail -30
    exit 1  # 非阻断，但 Claude 会看到并修复
}
```

**进阶**：使用 `async: true` + `asyncRewake: true` 让编译后台运行，失败时唤醒。

### 场景 D：自动格式化

```
触发：PostToolUse[Edit|Write]
策略：按文件类型自动运行格式化工具
```

| 语言 | 工具 |
|------|------|
| Java | google-java-format / spotless |
| Python | black + ruff |
| TypeScript | prettier + eslint --fix |
| Go | gofmt |

### 场景 E：内容安全扫描

```
触发：PostToolUse[Edit|Write]
策略：扫描写入内容中的安全隐患
```

检测项：
- 硬编码 API Key / Secret / Token / Password
- 调试残留（System.out.print, console.log, debugger, breakpoint）
- TODO/FIXME 标注（可选，非阻断）

---

## 3.2 测试阶段

### 场景 A：修改后自动触发关联测试

```
触发：PostToolUse[Edit|Write]（if: src/main/**/*.java）
策略：找到对应测试文件 → 运行 → 反馈
```

```bash
#!/bin/bash
# auto-test.sh
FILE_PATH=$(jq -r '.tool_input.file_path' < /dev/stdin)
[[ "$FILE_PATH" != *src/main* ]] && exit 0

# 映射 src/main → src/test
TEST_FILE="${FILE_PATH/src\/main/src\/test}"
TEST_FILE="${TEST_FILE%.java}Test.java"

if [[ -f "$TEST_FILE" ]]; then
    # 提取测试类全限定名
    TEST_CLASS=$(grep -oP 'package \K[^;]+' "$TEST_FILE").$(basename "$TEST_FILE" .java)
    timeout 60 mvn test -pl . -Dtest="$TEST_CLASS" -q 2>&1 || {
        echo "❌ 关联测试失败: $TEST_CLASS"
        exit 1
    }
fi
exit 0
```

**推荐模式**：`async: true` + `asyncRewake: true`（测试耗时较长，不阻塞编码）

### 场景 B：Stop 门禁 — 交付前测试验证

```
触发：Stop
策略：检查测试是否通过 → 阻断或放行
```

```bash
# 检查最近一次测试是否通过
if [[ -f /tmp/.claude-test-failed ]]; then
    echo '{"decision": "block", "reason": "Tests still failing. Please fix before completing."}'
    rm -f /tmp/.claude-test-failed
    exit 0
fi
```

### 场景 C：测试覆盖率检查

```
触发：Stop（交付门禁增强）
策略：计算增量覆盖率 → 低于阈值则警告
```

---

## 3.3 提交阶段

### 场景 A：Commit Message 格式验证

```
触发：PreToolUse[Bash]（if: Bash(git commit*)）
策略：检查 -m 参数是否符合 Conventional Commits
```

```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command' < /dev/stdin)

# 提取 commit message
MSG=$(echo "$COMMAND" | grep -oP '(?<=-m ["\x27])[^"\x27]+')
[[ -z "$MSG" ]] && exit 0

# Conventional Commits 校验
if ! echo "$MSG" | grep -qE '^(feat|fix|docs|style|refactor|test|chore|perf|ci|build|revert)(\(.+\))?: .{1,72}'; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "⚠️ Commit message 不符合 Conventional Commits 规范。格式: type(scope): description",
    "permissionDecision": "defer"
  }
}
EOF
fi
exit 0
```

### 场景 B：分支保护

```
触发：PreToolUse[Bash]（if: Bash(git push*)）
策略：禁止 force push 到保护分支
```

### 场景 C：异步安全审查

```
触发：PostToolUse[Bash]（if: Bash(git commit*)）
策略：async + asyncRewake — 后台 LLM 审查 diff
```

参考 security-guidance 的三层模型：commit 后异步审查 diff 中的安全隐患。

---

## 3.4 审查阶段

### 场景 A：LLM 自审（prompt hook）

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "prompt",
        "prompt": "Review all code changes in this session for: 1) SOLID violations 2) Missing error handling 3) Security issues 4) Performance problems. If critical issues found, return {decision:'block', reason:'...'}. Otherwise return {decision:'allow'}.",
        "timeout": 30
      }]
    }]
  }
}
```

**价值**：Claude 用另一个模型调用做独立审查，类似"第二双眼睛"。

### 场景 B：批量修改一致性检查

```
触发：PostToolBatch
策略：验证并行修改的多个文件之间的一致性
```

示例：修改了 interface 后，检查所有 impl 是否同步更新。

### 场景 C：架构合规检查

```
触发：PostToolUse[Write]（if: Write(src/main/**)）
策略：检查新文件是否符合分层架构约束
```

---

## 3.5 部署阶段

### 场景 A：部署命令门禁

```
触发：PreToolUse[Bash]（if: Bash(kubectl apply*)|Bash(docker push*)|Bash(mvn deploy*)）
策略：生产部署命令要求额外确认
```

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "ask",
    "permissionDecisionReason": "Production deployment command detected. Please confirm."
  }
}
```

### 场景 B：配置变更保护

```
触发：PreToolUse[Edit|Write]（if: Edit(**/application*.yml)|Write(**/application*.yml)）
策略：应用配置修改时注入提醒
```

---

## 3.6 状态管理阶段（AI 辅助开发特有）

### 场景 A：PreCompact 状态保持

```
触发：PreCompact
策略：压缩前保存关键任务状态
```

```bash
#!/bin/bash
# 找到当前活跃任务的 state.md
STATE_FILES=$(find .tasks -name "state.md" -newer /tmp/.claude-last-compact 2>/dev/null)
if [[ -n "$STATE_FILES" ]]; then
    SUMMARY=$(cat $STATE_FILES | head -50)
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": "=== PRESERVED TASK STATE ===\n${SUMMARY}\n=== END STATE ==="
  }
}
EOF
fi
touch /tmp/.claude-last-compact
exit 0
```

### 场景 B：SessionStart 恢复

```
触发：SessionStart（matcher: startup|resume）
策略：恢复上次会话的工作状态
```

### 场景 C：UserPromptSubmit 上下文增强

```
触发：UserPromptSubmit
策略：每次 prompt 提交自动注入项目状态
```

---

## 3.7 全流程模式对照表

| 开发阶段 | Hook 事件 | 典型操作 | 阻断级别 | 推荐模式 |
|----------|-----------|----------|----------|----------|
| 编码-安全 | PreToolUse | 命令拦截 | 硬阻断 | if + exit 2 |
| 编码-质量 | PostToolUse | 编译/格式化 | 软反馈 | async + asyncRewake |
| 编码-规范 | PostToolUse | 内容扫描 | 软反馈 | exit 1 |
| 测试-触发 | PostToolUse | 自动跑测试 | 无 | async + asyncRewake |
| 测试-门禁 | Stop | 验证通过率 | 硬阻断 | decision: block |
| 提交-格式 | PreToolUse | msg 校验 | 软反馈 | additionalContext |
| 提交-安全 | PostToolUse | diff 审查 | 异步唤醒 | async + asyncRewake |
| 审查-自审 | Stop | LLM 代码审查 | 条件阻断 | prompt hook |
| 部署-确认 | PreToolUse | 命令升级确认 | 用户决策 | permissionDecision: ask |
| 状态-保存 | PreCompact | 状态快照 | 无 | additionalContext |
| 状态-恢复 | SessionStart | 加载状态 | 无 | additionalContext |

---

## 3.8 后端场景特有价值

### Java/Spring Boot 开发

1. **增量编译反馈**：修改 .java → 自动 `mvn compile` → 失败即刻反馈
2. **Maven 依赖安全**：PreToolUse 检查 `mvn dependency:` 命令中的不安全仓库
3. **Spring 配置一致性**：PostToolUse 检查 application.yml 修改后的属性名合法性
4. **API 兼容性**：修改 Controller 后检查是否破坏了 API 契约

### 微服务场景

1. **跨服务影响分析**：PostToolUse 注入"此修改可能影响下游服务 X"
2. **配置中心同步提醒**：修改本地配置后提醒同步到 QConfig
3. **数据库迁移安全**：PreToolUse 拦截危险 DDL（DROP/TRUNCATE）

### CI/CD 集成

1. **HTTP hook 打通 CI**：文件修改后触发 webhook 通知 CI 系统
2. **构建状态注入**：UserPromptSubmit 时查询最新 CI 状态注入上下文
3. **部署门禁**：PreToolUse 对 deploy 命令要求 CI 绿灯
