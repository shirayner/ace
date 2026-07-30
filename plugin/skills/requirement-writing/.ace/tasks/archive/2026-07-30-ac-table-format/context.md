# AC 表格化

## 目标
prd-projection-engine 的 core.md 模板中,「功能需求 Features」节的验收标准(AC)块当前用 Given/When/Then 列表。用户要求改为表格展示。

## 已对齐决策
- 产出:改模板文件 core.md(非仅口头建议)
- 形式:AC 一律表格,每行一个场景,列 = 场景 | Given | When | Then

## 完成标准
- core.md AC 块改表格,语义(场景名/Given/When/Then)不丢
- 检查全库有无其他位置(规则条文/示例)依赖旧列表格式,同步或确认无需同步
- 与 projection-rules P1 自检(条件用列表/比较用表)不冲突
- 占位符完整、无死引用
