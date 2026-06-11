---
name: {{fileName}}
type: component
token_count: {{token_count}}
generated_at: {{ISO_TIMESTAMP}}
source_commit: {{GIT_COMMIT_HASH}}
description: {{一句话产品语言描述}}
component_name: {{组件名}}
entry_file: {{入口文件路径}}
used_in_pages: [{{使用的页面列表}}]
api_calls:
{{#each api_calls}}
  - {{endpoint}}: {{业务用途}}
{{/each}}
related_business: [{{逗号分隔的业务概念}}]
keywords: [{{中英文关键词}}]
---

# {{入口标题(产品语言)}}

## 业务场景
<!-- 该组件在哪些页面出现,解决什么业务问题 -->

## 组件职责
<!-- 产品语言,该组件做什么 -->

## 业务输入 / 业务输出
<!-- Props/Events 的业务语义,非技术签名 -->
- **输入**:
- **输出**:

## 调用的后端接口
| 接口 | 业务用途 | 调用时机 |
|------|---------|---------|
| | | |

## 业务规则
<!-- 组件内嵌的业务约束 -->

## 使用页面
<!-- 链接到使用该组件的 page -->
