# 实现意图深度参考

> 当 coding skill 路由到"实现"意图时按需加载。

---

## Sub-agent 使用原则

### 何时委托给 sub-agent

| 场景 | 委托方式 | 期望回传 |
|------|---------|---------|
| 不确定改动影响哪些文件 | Agent(subagent_type: "Explore") | 影响文件列表 + 风险点 |
| 需要理解调用链 | Agent(subagent_type: "Explore") | 调用者/被调用者 + 数据流 |
| 搜索项目中的已有模式 | Agent(subagent_type: "Explore") | 相似实现 + 可复用工具方法 |
| 分析模块架构 | Agent(subagent_type: "Explore") | 关键组件 + 交互关系图 |

### 如何写好 sub-agent prompt

**原则**：告诉 sub-agent 你需要什么结论，不要规定搜索步骤。

**好**：
```
分析 OrderService.createOrder() 的完整调用链。
我需要知道：
1. 哪些类直接调用了这个方法
2. 这个方法内部依赖了哪些外部服务
3. 修改它的返回值类型会影响哪些下游
```

**差**：
```
先 grep OrderService，再读每个文件，然后...
```

### 何时不用 sub-agent

- 精确知道要读哪个文件 → 直接 Read
- 搜索一个已知符号 → 直接 Grep
- 改动位置已确定 → 直接 Edit

---

## Plan Mode 使用要点

### 进入 Plan Mode 的信号

- 变更涉及 3+ 文件
- 需要用户确认方案（多种可行路径）
- 涉及接口变更或公共 API
- 不确定变更边界

### Plan 应包含

1. **变更目标**：一句话说清楚要达成什么
2. **影响文件清单**：列出每个需要改动的文件及改动原因
3. **实施步骤**：带验证点的步骤序列
4. **风险与回退**：识别主要风险点，说明回退方案

### Plan 不应包含

- 冗余的背景分析（用户已经知道）
- 过度详细的代码片段（执行时再写）
- 风险清单和 RACI 表（除非用户要求）

---

## 状态文件使用要点

仅深度任务需要状态文件。参见 SKILL.md 第 4 节"外化"部分的模板。

### 何时创建

- 预计修改 10+ 文件
- 需要分多个阶段完成
- 可能跨会话

### 何时不创建

- 能在一轮 Plan Mode 循环内完成的任务
- 轻量任务

### Phase 划分原则

- 每个 Phase 有独立的验证点（编译/测试可通过）
- 先核心后周边：Phase 1 先让主路径跑通
- Phase 之间松耦合：某个 Phase 失败不阻塞其他

---

## 验证策略

### 编译验证

改完就编译，不攒到最后：
```bash
# Java/Maven
mvn compile -pl <module> -DskipTests

# Node
npm run build

# Go
go build ./...
```

### 测试验证

运行变更相关的测试：
```bash
# 指定测试类
mvn test -Dtest=<TestClass> -pl <module>

# 指定测试文件
npm test -- --grep "<pattern>"
```

### 回归检查

高风险变更（公共接口/核心逻辑）运行完整测试套件：
```bash
mvn test -pl <module>
```
