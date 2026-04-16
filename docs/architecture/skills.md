# 4 个 Skills 详解

ACE 的核心能力封装：auto-goal、coding、skill-creator、skill-optimize

---

## Skills 总览

| Skill | 核心能力 | 触发场景 | 理论来源 |
|-------|---------|---------|---------|
| **auto-goal** | 自主完成目标 | 复杂任务、多步骤项目 | OODA、Cynefin、认知负荷 |
| **coding** | 代码域认知协议 | 编码、测试、审查 | Clean Code、TDD、代码审查 |
| **skill-creator** | 创建新 Skills | Skill 开发、Eval | Anthropic 最佳实践 |
| **skill-optimize** | 优化现有 Skills | Skill 调优 | 信息论、认知科学 |

---

## 1. auto-goal — 自主目标完成

### 核心理念

> **每步行动都是带预测的实验** — 预期与现实的偏差是最有价值的学习信号

### spec coding 示例

使用 aspec 进行规范驱动开发的完整流程：

```
用户: 帮我实现用户积分系统，使用 aspec 流程

Claude (auto-goal skill):
├── 【explore】读取知识库
│   └── ADR + 词汇表 + 风险图谱
│
├── 【propose】需求澄清门禁
│   ├── 检查 requirement-issues.md 状态
│   ├── 发现 4 个问题 → 批量提问确认
│   └── 创建 proposal.md
│
├── 【specs】规格定义
│   └── 积分规则、数据结构、API 契约
│
├── 【design】技术设计
│   └── 并发处理、事务策略、决策四要素
│
├── 【tasks】设计澄清门禁
│   ├── 检查 design-issues.md 状态
│   └── 创建任务清单
│
├── 【apply】代码实施
│   └── 逐任务执行，每步验证
│
└── 【archive】归档复盘
    └── 更新 ADR/词汇表/风险图谱

结果: 知识库进化，下次流程更精准
```

### 六字原则

| 字 | 含义 | 自检 |
|---|------|------|
| **序** | 理解与行动螺旋深化 | 理解够启动下一步吗？ |
| **验** | 用事实闭环，证伪导向 | 什么条件下结论不成立？ |
| **深** | 多问一层为什么 | 到根因层了吗？ |
| **广** | 系统中定位局部 | 改动影响传向何方？ |
| **辨** | 区分事实/推断/假设 | FACT / INFER / ASSUME？ |
| **简** | 复杂度需要理由 | 能更简单吗？ |

### 域感知路由 (Cynefin Framework)

```
接收目标
    ↓
判断任务域
    ├─ Clear      → 感知→分类→响应
    ├─ Complicated → 感知→分析→响应
    ├─ Complex    → 试探→感知→响应
    └─ Chaotic    → 行动→感知→响应
```

### OODA 执行循环

```
Sense (观察)
  - 状态？变化？新信息？
  - 弱信号检测
    ↓
Orient (定向)
  - 距目标多远？
  - 心智模型需要更新？
    ↓
Decide (决策)
  - 策略选择
  - 推理模式
  - 验证标准
    ↓
Act (行动)
  - 识别即行动
  - 或完整分析
    ↓
Observe (观察结果)
  - 结果 vs 预期？
    ↓
Adapt (调整)
  - 更新理解
  - 调节深度/域
```

### 策略工具箱

| 策略 | 用途 | 关键机制 |
|------|------|---------|
| **Clarify** | 消除歧义 | 不确定性分级 |
| **Explore** | 获取知识 | sub-agent 隔离 |
| **Plan** | 分解任务 | 瓶颈优先、Pre-mortem |
| **Execute** | 渐进交付 | 随时可交付 |
| **Probe** | Complex 域试探 | 小步实验 |

### 记忆架构

```
.tasks/auto-goal-{id}/
├── state.md         # Orient — 我在哪，去哪，下一步
├── decisions.md     # Decide — 关键决策 + 理由
├── observations.md  # Sense  — 意外发现
└── reflections.md   # Adapt  — 失败根因 + 成功解剖
```

---

## 2. coding — 代码域认知协议

### 核心洞察

> **编译和测试是天然证伪器；代码变更即假设检验；版本控制提供安全回退。**

### 意图路由

```
用户输入
    ↓
识别意图
    ├─ 实现 → implement-guide.md
    ├─ 测试 → unit-test-guide.md
    └─ 审查 → code-review-guide.md
```

### 三层架构

| 层级 | 组件 | 职责 |
|------|------|------|
| **Presentation** | Controller | 处理 HTTP 请求/响应 |
| **Business** | Service | 业务逻辑、事务管理 |
| **Data** | Repository | 数据访问、持久化 |

### 复杂度适配

| 级别 | 判据 | 执行路径 |
|------|------|---------|
| **轻量** | 单文件、改动明确 | Read → Edit → 验证 |
| **标准** | 多文件边界清晰 | Plan Mode → 探索 → 规划 → 执行 → 验证 |
| **深度** | 跨系统多层面 | 状态外化 → 分 Phase 执行 |

### 代码域 OODA

**Sense** — 读代码前先建假设
**Orient** — 域判断、心智模型更新
**Decide** — 方案评估、验证策略选择
**Act** — 原子变更、质量内建
**Observe** — 编译第一道证伪、测试第二道
**Adapt** — Reflect-then-Retry

### 交付规范

**实现意图**：
```
完成: {简述}
变更: {文件列表}
验证: {编译/测试结果}
遗留: {如有}
```

**测试意图**：
```
被测类: XxxService
测试类: XxxServiceTest
用例数: N (正常M + 异常K + 边界J)
覆盖率: 行 XX% / 分支 XX%
```

**审查意图**：
```
Critical — 可能导致生产事故的 bug
Warning  — 代码坏味道或潜在风险
Suggestion — 可改进的设计
Positive — 值得肯定的地方
```

---

## 3. skill-creator — Skill 创建与评估

### 核心流程

```
确定意图 → 编写 Draft → 创建测试 → 运行评估
    ↑                                      ↓
    └────── 迭代改进 ←──── 用户反馈 ←─────┘
```

### Skill 结构

```
skill-name/
├── SKILL.md              # 核心指令
│   ├── YAML frontmatter  # name, description
│   └── Markdown body     # 执行逻辑
└── Bundled Resources/
    ├── scripts/          # 可执行脚本
    ├── references/       # 参考文档
    └── assets/           # 模板、图标等
```

### 渐进披露

| 层级 | 内容 | 预算 | 加载时机 |
|------|------|------|---------|
| Metadata | name + description | ~100 词 | 始终 |
| Body | 核心协议 | <500 行 | 触发时 |
| Resources | 深度细节 | 不限 | 按需 |

### 评估流程

```
1. 生成测试用例 (evals/evals.json)
2. 并行运行 (with-skill vs baseline)
3. 草拟断言 (assertions)
4. 捕获时序数据 (timing.json)
5. 评分与聚合 (benchmark.json)
6. 启动评估查看器 (eval-viewer)
7. 读取反馈 (feedback.json)
8. 迭代改进
```

### 关键原则

- **传意不传形** — 解释为什么，而非只做什么
- **渐进披露** — 三层加载模型
- **示例设计** — 3-5 个多样化示例

---

## 4. skill-optimize — Skill 优化方法论

### 核心洞察

> **在有限的认知带宽内，用最高信噪比的表达，传递让 AI 能够自主判断的认知协议。**

### 优化流程

```
诊断现状 → 选择原则 → 重构实施 → 验证效果
    ↑                                      ↓
    └────── 不满意？回到诊断 ──────────────┘
```

### 七条优化原则

| 原则 | 解决的问题 | 变换模式 |
|------|-----------|---------|
| **传意不传形** | AI 偏离真实意图 | ALWAYS → 解释原因 |
| **渐进披露** | 上下文浪费 | 分层加载 |
| **信噪比优化** | 重要指令被稀释 | 删除无用内容 |
| **单一职责** | 触发混淆 | 拆分为多个 Skills |
| **闭环验证** | 错误静默累积 | 关键节点验证 |
| **复杂度适配** | 框架与任务不匹配 | 多路径支持 |
| **抗过拟合** | 测试完美真实失败 | 泛化原则 |

### 四维诊断

1. **触发准确率** — 该触发时触发了吗？
2. **任务完成质量** — 输出满足需求吗？
3. **Token 效率** — 有浪费吗？
4. **结构健康度** — 分层清晰吗？

### 长度检查

| 级别 | 行数 | 处理 |
|------|------|------|
| 理想 | 200-400 | - |
| 上限 | 500 | 移内容到 references |
| 警告 | 1000 | 考虑拆分 |

---

## Skills 间关系

```
auto-goal (通用任务)
    │
    ├─ 包含 coding (代码任务)
    │
    └─ 可被 skill-creator 创建
         │
         └─ 可被 skill-optimize 优化
```

---

## 触发关键词

| Skill | 触发词 |
|-------|--------|
| auto-goal | "帮我实现..."、"完成...目标"、"自动完成..."、"学习..."、"教程" |
| coding | "实现"、"开发"、"修复"、"重构"、"生成单测"、"review"、"审查" |
| skill-creator | "创建 skill"、"开发 skill"、"eval skill" |
| skill-optimize | "优化 skill"、"skill 效果不好"、"精简指令"、"optimize skill" |
