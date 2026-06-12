# Skill 开发指南

## Skill 目录结构

```
skills/{skill-name}/
├── SKILL.md              # 入口定义（必须）
├── phases/               # 多阶段流程定义（可选）
│   └── {phase-name}.md
├── references/           # 参考知识（可选）
│   └── *.md
├── templates/            # 输出模板（可选）
│   └── *.md
├── rules/                # skill 级规则（可选）
│   └── *.md
├── knowledge/            # 领域知识（可选）
│   └── *.md
├── prompts/              # 子代理 prompt（可选）
│   └── *.md
├── agents/               # 评估代理（可选）
│   └── *.md
└── scripts/              # 工具脚本（可选）
    └── *.sh|*.py
```

## SKILL.md 编写规范

### Frontmatter（YAML 头）

```yaml
---
name: skill-name
description: |
  简要描述 skill 的定位和用途。

  触发场景：
  - 场景 1
  - 场景 2

  DO NOT TRIGGER: 不应触发的场景 → 建议替代
---
```

**Frontmatter 要点**：

- `name`：与目录名一致，kebab-case
- `description`：包含触发场景和反触发说明，让 Claude Code 正确路由
- 触发场景写人话（自然语言匹配）
- DO NOT TRIGGER 防止误触发

### 正文结构

```markdown
# {Skill 名称} — 一句话定位

## 定位
2-3 句描述 skill 的本质职责

## 硬规则（Hard Gate）
<HARD-GATE>
不可跳过的强制要求（如对齐门禁、验证门禁）
</HARD-GATE>

## 执行流程
阶段化描述 skill 的工作步骤

## 参考文件索引
| 文件 | 何时加载 |
|------|---------|
| `../../shared/xxx.md` | 条件 |
```

### 设计原则

- **懒加载**：不在 SKILL.md 中内联大量知识，通过 `Read` 引用 shared/ 和 references/
- **单一职责**：一个 skill 做一件事
- **可组合**：skill 间通过协议层解耦
- **可恢复**：写入 state.json 确保中断后能恢复

## 接入共享协议

### 接入 understanding-protocol

在 skill 的首阶段执行：

```
Read `../../shared/understanding-protocol.md`
  verify = none | artifact-grounding | code-impact
  threshold = {insight≥N, assumptions≥M, defeater=mandatory}
→ 产出 understanding_result
```

### 接入 alignment-protocol

紧随 understanding 之后：

```
Read `../../shared/alignment-protocol.md`
→ 执行 Step 1-3
→ 获得用户确认后才能继续
```

### 接入 verification-protocol

在标记任务完成前：

```
Read `../../shared/verification-protocol.md`
→ 执行 Gate Function 5 步
→ 有新鲜证据才能声称通过
```

### 接入 experience-protocol

在交付后（最后一步）：

```
Read `../../shared/experience-protocol.md`
→ 检查触发条件（意外/踩坑/反直觉/可复用模式）
→ 满足条件时写入 .ace/experience.md
→ 一行式告知用户
```

### 接入 parallel-protocol

在识别到并行机会时：

```
Read `../../shared/parallel-protocol.md`
→ 执行依赖测试
→ 满足条件时并行 Agent
```

## phases/ 组织

当 skill 有多个明确阶段时：

- 每个阶段独立文件：`phases/{phase-name}.md`
- SKILL.md 中定义状态机和阶段转换条件
- 每个 phase 文件被 skill 在对应阶段 `Read` 加载

## references/ vs knowledge/ vs templates/

| 目录 | 用途 | 加载时机 |
|------|------|---------|
| references/ | 执行参考（指南、schema、恢复流程） | 按需 Read |
| knowledge/ | 领域知识库（维度定义、技术参考） | 分析阶段 |
| templates/ | 输出格式模板 | 生成产出时 |
| rules/ | skill 级规则 | 始终激活或按条件 |
| prompts/ | 子代理 prompt | 派遣子代理时 |
| agents/ | 独立评估代理 | 评估/评分时 |

## 使用 /ace:skill-creator 创建

推荐流程：

1. 描述需求："/ace:skill-creator 我需要一个做 X 的 skill"
2. 自动分析 → 生成 Draft
3. Eval 循环：独立评估代理评分 → 改进
4. Description 优化：确保触发场景准确

## 使用 /ace:skill-optimize 优化

当已有 skill 效果不佳时：

1. "/ace:skill-optimize {skill-name}"
2. 7 条优化原则（认知科学/信息论/控制论）自动分析
3. 产出优化建议 → 确认后应用

## 最佳实践

1. **先小后大**：先写最小可用 SKILL.md，再逐步增加 phases/references
2. **测试触发**：确保 description 中的触发词能正确路由到此 skill
3. **避免重复**：已有 shared 协议覆盖的逻辑不要在 skill 中重新实现
4. **文档即代码**：SKILL.md 本身就是 skill 的全部逻辑，保持清晰可读
5. **状态外化**：长流程必须使用 state.json，不依赖上下文记忆
