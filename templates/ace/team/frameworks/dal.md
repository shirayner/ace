
# Dal 使用规范

## 概述

Dal（Data Access Layer）是携程统一的数据库访问框架，为应用提供了标准化的数据库访问能力。本规范基于会员等级计算项目的实践经验，结合Dal官方文档，为团队提供统一的Dal使用标准。

## 技术栈版本

### 核心依赖版本
```xml
<properties>
    <framework-bom.version>8.34.3</framework-bom.version>
    <dal-client.version>2.4.8+</dal-client.version>
</properties>

<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>com.ctrip.framework</groupId>
            <artifactId>framework-bom</artifactId>
            <version>${framework-bom.version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <dependency>
        <groupId>com.ctrip.platform</groupId>
        <artifactId>ctrip-dal-client</artifactId>
    </dependency>
</dependencies>
```

### 版本兼容性要求
- **Framework BOM版本**: 8.34.0及以上
- **Dal Client版本**: 2.4.8及以上
- **Java版本**: Java 21
- **Spring Boot版本**: 2.7.18及以上

## DDD分层架构中的Dal使用

### 架构原则
```
┌─────────────────────────────────────┐
│           Service Layer             │  ← 禁止直接使用Dal
├─────────────────────────────────────┤
│        Application Layer            │  ← 禁止直接使用Dal
├─────────────────────────────────────┤
│          Domain Layer              │  ← 可使用@DalTransactional
├─────────────────────────────────────┤
│        Repository Layer            │  ← Dal主要使用层
├─────────────────────────────────────┤
│           Data Layer               │  ← Dal核心实现层
└─────────────────────────────────────┘
```

### 分层职责规范

#### Data Layer（数据层）
**职责**: 定义POJO、DAO接口和数据库配置
**位置**: `{project}-data`模块
**允许使用的Dal组件**:
- POJO类：`@Entity`、`@Database`、`@Table`、`@Column`等JPA注解
- DAO类：继承`BaseDao`或使用`DalTableOperations`
- 配置类：`DalConfig`相关配置

```java
// 正确示例：POJO定义
@Entity
@Database(name = DalConfig.DATA_BASE_NAME)
@Table(name = "user_member_grade")
public class UserMemberGradePojo implements DalPojo {
    
    @Id
    @Column(name = "id")
    @GeneratedValue(strategy = GenerationType.AUTO)
    @Type(value = Types.BIGINT)
    private Long id;
    
    @Column(name = "uid")
    @Type(value = Types.VARCHAR)
    private String uid;
    
    // getter/setter...
}
```

#### Repository Layer（仓储层）
**职责**: 实现Repository接口，提供领域对象持久化
**位置**: `{project}-repository`模块
**允许使用的Dal组件**:
- 事务注解：`@DalTransactional`
- 异常处理：Dal相关异常类型
- Mapper：POJO与领域对象转换

```java
// 正确示例：Repository实现
@Component
public class MemberGradeRepositoryImpl implements MemberGradeRepository {
    
    @Autowired
    private UserMemberGradeDao memberGradeDao;
    
    @DalTransactional(logicDbName = DalConfig.DATA_BASE_NAME)
    @Override
    public IBUErrorCode updateGrade(UpgradeContext context) {
        try {
            // 数据库操作
            int result = memberGradeDao.updateGradeByIdAndChangeTime(...);
            return result > 0 ? IBUCommonErrorCode.SUCCESS : ErrorCode.ROW_HAS_BEEN_MODIFIED;
        } catch (SQLException ex) {
            throw new NeedRetryMySQLException("updateGrade", ex);
        }
    }
}
```

#### Domain Layer（领域层）
**职责**: 领域服务中可使用事务注解
**位置**: `{project}-domain`模块
**允许使用的Dal组件**:
- 事务注解：`@DalTransactional`（仅限领域服务）

```java
// 正确示例：领域服务使用事务
@Component
public class GradeServiceV2 {
    
    @DalTransactional(logicDbName = DalConfig.DATA_BASE_NAME)
    public void processGradeChange(String uid, String ruleId) {
        // 领域业务逻辑
    }
}
```

## POJO规范

### 基础规范

#### 【强制】POJO类必须实现DalPojo接口
```java
@Entity
@Database(name = DalConfig.DATA_BASE_NAME)
@Table(name = "table_name")
public class ExamplePojo implements DalPojo {
    // 实现内容
}
```

#### 【强制】必须使用@Database注解指定逻辑库名
```java
// 正确：使用配置常量
@Database(name = DalConfig.DATA_BASE_NAME)

// 错误：硬编码库名
@Database(name = "some_database")
```

#### 【强制】主键字段规范
```java
@Id
@Column(name = "id")
@GeneratedValue(strategy = GenerationType.AUTO)
@Type(value = Types.BIGINT)
private Long id;
```

#### 【强制】普通字段规范
```java
// 字符串字段
@Column(name = "uid")
@Type(value = Types.VARCHAR)
private String uid;

// 数字字段
@Column(name = "grade")
@Type(value = Types.TINYINT)
private Integer grade;

// 日期字段
@Column(name = "create_time")
@Type(value = Types.TIMESTAMP)
private Timestamp createTime;

// 日期字段（Date类型）
@Column(name = "expiration_date")
@Type(value = Types.DATE)
private Date expirationDate;
```

#### 【推荐】敏感字段处理
```java
// 对于包含敏感信息的字段，添加注释说明
@Column(name = "uid")
@Type(value = Types.VARCHAR)
private String uid; // 敏感字段：用户标识
```

#### 【推荐】字段命名规范
- 数据库字段使用下划线命名：`user_name`
- Java字段使用驼峰命名：`userName`
- `@Column`注解的name属性必须与数据库字段名完全一致

### UDL支持规范

#### 【强制】UDL注解使用
```java
// 当数据库UDL列为userdata_location时
@Entity
@Database(name = DalConfig.DATA_BASE_NAME)
@Table(name = "table_name")
@UDL
public class ExamplePojo implements DalPojo {
    // 不需要声明UDL字段
}

// 当数据库UDL列为其他名称时
@Entity
@Database(name = DalConfig.DATA_BASE_NAME)
@Table(name = "table_name")
@UDL("user_location")
public class ExamplePojo implements DalPojo {
    // 不需要声明UDL字段
}
```

### 序列化规范

#### 【推荐】实现序列化接口
```java
public class ExamplePojo implements DalPojo, Serializable {
    private static final long serialVersionUID = 1L;
    // 字段定义
}
```

## DAO实现规范

### 基础架构

#### 【强制】DAO类必须继承BaseDao
```java
@Component
public class UserMemberGradeDao extends BaseDao<UserMemberGradePojo> {
    // DAO实现
}
```

#### 【推荐】使用新版BaseDao
```java
// 推荐：使用新版BaseDao（支持DalTableOperations API）
public class ExampleDao extends BaseDao<ExamplePojo> {
    // 使用DAL_TABLE_OPERATIONS进行操作
}

// 不推荐：使用OldBaseDao
public class ExampleDao extends OldBaseDao<ExamplePojo> {
    // 旧版API
}
```

### 查询操作规范

#### 【强制】基础查询方法
```java
// 根据主键查询
public ExamplePojo findById(long id) throws SQLException {
    return DAL_TABLE_OPERATIONS.queryByPk(id, new DalHints());
}

// 根据条件查询单条记录
public ExamplePojo findByUid(String uid) throws SQLException {
    DalHints hints = DalHints.createIfAbsent(null);
    
    String sql = "select * from table_name where uid = ?";
    StatementParameters parameters = new StatementParameters();
    parameters.setSensitive(1, "uid", Types.VARCHAR, uid);
    
    return queryDao.query(sql, parameters, hints, ExamplePojo.class);
}

// 根据条件查询列表
public List<ExamplePojo> findByCondition(String condition) throws SQLException {
    DalHints hints = new DalHints();
    
    String sql = "select * from table_name where condition = ?";
    StatementParameters parameters = new StatementParameters();
    parameters.setSensitive(1, "condition", Types.VARCHAR, condition);
    
    return queryDao.query(sql, parameters, hints, ExamplePojo.class);
}
```

#### 【强制】分页查询规范
```java
// 基于ID分页查询
public List<ExamplePojo> findByStartId(long startId, int limit) throws SQLException {
    DalHints hints = new DalHints();
    
    String sql = "select * from table_name where id > ? order by id limit ?";
    StatementParameters parameters = new StatementParameters();
    parameters.setSensitive(1, "startId", Types.BIGINT, startId);
    parameters.setSensitive(2, "limit", Types.INTEGER, limit);
    
    return queryDao.query(sql, parameters, hints, ExamplePojo.class);
}

// 基于ID范围查询
public List<ExamplePojo> findByIdRange(long startId, long endId, int limit) throws SQLException {
    DalHints hints = new DalHints();
    
    String sql = "select * from table_name where id > ? and id <= ? order by id limit ?";
    StatementParameters parameters = new StatementParameters();
    parameters.setSensitive(1, "startId", Types.BIGINT, startId);
    parameters.setSensitive(2, "endId", Types.BIGINT, endId);
    parameters.setSensitive(3, "limit", Types.INTEGER, limit);
    
    return queryDao.query(sql, parameters, hints, ExamplePojo.class);
}
```

#### 【推荐】IN查询规范
```java
public List<ExamplePojo> findByIds(List<Long> ids) throws SQLException {
    if (CollectionUtility.isNullOrEmpty(ids)) {
        return Collections.emptyList();
    }
    
    DalHints hints = new DalHints();
    
    String sql = "select * from table_name where id in (?)";
    StatementParameters parameters = new StatementParameters();
    parameters.setInParameter(1, "ids", Types.BIGINT, ids);
    
    return queryDao.query(sql, parameters, hints, ExamplePojo.class);
}
```

### 更新操作规范

#### 【强制】插入操作
```java
public int insert(ExamplePojo pojo) throws SQLException {
    DalHints hints = new DalHints();
    return DAL_TABLE_OPERATIONS.insert(hints, pojo);
}

// 批量插入
public int batchInsert(List<ExamplePojo> pojos) throws SQLException {
    if (CollectionUtility.isNullOrEmpty(pojos)) {
        return 0;
    }
    
    DalHints hints = new DalHints();
    return DAL_TABLE_OPERATIONS.batchInsert(hints, pojos);
}
```

#### 【强制】更新操作
```java
public int update(ExamplePojo pojo) throws SQLException {
    DalHints hints = new DalHints();
    return DAL_TABLE_OPERATIONS.update(hints, pojo);
}

// 条件更新
public int updateByCondition(String condition, Object value) throws SQLException {
    DalHints hints = new DalHints();
    
    String sql = "update table_name set field = ? where condition = ?";
    StatementParameters parameters = new StatementParameters();
    parameters.setSensitive(1, "field", Types.VARCHAR, value);
    parameters.setSensitive(2, "condition", Types.VARCHAR, condition);
    
    return queryDao.update(sql, parameters, hints);
}
```

#### 【强制】删除操作
```java
public int delete(ExamplePojo pojo) throws SQLException {
    DalHints hints = new DalHints();
    return DAL_TABLE_OPERATIONS.delete(hints, pojo);
}

public int deleteById(long id) throws SQLException {
    DalHints hints = new DalHints();
    return DAL_TABLE_OPERATIONS.deleteByPk(hints, id);
}
```

### SQL参数绑定规范

#### 【强制】使用setSensitive方法绑定敏感参数
```java
// 正确：绑定敏感参数（如uid等用户相关信息）
parameters.setSensitive(1, "uid", Types.VARCHAR, uid);
parameters.setSensitive(2, "userId", Types.BIGINT, userId);

// 正确：绑定普通参数
parameters.set(1, "status", Types.INTEGER, status);
```

#### 【强制】参数类型映射规范
```java
// 常用类型映射
parameters.setSensitive(i++, "stringField", Types.VARCHAR, stringValue);
parameters.setSensitive(i++, "intField", Types.INTEGER, intValue);
parameters.setSensitive(i++, "longField", Types.BIGINT, longValue);
parameters.setSensitive(i++, "tinyintField", Types.TINYINT, tinyintValue);
parameters.setSensitive(i++, "timestampField", Types.TIMESTAMP, timestampValue);
parameters.setSensitive(i++, "dateField", Types.DATE, dateValue);
```

### 异常处理规范

#### 【强制】SQLException处理
```java
public ExamplePojo findByUid(String uid) {
    try {
        return memberGradeDao.findByUid(uid);
    } catch (SQLException ex) {
        throw new NeedRetryMySQLException("findByUid", ex);
    }
}
```

## Repository层规范

### 基础架构

#### 【强制】Repository实现类规范
```java
@Component
public class ExampleRepositoryImpl implements ExampleRepository {
    
    @Autowired
    private ExampleDao exampleDao;
    
    @Autowired
    private ExampleMapper exampleMapper;
    
    // Repository方法实现
}
```

### 事务管理规范

#### 【强制】事务注解使用
```java
@DalTransactional(logicDbName = DalConfig.DATA_BASE_NAME)
@Override
public IBUErrorCode updateWithTransaction(UpdateContext context) {
    try {
        // 数据库操作
        int result = exampleDao.update(pojo);
        if (result < 1) {
            return ErrorCode.UPDATE_FAILED;
        }
        
        // 其他相关操作
        relatedDao.insert(relatedPojo);
        
        return IBUCommonErrorCode.SUCCESS;
    } catch (SQLException ex) {
        throw new NeedRetryMySQLException("updateWithTransaction", ex);
    }
}
```

#### 【推荐】事务方法设计原则
- 事务方法应该尽可能短小
- 避免在事务中进行外部服务调用
- 合理控制事务的粒度和范围
- 事务失败时返回明确的错误码

### 数据转换规范

#### 【强制】使用Mapper进行对象转换
```java
// Repository层不直接返回POJO，必须转换为领域对象
@Override
public Optional<ExampleDomain> findByUid(String uid) {
    try {
        ExamplePojo pojo = exampleDao.findByUid(uid);
        return pojo != null ? 
            Optional.of(ExampleMapper.toDomain(pojo)) : 
            Optional.empty();
    } catch (SQLException ex) {
        throw new NeedRetryMySQLException("findByUid", ex);
    }
}

// 保存时将领域对象转换为POJO
@Override
public void save(ExampleDomain domain) {
    try {
        ExamplePojo pojo = ExampleMapper.toPojo(domain);
        if (domain.isNewRecord()) {
            exampleDao.insert(pojo);
        } else {
            exampleDao.update(pojo);
        }
    } catch (SQLException ex) {
        throw new NeedRetryMySQLException("save", ex);
    }
}
```

## 配置管理规范

### 数据库配置

#### 【强制】统一配置管理
```java
// DalConfig.java
public class DalConfig {
    /**
     * 主数据库逻辑库名
     */
    public static final String DATA_BASE_NAME = "ibu_member_grade_compute_db";
    
    /**
     * 只读数据库逻辑库名（如有需要）
     */
    public static final String READ_ONLY_DATA_BASE_NAME = "ibu_member_grade_compute_read_db";
}
```

#### 【强制】配置文件规范
```properties
# dal.config文件示例
dal.db.ibu_member_grade_compute_db=ibu_member_grade_compute_db

# 连接池配置
dal.pool.ibu_member_grade_compute_db.maxActive=20
dal.pool.ibu_member_grade_compute_db.maxIdle=10
dal.pool.ibu_member_grade_compute_db.minIdle=5
dal.pool.ibu_member_grade_compute_db.maxWait=5000
```

### 环境配置规范

#### 【推荐】环境特定配置
```java
// 不同环境使用不同的配置
@Configuration
public class DataSourceConfig {
    
    @Value("${dal.database.name:ibu_member_grade_compute_db}")
    private String databaseName;
    
    // 配置Bean定义
}
```

## 异常处理规范

### 异常类型定义

#### 【强制】Dal异常封装
```java
// 需要重试的MySQL异常
public class NeedRetryMySQLException extends RuntimeException {
    
    private final String operation;
    
    public NeedRetryMySQLException(String operation, SQLException cause) {
        super("MySQL operation failed: " + operation, cause);
        this.operation = operation;
    }
    
    public String getOperation() {
        return operation;
    }
}
```

#### 【强制】异常处理模式
```java
// Repository层统一异常处理
public Optional<ExampleDomain> findByUid(String uid) {
    try {
        ExamplePojo pojo = exampleDao.findByUid(uid);
        return pojo != null ? Optional.of(ExampleMapper.toDomain(pojo)) : Optional.empty();
    } catch (SQLException ex) {
        // 记录日志
        logger.error("Failed to find record by uid: {}", uid, ex);
        // 抛出业务异常
        throw new NeedRetryMySQLException("findByUid", ex);
    }
}
```

### 错误码规范

#### 【推荐】数据库操作错误码
```java
public enum DatabaseErrorCode implements IBUErrorCode {
    ROW_HAS_BEEN_MODIFIED("ROW_HAS_BEEN_MODIFIED", "数据已被修改"),
    RECORD_NOT_FOUND("RECORD_NOT_FOUND", "记录不存在"),
    DUPLICATE_KEY("DUPLICATE_KEY", "主键冲突"),
    DATABASE_CONNECTION_FAILED("DATABASE_CONNECTION_FAILED", "数据库连接失败");
    
    private final String code;
    private final String message;
    
    DatabaseErrorCode(String code, String message) {
        this.code = code;
        this.message = message;
    }
    
    @Override
    public String getCode() {
        return code;
    }
    
    @Override
    public String getMessage() {
        return message;
    }
}
```

## 监控日志规范

### 日志记录规范

#### 【强制】关键操作日志
```java
@Override
public IBUErrorCode updateGrade(UpgradeContext context) {
    logger.info("start update grade, uid: {}, ruleId: {}", context.getUid(), context.getRuleId());
    
    try {
        int result = memberGradeDao.updateGradeByIdAndChangeTime(...);
        
        if (result > 0) {
            logger.info("update grade success, uid: {}, result: {}", context.getUid(), result);
            return IBUCommonErrorCode.SUCCESS;
        } else {
            logger.warn("update grade failed, row has been modified, uid: {}", context.getUid());
            return ErrorCode.ROW_HAS_BEEN_MODIFIED;
        }
    } catch (SQLException ex) {
        logger.error("update grade exception, uid: {}", context.getUid(), ex);
        throw new NeedRetryMySQLException("updateGrade", ex);
    }
}
```

#### 【推荐】性能监控日志
```java
public List<ExampleDomain> batchQuery(List<String> uids) {
    long startTime = System.currentTimeMillis();
    
    try {
        List<ExamplePojo> pojos = exampleDao.findByUids(uids);
        List<ExampleDomain> domains = pojos.stream()
            .map(ExampleMapper::toDomain)
            .collect(Collectors.toList());
            
        long duration = System.currentTimeMillis() - startTime;
        logger.info("batch query completed, count: {}, duration: {}ms", uids.size(), duration);
        
        return domains;
    } catch (SQLException ex) {
        long duration = System.currentTimeMillis() - startTime;
        logger.error("batch query failed, count: {}, duration: {}ms", uids.size(), duration, ex);
        throw new NeedRetryMySQLException("batchQuery", ex);
    }
}
```

### Cat监控集成

#### 【推荐】业务监控埋点
```java
public void processWithMonitoring(String uid, String operation) {
    Transaction transaction = Cat.newTransaction("Database", operation);
    
    try {
        // 数据库操作
        performDatabaseOperation(uid);
        
        // 记录成功
        transaction.setStatus(Transaction.SUCCESS);
        Cat.logEvent("DatabaseOperation", operation + "_SUCCESS", Event.SUCCESS, uid);
        
    } catch (Exception e) {
        // 记录失败
        transaction.setStatus(e);
        Cat.logError(e);
        Cat.logEvent("DatabaseOperation", operation + "_FAILED", "ERROR", uid);
        throw e;
    } finally {
        transaction.complete();
    }
}
```

## 性能优化指南

### 查询优化

#### 【强制】避免N+1查询问题
```java
// 错误：N+1查询
public List<ExampleDomain> findWithDetails(List<String> uids) {
    List<ExampleDomain> results = new ArrayList<>();
    for (String uid : uids) {
        ExampleDomain domain = findByUid(uid); // N次查询
        DetailDomain detail = findDetailByUid(uid); // 又N次查询
        domain.setDetail(detail);
        results.add(domain);
    }
    return results;
}

// 正确：批量查询
public List<ExampleDomain> findWithDetails(List<String> uids) {
    List<ExampleDomain> domains = findByUids(uids); // 1次查询
    List<DetailDomain> details = findDetailsByUids(uids); // 1次查询
    
    Map<String, DetailDomain> detailMap = details.stream()
        .collect(Collectors.toMap(DetailDomain::getUid, Function.identity()));
    
    return domains.stream()
        .map(domain -> domain.setDetail(detailMap.get(domain.getUid())))
        .collect(Collectors.toList());
}
```

#### 【推荐】分页查询优化
```java
// 推荐：基于ID的分页（避免OFFSET性能问题）
public List<ExampleDomain> findByPage(long lastId, int pageSize) {
    List<ExamplePojo> pojos = exampleDao.findByStartId(lastId, pageSize);
    return pojos.stream()
        .map(ExampleMapper::toDomain)
        .collect(Collectors.toList());
}
```

### 连接池优化

#### 【推荐】连接池配置
```properties
# 连接池大小根据实际并发量调整
dal.pool.{database}.maxActive=50
dal.pool.{database}.maxIdle=20
dal.pool.{database}.minIdle=10
dal.pool.{database}.maxWait=3000

# 连接验证
dal.pool.{database}.testOnBorrow=true
dal.pool.{database}.testWhileIdle=true
dal.pool.{database}.validationQuery=SELECT 1
```

### 批量操作优化

#### 【推荐】批量插入
```java
public int batchInsert(List<ExampleDomain> domains) {
    if (CollectionUtility.isNullOrEmpty(domains)) {
        return 0;
    }
    
    // 分批处理，避免单次批量过大
    int batchSize = 1000;
    int totalInserted = 0;
    
    for (int i = 0; i < domains.size(); i += batchSize) {
        int end = Math.min(i + batchSize, domains.size());
        List<ExampleDomain> batch = domains.subList(i, end);
        
        List<ExamplePojo> pojos = batch.stream()
            .map(ExampleMapper::toPojo)
            .collect(Collectors.toList());
            
        try {
            totalInserted += exampleDao.batchInsert(pojos);
        } catch (SQLException ex) {
            logger.error("batch insert failed, batch size: {}", batch.size(), ex);
            throw new NeedRetryMySQLException("batchInsert", ex);
        }
    }
    
    return totalInserted;
}
```

## 最佳实践示例

### 完整的Repository实现示例

```java
@Component
public class MemberGradeRepositoryImpl implements MemberGradeRepository {

    private static final Logger logger = LoggerFactory.getLogger(MemberGradeRepositoryImpl.class);

    @Autowired
    private UserMemberGradeDao memberGradeDao;

    @Autowired
    private UserMemberGradeChangeRecordDao gradeChangeRecordDao;

    @Override
    public Optional<MemberGrade> findByUid(String uid) {
        logger.debug("finding member grade by uid: {}", uid);
        
        try {
            UserMemberGradePojo pojo = memberGradeDao.findByUid(uid);
            return pojo != null ? 
                Optional.of(MemberGradeMapper.toDomain(pojo)) : 
                Optional.empty();
        } catch (SQLException ex) {
            logger.error("failed to find member grade by uid: {}", uid, ex);
            throw new NeedRetryMySQLException("findByUid", ex);
        }
    }

    @DalTransactional(logicDbName = DalConfig.DATA_BASE_NAME)
    @Override
    public IBUErrorCode updateGrade(UpgradeContext context) {
        logger.info("updating grade, uid: {}, ruleId: {}", context.getUid(), context.getRuleId());
        
        try {
            // 乐观锁更新
            int gradeUpdateResult = memberGradeDao.updateGradeByIdAndChangeTime(
                context.getMemberGradeId(), 
                context.getAfterGrade(), 
                context.getExpectGrade(), 
                context.getPreGrade(),
                DateTimeUtil.toTimestamp(LocalDateTime.now()),
                DateTimeUtil.toSQLDate(context.getAfterExpirationDate()),
                DateTimeUtil.toSQLDate(context.getPreExpirationDate()),
                DateTimeUtil.toTimestamp(context.getLastChangeTime())
            );
            
            if (gradeUpdateResult < 1) {
                logger.warn("grade update failed, row has been modified, uid: {}", context.getUid());
                return ErrorCode.ROW_HAS_BEEN_MODIFIED;
            }
            
            // 插入变更记录
            gradeChangeRecordDao.insert(buildGradeChangeRecord(context));
            
            // 后置处理
            afterGradeChanged(context);
            
            logger.info("grade update success, uid: {}", context.getUid());
            return IBUCommonErrorCode.SUCCESS;
            
        } catch (SQLException ex) {
            logger.error("grade update exception, uid: {}", context.getUid(), ex);
            throw new NeedRetryMySQLException("updateGrade", ex);
        }
    }

    @Override
    public List<MemberGrade> batchQueryMemberGrade(List<String> uids) {
        if (CollectionUtility.isNullOrEmpty(uids)) {
            return Collections.emptyList();
        }
        
        logger.debug("batch querying member grades, count: {}", uids.size());
        
        try {
            List<UserMemberGradePojo> pojos = memberGradeDao.findByUids(uids);
            return pojos.stream()
                .map(MemberGradeMapper::toDomain)
                .collect(Collectors.toList());
        } catch (SQLException ex) {
            logger.error("batch query member grades failed, count: {}", uids.size(), ex);
            throw new NeedRetryMySQLException("batchQueryMemberGrade", ex);
        }
    }

    private UserMemberGradeChangeRecordPojo buildGradeChangeRecord(UpgradeContext context) {
        UserMemberGradeChangeRecordPojo pojo = new UserMemberGradeChangeRecordPojo();
        pojo.setUid(context.getUid());
        pojo.setRuleId(context.getRuleId());
        pojo.setPreGrade(context.getPreGrade());
        pojo.setAfterGrade(context.getAfterGrade());
        pojo.setPreExpirationDate(DateTimeUtil.toSQLDate(context.getPreExpirationDate()));
        pojo.setAfterExpirationDate(DateTimeUtil.toSQLDate(context.getAfterExpirationDate()));
        return pojo;
    }

    private void afterGradeChanged(UpgradeContext context) {
        // 清理缓存
        CacheManager.afterGradeChangeRetryAble(context.getUid());
        
        // 发送消息
        gradeChangeMessage.send(context);
        
        // 监控埋点
        Monitor.logELK("GradeChanged", context.getUid(), context.getRuleId(), "SUCCESS");
    }
}
```

### 完整的DAO实现示例

```java
@Component
public class UserMemberGradeDao extends BaseDao<UserMemberGradePojo> {

    private static final Logger logger = LoggerFactory.getLogger(UserMemberGradeDao.class);

    public UserMemberGradePojo findByUid(String uid) throws SQLException {
        return findByUid(uid, null);
    }

    public UserMemberGradePojo findByUid(String uid, DalHints hints) throws SQLException {
        hints = DalHints.createIfAbsent(hints);

        String sql = "select * from user_member_grade where uid = ?";
        StatementParameters parameters = new StatementParameters();
        parameters.setSensitive(1, "uid", Types.VARCHAR, uid);

        return queryDao.query(sql, parameters, hints, UserMemberGradePojo.class);
    }

    public List<UserMemberGradePojo> findByUids(List<String> uids) throws SQLException {
        if (CollectionUtility.isNullOrEmpty(uids)) {
            return Collections.emptyList();
        }

        DalHints hints = new DalHints();

        String sql = "select * from user_member_grade where uid in (?)";
        StatementParameters parameters = new StatementParameters();
        parameters.setInParameter(1, "uids", Types.VARCHAR, uids);

        return queryDao.query(sql, parameters, hints, UserMemberGradePojo.class);
    }

    public List<UserMemberGradePojo> findByIdRange(long startId, long endId, int limit) throws SQLException {
        DalHints hints = new DalHints();

        String sql = "select * from user_member_grade where id > ? and id <= ? order by id limit ?";
        StatementParameters parameters = new StatementParameters();
        parameters.setSensitive(1, "startId", Types.BIGINT, startId);
        parameters.setSensitive(2, "endId", Types.BIGINT, endId);
        parameters.setSensitive(3, "limit", Types.INTEGER, limit);

        return queryDao.query(sql, parameters, hints, UserMemberGradePojo.class);
    }

    public int updateGradeByIdAndChangeTime(long id, int grade, int expectGrade, int preGrade,
                                            Timestamp gradeChangeTime, Date expirationDate,
                                            Date preExpirationDate, Timestamp lastTime) throws SQLException {
        DalHints hints = new DalHints();

        String sql = "update user_member_grade " +
                    "set grade = ?, expect_grade = ?, grade_change_time = ?, pre_grade = ?, expiration_date = ? " +
                    "where id = ? and grade = ? and expiration_date = ? and datachange_lasttime = ?";
        
        StatementParameters parameters = new StatementParameters();
        int i = 1;
        parameters.setSensitive(i++, Types.TINYINT, grade);
        parameters.setSensitive(i++, Types.TINYINT, expectGrade);
        parameters.setSensitive(i++, Types.TIMESTAMP, gradeChangeTime);
        parameters.setSensitive(i++, Types.TINYINT, preGrade);
        parameters.setSensitive(i++, Types.DATE, expirationDate);
        parameters.setSensitive(i++, Types.BIGINT, id);
        parameters.setSensitive(i++, Types.TINYINT, preGrade);
        parameters.setSensitive(i++, Types.DATE, preExpirationDate);
        parameters.setSensitive(i++, Types.TIMESTAMP, lastTime);

        return queryDao.update(sql, parameters, hints);
    }
}
```

## 常见问题解答

### Q1: 如何选择BaseDao还是OldBaseDao？
**A**: 优先选择`BaseDao`，它使用新版的`DalTableOperations` API，功能更强大，性能更好。只有在必须兼容老代码时才使用`OldBaseDao`。

### Q2: 事务注解应该放在哪一层？
**A**: 主要放在Repository层的实现类中。Domain层的领域服务在必要时也可以使用，但Service层和Application层不应该直接使用Dal事务注解。

### Q3: 如何处理Dal的SQLException？
**A**: 在Repository层捕获`SQLException`，根据业务需要转换为自定义异常（如`NeedRetryMySQLException`），并记录适当的日志。

### Q4: 分页查询应该如何实现？
**A**: 推荐使用基于ID的分页（`where id > ? limit ?`），避免使用`OFFSET`，这样性能更好，数据一致性也更好。

### Q5: 批量操作的最佳实践是什么？
**A**: 
- 批量大小控制在1000以内
- 分批处理大量数据
- 使用Dal提供的批量API
- 注意事务边界和异常处理

### Q6: 如何优化Dal的性能？
**A**: 
- 合理配置连接池参数
- 避免N+1查询问题
- 使用批量操作替代单条操作
- 合理设计索引和查询条件
- 使用读写分离

### Q7: POJO类的字段是否都要和数据库字段一一对应？
**A**: 不是必须的。可以只定义业务需要的字段，但`@Column`注解的name属性必须和数据库字段名完全一致。

### Q8: 如何处理Dal的配置管理？
**A**: 
- 使用统一的`DalConfig`类管理所有数据库配置
- 逻辑库名使用常量定义，避免硬编码
- 环境相关配置通过配置文件管理
- 连接池参数根据实际负载调优

## 代码审查要点

1. **架构合规性**：检查Dal使用是否符合DDD分层架构
2. **注解使用**：检查POJO注解和事务注解是否正确
3. **异常处理**：检查SQLException是否被适当处理
4. **性能考虑**：检查是否存在N+1查询等性能问题
5. **事务边界**：检查事务的粒度和范围是否合理
6. **日志记录**：检查关键操作是否有适当的日志
7. **参数绑定**：检查SQL参数绑定是否正确使用敏感参数方法
8. **批量处理**：检查批量操作是否有合理的分批处理

