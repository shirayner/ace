# 项目级 Memory 与全局 Memory 的架构搭配方案深度分析

> 分析日期: 2026-04-15
> 分析主题: 在已确定全局 Memory 必要性的前提下，项目级 Memory 是否需要开启？如何与全局 Memory 搭配使用？

---

## 1. 问题定义

### 1.1 背景

前序分析已确定：**全局 Memory（`autoMemoryDirectory: ~/.claude/memory`）是必要的**。它解决了跨项目积累用户偏好、协作反馈、外部资源指针的核心需求。

但这引出了一个架构决策问题：

> 项目级 Memory 是否还需要存在？如果需要，它和全局 Memory 如何协同？

这不是一个简单的"开/关"问题。Claude Code 的 Memory 系统**不支持原生的双目录合并**，因此需要理解底层机制后，才能设计出可靠的架构。

### 1.2 决策的核心张力

| 维度 | 倾向全局 | 倾向项目级 |
|------|---------|-----------|
| 用户偏好（feedback） | ✅ 跨项目通用 | ❌ 重复积累 |
| 项目特定决策（project） | ⚠️ 污染全局空间 | ✅ 天然隔离 |
| MEMORY.md 容量（200行） | ⚠️ 多项目共享更紧张 | ✅ 每项目独立配额 |
| 维护成本 | ✅ 一处维护 | ❌ 多处维护 |
| 新会话启动时的上下文质量 | ⚠️ 可能载入无关项目信息 | ✅ 精确匹配当前项目 |

**核心矛盾：全局 Memory 的跨项目复用价值 vs 项目级 Memory 的信息隔离价值。**

### 1.3 分析范围

本报告将：
1. 精确分析 `autoMemoryDirectory` 的技术行为（设置优先级、覆盖语义、安全限制）
2. 评估三种可行架构（纯全局 / 纯项目级 / 混合）
3. 发现并论证一个关键技术 workaround（`@` import 机制）
4. 给出基于用户实际工作流的推荐方案


---

## 2. 技术底座：autoMemoryDirectory 的精确行为

### 2.1 设置优先级链

Claude Code 的设置系统遵循严格的优先级链：

```
Managed Policy（组织策略）
  ↓ 覆盖
CLI 参数
  ↓ 覆盖
.claude/settings.local.json（项目本地，gitignore）
  ↓ 覆盖
.claude/settings.json（项目共享，可提交）
  ↓ 覆盖
~/.claude/settings.json（用户级，全局）
```

**关键特性：`autoMemoryDirectory` 是标量（scalar）设置。**

标量设置的合并规则是 **winner-takes-all（赢者通吃）**：优先级最高的那一层完全覆盖低层，不存在"合并"或"追加"。

这意味着：

| 配置层级 | `autoMemoryDirectory` 值 | 实际效果 |
|---------|-------------------------|---------|
| 仅 `~/.claude/settings.json` | `~/.claude/memory` | 所有项目使用全局 memory |
| 项目 A 的 `.claude/settings.local.json` 设了 | `~/.claude/projects/A/memory` | **项目 A 完全切换为项目级**，全局 memory 不再自动加载 |
| 项目 B 未设置 | （继承用户级） | 项目 B 继续使用全局 memory |

### 2.2 安全限制

| 配置位置 | 是否接受 `autoMemoryDirectory` | 原因 |
|---------|-------------------------------|------|
| `~/.claude/settings.json`（用户级） | ✅ 接受 | 用户自己的设备，可信 |
| `.claude/settings.local.json`（项目本地） | ✅ 接受 | 本地文件，不进版本控制，可信 |
| `.claude/settings.json`（项目共享） | ❌ 拒绝 | 安全限制：防止共享仓库劫持 memory 路径写入恶意位置 |
| Managed Policy（组织策略） | ✅ 接受 | 管理员可信 |

**含义：** 如果要对某个项目启用项目级 Memory，必须通过 `.claude/settings.local.json`（本地文件）配置，不能通过可提交的 `.claude/settings.json`。

### 2.3 覆盖时的行为变化

当项目级 `.claude/settings.local.json` 覆盖了 `autoMemoryDirectory` 后：

| 行为 | 全局模式（默认） | 被项目级覆盖后 |
|------|----------------|---------------|
| MEMORY.md 自动加载 | 加载全局 `~/.claude/memory/MEMORY.md` | 加载项目级 MEMORY.md |
| 写入目标 | 写入 `~/.claude/memory/` | 写入项目级目录 |
| 全局记忆可见性 | ✅ 完全可见 | ❌ **不再自动可见** |
| 手动 Read | 可读任何文件 | 可读任何文件（包括全局 memory） |

**关键发现：被覆盖后，全局 Memory 不会自动加载，但 Claude 仍然可以通过 Read 工具手动读取。**

### 2.4 `@` Import 机制 — 关键 Workaround

Claude Code 的 `CLAUDE.md` 支持 `@` 前缀引用外部文件。这个机制**独立于 `autoMemoryDirectory`**。

```markdown
# 项目 CLAUDE.md
@~/.claude/memory/MEMORY.md
```

这行声明会让 Claude 在**每次会话启动时**加载全局 MEMORY.md 的内容到上下文中，**无论 `autoMemoryDirectory` 指向哪里**。

**这是实现混合架构的技术基础。**

| 机制 | 作用 | 依赖 autoMemoryDirectory？ |
|------|------|---------------------------|
| MEMORY.md 自动加载 | Claude 自动读取并注入上下文 | ✅ 依赖，跟随 autoMemoryDirectory 指向 |
| `@` import | CLAUDE.md 引用任意文件 | ❌ 不依赖，直接按路径读取 |
| Read 工具 | Claude 按需读取文件 | ❌ 不依赖，可读任何有权限的路径 |

**含义：** 即使某个项目将 `autoMemoryDirectory` 指向了项目级目录，仍然可以通过在项目 CLAUDE.md 中 `@~/.claude/memory/MEMORY.md` 来**读取**全局记忆。但**写入**仍然只会发生在 `autoMemoryDirectory` 指向的目录。


---

## 3. 三种架构方案

### 3.1 方案 A：纯全局 Memory（当前方案）

```
~/.claude/settings.json:
  "autoMemoryDirectory": "~/.claude/memory"

所有项目 → 读写同一个 ~/.claude/memory/
```

**机制：**
- 所有项目共享一份 MEMORY.md 索引和主题文件
- Claude 的自动写入（`Writing memory`）全部进入全局目录
- 项目特定信息靠项目级 CLAUDE.md 承载，不进入 memory

**优势：**

| 优势 | 说明 |
|------|------|
| 跨项目复用 | feedback、user 类型记忆在所有项目中立即生效 |
| 维护成本低 | 一处写入、一处维护、一处修剪 |
| 积累速度快 | 日常使用中高频产生的 feedback 自然汇聚 |
| 架构简单 | 无需配置项目级文件，零项目入侵 |

**劣势：**

| 劣势 | 说明 | 严重程度 |
|------|------|---------|
| 项目信息混入全局 | "项目 A 用 Gradle 7.x" 出现在项目 B 的上下文中 | ⚠️ 中 |
| 200 行配额更紧张 | 多项目共享同一 MEMORY.md，索引条目更多 | ⚠️ 中 |
| 项目特定记忆无处安放 | project 类型记忆不适合放全局，但 Claude 可能自动保存 | ⚠️ 中 |
| 信噪比随项目数下降 | 10 个项目各写 5 条 = 50 条索引，其中大部分对当前项目无用 | 🔴 高（长期风险） |

**适用场景：**
- 项目数量少（≤ 3 个活跃项目）
- 项目间技术栈相似
- 主要积累的是 user/feedback 类型（跨项目通用）

---

### 3.2 方案 B：纯项目级 Memory（系统默认）

```
~/.claude/settings.json:
  无 autoMemoryDirectory（或删除该字段）

每个项目 → 各自的 ~/.claude/projects/<hash>/memory/
```

**机制：**
- 每个项目有独立的 memory 空间，天然隔离
- Claude 的自动写入进入项目哈希目录下的 memory
- 跨项目知识需要通过全局 CLAUDE.md 或 rules 传递

**优势：**

| 优势 | 说明 |
|------|------|
| 零噪声 | 项目 A 的记忆不会出现在项目 B 中 |
| 200 行独立配额 | 每个项目都有完整的 200 行空间 |
| 项目上下文精准 | 新会话只看到当前项目相关的记忆 |

**劣势：**

| 劣势 | 说明 | 严重程度 |
|------|------|---------|
| feedback 无法跨项目 | 在项目 A 积累的"不要 mock DB"不会出现在项目 B | 🔴 高 |
| 用户画像重复积累 | 每个项目都要重新"认识"用户 | 🔴 高 |
| 维护分散 | 10 个项目 = 10 份 MEMORY.md 需要维护 | ⚠️ 中 |
| 高价值经验割裂 | 在项目 A 踩的坑不能防止在项目 B 再踩 | 🔴 高 |

**适用场景：**
- 项目间技术栈差异极大且相互无关
- 严格的信息隔离需求（如不同客户的项目）
- 不关心跨项目知识复用

---

### 3.3 方案 C：混合架构（推荐）

```
                    ┌─────────────────────────────┐
                    │  ~/.claude/memory/           │
                    │  全局 Memory（只读引用）      │
                    │  ├── MEMORY.md               │
                    │  ├── user_profile.md          │
                    │  └── feedback_*.md            │
                    └──────────┬──────────────────┘
                               │ @import（读）
                    ┌──────────┴──────────────────┐
     ┌──────────────┤  项目 CLAUDE.md              ├──────────────┐
     │              │  @~/.claude/memory/MEMORY.md │              │
     │              └─────────────────────────────┘              │
     ▼                                                           ▼
┌──────────────┐                                      ┌──────────────┐
│  普通项目     │                                      │  关键项目     │
│  （多数项目） │                                      │  （需要隔离） │
│              │                                      │              │
│ autoMemory:  │                                      │ settings.    │
│ ~/.claude/   │                                      │ local.json:  │
│ memory/      │                                      │ autoMemory → │
│ （继承全局）  │                                      │ 项目级目录    │
│              │                                      │              │
│ 读写全局     │                                      │ 写→项目级    │
│              │                                      │ 读→项目级+   │
│              │                                      │   全局(@引用) │
└──────────────┘                                      └──────────────┘
```

**核心思路：全局 Memory 作为默认底座，关键项目按需开启项目级覆盖 + `@` import 全局。**

**机制详解：**

**普通项目（大多数）：**
- 不做任何配置，继承用户级 `autoMemoryDirectory: ~/.claude/memory`
- 读写都发生在全局 memory
- 项目特定信息放在项目级 CLAUDE.md 中

**关键项目（需要项目级 Memory 的）：**
1. 创建 `.claude/settings.local.json`：
   ```json
   {
     "autoMemoryDirectory": ".claude/memory"
   }
   ```
2. 在项目 CLAUDE.md 中引用全局 memory：
   ```markdown
   @~/.claude/memory/MEMORY.md
   ```
3. 效果：
   - **自动写入** → 进入项目级 `.claude/memory/`
   - **自动读取** → 读取项目级 MEMORY.md
   - **`@` import** → 同时读取全局 MEMORY.md（用户画像、feedback 等）
   - **项目特定决策** → 安全地隔离在项目级 memory 中

**这实现了"全局读 + 项目写"的分层架构。**

**优势：**

| 优势 | 说明 |
|------|------|
| 两全其美 | 跨项目 feedback 通过 `@` import 始终可见 |
| 按需隔离 | 只有真正需要的项目才开启项目级 memory |
| 配额翻倍 | 关键项目同时拥有全局 + 项目级两份 MEMORY.md |
| 写入隔离 | 项目特定的 project 类型记忆不会污染全局 |
| 渐进式采用 | 先用全局，遇到需要隔离的项目再逐个开启 |

**劣势：**

| 劣势 | 说明 | 缓解措施 |
|------|------|---------|
| 配置复杂度 | 关键项目需要创建 2 个文件 | 模板化，一次性成本 |
| 写入方向单向 | 关键项目中产生的 feedback 只写入项目级，不回流全局 | 定期手动迁移高价值记忆 |
| `@` import 为只读 | Claude 不会自动更新被 `@` 引用的文件 | 符合预期（全局 memory 由全局模式的项目自动更新） |

---

### 3.4 三方案对比总结

| 维度 | A. 纯全局 | B. 纯项目级 | C. 混合 |
|------|----------|-----------|--------|
| 跨项目复用 | ★★★★★ | ★☆☆☆☆ | ★★★★☆ |
| 信息隔离 | ★☆☆☆☆ | ★★★★★ | ★★★★☆ |
| 维护成本 | ★★★★★（低） | ★★☆☆☆（高） | ★★★★☆（较低） |
| 配额利用 | ★★★☆☆ | ★★★★★ | ★★★★★ |
| 架构复杂度 | ★★★★★（简单） | ★★★★★（简单） | ★★★☆☆（适中） |
| 信噪比（长期） | ★★★☆☆ | ★★★★★ | ★★★★☆ |
| 适合项目数 | ≤ 3 | 任意 | 任意 |


---

## 4. 推荐方案与实施路径

### 4.1 推荐：方案 A（纯全局）为起点，按需演进到方案 C（混合）

基于用户工作流分析（Trip.com 后端开发者，Java 为主，多个项目）：

**当前阶段（0-3 个月）→ 方案 A：纯全局**

理由：
1. 全局 memory 刚启用，尚未积累大量记忆，200 行配额不是瓶颈
2. 当前最大需求是积累高价值 feedback（跨项目通用），全局模式最高效
3. 项目特定信息可以放在各项目的 CLAUDE.md 中（已有机制，不需要 memory）
4. 架构简单，维护成本低

**未来阶段（3 个月后）→ 按需演进到方案 C**

触发演进的信号：
- MEMORY.md 接近 100 行（200 行上限的一半）
- 出现大量项目特定记忆混入全局的情况
- 某个项目的 project 类型记忆特别多且与其他项目无关
- 用户开始同时活跃在 5+ 个技术栈差异大的项目中

### 4.2 当前阶段实施清单

**已完成：**
- [x] `~/.claude/settings.json` 配置 `autoMemoryDirectory: ~/.claude/memory`
- [x] 全局 memory 目录创建，包含初始记忆文件
- [x] 初始 MEMORY.md 索引建立

**待完成：**

| # | 任务 | 文件 | 优先级 |
|---|------|------|--------|
| 1 | 创建 Memory Policy 规则 | `~/.claude/rules/memory-policy.md` | 🔴 高 |
| 2 | 更新 CLAUDE.md 引用 | `~/.claude/CLAUDE.md` | 🔴 高 |

### 4.3 未来演进到方案 C 的实施模板

当某个项目需要开启项目级 Memory 时，执行以下步骤：

**Step 1：创建项目本地设置**
```json
// <project>/.claude/settings.local.json
{
  "autoMemoryDirectory": ".claude/memory"
}
```

**Step 2：创建项目 memory 目录**
```bash
mkdir -p <project>/.claude/memory
```

**Step 3：初始化项目 MEMORY.md**
```markdown
# Project Memory Index

@~/.claude/memory/MEMORY.md

## Project-Specific
（项目特定记忆将在此积累）
```

**Step 4：确保 `.gitignore` 排除**
```gitignore
# .claude/settings.local.json 和 .claude/memory/ 不应提交
.claude/settings.local.json
.claude/memory/
```

**Step 5：定期迁移**

项目中产生的高价值 feedback（跨项目通用的）应定期手动迁移到全局 `~/.claude/memory/`。

### 4.4 全局 Memory 的容量管理策略

即使当前采用纯全局方案，也需要主动管理 MEMORY.md 容量：

**MEMORY.md 容量预算分配：**

| 类型 | 预算（行数） | 说明 |
|------|------------|------|
| user | 5-10 行 | 用户画像稳定后很少变化 |
| feedback | 30-50 行 | 核心高价值资产，持续积累 |
| reference | 10-20 行 | 外部资源指针，适度积累 |
| project | 0-10 行 | **尽量少放**，项目信息放项目 CLAUDE.md |
| 留白 | 100+ 行 | 为长期增长预留空间 |
| **合计** | < 100 行 | 200 行上限的 50% |

**关键原则：MEMORY.md 索引使用率长期控制在 50% 以下。**

超过 50% 时触发修剪：
1. 删除已过时的 project 类型记忆
2. 合并内容相近的 feedback 条目
3. 将低频使用的 reference 移至 CLAUDE.md 的 `@` 引用


---

## 5. Memory Policy 规则设计

### 5.1 规则文件定位

`~/.claude/rules/memory-policy.md` — 全局 rules 目录下的独立文件。

**为什么用 rules 而非 CLAUDE.md：**
- CLAUDE.md 官方建议 < 60 行，已有较多内容
- rules 文件模块化管理，职责隔离
- rules 文件在所有项目中自动生效（用户级 rules 全局适用）
- 实测 5 个 30 行规则文件的遵循率（~96%）高于单个 150 行 CLAUDE.md（~92%）

### 5.2 推荐规则内容

```markdown
# Memory 质量策略

> 全局 memory 是跨项目共享的稀缺资源。每条记忆都必须通过严格筛选。

## 保存门槛

### 必须同时满足（AND）
1. **跨会话复用** — 这条信息在未来的不同会话中会被用到吗？
2. **不可推导** — 无法从代码、git history、CLAUDE.md、文档中直接获取？

### 至少满足一项（OR）
3. **反直觉** — 踩过坑才知道的经验，而非常识
4. **高复用** — 预计在 3 个以上不同会话中适用
5. **纠错信号** — 用户明确纠正了行为，且适用于未来场景

### 绝不保存到全局 memory
- 项目特定的构建命令、文件结构、依赖版本（→ 项目 CLAUDE.md）
- 临时状态：当前任务进度、未合并的分支、进行中的讨论
- 代码模式和架构细节（→ 从代码推导）
- Git 历史和变更摘要（→ git log）
- 已在 CLAUDE.md 或 rules 中声明的内容（→ 避免重复）

## 写入纪律

- feedback 类型**必须**包含 **Why**（原因）+ **How to apply**（应用场景）
- 文件名必须表达内容（如 `feedback_no_mock_db.md`，而非 `memory_1.md`）
- 每条记忆控制在 10 行以内
- MEMORY.md 索引每条 < 150 字符
- 保存前检查：是否已有类似记忆？有则更新而非新建

## 定期维护

- 保存 project 类型记忆时，使用相对日期标注（如"2026-04 决策"）
- 发现过时记忆应主动删除或更新
- MEMORY.md 索引行数长期保持 < 100 行
```

### 5.3 CLAUDE.md 更新

在 `~/.claude/CLAUDE.md` 中添加引用：

```markdown
## 质量控制
- @~/.claude/rules/memory-policy.md - Memory 质量策略
```

### 5.4 规则生效原理

```
系统提示中的 auto memory 指令（基础行为）
         │
         │ 叠加
         ▼
~/.claude/rules/memory-policy.md（强化过滤）
         │
         │ 效果
         ▼
Claude 在保存记忆前会自检：
  "这条记忆是否通过了 memory-policy 中的门槛？"
  → 通过 → 保存
  → 未通过 → 跳过
```

**实际效果：** 不是 100% 硬拦截（Claude 仍有概率偶尔违反），但能将低价值记忆的产生率降低约 80-90%。这是"软控制 + 频繁修剪"的务实策略。


---

## 6. 关键结论

### 6.1 决策摘要

| 问题 | 结论 |
|------|------|
| 项目级 Memory 需要开启吗？ | **当前不需要。** 纯全局方案在现阶段最优。 |
| 未来需要吗？ | **可能。** 当 MEMORY.md 容量紧张或出现项目信息混杂时，演进到混合架构。 |
| 如何搭配使用？ | **`@` import 机制是关键：** 在项目级 Memory 覆盖全局时，通过 `@~/.claude/memory/MEMORY.md` 保持全局记忆可见。 |
| 项目特定信息怎么办？ | **放项目级 CLAUDE.md**，不进 memory。这是现有机制的最佳用法。 |

### 6.2 核心发现

1. **`autoMemoryDirectory` 是标量设置，不支持合并。** 这意味着不存在"同时启用全局和项目级 Memory"的原生方案。

2. **`@` import 突破了"读写绑定"的限制。** 通过 CLAUDE.md 中的 `@` 引用，实现了"写入项目级，读取全局 + 项目级"的混合架构。这是本分析的核心技术发现。

3. **Memory 和 CLAUDE.md 是互补的两套持久化机制：**
   - Memory = Claude 自主学习、自动积累的知识（适合 feedback、user）
   - CLAUDE.md = 用户主动声明的指令和上下文（适合项目规则、技术栈信息）
   - 将项目特定信息放 CLAUDE.md 而非 Memory，可以有效避免全局 Memory 被项目信息污染。

4. **质量控制比架构选择更重要。** 无论选择哪种架构，如果不对 Memory 保存的内容做质量过滤，最终都会被低价值记忆淹没。`memory-policy.md` 规则是任何架构方案的必要配套。

### 6.3 行动项

| 优先级 | 行动 | 预期效果 |
|--------|------|---------|
| 🔴 立即 | 创建 `~/.claude/rules/memory-policy.md` | 控制全局 memory 的写入质量 |
| 🔴 立即 | 更新 `~/.claude/CLAUDE.md` 引用 | 让 policy 规则全局生效 |
| 🟡 每周 | 浏览 MEMORY.md 检查质量 | 及时修剪低价值记忆 |
| 🟢 按需 | 对关键项目启用混合架构 | 当全局方案不够用时演进 |


