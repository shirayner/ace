# Java 开发规范（阿里规范）

## 语言版本
- 使用 **Java 21** 进行开发
- 充分利用 Java 21 的新特性

## 命名规范

### 类命名
- **类名**：使用 PascalCase，如 `AssignUserGradeApplication`
- **抽象类**：以 `Abstract` 或 `Base` 开头，如 `AbstractBatchProcessingJob`
- **异常类**：以 `Exception` 结尾，如 `IBUMemberGradeException`
- **测试类**：以 `Test` 结尾，如 `AssignUserGradeApplicationTest`
- **枚举类**：以 `Enum` 结尾，如 `GradeTypeEnum`

### 方法命名
- **方法名**：使用 camelCase，动词开头，如 `assignUserGrade`
- **布尔方法**：以 `is`、`has`、`can` 开头，如 `isIbuMember`
- **获取方法**：使用 `get` 前缀，如 `getMemberGrade`
- **设置方法**：使用 `set` 前缀，如 `setGrade`

### 变量命名
- **变量名**：使用 camelCase，描述性命名，如 `memberGrade`
- **常量名**：使用 UPPER_SNAKE_CASE，如 `MAX_RETRY_COUNT`
- **静态常量**：使用 `static final`，如 `DEFAULT_GRADE`
- **局部变量**：使用 camelCase，如 `currentGrade`

### 包命名
- **包名**：使用小写字母，如 `com.ctrip.ibu.member.grade.computation`
- **避免使用下划线或数字开头**
- **包名统一使用单数形式**

## 代码风格

### 缩进和格式
- **缩进**：使用 4 个空格，不使用 Tab
- **行长度**：每行不超过 120 个字符
- **大括号**：使用 Egyptian 风格（开括号不换行）
- **空行**：方法间使用一个空行分隔

```java
public class GradeService {
    
    private static final int MAX_RETRY_COUNT = 3;
    private final MemberGradeRepository repository;
    
    public GradeService(MemberGradeRepository repository) {
        this.repository = repository;
    }
    
    public Optional<MemberGrade> getMemberGrade(String uid) {
        if (StringUtils.isBlank(uid)) {
            return Optional.empty();
        }
        
        return repository.findByUid(uid);
    }
}
```

### 注释规范
- **类注释**：使用 JavaDoc，包含作者、创建时间、功能描述
- **方法注释**：包含参数说明、返回值、异常说明
- **复杂逻辑**：添加行内注释说明
- **TODO 注释**：使用 `// TODO: 说明` 格式
- **行尾注释**：不要使用行尾注释

```java
/**
 * 会员等级服务
 * 负责会员等级的查询、分配、升级等业务逻辑
 * 
 * @author 开发者姓名
 * @since 1.0.0
 */
@Component
public class GradeService {
    
    /**
     * 分配用户等级
     * 
     * @param uid 用户ID，不能为空
     * @param ruleId 规则ID，不能为空
     * @return 分配结果
     * @throws IllegalArgumentException 当参数为空时抛出
     */
    public IBUErrorCode assignUserGrade(String uid, String ruleId) {
        // 参数校验
        if (StringUtils.isBlank(uid) || StringUtils.isBlank(ruleId)) {
            throw new IllegalArgumentException("参数不能为空");
        }
        
        // TODO: 实现业务逻辑
        return processGradeAssignment(uid, ruleId);
    }
}
```

## 异常处理

### 异常分类
- **检查异常**：谨慎使用，优先使用运行时异常
- **业务异常**：继承 `RuntimeException`，如 `IBUMemberGradeException`
- **系统异常**：使用标准异常，如 `IllegalArgumentException`

### 异常处理原则
```java
public class GradeService {
    
    public MemberGrade processGrade(String uid) {
        try {
            // 业务逻辑
            return repository.findByUid(uid)
                    .orElseThrow(() -> new MemberNotFoundException("会员不存在: " + uid));
        } catch (DataAccessException e) {
            // 记录日志
            logger.error("查询会员等级失败，uid: {}", uid, e);
            // 抛出业务异常
            throw new GradeServiceException("查询会员等级失败", e);
        }
    }
}
```

## 集合和流处理

### 集合选择
- **ArrayList**：随机访问频繁的场景
- **LinkedList**：插入删除频繁的场景
- **HashMap**：键值对存储，无排序要求
- **TreeMap**：需要排序的键值对
- **ConcurrentHashMap**：并发场景下的键值对

### Stream API 使用
```java
// 过滤和转换
List<MemberGrade> activeMembers = memberList.stream()
        .filter(MemberGrade::isActive)
        .filter(member -> member.getExp() > 100)
        .sorted(Comparator.comparing(MemberGrade::getExp).reversed())
        .collect(Collectors.toList());

// 分组统计
Map<String, Long> gradeCount = memberList.stream()
        .collect(Collectors.groupingBy(
                MemberGrade::getGrade,
                Collectors.counting()
        ));

// 并行处理
List<MemberGrade> processedMembers = memberList.parallelStream()
                .map(this::processMember)
                .collect(Collectors.toList());
```

### Optional 使用
```java
public class GradeService {
    
    public String getGradeName(String uid) {
        return repository.findByUid(uid)
                .map(MemberGrade::getGrade)
                .map(this::getGradeDisplayName)
                .orElse("未知等级");
    }
    
    public void processMemberIfExists(String uid) {
        repository.findByUid(uid)
                .ifPresent(this::processMember);
    }
}
```

## 并发编程

### 线程安全
- **不可变对象**：优先使用不可变对象
- **线程安全集合**：使用 `ConcurrentHashMap`、`CopyOnWriteArrayList`
- **原子操作**：使用 `AtomicInteger`、`AtomicReference`

```java
@Component
public class GradeService {
    
    private final AtomicInteger processedCount = new AtomicInteger(0);
    private final ConcurrentHashMap<String, MemberGrade> gradeCache = new ConcurrentHashMap<>();
    
    public void processMember(String uid) {
        // 原子操作
        int count = processedCount.incrementAndGet();
        
        // 线程安全缓存
        gradeCache.computeIfAbsent(uid, this::loadMemberGrade);
    }
}
```

### CompletableFuture 使用
```java
public class BatchProcessor {
    
    public List<MemberGrade> processBatch(List<String> uidList) {
        List<CompletableFuture<MemberGrade>> futures = uidList.stream()
                .map(uid -> CompletableFuture.supplyAsync(() -> processMember(uid), executor))
                .collect(Collectors.toList());
        
        return futures.stream()
                .map(CompletableFuture::join)
                .collect(Collectors.toList());
    }
}
```

## 内存管理

### 对象创建优化
```java
public class GradeService {
    
    // 避免在循环中创建对象
    public List<String> getGradeNames(List<MemberGrade> members) {
        List<String> names = new ArrayList<>(members.size()); // 预分配容量
        for (MemberGrade member : members) {
            names.add(member.getGrade());
        }
        return names;
    }
    
    // 使用 StringBuilder 进行字符串拼接
    public String buildGradeDescription(MemberGrade member) {
        StringBuilder sb = new StringBuilder();
        sb.append("用户: ").append(member.getUid())
          .append(", 等级: ").append(member.getGrade())
          .append(", 经验值: ").append(member.getExp());
        return sb.toString();
    }
}
```

### 资源管理
```java
public class DatabaseService {
    
    public void processData() {
        // 使用 try-with-resources 自动管理资源
        try (Connection conn = dataSource.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            
            stmt.setString(1, uid);
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    processRow(rs);
                }
            }
        } catch (SQLException e) {
            throw new DataAccessException("数据库操作失败", e);
        }
    }
}
```

## 泛型使用

### 类型安全
```java
public class Repository<T, ID> {
    
    public Optional<T> findById(ID id) {
        // 泛型方法实现
    }
    
    public List<T> findAll() {
        // 返回类型安全的列表
    }
    
    public <S extends T> S save(S entity) {
        // 泛型边界
    }
}

// 使用示例
public class MemberGradeRepository extends Repository<MemberGrade, String> {
    // 继承泛型类
}
```

### 通配符使用
```java
public class GradeService {
    
    // 上界通配符 - 只读
    public void processGrades(List<? extends MemberGrade> grades) {
        for (MemberGrade grade : grades) {
            processGrade(grade);
        }
    }
    
    // 下界通配符 - 只写
    public void addGrades(List<? super MemberGrade> gradeList) {
        gradeList.add(new MemberGrade());
    }
}
```

## 注解使用

### 标准注解
```java
@Override
public String toString() {
    return "MemberGrade{uid='" + uid + "'}";
}

@Deprecated
public void oldMethod() {
    // 已废弃的方法
}

@SuppressWarnings("unchecked")
public List<MemberGrade> getMembers() {
    return (List<MemberGrade>) rawList;
}
```

### 自定义注解
```java
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface LogExecutionTime {
    String value() default "";
}

// 使用自定义注解
@LogExecutionTime("分配用户等级")
public IBUErrorCode assignUserGrade(String uid, String ruleId) {
    // 方法实现
}
```

### Lombok 注解
请不要在项目中使用Lombok

## 测试规范

### 单元测试
```java
@ExtendWith(MockitoExtension.class)
class GradeServiceTest {
    
    @Mock
    private MemberGradeRepository repository;
    
    @InjectMocks
    private GradeService gradeService;
    
    @Test
    @DisplayName("分配用户等级成功")
    void testAssignUserGrade_Success() {
        // Given
        String uid = "test_uid";
        String ruleId = "test_rule";
        when(repository.findByUid(uid)).thenReturn(Optional.of(new MemberGrade()));
        
        // When
        IBUErrorCode result = gradeService.assignUserGrade(uid, ruleId);
        
        // Then
        assertEquals(IBUCommonErrorCode.SUCCESS, result);
        verify(repository).save(any(MemberGrade.class));
    }
    
    @Test
    @DisplayName("用户ID为空时抛出异常")
    void testAssignUserGrade_EmptyUid_ThrowsException() {
        // Given
        String uid = "";
        String ruleId = "test_rule";
        
        // When & Then
        assertThrows(IllegalArgumentException.class, () -> {
            gradeService.assignUserGrade(uid, ruleId);
        });
    }
}
```

### 集成测试
```java
@SpringBootTest
@Transactional
class GradeServiceIntegrationTest {
    
    @Autowired
    private GradeService gradeService;
    
    @Autowired
    private TestEntityManager entityManager;
    
    @Test
    void testAssignUserGrade_Integration() {
        // Given
        String uid = "integration_test_uid";
        
        // When
        IBUErrorCode result = gradeService.assignUserGrade(uid, "test_rule");
        
        // Then
        assertEquals(IBUCommonErrorCode.SUCCESS, result);
        
        MemberGrade savedGrade = entityManager.find(MemberGrade.class, uid);
        assertNotNull(savedGrade);
        assertEquals("test_rule", savedGrade.getGrade());
    }
}
```

## 性能优化

### 算法复杂度
- **时间复杂度**：选择合适的算法，避免 O(n²) 复杂度
- **空间复杂度**：合理使用内存，避免内存泄漏
- **缓存策略**：使用缓存减少重复计算

### 代码优化
```java
public class GradeService {
    
    // 使用缓存避免重复计算
    private final Map<String, Grade> gradeCache = new ConcurrentHashMap<>();
    
    public Grade getGrade(String gradeCode) {
        return gradeCache.computeIfAbsent(gradeCode, this::loadGradeFromDatabase);
    }
    
    // 批量处理提高性能
    public List<MemberGrade> processBatch(List<String> uidList) {
        return uidList.parallelStream()
                .map(this::processMember)
                .collect(Collectors.toList());
    }
}
```

## 代码质量

### 单一职责原则
```java
// 好的设计 - 单一职责
public class GradeCalculator {
    public int calculateExp(MemberGrade grade) {
        // 只负责计算经验值
    }
}

public class GradeValidator {
    public boolean isValidGrade(String grade) {
        // 只负责验证等级
    }
}

// 不好的设计 - 多重职责
public class GradeService {
    public void doEverything() {
        // 包含太多职责
    }
}
```

### 开闭原则
```java
// 对扩展开放，对修改关闭
public interface GradeProcessor {
    void process(MemberGrade grade);
}

public class SilverGradeProcessor implements GradeProcessor {
    @Override
    public void process(MemberGrade grade) {
        // 处理银卡会员
    }
}

public class GoldGradeProcessor implements GradeProcessor {
    @Override
    public void process(MemberGrade grade) {
        // 处理金卡会员
    }
}
```

## 日志规范

### 日志级别
- **ERROR**：系统错误和异常
- **WARN**：警告信息
- **INFO**：重要业务信息
- **DEBUG**：调试信息

### 日志语言
- 始终使用英文来打印日志

### 日志格式
```java
public class GradeService {
    
    private static final Logger logger = LoggerFactory.getLogger(GradeService.class);
    
    public void processGrade(String uid) {
        logger.info("start to process, uid: {}", uid);
        
        try {
            // 业务逻辑
            logger.debug("process sucess, uid: {}", uid);
        } catch (Exception e) {
            logger.error("process failed, uid: {}", uid, e);
            throw e;
        }
    }
}
```

## 代码审查要点

1. **命名规范**：检查类名、方法名、变量名是否符合规范
2. **注释完整性**：确保关键代码有适当的注释
3. **异常处理**：检查异常处理是否完整和正确
4. **性能影响**：评估代码变更对性能的影响
5. **安全性**：检查是否存在安全漏洞
6. **可测试性**：确保代码易于测试
7. **可维护性**：代码结构清晰，易于理解和维护
