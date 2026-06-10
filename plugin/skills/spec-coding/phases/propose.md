# Phase 2: Propose（创建提案）

**目的**：通过 OpenSpec CLI 创建变更，按 CLI 提供的写作指令生成提案和 delta spec。

---

## 执行逻辑

### 1. 创建 change（OpenSpec CLI）

```bash
openspec new change {change-name}
# 可用选项：--description, --schema, --goal
```

→ 自动创建 `openspec/changes/{name}/` 目录结构
→ 自动创建 `.openspec.yaml`（工件图状态）

### 2. 获取 proposal 写作指令

```bash
openspec instructions proposal --change {name} --json
```

返回四层分离的富化指令：
- `template`: 文件结构模板（AI 要产出的格式）
- `instruction`: 写作指导（如何写，不出现在输出中）
- `context`: 项目上下文（来自 config.yaml）
- `rules`: 约束规则（来自 config.yaml 的 rules.proposal）

**AI 基于指令编写 proposal.md → 写入 change 目录。**

### 3. 获取 delta spec 写作指令

```bash
openspec instructions specs --change {name} --json
```

返回同样四层分离的富化指令。

**AI 基于指令编写 delta spec → 写入 `specs/{domain}/spec.md`。**

#### Delta Spec 格式要求（OpenSpec 解析器强制）

- 操作分区 header：`## ADDED / MODIFIED / REMOVED / RENAMED Requirements`
- Requirement 标题：`### Requirement: {Name}`
- 正文必须含 `SHALL` 或 `MUST`（RFC 2119 关键词）
- Scenario 标题：`#### Scenario: {Name}`（必须 4 个 #）
- Scenario 内容必须含 `WHEN` 和 `THEN`

#### 示例

```markdown
## ADDED Requirements

### Requirement: Avatar Upload
The system SHALL accept image uploads in JPEG, PNG, and WebP formats.
The system SHALL reject files exceeding 5MB.

#### Scenario: Successful upload
- **GIVEN** a user with a valid session
- **WHEN** the user uploads a 2MB JPEG file
- **THEN** the system stores the image
- **AND** returns a public URL

#### Scenario: File too large
- **GIVEN** a user with a valid session
- **WHEN** the user uploads a 6MB file
- **THEN** the system rejects with HTTP 413
- **AND** returns an error message
```

### 4. 格式验证

```bash
openspec validate --json
```

- JSON 返回 `{items: [{id, type, valid, issues}], summary: {totals}}`
- `valid=true` → 继续
- `valid=false` → 读取 issues → 自动修复 → 重新验证
- 3 次仍失败 → AskUserQuestion 报告问题

### 5. 初始化 .ace-state.json

写入 change 目录，记录初始状态：
```json
{
  "change_name": "{name}",
  "created_at": "{date}",
  "workflow": "{分级结果}",
  "phase": "propose"
}
```

### 6. 事件 `proposed` → Phase 3

---

## OpenSpec CLI 完整调用序列

```bash
openspec new change {name}                                    # 1. 创建目录
openspec instructions proposal --change {name} --json         # 2. proposal 指令
  → AI 写 proposal.md
openspec instructions specs --change {name} --json            # 3. specs 指令
  → AI 写 specs/{domain}/spec.md
openspec validate --json                                      # 4. 格式验证
```

---

## 关键区分

| 文件 | 管理者 | 职责 |
|------|--------|------|
| `.openspec.yaml` | OpenSpec CLI | 工件图状态、spec 版本 |
| `.ace-state.json` | spec-coding | 工作流阶段、执行模式、恢复点 |

两文件共存于同一 change 目录，各自独立演进。
