# 单元测试深度参考

> ut skill 按需加载。浓缩自实战经验，每条规则背后都有踩坑记录。

---

## 执行策略

### 批量模式（独立调用 /ut 时）

**批量生成 + 统一编译 + 错误修复**，不要逐个测试方法编写验证。

1. 分析被测类 → 2. 一次性生成完整测试类 → 3. 编译验证 → 4. 运行修复 → 5. 覆盖率检查

### 增量模式（spechub-coding IMPLEMENT 内嵌时）

**逐 task 生成测试 → 编译 → 实现 → 验证**，与实现代码交替进行。

规则差异：
- 每次只生成当前 task 的测试方法（不是整个测试类）
- 测试类采用追加写入（Edit 而非 Write）
- 每次生成后立即 `mvn compile` 确认可编译
- 实现后立即 `mvn test -Dtest=XxxTest#currentMethod` 验证
- Mock 决策：同模块已实现的依赖优先用真实实现，跨模块/外部 mock

---

## 框架检测与适配

读取 pom.xml / build.gradle 确定框架组合：

| 框架组合 | 类注解 | Mock 注入 | 注意事项 |
|---------|--------|----------|---------|
| JUnit 5 + Mockito | `@ExtendWith(MockitoExtension.class)` | `@InjectMocks` 自动注入 | 推荐方案 |
| JUnit 4 + Mockito | `@RunWith(MockitoJUnitRunner.class)` | `@InjectMocks` 自动注入 | |
| JUnit 4 + PowerMock | `@RunWith(PowerMockRunner.class)` | **必须手动注入 @Autowired 字段** | 见下方陷阱 #1 |

---

## Mock 陷阱（必读）

### 陷阱 1: PowerMock + @Autowired 手动注入

PowerMock 的 `@InjectMocks` 不能处理 `@Autowired` 字段，必须反射注入：

```java
@Before
public void setUp() throws Exception {
    MockitoAnnotations.initMocks(this);
    injectField("repository", repository);
    injectField("externalService", externalService);
}

private void injectField(String name, Object value) throws Exception {
    Field field = ServiceUnderTest.class.getDeclaredField(name);
    field.setAccessible(true);
    field.set(serviceUnderTest, value);
}
```

### 陷阱 2: thenReturn 中调用 mock 方法

```java
// WRONG — 触发 UnfinishedStubbingException
when(service.getData()).thenReturn(buildData(mockObj));

// RIGHT — 使用固定值
when(service.getData()).thenReturn(buildData(1, 2, 3));
// 或使用 thenAnswer
when(service.getData()).thenAnswer(inv -> buildData(mockObj.getId()));
```

### 陷阱 3: stream/lambda 中的隐藏依赖

被测代码中 stream 操作内的方法调用容易遗漏：
```java
rights.stream().map(rightV2 -> {
    RightKey key = rightV2.rightKey();           // 需要 mock
    Integer times = rightV2.getTimes(cmd);        // 需要 mock
    Long count = rightV2.activityAllCount();      // 需要 mock
});
```
**必须**完整阅读方法体，为每个 mock 对象列出"方法调用清单"。

### 陷阱 4: 实体类实例化方式

| 类型 | 实例化方式 | 原因 |
|------|----------|------|
| 项目内部 DTO/VO/Entity | `new` + setter | 有完整 setter |
| 接口、抽象类 | `mock()` | 无法实例化 |
| 外部 SDK 实体类 | `mock()` + `when().thenReturn()` | 通常无 public setter |

```java
// WRONG — 外部 SDK 类没有 setter
AccountRealName account = new AccountRealName();
account.setEnFirstName("John"); // 编译错误

// RIGHT
AccountRealName account = mock(AccountRealName.class);
when(account.getEnFirstName()).thenReturn("John");
```

**不确定时**：先查看已有测试代码或源代码确认。

### 陷阱 5: 父类已有 mock

检查测试父类是否已定义 mock 字段，子类不要重复定义：
```java
// 父类已有
@Mock protected DTOMapper dtoMapper;
// 子类中 —— 不要再写 @Mock DTOMapper dtoMapper!
```

---

## 测试设计

### 命名规范

`test{MethodName}_{Scenario}_{ExpectedResult}`

### Given-When-Then 结构

```java
@Test
void testCreateOrder_WithValidRequest_ShouldReturnCreatedOrder() {
    // Given — 准备数据和 mock
    CreateOrderRequest request = buildValidRequest();
    given(inventoryClient.checkStock(any(), anyInt())).willReturn(true);

    // When — 执行被测方法
    Order result = orderService.createOrder(request);

    // Then — 验证结果和行为
    assertThat(result.getStatus()).isEqualTo(OrderStatus.CREATED);
    verify(orderRepository).save(any(Order.class));
}
```

### 每个方法的测试用例矩阵

| 类型 | 数量 | 目的 |
|------|------|------|
| 正常流程 | 1+ | 核心路径验证 |
| null/空参数 | 每参数 1 | 防御性检查 |
| 边界值 | 每参数 1-2 | 极值探测 |
| 异常流程 | 每异常 1 | 错误处理验证 |
| 负面验证 | 1-2 | 确认不该发生的事没发生 |

### 行为测试优先

测试"做了什么"而非"怎么做的"：
```java
// GOOD — 验证业务行为
verify(inventoryClient).decreaseStock("product_123", 9);

// BAD — 验证实现细节
verify(inventoryDao).update(eq("product_123"), eq(9));
```

---

## 覆盖率目标

| 指标 | 目标 |
|------|------|
| 行覆盖率 | >= 80% |
| 分支覆盖率 | >= 70% |
| 核心类行覆盖率 | >= 90% |

```bash
mvn test jacoco:report -pl <module>
```

---

## 常见编译/运行错误速查

| 错误 | 根因 | 修复 |
|------|------|------|
| NPE: mock 对象为 null | 未调用 initMocks / PowerMock 未手动注入 | 检查 setUp 方法 |
| NPE: mock 方法返回 null | 未 stub 某个方法调用 | 补充 when().thenReturn()，集合返回 emptyList |
| UnfinishedStubbingException | thenReturn 中调用了 mock | 改用固定值或 thenAnswer |
| Wanted but not invoked | verify 的方法没被实际调用 | 检查代码路径，确认方法确实被调用 |
| 编译错误：找不到 setter | 对外部 SDK 类用了 new + setter | 改用 mock |
| 类型不匹配 | 参数类型错误 | 检查 setter/构造函数期望的类型 |

---

## 静态方法 Mock

**JUnit 5 + Mockito-inline**：
```java
try (MockedStatic<StaticClass> mocked = mockStatic(StaticClass.class)) {
    mocked.when(StaticClass::staticMethod).thenReturn(result);
    // test code
}
```

**PowerMockito**：
```java
@RunWith(PowerMockRunner.class)
@PrepareForTest({StaticClass.class})
public class MyTest {
    @Before
    public void setUp() {
        PowerMockito.mockStatic(StaticClass.class);
        when(StaticClass.staticMethod()).thenReturn(result);
    }
}
```

---

## 生成前检查清单

- [ ] 完整阅读被测类方法体（包括私有方法、stream/lambda）
- [ ] 检查测试父类已有 mock 定义
- [ ] 为每个 mock 对象列出方法调用清单
- [ ] 确认实体类实例化方式（mock vs new+setter）
- [ ] 确认 setter 参数类型正确
- [ ] 集合类返回 emptyList 而非 null
- [ ] 不在 thenReturn 中调用 mock 方法
