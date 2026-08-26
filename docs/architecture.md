# 系统架构

## 设计哲学

1. **规范先于代码，决策先于实现，验证闭环先于归档** — 每个变更经历完整的理解→对齐→执行→验证生命周期。
2. **协议即契约** — Skill 通过引用 shared 协议获得一致的质量保障；协议变更自动传播到所有消费者。
3. **认知互补** — 通过结构化澄清与确认，让 AI 与人类盲区互相照亮。

---

## 三层架构

### Layer 1: Shared Protocols（认知基础设施层）

路径：`plugin/shared/`

提供跨 skill 复用的认知协议，是整个系统的质量地基。

| 协议 | 职责 |
|------|------|
| understanding-protocol | 通用理解协议 — 苏格拉底追问、Defeater 搜索 |
| alignment-protocol | 对齐协议 — 理解 → 澄清 → 确认 |
| spec-engine | 规范化编码引擎 — G1-G4 门禁系统 |
| verification-protocol | 验证铁律 — 无新鲜证据不可声称通过 |
| experience-protocol | 经验进化 — 踩坑/反直觉 → .ace/experience.md |
| context-discipline | 上下文纪律 — 隔离/压缩/外化/预算感知 |
| parallel-protocol | 并行调度 — 依赖检测、≤8 Agent、不修改同文件 |
| state-template | 状态文件规范 — state.json 结构定义 |

**依赖链**：

```
understanding → alignment → spec-engine → verification → experience
```

### Layer 2: Skills（能力单元层）

路径：`plugin/skills/<category>/<skill>/`

Skill 按分类分目录，分类即安装单位 —— `ace init` 先选分类，再在分类内选具体 skill。分类清单的单一真相源是 `src/core/constants.js` 的 `SKILL_CATEGORIES`，成员关系直接来自目录树（含 `SKILL.md` 的目录才是 skill）。

| 分类 | 默认安装 | Skills |
|------|---------|--------|
| coding | ✅ | code-review, git-commit, init, llm-wiki-generator, llm-wiki-reader, parallel-dispatch, requirement-analysis, requirement-review, requirement-understanding, requirement-writing, software-thinking, spec-coding, spechub-coding, subagent-execute, tech-design, test-case-gen, ut, verify |
| general | ✅ | auto-goal, auto-goal-v2, auto-goal-v3 |
| meta | ✅ | skill-creator, skill-optimize |
| docs | ✅ | feishu-doc, simple-text-to-image, text-to-image |

四个分类默认全部预勾选，即全量安装。分类的作用是让用户能**主动取消**不需要的部分，而不是替用户预判哪些用不上。

**内部专有 skill 不在这里。** ACE 发布到公开 npm（`files` 含 `plugin/`），所以任何含内部域名、serviceCode、真实业务标识符的 skill 都不能放进 `plugin/skills/` —— 那等于随包公开。它们住在独立的 `ace-internal` 插件（`platform` / `member` 两类），与 ACE 并存安装、互不依赖。分类元数据只控制预勾选，控制不了打包，所以这条边界靠仓库隔离而非命名约定来保证。

**按目标安装**：共享规范存储保留分类，路径为 `~/.agents/skills/ace-<category>/<skill>/SKILL.md`。Claude Code 只发现 `skills/<skill>/SKILL.md`，因此插件 marketplace/cache 仍去掉分类层；Kiro 的专用 skills 目录也使用扁平副本。换言之，分类在支持递归发现的共享存储中保留，只在目标工具明确需要时才投影为扁平布局。

**用户选择持久化**在 `~/.ace/config/skills-selection.json`，`ace init --force` 与 `ace upgrade` 复用它，不会悄悄装回用户取消掉的 skill。

**Skill 内部结构**：

```
plugin/skills/<category>/{name}/
├── SKILL.md        # 入口定义（必须）
├── phases/         # 多阶段流程（可选）
├── references/     # 参考知识（可选）
├── templates/      # 输出模板（可选）
├── rules/          # skill 级规则（可选）
├── knowledge/      # 领域知识（可选）
├── prompts/        # 子代理 prompt（可选）
└── scripts/        # 工具脚本（可选）
```

### Layer 3: Rules（编码规则层）

路径：安装后位于 `~/.claude/ace/rules/`

| 规则 | 加载时机 |
|------|---------|
| clean-code.md | 始终（@import） |
| code-quality.md | 始终（@import） |
| interactive-clarify.md | 始终（@import） |
| context-hygiene.md | 长任务时 |
| memory-policy.md | 保存记忆前 |
| reporting.md | 生成报告前 |
| thinking.md | 始终 |
| task-recovery.md | 恢复任务时 |

Git 提交规范与分支命名不在这一层 —— 由 `git-commit` skill 承载（原 `git.md`、`gitflow.md` 已废止）。

---

## 数据流

```
用户请求
  → Skill 入口匹配
    → understanding-protocol（深度理解）
      → alignment-protocol（认知对齐）
        → spec-engine（规范化执行 + G1-G4 门禁）
          → verification-protocol（验证闭环）
            → experience-protocol（经验沉淀）

横切：context-discipline / parallel-protocol / state-template
```

---

## 门禁系统（Gate System）

| 门禁 | 节点 | 条件 |
|------|------|------|
| G1 | Proposal 准入 | 用户确认 4 要素对齐（目标/范围/约束/验收标准） |
| G2 | Design 准入 | 技术方案已对齐（架构选型/接口/数据模型） |
| G3 | Apply 准入 | design.md + tasks.md 已生成且用户确认 |
| G4 | Archive 准入 | 验证通过 + 知识固化确认 |

**Hard Gate 特性**：标注"不可跳过"的门禁在任何执行模式下（包括 auto mode）必须执行。

---

## 状态管理

- **路径**：`.ace/tasks/{changeName}/state.json`
- **设计目标**：新 agent 读完 state.json + context.md 后能以 80% 效率继续
- **4 种类型**：goal / spec / analysis / review
- **可恢复**：读 state → 验证产出 → 重建进度 → 继续

---

## Skill 协作拓扑

```
               ┌─────────────────────────────────────┐
               │         init (项目画像)               │
               │   所有编码类 skill 依赖此产出         │
               └──────────────┬──────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
  auto-goal            spec-coding          spechub-coding
        │                     │                     │
        │              ┌──────┘                     │
        │              ▼                            │
        │     subagent-execute                      │
        │              │                            │
        ├──────────────┼────────────────────────────┤
        │              │                            │
        ▼              ▼                            ▼
                    verify (验证门控)
                       │
                       ▼
               experience-protocol
```
