---
name: spechub-coding
description: |
  SpecHub 产物驱动的规范编码。当用户需要基于 SpecHub 平台产物进行本地编码时触发。
  适用于：用户提供 requirementId 或从 SpecHub inbox 选择需求后，基于平台产物完成编码。
  前提：项目中已有 openspec/ 目录（由 OpenSpec CLI 初始化）+ .claude/project-profile.md（由 /ace:init 生成）。

  DO NOT TRIGGER: 无平台产物的纯本地开发（→ spec-coding）；单文件 bug 修复（→ 直接 Edit）；
  纯探索/学习（→ auto-goal）；代码审查（→ code-review）；写测试（→ ut）。
---
# SpecHub-Coding — 平台产物驱动的规范编码

核心信念：**产物是 AI 生成的输入，可能有错。本地的核心价值 = 质量把关 + 范围裁决 + 规范兑现。**

---

## 内联约束（始终激活）

### 对齐规则

- **默认执行对齐**。跳过须同时满足：同会话已明确意图 + 无 unknowns + 无惊讶假设 + 纯延续性修复
- 对齐格式（每次 Gate）：

  ```
  **我的理解**（1-2 句核心意图）
  **计划方向**（1-2 句策略）
  **关键假设**（含 ⚠️ 标注的前提不成立项）
  **完成标准**（可测试条件）
  ```

  → 然后同一 response 调用 AskUserQuestion 确认

- **惊讶测试**：多方案取舍 / 依赖用户偏好 / 超出范围 / 不可逆 / 填补用户未说明 → 暂停询问

### 理解质量门槛

| 维度 | 门槛 |
|------|------|
| 新洞察 | ≥1 个产物未提及但影响方案的发现 |
| 前提审计 | ≥2 个隐含假设被验证或否定 |
| Defeater | mandatory（必须附具体证据，见下文） |
| 元认知 | 标注不确定区域，不用假设填充 |

### Defeater 硬规则 ⟵ 优化③

每个 Defeater **必须**附带 ≥1 条具体证据：
- 代码路径（grep/read 结果）
- 数据事实（文档/配置引用）
- 业务规则矛盾（引用 PRD 原文）

**纯逻辑推演标记为 `[weak]`，不进入验证清单。** 只有附带实证的 Defeater 才标记为 ⚠️-conflict。

### 验证清单语义 ⟵ 优化⑥

| 标记 | 含义 | 处理建议 |
|------|------|---------|
| ✓ | 与代码现状一致 / 确认不存在重复 | 正常推进 |
| ⚠️-conflict | 存在具体矛盾（附代码证据） | **必须解决**后才能推进 |
| ⚠️-missing | 信息不足，无法确认 | 追问用户或标记为假设 |
| ⚠️-suspect | 疑似不需要/过度设计 | 建议裁剪，用户裁决 |
| ✗ | 明确错误（产物声明与代码事实矛盾） | 必须修正，不可采纳产物原方案 |

---

## 输入适配

### 前置检查

- `openspec/` 目录存在 — 否则提示 `npx @fission-ai/openspec init`
- `.claude/project-profile.md` 存在 — 否则提示先运行 `/ace:init`

### Phase 0: Select + Pull（需求获取）

**动作**：

1. `git remote -v` → 获取 `gitRemoteUrl`
2. 若无 `requirementId`：
   ```bash
   python3 scripts/spechub-pull-bundle.py --inbox <gitRemoteUrl>
   ```
   → AskUserQuestion 让用户选择需求
3. 拉取产物：
   ```bash
   python3 scripts/spechub-pull-bundle.py <reqId> <gitRemoteUrl> <repoRoot>
   ```
4. 产物写入 `spechub/{reqId}/artifacts/` + `manifest.json`
5. 初始化状态追踪：
   - Write `spechub/.active` → 内容仅为 `{reqId}`
   - Write `spechub/{reqId}/state.json` → `{"phase": "pull", "completedGates": [], "reqId": {reqId}, "requirementTitle": "...", "startedAt": "<ISO>", "lastUpdatedAt": "<ISO>"}`

**脚本路径**：`scripts/spechub-pull-bundle.py`（相对于本 skill 目录）

**错误处理**：
- Exit 1: HTTP/网络错误 → 报错终止
- Exit 2: 响应解析失败 → 报错终止
- Exit 3: 业务错误（REQUIREMENT_NOT_FOUND / NO_PROJECT_MATCH / ARTIFACTS_INCOMPLETE）→ 报错终止

### Phase 0.5: Understand + Ground（深度理解 + 代码验证）

**目的**：以代码事实验证 AI 产物中的技术假设，发现范围越界、重复实现、架构冲突、过度设计。

**执行**：Read `../../shared/understanding-protocol.md`，参数：
```
verify = artifact-grounding
threshold = {insight≥1, assumptions≥2, defeater=mandatory}
```

**场景特化输入**：

1. Read `.claude/project-profile.md` → 提取架构分层、中间件使用表
2. Read `spechub/{reqId}/artifacts/` 全部产物
3. 分析产出：
   - 业务目标一句话
   - 改动范围（结合 profile 架构分层定位目标层）
   - `infrastructureFootprint`：existing∩relevant ∪ newlyRequired

**并行探索 [CONSTRAINT]**：

步骤 1-2 串行读取后，步骤 3 **必须并行**（≥3 Agent 探索型）：

| 维度 | 分析目标 | 独立性 |
|------|---------|--------|
| D1: 产物语义分析 | 提取业务目标、核心流程、边界场景、隐含约束 | ⟂ |
| D2: 代码现状验证 | 对 `[新增]`/`[修改]` 声明搜索代码，确认复用性 | ⟂ |
| D3: 架构一致性检查 | 产物选型 vs 现有架构模式（分层/命名/依赖方向） | ⟂ |
| D4: 中间件 footprint 验证 | 新增中间件是否有已有替代 | ⟂ |
| D5: 方案必要性审计 ⟵ 优化⑤ | 对每个设计决策问"最简实现是什么？差异由何驱动？" | ⟂ |

**D5 执行方法**：
- 对产物每个核心功能点：如果用最简方式实现同一业务目标，方案差异在哪？
- 差异必须由**明确的需求/约束驱动**（不是"可能以后需要"）
- 产出：`simplification_suggestions[]`（每条含功能点 + 简化方向 + 理由 + 复杂度增量评估）

**D5 差异驱动力判定标准** ⟵ 优化⑦：

差异点影响量级标注（必须）：
| 量级 | 定义 | 是否支持新建决策 |
|------|------|----------------|
| 表达式级 | cron 配置、参数值、条件分支 | ❌ 不支持 |
| 方法级 | 新增方法、注入新依赖、新 DAO 调用 | ❌ 不支持 |
| 类级 | 新增独立类（新 Service/新 Job） | ⚠️ 需强驱动力 |
| 模块级 | 新增包/新增部署单元 | ✅ 可支持 |

**分离驱动力必须是以下之一**（仅"逻辑不同"或"参数不同"不构成分离理由）：
- (a) 独立的部署/扩缩容需求
- (b) 独立的故障隔离需求（一个崩溃不应影响另一个）
- (c) 完全不同的数据源 + 数据生命周期
- (d) 量级差异的 SLA/频率要求（10x 以上差异，非细微差异）

**D5 复杂度增量评估**（每个"非最简"决策必须附加）：

```
| 维度 | 新建方案增量 | 扩展方案增量 |
|------|-------------|-------------|
| 新增类数 | ? | ? |
| 新增配置项 | ? | ? |
| 新增运维关注点 | ? | ? |
| 未来同步修改风险 | ? | ? |
```

当新建方案复杂度增量 > 扩展方案 且无 (a)(b)(c)(d) 驱动力 → recommendation = `simplify`（不允许 `needs-discussion`）

**违规定义**：对 D1-D5 逐个串行 = 违规。

### Phase 0.5 产出物（MUST-WRITE）

D1-D5 并行探索完成后，**必须**执行：

1. Write `spechub/{reqId}/comprehension.md`，内容结构：
   ```markdown
   # 需求理解 — {requirementTitle}
   ## 业务目标（D1）
   ## 代码验证结论（D2）
   | 产物声明 | 结论 | 证据 |
   ## 架构一致性（D3）
   ## Infrastructure Footprint（D4）
   ## 简化建议（D5）
   ```
2. Write `spechub/{reqId}/state.json`：
   ```json
   {"phase": "understand", "completedGates": [], "timestamp": "<ISO>"}
   ```
3. Write `spechub/.active` → 内容仅为 `{reqId}`

**comprehension.md 不存在 = Phase 0.5 未完成，禁止进入 G0。**

---

**D 维度冲突仲裁规则** ⟵ 优化⑧：

当 D 维度之间结论矛盾时（如 D2 说"应扩展"但 D5 说"可新建"），按以下优先级裁决：

```
D2(代码事实) > D3(架构一致性) > D4(中间件现状) > D5(设计偏好) > D1(产物语义)
```

**理由层级**：已存在的代码是硬约束，架构约定是强约定，设计偏好是软建议，产物声明是待验证输入。

**处理规则**：
- 高优先级结论 与 低优先级矛盾 → **采用高优先级**（不可逆转）
- 同优先级维度矛盾 → 标记冲突，G0 中呈现两种方案供用户裁决
- **禁止以低优先级理由（如"逻辑分离更清晰"）否定高优先级事实（如"代码已有可扩展的实现"）**

---

### Gate 0: 需求理解 + 范围裁决 ⟵ 优化①④

> G0 与 G1 合并为统一的"需求理解确认"门禁。

<HARD-GATE id="G0" phase="understand+scope">
**何时**: 进入引擎（Phase 2 设计）之前
**条件**: AskUserQuestion 展示以下全部内容 + 用户确认
**无证据**: 禁止进入引擎
</HARD-GATE>

**展示内容**（markdown 先呈现，AskUserQuestion 后确认）：

```markdown
**理解摘要**
（业务目标 + 改动范围 + 关键假设）

**功能点 Scope 裁决** ⟵ 核心创新
| # | 功能点 | 来源 | 建议 |
|---|--------|------|------|
| 1 | ... | 用户原始描述 | ✅ Scope In |
| 2 | ... | AI 推断/延伸 | ⚠️ 待裁决 |
| 3 | ... | AI 推断 | ❌ 建议 Scope Out（理由：过度设计/D5 审计结果） |

**验证清单**
- ✓ / ⚠️-conflict / ⚠️-missing / ⚠️-suspect / ✗（每项附证据）

**Infrastructure Footprint**
（effective 中间件列表）

**完成标准**
（可测试条件 — 必须反映修正后的实现方案，而非产物原始描述）
```

**验证修正传播（闭环规则）** ⟵ 优化⑨强化：

当 D2/D3/D4 验证发现 ⚠️-conflict 或 ✗ 时：

1. **功能点描述和完成标准必须按修正方向重写**，而非保留产物原文
2. **Scope 划分必须遵循验证结论**：
   - D2 结论为 `should-extend` → 该功能点**禁止**作为独立 Scope In 项，必须归入对应现有模块的修改范围
   - D2 结论为 `reuse-existing` → 该功能点不出现在 Scope 表中（已有能力无需实现）
   - D2 结论为 `confirm-new` → 可作为独立 Scope In 项
3. **修正方向 = 验证结论方向**（不是"AI 综合判断方向"），即：
   - ⚠️-conflict 含义 = **产物方案与代码现状矛盾，产物需向代码现状对齐**
   - 若需偏离验证结论（罕见），必须在 G0 中显式标注"⚠️ 违反 D2 结论，理由：…"并由用户确认

示例：
- 验证发现"降级 Job 应为扩展现有 MembershipExpirationJob，而非新增"
- → 功能点描述重写为"扩展等级过期 Job 增加降级判定逻辑"（而非"新增降级批处理任务"）
- → 完成标准重写为"等级过期 Job 支持保级/降级判定"（而非"降级 Job 在到期日次日执行"）

**原则**：G0 展示给用户的是**修正后的实际实现方案**，不是产物原始描述。验证的目的就是纠正产物错误——纠正结果必须传播到所有下游输出。

**功能点裁决规则** ⟵ 优化⑩：

**功能点生成规则**（禁止直接复制产物功能点列表）：
1. 从 D1 提取业务目标列表
2. 对每个目标，从 D2 验证结论推导"达成该目标的最小代码变更"
3. 最小代码变更 = 功能点（而非产物声明 = 功能点）

**判定辅助问**：
- "这是现有模块的新状态/新分支，还是真正的新关注点？"
- "如果两个功能总是因同一业务规则变更而同时修改，它们属于同一模块"

**裁决标注规则**：
- 标注来源："用户原始描述"（manifest.title 中明确提及）vs "AI 推断/延伸"（产物自行扩展）
- D2 = should-extend 的功能点 → 描述为"扩展现有 [X] 增加 [Y] 能力"，不出现"新增"字样
- AI 推断的功能点默认标记为"⚠️ 待裁决"
- D5 审计标记为过度设计的 → 建议 "❌ Scope Out"
- **用户必须逐项确认 Scope In / Scope Out**
- 后续 Phase 只实现 Scope In 的功能点

**AskUserQuestion 选项设计**：
- 若存在 ⚠️-conflict / ✗ 项 → 包含"产物修正建议"选项
- 若存在 ⚠️-suspect 项 → 包含"裁剪方案"选项
- 正常情况 → "确认并继续" / "需要调整"

**G0 反锚定强制步骤** ⟵ 优化⑪：

在输出 G0 scope 表**前**，对每个标记为 ⚠️-conflict 的功能点执行"反转测试"：

```
反转测试：如果不新建独立模块，而是扩展现有 [X]，需要改动什么？
- 改动清单：[具体方法/配置列表]
- 改动量级：[表达式级/方法级/类级]
```

**反转测试判定规则**：
- 改动清单 ≤5 个方法级变更 → **默认采用扩展方案**
- 改动涉及破坏性重构（接口变更/数据模型不兼容） → 允许新建

**Steel Man 规则**：在推荐"新建"前，必须用 ≥3 句话为"扩展方案"辩护，并显式说明为何仍不采纳。若无法为扩展方案提供有力反驳 → 说明新建决策不成立，回退到扩展方案。

---

### Context 准备（交付引擎）

G0 通过后，**必须**执行：
1. 更新 `spechub/{reqId}/state.json`：`{"phase": "design", "completedGates": ["G0"], ...}`
2. 以下信息供引擎使用：

- **userRequest**：manifest.title + 确认的理解摘要
- **scopeDecision**：用户确认的 Scope In 功能点清单
- **artifacts**：`spechub/{reqId}/artifacts/`
- **groundingResult**：验证清单（含修正方向）
- **profile**：`.claude/project-profile.md`
- **footprint**：`infrastructureFootprint`
- **playbooks**：effective 中间件 → `../../shared/playbooks/{mw}.md`

> **引擎行为约束**：
> - Scope Out 的功能点 → 不出现在 proposal/design/tasks 中
> - ⚠️-conflict / ✗ 项 → 优先采用验证清单修正方向（复用 > 新增）

---

## 执行

Read `../../shared/spec-engine.md` — 按通用引擎执行，但本适配层覆写以下行为：

### 引擎覆写 ⟵ 优化④

| 引擎原始行为 | 本适配层覆写 |
|-------------|-------------|
| G1（Proposal 准入）独立门禁 | **已合并入 G0**。G0 通过 = Proposal 可直接生成 |
| G3（Apply 准入）人工确认 | **降级为自动验证**：检查 design.md + tasks.md 存在且内容完整 → 自动通过；仅文件缺失/不完整时 AskUserQuestion |
| Phase 1 独立澄清 | **简化**：G0 已完成需求澄清，Phase 1 仅执行 proposal 生成（不再重复澄清） |

### 引擎保留行为

| Gate | 保留原因 |
|------|---------|
| G2（Design 准入） | 技术方案需人工确认，不可自动化 |
| G4（Archive 准入） | 偏离处理需人类判断 |

### 引擎注入增强

- **Phase 1 生成**：scopeDecision 作为 proposal 范围约束
- **Phase 2 澄清**：产物作为背景 + playbook 决策树辅助选型
  - 澄清维度：Playbook选型 | 契约验证 | 平台架构约束 | 架构决策 | 接口设计 | 数据状态 | 性能可靠性 | 部署运维
- **Phase 2 完成（G2 通过后）**：更新 `spechub/{reqId}/state.json` → `{"phase": "apply", "completedGates": ["G0", "G2"], ...}`
- **Phase 3 实现**：playbook 骨架 + profile 项目模式 = 实现指导

### 正反馈路径 ⟵ 加速机制（优化⑫修正）

- G0 验证清单全部 ✓ + 无 Scope 争议 → Phase 1 聚焦实现细节确认（缩短但不完全跳过）
- G2 用户无修改意见确认 → Phase 3 自动验证通过（不额外展示）

**反向约束**：禁止为加速流程而降低验证标记严格度。应标 ✗ 而标 ⚠️-conflict = 验证不诚实（后续阶段发现产物方案完全不可采纳时视为 Phase 0.5 失败）。

---

## Phase 3 完成验证（MUST-DO，不可跳过）

代码实现全部完成后、进入输出适配之前，**必须按顺序**执行：

1. **编译验证**：`Bash("mvn compile -DskipTests")` 或对应构建命令
   - 编译失败 → 修复后重新编译，循环直到通过
2. **运行单测**：`Bash("mvn test")` 或对应测试命令
   - 测试失败 → 修复后重新运行，循环直到通过
   - 若项目无法本地测试 → 标注跳过原因，AskUserQuestion 确认
3. **清理临时文件**：删除 Agent 探索阶段生成的非项目文件
   - `Bash("rm -f AUDIT_*.md QUICK_DECISION_CARD.md _AUDIT_INDEX.md")` 等
   - 原则：`git status` 中不应有非功能性的临时文件
4. **更新状态**：`spechub/{reqId}/state.json` → `{"phase": "apply-verified", ...}`

**编译/测试未通过时，禁止进入输出适配。**

---

## 输出适配

引擎 Phase 4 (Archive) 完成后执行：

### 1. Handoff Check（MUST-WRITE）

执行检查后 **必须** Write `spechub/{reqId}/handoff-check.md`：

```markdown
# Handoff Check — {requirementTitle}

## git diff 摘要
（粘贴 `git diff --stat` 输出）

## Scope 覆盖矩阵
| 功能点 | Scope 决策 | 代码覆盖 | 状态 |
|--------|-----------|---------|------|
| ... | Scope In | ✅ 已实现 | OK |
| ... | Scope Out | ❌ 未出现 | OK |

## 编码约定一致性
- 命名规范: ✅/❌
- 分层依赖方向: ✅/❌
- ...

## 违规项
（无 / 具体描述）
```

**handoff-check.md 不存在 = Handoff Check 未完成，禁止执行 Git 操作。**

若有违规 → AskUserQuestion 确认继续。

### 2. Git 操作（MUST-DO）

```bash
git checkout -b feature/spechub-{reqId}-<slug>
git add -A
git commit -m "feat(spechub-{reqId}): <需求标题简述>"
git push -u origin feature/spechub-{reqId}-<slug>
```

更新状态：`spechub/{reqId}/state.json` → `{"phase": "archive", ...}`

### 3. SpecHub 上报（MUST-DO）

```bash
python3 scripts/spechub-archive-report.py <reqId> <gitRemoteUrl> \
  --branch <branchName> \
  --commit <commitHash> \
  --decisions <design decisions markdown>
```

**脚本路径**：`scripts/spechub-archive-report.py`（相对于本 skill 目录）

**输出**：archiveRecordId + requirementStatus 更新确认

更新状态：`spechub/{reqId}/state.json` → `{"phase": "done", ...}`
删除：`spechub/.active`

**Git + Archive 是流程的终结动作，不是可选项。AI 不得以"等待用户指示"为由停止——必须主动完成直到 state.json 标记为 done。**

---

## 恢复

用户说"继续"时：

1. Read `spechub/.active` → 获取当前运行的 `reqId`（文件不存在 = 无活跃需求，提示用户重新开始）
2. Read `spechub/{reqId}/state.json` → 获取 `phase` + `completedGates`
3. 验证前置产出物存在性：

   | 当前 phase | 必须存在的产出物 | 缺失时回退到 |
   |-----------|----------------|-------------|
   | understand | artifacts/ | Phase 0（重新拉取） |
   | design | comprehension.md | Phase 0.5 |
   | apply | design.md + tasks.md | Phase 2 |
   | apply-verified | 编译通过 + 测试通过 | Phase 3 末尾验证 |
   | archive | handoff-check.md | 输出适配 Step 1 |
   | done | — | 已完成，无需恢复 |

4. 从断点 Phase 继续引擎执行

### state.json 结构

```json
{
  "phase": "understand | design | apply | apply-verified | archive | done",
  "completedGates": ["G0", "G2"],
  "reqId": 1450,
  "requirementTitle": "黑钻升降保级规则+页面",
  "startedAt": "2026-05-29T10:00:00Z",
  "lastUpdatedAt": "2026-05-29T12:30:00Z"
}
```

---

## 运行时规则

- **惊讶测试**: 决策让用户惊讶 → 暂停 AskUserQuestion
- **进度心跳**: Phase 切换报告 / 5+ 工具调用插入说明 / 偏离立即告知
- **经验进化**: 引擎内完成（Phase 4.3）
- **Scope 守护**: 实现过程中发现需要 Scope Out 功能点的代码 → 停下确认（不静默跳过）
