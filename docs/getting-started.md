# 安装与快速上手

## 前置条件

- Node.js ≥ 18
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 已安装并可用

---

## 安装

```bash
npm install -g @shirayner/ace
```

## 初始化环境

```bash
ace init
```

自动配置：
- 全局 CLAUDE.md 索引
- 10 条编码规则（`~/.claude/ace/rules/`）
- Skills 插件（`~/.claude/plugins/`）

### 验证安装

```bash
ace doctor
```

### 查看已安装组件

```bash
ace list
```

---

## 初始化项目画像

进入任何目标项目后：

```
/ace:init
```

**产出**：`.ace/project-profile.md`

包含：
- 系统定位（做什么、面向谁）
- 架构分层（层/包路径/职责）
- 中间件使用模式
- 编码约定（命名/异常/日志）

**作用**：后续所有编码类 skill 读取此画像作为项目上下文。

**更新**：架构变更后重新执行 `/ace:init`。

---

## 典型工作流

### 流程 A：目标驱动开发（auto-goal）

**适用场景**：描述期望结果而非具体代码变更；调研/规划/多步执行

```
/ace:auto-goal
```

ACE 会：首轮对齐 → 任务分解 → 并行执行 → 验证 → 经验沉淀

**示例**：
- "重构这个模块的异常处理"
- "调研 Redis 集群方案"
- "帮我理解这个订单系统"

---

### 流程 B：规范驱动编码（spec-coding）

**适用场景**：从零开始做新功能/变更

**前置**：
```bash
ace spec init    # 首次使用需初始化
```

```
/ace:spec-coding
```

**6 Phase 流转**：

| Phase | 做什么 |
|-------|--------|
| Understand | 深度需求分析 + 用户对齐 |
| Propose | 创建提案（scope/目标/验收标准） |
| Design | 技术设计（架构/接口/数据模型） |
| Plan | 原子化任务拆解 |
| Apply | 代码实施 |
| Archive | 复盘 + 知识固化 + 归档 |

每个关键节点有 Hard Gate——必须获得用户确认才能推进。

---

### 流程 C：代码审查（code-review）

```
/ace:code-review
```

三层分析：正确性 → 设计 → 风格

---

### 流程 D：单元测试（ut）

```
/ace:ut
```

两种模式：批量（独立调用）/ 增量（spec-coding 内嵌）
覆盖率目标：行 ≥80%、分支 ≥70%

---

## 全局规则

位于 `~/.claude/ace/rules/`，按场景自动加载：

| 规则 | 加载时机 |
|------|---------|
| `clean-code.md` | 编辑代码前 |
| `code-quality.md` | 编辑代码前 |
| `context-hygiene.md` | 长任务时 |
| `interactive-clarify.md` | 需要提问时 |
| `memory-policy.md` | 保存记忆前 |
| `reporting.md` | 生成报告前 |
| `thinking.md` | 始终 |
| `git.md` | Git 操作时 |
| `gitflow.md` | 分支管理时 |
| `task-recovery.md` | 恢复任务时 |

---

## 常见问题

**Q: skill 没有被正确触发？**
- 确认 `ace doctor` 状态正常
- 使用完整命令 `/ace:{skill-name}` 显式触发

**Q: 如何中断后恢复任务？**
- 对 Claude 说"继续"
- ACE 读取 `.ace/tasks/{changeName}/state.json` 自动恢复

**Q: `/ace:init` 分析不准确？**
- `project-profile.md` 支持手动补充（标注 `[manual]`）
- 架构变更后重新执行
