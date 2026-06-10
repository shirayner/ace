---
name: {{fileName}}
type: api
token_count: {{token_count}}
generated_at: {{ISO_TIMESTAMP}}
source_commit: {{GIT_COMMIT_HASH}}
description: {{一句话产品语言描述}}
business_scenario: {{业务场景,如 booking-flow / 航班填写页}}
contract: {{API 契约名}}
implementation_class: {{主要实现类}}
related_business: [{{逗号分隔的业务概念}}]
external_deps:
{{#each external_deps}}
  - {{name}}: {{业务用途}}
{{/each}}
keywords: [{{中英文关键词}}]
---

# {{入口标题(产品语言)}}

## 业务场景
<!-- 描述用户在哪个流程的哪个步骤会触发该入口,以及入口的业务意图 -->

## 业务输入 / 业务输出
<!-- 产品语言描述,非 DTO 字段罗列 -->
- **输入**:
- **输出**:

## 业务规则
<!-- 贯穿该入口的业务约束,如版本兼容、guest 处理、限制类型、边界条件等 -->

## 调用链路
<!-- 以方法名/阶段名为锚点,不带行号 -->
{{调用链描述}}

## 外部依赖详情
<!-- 表格:依赖 | 业务用途 | 调用时机 -->
| 依赖 | 业务用途 | 调用时机 |
|------|---------|---------|
| | | |

## 主要实现类(定位锚点)
<!-- 类名列表,供 Agent 在代码中快速定位 -->

## 相关入口
<!-- 交叉链接到其他 entries/ 下的相关入口 -->
