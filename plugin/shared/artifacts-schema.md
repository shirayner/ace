# artifacts/ 命名约定

`.ace/tasks/{changeName}/artifacts/` 下的文件按需懒建，不预创建固定子目录结构。

---

## 常用文件名约定

| 文件名                              | 产出 skill          | 说明                     |
| ----------------------------------- | ------------------- | ------------------------ |
| `technical-design.md`             | spec-coding         | 完整技术设计文档         |
| `prd.md`                          | requirement-analysis | 需求文档（用户故事 PRD） |
| `requirement-anchors-analysis.md` | requirement-analysis | 代码锚点分析             |
| `comprehension.md`                | spechub-coding      | COMPREHEND 阶段理解产物  |
| `artifact-inventory.json`         | spechub-coding      | 产物清单                 |
| `readiness-manifest.json`         | spechub-coding      | 基础设施就绪清单         |
| `readiness-check.md`              | spechub-coding      | READINESS 检查报告       |
| `handoff-check.md`                | spechub-coding      | VERIFY 阶段交付确认      |
| `decisions.md`                    | spechub-coding      | 偏离决策记录（上报用）   |
| `code-review-report.md`           | code-review         | 审查报告（深度模式）     |

## 子目录约定

| 子目录       | 用途                                          |
| ------------ | --------------------------------------------- |
| `issues/`  | 需求澄清问题文件（requirement-issues.md 等）  |
| `analysis/` | COMPREHEND Agent 并行分析产物（spechub 用）   |

## 创建原则

- 文件在首次写入时按需创建目录
- 不在任务初始化时预建空目录
- 需要 `issues/` 子目录的 skill 在写入 `issues/requirement-issues.md` 时自动创建

---

## input/ 目录（spechub 专用）

```
.ace/tasks/{changeName}/input/
├── manifest.json      # SpecHub 平台清单（只读）
└── artifacts/         # SpecHub 平台原始产物（只读）
    ├── prd.md
    ├── architecture.md
    ├── proposal.md
    └── contracts/
```

`input/` 内容由 `spechub-workflow.py start` 写入，视为只读输入，不由 AI 修改。
