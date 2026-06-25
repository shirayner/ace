# Auto-Scan Rules

当用户选择"自动扫描全仓库"时使用这些规则。

## 1. 项目类型推断

按优先级检查:
1. 存在 `pom.xml` 或 `build.gradle` → `type: backend`
2. 存在 `package.json` 且 dependencies 含 `react`/`vue`/`next`/`nuxt` → `type: frontend`
3. 同时满足 1 和 2 → `type: hybrid`

## 2. 后端锚点扫描

### API
查找优先级(命中任一即算):
```bash
# SOA 实现类(implements I*Service)
grep -rl "implements I\w*Service" --include="*.java"

# Application 后缀
find . -name "*Application.java" -not -path "*/test/*"

# REST Controller
grep -rl "@RestController\|@Controller" --include="*.java"
```

### MQ
```bash
# QMQ Consumer
grep -rl "@QmqConsumer" --include="*.java"

# Kafka Listener
grep -rl "@KafkaListener" --include="*.java"

# 包名含 listener/consumer
find . -path "*/listener/*.java" -o -path "*/consumer/*.java" | grep -v test
```

### Job
```bash
# QSchedule
grep -rl "@QSchedule" --include="*.java"

# Spring Scheduled
grep -rl "@Scheduled" --include="*.java"

# 类名后缀
find . -name "*Job.java" -o -name "*Task.java" -o -name "*Schedule.java" | grep -v test
```

## 3. 前端锚点扫描

### Page
```bash
# React Router / Vue Router 路由配置文件
find src/ -name "router.*" -o -name "routes.*"

# Next.js pages 目录
find src/pages/ -name "*.tsx" -o -name "*.jsx"

# 后缀约定
find src/ -name "*Page.tsx" -o -name "*Page.vue" | grep -v node_modules
```

### Component
仅包含**跨页面复用的业务组件**(非通用 UI):
```bash
# 业务组件目录(通常与 UI 组件分离)
find src/components/ -name "*.tsx" -o -name "*.vue" | grep -v node_modules

# 筛选:组件内调用了后端 API 或引用了业务 hook
# (人工或 LLM 二次判定,不机械筛选)
```

## 4. 扫描结果过滤

排除:
- `*/test/*` `*/tests/*` `*Test.java` `*Tests.java`
- `*Mapper.java`(MyBatis Mapper,数据访问层非锚点)
- `*RepositoryImpl.java`(实现类非锚点)
- `src/components/ui/` `src/components/common/`(通用 UI 组件)

## 5. 结果格式

扫描完成后产出精确列表:

```yaml
anchors:
  api:
    - FlightFillPageComponentApplication
    - QueryMemberRightsV35Application
  mq:
    - GradeChangeListener
  job:
    - CoinsExpireJob
```

写入 _meta.yml 的 anchors 段,覆盖原有内容。
