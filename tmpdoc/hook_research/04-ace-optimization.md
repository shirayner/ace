# 四、ACE 框架 Hooks 优化方向

## 4.1 现状分析

### 当前 ACE Hooks 架构

```
~/.claude/settings.json
└── hooks
    ├── PreToolUse
    │   ├── [Bash] ace.bash-guard.sh      → 分级命令拦截（BLOCK + WARN）
    │   └── [Edit|Write] ace.file-guard.sh → 敏感文件编辑警告
    ├── PostToolUse
    │   ├── [Edit|Write] ace.java-compile-check.sh → Java 增量编译
    │   └── [Edit|Write] ace.content-guard.sh      → 凭证/调试残留检测
    └── Stop
        └── [*] ace.stop-verify.sh         → 编译状态 + 经验提醒
```

### 优势评估

| Hook | 亮点 |
|------|------|
| bash-guard | 路径感知的 rm 安全检查（不是简单黑名单），区分 BLOCK/WARN |
| java-compile-check | 增量编译 + 超时保护 + 跨平台路径处理 + 静默成功/喧嚣失败 |
| content-guard | 多语言调试残留检测（Java/JS/TS/Python） |
| stop-verify | 编译状态跨 hook 传递（/tmp 标记文件）+ 经验收集提醒 |
| file-guard | 覆盖常见敏感文件模式 |

### 差距分析

| 维度 | ACE 现状 | 业界最佳实践 | 差距等级 |
|------|----------|-------------|----------|
| `if` 条件预过滤 | ❌ 未使用 | 精确条件避免无效进程 | 🔴 性能瓶颈 |
| 上下文连续性 | ❌ 无 PreCompact | PreCompact + SessionStart 状态保持 | 🔴 核心缺失 |
| async 异步模式 | ❌ 未使用 | 非阻塞审查 + asyncRewake | 🟡 体验可优化 |
| UserPromptSubmit | ❌ 未使用 | 每次提交注入项目状态 | 🟡 上下文增强缺失 |
| prompt/agent hook | ❌ 未使用 | LLM 级语义审查 | 🟡 高级场景空白 |
| 自动测试触发 | ❌ 无 | 修改后自动跑关联测试 | 🟡 质量循环不完整 |
| Stop 门禁深度 | 仅编译 | 编译 + 测试 + 覆盖率 + 安全 | 🟡 门禁单薄 |
| SessionStart 恢复 | ❌ 无 | 自动恢复上次任务状态 | 🟡 续接体验差 |
| FileChanged 监听 | ❌ 未使用 | 配置变更响应 | 🟢 低优先级 |

---

## 4.2 优化方向

### 优先级矩阵

```
         高价值
           │
    P0     │     P1
  if预过滤  │  PreCompact 状态保持
  Context   │  async 编译
  注入      │  Stop 门禁增强
           │  SessionStart 恢复
           │
  ─────────┼─────────── 低成本 ← → 高成本
           │
    P2     │     P3
  自动测试  │  HTTP 审计服务
  格式化   │  MCP 集成
  Commit   │  prompt 自审
  校验     │  Agent loop
           │
         低价值
```

---

### P0 — 高价值、低成本（建议本周实施）

#### P0.1 `if` 条件预过滤

**问题**：当前 bash-guard 对所有 Bash 命令启动进程（每次 ~50ms），但 90%+ 的命令是安全的。

**方案**：

```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "if": "Bash(rm *)|Bash(git push*)|Bash(git reset*)|Bash(git clean*)|Bash(sudo*)|Bash(dd *)|Bash(mkfs*)|Bash(DROP *)|Bash(TRUNCATE *)",
    "command": "bash ~/.claude/hooks/ace.bash-guard.sh",
    "timeout": 5000
  }]
}
```

同理，file-guard 也可以加 if：
```json
{
  "matcher": "Edit|Write",
  "hooks": [{
    "type": "command",
    "if": "Edit(*.env*)|Write(*.env*)|Edit(*credential*)|Write(*credential*)|Edit(*.key)|Write(*.key)|Edit(*.pem)|Write(*.pem)",
    "command": "bash ~/.claude/hooks/ace.file-guard.sh",
    "timeout": 5000
  }]
}
```

**收益**：每次工具调用延迟从 ~50ms 降到 0ms（大部分场景），累积节省显著。

#### P0.2 UserPromptSubmit 上下文增强

**问题**：Claude 每轮不知道当前分支、编译状态、活跃任务，需要额外 Read/Bash 探索。

**方案**：新增 `ace.context-inject.sh`

```bash
#!/bin/bash
# ace.context-inject.sh — UserPromptSubmit Hook
# 每次 prompt 提交时注入项目状态

BRANCH=$(git branch --show-current 2>/dev/null || echo "N/A")

COMPILE_STATUS="✅"
[[ -f /tmp/.claude-java-compile-failed ]] && COMPILE_STATUS="❌ FAILED"

# 活跃任务
ACTIVE_TASK=""
if [[ -d ".tasks" ]]; then
    LATEST_STATE=$(find .tasks -name "state.md" -printf "%T@ %p\n" 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    if [[ -n "$LATEST_STATE" ]]; then
        ACTIVE_TASK=$(head -1 "$LATEST_STATE" | sed 's/^# //')
    fi
fi

# 未暂存变更数
UNSTAGED=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "[ACE Context] Branch: ${BRANCH} | Compile: ${COMPILE_STATUS} | Unstaged: ${UNSTAGED} | Task: ${ACTIVE_TASK:-none}",
    "sessionTitle": "${BRANCH}${ACTIVE_TASK:+ — $ACTIVE_TASK}"
  }
}
EOF
```

**settings.json 配置**：
```json
{
  "hooks": {
    "UserPromptSubmit": [{
      "matcher": "",
      "hooks": [{
        "type": "command",
        "command": "bash ~/.claude/hooks/ace.context-inject.sh",
        "timeout": 3000
      }]
    }]
  }
}
```

**收益**：
- Claude 每轮自动感知分支/编译/任务状态
- 自动设置 sessionTitle，resume 时可识别
- 减少不必要的 `git status` 探索

---

### P1 — 高价值、中等成本（建议两周内实施）

#### P1.1 PreCompact 状态保持

**问题**：ACE auto-goal 长任务在 context compaction 后丢失任务状态，恢复需要大量重复探索。

**方案**：新增 `ace.pre-compact.sh`

```bash
#!/bin/bash
# ace.pre-compact.sh — PreCompact Hook
# 压缩前保存关键任务状态到 additionalContext

STATE_FILES=$(find .tasks -name "state.md" 2>/dev/null | sort -t/ -k3 | tail -3)
[[ -z "$STATE_FILES" ]] && exit 0

# 构建压缩状态摘要（≤2KB）
SUMMARY=""
for f in $STATE_FILES; do
    CONTENT=$(head -20 "$f")
    SUMMARY="${SUMMARY}--- ${f} ---\n${CONTENT}\n\n"
done

# 截断到 2000 字符
SUMMARY=$(echo -e "$SUMMARY" | head -c 2000)

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": "=== ACE TASK STATE (preserved before compaction) ===\n${SUMMARY}\n=== Read state.md for full details after compaction ==="
  }
}
EOF
```

**收益**：跨 compaction 任务连续性，长任务（auto-goal）不再因压缩丢失进度。

#### P1.2 编译检查异步化

**问题**：java-compile-check 同步阻塞，大项目编译 10-30s 显著影响交互体验。

**方案**：将 java-compile-check 改为 async + asyncRewake

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "if": "Edit(*.java)|Write(*.java)",
      "command": "bash ~/.claude/hooks/ace.java-compile-check.sh",
      "async": true,
      "asyncRewake": true,
      "statusMessage": "☕ Java compiling in background..."
    },
    {
      "type": "command",
      "command": "bash ~/.claude/hooks/ace.content-guard.sh",
      "timeout": 5000
    }
  ]
}
```

**收益**：
- 编辑 Java 文件后不再阻塞对话（0ms 延迟 vs 10-30s）
- 编译失败时自动唤醒 Claude 修复（asyncRewake）
- 用户感知：状态栏显示 "☕ Java compiling in background..."

**注意**：需要修改 java-compile-check.sh 的退出码逻辑——失败改为 `exit 2`（触发 asyncRewake），成功仍为 `exit 0`。

#### P1.3 Stop 门禁增强

**问题**：当前仅检查编译状态，交付质量门禁不够全面。

**方案**：增强 ace.stop-verify.sh

```bash
#!/bin/bash
# ace.stop-verify.sh — 增强版 Stop Hook

INPUT=$(cat)
ISSUES=""

# === 1. Java 编译失败标记 ===
if [[ -f "/tmp/.claude-java-compile-failed" ]]; then
    ISSUES="${ISSUES}❌ Java 编译未通过\n"
    rm -f /tmp/.claude-java-compile-failed
fi

# === 2. 未暂存的修改（防遗漏） ===
UNSTAGED=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ')
if [[ "$UNSTAGED" -gt 5 ]]; then
    ISSUES="${ISSUES}⚠️ 有 ${UNSTAGED} 个文件未暂存（较多，请确认是否遗漏）\n"
fi

# === 3. content-guard 遗留问题检查 ===
if [[ -f "/tmp/.claude-content-issues" ]]; then
    ISSUES="${ISSUES}⚠️ 内容安全检查有遗留警告\n"
    rm -f /tmp/.claude-content-issues
fi

# === 阻断性问题 ===
if echo "$ISSUES" | grep -q "❌"; then
    echo "⛔ 交付前验证未通过:"
    echo ""
    printf "%b" "$ISSUES"
    echo "请修复以上问题后再结束任务。"
    exit 2
fi

# === 非阻断性提醒 ===
if [[ -n "$ISSUES" ]]; then
    echo "💡 交付前提醒:"
    echo ""
    printf "%b" "$ISSUES"
fi

# === 经验收集提醒 ===
if [[ -d ".tasks" ]] && [[ ! -f ".tasks/experience.md" ]]; then
    TASK_COUNT=$(find .tasks -name "*.md" 2>/dev/null | wc -l)
    if [[ "$TASK_COUNT" -gt 0 ]]; then
        echo "📝 经验提醒：本次任务有 .tasks/ 但无 experience.md。"
    fi
fi

exit 0
```

#### P1.4 SessionStart 恢复机制

**方案**：新增 `ace.session-start.sh`

```bash
#!/bin/bash
# ace.session-start.sh — SessionStart Hook
# 恢复上次会话的任务状态

SOURCE=$(jq -r '.source // "startup"' < /dev/stdin 2>/dev/null || echo "startup")

# 仅在 startup 和 resume 时执行
[[ "$SOURCE" != "startup" && "$SOURCE" != "resume" ]] && exit 0

CONTEXT=""
WATCH_PATHS="[]"

# 查找最近活跃的任务
if [[ -d ".tasks" ]]; then
    LATEST_STATE=$(find .tasks -name "state.md" -printf "%T@ %p\n" 2>/dev/null | sort -n | tail -1 | cut -d' ' -f2-)
    if [[ -n "$LATEST_STATE" ]]; then
        TASK_SUMMARY=$(head -5 "$LATEST_STATE")
        CONTEXT="[ACE Recovery] Previous task found:\n${TASK_SUMMARY}\nFull state: ${LATEST_STATE}"
        WATCH_PATHS="[\"${LATEST_STATE}\"]"
    fi
fi

# 检查编译状态
[[ -f /tmp/.claude-java-compile-failed ]] && CONTEXT="${CONTEXT}\n⚠️ Last session ended with compile failure."

if [[ -n "$CONTEXT" ]]; then
    cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "${CONTEXT}",
    "watchPaths": ${WATCH_PATHS}
  }
}
EOF
fi
exit 0
```

---

### P2 — 中等价值、探索性（建议一个月内评估）

#### P2.1 PostToolUse 自动测试触发

```json
{
  "matcher": "Edit|Write",
  "hooks": [{
    "type": "command",
    "if": "Edit(src/main/**/*.java)|Write(src/main/**/*.java)",
    "command": "bash ~/.claude/hooks/ace.auto-test.sh",
    "async": true,
    "asyncRewake": true,
    "statusMessage": "Running related tests..."
  }]
}
```

**评估要点**：
- 需要稳定的测试-源码映射逻辑
- 大项目测试耗时可能过长
- 建议先从单模块项目试点

#### P2.2 自动格式化

```json
{
  "matcher": "Edit|Write",
  "hooks": [{
    "type": "command",
    "if": "Edit(*.java)|Write(*.java)",
    "command": "bash ~/.claude/hooks/ace.java-format.sh",
    "timeout": 10000
  }]
}
```

**评估要点**：
- 需要项目已配置 google-java-format 或 spotless
- 与团队代码风格工具链对齐

#### P2.3 Commit Message 校验

```json
{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Bash",
      "hooks": [{
        "type": "command",
        "if": "Bash(git commit*)",
        "command": "bash ~/.claude/hooks/ace.commit-check.sh",
        "timeout": 3000
      }]
    }]
  }
}
```

---

### P3 — 长期方向

#### P3.1 prompt hook 做交付前自审

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{
        "type": "prompt",
        "prompt": "Review changes for SOLID violations, missing error handling, security issues. Return {decision:'allow'} or {decision:'block', reason:'...'}",
        "timeout": 30
      }]
    }]
  }
}
```

**评估要点**：每次 Stop 消耗一次 LLM 调用（token 成本），适合高价值场景。

#### P3.2 HTTP hook 团队审计

- 中心化审计：每次 Edit/Write 推送到审计服务
- Slack/飞书通知：关键操作实时告警
- 集成内部 Code Review 系统

#### P3.3 MCP tool hook 生态集成

- 结合 MOM 契约查询做 API 兼容性检查
- 结合 QConfig 查询做配置一致性验证
- 结合 DAL 工具做数据库变更安全验证

#### P3.4 Agent Loop 模式（参考 ralph-wiggum）

- 利用 Stop hook 实现自主 TDD 循环
- ACE auto-goal 可与此模式结合，实现"写代码 → 测试 → 修复 → 直到通过"

---

## 4.3 实施路线图

```
Week 1 (P0):
  ├── if 预过滤加入 bash-guard 和 file-guard
  └── 新增 ace.context-inject.sh (UserPromptSubmit)

Week 2-3 (P1):
  ├── 新增 ace.pre-compact.sh (PreCompact)
  ├── java-compile-check 改为 async + asyncRewake
  ├── 增强 ace.stop-verify.sh
  └── 新增 ace.session-start.sh (SessionStart)

Month 2 (P2):
  ├── 评估自动测试触发
  ├── 评估自动格式化
  └── 新增 commit message 校验

Quarter 2 (P3):
  ├── 探索 prompt hook 自审
  ├── HTTP hook 团队协作
  └── MCP 生态集成
```

---

## 4.4 设计原则

基于研究总结的 hooks 设计原则（ACE 适用）：

1. **确定性优于概率性** — 能用 hook 保证的，不要依赖 CLAUDE.md 提示
2. **分层响应** — exit 2（硬阻断）用于安全，exit 1（软提醒）用于质量，exit 0 + context 用于信息
3. **零开销优先** — `if` 条件预过滤让 90%+ 调用跳过进程启动
4. **异步非阻塞** — 重型检查（编译、测试）用 async + asyncRewake
5. **状态可恢复** — PreCompact + SessionStart 保证长任务连续性
6. **静默成功，喧嚣失败** — 正常流程零干扰，异常时充分反馈
7. **渐进增强** — 从 P0 开始，逐步加入更复杂的能力

---

## 4.5 关键注意事项

### Windows/Git Bash 环境

ACE 运行在 Windows + Git Bash 环境，需注意：
- 路径需要 normalize（`D:\` → `/d/`）
- `jq` 可能未安装，优先用 `grep + sed` 提取 JSON
- `find -printf` 在 MSYS2 中的兼容性
- `timeout` 命令在某些 Git Bash 版本中不可用，需用 `perl` 替代

### 性能预算

| Hook | 建议超时 | 模式 |
|------|---------|------|
| bash-guard (with if) | 5s | 同步 |
| file-guard (with if) | 5s | 同步 |
| content-guard | 5s | 同步 |
| java-compile-check | 35s | **async + asyncRewake** |
| context-inject | 3s | 同步 |
| pre-compact | 5s | 同步 |
| session-start | 3s | 同步 |
| stop-verify | 10s | 同步 |

### 安全考量

- `if` 中无法解析复杂命令时默认执行 hook（安全导向）
- Exit 1 不能阻断！安全相关必须用 exit 2
- async hook 的 stderr 作为系统提醒注入——内容需谨慎
