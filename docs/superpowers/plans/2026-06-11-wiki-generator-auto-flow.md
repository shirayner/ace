# llm-wiki-generator Auto Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 llm-wiki-generator 从多轮确认流程改为意图识别驱动的全自动流程。

**Architecture:** 单文件改动 — `plugin/skills/llm-wiki-generator/SKILL.md`（及 `~/.claude/` 副本），纯 Markdown 文本替换。不改动任何代码逻辑。

**Tech Stack:** 无运行时变更，Edit/Write 文本编辑。

---

### Task 1: 核心流程 — 意图识别 + 取消三分支

**Files:**
- Modify: `plugin/skills/llm-wiki-generator/SKILL.md`

#### Step 1a: 更新 frontmatter description

将 description 中的触发关键词更新为匹配新流程：

```markdown
# Old:
description: 为代码仓库生成 LLM Wiki 知识库,供需求评审/技术方案 Agent 渐进式加载。
  支持后端(api/mq/job)和前端(page/component)锚点。
  当用户说"生成项目 Wiki"、"更新项目知识库"、"构建 LLM 文档"、"为这个仓库做 Wiki"时触发。
  锚点由项目根目录 .ace/wiki/_meta.yml 配置驱动,通过对话调整状态。

# New:
description: 为代码仓库生成 LLM Wiki 知识库,供需求评审/技术方案 Agent 渐进式加载。
  支持后端(api/mq/job)和前端(page/component)锚点。
  意图识别驱动：指定扫描范围则定向扫描，指定手动则写骨架停止，默认全自动扫描并构建。
  当用户说"生成项目 Wiki"、"更新项目知识库"、"构建 LLM 文档"、"为这个仓库做 Wiki"时触发。
```

#### Step 1b: 更新触发条件

```markdown
# Old (15-20):
用户消息包含以下任一模式时激活:
- "生成 Wiki" / "构建 Wiki" / "创建 Wiki" / "初始化 Wiki"
- "更新 Wiki" / "刷新 Wiki" / "重建 Wiki"
- "生成项目知识库" / "为这个仓库做 LLM 文档"
- "自动扫描锚点" / "扫描锚点" (在已有 _meta.yml 但未配置时)
- "开始构建" / "继续构建" (在配置就绪后)

# New:
用户消息包含以下任一模式时激活:
- "生成 Wiki" / "构建 Wiki" / "创建 Wiki" / "初始化 Wiki"
- "更新 Wiki" / "刷新 Wiki" / "重建 Wiki"
- "生成项目知识库" / "为这个仓库做 LLM 文档"
- "扫描锚点" / "扫描锚点" / "开始构建" / "继续构建"
```

#### Step 1c: 替换 工作流 章节（核心变更）

将整个"工作流:三分支锚点"章节（22-62 行）替换为意图识别驱动：

```markdown
## 工作流:意图识别

第一步:LLM 从用户消息中提取意图信号，选择对应路径。

### 意图识别

| 意图信号 | 关键词/模式 | 路径 |
|---------|-----------|------|
| 手动配置 | "手动"、"自己编辑"、"我来配" | 写骨架 → 停止 |
| 指定扫描范围 | "扫描 X 包"、"所有 @Consumer"、"src/pages 下"等 | 自然语言解析 → 扫描 → 构建 |
| 默认无偏好 | "生成 Wiki"、"构建知识库"、无范围关键词 | 自动扫描 → 构建 |
| 直接构建 | "开始构建"、_meta.yml 已有 anchors 且无新范围 | 解析 → 构建 |

### 路径 1:手动配置

1. 检查 `.ace/wiki/_meta.yml` 是否存在
   - **不存在** → 创建目录，读取模板 `_meta.yml`，写入骨架
   - **存在** → 继续
2. 输出提示:
```
_meta.yml 已就绪。编辑 anchors 字段配置锚点后回复"开始构建"。

编辑器打开: .ace/wiki/_meta.yml
参考文档: ~/.claude/skills/llm-wiki-generator/templates/_meta.yml
```
3. **停止**

### 路径 2:指定扫描范围

1. 从用户消息解析扫描范围（规则见"自然语言扫描范围"章节）
2. 读取 `.ace/wiki/_meta.yml`，追加 selector 到 `anchors` 对应 type
3. （如 _meta.yml 不存在则先创建骨架）
4. 执行自动扫描（规则见 `rules/auto-scan.md`），合并去重
5. 将扫描结果以精确名字符串列表写入 `_meta.yml`
6. 输出摘要，**直接进入构建流水线**

### 路径 3:默认全自动

1. 检查 `.ace/wiki/_meta.yml`
   - **不存在** → 创建目录，读取模板写入骨架，执行自动扫描 → 写入 → 进入构建
   - **anchors 为空** → 执行自动扫描 → 写入 → 进入构建
2. 输出摘要，**直接进入构建流水线**

### 路径 4:直接构建

1. 读取 `.ace/wiki/_meta.yml`，解析 `anchors` 字段
2. anchors 不为空 → 输出摘要，**直接进入构建流水线**
3. anchors 为空 → 降级为路径 3（自动扫描 → 构建）

### 摘要格式

构建前输出:
```
扫描到 N 个锚点 (api:X mq:Y job:Z page:U component:V)，开始生成 Wiki...
```
```

#### Step 1d: 提交

```bash
git add plugin/skills/llm-wiki-generator/SKILL.md
git commit -m "feat: replace 3-branch workflow with intent recognition in wiki-generator

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: 移除确认节点

**Files:**
- Modify: `plugin/skills/llm-wiki-generator/SKILL.md`

#### Step 2a: 自然语言扫描 — 移除确认

替换"处理流程"小节中的步骤 4-6：

```markdown
# Old (lines 168-176):
4. 回显:
   ```
   将追加到 _meta.yml.entries.api:
     { name: "*Application", in: "**/application/**" }
   预估命中 12 个类。确认?(yes / no)
   ```

5. 用户确认后,读取 `.ace/wiki/_meta.yml`,在对应 `entries.<type>` 下追加 selector。

6. 输出"已写入。继续追加或回复'开始构建'。"

# New:
4. 读取 `.ace/wiki/_meta.yml`,在对应 `anchors.<type>` 下追加 selector。
5. 继续执行构建流水线（不等待用户确认）。
```

#### Step 2b: Phase 1 锚点发现 — 移除确认

```markdown
# Old (lines 204-215):
4. 展示:

```
锚点清单:
  api:  FlightFillPageComponentApplication, QueryMemberRightsV35Application, ... (共 12)
  mq:   GradeChangeListener (共 1)
  job:  CoinsExpireJob (共 1)

共 14 个锚点。开始构建?
```

5. 等待用户确认"开始构建"。

# New:
4. 输出摘要（格式见工作流章节），直接进入 Phase 2。
```

#### Step 2c: 自动扫描 — 移除确认

```markdown
# Old (lines 336-352):
4. 结果以精确名字符串列表写入 `.ace/wiki/_meta.yml` 的 `entries` 段
5. 展示:
   ```
   扫描到:
     api: 12 (FlightFillPageComponentApplication, QueryMemberRightsV35Application, ...)
     mq:  2 (GradeChangeListener, ...)
     job: 3 (CoinsExpireJob, ...)
   确认无误后回复"开始构建",或编辑 .ace/wiki/_meta.yml 调整后再触发。
   ```
6. 不立即构建,等待用户确认

# New:
4. 结果以精确名字符串列表写入 `.ace/wiki/_meta.yml` 的 `anchors` 段
5. 输出摘要，直接进入构建流水线（路径 2/3 已决定进入构建，此处不等待确认）
```

#### Step 2d: 更新行为约束

移除"永不静默扫描"和"永不静默写入"约束：

```markdown
# Old:
### 行为约束
- **永不静默写入**:任何对 `_meta.yml` 的修改先回显确认
- **永不静默扫描**:扫描需用户明确选择,扫描结果先写回 _meta.yml 再构建
- **构建总是全量**:不搞增量更新
- **对话驱动**:状态在 _meta.yml 和用户消息中,不依赖命令行参数

# New:
### 行为约束
- **构建总是全量**:不搞增量更新
- **意图驱动**:从用户消息提取意图，自动选择路径
- **摘要可见不可阻塞**:扫描/构建前输出摘要，但不等待确认
```

#### Step 2e: 提交

```bash
git add plugin/skills/llm-wiki-generator/SKILL.md
git commit -m "feat: remove all confirmation points from wiki-generator flow

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: ~/.claude 副本 + 验证

**Files:**
- Modify: `~/.claude/skills/llm-wiki-generator/SKILL.md`

#### Step 3a: 复制改动到 ~/.claude

```bash
cp plugin/skills/llm-wiki-generator/SKILL.md ~/.claude/skills/llm-wiki-generator/SKILL.md
```

#### Step 3b: 验证 — 确认无确认节点

```bash
# 确认移除了等待用户输入的关键词
grep -n "等待用户\|停止,不进行构建\|AskUserQuestion\|确认?(yes\|确认无误后回复" plugin/skills/llm-wiki-generator/SKILL.md
# 预期: 仅在"手动配置"路径有"停止"，其余无确认等待

# 确认意图识别章节存在
grep -c "意图识别" plugin/skills/llm-wiki-generator/SKILL.md
# 预期: >= 2

# 确认摘要格式存在
grep "扫描到.*个锚点.*开始生成 Wiki" plugin/skills/llm-wiki-generator/SKILL.md
# 预期: 1 行匹配

# 确认旧确认点已移除
grep "3. 用自然语言告诉我扫描范围" plugin/skills/llm-wiki-generator/SKILL.md
# 预期: 无输出

grep "共.*个锚点.*开始构建?" plugin/skills/llm-wiki-generator/SKILL.md
# 预期: 无输出（旧的 Phase 1 确认已移除）
```

#### Step 3c: 提交

```bash
# ~/.claude 不在 git 管理中，只确认 plugin/ 已全部提交
git status
# 预期: plugin/skills/llm-wiki-generator/ 无未提交改动
```
