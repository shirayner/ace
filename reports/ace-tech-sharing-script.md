# Ace 技术分享讲稿 — AI Coding Environment

> 分析日期: 2026-05-06
> 时长: 35-40 分钟
> 目标听众: 公司开发者（对 Claude Code / AI 辅助编程有基本认知）

---

## 结构总览

| # | 章节 | 时长 | 核心信息 |
|---|------|------|---------|
| 1 | 开场：Why | 4 min | 痛点共鸣 + 一句话定位 |
| 2 | Harness Engineering：学科定位 | 5 min | 行业趋势 + Ace 的位置 |
| 3 | Demo：What | 8 min | 一键安装 + auto-goal + 安全拦截 |
| 4 | 架构：How | 10 min | 五层体系 + Guides/Sensors 映射 |
| 5 | aspec：规范驱动开发 | 7 min | 双重门禁 + 经验进化 |
| 6 | 收尾 + Q&A | 5 min | 价值总结 + 上手路径 |

---

## 1. 开场：Why — 为什么需要 Ace（4 min）

### 开场话术

> "在座各位应该都用过或者听说过 Claude Code。它确实很强大——能读代码、写代码、跑命令、甚至自主完成复杂任务。但我在深度使用了几个月后发现一个问题：**它的表现很不稳定**。"

### 核心痛点（用自身经历，让听众产生共鸣）

1. **思考深度波动**
   - "简单的变量重命名，它给你写 500 字分析报告；涉及 3 个模块交互的 Bug，它两行代码直接改完，不验证。"
   - 本质：**缺乏元认知**——不知道何时深想、何时快做。

2. **代码质量不一致**
   - "上午写的代码干净优雅，下午写的就是意面代码。因为没有持续加载的质量标准。"
   - 本质：**无持久规则**——每次会话都是白纸一张。

3. **复杂任务容易迷失**
   - "需要 20 步完成的目标，做到第 12 步上下文被压缩了，之前的决策全丢了。"
   - 本质：**工作记忆有限**——上下文窗口不是无限的。

4. **没有安全护栏**
   - "让它清理临时文件，它 `rm -rf` 了整个目录。"
   - 本质：**缺乏防护**——信任需要安全网。

### 过渡到解决方案

> "所以我想：能不能有一套系统性的工程方案，让 Claude Code **始终**保持专业水准？不是偶尔好用，而是**稳定地好用**？"
>
> "这就是 Ace——AI Coding Environment。一条命令，把 Claude Code 从'通用助手'调校为'专业开发伙伴'。"
>
> "但在看具体效果之前，我想先聊一个更大的话题——Ace 在做的事情，其实属于一个新兴的工程学科。"

---

## 2. Harness Engineering：学科定位（5 min）

### 话术引入

> "2026 年初，HashiCorp 联合创始人 Mitchell Hashimoto 和 OpenAI 几乎同时提出了一个概念——**Harness Engineering**。这不是又一个 buzzword，而是对 AI 辅助编程实践的一次根本性范式升级。"

### 2.1 三代范式演进（1 min）

**展示演进图**：

```
Prompt Engineering (2020-2023)
  → 优化单次交互的措辞
  → "请用简洁的方式回答..."

Context Engineering (2024-2025)
  → 管理模型看到的全部信息
  → System prompt + RAG + 对话历史管理

Harness Engineering (2025-2026)    ← 我们在这里
  → 设计 Agent 的完整运行时系统
  → 环境 + 约束 + 反馈循环 + 记忆 + 工具链
```

**话术**：
> "这三代是包含关系，不是替代关系。Harness Engineering 包含 Context Engineering，后者包含 Prompt Engineering。"
>
> "一句话定义 Harness Engineering：**当 AI Agent 犯了一个错误，改进环境让它永远不再犯同类错误——而不是仅仅改进 prompt。**"

### 2.2 核心公式（1 min）

```
Agent 表现 = 模型能力 × Harness 质量

Harness = 模型之外的一切
       = 上下文组装 + 工具链 + 反馈循环 + 约束系统 + 记忆层级
```

**话术**：
> "模型能力已经很强了——Claude、GPT-4o、Gemini 都是顶尖水平。但为什么不同人用同样的模型，生产力差距能到 10 倍？区别就在 Harness 的质量。"
>
> "LangChain 团队仅修改 Harness 架构、不换模型，在 Terminal Bench 2.0 上从 52.8% 提升到 66.5%，从 Top 30 跃升到 Top 5。这就是 Harness 的杠杆效应。"

### 2.3 Guides vs Sensors（1.5 min）

**这是 Harness Engineering 的核心分类框架**（来自 Martin Fowler 技术博客）：

| 类型 | 性质 | 保证强度 | 比喻 |
|------|------|---------|------|
| **Guides（前馈/指导）** | 概率性遵守 | ~95% | 路标、建议 |
| **Sensors（反馈/检测）** | 确定性执行 | 100% | 围栏、传感器 |

**Guides 示例**：CLAUDE.md 规则、Skills、Memory
**Sensors 示例**：Hooks、CI/CD 门禁、Linter、编译器

**关键洞察**：
> "行业最常见的架构失衡是：花 300 行写规则教 AI 怎么写好代码，却 0 行让 AI **看到**代码到底好不好。Guides 很多，Sensors 几乎没有。"
>
> "生产级 Agent 的基本架构模式是：**确定性系统包裹概率性系统**——用 Hooks/CI（确定性）包裹 LLM（概率性）。"

### 2.4 Ace 的定位（1.5 min）

> "理解了 Harness Engineering，Ace 的定位就清晰了：**Ace 是一个 Claude Code Harness 工程化方案**。"

```
Ace = 一键部署的 Harness Engineering 最佳实践
   = Guides (Rules + Skills + Memory)
   + Sensors (Hooks + Hookify)
   + 认知科学 + 软件工程
```

**话术**：
> "Ace 不是在写更好的 prompt，而是在**设计 Agent 的运行环境**——让它在正确的时机获得正确的信息、在犯错时被及时拦截、在完成时被验证。"
>
> "把开头的公式代入：模型能力不变的情况下，Ace 通过提升 Harness 质量来提升 Agent 整体表现。"

### 过渡到 Demo

> "概念讲完了，让我们看看这个 Harness 在实际使用中是什么效果。"

---

## 3. Demo：What — 现场演示（8 min）

### 演讲者笔记

> Demo 是建立信任的关键。挑 2-3 个最有冲击力的场景，让人"哇"一下。

### Demo 1：一键安装（2 min）

**话术引入**：
> "首先看安装。一条命令部署完整的 Harness 环境。"

**操作**：
```bash
npx @shirayner/ace init
```

**讲解要点**：
- 展示交互式选择：preset（full/safe/minimal）+ role（backend/frontend/client/fullstack）
- 强调"5 秒完成配置，背后安装了 8 条认知规则（Guides）+ 4 个 AI Skills + 7 个安全守卫（Sensors）"
- 可以用 `ace list` 展示安装了什么

**话术收尾**：
> "就这样，你的 Claude Code Harness 从零到专业级。看看效果差异。"

---

### Demo 2：auto-goal — 复杂任务自主完成（4-5 min）

**话术引入**：
> "日常开发中最痛的不是写一个函数，而是完成一个多步骤目标。比如'帮我实现一个用户认证模块'。没有 Harness 时，Claude 直接开干，做到一半才发现方向不对。有了 Ace 的 Harness——"

**操作**（提前准备好示例项目）：

1. **对齐阶段**（重点展示）：
   - Claude 先分析目标，然后**主动向你提问**
   - 提出"我的理解 / 计划方向 / 关键假设 / 完成标准"
   - 等你确认后才开始执行
   > "看到了吗？它在动手之前先确认方向。这就是 Guides 层面的认知协议——避免基于假设往前冲。"

2. **执行阶段**（快速带过）：
   - 展示 `.tasks/auto-goal-xxx/state.md` 被创建
   - 强调"认知外化——即使上下文压缩，也能恢复到断点继续"

3. **经验进化**（亮点）：
   - 任务完成后自动生成 `experience.md`
   > "每次完成都复盘。下次类似场景，它会主动说'根据经验 E3，建议用方案 B'。这就是 Harness 在持续进化。"

**关键信息**：
> "auto-goal 的核心理念：**对齐优先于效率**。准确完成你真正想要的，胜过高效完成 AI 以为的。"

---

### Demo 3：Hookify 安全拦截（1-2 min）

**话术引入**：
> "再看 Sensors 层面——如果 Claude 要执行危险命令——"

**操作**：
- 让 Claude 尝试 `rm -rf /some/path` 或 `git push --force`
- 展示 Hookify 拦截提示

**话术收尾**：
> "这就是 Sensors 的价值：确定性拦截，不靠 AI 自觉。7 个守卫全天候运行，让你放心给 Claude 更多自主权。"

---

### Demo 小结 + 过渡

> "三个场景：一键安装、复杂任务自主完成、安全防护。接下来看看它的架构——怎么用 Harness Engineering 的理论落地的。"

### Demo 准备清单

- [ ] 提前准备好演示用的示例项目
- [ ] 确保 Ace 已安装在演示环境
- [ ] 准备"无 Ace"的录屏对比（避免现场等待过长）
- [ ] 准备 fallback 录屏（万一 API 抽风）

---

## 4. 架构：How — 五层 Harness 体系（10 min）

### 话术引入

> "Ace 的架构是 Harness Engineering 的完整实践。五层，每层对应一个 Harness 职责。"

### 4.1 架构全景 + Guides/Sensors 映射（2 min）

```
┌─── Layer 5: Skills（智能技能层）──── Guides ── 复杂任务的认知协议
├─── Layer 4: Rules（认知规则层）──── Guides ── 始终加载的行为标准
├─── Layer 3: Memory（记忆层）─────── Guides ── 跨会话的知识持久化
├─── Layer 2: Hooks（角色钩子层）──── Sensors ─ 编译/类型检查自动化
└─── Layer 1: Hookify（安全层）────── Sensors ─ 运行时危险操作拦截
```

**话术**：
> "底部两层是 Sensors——确定性执行，100% 保证。上面三层是 Guides——概率性遵守，通过精心设计的指令让遵守率接近 100%。两类配合形成完整的 Harness。"

**对应 Harness Engineering 公式**：

| Harness 组成 | Ace 实现 |
|-------------|---------|
| 上下文组装 | Rules 层（始终加载）+ Skills 层（按需加载） |
| 工具链 | Hooks 层（编译/类型检查） |
| 反馈循环 | Hookify 层（拦截） + 经验进化（复盘） |
| 约束系统 | Hookify 层 + Rules 层 |
| 记忆层级 | Memory 层（三层记忆架构） |

---

### 4.2 Rules 层——持久化的 Guides（2 min）

**核心问题**：Claude Code 没有"持久人格"，每次会话都是白纸。

**解决方案**：8 条规则通过 `CLAUDE.md` 的 `@` 引用机制自动加载到上下文。

| 规则 | 一句话描述 | 解决什么问题 |
|------|-----------|-------------|
| thinking | 六字原则：序验深广辨简 | 思考深度不稳定 |
| clean-code | 6 条核心原则 + 反模式表 | 代码质量波动 |
| code-quality | 详细质量检查清单 | 细节质量把控 |
| context-hygiene | 上下文压缩保护策略 | 长任务状态丢失 |
| memory-policy | 记忆保存严格准入门槛 | 记忆膨胀噪音 |
| task-recovery | 任务恢复协议 | 中断后无法续做 |
| reporting | 自动报告输出 | 分析结果格式不规范 |
| interactive-clarify | 批量澄清规则 | 打断用户次数过多 |

**话术**：
> "这 8 条规则就像 Claude 的'职业素养'——始终在场。对应 Harness Engineering 里 Guides 层的 Context Engineering：确保 Agent 在正确的时机看到正确的行为标准。"

---

### 4.3 Skills 层——认知协议（3 min）

**核心问题**：复杂任务需要结构化思考框架，不能让 AI 随意发挥。

**四个 Skills**：

| Skill | 定位 | 核心机制 |
|-------|------|---------|
| **auto-goal** | 复杂目标自主完成 | 三条硬规则 + 生成式原则 + 状态外化 + 经验进化 |
| **coding** | 代码域认知协议 | 三意图路由(实现/测试/审查) + OODA 循环 + 复杂度适配 |
| **skill-creator** | 创建新 Skills | 生命周期管理 + Eval 框架 + Benchmark |
| **skill-optimize** | 优化现有 Skills | 七条优化原则 + 四维诊断 |

**渐进式加载模型**（对应 Harness Engineering 的"最小充分上下文"原则）：

```
Metadata (100 词)     ← 始终在上下文
Trigger (50 词)       ← 始终在上下文
Cognitive (500 行)    ← 触发时加载
Resource (不限)       ← 按需加载
```

> "这个四层加载的设计哲学来自 Harness Engineering 第一原则：**最小充分上下文**——信息论里的信噪比。不需要的不加载，需要时才拉进来。上下文窗口是稀缺资源。"

**auto-goal 三条硬规则**：
1. **首轮对齐不可跳过** — 分析 → 澄清 → 确认，三步完成才能动手
2. **替用户做选择时必须暂停** — "Surprise Test"：用户看到会惊讶就该停下来问
3. **长任务外化状态** — .tasks/ 分层架构（Tier 1 核心索引 ≤40行 + Tier 2 按需加载）

**auto-goal 五条生成式原则**：
1. 先定义完成，再开始执行
2. 承诺当前计划，卡住时换方向（三次失败质疑前提）
3. 永不空手而归
4. 上下文是稀缺资源
5. 对齐不是一次性事件

**coding skill 的 OODA 循环**（代码域专属）：
- **Sense** — 读代码前先建假设，识别上下游依赖
- **Orient** — 域判断（Clear/Complicated/Complex/Chaotic）
- **Decide** — 选择验证策略（微验证/标准验证/深度验证）
- **Act** — 每次变更是一个假设，原子变更，编写时即遵循 clean-code
- **Observe** — 编译是第一道证伪，测试是第二道
- **Adapt** — 失败时先分类根因，三次失败熔断换策略

---

### 4.4 Sensors 层——确定性反馈（2 min）

**Hooks 层**：
> "基于角色的自动化检查。backend 角色装 Java 编译 Hook——每次修改 .java 文件后自动编译，失败立即告诉你。这是 Sensors 的经典形态：确定性执行，不依赖 AI 判断。"

**Hookify 层**（三层防护）：

```
命令级拦截 → rm -rf / git push --force / DROP TABLE
文件级保护 → .env / 密钥文件 / 敏感信息检测
流程级验证 → 提交前编译/测试检查
```

> "对应 Harness Engineering 的核心架构模式：**确定性系统包裹概率性系统**。不管 AI 怎么推理，该拦的一定拦住。"

---

### 4.5 设计理念（1 min）

**三个关键词**：

1. **非侵入式** — 命名空间隔离 + 标记合并 + `ace uninstall` 一键恢复
2. **渐进式增强** — 每层独立可选，minimal 只装 core + rules + plugin
3. **认知经济** — 信息分层加载 + 探索隔离到 sub-agent + 已完成阶段压缩

### 过渡到 aspec

> "刚才讲的是'写代码'阶段的 Harness。但真实开发中，写代码之前还有一个更关键的环节——**需求理解和设计决策**。AI 不会犹豫，它会非常自信地基于假设往前冲。这就需要专门的 Harness 来解决。"

---

## 5. aspec：规范驱动开发工作流（7 min）

### 话术引入

> "**跳过澄清 = AI 基于假设实现 = 高概率返工**。这是我们反复验证的规律。aspec 就是解决这个问题的 Harness：**强制澄清，再动手**。"

### 5.1 三命令流程（1 min）

```
/opsx:proposal  ──→  /opsx:apply  ──→  /opsx:archive
  创建提案              代码实现            归档复盘
```

> "先搞清楚要做什么，再写代码，最后复盘。每一步都有严格的质量门禁。"

---

### 5.2 双重门禁（3 min）

**门禁 1：需求澄清** — 6 个维度

| 维度 | 关注点 | 例子 |
|------|--------|------|
| 功能完整性 | 核心功能说清了？ | "用户登录"——密码还是 OAuth？ |
| 数据关注 | 数据从哪来？ | "导入用户"——CSV 还是 API？ |
| 用户体验 | 交互方式？ | "提交表单"——跳转还是 toast？ |
| 边界/异常 | 极端情况？ | "上传文件"——100MB 怎么办？ |
| 集成依赖 | 外部交互？ | 调哪些 API？ |
| 优先级/范围 | MVP 还是完整版？ | 先做什么？ |

**流程**：分析不确定性 → 批量提问 → 对齐确认 → **通过才能进入下一步**

**门禁 2：设计澄清** — 7 个维度

架构决策 / 技术选型 / 接口设计 / 数据状态 / 安全合规 / 性能可靠 / 部署运维

> "花 5 分钟澄清，能省 5 小时返工。这个过程是强制的——不可跳过。"

**Surprise Test**：
> "AI 替你做决策时会问自己：'用户看到这个决策会不会惊讶？'如果会——停下来问你。"

---

### 5.3 寄生模式（1 min）

> "技术上的巧妙之处：aspec 不是独立框架，而是'寄生'在 OpenSpec 上。通过 config.yaml 的 context/rules 字段注入增强行为，不修改底层 schema。OpenSpec 升级不受影响。"

---

### 5.4 经验进化系统（2 min）

每次 `/opsx:apply` 完成后**强制**触发：

1. **提取** — 技术决策记录（ADR）/ 领域词汇 / 风险地图 / 复盘记录
2. **应用** — 下次类似任务主动说"根据经验 E3，建议..."
3. **验证** — 标记 ✓有效 / ✗无效 / — 不适用
4. **收敛** — 超过 20 条时合并相似、淘汰无效

> "这对应 Harness Engineering 的 Hashimoto 循环：Agent 犯错 → 诊断根因 → 永久修复环境 → 验证同类错误不再发生。不是一次性的 prompt 修补，而是系统性的环境进化。"

**价值公式**：
- **短期**：避免需求理解偏差（省时间）
- **中期**：AI 对项目越来越熟悉（越用越好）
- **长期**：可追溯的决策记录（审计、知识传承）

---

## 6. 收尾 + Q&A（5 min）

### 6.1 Harness Engineering 视角总结（1 min）

> "回到今天的主线。Ace 做的事情，用 Harness Engineering 的语言总结就是："

| Harness Engineering 原则 | Ace 实践 |
|--------------------------|---------|
| 最小充分上下文 | 渐进式加载（4 层模型） |
| 分层反馈循环 | Hookify → Hooks → 经验进化 |
| 认知分块 | Sub-agent 隔离 + 状态外化 |
| 高杠杆干预 | 改范式（Rules）> 调参数（prompt） |
| 延展而非限制 | 赋能工具（Skills）> 限制规则 |
| 渐进式自主 | 三层复杂度适配 |
| 确定性包裹概率性 | Sensors（Hooks）包裹 Guides（Rules/Skills） |

### 6.2 谁适合用（1 min）

| 场景 | Ace 提供什么 |
|------|-------------|
| **个人开发者** | 专业级 Harness + 复杂任务自主完成 |
| **技术团队** | 统一 Harness 标准 + 安全防护 |
| **企业级采用** | 可审计决策 + 合规 + 可定制 |

### 6.3 快速上手（30 秒）

```bash
npm install -g @shirayner/ace && ace init
```

```
Day 1: 安装，感受基本效果 (5 min)
Week 1: 适应交互模式，体验 Skills
Month 1: 开始自定义，创建团队 Skill
Month 3: 成为开发流程核心，经验系统持续积累
```

### 6.4 结语

> "最后一句话。传统 Prompt Engineering 的思路是：**AI 犯错了，换个说法让它别再犯**。Harness Engineering 的思路是：**AI 犯错了，改环境让它不可能再犯**。"
>
> "Ace 就是后者的工程化实践。如果你每天都在用 Claude Code，试一下。一条命令的事。"
>
> "谢谢大家。"

---

### Q&A 预备问题

| 问题 | 回答要点 |
|------|---------|
| "会不会让 Claude 变慢？" | Rules 加载约增加 2000 tokens（~1%上下文）。因为方向更准确，减少来回修改，总时间反而更短。 |
| "和 Cursor / Windsurf 有什么区别？" | Ace 增强的是底层 Claude 的认知能力，不绑定 IDE。Cursor 的 .cursorrules 相当于只有 Rules 层；Ace 有完整的五层 Harness。 |
| "Harness Engineering 和 Prompt Engineering 什么关系？" | 包含关系。Prompt Engineering ⊂ Context Engineering ⊂ Harness Engineering。Ace 属于最外层——设计完整运行时环境。 |
| "能和团队现有配置共存吗？" | 可以。命名空间隔离（ace/ 前缀），标记合并不覆盖用户内容。 |
| "aspec 对小需求会不会太重？" | aspec 是项目级可选（ace spec init）。日常小任务用 coding skill 即可，无门禁开销。 |
| "token 消耗增加多少？" | Rules ~2000 tokens 固定开销；Skills 按需加载。整体约增加 5-10%，但因减少返工，总消耗通常更低。 |
| "如何升级？" | `npm update -g @shirayner/ace && ace init`，智能合并保留自定义内容。 |
| "和 OpenAI Codex CLI 的 Harness 方案有何不同？" | 同一学科不同实现。Anthropic 哲学是"少脚手架，信任模型"；OpenAI 更强调"设计环境"。Ace 取两者长处：信任模型推理 + 关键位置设门禁。 |

---

## 附录 A：Slide 建议清单

| # | Slide 标题 | 内容类型 | 要点 |
|---|-----------|---------|------|
| 1 | 封面 | Logo + 定位 | "AI Coding Environment" |
| 2 | 痛点 | 4 个痛点 | 配真实场景截图 |
| 3 | 三代范式演进 | 时间线图 | Prompt → Context → Harness |
| 4 | Harness 核心公式 | 公式 + 数据 | LangChain +14% 案例 |
| 5 | Guides vs Sensors | 对比表 | 概率性 vs 确定性 |
| 6 | Ace 定位 | 公式图 | Guides + Sensors + 认知科学 |
| 7 | Demo: 安装 | 终端截图 | `ace init` 交互 |
| 8 | Demo: auto-goal | 对齐截图 | 首轮对齐效果 |
| 9 | Demo: 安全拦截 | 拦截截图 | Hookify 阻止画面 |
| 10 | 五层架构图 | 分层图 | Guides/Sensors 标注 |
| 11 | Harness 组成映射 | 表格 | 5 个组成 → Ace 实现 |
| 12 | Rules 总览 | 表格 | 8 条规则 |
| 13 | Skills + 加载模型 | 图 | 四层渐进式加载 |
| 14 | aspec 三命令 | 流程图 | proposal → apply → archive |
| 15 | 双重门禁 | 维度表 | 6 + 7 维度 |
| 16 | 经验进化循环 | 循环图 | 提取 → 存储 → 应用 → 验证 → 收敛 |
| 17 | 七大原则总结 | 表格 | Harness 原则 → Ace 实践 |
| 18 | 快速上手 | 命令 + 路径 | 安装命令 + 学习路径 |
| 19 | 结语 | 一句话 | "改环境，不改 prompt" |

---

## 附录 B：关键参考资料

| 资料 | 来源 | 要点 |
|------|------|------|
| "My AI Adoption Journey" | Mitchell Hashimoto, 2026-02 | Harness Engineering 首次正式定义 |
| "Harness engineering: leveraging Codex" | OpenAI, 2026-02 | 机构级验证 |
| "Effective harnesses for long-running agents" | Anthropic, 2025-11 | 早期奠基 |
| Guides and Sensors | Birgitta Boeckeler / Martin Fowler, 2026-04 | 分类框架 |
| Awesome CC Harness | wanlanglin | Claude Code Harness 完全指南 |
| LangChain Terminal Bench | LangChain, 2026 | Harness ROI 数据 |
