---
name: {{fileName}}
type: page
token_count: {{token_count}}
generated_at: {{ISO_TIMESTAMP}}
source_commit: {{GIT_COMMIT_HASH}}
description: {{一句话产品语言描述}}
route: {{路由路径}}
entry_file: {{入口文件路径}}
parent_flow: {{所属用户流程,如 booking-flow}}
api_calls:
{{#each api_calls}}
  - {{endpoint}}: {{业务用途}}
{{/each}}
related_business: [{{逗号分隔的业务概念}}]
keywords: [{{中英文关键词}}]
---

# {{入口标题(产品语言)}}

## 业务场景
<!-- 用户在哪个流程访问该页面,页面解决什么问题 -->

## 页面结构
<!-- 核心区域/模块,产品语言描述 -->

## 业务输入 / 业务输出
<!-- 产品语言 -->
- **输入**:
- **输出**:

## 调用的后端接口
| 接口 | 业务用途 | 调用时机 |
|------|---------|---------|
| | | |

## 业务规则
<!-- 页面交互中的业务约束 -->

## 主要源文件(定位锚点)

## 相关页面/组件
<!-- 交叉链接 -->
