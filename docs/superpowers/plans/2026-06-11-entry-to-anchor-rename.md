# Entry → Anchor Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 wiki 生态三个 Skill 中的"入口"统一重命名为"锚点"，包括 Skill 正文、模板、rules、配置文件字段、目录路径。

**Architecture:** 纯文本替换。三组 Skill（generator/reader/requirement-analysis），每组同时改 plugin/ 源文件和 ~/.claude/skills/ 安装副本。最后迁移 .ace/wiki/ 存量数据。

**Tech Stack:** 无运行时变更，sed/Edit 文本替换。

---

### Task 1: llm-wiki-generator — 入口 → 锚点

**Files:**
- Modify: `plugin/skills/llm-wiki-generator/SKILL.md`
- Modify: `plugin/skills/llm-wiki-generator/rules/auto-scan.md`
- Modify: `plugin/skills/llm-wiki-generator/templates/_meta.yml`
- Modify: `plugin/skills/llm-wiki-generator/templates/INDEX.md`
- Modify: `plugin/skills/llm-wiki-generator/templates/SUMMARY.md`
- Modify: `plugin/skills/llm-wiki-generator/templates/api.md`
- Modify: `plugin/skills/llm-wiki-generator/templates/mq.md`
- Modify: `plugin/skills/llm-wiki-generator/templates/job.md`
- Modify: `plugin/skills/llm-wiki-generator/templates/page.md`
- Modify: `plugin/skills/llm-wiki-generator/templates/component.md`
- Modify: `~/.claude/skills/llm-wiki-generator/SKILL.md`
- Modify: `~/.claude/skills/llm-wiki-generator/rules/auto-scan.md`
- Modify: `~/.claude/skills/llm-wiki-generator/templates/_meta.yml`
- Modify: `~/.claude/skills/llm-wiki-generator/templates/INDEX.md`
- Modify: `~/.claude/skills/llm-wiki-generator/templates/SUMMARY.md`
- Modify: `~/.claude/skills/llm-wiki-generator/templates/api.md`
- Modify: `~/.claude/skills/llm-wiki-generator/templates/mq.md`
- Modify: `~/.claude/skills/llm-wiki-generator/templates/job.md`
- Modify: `~/.claude/skills/llm-wiki-generator/templates/page.md`
- Modify: `~/.claude/skills/llm-wiki-generator/templates/component.md`

#### Step 1a: SKILL.md — 全文替换

对 plugin/ 和 ~/.claude/ 两处 SKILL.md 执行相同替换：

```bash
# 通用替换：入口 → 锚点（中文正文）
sed -i '' 's/入口/锚点/g' plugin/skills/llm-wiki-generator/SKILL.md
sed -i '' 's/入口/锚点/g' ~/.claude/skills/llm-wiki-generator/SKILL.md

# entries/ → anchors/（路径）
sed -i '' 's|entries/|anchors/|g' plugin/skills/llm-wiki-generator/SKILL.md
sed -i '' 's|entries/|anchors/|g' ~/.claude/skills/llm-wiki-generator/SKILL.md

# entries（YAML 字段名，在描述模板变量时）→ anchors
sed -i '' 's|entries 段|anchors 段|g' plugin/skills/llm-wiki-generator/SKILL.md
sed -i '' 's|entries 段|anchors 段|g' ~/.claude/skills/llm-wiki-generator/SKILL.md
```

#### Step 1b: rules/auto-scan.md — 章节标题 + 字段名

```bash
for DIR in plugin/skills/llm-wiki-generator ~/.claude/skills/llm-wiki-generator; do
  sed -i '' 's/入口/锚点/g' "$DIR/rules/auto-scan.md"
  sed -i '' 's/entries:/anchors:/g' "$DIR/rules/auto-scan.md"
done
```

#### Step 1c: templates/_meta.yml — 注释 + 字段名

```bash
for DIR in plugin/skills/llm-wiki-generator ~/.claude/skills/llm-wiki-generator; do
  sed -i '' 's/入口/锚点/g' "$DIR/templates/_meta.yml"
  sed -i '' 's/entries:/anchors:/g' "$DIR/templates/_meta.yml"
done
```

#### Step 1d: templates/INDEX.md — 标题 + 路径

```bash
for DIR in plugin/skills/llm-wiki-generator ~/.claude/skills/llm-wiki-generator; do
  sed -i '' 's/入口目录/锚点目录/g' "$DIR/templates/INDEX.md"
  sed -i '' 's|entries/|anchors/|g' "$DIR/templates/INDEX.md"
done
```

#### Step 1e: templates/SUMMARY.md — 标题 + 路径 + 正文

```bash
for DIR in plugin/skills/llm-wiki-generator ~/.claude/skills/llm-wiki-generator; do
  sed -i '' 's/入口/锚点/g' "$DIR/templates/SUMMARY.md"
  sed -i '' 's|entries/|anchors/|g' "$DIR/templates/SUMMARY.md"
done
```

#### Step 1f: templates/api.md — 标题简化 + 路径

```bash
for DIR in plugin/skills/llm-wiki-generator ~/.claude/skills/llm-wiki-generator; do
  # 入口标题(产品语言) → 标题（产品语言）
  sed -i '' 's/锚点标题(产品语言)/标题（产品语言）/g' "$DIR/templates/api.md"
  # 相关入口 → 相关锚点
  sed -i '' 's/相关入口/相关锚点/g' "$DIR/templates/api.md"
  # entries/ → anchors/
  sed -i '' 's|entries/|anchors/|g' "$DIR/templates/api.md"
done
```

注意：Step 1f 的 `锚点标题`→`标题` 替换必须在 Step 1a 的 `入口`→`锚点` 之后执行（因为 `入口标题` 先变成了 `锚点标题`）。

#### Step 1g: templates/mq.md, job.md

```bash
for DIR in plugin/skills/llm-wiki-generator ~/.claude/skills/llm-wiki-generator; do
  for TPL in mq.md job.md; do
    # 锚点标题(产品语言) → 标题（产品语言）
    sed -i '' 's/锚点标题(产品语言)/标题（产品语言）/g' "$DIR/templates/$TPL"
  done
done
```

#### Step 1h: templates/page.md, component.md

```bash
for DIR in plugin/skills/llm-wiki-generator ~/.claude/skills/llm-wiki-generator; do
  for TPL in page.md component.md; do
    sed -i '' 's/锚点标题(产品语言)/标题（产品语言）/g' "$DIR/templates/$TPL"
    # 入口文件路径 → 源码路径（此时已被替换为 锚点文件路径）
    sed -i '' 's/锚点文件路径/源码路径/g' "$DIR/templates/$TPL"
  done
done
```

#### Step 1i: 验证 generator 改动

```bash
# 确认无残留"入口"
grep -r "入口" plugin/skills/llm-wiki-generator/ --include="*.md" --include="*.yml"
# 预期: 无输出

# 确认无残留 entries/ 路径（INDEX.md 和 SUMMARY.md 中）
grep -r "entries/" plugin/skills/llm-wiki-generator/templates/ --include="*.md"
# 预期: 无输出

# 确认 ~/.claude 同样干净
grep -r "入口" ~/.claude/skills/llm-wiki-generator/ --include="*.md" --include="*.yml"
# 预期: 无输出
```

#### Step 1j: 提交

```bash
git add plugin/skills/llm-wiki-generator/
git commit -m "refactor: rename entry to anchor in llm-wiki-generator skill

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: llm-wiki-reader — 入口 → 锚点

**Files:**
- Modify: `plugin/skills/llm-wiki-reader/SKILL.md`
- Modify: `plugin/skills/llm-wiki-reader/rules/loading-strategy.md`
- Modify: `~/.claude/skills/llm-wiki-reader/SKILL.md`
- Modify: `~/.claude/skills/llm-wiki-reader/rules/loading-strategy.md`

#### Step 2a: SKILL.md — 全文替换

```bash
for DIR in plugin/skills/llm-wiki-reader ~/.claude/skills/llm-wiki-reader; do
  sed -i '' 's/入口/锚点/g' "$DIR/SKILL.md"
  sed -i '' 's|entries/|anchors/|g' "$DIR/SKILL.md"
  # entry（英文上下文指代单个entry文件时）→ anchor
  sed -i '' 's/目标 entry/目标 anchor/g' "$DIR/SKILL.md"
  sed -i '' 's/指定 entry/指定 anchor/g' "$DIR/SKILL.md"
  sed -i '' 's/关联 entry/关联 anchor/g' "$DIR/SKILL.md"
  sed -i '' 's/ entry / anchor /g' "$DIR/SKILL.md"
done
```

#### Step 2b: rules/loading-strategy.md — 全文替换

```bash
for DIR in plugin/skills/llm-wiki-reader ~/.claude/skills/llm-wiki-reader; do
  sed -i '' 's/入口/锚点/g' "$DIR/rules/loading-strategy.md"
  sed -i '' 's/ entry / anchor /g' "$DIR/rules/loading-strategy.md"
  sed -i '' 's/ entries / anchors /g' "$DIR/rules/loading-strategy.md"
done
```

#### Step 2c: 验证 reader 改动

```bash
grep -r "入口" plugin/skills/llm-wiki-reader/ --include="*.md"
# 预期: 无输出

grep -r "入口" ~/.claude/skills/llm-wiki-reader/ --include="*.md"
# 预期: 无输出
```

#### Step 2d: 提交

```bash
git add plugin/skills/llm-wiki-reader/
git commit -m "refactor: rename entry to anchor in llm-wiki-reader skill

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: requirement-analysis — 路径引用更新

**Files:**
- Modify: `plugin/skills/requirement-analysis/SKILL.md`
- Modify: `plugin/skills/requirement-analysis/templates/requirement-anchors-analysis.md`
- Modify: `~/.claude/skills/requirement-analysis/SKILL.md`
- Modify: `~/.claude/skills/requirement-analysis/templates/requirement-anchors-analysis.md`

#### Step 3a: SKILL.md — `entries/` → `anchors/`

requirement-analysis 本身已用"锚点"，只需替换路径引用。

```bash
for DIR in plugin/skills/requirement-analysis ~/.claude/skills/requirement-analysis; do
  sed -i '' 's|entries/|anchors/|g' "$DIR/SKILL.md"
  # 如有 entries 作为字段名
  sed -i '' 's|entries.\(type\)|anchors.\1|g' "$DIR/SKILL.md"
done
```

#### Step 3b: template — 同样替换

```bash
for DIR in plugin/skills/requirement-analysis ~/.claude/skills/requirement-analysis; do
  sed -i '' 's|entries/|anchors/|g' "$DIR/templates/requirement-anchors-analysis.md"
done
```

#### Step 3c: 验证

```bash
grep -r "entries/" plugin/skills/requirement-analysis/ --include="*.md"
# 预期: 无输出
```

#### Step 3d: 提交

```bash
git add plugin/skills/requirement-analysis/
git commit -m "refactor: update entries/ paths to anchors/ in requirement-analysis

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: .ace/wiki/ 存量迁移

**Files:**
- Rename: `.ace/wiki/entries/` → `.ace/wiki/anchors/`
- Modify: `.ace/wiki/INDEX.md`
- Modify: `.ace/wiki/SUMMARY.md`

#### Step 4a: 目录重命名

```bash
mv .ace/wiki/entries .ace/wiki/anchors
```

#### Step 4b: INDEX.md 内容更新

```bash
sed -i '' 's/入口目录/锚点目录/g' .ace/wiki/INDEX.md
sed -i '' 's|entries/|anchors/|g' .ace/wiki/INDEX.md
```

#### Step 4c: SUMMARY.md 内容更新

```bash
sed -i '' 's/入口/锚点/g' .ace/wiki/SUMMARY.md
sed -i '' 's|entries/|anchors/|g' .ace/wiki/SUMMARY.md
```

#### Step 4d: 验证 wiki

```bash
ls .ace/wiki/anchors/api/
# 预期: init.md, doctor.md, list.md, spec.md, uninstall.md

grep "entries/" .ace/wiki/INDEX.md .ace/wiki/SUMMARY.md
# 预期: 无输出
```

#### Step 4e: 提交

```bash
git add .ace/wiki/
git commit -m "refactor: rename entries/ to anchors/ in wiki knowledge base

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: 全量验证

- [ ] **Step 5a: 确认 plugin/ 无残留"入口"**

```bash
grep -r "入口" plugin/skills/llm-wiki-generator/ plugin/skills/llm-wiki-reader/ plugin/skills/requirement-analysis/ --include="*.md" --include="*.yml"
```
预期: 无输出

- [ ] **Step 5b: 确认 plugin/ 无残留 `entries/` 路径**

```bash
grep -r "entries/" plugin/skills/llm-wiki-generator/ plugin/skills/llm-wiki-reader/ plugin/skills/requirement-analysis/ --include="*.md" --include="*.yml"
```
预期: 无输出

- [ ] **Step 5c: 确认 ~/.claude 同样干净**

```bash
grep -r "入口" ~/.claude/skills/llm-wiki-generator/ ~/.claude/skills/llm-wiki-reader/ ~/.claude/skills/requirement-analysis/ --include="*.md" --include="*.yml" 2>/dev/null
grep -r "entries/" ~/.claude/skills/llm-wiki-generator/ ~/.claude/skills/llm-wiki-reader/ ~/.claude/skills/requirement-analysis/ --include="*.md" --include="*.yml" 2>/dev/null
```
预期: 无输出

- [ ] **Step 5d: 确认关键锚点术语正确出现**

```bash
grep "锚点" plugin/skills/llm-wiki-generator/SKILL.md | head -5
grep "anchors/" plugin/skills/llm-wiki-generator/templates/INDEX.md
grep "锚点目录" .ace/wiki/INDEX.md
```

- [ ] **Step 5e: 最终 git status**

```bash
git status
```
预期: 工作区干净（所有改动已提交）
