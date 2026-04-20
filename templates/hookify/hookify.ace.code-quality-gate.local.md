---
name: code-quality-gate
enabled: true
event: file
conditions:
  - field: file_extension
    operator: in
    value: [".js", ".ts", ".tsx", ".java", ".py", ".go", ".rs"]
action: warn
---

**代码质量检查**

保存代码文件时，请自检以下项目：

## 检查清单

### 1. 调试代码
- [ ] 已移除 `console.log` / `System.out.println` / `print`
- [ ] 已移除 `debugger;` 语句
- [ ] 已移除临时代码注释 (`// TEMP`, `// HACK`)

### 2. 代码规范
- [ ] 函数长度适中（理想 20 行内，最多 30 行）
- [ ] 嵌套深度不超过 3 层
- [ ] 无魔法值，使用命名常量
- [ ] 错误处理显性化

### 3. 测试相关
- [ ] 新增代码有对应测试
- [ ] 测试能通过
- [ ] 考虑边界条件

### 4. 敏感信息
- [ ] 无硬编码密码/API Key
- [ ] 配置文件使用环境变量

## 代码异味标记

| 标记 | 含义 | 建议 |
|------|------|------|
| `TODO` | 待办事项 | 确保有跟进计划 |
| `FIXME` | 需要修复 | 优先处理或创建 Issue |
| `HACK` | 临时方案 | 记录原因，计划重构 |
| `XXX` | 警告标记 | 高风险代码，需要审查 |
