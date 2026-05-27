# CLI 界面设计深度分析报告

> 分析目标：为 ace init 命令行体验优化提供设计参考  
> 分析日期：2026-04-20

---

## 一、ace init 现状速写

当前 ace init 使用 **inquirer + ora + chalk** 构建，流程为：

```
Banner → 选择角色（inquirer list）→ 冲突处理（inquirer list）→ 安装进度（ora spinner）→ 总结
```

**当前痛点观察**：
- 仅有两个交互步骤（Role 和 Conflict），缺乏对 preset 选择、组件定制等维度的交互引导
- `renderScreen` 每步清屏重绘，导致用户失去上下文（之前选了什么？）
- 冲突处理只有"全部保留"或"全部覆盖"两个极端选项
- 安装进度是顺序的 spinner，无整体进度感知
- 无 dry-run 预览、无安装后的 next steps 引导

---

## 二、CLI UX 设计通用原则

### 2.1 经典规范体系

| 规范 | 核心贡献 |
|------|----------|
| **POSIX/GNU** | 流分离（stdout=数据, stderr=诊断）、退出码语义、短/长选项对称 |
| **12 Factor CLI** | Help 即文档、Prefer Flags to Args、Be Fancy（TTY 时丰富，管道时朴素） |
| **CLIG (clig.dev)** | Human-first、Saying Just Enough、Empathy、Conversation as Norm |
| **Ink** | 声明式 UI、Flexbox 终端布局、React 组件化思维 |

### 2.2 六条核心设计原则

#### 原则一：零配置可用

> 不改任何配置就能跑起来。默认值应覆盖最常见场景。

**正面**：`bun init` — 零问题即可创建项目，速度即核心 UX。  
**反面**：要求用户回答 10 个问题才能开始，其中 8 个有明确的"正确答案"。

**对 ace 的启示**：`ace init` 应该能一行命令零交互完成安装（通过 flags），交互模式只是友好的补充路径。

#### 原则二：渐进式披露（Progressive Disclosure）

> 只在需要时展示复杂性。简单入门，按需深入。

三级结构：
- **一级**：最常用功能无需配置即可工作
- **二级**：通过 `--help` 展示常用选项
- **三级**：通过配置文件、环境变量暴露高级能力

**对 ace 的启示**：默认路径应极简（如 `ace init` 直接安装 full preset），高级定制通过 flags 或显式的 `--interactive` 模式触发。

#### 原则三：双模式支持

> 交互式 + Flag 完备，缺一不可。向导式作为友好入口，命令式作为高效路径。

```bash
# 向导模式
$ ace init

# 命令模式（CI/脚本友好）
$ ace init --preset full --role backend --force
```

缺少必要参数时提示补全，但所有提示都可通过 flag 跳过。

#### 原则四：安全默认 + 确认分级

按破坏程度分级确认：

| 级别 | 场景 | 确认方式 |
|------|------|----------|
| 轻度 | 新增文件 | 静默执行 |
| 中度 | 覆盖已有文件 | 交互确认 + `--dry-run` 预览 |
| 重度 | 删除/重写关键配置 | 要求 `--force` 显式确认 |

**铁律**：可逆操作静默执行，不可逆操作显式确认。`--dry-run` 是最被低估的安全网。

#### 原则五：100ms 响应规则

- **<100ms**：即时反馈
- **<2s**：spinner 即可
- **2-30s**：进度条 + 百分比
- **>30s**：进度条 + 预估时间 + 当前步骤

**非 TTY 环境**：禁止动画，改用行式日志。

#### 原则六：错误即引导

好的错误消息遵循三段式：**What → Why → How to fix**

```
# 反面
Error: EACCES permission denied

# 正面
Error: Could not write to ~/.claude/settings.json
  Reason: Permission denied (running as user 'dev')
  Fix: Check file permissions, or run:
       chmod u+w ~/.claude/settings.json
```

### 2.3 现代 CLI 工具设计趋势（2023-2025）

| 工具 | 设计亮点 | 对 ace 的启示 |
|------|----------|--------------|
| **create-next-app** | 向导式 + 所有选项可 flag 化 | 双模式的标杆实现 |
| **bun init** | 极简默认值，零问题创建 | 速度和简洁是 UX |
| **@clack/prompts** | 声明式 API，分组提示，视觉层次 | 提示库升级方向 |
| **pnpm** | 严格默认值（安全默认典范） | 安全 > 便利 |

**共同趋势**：零配置可用 → 渐进式自定义 → 完整 flag 控制。

### 2.4 @clack/prompts 设计哲学

新一代 CLI 提示库的代表，与 ace 当前使用的 inquirer 形成鲜明对比：

| 维度 | inquirer | @clack/prompts |
|------|----------|----------------|
| API 风格 | 配置对象 + 回调 | 声明式函数调用 |
| 视觉风格 | 传统列表选择 | 现代竖线连接，语义化组件 |
| 分组能力 | 无 | `group()` 将关联问题组织为逻辑单元 |
| 取消处理 | 需手动处理 | 内置取消回滚 |
| 语义组件 | spinner 只 | `intro()` / `outro()` / `spinner()` / `note()` / `log` |

**核心洞察**：提示库不只是"问问题"——它在构建一段**有节奏感的对话体验**。@clack/prompts 的竖线连接风格形成视觉流，让用户感知到"我在一段连贯的向导流程中"。

### 2.5 视觉设计规范

**色彩语义**：红=错误，黄=警告，绿=成功，蓝/灰=信息。必须尊重 `NO_COLOR` 和 `TERM=dumb`。

**排版层次**：
- Unicode box-drawing 字符（`│` `┌` `└`）创造视觉结构
- 空行分隔逻辑段落
- 缩进表达层级关系
- 符号（`✓` `✗` `◆`）提供视觉锚点

### 2.6 反模式速查

| 反模式 | 后果 |
|--------|------|
| 强制交互，无 flag 替代 | CI/脚本环境无法使用 |
| 成功时无输出 | 用户以为命令失败 |
| 默认输出 stack trace | 非开发者用户恐慌 |
| 不检测 TTY 直接着色 | 管道输出充满转义字符 |
| 所有选项平铺在首屏 help | 信息过载，核心功能淹没 |
| 自动执行"纠正"的命令 | 掩盖逻辑错误 |
| 每步清屏丢失上下文 | 用户迷失在流程中 |

---

## 三、Claude Code CLI 界面设计剖析

### 3.1 技术栈

Claude Code 使用 **TypeScript** 编写，运行在 **Bun** 之上，UI 层采用 **React + Ink** 架构。React 负责组件化开发和状态管理，Ink 将 React 组件渲染到终端。CLI 参数解析使用 Commander.js，输入校验使用 Zod。

这标志着 CLI 从"字符串拼接"进化到"UI 工程"——Ink 的 Flexbox 布局 + React 生命周期让终端 UI 具备了 Web 级别的开发体验。

### 3.2 视觉设计原则

**色彩方案**：使用硬编码 RGB 色值（非 ANSI 语义色彩），保证品牌一致性。用户可通过 `/color` 自定义 prompt bar 颜色。

**进度反馈**：ASCII 字符 + ANSI 转义码实现 spinner 动画，包含确定性进度条和不确定性旋转器两种模式。默认 ASCII-only 保证跨终端兼容性。

**信息层次**：工具名称和操作描述突出展示，具体参数和执行细节作为次级信息。这是"渐进式披露"在实时输出中的应用。

### 3.3 权限模型的交互设计（核心亮点）

Claude Code 的权限系统是其交互设计的**核心创新**。当触发敏感操作时，提示框展示四项信息：

1. **工具名称** — 什么工具在请求权限
2. **操作描述** — 具体要做什么
3. **具体输入** — 实际参数是什么
4. **审批原因** — 为什么需要审批

用户可选择：
- **y / Enter** — 允许本次
- **n** — 拒绝本次
- **always allow** — 永久允许此工具/命令前缀
- **always deny** — 永久禁止

**设计哲学**：渐进式信任体系，而非二元开关。

权限规则按 **Deny > Ask > Allow** 优先级求值，支持五种操作模式从最谨慎到最自主递进。这体现了：
- **安全默认**：只读操作默认放行，写操作需审批，破坏性操作需显式确认
- **信任可积累**：用户的 "always allow" 逐步建立信任关系
- **可逆性**：任何权限决策都可以在设置中修改

### 3.4 Onboarding 设计

1. 首次运行触发浏览器 OAuth 认证
2. 进入会话后展示欢迎界面与操作提示
3. 推荐以探索性提问开始（"what does this project do?"）
4. 代码修改以 diff 形式展示，需用户确认后写入

**CLAUDE.md 机制**：项目根目录的持久上下文文件，避免每次会话重复说明——这是"零配置"与"可定制"的平衡点。

### 3.5 Claude Code 的设计原则总结

| 原则 | 体现 |
|------|------|
| **CLI-first** | 直接与模型交互，避免 IDE 插件的间接性 |
| **上下文效率** | 复用标准 CLI 工具而非自建封装 |
| **模块化工具** | 每个工具自包含：Schema + 权限 + 执行逻辑 + UI 组件 |
| **自验证** | 鼓励通过测试、linter 自行验证工作成果 |
| **渐进式信任** | 权限从保守开始，用户逐步放开 |

---

## 四、AskUserQuestion 工具界面设计剖析

### 4.1 信息架构：三层认知结构

AskUserQuestion 的 `header + question + options` 对应人类处理信息的三个认知层次：

```
header (≤12 字符)  →  分类定位（一眼知道在讨论什么维度）
question           →  理解语义（完整的决策上下文）
options (2-4 个)    →  做出决策（收敛为有限选择）
  ├── label (1-5 词)      →  快速扫描
  └── description         →  深入理解
```

这个结构在每一层都实现了"快速扫描 + 深入理解"的双层模式。

### 4.2 约束背后的认知科学

| 约束 | 限制值 | 认知原理 |
|------|--------|----------|
| 问题数 | 1-4 个 | Miller's Law（工作记忆 7±2）× 决策负载衰减 |
| 选项数 | 2-4 个 | Hick's Law + Barry Schwartz 选择悖论 |
| header | ≤12 字符 | 视觉扫描的"一眼可读"阈值 |
| label | 1-5 词 | 短期记忆中的对比单元 |

**深层设计意图**：这些限制不仅约束用户的认知负载，更**约束 agent 的输出质量**。没有字数限制的 agent 倾向于输出冗长描述，限制迫使 agent 做信息压缩——而压缩本身就是理解的证明。

### 4.3 关键设计决策

#### "Other" 选项始终存在

这是一个**认知谦逊**的设计。agent 的选项本质上是基于当前理解生成的假设空间，但 agent 的理解一定不完备。永久存在的 "Other" 承认了这种不完备性，将最终决策权交还用户。它同时是 agent 扩展认知边界的**学习通道**。

#### 批量提问而非逐个提问

三个优势：
1. **减少中断** — 用户一次进入"决策模式"，中断从 N 次降为 1 次
2. **问题间可交叉参考** — 用户看到全部问题后可能发现 Q3 的答案影响 Q1
3. **传递确定性信号** — 4 个问题意味着 agent 只有 4 个不确定点，其余已自主解决

#### preview 功能

当选项附带预览时，界面切换为**左右分栏布局**。这解决了技术决策的核心痛点：不应仅基于抽象描述，用户需要看到**具体的代码/配置差异**才能做出知情决策。

将决策从"想象中比较"升级为"眼见为实地比较"。

### 4.4 与传统 CLI 提示工具的本质差异

| 维度 | 传统工具 (inquirer / @clack) | AskUserQuestion |
|------|------------------------------|-----------------|
| **问题来源** | 编码时写死 | agent 运行时动态生成 |
| **选项来源** | 配置文件/枚举值 | agent 对问题空间的分析结果 |
| **preview** | 无此概念 | 基于代码理解动态生成 |
| **"Other"** | 自由输入收集数据 | agent 扩展认知的学习通道 |
| **批量提问** | 顺序执行（不知后续是否依赖前序） | 智能判定独立性后批量呈现 |
| **约束目标** | 面向用户输入（验证、格式） | 同时面向 agent 输出（质量规训） |

**一句话总结**：AskUserQuestion 的设计哲学是——**在 agent 自主性与用户控制权之间找到最高效的信息交换协议**。它不是简单的"问一下用户"，而是一套经过认知科学约束的、面向 AI-Human 协作的结构化通信规范。

---

## 五、综合洞察：三个设计思想的交汇

### 5.1 共同的底层逻辑

三个研究维度（通用 CLI 原则、Claude Code 设计、AskUserQuestion 设计）指向同一个核心矛盾：

> **简单 vs 强大** — 或更精确地说：**低认知负载 vs 高可控性**

解决方案的共识是**渐进式披露**：

```
零配置可用（默认路径）
  → 交互式引导（友好路径）
    → 完整 flag 控制（专家路径）
      → 配置文件定制（持久化路径）
```

### 5.2 三层设计框架

| 层次 | 关注点 | 关键原则 |
|------|--------|----------|
| **信息架构层** | 展示什么、隐藏什么 | 渐进披露、信息层次、认知预算 |
| **交互流程层** | 何时问、问什么、怎么问 | 双模式、安全默认、确认分级、批量优于逐个 |
| **视觉表现层** | 看起来如何 | 色彩语义、排版节奏、符号锚点、环境感知 |

### 5.3 对 ace init 优化的设计启示

#### 启示一：对话节奏感

ace init 不是"问几个问题然后安装"，而是一段**有节奏的对话**。@clack/prompts 的 `intro → group → spinner → outro` 结构提供了一个完整的叙事弧线。

#### 启示二：智能默认 + 渐进定制

```
ace init                           # 零配置，full preset，检测环境自动选 role
ace init --preset safe             # 一个 flag 调整
ace init --interactive             # 完整向导模式
ace init --preset full --role backend --force  # CI 友好的完全命令式
```

#### 启示三：不可逆操作分级确认

当前的"全部保留 vs 全部覆盖"过于粗暴。应该按文件级别展示冲突，提供 `--dry-run` 预览。

#### 启示四：安装后的 Next Steps

当前的 "Run ace doctor to verify" 过于单薄。参考 create-next-app 的做法，应该给出：
- 安装了什么（摘要）
- 下一步可以做什么（具体命令）
- 如何获取帮助

#### 启示五：AskUserQuestion 模式的借鉴

如果 ace init 未来集成到 Claude Code 的 AI 工作流中（作为 skill 或 tool），其交互可以借鉴 AskUserQuestion 的设计：
- 批量问题减少中断
- 选项附带 preview 展示具体差异
- "Other" 作为逃生阀
- 约束 agent 的输出质量

---

## 六、附录：参考资料

- [Command Line Interface Guidelines (clig.dev)](https://clig.dev)
- [12 Factor CLI Apps](https://medium.com/@jdxcode/12-factor-cli-apps-dd3c227a0e46)
- [Ink - React for CLI](https://github.com/vadimdemedes/ink)
- [@clack/prompts](https://github.com/bombshell-dev/clack)
- [GNU Coding Standards - CLI](https://www.gnu.org/prep/standards/html_node/Command_002dLine-Interfaces.html)
- [Claude Code Documentation](https://docs.anthropic.com/en/docs/claude-code)
- [The Art of Command Line](https://github.com/jlevy/the-art-of-command-line)
