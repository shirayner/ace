# Phase 4: Plan（实现规划）

**目的**：生成 bite-sized 实现任务，每个任务原子化、可验证、包含 TDD 步骤。

---

## 执行逻辑

### 1. 范围兜底安全网

```
design.md 是否覆盖了无法收敛为单个 plan 的内容？
IF yes →
  "设计展开后发现比预期复杂。建议拆为多个 plan：
   Plan A: {scope} — 独立产出可工作的软件
   Plan B: {scope} — 独立产出可工作的软件"
  → 不回退 design（design 仍有效），只拆分执行
  → AskUserQuestion 确认拆分策略
IF no → 继续
```

### 2. File Map

列出所有需创建/修改/测试的文件 + 每个文件的职责。

### 3. 设计单元边界

- 清晰边界 + 定义良好的接口
- 每文件一个清晰职责
- 变化一起的放一起（按职责分，不按技术层分）
- 遵循现有代码库模式

### 4. 任务分块（每块 5-8 任务）

每步 = 1 个原子操作（2-5 分钟），包含验证方式。

**TDD 铁律（Iron Law: 无测试不编码）**：

每个实现任务强制遵循 RED→GREEN→REFACTOR：
1. 写失败测试（RED）
2. 运行测试确认 FAIL（验证测试本身有效）
3. 写最小实现使测试通过（GREEN）
4. 运行测试确认 PASS
5. 重构（如需要）
6. 提交

**反合理化**：
- ❌ "太简单不需要测试" → 简单的东西写测试也快
- ❌ "先写代码后补测试" → 后补测试只验证代码做了什么，不验证应该做什么
- ❌ "测试会在后面任务中写" → 违反 TDD 定义
- ❌ "只是改配置" → 配置错误是最常见的生产事故

**豁免条件**（仅以下情况可跳过 TDD）：
- 纯文档/配置文件修改（无可执行行为）
- 项目无测试基础设施（此时第一个任务应是搭建测试框架）

### 5. 读取前置内容 + 获取写作指令

- Read `technical-design.md` → 完整设计方案
- Read `specs/{domain}/spec.md` → 行为契约（每个 scenario = 一个测试用例）
- 运行 `openspec instructions tasks --change {name} --json`
  → 获取 tasks artifact 的 template + instruction

### 6. 生成 tasks.md

OpenSpec 要求 + spec-coding TDD 增强：

```markdown
# Implementation Tasks

## File Map
- Create: `src/auth/service.ts` — 认证服务核心逻辑
- Modify: `src/api/routes.ts:45-60` — 添加认证路由
- Test: `test/auth/service.test.ts` — 认证服务测试

## Group 1: {名称}
- [ ] 1.1 写失败测试：{描述} [完整测试代码]
- [ ] 1.2 验证测试失败：`npm test -- auth` → expect FAIL
- [ ] 1.3 实现最小代码使测试通过 [完整实现代码]
- [ ] 1.4 验证测试通过：`npm test -- auth` → expect PASS
- [ ] 1.5 提交：`git commit -m "{message}"`

## Group N+1: 质量收尾
- [ ] N.1 复盘 — 对照 technical-design.md 检查偏差 → notes.md
- [ ] N.2 经验提取
- [ ] N.3 归档确认
```

运行 `openspec validate --json` 确认 tasks.md 格式。

### 7. 标注任务依赖和并行性

- 独立任务标记 `⟂`
- 依赖任务标记 `(depends: X)`
- 注意：Apply 阶段仍串行执行，⟂ 标记仅供参考

### 8. AskUserQuestion（确认计划）

### 9. 更新 .ace-state.json

```json
{
  "phase": "plan",
  "tasks_file": "tasks.md",
  "total_tasks": N
}
```

### 10. 事件 `planned` → Phase 5
