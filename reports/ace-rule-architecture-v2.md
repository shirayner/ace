# ACE 规则三层架构设计

> 分析日期: 2026-04-23
> 分析主题: ACE 规则分层架构设计 — 全局 ace 命名空间 + 精炼内联 + 路径索引 + 团队规范 + 项目知识生成
> 版本: v2.0 (最终方案)

## 1. 设计背景与问题

### 1.1 当前状态

ACE `v0.1.3` 通过 `ace init` 安装全局 AI coding 规则，覆盖了 Layer 1（通用编码规则）。当前的文件分布：

```
~/.claude/
  ├── rules/ace/                   # 8 个通用规则文件（~8KB）
  │   ├── thinking.md              # 深度思考原则
  │   ├── clean-code.md            # Clean Code 核心原则
  │   ├── code-quality.md          # 代码质量标准
  │   ├── context-hygiene.md       # 上下文卫生
  │   ├── memory-policy.md         # 记忆策略
  │   ├── reporting.md             # 报告输出
  │   ├── task-recovery.md         # 任务恢复
  │   └── interactive-clarify.md   # 交互式澄清
  ├── hooks/ace.*.sh               # Shell hooks（如 Java 编译检查）
  ├── hookify.ace.*.local.md       # 7 个 hookify 安全规则
  ├── memory/                      # 全局记忆
  ├── plugins/                     # ACE 插件（skills）
  ├── settings.json                # 权限 + hooks 配置
  └── CLAUDE.md                    # 全局索引（@ 引用所有规则文件）
```

### 1.2 存在的问题

| 问题 | 表现 | 影响 |
|------|------|------|
| **双重加载** | 规则文件既在 `rules/` 下自动加载，又被 CLAUDE.md `@` 引用 | 冗余 token 消耗 |
| **全量急切加载** | 所有规则文件无 `paths` frontmatter，全部急切加载 | 非编码场景（纯对话、调研）也消耗 ~2000+ tokens |
| **hookify 冗余引用** | hookify `.local.md` 被 `@` 引用到 CLAUDE.md | hookify 插件已自行处理，引用纯属浪费 token |
| **缺少团队规范层** | 无 Layer 2（团队开发规范）支持 | 团队内编码风格不一致 |
| **缺少项目知识层** | 无 Layer 3（项目特定知识）生成机制 | Claude 缺乏项目架构理解 |
| **文件分散** | ACE 文件散布在 `rules/`、`hooks/`、`hookify.*` 等多处 | 维护升级困难 |

### 1.3 设计目标

1. **统一命名空间** — 所有 ACE 自有规则内容集中在 `~/.claude/ace/` 目录下
2. **按需加载** — 通过路径索引 + 系统指令实现 agent 驱动的懒加载
3. **三层覆盖** — 全局规则 → 团队规范 → 项目知识，逐层递进
4. **Token 效率** — 非编码场景最小化 token 消耗
5. **安全零消耗** — 三层安全机制完全独立于上下文，不占 token
6. **团队共享** — 团队规范全局一份，多项目复用；项目知识随项目独立

## 2. 核心设计决策

### 2.1 Claude Code 上下文加载机制（调研结论）

经过对 Claude Code 官方文档的深入研究，确认以下加载机制：

| 加载方式 | 时机 | 条件加载 | Token 消耗 |
|---------|------|---------|-----------|
| `~/.claude/CLAUDE.md` 内容 | 每轮对话注入（系统级） | 不可条件化，**始终加载** | 始终消耗 |
| CLAUDE.md 中 `@path` 引用 | 会话启动时解析并展开 | **不可条件化**，始终急切加载 | 始终消耗 |
| `~/.claude/rules/` 无 frontmatter | 会话启动时自动加载 | **不可条件化** | 始终消耗 |
| `~/.claude/rules/` + `paths` frontmatter | Claude 读取匹配文件时加载 | **可条件化**（唯一原生机制） | 按需消耗 |
| Skills 完整内容 | 技能被调用时加载 | **可条件化**（描述始终加载） | 按需消耗 |
| 子目录 CLAUDE.md | Claude 进入该子目录时加载 | **可条件化** | 按需消耗 |
| CLAUDE.md 中纯文本路径（无 `@`） | Claude Code 不处理 | Claude 模型可用 Read 手动加载 | **零消耗**直到读取 |

**关键发现**：

1. **`@` 引用永远急切加载**，无论文件位置、无论是否有 `paths` frontmatter
2. **`paths` frontmatter 仅对 `~/.claude/rules/` 或 `<project>/.claude/rules/` 下的文件生效**
3. **`paths` 而非 `globs`** — Claude Code 使用 `paths` 字段（`globs` 是 Cursor 的概念）
4. **CLAUDE.md 是系统级文件**，即使上下文压缩也始终存在，路径索引不会丢失

### 2.2 关键设计选择

基于以上调研，做出以下设计选择：

#### 决策 1：文件物理位置 → `~/.claude/ace/`

**选择**：所有 ACE 自有规则内容存放于 `~/.claude/ace/` 命名空间，不放在 `~/.claude/rules/` 下。

**理由**：
- 统一命名空间，维护升级方便（`ace init` 只管理一个目录）
- 避免 `rules/` 目录的自动加载行为（无 `paths` frontmatter 的文件会急切加载）
- ACE 自控加载策略，不依赖 Claude Code 的 rules 系统

**代价**：失去 `paths` frontmatter 条件加载能力（该机制仅对 `rules/` 目录生效）。

**补偿**：通过"精炼内联 + 路径索引"模式实现 agent 驱动的按需加载。

#### 决策 2：加载策略 → 精炼内联 + 路径索引

**选择**：CLAUDE.md 中内联核心原则的精炼版本（~500 tokens），其余规则以纯文本路径形式索引，配合加载指令由 Claude agent 按需 Read。

**理由**：
- CLAUDE.md 是系统级文件，始终在上下文中 → 路径索引永不丢失
- 精炼内联确保核心原则始终生效（不依赖 agent 主动读取）
- 路径 + 加载指令 = 系统级要求，Claude 会遵守
- Token 效率最优：非编码场景仅消耗 ~500 tokens

#### 决策 3：团队规范 → 全局一份，项目按需引用

**选择**：团队规范文件存放于 `~/.claude/ace/team/`（全局），由项目 CLAUDE.md 通过路径索引选择性引用。

**理由**：
- 单一真相源：团队规范变更只改一处
- 多项目复用：所有项目引用同一份文件
- 选择性加载：不同项目可以引用不同的团队规范子集

#### 决策 4：安全机制 → 完全独立于上下文

**选择**：三层安全（settings.json deny / Shell hooks / Hookify 插件）零 token 消耗，从 CLAUDE.md 中移除 hookify `@` 引用。

**理由**：
- Hookify 插件自行扫描 `.local.md` 文件执行规则，不需要 `@` 引用
- 安全规则放在上下文中是"软执行"（Claude 自觉遵守），不如外部机制可靠
- 移除后节省 ~1500 tokens/会话

## 3. 三层规则架构

### 3.1 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    Layer 1: 全局规则                         │
│              ~/.claude/ace/rules/*.md                        │
│                                                             │
│  安装方式: ace init                                          │
│  加载方式: 核心原则精炼内联 + 详细规则路径索引                   │
│  作用域: 所有项目、所有场景                                    │
│  内容: 思考原则、Clean Code、代码质量、上下文卫生等              │
├─────────────────────────────────────────────────────────────┤
│                    Layer 2: 团队规范                         │
│              ~/.claude/ace/team/*.md                         │
│                                                             │
│  安装方式: ace spec init（交互式选择技术栈）                    │
│  加载方式: 项目 CLAUDE.md 路径索引（按项目选择性引用）            │
│  作用域: 全局一份，多项目复用                                   │
│  内容: 编码约定、API 设计标准、Git 规范等                       │
├─────────────────────────────────────────────────────────────┤
│                    Layer 3: 项目知识                         │
│      <project>/CLAUDE.md + <project>/.claude/rules/*.md     │
│                                                             │
│  安装方式: /ace:knowledge skill（AI 扫描生成）                 │
│  加载方式: 项目 CLAUDE.md 内联摘要 + 详细知识路径索引             │
│  作用域: 单个项目                                             │
│  内容: 架构、领域模型、技术栈、关键约束                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Layer 1: 全局规则

**物理位置**：`~/.claude/ace/rules/`

**文件清单**（从当前 `~/.claude/rules/ace/` 迁移）：

| 文件 | 内容 | 加载策略 |
|------|------|---------|
| `thinking.md` | 深度思考原则（序验深广辨简） | 精炼内联到 CLAUDE.md |
| `clean-code.md` | Clean Code 6 条原则 | 精炼内联到 CLAUDE.md |
| `code-quality.md` | 代码质量检查标准 | 路径索引，编辑代码前读取 |
| `context-hygiene.md` | 上下文卫生与压缩保护 | 路径索引，长任务时读取 |
| `memory-policy.md` | 记忆质量策略 | 路径索引，保存记忆前读取 |
| `reporting.md` | 报告输出规则 | 路径索引，生成报告前读取 |
| `task-recovery.md` | 任务恢复规则 | 路径索引，恢复任务时读取 |
| `interactive-clarify.md` | 交互式澄清规则 | 路径索引，需要澄清时读取 |

**设计原则**：
- `thinking.md` 和 `clean-code.md` 是**行为约束型**规则，核心原则必须内联（精炼版 ~500 tokens）
- 其余是**流程指导型**规则，通过路径索引 + 场景触发指令按需读取
- 精炼内联不是删减，而是压缩：保留核心原则的精髓，去除示例和详细说明

### 3.3 Layer 2: 团队规范

**物理位置**：`~/.claude/ace/team/`

**安装方式**：`ace spec init` 扩展，交互式选择技术栈后从模板库安装

**模板库设计**（预置）：

```
templates/team/
  ├── java/
  │   ├── java-conventions.md       # Java 编码约定
  │   ├── spring-conventions.md     # Spring Boot 约定
  │   └── api-standards.md          # RESTful API 设计标准
  ├── typescript/
  │   ├── ts-conventions.md         # TypeScript 编码约定
  │   ├── react-conventions.md      # React 组件约定
  │   └── api-standards.md          # API 设计标准
  ├── go/
  │   ├── go-conventions.md         # Go 编码约定
  │   └── api-standards.md          # API 设计标准
  └── common/
      ├── git-conventions.md        # Git 工作流规范
      ├── code-review.md            # Code Review 标准
      └── naming-conventions.md     # 通用命名规范
```

**安装流程**：
1. `ace spec init` → 交互选择技术栈（Java / TypeScript / Go / 其他）
2. 安装 `common/` + 所选技术栈的模板到 `~/.claude/ace/team/`
3. 用户可自定义修改安装后的文件

**更新流程**：
- `ace spec update` → 更新模板内容（ACE 拥有的文件直接覆盖）
- 用户自定义文件不被覆盖（通过 ACE_OWNED_PATTERNS 区分）

### 3.4 Layer 3: 项目知识

**物理位置**：
- 核心摘要 → `<project>/CLAUDE.md`（managed section）
- 详细知识 → `<project>/.claude/rules/*.md`（可选，需要文件级条件加载时使用 `paths` frontmatter）

**生成方式**：`/ace:knowledge` skill（新建）

**生成流程**：
1. 扫描项目代码 → 推断技术栈、框架、构建工具
2. 分析目录结构 → 识别架构模式（MVC / 微服务 / 单体 / monorepo）
3. 读取关键配置 → 提取版本约束、依赖关系
4. 检查现有文档 → 提取领域概念和业务约束
5. 生成报告 → 用户 review 确认
6. 写入 → 更新 project CLAUDE.md 的 managed section + 生成详细知识文件

**产出结构**：

```markdown
# <project>/CLAUDE.md

<!-- ace:project:start -->
## 项目概况
- 技术栈: Spring Boot 3.2 + MyBatis + Redis
- 架构: 微服务（酒店搜索聚合服务）
- 构建: Maven 3.9, Java 21
- 关键约束: P99 < 200ms, 日均请求 50M

## 团队规范（编辑代码前先阅读对应规则）
- ~/.claude/ace/team/java-conventions.md — Java 编码约定
- ~/.claude/ace/team/spring-conventions.md — Spring Boot 约定
- ~/.claude/ace/team/api-standards.md — API 设计标准
- ~/.claude/ace/team/git-conventions.md — Git 工作流规范

## 项目知识（相关工作时参考）
- .claude/rules/architecture.md — 服务架构与模块职责
- .claude/rules/domain.md — 领域模型与核心概念
<!-- ace:project:end -->
```

**为什么分两层存储**：
- 项目 CLAUDE.md 的 managed section：核心摘要 + 路径索引，始终在项目上下文中（因为 project CLAUDE.md 进入项目就加载）
- `.claude/rules/*.md`：详细知识，支持 `paths` frontmatter 条件加载（编辑特定目录/文件类型时才加载）

## 4. 目录结构与 CLAUDE.md 模板

### 4.1 全局目录结构

```
~/.claude/
  │
  ├── ace/                              ← ACE 统一命名空间（新）
  │   ├── rules/                       # Layer 1: 全局通用规则
  │   │   ├── thinking.md              # 深度思考原则
  │   │   ├── clean-code.md            # Clean Code 核心原则
  │   │   ├── code-quality.md          # 代码质量标准
  │   │   ├── context-hygiene.md       # 上下文卫生
  │   │   ├── memory-policy.md         # 记忆策略
  │   │   ├── reporting.md             # 报告输出规则
  │   │   ├── task-recovery.md         # 任务恢复规则
  │   │   └── interactive-clarify.md   # 交互式澄清规则
  │   │
  │   └── team/                        # Layer 2: 团队规范
  │       ├── java-conventions.md      # Java 编码约定
  │       ├── spring-conventions.md    # Spring Boot 约定
  │       ├── api-standards.md         # API 设计标准
  │       ├── git-conventions.md       # Git 工作流规范
  │       └── code-review.md           # Code Review 标准
  │
  ├── hookify.ace.*.local.md            ← Hookify 安全规则（插件固定位置，不能移）
  ├── hooks/ace.*.sh                    ← Shell hooks（Claude Code 固定位置，不能移）
  ├── plugins/                          ← 插件（Claude Code 固定位置）
  ├── memory/                           ← 记忆（共享资源）
  ├── settings.json                     ← 配置
  └── CLAUDE.md                         ← 全局索引
```

**不能移入 `ace/` 的文件**（由外部系统决定位置）：

| 文件 | 原因 | 管理方式 |
|------|------|---------|
| `hookify.ace.*.local.md` | hookify 插件按命名模式扫描 `~/.claude/` 根目录 | ACE_OWNED_PATTERNS 管理 |
| `hooks/ace.*.sh` | Claude Code 固定 hooks 目录 | ACE_OWNED_PATTERNS 管理 |
| `settings.json` | Claude Code 配置文件 | 深度合并策略 |
| `plugins/` | Claude Code 插件目录 | 插件注册机制 |
| `memory/` | Claude Code 记忆目录 | 共享资源 |

### 4.2 项目级目录结构

```
<project>/
  ├── CLAUDE.md                        ← 项目索引（ace:knowledge skill 生成）
  │                                      包含：项目摘要 + 团队规范路径 + 项目知识路径
  │
  ├── .claude/
  │   ├── rules/                       # Layer 3: 项目特定知识（可选）
  │   │   ├── architecture.md          # 架构知识（paths: ["src/**"]）
  │   │   └── domain.md               # 领域知识
  │   └── settings.local.json          # 项目特定配置
  │
  └── openspec/                        ← OpenSpec 工作流（ace spec init）
      ├── config.yaml
      └── templates/
```

### 4.3 全局 CLAUDE.md 模板

```markdown
<!-- ace:managed:start -->
# ACE 配置

## 核心原则（始终适用）

**深度思考** — 理解先于规划，规划先于行动。用事实闭环，不以假设收尾。多问一层为什么，在系统中定位局部。主动找反证，复杂度是负债。

**Clean Code** — 意图清晰（命名即意图）、单一职责（一个理由改变）、最小 Surprise（做读者期望的事）、DRY（知识只表达一次）、简洁胜于复杂（KISS/YAGNI）、渐进改进（离开时更干净）。

**优先级** — 正确性 > 可读性 > 清晰 > 简单 > 显式。

## 编码规则（编辑代码前，先阅读对应规则文件）
- ~/.claude/ace/rules/code-quality.md — 代码质量标准（函数/命名/结构/SOLID 检查清单）
- ~/.claude/ace/rules/clean-code.md — Clean Code 详细原则与反模式速查

## 工作流规则（对应场景时参考）
- ~/.claude/ace/rules/context-hygiene.md — 上下文卫生与压缩保护（长任务时阅读）
- ~/.claude/ace/rules/task-recovery.md — 任务恢复流程（用户说"继续"时阅读）
- ~/.claude/ace/rules/reporting.md — 报告输出规则（生成报告前阅读）
- ~/.claude/ace/rules/memory-policy.md — 记忆质量策略（保存记忆前阅读）
- ~/.claude/ace/rules/interactive-clarify.md — 交互式澄清规则（需要提问时阅读）

## 安全策略
安全由外部机制保障，不占用上下文 token：
- settings.json deny 规则 → 硬拦截 rm -rf、sudo 等
- Shell hooks → 进程级检查（编译、类型检查）
- Hookify 插件 → 模式匹配拦截（危险命令、敏感文件）
<!-- ace:managed:end -->
```

**Token 消耗估算**：

| 部分 | 内容 | 估算 Tokens |
|------|------|------------|
| 核心原则（精炼内联） | 思考 + Clean Code + 优先级 | ~200 |
| 编码规则路径索引 | 2 个路径 + 描述 | ~60 |
| 工作流规则路径索引 | 5 个路径 + 描述 + 场景触发指令 | ~150 |
| 安全策略概要 | 3 行说明 | ~50 |
| **合计** | | **~460 tokens** |

对比当前：~2000+ tokens（8 个完整规则文件 + hookify 引用）→ 节省约 **75%**。

### 4.4 项目 CLAUDE.md 模板

```markdown
<!-- ace:project:start -->
## 项目概况
- 技术栈: [自动检测]
- 架构: [自动识别]
- 构建: [自动检测]
- 关键约束: [用户补充]

## 团队规范（编辑代码前先阅读对应规则）
- ~/.claude/ace/team/[tech]-conventions.md — [技术栈]编码约定
- ~/.claude/ace/team/api-standards.md — API 设计标准
- ~/.claude/ace/team/git-conventions.md — Git 工作流规范

## 项目知识（相关工作时参考）
- .claude/rules/architecture.md — 服务架构与模块职责
- .claude/rules/domain.md — 领域模型与核心概念
<!-- ace:project:end -->
```

## 5. 安全架构（零 Token 消耗）

### 5.1 三层安全执行模型

```
               ┌──────────────────────────────────────┐
               │         Layer 3: Hookify 插件         │
               │    模式匹配 → block / warn            │
               │    hookify.ace.*.local.md              │
               │    零 token，插件自行扫描执行           │
               ├──────────────────────────────────────┤
               │         Layer 2: Shell Hooks          │
               │    PostToolUse → 编译检查 / 类型检查    │
               │    hooks/ace.*.sh                      │
               │    零 token，exit code 拦截            │
               ├──────────────────────────────────────┤
               │         Layer 1: 权限 Deny            │
               │    settings.json deny 规则             │
               │    rm -rf / sudo / curl --data 等      │
               │    零 token，权限层硬拦截              │
               └──────────────────────────────────────┘
```

### 5.2 各层职责

| 层级 | 机制 | 执行方式 | 强度 | Token 消耗 |
|------|------|---------|------|-----------|
| **Layer 1: Deny** | `settings.json` 权限规则 | Claude Code 权限系统硬拦截 | 绝对阻止 | 零 |
| **Layer 2: Hooks** | Shell 脚本 + `PostToolUse` | 进程级检查，exit code 决定通过/阻止 | 硬拦截 | 零 |
| **Layer 3: Hookify** | 声明式 YAML + markdown 规则 | hookify 插件扫描 `.local.md` 并执行 | block/warn | 零 |

### 5.3 设计变更：移除 CLAUDE.md 中的 Hookify 引用

**当前状态**（问题）：
```markdown
## Added by ace
- @~/.claude/hooks/ace.hookify.block-dangerous-ops.local.md
- @~/.claude/hooks/ace.hookify.protect-secrets.local.md
- @~/.claude/hooks/ace.hookify.safe-git-commands.local.md
- @~/.claude/hooks/ace.hookify.code-quality-gate.local.md
```

**问题分析**：
- Hookify 插件自行扫描 `~/.claude/` 下的 `.local.md` 文件，不需要 `@` 引用
- `@` 引用导致这些文件内容被加载到上下文中（~1500 tokens），纯属浪费
- 上下文中的规则是"软执行"（Claude 自觉遵守），不如插件的"硬执行"可靠

**变更方案**：
1. 从 CLAUDE.md 中删除所有 hookify `@` 引用
2. Hookify 规则文件保持原位（`~/.claude/hookify.ace.*.local.md`）
3. 在 CLAUDE.md 安全策略概要中简要说明（3 行，~50 tokens）

**效果**：节省 ~1500 tokens/会话，安全性不变（甚至更好，因为硬执行 > 软执行）。

### 5.4 当前 Deny 规则

```json
{
  "deny": [
    "Bash(rm -rf*)",
    "Bash(sudo*)",
    "Bash(curl*--data*)",
    "Write(*.env)",
    "Write(*id_rsa*)"
  ]
}
```

这些规则在权限层硬拦截，Claude 甚至无法尝试执行。

## 6. 实现路径

### 6.1 实现范围

| 模块 | 变更类型 | 优先级 |
|------|---------|--------|
| `ace init` 重构 | 改变规则安装位置 + 更新 CLAUDE.md 模板 | P0 |
| `ace spec init` 扩展 | 新增团队规范安装流程 | P1 |
| `/ace:knowledge` skill | 新建项目知识生成 skill | P1 |
| `ace spec update` 扩展 | 支持团队规范更新 | P2 |
| `ace uninstall` 适配 | 适配新目录结构 | P2 |

### 6.2 Phase 1: ace init 重构（P0）

#### 6.2.1 目录迁移

**变更**：规则文件从 `~/.claude/rules/ace/` 迁移到 `~/.claude/ace/rules/`。

**影响的文件**：
- `src/core/constants.js` — 修改组件定义中的目标路径
- `src/core/installer.js` — 创建 `~/.claude/ace/` 目录结构
- `src/core/merger.js` — 更新 CLAUDE.md 合并逻辑（新模板格式）
- `src/commands/uninstall.js` — 清理新目录
- `templates/CLAUDE.md` — 新模板（精炼内联 + 路径索引，无 `@` 引用）
- `templates/rules/ace/*.md` — 移动到 `templates/ace/rules/`

**迁移策略**：
```
1. ace init 检测旧目录 ~/.claude/rules/ace/ 是否存在
2. 如存在，自动迁移到 ~/.claude/ace/rules/
3. 清理旧目录（删除 ~/.claude/rules/ace/）
4. 更新 CLAUDE.md（替换 managed section）
5. 移除 hookify @ 引用
```

**ACE_OWNED_PATTERNS 更新**：
```javascript
export const ACE_OWNED_PATTERNS = [
  /^ace\/rules\//,          // ace/rules/*.md（新）
  /^ace\/team\//,           // ace/team/*.md（新）
  /^hooks\/ace\./,          // hooks/ace.*.sh（不变）
  /^hookify\.ace\./,        // hookify.ace.*.local.md（不变）
];
```

#### 6.2.2 CLAUDE.md 模板更新

**从**：
```markdown
<!-- ace:managed:start -->
- @~/.claude/rules/ace/thinking.md - 深度思考原则
- @~/.claude/rules/ace/clean-code.md - Clean Code 核心原则
...
<!-- ace:managed:end -->
```

**到**：
```markdown
<!-- ace:managed:start -->
# ACE 配置
## 核心原则（始终适用）
[精炼内联内容]
## 编码规则（编辑代码前先阅读）
[路径索引]
## 工作流规则（对应场景时参考）
[路径索引 + 触发指令]
## 安全策略
[简要概述]
<!-- ace:managed:end -->
```

### 6.3 Phase 2: ace spec init 扩展 — 团队规范（P1）

#### 6.3.1 交互流程

```
$ ace spec init

? 选择团队技术栈（可多选）
  ● Java / Spring Boot
  ○ TypeScript / React
  ○ Go
  ○ Python

? 选择通用规范
  ● Git 工作流规范
  ● Code Review 标准
  ○ 通用命名规范

正在安装团队规范到 ~/.claude/ace/team/ ...
  ✓ java-conventions.md
  ✓ spring-conventions.md
  ✓ api-standards.md
  ✓ git-conventions.md

正在安装 OpenSpec ...
  ✓ openspec 初始化完成

安装完成！
- 团队规范: ~/.claude/ace/team/ (4 个文件)
- OpenSpec: <project>/openspec/
- 提示: 运行 /ace:knowledge 在项目中生成项目知识
```

#### 6.3.2 实现要点

**影响的文件**：
- `src/commands/spec.js` — 新增团队规范安装步骤
- `src/core/spec-installer.js` — 新增 `installTeamRules()` 方法
- `src/core/constants.js` — 新增团队规范模板定义
- `templates/team/` — 新增团队规范模板库

**安装逻辑**：
```javascript
async installTeamRules(techStack, conventions) {
  const targetDir = path.join(CLAUDE_DIR, 'ace', 'team');
  // 1. 安装 common/ 下选中的规范
  // 2. 安装 techStack 对应的规范
  // 3. 标记为 ACE-owned（升级时可覆盖）
}
```

### 6.4 Phase 2: /ace:knowledge Skill（P1）

#### 6.4.1 Skill 定义

```yaml
name: knowledge
description: 扫描项目代码，生成项目知识到 CLAUDE.md 和 .claude/rules/
trigger: 用户要求"生成项目知识"、"初始化项目"、"让 Claude 了解项目"
```

#### 6.4.2 执行流程

```
1. 扫描阶段（sub-agent 隔离）
   ├── 检测技术栈（package.json / pom.xml / go.mod / ...）
   ├── 分析目录结构（识别架构模式）
   ├── 读取配置文件（版本、依赖、构建工具）
   └── 检查现有文档（README、docs/、wiki）

2. 生成阶段
   ├── 生成项目概况摘要
   ├── 匹配已安装的团队规范 → 生成路径引用
   ├── 生成架构知识文件 → .claude/rules/architecture.md
   └── 生成领域知识文件 → .claude/rules/domain.md（如有足够信息）

3. 确认阶段
   ├── 向用户展示生成内容
   ├── 用户 review + 修改
   └── 写入文件

4. 更新阶段（后续运行）
   ├── 检测已有 project CLAUDE.md
   ├── 只更新 managed section
   └── 保留用户自定义内容
```

#### 6.4.3 项目知识规则文件示例

```markdown
---
paths:
  - "src/**"
  - "lib/**"
---
# 服务架构

## 模块职责
- `src/controller/` — HTTP 入口层，请求校验和响应封装
- `src/service/` — 业务逻辑层，核心业务编排
- `src/repository/` — 数据访问层，MyBatis Mapper
- `src/client/` — 外部服务调用，Feign/HTTP Client

## 关键设计决策
- 使用 Redis 做二级缓存，TTL 5 分钟
- 搜索聚合走异步并发调用，超时 100ms 降级
```

> 注意：项目 `.claude/rules/` 下的文件支持 `paths` frontmatter 条件加载。这与全局 `~/.claude/ace/` 目录（不在 `rules/` 下，不支持 `paths`）的策略不同。

### 6.5 迁移兼容方案

```
ace init（v2.0）执行时：

1. 检测旧目录
   - ~/.claude/rules/ace/ 存在？→ 迁移内容到 ~/.claude/ace/rules/
   - 迁移完成后删除 ~/.claude/rules/ace/

2. 更新 CLAUDE.md
   - 替换 managed section（新模板：精炼内联 + 路径索引）
   - 移除 hookify @ 引用（无论在 managed 内还是外）
   - 保留用户在 managed section 外的自定义内容

3. 创建新目录
   - ~/.claude/ace/rules/（从模板安装）
   - ~/.claude/ace/team/（空目录，等待 ace spec init 填充）

4. 向后兼容
   - 旧版本 ace spec update 不会破坏新结构
   - 新版本 ace init 可以在旧/新结构上都正确运行
```

## 7. 总结

### 7.1 架构全景

```
                 ┌─────────────────────────────────────────────────────┐
                 │               Claude Context Window                 │
                 │                                                     │
                 │  ┌──────────────────────────────────────────────┐  │
                 │  │  ~/.claude/CLAUDE.md（始终加载，~460 tokens） │  │
                 │  │  ┌─ 核心原则精炼内联（~200 tokens）           │  │
                 │  │  ├─ 规则路径索引 + 加载指令                    │  │
                 │  │  └─ 安全策略概要                              │  │
                 │  └──────────────────────────────────────────────┘  │
                 │                                                     │
                 │  ┌──────────────────────────────────────────────┐  │
                 │  │  <project>/CLAUDE.md（进入项目时加载）         │  │
                 │  │  ┌─ 项目概况摘要                              │  │
                 │  │  ├─ 团队规范路径索引 → ~/.claude/ace/team/    │  │
                 │  │  └─ 项目知识路径索引 → .claude/rules/         │  │
                 │  └──────────────────────────────────────────────┘  │
                 │                                                     │
                 │  ┌──────────────────────────────────────────────┐  │
                 │  │  按需加载区（Claude Read 时才进入）             │  │
                 │  │  ├─ ~/.claude/ace/rules/code-quality.md      │  │
                 │  │  ├─ ~/.claude/ace/team/java-conventions.md   │  │
                 │  │  └─ .claude/rules/architecture.md            │  │
                 │  └──────────────────────────────────────────────┘  │
                 └─────────────────────────────────────────────────────┘

                 ┌─────────────────────────────────────────────────────┐
                 │         安全层（上下文之外，零 token）               │
                 │  ├─ settings.json deny 规则                        │
                 │  ├─ hooks/ace.*.sh                                  │
                 │  └─ hookify.ace.*.local.md                         │
                 └─────────────────────────────────────────────────────┘
```

### 7.2 关键指标

| 指标 | 当前（v0.1.3） | 目标（v2.0） | 改善 |
|------|---------------|-------------|------|
| 非编码场景 token | ~2000+ | ~460 | **-77%** |
| 编码场景 token | ~2000+ | ~460 + 按需（~1000） | 相近但更精准 |
| 安全 token | ~1500 | 0 | **-100%** |
| 团队规范支持 | 无 | 全局一份 + 项目选择 | 新能力 |
| 项目知识支持 | 无 | AI 扫描生成 | 新能力 |
| 文件组织 | 分散 4 处 | `ace/` 命名空间 + 2 固定位置 | 更清晰 |

### 7.3 实现优先级

```
Phase 1 (P0): ace init 重构
  → 新目录结构 + 新 CLAUDE.md 模板 + 迁移兼容
  → 预计影响: constants.js, installer.js, merger.js, uninstall.js, templates/

Phase 2 (P1): ace spec init + /ace:knowledge
  → 团队规范安装 + 项目知识生成
  → 预计影响: spec.js, spec-installer.js, 新 skill 文件, 新模板库

Phase 3 (P2): 完善
  → ace spec update 团队规范更新 + ace uninstall 适配
```
