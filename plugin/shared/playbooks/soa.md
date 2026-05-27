# SOA 服务层 Playbook

## 决策树

### 场景: 新建 SOA 服务提供者

- 前提条件: 契约 JAR 已发布到 Maven 仓库，AppId 已申请
- 选项: A) 基于 Baiji 框架实现 B) 基于 CDubbo 框架实现
- 推荐: A — 携程内部服务间调用优先使用 Baiji（HTTP+JSON）
- 判断依据: Baiji 与 SLB/Gateway 集成更好；CDubbo 适用于需要高吞吐的 RPC 场景

### 场景: 新建 SOA 服务消费者

- 前提条件: 服务提供方已部署，契约 JAR 版本已确认
- 选项: A) ServiceClient 注入调用 B) RestTemplate 手动调用
- 推荐: A — ServiceClient 自带服务发现、负载均衡、熔断
- 判断依据: 手动调用丢失治理能力；跨语言场景才考虑 HTTP 直连

### 场景: Mapper 层（DTO→Entity 转换）

- 前提条件: 契约 DTO 与数据库 Entity 字段存在差异
- 选项: A) 手写 Mapper 类 B) MapStruct 生成
- 推荐: A — 携程项目以手写为主，逻辑清晰可控
- 判断依据: MapStruct 引入编译期依赖；手写 Mapper 便于加入业务转换逻辑

## 骨架代码

### 新建 SOA 服务提供者骨架

```java
// Service 实现类
@Service
@BaijiContract(serviceName = "OrderService", serviceNamespace = "com.ctrip.ibu.order")
public class OrderServiceImpl implements OrderServiceContract {

    @Autowired
    private OrderBizService orderBizService;

    @Override
    @BaijiOperation(name = "getOrderDetail")
    public GetOrderDetailResponse getOrderDetail(GetOrderDetailRequest request) {
        // 1. 参数校验
        Preconditions.checkArgument(request.getOrderId() != null, "orderId is required");

        // 2. 业务处理
        OrderDetailDto detail = orderBizService.queryOrderDetail(request.getOrderId());

        // 3. 响应组装
        GetOrderDetailResponse response = new GetOrderDetailResponse();
        response.setResponseStatus(ResponseStatusBuilder.success());
        response.setOrderDetail(detail);
        return response;
    }
}
```

```java
// Mapper 类
@Component
public class OrderMapper {

    public OrderDetailDto toDto(OrderInfoEntity entity) {
        if (entity == null) return null;
        OrderDetailDto dto = new OrderDetailDto();
        dto.setOrderId(entity.getOrderId());
        dto.setUserId(entity.getUserId());
        dto.setStatusName(OrderStatusEnum.fromCode(entity.getStatus()).getDesc());
        dto.setCreateTime(DateUtil.format(entity.getCreateTime()));
        return dto;
    }

    public OrderInfoEntity toEntity(CreateOrderRequest request) {
        OrderInfoEntity entity = new OrderInfoEntity();
        entity.setOrderId(IdGenerator.nextId());
        entity.setUserId(request.getUserId());
        entity.setStatus(OrderStatusEnum.CREATED.getCode());
        return entity;
    }
}
```

### 新建 SOA 服务消费者骨架

```java
// 消费者配置
@Configuration
public class ExternalServiceConfig {

    @Bean
    public ServiceClient<FlightSearchService> flightSearchClient() {
        return ServiceClientFactory.create(FlightSearchService.class)
            .withTimeout(3000)
            .withRetry(1)
            .build();
    }
}

// 调用封装
@Component
public class FlightSearchAdapter {

    @Autowired
    private ServiceClient<FlightSearchService> flightSearchClient;

    public FlightSearchResult search(FlightSearchParam param) {
        FlightSearchRequest request = buildRequest(param);
        try {
            FlightSearchResponse response = flightSearchClient.invoke(
                c -> c.searchFlights(request));
            if (!response.isSuccess()) {
                log.warn("FlightSearch failed: {}", response.getErrorMessage());
                return FlightSearchResult.empty();
            }
            return mapToResult(response);
        } catch (ServiceException e) {
            log.error("FlightSearch service error", e);
            return FlightSearchResult.fallback();
        }
    }
}
```

## 检查清单

- [ ] 契约 JAR groupId/artifactId/version 与 MOM 平台一致
- [ ] @BaijiContract serviceName 与契约定义匹配
- [ ] 每个操作方法有 @BaijiOperation 注解
- [ ] Response 始终设置 ResponseStatus（成功/失败都要）
- [ ] 消费者配置超时时间（默认 3s，按场景调整）
- [ ] 消费者有降级逻辑（catch ServiceException 返回兜底）
- [ ] Mapper 层处理 null 值，不抛 NPE
- [ ] 日志：入参摘要 + 耗时 + 异常堆栈
- [ ] CAT 埋点：Transaction 名称 = ServiceName.OperationName
