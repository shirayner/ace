# 共享协议层

## 设计目标

- **跨 skill 复用认知基础设施** — 协议是 skill 的"标准库"，避免每个 skill 重复发明轮子
- **协议即契约** — 确保一致的工作质量，无论哪个 skill 调用都产出相同标准的结果
- **引用而非复制** — skill 通过 `Read` 协议文件获得能力，协议更新自动生效于所有调用方

## 协议调用链

```
understanding-protocol（深度理解）
        ↓
alignment-protocol（认知对齐）
        ↓
spec-engine（规范化执行 + 门禁）
        ↓
verification-protocol（验证闭环）
        ↓
experience-protocol（经验沉淀）

横切：context-discipline / parallel-protocol / state-template
```

纵向链路是主流程——从理解到交付；横切协议在任意阶段按需介入。

---

## 各协议详解

### understanding-protocol（通用理解协议）

**核心命题**：理解是做出正确决策的前提。不充分的理解 = 在错误前提上构建方案。

**思考纪律**（6 字诀）：

| 字 | 含义 |
|---|---|
| 序 | 理解 → 规划 → 行动，不可乱序 |
| 验 | 事实闭环，不以假设收尾 |
| 深 | 多问一层为什么 |
| 广 | 在系统中定位局部 |
| 辨 | 主动找反证 |
| 简 | 复杂度是负债 |

**苏格拉底四追问**：

1. 追问目的 — 为什么要做这件事？解决什么问题？
2. 追问完整性 — 还有哪些没说出来的？
3. 追问前提 — 哪些假设未经验证？
4. 追问约束 — 什么不能做？什么必须保留？

**问题驱动探索**：识别决策前提 → 定位知识缺口 → 目标性探索 → 充分性判定

**Defeater 搜索**：Steel-man（构建最强版本）→ Attack（尝试攻破）

**质量门槛**：
- ≥1 新洞察
- ≥2 前提审计
- Defeater 检查通过
- 无 UNKNOWN 残留

**被调用方**：auto-goal、spec-coding、spechub-coding 的首阶段

---

### alignment-protocol（对齐协议）

**核心命题**：认知互补——AI 与人类盲区互相照亮。AI 擅长系统推演，人类掌握意图与隐性约束。

**三步流程**：

1. **Step 1**：执行理解层（调用 understanding-protocol）
2. **Step 2**：引导性澄清——获取只有人类知道但没说出来的信息
   - 意图（真正想达到什么效果）
   - 优先级（哪些可以取舍）
   - 约束（技术/业务/时间的硬限制）
   - 上下文（相关决策历史、团队惯例）
3. **Step 3**：对齐确认——输出 AI 补集
   - 我的理解（复述要点）
   - 计划方向（高层方案）
   - 关键假设（需确认的前提）
   - 完成标准（怎样算做完）

**惊讶测试**：用户此刻看到我的决策会惊讶 → 暂停询问

**硬规则**：
- 每个 Step 必须有 `AskUserQuestion` 工具调用
- Step 2 和 Step 3 **不能在同一个 response 中执行**

---

### spec-engine（规范化编码引擎）

**核心信念**：规范先于代码，决策先于实现，验证闭环先于归档。

**被共享于**：spec-coding 和 spechub-coding

**门禁系统**（Hard Gate，不可跳过）：

| Gate | 名称 | 准入条件 |
|------|------|----------|
| G1 | Proposal 准入 | 4 要素对齐确认（范围/方向/假设/标准） |
| G2 | Design 准入 | 技术方案对齐确认 |
| G3 | Apply 准入 | design.md + tasks.md 用户确认 |
| G4 | Archive 准入 | 验证通过 + 知识固化确认 |

**条件标注**：
- `[IF artifacts]` — 仅当存在平台产物时执行
- `[IF profile]` — 仅当存在项目画像时执行
- `[ALWAYS]` — 无条件执行

**职责分离**：
- **适配层**（各 skill 自有）：入口触发、上下文注入、输出格式
- **引擎**（spec-engine 共享）：流程控制、门禁执行、质量保障

---

### verification-protocol（验证铁律）

**Iron Law**：NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

**5 步 Gate Function**：

1. **确认验证手段** — 运行测试？手动检查？构建编译？
2. **执行验证** — 实际运行，不可跳过
3. **采集证据** — 命令输出 / 截图 / 日志（原始数据）
4. **判定通过/失败** — 基于证据而非推测
5. **标记状态** — 更新 state.json 中的验证字段

**新鲜性要求**：验证必须在当前变更之后执行，不可引用旧证据。

**被调用方**：所有 skill 在标记 `completed` 前必须通过此协议。

---

### experience-protocol（经验进化）

**触发条件**：
- 遇到意外行为
- 踩坑（尤其是浪费时间的坑）
- 反直觉的发现
- 可复用的模式或技巧

**经验格式**：`E{N}: 简述发现`（附原因与应对）

**存储位置**：`.ace/experience.md`（归属项目而非会话）

**检查义务**：交付后必须检查，无论有无新经验都需向用户报告检查结果。

---

### context-discipline（上下文纪律）

**核心问题**：上下文窗口是稀缺资源，必须主动管理。

**4 策略**：

| 策略 | 做法 |
|------|------|
| 隔离 | sub-agent 处理大块独立工作，主 agent 只收结果 |
| 压缩 | 只保留决策结论，丢弃过程细节 |
| 外化 | 写入 state.json / context.md，需要时再读 |
| 预算感知 | 意识到剩余空间，提前规划压缩时机 |

**长任务规则**：连续 5+ 工具调用无文本输出时，必须插入进度说明。

---

### parallel-protocol（并行调度协议）

**核心判据**：依赖测试——A 的结果是否影响 B？

- 是 → 串行
- 否 → 可并行

**硬限制**：≤8 并行 Agent

**铁律**：不修改同一文件的并行 Agent（避免冲突）

**强制并行条件**：≥3 个独立任务可并行但选择串行执行 = 违规

**Apply 阶段**：禁止并行（代码修改必须串行，保证一致性）

---

### state-template（状态文件规范）

**路径**：`$PROJECT_ROOT/.ace/tasks/{changeName}/state.json`

**4 种类型**：

| type | 适用场景 |
|------|----------|
| goal | auto-goal 任务 |
| spec | spec-coding / spechub-coding 变更 |
| analysis | 分析研究类任务 |
| review | 代码审查 |

**设计目标**：新 agent 读完 `state.json` + `context.md` 后能以 80% 效率继续工作。

**配套文件**：
- `state.json` — 结构化状态（阶段/进度/决策）
- `context.md` — 自然语言上下文摘要
- `artifacts/` — 产物目录（设计文档/任务列表等）

**changeName 规范**：kebab-case，2-4 英文单词描述语义（如 `add-user-auth`、`fix-payment-timeout`）

---

## 协议使用示例

以一个典型的 `auto-goal` 任务展示协议调用顺序：

```
┌─ Skill 入口（auto-goal）
│
├─ 1. Read understanding-protocol.md
│     → 执行深度理解：四追问 + Defeater 搜索
│     → 产出 understanding_result
│
├─ 2. Read alignment-protocol.md
│     → Step 2: 引导性澄清（AskUserQuestion）
│     → 等待用户回复
│     → Step 3: 输出对齐确认（AskUserQuestion）
│     → 等待用户确认
│
├─ 3. 进入执行阶段
│     → 规划 + 实现（按需调用 context-discipline / parallel-protocol）
│
├─ 4. Read verification-protocol.md
│     → 5 步 Gate Function
│     → 采集新鲜证据
│     → 判定 PASS / FAIL
│
├─ 5. Read experience-protocol.md
│     → 检查是否有新经验
│     → 有则写入 .ace/experience.md
│     → 向用户报告检查结果
│
└─ 交付完成
```

协议的力量在于：每个 skill 只需 `Read` 对应协议文件，即可获得标准化的认知能力，而无需自行实现。
