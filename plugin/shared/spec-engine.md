# Spec Engine — 通用规范化编码引擎

> **核心信念**：规范先于代码，决策先于实现，验证闭环先于归档。

本引擎被 `spec-coding` 和 `spechub-coding` 适配层共享，定义 Phase 1-4 + G1-G4 的完整流程。适配层负责：入口触发、上下文注入、输出格式。引擎负责：流程控制、门禁执行、质量保障。

## 条件标注约定

引擎使用条件标注实现差异化行为，由适配层在调用前声明哪些条件为 true：

| 标注 | 含义 |
|------|------|
| `[IF artifacts]` | 上下文中存在外部产物路径（spec artifacts） |
| `[IF profile]` | 上下文中存在项目画像（project-profile.md） |
| `[IF footprint]` | 上下文中存在 infrastructureFootprint |
| `[IF playbooks]` | 上下文中存在 playbook 配置 |
| `[ALWAYS]` | 无条件执行 |

---

## 门禁系统

### G1 — Proposal 准入

<HARD-GATE>
**何时**：Phase 1 澄清完成、生成 proposal 前
**条件**：用户已确认 4 要素对齐（目标/范围/约束/验收标准）
**无证据时禁止**：不得生成 proposal.md，不得调用 openspec instructions
</HARD-GATE>

### G2 — Design 准入

<HARD-GATE>
**何时**：Phase 2 澄清完成、生成 design 前
**条件**：技术方案已对齐（架构选型/接口契约/数据模型/关键决策点）
**无证据时禁止**：不得生成 design.md 或 tasks.md
</HARD-GATE>

### G3 — Apply 准入

<HARD-GATE>
**何时**：Phase 3 开始前
**条件**：design.md + tasks.md 已生成且用户确认
**无证据时禁止**：不得编写实现代码
</HARD-GATE>

### G4 — Archive 准入

<HARD-GATE>
**何时**：Phase 4 归档前
**条件**：Spec-Code 验证闭环通过（所有决策点实现一致或偏离已获批）
**无证据时禁止**：不得调用 /opsx:archive
</HARD-GATE>

---

## Phase 1 — Proposal

### 澄清阶段

1. `[IF artifacts]` Read 外部产物（需求文档/PRD）
2. `[IF profile]` Read project-profile.md（技术栈/约定）
3. `[ALWAYS]` Read dimensions.md（评估维度）
4. `[ALWAYS]` 执行澄清质量门槛（见下文）
5. `[ALWAYS]` 对齐确认 — 输出 4 要素摘要 + AskUserQuestion 确认

→ **G1 通过**

### 生成阶段

1. `openspec new change`
2. `openspec instructions proposal`
3. `[MUST]` Read openspec/specs/（已有规范上下文）
4. `[IF artifacts]` Read 产物补充细节
5. 生成 **proposal.md**（目标/范围/约束/验收标准）+ delta specs

---

## Phase 2 — Design

### 澄清阶段

1. `[IF artifacts]` Read 架构文档 + 契约定义
2. `[IF footprint]` 读取 effective playbook 决策树（仅 footprint.effective=true 的中间件）
3. `[IF profile]` 读取中间件用法模式 + 编码约定
4. `[ALWAYS]` Read dimensions.md
5. `[ALWAYS]` 执行澄清质量门槛
6. `[ALWAYS]` 对齐确认 — 技术方案摘要 + AskUserQuestion

→ **G2 通过**

### 生成阶段

1. `openspec instructions design`
2. `[MUST]` Read openspec/specs/
3. `[IF artifacts]` Read 产物补充
4. 生成 **design.md**：
   - 架构决策清单：D1, D2, D3...（每条含：决策/理由/替代方案）
   - 接口契约 / 数据模型 / 序列图
5. 生成 **tasks.md**：
   - 每 task 关联决策点（如 `→ D1, D3`）
   - `[IF playbooks]` 标注命中的 playbook（如 `[playbook: dal-entity]`）
   - 拓扑顺序：DDL → DAO → SOA → QMQ → QConfig → QSchedule → CRedis → Service

---

## Phase 3 — Apply

→ **G3 通过**后调用 `/opsx:apply`

### 增强约束

- 决策清单（D1,D2...）作为**验证锚点**
- 每 task 完成后自检：实现是否偏离对应决策点
- 偏离 → 立即 AskUserQuestion，不继续下一 task
- ≥2 决策点偏离 → 建议回退 Phase 2（re-spec）

### [IF playbooks] Playbook 注入策略

```
实现上下文 = playbook 通用骨架 + profile 项目模式
```

- 通用骨架：从 playbook 文件读取标准结构/命名/配置模板
- 项目模式：从 profile 读取本项目的包路径/命名风格/分层约定
- 两者合并产生具体实现指导

---

## Phase 4 — Archive

### Spec-Code 验证闭环（G4 前置）

1. Read design.md → 提取决策清单 D1, D2...
2. 定位每个决策点对应的实现代码
3. 逐一验证：一致 ✓ / 偏离 ✗
4. 偏离项 → AskUserQuestion（修正 or 接受偏离）
5. 全部解决 → G4 通过

### 归档

1. 调用 `/opsx:archive`
2. 经验提取：将本次有价值的决策模式/踩坑记录写入经验库
3. **[返回控制权给适配层输出端]**

---

## 澄清质量门槛

| 维度 | 最低要求 |
|------|----------|
| 新洞察 | ≥1 个用户未明确提及但影响方案的发现 |
| 前提审计 | ≥2 个隐含假设被显式确认或否定 |
| Defeater | 至少考虑 1 个可能推翻当前方案的反证 |
| 元认知 | 明确标注"我不确定"的区域，不用假设填充 |

未满足门槛时：继续追问，不推进到对齐确认。

---

## Playbook 激活逻辑

```
footprint.effective → 筛选 enabled=true 的中间件
  → Phase 2: 读取对应 playbook 决策树，纳入设计考量
  → Phase 3: 注入对应 playbook 骨架，指导实现细节
```

未在 footprint 中声明的中间件 → 不激活对应 playbook，避免噪声。

---

## 运行时规则

**惊讶测试**：实现过程中遇到"意料之外"的复杂度/依赖/冲突 → 停下来，这是信号，可能需要 re-spec。

**Re-spec 触发条件**：
- ≥2 决策点实现偏离
- 发现 design 阶段未考虑的关键约束
- 用户提出实质性需求变更

**进度心跳**：每完成 1 个 task 或每 3 分钟（取短者），向用户报告当前进度和下一步。
