---
name: init
description: |
  初始化项目技术画像。分析代码仓库的架构、分层、中间件使用模式、编码约定，
  生成 .claude/project-profile.md 并在 CLAUDE.md 中通过 @path 引入。

  触发场景：
  - "初始化项目画像" / "init project profile"
  - "分析一下这个项目的技术架构"
  - "生成项目开发指导"
  - 首次在新项目使用 ACE 编码类 skill 时提示运行

  DO NOT TRIGGER: 纯代码编写（→ auto-goal / 直接 Edit）；
  code review（→ code-review）；写测试（→ ut）；
  已有 project-profile.md 且未要求更新。
---
# Init — 项目技术画像初始化

## 定位

分析目标仓库代码 → 推断技术画像 → 生成 `.claude/project-profile.md` → CLAUDE.md 引入。
后续所有 skill（auto-goal / spechub-handoff / code-review / ut）读取此画像作为项目上下文。

---

## 产出

### 文件：`.claude/project-profile.md`

```markdown
# 项目技术画像
> 自动生成于 {YYYY-MM-DD}，基于代码分析推断。人工补充部分标注 [manual]。
> 更新命令：/ace:init --refresh

## 系统定位
{一句话：做什么、面向谁}

## 架构分层
| 层 | 包路径 | 职责 |
|----|--------|------|
| presentation | com.xxx.soa | SOA endpoint 入口 |
| service | com.xxx.service | 业务编排 |
| dao | com.xxx.dao | 数据访问 |
| entity | com.xxx.entity | 数据模型 |

## 中间件使用
| 中间件 | 本项目用法摘要 | 关键类/配置 |
|--------|---------------|------------|
| DAL | {pattern 描述} | {AbstractBaseDao 位置} |
| SOA | {pattern 描述} | {SOAServiceImpl 基类} |
| ... | | |

## 编码约定
- 命名：{从代码统计推断的约定}
- 异常：{异常处理模式}
- 日志：{日志使用模式}
- 测试：{测试组织方式}

## 构建与运行
- 构建：{mvn / gradle 命令}
- 测试：{测试命令}
- 本地运行：{如有}

## 依赖与上下游
| 方向 | 系统/服务 | 交互方式 | 证据 |
|------|----------|---------|------|
| 调用 | xxx-service | SOA client | pom.xml + config |
| 被调 | — | SOA endpoint | contract |
| 消息 | xxx-topic | QMQ producer | code |

## 入口点索引
> 项目所有对外交互入口及核心 Service。用于快速定位"需求功能声明"对应的代码位置。

### SOA 接口（Provider）
| # | 操作名 | 类.方法 | 功能描述 | 文件路径 |
|---|--------|---------|---------|---------|

### QMQ Consumer（消息消费）
| # | Topic | 类.方法 | 功能描述 | 文件路径 |
|---|-------|---------|---------|---------|

### QSchedule Job（定时任务）
| # | 任务名 | 类 | 功能描述 | 调度周期 | 文件路径 |
|---|--------|-----|---------|---------|---------|

### 核心 Service（内部编排层）
| # | 类名 | 核心职责 | 关键方法 | 文件路径 |
|---|------|---------|---------|---------|
```

### CLAUDE.md 引入

在项目 CLAUDE.md 中追加一行：

```
@.claude/project-profile.md
```

实现渐进式加载——CLAUDE.md 保持简短，画像内容按需引用。

---

## 执行流程

### Phase 1: 检测与准备

1. 检查 `.claude/project-profile.md` 是否已存在

   - 存在 + 用户未要求刷新 → 提示"画像已存在，是否要更新？"
   - 存在 + `--refresh` → 进入 Phase 2（增量更新模式）
   - 不存在 → 进入 Phase 2（全量生成模式）
2. 确认项目根目录（通过 git rev-parse --show-toplevel）

### Phase 2: 自动推断

按以下顺序分析，每步产出结构化中间结论：

#### 2.1 构建系统识别

```
→ 检查 pom.xml / build.gradle / package.json
→ 提取：构建工具、Java版本、核心依赖列表
```

#### 2.2 中间件清单推断

```
→ 从 dependencies 识别：
   - ctrip-dal-client → DAL
   - soa-* / baiji-* → SOA
   - qmq-client → QMQ
   - qconfig-client → QConfig
   - qschedule-client → QSchedule
   - credis-client → CRedis
   - 其他公司级中间件
```

#### 2.3 架构分层分析

```
→ Glob src/main/java/**/ 列出包结构
→ 识别分层：
   - 含 soa/controller/endpoint → presentation
   - 含 service/biz → service
   - 含 dao/repository/mapper → dao
   - 含 entity/model/domain → entity
   - 含 config/configuration → config
   - 含 util/helper/common → infrastructure
```

#### 2.4 中间件使用模式提取

对每个识别到的中间件：

```
→ Grep 关键注解/基类（如 @DalTransactional, AbstractBaseDao, @QmqConsumer）
→ 提取 2-3 个代表性文件
→ 归纳 pattern：
   - 基类继承关系
   - 标准命名模式
   - 配置方式
   - 典型代码结构（不含具体业务）
```

#### 2.5 编码约定统计

```
→ 采样 10-20 个核心类
→ 统计：
   - 命名风格（Service/ServiceImpl, Dao, Entity）
   - 异常处理模式（自定义异常类 / 全局 handler）
   - 日志框架和用法
   - 注释风格
```

#### 2.6 上下游依赖识别

```
→ SOA client 配置 / @SoaClient 注解 → 调用的外部服务
→ SOA endpoint 定义 → 对外暴露的接口
→ QMQ producer topic → 发布的消息
→ QMQ consumer → 订阅的消息
→ HTTP client 配置 → 外部 REST 依赖
```

#### 2.7 入口点索引生成

> **设计意图**：提前梳理项目的所有对外交互入口及其功能映射，
> 使后续 `spechub-coding` 的 COMPREHEND 阶段从"全量代码探索"变为"查表比对"，
> 每次需求节省 8-20 min + 13-35K token。

**入口点定义** = 外部世界触发本项目执行的起点：

| 类型          | 触发源       | 技术载体                                 | 识别方式                             |
| ------------- | ------------ | ---------------------------------------- | ------------------------------------ |
| SOA 接口      | 外部服务调用 | `@SoaService` 实现类的 public 方法     | Grep `@SoaService` / 继承 SOA 基类 |
| QMQ Consumer  | 消息到达     | `@QmqConsumer` 标注的方法              | Grep `@QmqConsumer`                |
| QSchedule Job | 定时触发     | 实现 `IScheduleTask` 或 `@QSchedule` | Grep 相关接口/注解                   |
| HTTP Endpoint | HTTP 请求    | `@Controller`/`@RestController`      | Grep 相关注解                        |

**执行步骤**：

```
对每种入口类型:
  1. Grep 关键注解/基类 → 定位所有入口类
  2. 对每个入口类:
     - 提取 public 方法名
     - 从方法名 + 类名 + 注释(如有) 推断一句话功能描述
     - 记录文件路径
  3. 识别核心 Service 层（被多个入口调用的业务编排类）:
     - 从入口类的依赖注入字段 → 找到 Service 类
     - 提取核心方法名 + 功能描述
```

**产出格式**（写入 project-profile.md §入口点索引）：

```markdown
## 入口点索引

> 项目所有对外交互入口及核心 Service。用于快速定位"需求功能声明"对应的代码位置。
> 自动生成于 {date}，`ace:init --refresh` 更新。

### SOA 接口（Provider）

| # | 操作名 | 类.方法 | 功能描述 | 文件路径 |
|---|--------|---------|---------|---------|
| 1 | GetMemberGrade | MemberGradeServiceImpl.getMemberGrade() | 查询会员当前等级 | module/src/.../soa/impl/MemberGradeServiceImpl.java |

### QMQ Consumer（消息消费）

| # | Topic | 类.方法 | 功能描述 | 文件路径 |
|---|-------|---------|---------|---------|
| 1 | member.order.completed | OrderPointsListener.onMessage() | 订单完成后累积积分 | .../listener/OrderPointsListener.java |

### QSchedule Job（定时任务）

| # | 任务名 | 类 | 功能描述 | 调度周期 | 文件路径 |
|---|--------|-----|---------|---------|---------|
| 1 | membershipExpirationJob | MembershipExpirationJob | 每日扫描过期会员执行降级 | 每日 2:00 | .../job/MembershipExpirationJob.java |

### 核心 Service（内部编排层）

| # | 类名 | 核心职责 | 关键方法 | 文件路径 |
|---|------|---------|---------|---------|
| 1 | GradeChangeService | 等级变更编排 | handleGradeChange(), calculateNewGrade() | .../service/GradeChangeService.java |
```

**粒度规则**：

- ✅ 入口点（公开交互面）+ 核心 Service（业务编排层）
- ✅ 一句话功能描述（用于语义匹配）
- ✅ 文件路径（精确定位）
- ❌ 不含方法签名参数类型（IMPLEMENT 阶段按需 Read）
- ❌ 不含实现细节/算法
- ❌ 不含 private 方法

**增量维护**：

- `ace:init --refresh` 时全量重建
- `spechub-coding` ARCHIVE 阶段如新增入口点 → 自动追加

#### 2.8 系统定位推断

```
→ 读 README.md（如有）
→ 读 pom.xml <description>
→ 从 SOA endpoint 名 + Entity 名 + package 根名推断业务领域
→ 生成一句话定位（标注为"推断，待确认"）
```

### Phase 3: 用户确认

展示推断结果摘要，通过 AskUserQuestion 确认：

- "系统定位推断是否准确？"
- "是否有遗漏的中间件或特殊用法？"
- "编码约定中是否有需要补充的硬性规则？"

用户确认后进入 Phase 4。

### Phase 4: 生成落地

1. 组装 `.claude/project-profile.md` 内容
2. 写入文件
3. 检查 CLAUDE.md 是否已有 `@.claude/project-profile.md` 引入
   - 没有 → 追加引入行
   - 已有 → 跳过
4. 输出完成摘要

---

## 增量更新模式（--refresh）

当画像已存在时：

1. 重新执行 Phase 2 全部步骤
2. 对比已有画像 vs 新推断结果
3. 只展示**差异部分**让用户确认
4. 合并更新（保留 [manual] 标注的人工段落不覆盖）

---

## 漂移检测（被动触发）

其他 skill 在执行编码任务前可以做 lightweight 检测：

```
→ pom.xml 是否有新的中间件依赖（对比画像中的中间件列表）
→ src/main/java 是否有新的顶层 package（对比画像中的分层）
```

如果检测到漂移 → 提示用户：`"项目画像可能需要更新（检测到新依赖 xxx），建议运行 /ace:init --refresh"`

这个检测逻辑不在本 skill 中实现，而是作为建议提供给其他 skill 参考。

---


## 不做的事（反模式）

| 反模式                  | 为什么不做                        |
| ----------------------- | --------------------------------- |
| 列出所有类和方法        | 高频变化、grep 可得、浪费 token   |
| 写入业务逻辑细节        | 变化快、应由 spec/PRD 提供        |
| 生成代码骨架模板        | Framework MCP + grep 已有代码即可 |
| 替代 CLAUDE.md 其他内容 | 画像只是其中一个 section          |
| 自动推断业务规则        | 代码中看不出"为什么"，需人工      |
