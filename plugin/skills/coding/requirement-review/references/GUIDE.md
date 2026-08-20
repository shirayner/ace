# 参考文件加载指南

此文档说明如何在执行工作流时按需加载各个参考文件。

---

## 文件层级关系

```
SKILL.md (主文档，210行精简版)
├── 参考索引表 (位置: 指向下方所有文件)
└── 硬门禁规则 (位置: 定义加载约束)
    │
    ├─→ references/WORKFLOW.md (完整8步工作流详细说明)
    │   用途: 完整的prd-review工作流
    │   加载时机: 用户未指定子命令或指定"prd-review"时
    │   依赖: VALIDATION_RULES.md (Step 1-2, 3)
    │
    ├─→ references/BREAKDOWN_WORKFLOW.md (5步敏捷拆分流程)
    │   用途: 快速PRD拆分，无深度评审
    │   加载时机: 用户指定"prd-breakdown"时
    │   依赖: VALIDATION_RULES.md (Step 1-2)
    │
    ├─→ references/VALIDATION_RULES.md (输入验证规则和PVE模式)
    │   用途: Plan-Validate-Execute验证模式、验证规则详情
    │   加载时机: Step 1-2 (输入验证)、Step 3 (角色验证)
    │   依赖: 无
    │
    ├─→ references/CHECKLIST.md (预期行为检查清单)
    │   用途: Step 6报告生成前自检
    │   加载时机: Step 5完成后、生成报告前
    │   依赖: 无（但应该在工作流中层级较低）
    │
    ├─→ resources/roles.json (角色列表配置)
    │   用途: 获取可用的评审角色
    │   加载时机: Step 3角色选择前
    │   依赖: 无（必须存在，否则工作流停止）
    │
    ├─→ references/{role_id}/standard.md (角色评审标准)
    │   用途: Step 3用户明确选择角色后加载
    │   加载时机: Step 3用户确认选择后
    │   依赖: Step 3角色选择确认
    │
    ├─→ references/{role_id}/template.md (角色报告模板)
    │   用途: Step 6报告生成前加载
    │   加载时机: Step 6报告生成阶段
    │   依赖: Step 3角色选择确认
    │
    └─→ references/GUIDE.md (当前文件)
        用途: 加载指南和工作流路由
        加载时机: 执行过程中存在困惑时参考
        依赖: 无
```

---

## 工作流路由和加载顺序

### 场景 1：prd-review（默认完整工作流）

```
用户执行: /prd-review  或  /prd-review prd-review
                            ↓
                   路由确认：prd-review
                            ↓
                加载: SKILL.md (主文档)
                            ↓
                   Step 1-2: 收集输入
                (详见 references/WORKFLOW.md)
                            ↓
          Step 3: 选择角色 → 加载 resources/roles.json
                            ↓
        用户选择角色 → 加载 references/{role_id}/standard.md
                            ↓
                   Step 4: 敏捷拆分
                (详见 references/WORKFLOW.md)
                            ↓
                   Step 5: 多轮对话评审
                (详见 references/WORKFLOW.md)
                            ↓
        Step 6: 生成报告前 → 加载 references/CHECKLIST.md 自检
                            ↓
      Step 6-7: 报告生成 → 加载 references/{role_id}/template.md
                            ↓
                   Step 8: 保存输出
                            ↓
                完成：输出prd_review_full_{title}_{timestamp}.md
```

### 场景 2：prd-breakdown（敏捷拆分，不选角色）

```
用户执行: /prd-review prd-breakdown
                            ↓
                   路由确认：prd-breakdown
                            ↓
                加载: SKILL.md (主文档)
                            ↓
          加载: references/BREAKDOWN_WORKFLOW.md
                            ↓
          阶段 1-5: 按步骤进行敏捷拆分
          (无需选角色，无需多轮评审)
                            ↓
           Step 5完成 → 加载 references/CHECKLIST.md 自检
                            ↓
                   Step 8: 保存输出
                            ↓
        完成：输出prd_review_breakdown_{title}_{timestamp}.md
```

### 场景 3：prd-analyze（仅对话分析，不生成报告）

```
用户执行: /prd-review prd-analyze
                            ↓
                   路由确认：prd-analyze
                            ↓
                加载: SKILL.md (主文档)
                            ↓
          Step 1-2: 收集输入 + 显示摘要
                            ↓
          Step 3: 选择角色 → 加载 resources/roles.json
                            ↓
        用户选择角色 → 加载 references/{role_id}/standard.md
                            ↓
       Step 4-5: 敏捷拆分 + 多轮对话评审
          (无需生成报告，对话结束)
                            ↓
        完成：无文件输出，仅保存对话记录（可选）
```

---

## 条件加载的触发点

### 门禁 1：前置条件验证（Step 1-2）

**检查项**：
- `resources/roles.json` 是否存在且有效
- PRD 输入来源是否有效（本地文件/链接/文本）
- PRD 内容是否有效（格式、编码、长度等）

**验证规则**：详见 `references/VALIDATION_RULES.md`
- 本地文件路径验证
- Feishu 链接验证
- PRD 内容格式验证

**触发加载**：
- 若存在验证错误 → 收集错误、返回用户修正、重新验证
- 若验证通过 → 继续到 Step 3

---

### 门禁 2：工作流路由（Step 1 完成后）

**检查项**：
- 用户指定的子命令是什么？

**根据子命令加载对应的workflow文件**：

| 子命令 | 加载文件 | 执行路径 |
|--------|---------|---------|
| `prd-review`（默认） | WORKFLOW.md | 完整8步 |
| `prd-breakdown` | BREAKDOWN_WORKFLOW.md | 5阶段拆分 |
| `prd-analyze` | WORKFLOW.md + CHECKLIST.md | 仅对话（Step 1-5） |

**约束**：
- ❌ 路由确认前，禁止加载WORKFLOW.md或BREAKDOWN_WORKFLOW.md
- ✅ 根据子命令明确加载一个workflow文件

---

### 门禁 3：角色确认（Step 3）

**检查项**：
- roles.json 是否有效（必需字段、至少一个启用角色）
- 用户选择的角色是否有效（存在、启用、模板可加载）

**验证规则**：详见 `references/VALIDATION_RULES.md`
- roles.json 有效性验证
- 用户角色选择验证

**触发加载**：
- Step 3 前 → 加载 `resources/roles.json` 并验证
- Step 3 用户选择后 → 验证选择的有效性
- ✅ 验证通过 → 加载 standard.md 和 template.md
- ❌ 验证失败 → 提示错误、让用户重新选择

---

### 门禁 4：报告生成（Step 6）

**检查项**：
- 是否已完成 Step 1-5？
- 是否已加载CHECKLIST.md进行自检？
- 报告结构是否完整（必需字段、格式一致）？

**验证规则**：详见 `references/VALIDATION_RULES.md` 和 `references/CHECKLIST.md`
- 模板字段完整性验证
- 报告结构格式验证

**触发加载**：
- 生成报告前必须加载CHECKLIST.md进行自检
- ❌ 若自检不通过 → 返回Step 5重新分析
- ✅ 若自检通过 → 加载 `references/{role_id}/template.md` 进行报告生成

---

## 依赖关系图

```
VALIDATION_RULES.md (输入验证和PVE模式)
        ↓ (Step 1-2读取，执行输入验证)
        │
resources/roles.json
        ↓ (Step 3读取，执行配置验证)
        ├─→ references/{role_id}/standard.md
        │        ↓ (Step 5基于此进行评审)
        │        └─→ CHECKLIST.md (Step 6前自检)
        │                 ↓
        │           references/{role_id}/template.md
        │                 ↓ (Step 6填充模板)
        │           prd_review_full_*.md (Step 8输出)
        │
        └─→ (如果prd-breakdown路径)
                 BREAKDOWN_WORKFLOW.md
                        ↓ (执行时使用VALIDATION_RULES.md)
                   CHECKLIST.md (自检)
                        ↓
                   prd_review_breakdown_*.md (Step 8输出)
```

---

## 加载检查清单

在执行工作流时，使用此清单确保正确的加载顺序：

- [ ] **Step 1初始化**：加载SKILL.md主文档
- [ ] **Step 1-2执行**：加载VALIDATION_RULES.md，执行输入验证（本地文件/链接/文本内容）
- [ ] **Step 1-2完成后**：检查roles.json是否存在（前置条件）
- [ ] **路由确认**：根据子命令加载对应的workflow文件（WORKFLOW.md 或 BREAKDOWN_WORKFLOW.md）
- [ ] **Step 3前**：加载VALIDATION_RULES.md，加载resources/roles.json，执行配置验证
- [ ] **Step 3用户选择角色后**：执行角色选择验证，加载references/{role_id}/standard.md
- [ ] **Step 5完成后**：加载CHECKLIST.md进行自检
- [ ] **Step 6前**：加载references/{role_id}/template.md（仅prd-review路径）
- [ ] **Step 8**：保存输出

---

## 常见问题

### Q: 什么是 Plan-Validate-Execute 模式？
**A**: 这是一个通用的验证模式，在关键步骤（Step 1-2、Step 3、Step 6）应用：
1. **Plan**：明确验证点和通过标准
2. **Validate**：执行验证规则，收集所有错误（不逐个报错）
3. **Execute**：若验证通过则执行步骤，若失败则返回用户修正后重新验证

详见 `references/VALIDATION_RULES.md`。

### Q: 如何使用输入验证规则？
**A**: 在 Step 1-2 和 Step 3 时加载 `references/VALIDATION_RULES.md`，按照其中的验证表格验证用户输入。验证失败时收集所有错误后统一展示给用户。

### Q: 能否提前加载WORKFLOW.md？
**A**: 否。根据硬门禁规则，工作流路由门禁要求先确认用户指定的子命令，再加载对应workflow文件。提前加载会浪费上下文。

### Q: 如果roles.json不存在，如何处理？
**A**: 停止工作流并提示用户"角色配置缺失，请检查 resources/roles.json"。这是Step 1-2的前置条件检查。

### Q: 用户输入的路径或角色无效时怎么办？
**A**: 按照 Plan-Validate-Execute 模式，收集所有验证错误，统一展示给用户，并允许用户最多修正 3 次。第 3 次失败后提示用户放弃或联系支持。

### Q: prd-breakdown路径是否需要加载standard.md？
**A**: 否。prd-breakdown仅进行敏捷拆分，不选择角色，因此不加载standard.md或template.md。但仍需在 Step 1-2 执行输入验证。

### Q: CHECKLIST.md何时加载？
**A**: Step 5完成后、Step 6报告生成前，用于自检确保工作流执行完整性。

### Q: 是否所有路径都需要加载CHECKLIST.md？
**A**: 是的。无论是prd-review、prd-breakdown还是prd-analyze，在生成输出前都应该加载CHECKLIST.md进行自检。
