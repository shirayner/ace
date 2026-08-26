# Java 审查实战判据

> Java / Spring / MyBatis 项目加载。
>
> **每条判据都配「不报告条件」** —— 这是本文档与普通清单的根本区别。
> 判据来源：alibaba/open-code-review 内置规则集（实战降噪判据）+ 《阿里巴巴 Java 开发手册》常用规约。
>
> 使用方式：不是逐条扫描，而是在 `falsification.md` 的证伪流程中作为**判定依据**和**排除依据**查阅。

---

## 一、空值与 NPE

### 应报告
- 链式调用中存在可能为 null 的中断点（`a.getB().getC()`），且 B 的数据源确实可能返回 null
- 自动拆箱 NPE：`Integer` / `Long` / `Boolean` 参与算术或条件判断（`if (integerFlag)`、`int x = map.get(k)`）
- `Optional.get()` / `orElseThrow()` 无前置 `isPresent` 判断且无法证明必然有值
- 方法可能返回 null 但调用方未判空，且返回 null 的语义未在签名/注释体现
- `Map.get()` 结果直接使用（key 不存在返回 null）
- 三元表达式两分支类型不一致导致的隐式拆箱：`flag ? 1 : nullableInteger`

### 不报告
- 上游已有 `@NotNull` / `@Valid` / `Objects.requireNonNull` 校验，且校验确实在该路径上生效
- 数据来自 DB 非空约束字段，或框架保证非空（如 Spring 注入的单例）
- 已用 `Optional` 链式安全导航（`map`/`flatMap`/`orElse`）
- 局部变量在声明处即赋非空常量，且中间无重新赋值

### 规约要点
- 返回集合时返回空集合（`Collections.emptyList()`）而非 null
- `Optional` 用作返回类型，**不要**用作字段或方法参数
- 判空用 `Objects.isNull` / `StringUtils.isBlank`，不要手写多重判断

---

## 二、并发与线程安全

> **完整的应报/不应报判据见 `../falsification.md` 的「并发证伪」节。** 此处仅列 Java 特有形态。

### Java 特有的应报形态
- `SimpleDateFormat` / `Calendar` 作为静态或实例字段被多线程共享 → 改用 `DateTimeFormatter`
- DCL 单例的 `instance` 字段缺 `volatile`（指令重排导致其他线程看到半构造对象）
- `HashMap` / `ArrayList` 在并发环境被写入（HashMap 并发扩容可能死循环或丢数据）
- Spring 单例 Bean 持有可变实例字段（`@Service` 里的 `private List<X> buffer`）
- `@Async` / 线程池任务捕获了外部可变状态
- `ThreadLocal` 未在 finally 中 `remove()` → 线程池场景下的数据串用与内存泄漏
- 线程池用 `Executors.newFixedThreadPool` 等（无界队列 → OOM）；规约要求手动 `new ThreadPoolExecutor` 并指定拒绝策略
- 复合操作用了 `ConcurrentHashMap` 但仍非原子（`if (!map.containsKey(k)) map.put(k, v)` → 应用 `putIfAbsent` / `computeIfAbsent`）

### 不报告
- 见 `falsification.md` 六条排除项（局部变量 / 单线程上下文 / 只读 / 不可变 / 已同步 / 设计为单线程）
- `ConcurrentHashMap`、`CopyOnWriteArrayList`、`AtomicXxx` 的**单一操作**
- 请求作用域对象（Controller 方法内 new 的对象、`@RequestScope` Bean）

---

## 三、集合

### 应报告
- 遍历中直接 `remove`/`add`（应用 `Iterator.remove()` 或 `removeIf`）→ ConcurrentModificationException
- `Arrays.asList()` 的返回值执行 `add`/`remove` → UnsupportedOperationException
- `List.subList()` 的结果被长期持有（视图，原列表结构变更后失效）
- `Map` 遍历用 `keySet()` 后逐个 `get()`（应用 `entrySet()`）
- 作为 `HashMap` key / `HashSet` 元素的类未正确重写 `equals` + `hashCode`
- 可变对象作为 key，放入后被修改 → 再也取不出来
- 大集合的 `contains` 用 `List`（O(n)）而应用 `Set`

### 不报告
- 集合规模明确很小（如固定 3-5 个枚举值）的 O(n) 查找
- 短生命周期的 `subList`（同一方法内立即消费完）

---

## 四、equals / 比较 / 数值

### 应报告
- 包装类型用 `==` 比较（`Integer a == Integer b`，超出 -128~127 缓存范围时为 false）
- `equals` 的调用方可能为 null（应用 `Objects.equals(a, b)` 或常量在前）
- 浮点数用 `==` 比较，或用 `float`/`double` 表示金额（应用 `BigDecimal`）
- `BigDecimal` 用 `equals` 比较（`1.0` 与 `1.00` 不等，应用 `compareTo`）
- `BigDecimal` 用 `double` 构造（`new BigDecimal(0.1)` 精度丢失，应用 `valueOf` 或 String 构造）
- 整数运算溢出：`int` 乘法后赋给 `long`（应先转型）；时间计算 `24*60*60*1000` 用 int
- 整数除法被当作浮点（`1/2 == 0`）

### 不报告
- `int`/`long` 等基本类型用 `==`
- 明确的枚举/常量引用比较（枚举用 `==` 是推荐做法）
- 非金额、非精度敏感场景的浮点运算

---

## 五、异常处理

### 应报告
- 空 catch 块，或只 `e.printStackTrace()` 而不处理不上抛
- catch 后仅 `log.error("error")` 却丢失异常对象（无堆栈，线上无法定位）
- 捕获 `Exception` / `Throwable` 过于宽泛，把本应暴露的编程错误吞掉
- `finally` 中 return 或抛异常 → 覆盖 try 中的原始异常/返回值
- 用异常控制正常业务流程（性能与可读性双损）
- 事务方法内 catch 了异常但未 `rollbackFor` 或未重新抛出 → **事务静默不回滚**（高频真 bug）
- 资源未用 try-with-resources（流、连接、锁）
- 自定义异常丢失 cause（`throw new BizException(msg)` 而非 `(msg, e)`）

### 不报告
- 有明确注释说明的有意吞异常（如清理逻辑的 best-effort）
- 框架要求的空实现
- catch 后转换为业务异常并携带 cause 上抛

---

## 六、Spring

### 应报告
- `@Transactional` 标注在 private / final 方法，或**同类内部调用**自身的事务方法 → **代理失效，事务完全不生效**
- `@Transactional` 未指定 `rollbackFor`，而方法内抛的是受检异常 → 默认不回滚
- 事务方法内含 RPC / HTTP / MQ 发送 → 长事务 + 外部副作用无法回滚
- 循环依赖靠 `@Lazy` 掩盖（暴露的是设计问题）
- `@Value` 注入到静态字段（不生效）
- 单例 Bean 注入 prototype Bean 后长期持有（作用域失效）
- `@PostConstruct` 中做耗时/可失败的外部调用（启动失败难排查）
- Controller 直接接收/返回实体（DO/Entity）→ 应用 DTO/VO 隔离
- 参数未校验（缺 `@Valid`）却直接信任

### 不报告
- 通过接口/代理调用的事务方法（正常生效）
- 有意的 `@Transactional(propagation = REQUIRES_NEW)` 设计

---

## 七、MyBatis / DAO / SQL

> 直接吸收 alibaba `mapper_dao_xml.md` 判据。

### 应报告 — 安全
- 用 `${}` 拼接**用户输入**参数 → SQL 注入
- LIKE 查询直接字符串拼接而非参数绑定

### 应报告 — 性能
- **循环内执行数据库查询**（用 Grep 确认被调方法是否含 DB 操作）
- **N+1 查询**（查列表后逐条查关联）→ 建议批量查询
- 处理大数据集**无分页**（无 LIMIT）
- WHERE 条件缺失 → 全表扫描风险
- 同一子查询在多处重复

### 应报告 — 逻辑
- WHERE 中 AND/OR 混用未加括号 → 优先级错误
- JOIN 条件字段错误或缺失必要连接条件
- `<if test="">` 判断错误：字符串判空只判了 `!= null` 未判 `!= ''`；数字类型用了字符串判断
- `<foreach>` 集合为空时生成非法 SQL（`IN ()`）

### 不报告
- 正确使用 `#{}` 参数绑定（MyBatis 自动转义）
- 静态 SQL（不含动态参数）
- `${}` 用于**非用户输入**的表名/列名，且来源可控（需确认来源后判断）

---

## 八、性能

### 应报告
- 循环内字符串用 `+` 拼接（应用 `StringBuilder`）
- 循环内创建重量级对象（`SimpleDateFormat`、`ObjectMapper`、正则 `Pattern.compile`）
- 嵌套循环导致 O(n²) 而存在更优解
- 一次性加载全量数据到内存（无分页/流式）
- 日志参数在未启用级别时仍被计算（`log.debug("x" + heavyToString())` → 应用占位符 `{}`）
- 正则表达式每次调用重新编译

### 不报告
- 数据规模明确很小的循环
- 启动期一次性执行的逻辑
- 可读性明显优于微优化收益的写法（元原则：可读性 > 性能）

---

## 九、命名与规约（P3 级，合并同类报告）

> 《阿里巴巴 Java 开发手册》要点。这些是 P3 Nit，**合并成一条报告，不要逐个刷条目**。

- 类名 UpperCamelCase；方法/变量 lowerCamelCase；常量全大写下划线分隔
- 抽象类 `Abstract`/`Base` 前缀；异常类 `Exception` 结尾；测试类 `Test` 结尾
- 布尔字段**不加** `is` 前缀（POJO 中 `isDeleted` 会导致部分序列化框架解析异常）→ 用 `deleted`
- 不使用拼音与英文混合命名；不使用非通用缩写（`usrCnt` → `userCount`）
- 常量禁止魔法值（未经定义的数字/字符串直接出现在代码中）
- 包名统一小写单数形式
- 枚举成员名全大写

### 不报告
- 项目内已有一致的既存风格（一致性 > 教条）
- 领域通用缩写（`id`、`url`、`dto`、`sql`）
- 测试代码中的临时变量名

---

## 十、日志与可观测性

### 应报告
- 关键业务分支无日志（线上无法定位）
- 日志打印敏感信息（密码、身份证、手机号、token、完整卡号）
- 用 `System.out.println` 代替日志框架
- 异常日志无堆栈或无业务上下文（缺关键 ID）
- 循环内高频打印 info 级日志

### 不报告
- getter/setter、简单转换方法无日志
- 已用脱敏工具处理的敏感字段

---

## 判据使用纪律

1. **先证伪，后查表** — 本文档是判定依据，不是扫描清单。从 `falsification.md` 的构造性问题出发，命中疑点后来这里核对「是否应报」和「是否落入排除项」。
2. **排除条件优先** — 命中「不报告」条件时，**不报告**，即使它也命中了「应报告」。
3. **上下文不足则查** — 「用 Grep 确认调用上下文」不是可选步骤。查不到 → 沉默。
4. **P3 合并** — 命名/规约类问题合并为一条，附位置列表。禁止刷条目数。
