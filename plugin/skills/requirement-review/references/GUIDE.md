# 参考文件加载指南

此文档说明如何在执行工作流时按需加载各个参考文件。

---

## 文件层级关系

```
SKILL.md (主文档，220行精简版)
├── 参考索引表 (位置: 指向下方所有文件)
└── 硬门禁规则 (位置: 定义加载约束)
    │
    ├─→ references/WORKFLOW.md (完整8步工作流详细说明)
    │   用途: 完整的prd-review工作流
    │   加载时机: 用户未指定子命令或指定"prd-review"时
    │   依赖: 无
    │
    ├─→ references/BREAKDOWN_WORKFLOW.md (5步敏捷拆分流程)
    │   用途: 快速PRD拆分，无深度评审
    │   加载时机: 用户指定"prd-breakdown"时
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
    └─→ references/{role_id}/template.md (角色报告模板)
        用途: Step 6报告生成前加载
        加载时机: Step 6报告生成阶段
        依赖: Step 3角色选择确认
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
- PRD 内容是否成功加载

**触发加载**：
- 若存在 → 继续到 Step 3
- 若不存在 → 停止工作流并提示用户"角色配置缺失"

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
- 用户是否明确选择了一个角色？

**触发加载**：
- Step 3 后才能加载 `references/{role_id}/standard.md` 和 `template.md`
- 角色选择前禁止直接跳转到 Step 4

---

### 门禁 4：报告生成（Step 6）

**检查项**：
- 是否已完成 Step 1-5？
- 是否已加载CHECKLIST.md进行自检？

**触发加载**：
- 生成报告前必须加载CHECKLIST.md进行自检
- 若自检不通过，返回Step 5重新分析
- 只有通过自检后，才加载 `references/{role_id}/template.md`

---

## 依赖关系图

```
resources/roles.json
        ↓ (Step 3读取)
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
                        ↓
                   CHECKLIST.md (自检)
                        ↓
                   prd_review_breakdown_*.md (Step 8输出)
```

---

## 加载检查清单

在执行工作流时，使用此清单确保正确的加载顺序：

- [ ] **Step 1初始化**：加载SKILL.md主文档
- [ ] **Step 1-2完成后**：检查roles.json是否存在（前置条件）
- [ ] **路由确认**：根据子命令加载对应的workflow文件（WORKFLOW.md 或 BREAKDOWN_WORKFLOW.md）
- [ ] **Step 3前**：加载resources/roles.json
- [ ] **Step 3用户选择角色后**：加载references/{role_id}/standard.md
- [ ] **Step 5完成后**：加载CHECKLIST.md进行自检
- [ ] **Step 6前**：加载references/{role_id}/template.md（仅prd-review路径）
- [ ] **Step 8**：保存输出

---

## 常见问题

### Q: 能否提前加载WORKFLOW.md？
**A**: 否。根据硬门禁规则，工作流路由门禁要求先确认用户指定的子命令，再加载对应workflow文件。提前加载会浪费上下文。

### Q: 如果roles.json不存在，如何处理？
**A**: 停止工作流并提示用户"角色配置缺失，请检查 resources/roles.json"。这是Step 1-2的前置条件检查。

### Q: prd-breakdown路径是否需要加载standard.md？
**A**: 否。prd-breakdown仅进行敏捷拆分，不选择角色，因此不加载standard.md或template.md。

### Q: CHECKLIST.md何时加载？
**A**: Step 5完成后、Step 6报告生成前，用于自检确保工作流执行完整性。

### Q: 是否所有路径都需要加载CHECKLIST.md？
**A**: 是的。无论是prd-review、prd-breakdown还是prd-analyze，在生成输出前都应该加载CHECKLIST.md进行自检。
