---
name: ut
description: |
  生成、修复或补充单元测试。用户提到"写测试""补 UT""提升覆盖率""测试失败"时触发。
  DO NOT TRIGGER: 功能开发/bug修复（→ auto-goal 或直接 Edit）；代码审查（→ code-review）。
---

# UT — 单元测试编排

## 执行策略

### 模式选择

| 模式 | 触发条件 | 策略 |
|------|---------|------|
| **批量模式**（默认） | 用户独立调用 `/ut` 补测试 | 批量生成 + 统一编译 + 错误修复 |
| **增量模式** | spechub-coding IMPLEMENT 阶段内嵌 | 逐 task 生成 → 编译 → 验证（详见 implement.md） |

**批量模式**（本 skill 直接调用时）：

**批量生成 + 统一编译 + 错误修复**，不逐个测试方法编写验证。

1. **分析被测类** → 读代码、识别公共方法、确定依赖
2. **框架检测** → 读 pom.xml/build.gradle，确定测试框架（详见 `references/unit-test-guide.md`）
3. **生成完整测试类** → 正常路径 + 异常路径 + 边界条件
4. **编译验证** → `mvn compile -pl {module} -am`
5. **运行修复** → 执行测试，失败则分析修复
6. **覆盖率检查** → 行 ≥80%、分支 ≥70%

---

## 复杂度适配

### 轻量（单类 ≤5 方法）
直接 Read 被测类 → 生成 → 编译 → 运行

### 标准（单类 >5 方法或多依赖）
Read `references/unit-test-guide.md` → 分析依赖注入方式 → 生成 → 验证

### 批量（10+ 类）
创建 `.ace/tasks/ut-{slug}/state.json`（参考 `../../shared/state-template.md`）→ 分批生成 → 每批编译验证
可并行：Read `../../shared/parallel-protocol.md`

---

## 验证规则

<HARD-GATE>
声称"测试完成"前，必须 fresh 执行：
1. 编译命令 → exit code 0
2. 测试运行命令 → 全部 passed
没有运行 = 没有通过。"应该没问题" = 没有验证。
</HARD-GATE>

---

## 交付格式

```
被测类: XxxService
测试类: XxxServiceTest
用例数: N (正常M + 异常K + 边界J)
覆盖率: 行 XX% / 分支 XX%
框架: JUnit X + Mockito/PowerMock
验证: mvn test -pl {module} → {N} passed, 0 failed (exit code 0)
```

---

## 反模式

| 反模式 | 表现 | 解药 |
|--------|------|------|
| mock 过度 | 所有依赖都 mock，测试失去价值 | 只 mock 外部依赖和 IO |
| 假阳性 | assert notNull 但不验证具体值 | assert 具体预期值 |
| 框架错配 | JUnit4 写法用 JUnit5 注解 | 先检测框架再生成 |
| 忽略 @Autowired | PowerMock 下未手动注入 | 详见 references |
| 逐个验证 | 写一个方法编译一次 | 批量生成后统一编译 |

---

## 深度参考

| 文件 | 内容 |
|------|------|
| `references/unit-test-guide.md` | 框架适配、mock 陷阱、覆盖率策略、反射注入详解 |
