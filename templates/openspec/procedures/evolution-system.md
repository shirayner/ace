# 进化体系 v5

mspec 的知识积累分为三层，在 `archive` 时自动推进——**使用越久，整个 spec coding 流程越精准**。

## 三层架构

**Layer A（每次 archive 立即更新）— 项目事实积累**
- `openspec/decisions/adr.md`：技术决策账本，防止反复讨论已决定的事
- `openspec/glossary.md`：领域词汇表，统一业务术语命名
- `openspec/risk-map.md`：风险图谱，记录已知高风险区和 bug 模式
- `openspec/specs/CHANGELOG.md`：规格演化历史（有 delta spec sync 时更新）
- `openspec/metrics.md`：工作流效率信号

**Layer B（积累 3+ 复盘后自动触发）— 流程模式学习**
- `openspec/templates/taxonomy/`：基于跨 change 漏检/噪音模式优化问题分类学
- `openspec/task-patterns/`：按 change 类型积累的任务分解模板库
- `openspec/config.yaml` user_preferences：记录用户的稳定决策偏好

**Layer C（长期积累，元信号）— 系统性洞察**
- `openspec/specs/CHANGELOG.md`：规格演化历史，揭示业务边界稳定性
- `openspec/metrics.md`：工作流效率信号，支持系统性优化

---

## archive 操作步骤

### Step 1：生成复盘报告（BEFORE archiving，必须执行）

1. 读取以下文件：
   - `spec/requirement-issues.md`
   - `spec/design-issues.md`
   - `spec/retrospective-notes.md`（如存在）
   - 本次 `design.md`（提取技术决策）
   - 本次 `proposal.md`（提取新术语）

2. 在 `openspec/retrospectives/` 目录下创建复盘报告：
   文件名：`{YYYY-MM-DD}-{change-name}.md`（目录不存在时先创建）

3. 按 `openspec/templates/retrospective-template.md` 的格式填写九章内容

4. 向用户展示复盘摘要（5-8 行），然后继续执行归档

---

### Step 2：Layer A 立即更新（AFTER archiving，每次必须执行）

**A1. 技术决策账本（ADR）**
- 读取复盘报告"四、技术决策"章节
- 如有新决策，追加到 `openspec/decisions/adr.md`：
  ```
  ## {决策标题} | 来源: {change-name} | 日期: {date}
  **选择**: {选了什么}
  **理由**: {为什么}
  **备选**: {考虑过哪些}
  **状态**: active
  ```
- 文件不存在时先创建（参考 `openspec/templates/evolution/adr.md` 格式）

**A2. 领域词汇表**
- 读取复盘报告"五、领域词汇"章节
- 如有新术语，追加到 `openspec/glossary.md`
- 文件不存在时先创建（参考 `openspec/templates/evolution/glossary.md` 格式）

**A3. 风险图谱**
- 读取复盘报告"六、风险事件"章节
- 如有新风险事件，追加到 `openspec/risk-map.md` 的对应分区（"代码热点"或"问题模式"）
- 文件不存在时先创建（参考 `openspec/templates/evolution/risk-map.md` 格式）

**C1. 规格演化日志**（如本次有 delta spec sync）
- 将 delta spec 的变更（改了什么 + 为什么）追加到 `openspec/specs/CHANGELOG.md`
- 文件不存在时先创建并写入标题行

**C2. 效率指标**
- 将复盘报告"八、效率信号"的数据追加到 `openspec/metrics.md`：
  `| {date} | {change-name} | {change-type} | {需求澄清轮次} | {设计澄清轮次} | {暂停次数} | {任务数} |`
- 文件不存在时先创建并写入表头

---

### Step 3：Layer B 进化分析（条件触发，N ≥ 3 时自动执行）

**触发判断**：统计 `openspec/retrospectives/` 下 `pending-review` 状态的复盘文件数 N（不含 `accumulated-insights.md`）

**N < 3 时**：
提示用户：「✅ 归档完成，知识库已更新。复盘已保存（第 N 个），还需 {3-N} 个复盘后将自动触发进化分析。」然后结束。

**N ≥ 3 时，执行以下分析**：

1. 读取所有 `pending-review` 状态的复盘文件

2. 分析以下模式（仅当出现 2+ 次视为显著）：
   - 【B1: 问题分类学】哪些"漏检问题"反复出现？哪些"无效问题"反复出现？
   - 【B2: 任务模式】同类型 change 的任务结构是否有共性？哪些步骤总被遗漏？
   - 【B3: 用户偏好】是否发现稳定的决策/交互偏好值得记录到 config.yaml？

3. 生成/更新 `openspec/retrospectives/accumulated-insights.md`，记录发现和具体优化建议

4. 使用 AskUserQuestion 工具展示进化提案：
   ```
   🧬 进化分析完成！基于 N 个复盘，发现以下优化机会：

   📚 问题分类学优化（X 条）：
   1. [新增到需求分类学/边界与异常] "XX" 问题（N 个复盘漏检）
   2. [从设计分类学删除] "YY" 问题（N 个复盘均标记为噪音）

   📋 任务模板优化（Y 条）：
   1. [新建 feature-add 任务模板]（基于 3 次 feature change 的共性结构）
   2. [在 bug-fix 模板中增加"回归验证"步骤]（2 次被遗漏）

   ⚙️ 偏好/规则优化（Z 条）：
   1. [建议记录用户偏好] 观察到你通常选择保守技术方案...

   是否现在应用以上优化？
   A) 全部应用
   B) 部分应用（请说明保留/跳过哪些）
   C) 暂不应用（下次归档时再次提醒）
   ```

5. 根据用户选择执行：
   - **A（全部应用）**：
     - 更新 `openspec/templates/taxonomy/requirement-issue-taxonomy.md`（B1）
     - 更新 `openspec/templates/taxonomy/design-issue-taxonomy.md`（B1）
     - 更新/创建 `openspec/task-patterns/` 下对应文件（B2）
     - 如有偏好建议：更新 `openspec/config.yaml` 的 `user_preferences`（B3）
     - 将已分析复盘文件状态改为 `incorporated`
     - 提示：「✅ 进化完成！知识库已更新，下次流程将更精准。」
   - **B（部分应用）**：仅应用用户确认的条目，未应用条目记入 `accumulated-insights.md` 的"待定区"
   - **C（暂不应用）**：保持 `pending-review`，下次归档时重新评估
