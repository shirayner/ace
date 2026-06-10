---
name: {{fileName}}
type: mq
token_count: {{token_count}}
generated_at: {{ISO_TIMESTAMP}}
source_commit: {{GIT_COMMIT_HASH}}
description: {{一句话产品语言描述}}
trigger: {{谁发的消息、什么场景发}}
topic: {{消息 topic}}
consumer_group: {{消费组}}
implementation_class: {{主要实现类}}
idempotency: {{幂等策略描述}}
related_business: [{{逗号分隔的业务概念}}]
external_deps:
{{#each external_deps}}
  - {{name}}: {{业务用途}}
{{/each}}
keywords: [{{中英文关键词}}]
---

# {{入口标题(产品语言)}}

## 业务场景
<!-- 描述什么业务事件触发该消息,消费后产生什么业务效果 -->

## 消息触发条件
<!-- 谁在什么条件下发送该消息 -->

## 消费处理流程
<!-- 以方法名/阶段名为锚点 -->
{{处理流程描述}}

## 幂等策略
<!-- 重复消费如何处理 -->

## 业务规则
<!-- 贯穿该入口的业务约束 -->

## 外部依赖详情
| 依赖 | 业务用途 | 调用时机 |
|------|---------|---------|
| | | |

## 主要实现类(定位锚点)
