# CRedis 缓存 Playbook

## 决策树

### 场景: String 缓存（get/set + TTL）

- 前提条件: 数据访问频繁、变更不频繁、可接受短暂不一致
- 选项: A) Cache-Aside（读时加载） B) Write-Through（写时同步更新缓存）
- 推荐: A — 最通用，缓存自然过期保证最终一致
- 判断依据: Write-Through 适合写少读多且强一致要求；Cache-Aside 实现简单、容错性好

### 场景: Hash 缓存

- 前提条件: 对象有多个字段，且部分字段频繁单独读写
- 选项: A) 整个对象 JSON 序列化为 String B) 各字段存为 Hash field
- 推荐: B — 字段级读写减少网络传输和序列化开销
- 判断依据: 字段 > 5 个且经常只读/写部分字段时用 Hash；字段少或总是整体读写时用 String

### 场景: 分布式锁

- 前提条件: 多实例并发操作同一资源，需互斥
- 选项: A) CRedis 分布式锁（SET NX EX） B) ZooKeeper 分布式锁
- 推荐: A — 轻量、性能好，适合锁持有时间短的场景
- 判断依据: CRedis 锁适合 < 30s 的临界区；长时间锁或需要可重入/公平性用 ZK

## 骨架代码

### String 缓存骨架（Cache-Aside）

```java
@Component
public class OrderCacheService {

    private static final String KEY_PREFIX = "ibu:order:detail:";
    private static final int TTL_SECONDS = 600;  // 10 分钟

    @Autowired
    private CRedisClient credisClient;

    @Autowired
    private OrderDao orderDao;

    public OrderDetailDto getOrderDetail(Long orderId) {
        String key = KEY_PREFIX + orderId;

        // 1. 读缓存
        String cached = credisClient.get(key);
        if (cached != null) {
            return JsonUtil.parse(cached, OrderDetailDto.class);
        }

        // 2. 缓存未命中，读 DB
        OrderInfoEntity entity = orderDao.findByOrderId(orderId);
        if (entity == null) {
            // 防缓存穿透：空值也缓存，短 TTL
            credisClient.setex(key, 60, "NULL");
            return null;
        }

        // 3. 回写缓存
        OrderDetailDto dto = orderMapper.toDto(entity);
        credisClient.setex(key, TTL_SECONDS, JsonUtil.toJson(dto));
        return dto;
    }

    public void evictOrderCache(Long orderId) {
        credisClient.del(KEY_PREFIX + orderId);
    }
}
```

### Hash 缓存骨架

```java
@Component
public class UserProfileCacheService {

    private static final String KEY_PREFIX = "ibu:user:profile:";
    private static final int TTL_SECONDS = 1800;  // 30 分钟

    @Autowired
    private CRedisClient credisClient;

    public void cacheUserProfile(String userId, UserProfile profile) {
        String key = KEY_PREFIX + userId;
        Map<String, String> fields = new HashMap<>();
        fields.put("nickname", profile.getNickname());
        fields.put("avatar", profile.getAvatar());
        fields.put("level", String.valueOf(profile.getLevel()));
        fields.put("lastLogin", String.valueOf(profile.getLastLoginTime()));

        credisClient.hmset(key, fields);
        credisClient.expire(key, TTL_SECONDS);
    }

    public String getUserNickname(String userId) {
        return credisClient.hget(KEY_PREFIX + userId, "nickname");
    }

    public void updateUserLevel(String userId, int newLevel) {
        credisClient.hset(KEY_PREFIX + userId, "level", String.valueOf(newLevel));
    }
}
```

### 分布式锁骨架

```java
@Component
public class DistributedLockService {

    private static final String LOCK_PREFIX = "ibu:lock:";

    @Autowired
    private CRedisClient credisClient;

    /**
     * 尝试获取锁
     * @param lockKey 锁标识
     * @param requestId 请求唯一 ID（用于安全释放）
     * @param expireSeconds 锁过期时间（防死锁）
     * @return 是否获取成功
     */
    public boolean tryLock(String lockKey, String requestId, int expireSeconds) {
        String key = LOCK_PREFIX + lockKey;
        String result = credisClient.set(key, requestId, "NX", "EX", expireSeconds);
        return "OK".equals(result);
    }

    /**
     * 释放锁（Lua 脚本保证原子性）
     */
    public boolean releaseLock(String lockKey, String requestId) {
        String key = LOCK_PREFIX + lockKey;
        String script =
            "if redis.call('get', KEYS[1]) == ARGV[1] then " +
            "  return redis.call('del', KEYS[1]) " +
            "else " +
            "  return 0 " +
            "end";
        Long result = (Long) credisClient.eval(
            script, Collections.singletonList(key), Collections.singletonList(requestId));
        return result != null && result == 1;
    }

    /**
     * 带锁执行模板
     */
    public <T> T executeWithLock(String lockKey, int expireSeconds, Supplier<T> action) {
        String requestId = UUID.randomUUID().toString();
        if (!tryLock(lockKey, requestId, expireSeconds)) {
            throw new ConcurrentOperationException("Failed to acquire lock: " + lockKey);
        }
        try {
            return action.get();
        } finally {
            releaseLock(lockKey, requestId);
        }
    }
}
```

## 检查清单

- [ ] Key 命名规范：{bu}:{模块}:{业务含义}:{id}（如 ibu:order:detail:12345）
- [ ] TTL 策略：所有 key 必须设 TTL，禁止永不过期（推荐 10min ~ 24h）
- [ ] 大 key 防护：String value < 10KB，Hash fields < 1000 个
- [ ] 缓存穿透：空值缓存或布隆过滤器
- [ ] 缓存雪崩：TTL 加随机偏移（±10%），避免同时失效
- [ ] 热 key：监控热点 key，必要时本地缓存兜底
- [ ] 序列化：统一使用 JSON，避免 Java 原生序列化（跨语言 + 版本兼容）
- [ ] 分布式锁：必须设过期时间，释放锁用 Lua 脚本保证原子性
- [ ] 锁粒度：锁 key 尽量细（如锁单个订单，不锁整个用户）
- [ ] 监控：Hickwall 监控 hit rate、latency、big key 告警
