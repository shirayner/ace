# QSchedule 定时任务 Playbook

## 决策树

### 场景: 简单定时任务（cron）

- 前提条件: 任务逻辑单机可完成，无需分片；已在 QSchedule 控制台注册任务
- 选项: A) @QSchedule 注解 + cron 表达式 B) 实现 TaskHandler 接口
- 推荐: A — 简单任务用注解更简洁
- 判断依据: 注解方式适合无状态轻量任务；需要复杂生命周期管理时用 TaskHandler

### 场景: 分布式任务（分片）

- 前提条件: 数据量大需要多机并行处理，有明确分片键（如 userId % N）
- 选项: A) QSchedule 分片模式 B) 自行实现分布式锁 + 分段
- 推荐: A — 平台原生分片，自动负载均衡和故障转移
- 判断依据: QSchedule 分片内置 failover；自行实现需处理锁续期、节点摘除等复杂逻辑

## 骨架代码

### 简单定时任务骨架

```java
@Component
public class OrderTimeoutCheckTask {

    @Autowired
    private OrderBizService orderBizService;

    /**
     * 每 5 分钟检查超时未支付订单
     * 任务名需在 QSchedule 控制台注册
     */
    @QSchedule(cron = "0 */5 * * * ?", taskName = "orderTimeoutCheck")
    public void execute() {
        log.info("OrderTimeoutCheck task started");
        long startTime = System.currentTimeMillis();

        try {
            int count = orderBizService.cancelTimeoutOrders(Duration.ofMinutes(30));
            log.info("OrderTimeoutCheck completed, cancelled={}, cost={}ms",
                count, System.currentTimeMillis() - startTime);
        } catch (Exception e) {
            log.error("OrderTimeoutCheck failed", e);
            // QSchedule 会记录失败状态，可在控制台查看
            throw e;
        }
    }
}
```

### 分布式分片任务骨架

```java
@Component
public class DailySettlementTask implements ShardingTaskHandler {

    @Autowired
    private SettlementService settlementService;

    @Override
    public String getTaskName() {
        return "dailySettlement";
    }

    /**
     * 分片执行：每个节点处理一部分数据
     * @param shardIndex 当前分片索引（0-based）
     * @param totalShards 总分片数
     * @param taskContext 任务上下文（可传参数）
     */
    @Override
    public TaskResult execute(int shardIndex, int totalShards, TaskContext taskContext) {
        log.info("DailySettlement shard {}/{} started", shardIndex, totalShards);

        try {
            // 按分片键取模获取本分片数据
            List<Long> orderIds = settlementService.getOrderIdsByShard(
                shardIndex, totalShards, taskContext.getBizDate());

            int successCount = 0;
            int failCount = 0;
            for (Long orderId : orderIds) {
                try {
                    settlementService.settle(orderId);
                    successCount++;
                } catch (Exception e) {
                    log.error("Settlement failed for orderId={}", orderId, e);
                    failCount++;
                }
            }

            log.info("DailySettlement shard {}/{} completed: success={}, fail={}",
                shardIndex, totalShards, successCount, failCount);
            return TaskResult.success(
                String.format("processed=%d, success=%d, fail=%d",
                    orderIds.size(), successCount, failCount));
        } catch (Exception e) {
            log.error("DailySettlement shard {}/{} failed", shardIndex, totalShards, e);
            return TaskResult.fail(e.getMessage());
        }
    }
}
```

### 任务注册配置

```java
@Configuration
public class QScheduleConfig {

    @Bean
    public TaskHandlerRegistry taskHandlerRegistry(
            List<ShardingTaskHandler> handlers) {
        TaskHandlerRegistry registry = new TaskHandlerRegistry();
        handlers.forEach(h -> registry.register(h.getTaskName(), h));
        return registry;
    }
}
```

## 检查清单

- [ ] 任务名在 QSchedule 控制台已注册，与代码 taskName 一致
- [ ] 幂等性：任务重复执行不产生副作用（断点续跑/状态检查）
- [ ] 超时设置：控制台配置合理超时时间，避免任务堆积
- [ ] 异常处理：catch 后记录日志，决定重试还是跳过
- [ ] 分片键选择：数据分布均匀，避免热点分片
- [ ] 监控告警：任务失败 / 执行时间超阈值触发告警
- [ ] 锁竞争：单机任务确认 QSchedule 保证单实例执行
- [ ] 数据量预估：大数据任务用分页/游标，不要一次加载全部
- [ ] CAT 埋点：Task.execute 有 Transaction 记录耗时
