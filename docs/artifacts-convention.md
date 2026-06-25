# 产物目录规范

## .ace/ 目录职责

项目级 AI 辅助开发的产物汇聚点。所有 ACE skill 的输入/输出都围绕此目录组织。

## 完整目录结构

```
$PROJECT_ROOT/.ace/
├── project-profile.md        # 项目技术画像
├── experience.md             # 积累的经验
├── tasks/                    # 任务状态管理
│   └── {changeName}/
│       ├── state.json        # 机器可读状态
│       ├── context.md        # 人可读上下文
│       └── artifacts/        # 产出物
│           └── *.md
└── wiki/                     # LLM 知识库
    ├── _meta.yml             # 锚点配置
    ├── INDEX.md              # 知识地图入口
    ├── SUMMARY.md            # 核心业务流程
    └── anchors/              # 详细锚点
        └── {type}/
            └── {name}.md
```

## 各组件说明

### project-profile.md（项目技术画像）

**生成方式**：`/ace:init` 命令自动分析代码仓库生成

**内容结构**：

```markdown
# 项目技术画像
> 自动生成于 {date}，基于代码分析推断

## 系统定位
一句话：做什么、面向谁

## 架构分层
| 层 | 包路径 | 职责 |
|----|--------|------|

## 中间件使用
| 中间件 | 用法摘要 | 关键类/配置 |
|--------|---------|------------|

## 编码约定
- 命名风格
- 异常处理模式
- 日志规范
```

**更新时机**：

- 首次使用 ACE 时生成
- 项目架构发生重大变更后手动触发 `/ace:init --refresh`

**被消费方**：所有编码类 skill（auto-goal、spec-coding、spechub-coding、code-review、ut）读取此文件作为项目上下文。

### experience.md（经验积累）

**写入触发**：交付后 experience-protocol 检测到意外/踩坑/反直觉/可复用模式

**格式**：

```markdown
# 项目经验

## E1: {简述}
- **场景**：{触发场景}
- **发现**：{核心发现}
- **启示**：{可复用的认知}
- **日期**：{YYYY-MM-DD}

## E2: ...
```

**归属**：经验属于项目而非会话。不同会话的经验累积在同一文件。

**消费方式**：skill 恢复中断任务时会读取 experience.md，避免重复踩坑。

### tasks/{changeName}/（任务状态管理）

**changeName 命名规范**：

- kebab-case，2-4 英文单词
- 描述任务语义，如 `add-user-auth`、`fix-order-status`、`docs-redesign`
- 新目标 = 新目录，不复用

**state.json 结构**：

```jsonc
{
  "name": "{changeName}",
  "type": "goal",                    // goal | spec | analysis | review
  "status": "in-progress",           // pending | in-progress | completed
  "created_at": "2026-06-12T10:00:00",
  "updated_at": "2026-06-12T14:30:00",
  "completion_criteria": [
    "可测试的完成条件 1",
    "可测试的完成条件 2"
  ],
  "tasks": [
    {"id": "T1", "title": "...", "status": "done", "parallel": true},
    {"id": "T2", "title": "...", "status": "in-progress", "depends": ["T1"]}
  ]
}
```

**4 种任务类型**：

| 类型 | 场景 | 扩展字段 |
|------|------|---------|
| goal | auto-goal 开放式目标 | phase, decisions |
| spec | spec-coding 规范化编码 | phase, openspec_change, timestamps, approvals |
| analysis | requirement-analysis 需求分析 | skill, scope |
| review | code-review 代码审查 | target, findings_count |

**context.md 模板**：

```markdown
# {任务标题}

## 目标
{一句话目标描述}

## 过程记录

### 决策
- **D1**: {决策内容} — 理由: {why}，备选: {alternatives}

### 中间结论
- {发现 1}
- {发现 2}

### 风险
- {风险}: {缓解方案}

## 已修改文件
- {path}: {变更说明}
```

**设计目标**：新 agent 读完 state.json + context.md 后能以 80% 效率继续当前任务。

### wiki/（LLM 知识库）

**生成方式**：`/ace:llm-wiki-generator` 自动扫描仓库生成

**_meta.yml**：

```yaml
type: backend          # backend | frontend
version: 1
generated_at: 2026-06-12
```

**INDEX.md**：知识地图入口，包含项目描述 + 锚点目录

**SUMMARY.md**：核心业务流程与模型的概览

**anchors/{type}/{name}.md**：

- 锚点类型：api / component / job / mq / page
- 每个锚点描述一个独立的功能单元

**消费方式**：`/ace:llm-wiki-reader` 按三层策略渐进式加载：

1. SUMMARY（快速概览，最少 token）
2. INDEX（定位目标锚点）
3. anchors（按需加载详情）

## 使用规则

1. **路径硬规则**：所有 Write/Edit 使用 `$PROJECT_ROOT` 绝对前缀，禁止 `~`、`$HOME`、裸相对路径
2. **创建时机**：对齐确认通过后的第一个动作就是创建 tasks/{changeName}/
3. **更新频率**：每次 TaskUpdate 变更状态后同步更新 state.json
4. **不可复用**：新目标 = 新目录，不复用上一个任务的目录
5. **并行标注**：tasks 数组中用 `"parallel": true` 和 `"depends"` 标记依赖关系
