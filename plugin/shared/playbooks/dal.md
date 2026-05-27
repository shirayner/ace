# DAL 数据访问层 Playbook

## 决策树

### 场景: 新建表+Entity+DAO

- 前提条件: 有 DDL SQL（CREATE TABLE 语句），已确认分库分表策略
- 选项: A) 使用 generateDalCode 工具自动生成 B) 手动编写 Entity + DAO
- 推荐: A — 工具生成后微调，减少样板代码错误
- 判断依据: 工具生成覆盖标准场景；复杂映射（JSON 列、嵌套类型）需手动补充

### 场景: 修改已有表结构

- 前提条件: 已有 Entity 类存在，DDL 变更已确认（ALTER TABLE）
- 选项: A) 增量修改现有 Entity 字段 B) 重新生成覆盖
- 推荐: A — 增量修改，保留自定义逻辑和注释
- 判断依据: 重新生成会丢失手写的 @Column 定制、transient 字段、自定义方法

### 场景: 读写分离配置

- 前提条件: 业务有明确读多写少特征，DBA 已配置从库
- 选项: A) DalCluster 级别配置读写分离 B) DAO 方法级别 @DalHints 指定
- 推荐: B — 方法级控制更精细，避免强一致场景误读从库
- 判断依据: 写后读场景必须走主库；报表/列表查询可走从库

## 骨架代码

### 新建表+Entity+DAO 骨架

```java
// Entity 类
@Entity
@Table(name = "order_info")
public class OrderInfoEntity {

    @Id
    @Column(name = "id")
    @GeneratedValue(strategy = GenerationType.AUTO)
    private Long id;

    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "user_id")
    private String userId;

    @Column(name = "status")
    private Integer status;

    @Column(name = "create_time", insertable = false, updatable = false)
    private Timestamp createTime;

    @Column(name = "datachange_lasttime", insertable = false, updatable = false)
    private Timestamp datachangeLasttime;

    // getters & setters
}
```

```java
// DAO 接口
@DalDao(clusterName = "orderCluster", databaseName = "orderdb")
public interface OrderInfoDao extends CrudDao<OrderInfoEntity> {

    @Select(sql = "SELECT * FROM order_info WHERE order_id = ?")
    OrderInfoEntity findByOrderId(@DalParam("orderId") Long orderId);

    @Select(sql = "SELECT * FROM order_info WHERE user_id = ? AND status = ?")
    List<OrderInfoEntity> findByUserIdAndStatus(
        @DalParam("userId") String userId,
        @DalParam("status") Integer status);

    @Insert
    int insert(OrderInfoEntity entity);

    @Update(sql = "UPDATE order_info SET status = ? WHERE order_id = ?")
    int updateStatus(@DalParam("status") Integer status, @DalParam("orderId") Long orderId);
}
```

```xml
<!-- DalCluster 配置（dal-cluster.xml 或 QConfig） -->
<DalCluster name="orderCluster">
    <DatabaseSets>
        <DatabaseSet name="orderdb" provider="mysql">
            <Database name="orderdb_master" connectionString="..." role="Master"/>
            <Database name="orderdb_slave"  connectionString="..." role="Slave"/>
        </DatabaseSet>
    </DatabaseSets>
</DalCluster>
```

## 检查清单

- [ ] Entity 类名 = 表名驼峰 + Entity 后缀
- [ ] 所有字段 @Column name 与数据库列名一致（下划线命名）
- [ ] 包含 datachange_lasttime 列（insertable=false, updatable=false）
- [ ] 主键使用 @Id + @GeneratedValue
- [ ] DAO 接口继承 CrudDao 并指定 clusterName、databaseName
- [ ] 查询方法参数有 @DalParam 注解
- [ ] 分库分表场景：ShardStrategy 已配置，SQL 中包含分片键
- [ ] 索引：WHERE 条件字段已建索引，避免全表扫描
- [ ] 大表查询：加 limit 或分页，禁止无条件 SELECT *
- [ ] 读写分离：写后读场景使用 @DalHints(master=true)
