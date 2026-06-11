---
name: llm-wiki-generator
description: 为代码仓库生成 LLM Wiki 知识库,供需求评审/技术方案 Agent 渐进式加载。
  支持后端(api/mq/job)和前端(page/component)锚点。
  当用户说"生成项目 Wiki"、"更新项目知识库"、"构建 LLM 文档"、"为这个仓库做 Wiki"时触发。
  锚点由项目根目录 .ace/wiki/_meta.yml 配置驱动,通过对话调整状态。
---

# LLM Wiki Generator

为代码仓库生成结构化的 LLM Wiki 知识库。

## 触发条件

用户消息包含以下任一模式时激活:
- "生成 Wiki" / "构建 Wiki" / "创建 Wiki" / "初始化 Wiki"
- "更新 Wiki" / "刷新 Wiki" / "重建 Wiki"
- "生成项目知识库" / "为这个仓库做 LLM 文档"
- "自动扫描锚点" / "扫描锚点" (在已有 _meta.yml 但未配置时)
- "开始构建" / "继续构建" (在配置就绪后)

## 工作流:三分支锚点

第一步:检查项目根目录 `.ace/wiki/_meta.yml` 是否存在且有内容。

### 分支 A:首次初始化(.ace/wiki/_meta.yml 不存在)

流程:
1. 创建 `.ace/wiki/` 目录
2. 读取 `~/.claude/skills/llm-wiki-generator/templates/_meta.yml`
3. 写入 `.ace/wiki/_meta.yml`(空骨架,含注释和示例)
4. 展示:

```
已初始化 .ace/wiki/_meta.yml。锚点配置为空,请选择:

1. 我来手动编辑 .ace/wiki/_meta.yml(参考文件内注释示例)
2. 自动扫描全仓库(用内置规则识别所有锚点,写回 _meta.yml 后请你确认)
3. 用自然语言告诉我扫描范围
   - 例如:"扫 application 包下所有 *Application 类"
   - 例如:"加上 listener 包的 @QmqConsumer"
   - 可多轮追加,最后说"开始构建"

配置完成后再次触发 Skill 或说"开始构建"。
```

5. **停止,不进行构建**

### 分支 B:已初始化但 anchors 为空(或仅含注释)

流程:
1. 读取 `.ace/wiki/_meta.yml`
2. 检查 `anchors` 字段是否为空
3. 如果为空,展示与分支 A 相同的提示菜单
4. **停止,不进行构建**

### 分支 C:已配置,执行构建

流程:
1. 读取 `.ace/wiki/_meta.yml`
2. 解析 `anchors` 字段(见"锚点解析"章节)
3. 进入四阶段并行构建流水线(见"构建流水线"章节)

## 锚点解析

从 `.ace/wiki/_meta.yml` 的 `anchors` 字段解析锚点列表。

### 配置格式

_meta.yml 示例:
```yaml
type: backend

anchors:
  api:
    - FlightFillPageComponentApplication    # 精确类名
    - "*Application"                        # 类名 glob
    - "@RestController"                     # 注解(@前缀)
    - "**/application/**"                   # 路径 glob(含/或**)
    - { name: "*Service", in: "**/api/**" } # 组合:名字+路径限定
  mq:
    - "@QmqConsumer"
    - { annotation: "@KafkaListener", in: "**/listener/**" }
  job:
    - "@QSchedule"
    - "*Job"
```

### 字符串判定规则

按字符串形态自动判定匹配维度:

| 字符串形态 | 判定为 | 查找方式 |
|------------|-------|---------|
| `@` 开头 | 注解/装饰器 | grep 带该注解的类/函数 |
| 含 `/` 或 `**` | 路径 glob | find 路径下的锚点文件 |
| 其他(可含 `*`) | 名字 | grep 类名/组件名/函数名 |

### 对象形式(组合时)

```yaml
{ name: "*Application", in: "**/application/**" }
{ annotation: "@RestController", in: "**/api/**" }
```

`name`/`annotation` 和 `in` 全部 AND。

### 多条规则间 OR

合并去重,产出最终锚点清单。

### 解析结果

产出此结构:
```
锚点清单:
  api:
    - type: api
      className: FlightFillPageComponentApplication
      fileName: FlightFillPageComponentApplication
  mq:
    - type: mq
      className: GradeChangeListener
      fileName: GradeChangeListener
  ...
```

`fileName` 即 `className`,保留原始类名。

## 自然语言扫描范围

当用户用自然语言描述扫描范围时(非"开始构建"),解析意图并追加到 `.ace/wiki/_meta.yml` 的 `anchors`。

### 解析规则

| 用户说 | 解析为 |
|--------|-------|
| "扫描 application 目录" | path: `**/application/**` |
| "看看 com.ctrip....flight 包" | path: `com/ctrip/.../flight/**` |
| "所有带 @QmqConsumer 的类" | annotation: `@QmqConsumer` |
| "*Application 结尾的类" | name: `*Application` |
| "src/pages 下的页面" | path: `src/pages/**` |
| "FlightFillPageComponentApplication 这个类" | name 精确: `FlightFillPageComponentApplication` |
| "和上次扫描的合并" / "再加上" | 追加模式 |
| "去掉 mq 那部分" | 删除对应 key |

### 处理流程

1. 从用户消息中提取:
   - **类型**:api / mq / job / page / component(根据关键词推断,如"接口"→api,"消息"→mq)
   - **WHAT**:名字或注解(如"*Application"、"@QmqConsumer")
   - **WHERE**:路径或包(如"application 包"、"listener 目录")

2. 推断不明确时反问:
   - "src 下面" 过宽 → "具体哪个子目录?"
   - "那个接口" 模糊 → "是指哪个类?"

3. 构造 selector 并估算命中数:
   ```bash
   # 名字匹配
   grep -rl "class <Pattern>" src/ --include="*.java" | wc -l
   # 注解匹配
   grep -rl "@QmqConsumer" src/ --include="*.java" | wc -l
   # 路径匹配
   find src/ -path "<Pattern>" -name "*.java" | wc -l
   ```

4. 回显:
   ```
   将追加到 _meta.yml.anchors.api:
     { name: "*Application", in: "**/application/**" }
   预估命中 12 个类。确认?(yes / no)
   ```

5. 用户确认后,读取 `.ace/wiki/_meta.yml`,在对应 `anchors.<type>` 下追加 selector。

6. 输出"已写入。继续追加或回复'开始构建'。"

### 路径标准化

- Java 包 `com.ctrip.ibu.member` → 路径 `com/ctrip/ibu/member/**`
- 用户说 "flight 包" 时,先 `find . -type d -name "*flight*"` 找候选,反问确认

### 多轮累加

每次追加不覆盖已有条目。用户说"清空"/"重新开始"时才重置。

## 构建流水线(分支 C)

解析 _meta.yml 获得锚点清单后,执行四阶段流水线:

```
Phase 1: 锚点发现(串行)
  → Phase 2: 锚点 Wiki 生成(并行,独立)
  → Phase 3: INDEX + SUMMARY(并行)
  → Phase 4: 校验与报告(串行)
```

### Phase 1:锚点发现

1. 从 _meta.yml.anchors 解析所有规则(字符串/对象,glob/注解/路径)
2. 对每条规则执行 grep/find,收集命中的类/文件
3. 合并去重,产出最终清单
4. 展示:

```
锚点清单:
  api:  FlightFillPageComponentApplication, QueryMemberRightsV35Application, ... (共 12)
  mq:   GradeChangeListener (共 1)
  job:  CoinsExpireJob (共 1)

共 14 个锚点。开始构建?
```

5. 等待用户确认"开始构建"。

### Phase 2:锚点 Wiki 生成(并行)

**设计约束:锚点独立生成,不共享状态,不依赖缓存。**

对每个锚点并发执行(上限 min(锚点数, 8)个并行子任务):

每个子任务:
1. **Read 锚点源码**
   - 读取锚点类完整源码
   - 识别调用链(方法调用 → 被调用的类)
   - 沿调用链读取关键依赖类(自行判断深度,通常 2-3 层)
   - 重点关注:DomainService、Repository、Builder、外部 Client

2. **LLM 填充模板**
   - 读取 `~/.claude/skills/llm-wiki-generator/templates/<type>.md`
   - 基于源码分析,填充 frontmatter 所有必填字段
   - 基于源码分析,填充 body 所有章节:
     - 业务场景(产品语言)
     - 业务输入/业务输出(产品语言)
     - 业务规则(版本兼容、边界条件、限制类型)
     - 调用链路(方法名/阶段名,不带行号)
     - 外部依赖详情(表格:依赖 | 业务用途 | 调用时机)
     - 主要实现类(类名列表)
     - 相关锚点(交叉链接,如有)
   - 计算 body 的 token 数,填入 `token_count` 字段
   - 通过 `git rev-parse HEAD` 获取当前 commit hash,填入 `source_commit` 字段
   - 通过 `date -u +"%Y-%m-%dT%H:%M:%SZ"` 获取当前 UTC 时间,填入 `generated_at` 字段

3. **写入文件**
   - 写入 `.ace/wiki/anchors/<type>/<fileName>.md`(fileName 即原始类名 PascalCase,来自 Phase 1 解析结果)
   - 确保 frontmatter 格式正确,`name` 字段填入原始类名(非 kebab-case)

4. **返回**
   - 状态:success / failed
   - token 消耗:{ input: N, output: M }

**失败处理**:单锚点失败不阻塞其他,降级标记 failed 继续。

### Phase 3:INDEX + SUMMARY(并行)

两个子任务并发:

#### INDEX.md 生成

1. 扫描 `.ace/wiki/anchors/**/*.md` 的 frontmatter
2. 读取 `~/.claude/skills/llm-wiki-generator/templates/INDEX.md`
3. 按 type 分组列出每个锚点:
   ```
   ### API (12 个)
   - [FlightFillPageComponentApplication](./anchors/api/FlightFillPageComponentApplication.md) — <description>
   ```
4. 从 _meta.yml 推导 frontmatter:
   - `name`:从 pom.xml / package.json 读项目名
   - `type`:index
   - `description`:LLM 基于 README + 项目源码一句概括
5. 计算 token 数填入 `token_count`
6. 写入 `.ace/wiki/INDEX.md`

#### SUMMARY.md 生成

1. 读取 `~/.claude/skills/llm-wiki-generator/templates/SUMMARY.md`
2. 收集所有锚点 frontmatter 的 `description + related_business + business_scenario`
3. LLM 提炼并填充:
   - **frontmatter 元信息**:从 _meta.yml 或代码推断 `business_domain`/`business_subdomain`/`project_type`/`keywords`
   - **快速查找**(5-8 条):"我想了解XX" → 锚点,帮助 Agent 快速定位
   - **核心业务流程**(3-5 条):每条 1 行概要 + 结构化锚点列表(标注各锚点在流程中的角色)
   - **核心领域模型**(5-8 个):只纳入业务领域概念,排除技术实现模式;每个模型 1 句定义 + 关联锚点(标注关联原因)
4. 计算 token 数填入 frontmatter `token_count`
5. 写入 `.ace/wiki/SUMMARY.md`

### Phase 4:校验与报告

#### 校验

1. 遍历 `.ace/wiki/anchors/**/*.md`,检查 frontmatter 必填字段:
   - `name` ✓
   - `type` ✓
   - `description` ✓
   - `token_count` ✓
2. INDEX.md 锚点数 == anchors/ 实际文件数?
3. 收集失败锚点列表和原因

#### Token 报告

汇总所有阶段的 token 消耗:

| 层级 | 统计方式 |
|------|---------|
| 单锚点 | 子任务返回的 {input, output} |
| INDEX.md | INDEX 生成任务返回 |
| SUMMARY.md | SUMMARY 生成任务返回 |
| 总计 | 所有任务合计 |

存量统计:
- 扫描 `.ace/wiki/anchors/**/*.md` 文件大小估算 token (1 token ≈ 4 字符英文,≈ 2 字符中文)
- INDEX.md + SUMMARY.md 大小估算

#### 最终输出

```
=== LLM Wiki 构建报告 ===
锚点:api 12 / mq 1 / job 1 (共 14)

成功:14  失败:0

Token 消耗:
  锚点生成: input 85,432 | output 124,678
  INDEX.md: input  1,234 | output   2,100
  SUMMARY:  input  8,900 | output   5,432
  ─────────────────────────────────────
  总计:     input 95,566 | output 132,210

存量 Wiki:
  14 个锚点文件,总计 ~40,000 tokens
  INDEX.md           ~800 tokens
  SUMMARY.md         ~1,500 tokens
  全库加载预估:       ~42,000 tokens
```

## 自动扫描

当用户选择"自动扫描全仓库"时:

1. 读取 `~/.claude/skills/llm-wiki-generator/rules/auto-scan.md`
2. 按规则扫描项目
3. 排除测试类、Mapper、RepositoryImpl、通用 UI 组件
4. 结果以精确名字符串列表写入 `.ace/wiki/_meta.yml` 的 `anchors` 段
5. 展示:
   ```
   扫描到:
     api: 12 (FlightFillPageComponentApplication, QueryMemberRightsV35Application, ...)
     mq:  2 (GradeChangeListener, ...)
     job: 3 (CoinsExpireJob, ...)
   确认无误后回复"开始构建",或编辑 .ace/wiki/_meta.yml 调整后再触发。
   ```
6. 不立即构建,等待用户确认

## 关键约束

### 文档生成约束
- **去除行号引用**:章节锚定方法名/阶段名,不写"行85-93"
- **产品化语言优先**:业务场景、业务规则用产品语言,非技术术语
- **frontmatter 必填**:`name` / `type` / `description` / `token_count` 缺一不可
- **失败不阻塞**:单锚点失败不影响其他,最后汇总

### 行为约束
- **永不静默写入**:任何对 `_meta.yml` 的修改先回显确认
- **永不静默扫描**:扫描需用户明确选择,扫描结果先写回 _meta.yml 再构建
- **构建总是全量**:不搞增量更新
- **对话驱动**:状态在 _meta.yml 和用户消息中,不依赖命令行参数

## 模板文件引用

Skill 使用以下模板文件,位置相对于 `~/.claude/skills/llm-wiki-generator/`:

| 文件 | 用途 | 何时读取 |
|------|------|---------|
| `templates/_meta.yml` | 项目元信息骨架 | 分支 A 初始化时 |
| `templates/INDEX.md` | 项目索引骨架 | Phase 3 生成 INDEX 时 |
| `templates/SUMMARY.md` | 知识地图骨架 | Phase 3 生成 SUMMARY 时 |
| `templates/api.md` | API 锚点 Wiki 模板 | Phase 2 生成 api 锚点时 |
| `templates/mq.md` | MQ 锚点 Wiki 模板 | Phase 2 生成 mq 锚点时 |
| `templates/job.md` | Job 锚点 Wiki 模板 | Phase 2 生成 job 锚点时 |
| `templates/page.md` | 页面锚点 Wiki 模板 | Phase 2 生成 page 锚点时 |
| `templates/component.md` | 组件锚点 Wiki 模板 | Phase 2 生成 component 锚点时 |
| `rules/auto-scan.md` | 自动扫描规则 | 用户选择自动扫描时 |

## Token 估算参考

| 值 | 说明 |
|----|------|
| 1 token ≈ 4 字符(英文) | 用于从文件大小估算 token |
| 1 token ≈ 2 字符(中文) | 中文编码更紧凑 |
| 单锚点 Wiki ~2000-5000 tokens | 典型范围 |
| INDEX.md ~800 tokens | 20 个锚点项目 |
| SUMMARY.md ~1500 tokens | 15 个锚点项目 |

Token 计数方法:
- **精确**:LLM 返回的实际 token 数(子任务返回)
- **估算**:文件字节数 / 4 (英文) 或 字符数 / 2 (中文)
- 报告同时展示精确值(构建消耗)和估算值(存量大小)

## 相关 Skill

- [llm-wiki-reader](../llm-wiki-reader/SKILL.md) — Agent 如何渐进式消费 Wiki 知识库（需求评审/方案设计/影响分析）
