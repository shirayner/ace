---
name: {{project-name}}
type: index
token_count: {{N}}
description: {{一句话产品语言概括项目}}
---

# {{project-name}}

## 知识地图
- [SUMMARY.md](./SUMMARY.md) — 核心业务流程与领域模型

## 锚点目录

### API ({{api_count}} 个)
{{#each api_entries}}
- [{{name}}](./anchors/api/{{name}}.md) — {{description}}
{{/each}}

### MQ 消费 ({{mq_count}} 个)
{{#each mq_entries}}
- [{{name}}](./anchors/mq/{{name}}.md) — {{description}}
{{/each}}

### Job ({{job_count}} 个)
{{#each job_entries}}
- [{{name}}](./anchors/job/{{name}}.md) — {{description}}
{{/each}}

{{#if page_entries}}
### 页面 ({{page_count}} 个)
{{#each page_entries}}
- [{{name}}](./anchors/page/{{name}}.md) — {{description}}
{{/each}}
{{/if}}

{{#if component_entries}}
### 业务组件 ({{component_count}} 个)
{{#each component_entries}}
- [{{name}}](./anchors/component/{{name}}.md) — {{description}}
{{/each}}
{{/if}}
