# Claude Code 推荐架构（实践里最好用）

适用于：

* 中大型项目
* 多 workflow
* 多 agent / 多技能协作
* 长期维护
* 团队共享 Claude Code 能力

核心思想：

```text
skill = orchestration
shared = knowledge
script = execution
template = generation
```

不要把 skill 当函数。

Claude Code 当前本质还是：

```text
prompt orchestration system
```

不是：

```text
programmable agent runtime
```

---

# 一、推荐目录结构

推荐：

```text
.claude/
├── skills/
│   ├── feature-dev/
│   │   ├── SKILL.md
│   │   └── examples/
│   │
│   ├── api-review/
│   │   ├── SKILL.md
│   │   └── examples/
│   │
│   └── bugfix/
│       └── SKILL.md
│
├── shared/
│   ├── coding-style.md
│   ├── architecture.md
│   ├── testing-guide.md
│   ├── prompts/
│   └── checklists/
│
├── templates/
│   ├── react-component.tsx
│   ├── service-template.ts
│   └── test-template.ts
│
├── scripts/
│   ├── gen-api.sh
│   ├── run-tests.sh
│   └── validate-schema.py
│
└── agents/
    ├── researcher.md
    └── reviewer.md
```

---

# 二、职责划分（最重要）

## 1. skills = 工作流编排层

skill 不负责：

* 存大量知识
* 放长规范
* 放实现细节

skill 只负责：

```text
什么时候做什么
```

即：

* workflow
* routing
* orchestration
* task decomposition

---

## 正确的 skill

例如：

```md
# Feature Development Skill

## Workflow

1. 分析需求
2. 阅读 architecture.md
3. 生成 API
4. 生成 UI
5. 运行测试
6. 输出 checklist

参考:
- ../../shared/architecture.md
- ../../shared/testing-guide.md
```

skill 应该短。

经验值：

```text
200~800 行以内最佳
```

超过后：

* routing 变差
* attention 下降
* Claude 开始遗忘

---

# 三、shared = 知识库层

shared 放：

## 1. 编码规范

```text
coding-style.md
```

---

## 2. 架构规则

```text
architecture.md
```

---

## 3. 测试规范

```text
testing-guide.md
```

---

## 4. Prompt 片段

```text
shared/prompts/
```

例如：

```text
react-best-practice.md
```

---

## 5. Checklist

```text
shared/checklists/
```

例如：

```text
pr-review.md
```

---

# 四、templates = 代码生成层

Claude 很适合：

```text
template-driven generation
```

不要让它每次自由发挥。

---

例如：

```text
templates/
├── nextjs-api-route.ts
├── react-hook.ts
├── prisma-service.ts
└── vitest-template.ts
```

skill 中：

```md
生成 service 时参考：
../../templates/prisma-service.ts
```

效果会明显稳定。

---

# 五、scripts = 真正的“函数”

这是最关键的认知。

Claude skill 不是函数。

真正稳定的是：

```text
shell/python/node scripts
```

---

例如：

```text
scripts/
├── generate-openapi.ts
├── validate-schema.py
├── lint-all.sh
└── create-module.js
```

skill：

```md
执行：

./scripts/validate-schema.py
```

这比：

```text
skill 调 skill
```

稳定太多。

---

# 六、一个 orchestrator skill > 很多小 skill

很多人一开始会：

```text
/analyze
/generate-api
/generate-ui
/write-tests
```

最后通常都会崩。

因为 Claude：

* 不擅长复杂 skill routing
* 容易丢 context
* skill 间状态不稳定

---

实践里更好的是：

```text
/feature-dev
```

内部：

```text
Step 1
Step 2
Step 3
```

由一个 skill 完成。

---

# 七、推荐 skill 粒度

推荐：

## 好的粒度

```text
feature-dev
bugfix
api-review
refactor
migration
```

---

## 不好的粒度

```text
write-function
write-test
generate-hook
```

太碎。

Claude routing 会变差。

---

# 八、examples 非常重要

每个 skill：

```text
examples/
```

放：

* 输入案例
* 输出案例
* 最佳实践

Claude 对 example learning 很敏感。

---

例如：

```text
skills/api-review/examples/
├── good-review.md
└── bad-review.md
```

效果远超长 prompt。

---

# 九、subagent 只用于重任务隔离

不要滥用。

只适合：

## 1. 长上下文分析

例如：

* 大仓库搜索
* 全局依赖分析

---

## 2. 独立 reviewer

例如：

```text
主 agent 写代码
subagent 做 review
```

---

## 3. 并行探索

例如：

```text
一个 agent 看 backend
一个 agent 看 frontend
```

---

不要：

```text
每一步都 subagent
```

否则：

* token 爆炸
* latency 爆炸
* context 漂移

---

# 十、推荐的真实工作流

最佳实践：

```text
User Request
    ↓
Orchestrator Skill
    ↓
Read shared knowledge
    ↓
Use templates
    ↓
Execute scripts
    ↓
Optional subagent
    ↓
Generate output
```

这是目前最稳定的 Claude Code 工程化方案。

---

# 十一、关键原则（经验总结）

## 1.

```text
skill 不要互相调用
```

---

## 2.

```text
skill 尽量短
```

---

## 3.

```text
shared 才是长期知识库
```

---

## 4.

```text
script 才是真正的复用逻辑
```

---

## 5.

```text
template 比 prompt 更稳定
```

---

## 6.

```text
一个 orchestrator skill > 多碎 skill
```

---

# 十二、最终推荐结构（生产可用）

```text
.claude/
├── skills/
│   ├── feature-dev/
│   ├── bugfix/
│   ├── api-review/
│   └── migration/
│
├── shared/
│   ├── architecture.md
│   ├── coding-style.md
│   ├── testing-guide.md
│   ├── prompts/
│   └── checklists/
│
├── templates/
│
├── scripts/
│
└── agents/
```

这是目前社区里最接近：

```text
“可维护 AI 工程体系”
```

的一种组织方式。
