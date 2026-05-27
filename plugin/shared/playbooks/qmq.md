# QMQ 消息 Playbook

## 决策树

### 场景: 新建 Producer（同步/异步）

- 前提条件: Subject 已在 QMQ 控制台注册，消息体 DTO 已定义
- 选项: A) 同步发送（等待 Broker ACK） B) 异步发送（Fire & Forget）
- 推荐: A — 业务关键消息用同步确保不丢；通知类消息可异步提升吞吐
- 判断依据: 订单状态变更、资金操作必须同步；日志、统计类可异步

### 场景: 新建 Consumer（串行/并行）

- 前提条件: Subject 已创建，Consumer Group 已注册
- 选项: A) 串行消费（单线程顺序处理） B) 并行消费（多线程并发处理）
- 推荐: B — 默认并行提升吞吐；有严格顺序要求时用串行
- 判断依据: 同一订单状态流转需串行（按 orderId hash）；独立事件可并行

### 场景: 消息幂等处理

- 前提条件: 消费者可能收到重复消息（至少一次语义）
- 选项: A) 数据库唯一键去重 B) Redis 消息 ID 去重 C) 业务状态机天然幂等
- 推荐: C > A > B — 优先设计幂等业务逻辑；其次用 DB 唯一键兜底
- 判断依据: 状态机（如 status=PAID 才能变 SHIPPED）天然防重；Redis 有 TTL 失效风险

## 骨架代码

### Producer 骨架

```java
@Component
public class OrderStatusMessageProducer {

    private static final String SUBJECT = "ibu.order.status.changed";

    @Autowired
    private MessageProducerProvider producerProvider;

    /**
     * 同步发送订单状态变更消息
     */
    public void sendOrderStatusChanged(Long orderId, String fromStatus, String toStatus) {
        Message message = producerProvider.generateMessage(SUBJECT);
        message.setProperty("orderId", String.valueOf(orderId));
        message.setProperty("fromStatus", fromStatus);
        message.setProperty("toStatus", toStatus);
        message.setProperty("timestamp", String.valueOf(System.currentTimeMillis()));

        // 设置消息 key 用于日志追踪
        message.setProperty("messageKey", "ORDER_" + orderId + "_" + toStatus);

        producerProvider.sendMessage(message);  // 同步，失败抛异常
    }
}
```

### Consumer 骨架

```java
@Component
@QmqConsumer(
    subject = "ibu.order.status.changed",
    consumerGroup = "ibu-flight-order-consumer",
    executor = "qmqExecutor",
    isBroadcast = false
)
public class OrderStatusChangedListener implements MessageListener {

    @Autowired
    private OrderEventHandler orderEventHandler;

    @Override
    public void onMessage(Message message) {
        String orderId = message.getStringProperty("orderId");
        String toStatus = message.getStringProperty("toStatus");
        String messageKey = message.getStringProperty("messageKey");

        try {
            log.info("Received order status message: orderId={}, toStatus={}", orderId, toStatus);
            orderEventHandler.handleStatusChange(Long.parseLong(orderId), toStatus);
        } catch (DuplicateKeyException e) {
            // 幂等：重复消息，静默忽略
            log.info("Duplicate message ignored: {}", messageKey);
        } catch (Exception e) {
            log.error("Failed to process message: {}", messageKey, e);
            throw e;  // 抛出异常触发重试
        }
    }
}
```

### 幂等表骨架

```sql
-- 消息去重表
CREATE TABLE msg_consume_record (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_key VARCHAR(128) NOT NULL COMMENT '消息唯一标识',
    subject VARCHAR(128) NOT NULL COMMENT '消息主题',
    consume_status TINYINT DEFAULT 0 COMMENT '0-处理中 1-成功 2-失败',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    datachange_lasttime DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_message_key (message_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息消费幂等表';
```

```java
// 幂等消费模板
@Component
public class IdempotentConsumerTemplate {

    @Autowired
    private MsgConsumeRecordDao recordDao;

    public void consumeIdempotent(String messageKey, String subject, Runnable bizLogic) {
        MsgConsumeRecordEntity record = new MsgConsumeRecordEntity();
        record.setMessageKey(messageKey);
        record.setSubject(subject);
        record.setConsumeStatus(0);
        try {
            recordDao.insert(record);  // 唯一键防重
        } catch (DuplicateKeyException e) {
            log.info("Duplicate message, skip: {}", messageKey);
            return;
        }
        try {
            bizLogic.run();
            recordDao.updateStatus(messageKey, 1);
        } catch (Exception e) {
            recordDao.updateStatus(messageKey, 2);
            throw e;
        }
    }
}
```

## 检查清单

- [ ] Subject 命名规范：{bu}.{domain}.{event}（如 ibu.order.status.changed）
- [ ] Producer 设置 messageKey 便于追踪和去重
- [ ] Consumer Group 命名：{appId}-{功能描述}-consumer
- [ ] 消费逻辑有异常处理：业务异常 vs 系统异常分开处理
- [ ] 幂等保障：至少一种去重机制（唯一键/状态机/Redis）
- [ ] 消费超时：单条消息处理时间控制在 30s 内
- [ ] 死信队列：连续失败 N 次后进入死信，配置告警
- [ ] CAT 埋点：Producer.send + Consumer.process 有 Transaction
- [ ] 消息体大小：单条 < 1MB，大数据走引用（存 DB/OSS，传 ID）
