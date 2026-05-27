# 一、Hooks 机制全貌

## 1.1 定义与定位

Claude Code Hooks 是一套**生命周期钩子系统**，本质是**可编程拦截器层**——位于 Claude 模型决策与实际执行之间的确定性自动化机制。

与 CLAUDE.md 指令（概率性遵守）的本质区别：

| 维度 | CLAUDE.md | Hooks |
|------|-----------|-------|
| 执行保证 | 概率性（AI 可能遗忘） | **100% 确定性** |
| 能力范围 | 影响 AI 行为倾向 | 拦截/修改/阻断实际操作 |
| 反馈方式 | 无 | exit code + JSON 协议 |
| 性能开销 | 0（prompt 级） | 进程启动开销（可用 `if` 优化为 0） |

架构位置：

```
Claude 模型决策 → [Hooks 拦截层] → [Permission Rules] → [Sandbox] → 实际执行
                       ↑                                        ↓
                  可修改输入                              PostToolUse 回注
                  可阻断操作                              上下文注入
                  可注入上下文
```

---

## 1.2 事件类型体系（28 种）

### 会话生命周期

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `SessionStart` | 会话开始/恢复/清空/压缩 | ❌ | `startup\|resume\|clear\|compact` | 环境初始化、watchPaths 注册、状态恢复 |
| `Setup` | `--init-only` 或维护模式 | ❌ | `init\|maintenance` | 初始化配置 |
| `SessionEnd` | 会话终止 | ❌ | 结束原因 | 归档、清理 |

### 用户输入

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `UserPromptSubmit` | 用户提交 prompt | ✅ | 无 | 上下文注入、prompt 增强、sessionTitle |
| `UserPromptExpansion` | 斜杠命令展开 | ✅ | 命令名 | 命令拦截/修改 |

### 工具执行（最重要）

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `PreToolUse` | 工具执行前 | ✅ | 工具名 | 权限决策、输入修改、条件阻断 |
| `PostToolUse` | 工具执行成功后 | ✅ | 工具名 | 格式化、诊断、上下文注入 |
| `PostToolUseFailure` | 工具执行失败后 | ❌ | 工具名 | 错误分析、恢复建议 |
| `PostToolBatch` | 并行工具批次完成 | ✅ | 无 | 批量一致性检查 |

### 权限系统

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `PermissionRequest` | 权限对话框出现 | ✅ | 工具名 | 自动审批、升级/降级决策 |
| `PermissionDenied` | auto-mode 拒绝工具 | ❌ | 工具名 | 审计记录 |

### 任务管理

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `TaskCreated` | 任务创建 | ✅ | 无 | 任务验证门禁 |
| `TaskCompleted` | 任务标记完成 | ✅ | 无 | 完成条件验证 |

### 子代理

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `SubagentStart` | 子代理启动 | ❌ | agent 类型 | 代理监控 |
| `SubagentStop` | 子代理结束 | ✅ | agent 类型 | 结果验证 |

### 上下文管理

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `PreCompact` | context 压缩前 | ✅ | `manual\|auto` | **状态抢救**、记忆保存 |
| `PostCompact` | context 压缩后 | ❌ | `manual\|auto` | 状态确认 |
| `InstructionsLoaded` | CLAUDE.md 加载 | ❌ | 加载原因 | 指令审计 |

### 终止控制

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `Stop` | Claude 完成响应 | ✅ | 无 | **交付门禁**、自主迭代、强制继续 |
| `StopFailure` | 回合因 API 错误结束 | ❌ | 错误类型 | 错误处理 |

### 文件/配置/环境

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `FileChanged` | 被监视文件变更 | ❌ | 文件名模式 | 响应式更新 |
| `CwdChanged` | 工作目录变更 | ❌ | 无 | 环境切换 |
| `ConfigChange` | 配置文件变更 | ✅ | 配置来源 | 配置验证 |

### Worktree

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `WorktreeCreate` | Worktree 创建 | ✅ | 无 | 隔离环境初始化 |
| `WorktreeRemove` | Worktree 移除 | ❌ | 无 | 清理 |

### MCP 交互

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `Elicitation` | MCP 服务器请求用户输入 | ✅ | MCP 服务器名 | 自动响应 |
| `ElicitationResult` | 用户响应 MCP elicitation | ✅ | MCP 服务器名 | 响应修改 |

### 团队协作

| 事件 | 触发时机 | 可阻断 | Matcher | 核心能力 |
|------|----------|--------|---------|----------|
| `TeammateIdle` | Agent team 成员空闲 | ✅ | 无 | 任务分配 |

---

## 1.3 配置格式

### 配置文件层级与优先级

```
Managed Policy          → 企业级（最高优先级，覆盖一切）
CLI 参数                → 命令行临时覆盖
.claude/settings.local.json → 项目本地（gitignored）
.claude/settings.json   → 项目级（可提交到 git）
~/.claude/settings.json → 用户级（所有项目生效）
Plugin hooks.json       → 插件级（启用时生效）
```

### 基本配置结构

```json
{
  "hooks": {
    "EVENT_NAME": [
      {
        "matcher": "FILTER_VALUE",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/script.sh",
            "args": [],
            "timeout": 600,
            "statusMessage": "Running validation...",
            "if": "Bash(rm *)",
            "once": false,
            "async": false,
            "asyncRewake": false,
            "shell": "bash"
          }
        ]
      }
    ]
  }
}
```

### 五种 Handler 类型

#### ① Command（最常用）

```json
{
  "type": "command",
  "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/validate.sh",
  "args": [],
  "timeout": 5
}
```

#### ② HTTP（团队服务化）

```json
{
  "type": "http",
  "url": "http://localhost:8080/hooks/pre-tool-use",
  "headers": { "Authorization": "Bearer $MY_TOKEN" },
  "allowedEnvVars": ["MY_TOKEN"],
  "timeout": 30
}
```

#### ③ MCP Tool（借力生态）

```json
{
  "type": "mcp_tool",
  "server": "my_server",
  "tool": "security_scan",
  "input": { "file_path": "${tool_input.file_path}" },
  "timeout": 120
}
```

#### ④ Prompt（LLM 判断）

```json
{
  "type": "prompt",
  "prompt": "Review this operation for security issues. Return allow or block.",
  "model": "claude-3-5-sonnet-20241022",
  "timeout": 30
}
```

#### ⑤ Agent（实验性，最重型）

```json
{
  "type": "agent",
  "prompt": "Verify this operation using Read, Grep, Glob tools. Return yes/no.",
  "timeout": 60
}
```

### Matcher 匹配规则

| Matcher 值 | 解释 | 示例 |
|------------|------|------|
| `"*"` / `""` / 省略 | 匹配所有 | 对每次触发都执行 |
| 仅含字母/数字/`_`/`\|` | 精确匹配或管道分隔列表 | `"Bash"`, `"Edit\|Write"` |
| 含其他字符 | JavaScript 正则 | `"^Notebook"`, `"mcp__memory__.*"` |

### `if` 字段 — 性能级条件预过滤

```json
{
  "matcher": "Bash",
  "hooks": [{
    "type": "command",
    "if": "Bash(git push *)|Bash(rm *)",
    "command": "./hooks/check-dangerous.sh"
  }]
}
```

关键特性：
- **仅对工具事件有效**（PreToolUse, PostToolUse, PermissionRequest）
- 条件不满足时 **不启动进程**（零开销）
- 使用权限规则语法：`Bash(rm *)`, `Edit(*.ts)`, `Write(src/**)`
- 对 Bash 命令会剥离 `VAR=value` 前缀再匹配
- 无法解析复杂命令时**默认执行**（安全导向）

---

## 1.4 输出协议

### Exit Code 语义

| Exit Code | 含义 | 行为 |
|-----------|------|------|
| **0** | 成功 | 解析 stdout 中的 JSON |
| **2** | 阻断错误 | 忽略 stdout，stderr 反馈给 Claude |
| **其他** | 非阻断错误 | 继续执行，stderr 记录到日志 |

> ⚠️ **关键安全点**：只有 `exit 2` 能真正阻断。`exit 1` 是非阻断的！

### JSON 输出结构（exit 0 时）

```json
{
  "continue": true,
  "stopReason": "Optional message",
  "suppressOutput": false,
  "systemMessage": "Warning shown to user",
  "decision": "block",
  "reason": "Why blocked",
  "hookSpecificOutput": {
    "hookEventName": "EventName",
    "additionalContext": "Context injected to Claude",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "Reason",
    "updatedToolInput": { "command": "modified command" },
    "retry": true,
    "initialUserMessage": "First message",
    "watchPaths": ["/path/to/watch"],
    "sessionTitle": "Session title"
  }
}
```

### PreToolUse 决策模式

四种权限决策：
- **`allow`** — 直接放行（跳过后续权限检查）
- **`deny`** — 阻断工具调用
- **`ask`** — 升级为用户确认对话框
- **`defer`** — 跳过本 hook，交给默认权限流程

输入修改（允许执行但改参数）：
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedToolInput": { "command": "npm test -- --dry-run" }
  }
}
```

### Stop 决策模式

```json
{
  "decision": "block",
  "reason": "Task not complete, tests still failing"
}
```

### 完整实战示例

```bash
#!/bin/bash
# PreToolUse hook: 分级命令检查
COMMAND=$(jq -r '.tool_input.command' < /dev/stdin)

if echo "$COMMAND" | grep -qE 'rm\s+-rf\s+[/~]'; then
  # 硬阻断
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Destructive rm -rf blocked by policy"
    }
  }'
elif echo "$COMMAND" | grep -qE 'DROP TABLE|TRUNCATE'; then
  # 升级为用户确认
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: "Database DDL requires human confirmation"
    }
  }'
fi
exit 0
```

---

## 1.5 安全模型

### 权限集成架构（从上到下优先级递减）

```
┌────────────────────────────────────────────────────────────┐
│ Managed Policy（企业管控 — 最高优先级）                       │
│ allowManagedHooksOnly / allowManagedPermissionRulesOnly     │
├────────────────────────────────────────────────────────────┤
│ Permission Rules（deny > ask > allow）                      │
│ deny: ["Bash(curl *)"]  →  硬拦截                           │
│ ask:  ["Bash(git push *)"]  →  弹确认                       │
│ allow: ["Bash(npm run *)"]  →  直接放行                     │
├────────────────────────────────────────────────────────────┤
│ Hook Layer（程序化权限决策）                                  │
│ PreToolUse → permissionDecision: allow/deny/ask/defer       │
│ PermissionRequest → behavior: allow/deny + addPermissionRule│
├────────────────────────────────────────────────────────────┤
│ Auto Mode Classifier（内置安全分类器）                        │
│ soft_deny / hard_deny                                       │
├────────────────────────────────────────────────────────────┤
│ Sandbox（最底层 — 文件系统隔离 / 网络白名单）                 │
└────────────────────────────────────────────────────────────┘
```

### 企业管控设置

| 设置 | 作用 |
|------|------|
| `allowManagedHooksOnly` | 只允许管理员配置的 hooks |
| `disableAllHooks` | 禁用所有 hooks |
| `allowManagedPermissionRulesOnly` | 禁止用户/项目定义 allow/deny |
| `strictPluginOnlyCustomization` | 阻止用户级 skills/hooks/agents |

---

## 1.6 能力边界与限制

### 不能做的事

| 限制 | 原因 |
|------|------|
| 无法访问 `/dev/tty` | 无控制终端 |
| 无法发送任意终端转义序列 | 仅白名单 OSC 序列 |
| 约一半事件不可阻断 | 设计决策（如 SessionStart, Notification） |
| 输出限制 10,000 字符 | 超出截断 |
| Exit 1 不能阻断 | 只有 exit 2 有阻断语义 |
| 无法修改已完成的工具结果 | PostToolUse 只能追加 context |

### 超时限制

| 场景 | 默认超时 |
|------|---------|
| command/http/mcp_tool | 600s |
| UserPromptSubmit | 30s |
| prompt hooks | 30s |
| agent hooks | 60s |

### 异步模式

| 模式 | 行为 |
|------|------|
| `async: true` | 后台执行，不阻塞，不影响决策（火后忘） |
| `asyncRewake: true` | 后台执行，exit 2 时唤醒 Claude（stderr 注入为系统提醒） |

### 去重机制

- Command hooks 按 `command` + `args` 去重
- HTTP hooks 按 URL 去重
- 匹配的所有 hooks **并行执行**

### Windows 特殊限制

- `.cmd`/`.bat` 不能用 exec form 直接运行
- 需用 `"command": "node", "args": ["script.js"]` 形式
- 默认 Git Bash，可通过 `"shell": "powershell"` 切换
