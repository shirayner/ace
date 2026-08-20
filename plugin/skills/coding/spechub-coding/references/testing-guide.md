# 测试编写参考

> 遇到测试编写问题时 Read 本文件。非核心流程步骤——在编译/测试失败时参考。

---

## 框架检测

读取 pom.xml/build.gradle 或 Grep 已有测试类确定框架组合：

| 框架组合 | 类注解 | Mock 注入 |
|---------|--------|----------|
| JUnit 5 + Mockito | `@ExtendWith(MockitoExtension.class)` | `@InjectMocks` 自动注入 |
| JUnit 4 + Mockito | `@RunWith(MockitoJUnitRunner.class)` | `@InjectMocks` 自动注入 |
| JUnit 4 + PowerMock | `@RunWith(PowerMockRunner.class)` | 必须手动反射注入 @Autowired 字段 |

---

## Mock 陷阱速查

| 陷阱 | 现象 | 解法 |
|------|------|------|
| PowerMock + @Autowired | NPE: 字段为 null | 反射注入：`Field f = cls.getDeclaredField("name"); f.setAccessible(true); f.set(target, mock);` |
| thenReturn 中调 mock | UnfinishedStubbingException | 用固定值或 thenAnswer |
| stream 内隐藏依赖 | NPE in lambda | 完整阅读方法体，列出所有内部调用 |
| 外部 SDK 无 setter | 编译错误 | 用 mock() + when().thenReturn() 构造 |
| 父类已有 mock 定义 | 重复 mock 冲突 | 检查测试父类的 @Mock 字段 |
| static 方法 mock | 运行时错误 | PowerMock: @PrepareForTest + mockStatic；Mockito 3.4+: mockStatic() |

---

## Mock 决策速查

| 依赖位置 | 是否已实现 | 决策 |
|---------|-----------|------|
| 同模块 | ✅ 已实现（前序 task） | **用真实实现**（更高置信度） |
| 同模块 | ❌ 骨架/return null | **mock** |
| 跨模块 | 无论 | **mock** |
| 外部（DB/MQ/HTTP） | 无论 | **mock** |

---

## 粒度控制

- 每个测试方法验证**一个行为**
- 每个 task 产出 1~3 个测试方法
- 避免在一个测试中验证多个 task 的逻辑
- 测试命名：`test{MethodName}_{Scenario}_{ExpectedResult}`
- 结构：Given-When-Then

---

## 测试类型区分

- **行为测试**（验证业务逻辑正确性）→ 必写。assert 具体业务结果。
- **契约测试**（验证输入输出格式符合 design.md）→ 选写。验证返回类型/异常类型。
