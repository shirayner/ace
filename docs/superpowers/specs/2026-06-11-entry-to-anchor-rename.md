# 统一术语：入口 → 锚点

> wiki 生态统一使用"锚点"(anchor)取代"入口"(entry)，原因是"锚点"技术栈无关、更好表达"代码定位参考点"的职能。

## 范围

三处统一改名：

1. **llm-wiki-generator Skill** — SKILL.md + rules/auto-scan.md + 8 个模板文件
2. **llm-wiki-reader Skill** — SKILL.md + rules/loading-strategy.md
3. **requirement-analysis Skill** — SKILL.md + template 中 `entries/` 路径引用

同时更新 `~/.claude/skills/` 下的已安装副本（与 plugin/ 相同结构）。

存量 wiki 迁移：`.ace/wiki/entries/` → `.ace/wiki/anchors/`，INDEX.md 和 SUMMARY.md 内容更新。

## 命名规则

| 场景 | 使用 | 示例 |
|------|------|------|
| Skill 中文正文 | 锚点 | "锚点清单"、"锚点解析" |
| 文件系统路径 | `anchors` | `.ace/wiki/anchors/` |
| 配置文件字段 | `anchors` | `_meta.yml` 中 `anchors:` |
| 模板变量 | `anchors` | `anchors/api/{{name}}.md` |
| frontmatter 字段 | 保持英文 | `type: api`（不变） |

复合术语变更：

| 之前 | 之后 |
|------|------|
| 入口解析 / 入口清单 | 锚点解析 / 锚点清单 |
| 入口 Wiki | 锚点 Wiki |
| 入口目录 | 锚点目录 |
| 候选入口 | 候选锚点 |
| 入口标题(产品语言) | 标题（产品语言） |
| 入口文件路径 | 源码路径 |
| 相关入口 | 相关锚点 |
| 看这个入口 | 看这个锚点 |

## 不改动

- 文件名（SKILL.md、INDEX.md 等保持不变）
- `type` 字段值（api/mq/job/page/component）
- `entry` 在英文上下文中作为普通英文单词的用例
