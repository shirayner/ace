# Phase 3: Design（技术设计）

**目的**：深度技术设计，产出 design.md + technical-design.md。这是代码库深入探索的阶段。

**交互规范**：所有 AskUserQuestion 调用遵循 `references/ask-user-guide.md`。

---

## 执行逻辑

### 1. 代码库分层探索（由外而内）

```
L1 全局鸟瞰：Glob 结构 + Read 入口文件
L2 领域定位：Grep 关键词 → 受影响文件
L3 模式学习：Read 一个类似功能的完整实现
L4 接口分析：Grep 调用方/被调用方 → 约束清单
```

≥3 独立维度时并行 Agent。

### 2. Pattern Grounding（模式锚定 — 设计前强制搜索）

**目的**：禁止发明模式。先搜索代码库约定，无约定时明确声明。

搜索 6 维度：

| 维度 | 搜索目标 | 方法 |
|------|---------|------|
| Naming | 文件/函数/类/变量命名约定 | Glob + Grep 现有代码 |
| Error Handling | 异常抛出/返回/日志模式 | Grep throw/catch/Result |
| Logging | 级别/格式/记录内容 | Grep log 调用 |
| Data Access | Repository/Service/Query 模式 | 搜索 DAO/Repository 层 |
| Test | 测试框架/fixture/断言风格/文件位置 | Glob test 文件 |
| API | 路由/参数验证/响应格式 | 搜索 Controller 层 |

**产出**：Pattern Grounding Report（写入 technical-design.md 的 Patterns 节）

**关键规则**：
- 搜索不到 ≠ 自由发挥。搜索不到 = 声明"无约定" + 设计时定义新约定
- Pattern Report 只搜索当前代码库，不引入外部"最佳实践"除非项目无先例

### 3. 读取前置 artifact 内容

- Read `proposal.md` → 获取动机和范围
- Read `specs/{domain}/spec.md` → 获取行为契约
- 这些内容作为设计的输入上下文

### 4. 现有代码库原则

- 先探索再提议
- 遵循现有模式（不引入不一致的新风格）
- 仅改进影响当前工作的问题（不做无关重构）

### 5. 设计维度分析

- 可行性 + 替代方案
- 影响面 + 模块边界
- 风险点 + 缓解措施

### 6. 识别设计决策 + 分级

探索完成后，列出所有需要做的设计决策。按三维矩阵评估严重性：

**评估维度**（业界共识：ADR 社区 + Martin Fowler Architect Elevator）：

| 维度 | 高 | 低 |
|------|---|---|
| **可逆性** | 不可逆/回滚成本高（如选定框架、数据结构承诺） | 易回滚/可替换（如变量命名、内部实现） |
| **影响范围** | 跨模块/跨系统/影响 API 契约 | 单文件/单函数内部 |
| **决策成本** | 选错需大量重构/迁移 | 选错改几行代码 |

**分级结果**：

| 级别 | 判定条件 | 处理方式 |
|------|---------|---------|
| 需澄清 | 任一维度为"高"，且有 ≥2 种可行方案 | **必须向用户确认** |
| 自主决定 | 三维度均为"低"，或只有唯一可行方案 | AI 决定，设计文档中记录理由 |

**简言之**：有选择 + 有代价 → 问用户。无选择或无代价 → AI 自主。

### 7. 设计决策澄清（需澄清级 — 确认门禁）

```
收集所有"需澄清"级设计决策：
  每个决策列出：
    - 问题描述
    - 2-3 个可行选项（含推荐标记）
    - 其他选项的权衡

使用 AskUserQuestion 多 tab 交互：
  - 每个 question = 一个设计决策（独立 tab）
  - options = 2-3 个可行选项（推荐项加"(推荐)"后缀 + description 说明理由）
  - 用户可选择预设选项，也可选"Other"自由输入
  - AskUserQuestion 单次最多 4 个 question
  - 如决策 > 4 个 → 分多轮提问（每轮 ≤4）

示例：
  AskUserQuestion(questions: [
    {
      header: "游戏循环",
      question: "游戏循环使用什么机制？",
      options: [
        {label: "setInterval (推荐)", description: "离散格子移动无需帧同步，语义更清晰"},
        {label: "requestAnimationFrame", description: "帧同步精确，但对格子游戏过度"}
      ]
    },
    {
      header: "数据结构",
      question: "蛇的数据结构用什么？",
      options: [
        {label: "Array<{x,y}> 头在[0] (推荐)", description: "unshift/pop 自然映射移动语义"},
        {label: "LinkedList", description: "O(1) 头尾操作，但 JS 无原生实现"}
      ]
    }
  ])

→ 用户逐 tab 确认/调整后再进入设计展开
→ 未确认的决策 = 不可写入设计文档
```

**关键区分**：
- 顶层架构方案选择（如"微服务 vs 单体"）→ 仍然是 Step 6 的总方案对比
- 具体设计决策（如"数据结构选择""循环策略"）→ Step 7 的多 tab 确认
- 两者可能合并（只有一种总方案，但内部有多个需澄清的决策）

### 8. 分段呈现设计

- 架构概览（2-3 句）
- 组件设计（每个 100-200 字）
- 数据流/接口
- 错误处理
- 测试策略

### 9. 设计隔离性原则

- 每个单元有单一明确目的
- 通过定义良好的接口通信
- 可独立理解和测试
- 文件不宜过大 — 过大 = 职责不清

### 10. 写入两份设计文档

#### 文档 A: OpenSpec design.md（精简决策记录）

```bash
openspec instructions design --change {name} --json
```

→ 获取 template + instruction + context + rules
→ AI 严格按 template 结构编写 design.md
→ `openspec validate --json` 验证格式

#### 文档 B: technical-design.md（完整设计参考）

spec-coding 增强产物，写入 change 目录但不由 OpenSpec 管理：

```markdown
# {Change} Technical Design
## Context（背景 + 约束 + 关联系统）
## Patterns（Pattern Grounding Report 完整内容）
## Architecture（架构图 + 数据流）
## Component Design（每组件：职责/接口/依赖/测试策略）
## Interface Contracts（API 签名/数据结构/错误码）
## Implementation Order（任务依赖图 — 为 Phase 4 铺垫）
## Risks & Mitigations
## Open Questions
```

#### 两份文档的关系

| 文档 | 管理者 | 用途 | 传递给 |
|------|--------|------|--------|
| `design.md` | OpenSpec CLI | DAG 依赖满足 + 决策存档 | tasks instructions |
| `technical-design.md` | spec-coding | 完整设计参考 + Pattern Report | implementer prompt |

### 11. Spec 自审查（对 technical-design.md 执行 5 项检查）

- [ ] Placeholder 扫描：TBD/TODO/待定？→ 修复
- [ ] 内部一致性：架构 vs 组件 是否矛盾？
- [ ] 范围检查：聚焦到单个实现计划可覆盖？
- [ ] 歧义检查：需求可被两种方式理解？→ 选一种显式化
- [ ] YAGNI 检查：未请求的功能？→ 删除

### 12. 派遣 design-reviewer 子代理（独立审查）

- 审查 technical-design.md
- 检查：完整性、一致性、清晰性、范围、YAGNI
- 通过 → 用户审查
- 问题 → 修复后重新审查

### 13. 设计文档审批（确认门禁）

先 markdown 展示设计摘要（架构概览、核心决策表、实现顺序），然后：

```
AskUserQuestion(questions: [{
  header: "确认",
  question: "技术设计是否可以开始规划实施？",
  options: [
    {label: "通过", description: "设计合理，开始规划"},
    {label: "拒绝", description: "设计有问题，需要调整"}
  ]
  // 用户选 Other 并输入调整意见 = 有补充的通过
}])
```

处理逻辑：
- 通过 → 继续
- Other（用户输入调整意见）→ 按意见修改：
  - 修改 technical-design.md（必须）
  - 评估是否影响 design.md：
    - 架构决策/Goals/Risks 变更 → 同步更新 design.md + openspec validate
    - 仅组件细节/接口/实现顺序 → 只改 technical-design.md
  - 重新执行步骤 11（自审查）
  - 重新审批确认
- 拒绝 → 回退到 Step 1 重新探索设计

### 14. 写入 issues/design-issues.md（如有遗留）

### 15. 事件 `designed` → Phase 4

---

## 确认设计（简化自 Superpowers 两步确认）

- **方案选择**：条件性（多方案时触发，单方案跳过）
- **文档审批**：必需门禁（design 文档写好后用户审阅）
