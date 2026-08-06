---
name: requirement-review
description: 交互式 PRD 评审工作流 - 从产品、技术、测试等多角度进行全面评审
version: 1.0.0
---

# PRD 评审 Skill

## ⚠️ Gotchas（关键约束与陷阱）

**在开始之前，必须知道这些问题才能避免常见错误**：

### 文件名规则

- **Title 必须英文化**：文件名中的 `{title}` 部分不能包含中文、空格或特殊字符
  - ❌ 不行：`prd_review_full_二手车交易平台_20260610_133045.md`
  - ❌ 不行：`prd_review_full_used car trading_20260610_133045.md`
  - ✅ 正确：`prd_review_full_UsedCarTradingPlatform_20260610_133045.md`

- **转换规则**（按优先级）：
  1. **若 PRD 已有英文名称**，直接使用，去掉特殊字符和空格，转换为 PascalCase
     - 例："API 设计规范" → `APIDesignSpecification` 或 `ApiDesignSpec`
  2. **若 PRD 是中文名称**，提取 3-5 个关键词，转为 PascalCase
     - 例："二手车交易平台" → `UsedCarTradingPlatform`
     - 例："用户权限管理模块" → `UserPermissionManagement`
  3. **若无法准确转换**，使用 `PRD_YYYYMMDD_HHmmss` 作为 fallback title
     - 例：`prd_review_full_PRD_20260610_133045.md`

- **路径结构**：输出目录使用英文 title
  ```
  ~/.prd-review/{PascalCaseTitle}/
  └── prd_review_breakdown_PascalCaseTitle_20260610_133045.md
  ```

### 资源依赖

- **roles.json 必须存在**：如果文件不存在或格式错误，Step 3 将失败
  - 建议在 Step 1 时提前验证
  - 若不存在，提示用户"角色配置缺失，请检查 resources/roles.json"

- **Template 解析失败会破坏报告结构**：
  - 若 `references/{role_id}/template.md` 读取失败，生成的报告将丢失角色特定的格式
  - 务必在 Step 3 时确认模板成功加载，否则停止工作流

### 输入格式限制

- **本地文件路径**：必须是绝对路径或相对于当前工作目录的相对路径
  - ❌ `~/prd.md`（不支持波浪线展开）
  - ✅ `/Users/username/prd.md` 或 `./prd.md`

- **Feishu 链接**：需要符合特定格式（仅支持特定的分享链接）
  - 若链接无法解析，将降级为文本输入

- **PRD 内容解析**：
  - 若 PRD 内容超过 50KB，建议分模块输入
  - 若包含非文本内容（表格、图片），需要特殊处理

### 时间戳与唯一性

- **时间戳格式**：`YYYYMMdd_HHmmss`（保证不同评审间的报告不会覆盖）
  - 即使在同一分钟内运行多次评审，也应该生成不同的文件
  - 若时间戳冲突，追加毫秒级区分或序号

### 模板映射与内容丢失

- **工作流输出不会 100% 映射到模板**：
  - 敏捷拆分生成的所有内容不一定都会出现在最终报告
  - 只有与选定角色的模板字段相关的内容才会被提取
  - 其他内容会被丢弃（这是设计行为，不是错误）

---

## 快速开始

欢迎使用 PRD 评审助手！我将帮您从多个专业角度对 PRD 进行全面评审。

**核心能力**：
- 🔍 敏捷拆分 - 将需求分解为可管理的 Epic/Feature/Story
- 💬 多轮对话 - 针对各个角度的深度讨论和质疑
- 📊 智能报告 - 生成结构化的评审报告（包含问题、建议、优先级）
- ✅ 质量验证 - 自检循环确保报告完整性

**支持的输入格式**：
- 本地文件：`./my_prd.md` 或 `/path/to/prd.md`
- Feishu 链接：`https://...`
- 直接粘贴 PRD 内容

---

## 子命令支持 ✨

支持以下子命令来选择工作流：

| 子命令 | 说明 | 输出 |
|--------|------|------|
| **prd-review**（默认） | 完整的 PRD 评审工作流 | `prd_review_full_{title}_{timestamp}.md` |
| **prd-breakdown** ✨ | 仅进行敏捷拆分 | `prd_review_breakdown_{title}_{timestamp}.md` |
| **prd-analyze** | 快速分析（不生成报告） | 仅进行多轮对话分析 |

**使用方式**：

```
/prd-review prd-breakdown
/prd-review prd-review
/prd-review prd-analyze
```

**输出目录结构**：

所有报告保存在用户主目录下的 `.prd-review/` 文件夹中，按 PRD 标题组织：

```
~/.prd-review/
├── {PRD_TITLE_1}/
│   ├── prd_review_breakdown_{title}_{timestamp}.md
│   ├── prd_review_full_{title}_{timestamp}.md
│   └── ...
├── {PRD_TITLE_2}/
│   └── ...
└── ...
```

例如：
```
~/.prd-review/
└── UsedCarTradingPlatform/
    ├── prd_review_breakdown_UsedCarTradingPlatform_20260610_133045.md
    ├── prd_review_full_UsedCarTradingPlatform_20260610_140000.md
    └── prd_review_breakdown_UsedCarTradingPlatform_20260610_150000.md
```

**📌 重要**：详见上方"Gotchas - 文件名规则"章节。

---

## 工作流大纲

快速参考三条工作流路径及其特点：

| 工作流 | 命令 | 适用场景 | 输出 | 步骤 |
|--------|------|---------|------|------|
| **完整评审** | `prd-review`（默认） | 全面的多角度 PRD 评审 | `prd_review_full_{title}_{timestamp}.md` | 8步完整流程 |
| **敏捷拆分** ✨ | `prd-review prd-breakdown` | 快速拆分，无需评审角色 | `prd_review_breakdown_{title}_{timestamp}.md` | 5阶段拆分 |
| **快速分析** | `prd-review prd-analyze` | 仅对话分析，不生成报告 | 仅对话记录 | Step 1-5 |

**详细说明**：
- 完整评审工作流 → 见 `references/WORKFLOW.md`
- 敏捷拆分工作流 → 见 `references/BREAKDOWN_WORKFLOW.md`
- 工作流路由和加载顺序 → 见 `references/GUIDE.md`

---

## 📚 参考索引表

根据以下表格在合适的时机加载对应的参考文件。硬门禁规则见下方。

| 文件 | 用途 | 何时加载 |
|------|------|---------|
| `references/WORKFLOW.md` | 完整8步工作流详细说明 | 用户未指定子命令或指定"prd-review"时 |
| `references/BREAKDOWN_WORKFLOW.md` | 5步敏捷拆分流程 | 用户指定"prd-breakdown"时 |
| `references/CHECKLIST.md` | 预期行为检查清单 | Step 6报告生成前加载，自检使用 |
| `references/VALIDATION_RULES.md` | 输入验证规则和 Plan-Validate-Execute 模式 | Step 1-2和Step 3执行验证时参考 |
| `references/GUIDE.md` | 加载指南和工作流路由 | 执行过程中存在困惑时参考 |
| `references/{role_id}/standard.md` | 选定角色的评审标准 | Step 3用户明确选择角色后加载 |
| `references/{role_id}/template.md` | 选定角色的报告模板 | Step 6报告生成前加载 |
| `resources/roles.json` | 角色列表配置 | Step 3角色选择前加载 |

---

## <HARD-GATE> 延迟加载约束

**这些门禁规则确保按需加载，防止提前加载浪费上下文**：

### 门禁 1：前置条件验证（Step 1-2）

- `resources/roles.json` 必须存在且有效
- 若不存在，停止工作流并提示用户"角色配置缺失，请检查 resources/roles.json"

### 门禁 2：工作流路由（Step 1 完成后）

- 首先确认用户指定的子命令（prd-review/prd-breakdown/prd-analyze）
- **路由确认前，禁止加载 WORKFLOW.md 或 BREAKDOWN_WORKFLOW.md**
- 根据子命令路由到对应workflow文件

### 门禁 3：角色确认（Step 3）

- **Step 3 完成、用户明确选择角色后，才能加载 `references/{role_id}/standard.md` 和 `template.md`**
- 角色选择前禁止直接跳转到 Step 4

### 门禁 4：报告生成（Step 6）

- 生成报告前必须加载 `references/CHECKLIST.md` 进行自检
- 若自检不通过，返回 Step 5 重新分析
- 只有通过自检后，才加载 `references/{role_id}/template.md` 进行报告生成

---

## 开始评审

现在准备好了！请提供您的 PRD：

- 📄 **本地文件**：`./my_prd.md` 或 `/path/to/prd.md`
- 🔗 **Feishu 链接**：复制分享链接
- 📝 **直接粘贴**：将 PRD 内容直接输入

选择合适的方式，我将自动根据您的输入类型加载和处理 PRD。

**支持的工作流**：
- 默认 `/prd-review` 或 `/prd-review prd-review` → 完整评审
- `/prd-review prd-breakdown` → 敏捷拆分
- `/prd-review prd-analyze` → 快速分析
