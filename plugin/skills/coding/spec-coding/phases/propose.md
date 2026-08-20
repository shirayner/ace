# Phase 2: Propose（创建提案）

**目的**：基于已确定的需求，按 OpenSpec CLI 写作指令生成提案和 delta spec。

**前提**：Phase 1 已完成以下操作：
- `openspec new change {changeName}` 已执行（目录已存在）
- `.ace/tasks/{changeName}/state.json` 已创建（spec.phase=propose）
- `artifacts/issues/requirement-issues.md` 已持久化

---

## 执行逻辑

### 1. 确认工作目录

```
$TASK_DIR = $PROJECT_ROOT/.ace/tasks/{changeName}/
$CHANGE_DIR = $PROJECT_ROOT/openspec/changes/{changeName}/
验证：$TASK_DIR/state.json 存在且 spec.phase == "propose"
```

### 2. 获取 proposal 写作指令

```bash
openspec instructions proposal --change {changeName} --json
```

返回四层分离的富化指令：
- `template`: 文件结构模板（AI 要产出的格式）
- `instruction`: 写作指导（如何写，不出现在输出中）
- `context`: 项目上下文（来自 config.yaml）
- `rules`: 约束规则（来自 config.yaml 的 rules.proposal）

**AI 基于指令编写 proposal.md → 写入 $CHANGE_DIR。**

### 3. 获取 delta spec 写作指令

```bash
openspec instructions specs --change {changeName} --json
```

返回同样四层分离的富化指令。

**AI 基于指令编写 delta spec → 写入 `$CHANGE_DIR/specs/{domain}/spec.md`。**

#### Delta Spec 格式要求（OpenSpec 解析器强制）

- 操作分区 header：`## ADDED / MODIFIED / REMOVED / RENAMED Requirements`
- Requirement 标题：`### Requirement: {Name}`
- 正文必须含 `SHALL` 或 `MUST`（RFC 2119 关键词）
- Scenario 标题：`#### Scenario: {Name}`（必须 4 个 #）
- Scenario 内容必须含 `WHEN` 和 `THEN`

#### 示例

```markdown
## ADDED Requirements

### Requirement: 头像上传
系统 SHALL 接受 JPEG、PNG 和 WebP 格式的图片上传。
系统 SHALL 拒绝超过 5MB 的文件。

#### Scenario: 上传成功
- **GIVEN** 一个拥有有效会话的用户
- **WHEN** 用户上传一个 2MB 的 JPEG 文件
- **THEN** 系统存储该图片
- **AND** 返回一个公开 URL

#### Scenario: 文件过大
- **GIVEN** 一个拥有有效会话的用户
- **WHEN** 用户上传一个 6MB 的文件
- **THEN** 系统以 HTTP 413 拒绝
- **AND** 返回错误信息
```

**语言规则**：delta spec 使用中文编写，仅 RFC 2119 关键词（SHALL、MUST、WHEN、THEN、GIVEN、AND）保持英文大写。

### 4. 格式验证

```bash
openspec validate --json
```

- JSON 返回 `{items: [{id, type, valid, issues}], summary: {totals}}`
- `valid=true` → 继续
- `valid=false` → 读取 issues → 自动修复 → 重新验证
- 3 次仍失败 → AskUserQuestion 报告问题

### 5. 更新状态文件

```
Edit $TASK_DIR/state.json:
  "spec.phase": "design",
  "spec.timestamps.design_started": "{ISO时间}",
  "updated_at": "{ISO时间}"
```

### 6. 事件 `proposed` → Phase 3

---

## 关键区分

| 文件 | 位置 | 管理者 | 职责 |
|------|------|--------|------|
| `.openspec.yaml` | `openspec/changes/{changeName}/` | OpenSpec CLI | 工件图状态、spec 版本 |
| `state.json` | `.ace/tasks/{changeName}/` | spec-coding | 工作流阶段、执行模式、恢复点 |

两文件位于不同目录，各自独立演进。通过 `state.json` 的 `spec.openspec_change` 字段关联。
