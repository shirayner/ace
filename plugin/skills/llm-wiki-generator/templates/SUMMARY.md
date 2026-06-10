---
name: {{project-name}}
type: summary
token_count: {{N}}
description: {{一句话产品语言概括项目}}
business_domain: {{业务板块}}
business_subdomain: {{业务子板块}}
project_type: {{backend|frontend|hybrid}}
keywords: [{{中英文关键词,逗号分隔}}]
---

# {{project-name}}

## 快速查找

| 我想了解... | 看这个入口 |
|------------|-----------|
{{#each lookup_entries}}
| {{question}} | [{{name}}](./entries/{{type}}/{{name}}.md) |
{{/each}}

## 核心业务流程

{{#each business_flows}}
### {{flow_name}}
- **概要**: {{one_line_summary}}
- **入口**:
{{#each entries}}
  - [{{name}}](./entries/{{type}}/{{name}}.md) — {{role_in_flow}}
{{/each}}

{{/each}}

## 核心领域模型

{{#each domain_models}}
### {{model_name}}
- **定义**: {{one_line_definition}}
- **关联入口**:
{{#each entries}}
  - [{{name}}](./entries/{{type}}/{{name}}.md) — {{relevance}}
{{/each}}

{{/each}}
