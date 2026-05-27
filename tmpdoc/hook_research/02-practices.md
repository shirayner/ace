# 二、业界最佳实践案例

## 案例 1: security-guidance（Anthropic 官方插件）

**⭐⭐⭐⭐⭐ | 来源**: [anthropics/claude-code/plugins/security-guidance](https://github.com/anthropics/claude-code/tree/main/plugins/security-guidance)

### 模式：三层安全审查流水线

```
Layer 1: PostToolUse[Edit|Write] → Pattern 扫描 → 即时警告
Layer 2: PostToolUse[Bash(git commit*)] → LLM Diff Review → 异步唤醒
Layer 3: Stop → 最终安全审查 → 阻断交付
```

### 配置

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/sg-python.sh\" ensure_agent_sdk",
          "timeout": 180
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/sg-python.sh\" security_reminder_hook"
        }]
      },
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "if": "Bash(git commit*)",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/sg-python.sh\" security_reminder_hook",
          "async": true,
          "asyncRewake": true,
          "statusMessage": "Background security review of commit..."
        }]
      }
    ],
    "Stop": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/sg-python.sh\" security_reminder_hook",
          "async": true,
          "asyncRewake": true,
          "statusMessage": "Background security review found issues."
        }]
      }
    ]
  }
}
```

### 覆盖的安全规则（25 种 pattern）

- 命令注入（GitHub Actions workflow injection）
- XSS（innerHTML, dangerouslySetInnerHTML）
- 不安全反序列化（pickle, torch.load, yaml.load）
- 硬编码密钥
- SSRF / Path Traversal
- TLS 验证绕过
- SQL 注入
- ...

### 价值评估

- 三层防护层层递进，从即时警告到最终门禁
- `async: true` + `asyncRewake: true` 实现非阻塞异步审查
- 是 hooks 架构的**标杆实现**

---

## 案例 2: karanb192/claude-code-hooks

**⭐⭐⭐⭐ | 来源**: [github.com/karanb192/claude-code-hooks](https://github.com/karanb192/claude-code-hooks) (402⭐)

### 模式：分级命令拦截 + 自动 Git 暂存

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "node ~/.claude/hooks/block-dangerous-commands.js"
        }]
      },
      {
        "matcher": "Bash|Edit|Write|Read",
        "hooks": [{
          "type": "command",
          "command": "node ~/.claude/hooks/protect-secrets.js"
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{
          "type": "command",
          "command": "node ~/.claude/hooks/auto-stage.js"
        }]
      }
    ]
  }
}
```

### 核心实现

```javascript
#!/usr/bin/env node
const input = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8'));
const command = input.tool_input.command;

const DANGEROUS_PATTERNS = [
  /rm\s+-rf\s+[\/~]/,
  /:\(\)\{.*\|.*&\s*\};:/,     // fork bombs
  /curl.*\|\s*(ba)?sh/,         // curl pipe to shell
  />\s*\/dev\/sd[a-z]/,
  /mkfs\./,
  /dd\s+if=.*of=\/dev/,
];

const SAFETY_LEVEL = 'high'; // critical | high | strict

if (isDangerous(command, SAFETY_LEVEL)) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Blocked: ${matchedPattern}`
    }
  }));
}
```

### 价值评估

- 三级安全等级灵活适配
- 跨工具 secrets 保护（Bash/Edit/Write/Read 全覆盖）
- `auto-stage` PostToolUse 减少手动 git add

---

## 案例 3: ralph-wiggum（Anthropic 官方插件）

**⭐⭐⭐⭐⭐ | 来源**: [anthropics/claude-code/plugins/ralph-wiggum](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)

### 模式：Stop hook 实现自主迭代循环（Agent Loop）

```
Claude 完成一轮 → Stop hook 检查 completion promise
  ├── 未匹配完成信号 → 阻断停止，重新注入 prompt → 下一轮
  └── 匹配完成信号 → 允许退出
```

### 使用方式

```bash
/ralph-loop "Build a REST API for todos.
Requirements: CRUD operations, input validation, tests.
Output <promise>COMPLETE</promise> when done." \
--completion-promise "COMPLETE" --max-iterations 50
```

### 关键设计

- `--completion-promise`: 精确字符串匹配作为退出信号
- `--max-iterations`: 安全阀防止无限循环
- 文件系统作为跨迭代状态传递媒介
- 每次迭代可自动 commit（方便回退）

### 价值评估

- 创造性利用 Stop hook 实现 agent loop
- 突破单次对话限制，适合 TDD 循环、复杂重构
- ACE 的 auto-goal 可参考此模式增强持久性

---

## 案例 4: Continuous-Claude-v3

**⭐⭐⭐⭐⭐ | 来源**: [github.com/parcadei/continuous-claude-v3](https://github.com/parcadei/continuous-claude-v3) (3.8k⭐)

### 模式：30 个 Hook 构建完整上下文连续性

| 事件 | Hook | 功能 |
|------|------|------|
| SessionStart | session-start-continuity | 恢复 ledger 和 memory recall |
| PreToolUse | tldr-read-enforcer | 返回代码摘要而非完整文件（**省 95% token**） |
| PreToolUse | smart-search-router | 结构化搜索时路由到 AST-grep |
| PostToolUse | post-edit-diagnostics | 代码修改后自动跑 pyright/ruff |
| PreCompact | pre-compact-continuity | **压缩前自动保存状态到 handoff 文档** |
| UserPromptSubmit | memory-awareness | 注入相关历史学习成果 |
| SessionEnd | session-outcome | 守护进程提取 thinking blocks 到归档记忆 |

### 核心创新

1. **PreCompact + SessionStart 状态保持**：解决 context window 耗尽后丢失状态的根本问题
2. **tldr-read-enforcer**：用 Hook 拦截 Read 操作，返回 AST 摘要替代全文（token 节省 95%+）
3. **守护进程模式**：SessionEnd 触发后台进程做"事后反思"

### 价值评估

- 解决 Claude Code 最大痛点：长对话状态丢失
- PreCompact hook 是**被低估的关键能力**
- 对 ACE 的启示最直接

---

## 案例 5: context-mode

**⭐⭐⭐⭐ | 来源**: [github.com/mksglu/context-mode](https://github.com/mksglu/context-mode) (15.8k⭐)

### 模式：5 个核心 Hook 实现优先级状态管理

```
SessionStart     → 恢复工作状态
PreToolUse       → 强制沙箱路由 + deny 规则
PostToolUse      → 捕获结构化事件（文件修改、git 操作、错误）
PreCompact       → 构建优先级 XML 快照（≤2KB）
UserPromptSubmit → 记录用户决策和偏好
```

### 核心设计

- PreCompact 输出 ≤2KB 的优先级快照（不是全量状态）
- 事件分类：modification / git_action / error / decision
- 极简但有效的连续性方案

### 价值评估

- 15.8k⭐ 证明社区对上下文连续性的强需求
- "5 个 hook 够用"的极简主义值得参考
- 与 ACE 的渐进式理念契合

---

## 案例 6: PostToolUse 自动格式化（社区通用模式）

**⭐⭐⭐⭐ | 来源**: 官方文档 + 多个社区项目

### 配置

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{
          "type": "command",
          "command": "bash format-on-save.sh"
        }]
      }
    ]
  }
}
```

### format-on-save.sh

```bash
#!/bin/bash
FILE_PATH=$(jq -r '.tool_input.file_path' < /dev/stdin)

case "$FILE_PATH" in
  *.py)   ruff check --fix "$FILE_PATH" 2>/dev/null; black "$FILE_PATH" 2>/dev/null ;;
  *.java) google-java-format -i "$FILE_PATH" 2>/dev/null ;;
  *.ts|*.tsx) npx prettier --write "$FILE_PATH" 2>/dev/null ;;
  *.go)   gofmt -w "$FILE_PATH" 2>/dev/null ;;
esac

exit 0  # 非阻塞
```

### 价值评估

- 确定性保证（vs CLAUDE.md 写"请运行 lint"的概率性遵守）
- `exit 0` 策略确保格式化失败不阻断
- 可组合：格式化 → lint fix → import sort

---

## 案例 7: UserPromptSubmit 上下文增强

**⭐⭐⭐⭐ | 来源**: 官方文档

### 配置

```bash
#!/bin/bash
# inject-context.sh
BRANCH=$(git branch --show-current 2>/dev/null)
CHANGES=$(git diff --stat 2>/dev/null | tail -1)
TODO_COUNT=$(grep -r "TODO" src/ 2>/dev/null | wc -l)

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "Branch: ${BRANCH}\nPending: ${CHANGES}\nTODOs: ${TODO_COUNT}",
    "sessionTitle": "Working on ${BRANCH}"
  }
}
EOF
```

### 价值评估

- 自动设置 session title（resume 时识别）
- 每次 prompt 提供项目状态，减少 Claude 重复探索
- 可扩展：CI 状态、最近 commit、编译状态

---

## 案例 8: FileChanged + direnv 集成

**⭐⭐⭐ | 来源**: 官方文档

### 配置

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup",
      "hooks": [{
        "type": "command",
        "command": "echo '{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"watchPaths\":[\".envrc\",\".env\"]}}'"
      }]
    }],
    "FileChanged": [{
      "matcher": ".envrc|.env",
      "hooks": [{
        "type": "command",
        "command": "direnv export json | jq '{hookSpecificOutput:{hookEventName:\"FileChanged\",additionalContext:(\"Env updated: \" + (keys | join(\", \")))}}'"
      }]
    }]
  }
}
```

### 价值评估

- FileChanged 是较新的响应式能力
- watchPaths 在 SessionStart 注册，避免不必要监听
- 适合环境变量、配置文件的热更新场景

---

## 模式总结

| 模式 | 核心事件 | 典型用途 | 代表项目 |
|------|----------|----------|----------|
| **拦截/阻断** | PreToolUse | 危险命令阻断、secrets 保护 | karanb192/claude-code-hooks |
| **多层安全** | PostToolUse + Stop | Pattern → LLM → 最终审查 | security-guidance |
| **自动修复** | PostToolUse | lint fix、format、auto-stage | 社区通用模式 |
| **上下文注入** | SessionStart / UserPromptSubmit | 分支信息、历史记忆、行为指令 | context-mode |
| **状态保持** | PreCompact + SessionStart | 跨 compaction 连续性 | continuous-claude-v3 |
| **自主迭代** | Stop | Agent loop、TDD 循环 | ralph-wiggum |
| **响应式** | FileChanged + CwdChanged | 配置热更新、环境切换 | 官方示例 |
