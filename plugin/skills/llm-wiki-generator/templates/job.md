---
name: {{fileName}}
type: job
token_count: {{token_count}}
generated_at: {{ISO_TIMESTAMP}}
source_commit: {{GIT_COMMIT_HASH}}
description: {{一句话产品语言描述}}
trigger_time: {{执行时机/周期}}
cron: {{cron 表达式}}
qschedule_name: {{QSchedule 任务名(如有)}}
data_scope: {{每次处理的数据范围,如"过期 30 天的 Coins"}}
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
<!-- 描述为什么需要定时执行,每次执行产生什么业务效果 -->

## 执行时机
<!-- cron + 自然语言描述 -->

## 数据范围
<!-- 每次处理哪些数据,为什么是这个范围 -->

## 处理流程
<!-- 以方法名/阶段名为锚点 -->
{{处理流程描述}}

## 业务规则
<!-- 贯穿该入口的业务约束 -->

## 外部依赖详情
| 依赖 | 业务用途 | 调用时机 |
|------|---------|---------|
| | | |

## 主要实现类(定位锚点)
