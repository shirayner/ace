# QConfig 配置中心 Playbook

## 决策树

### 场景: 读取配置（一次性/监听变更）

- 前提条件: 配置文件已在 QConfig 控制台创建，AppId 有权限
- 选项: A) @QConfig 注解注入（自动监听变更） B) ConfigManager API 一次性读取
- 推荐: A — 注解方式简洁，自动热更新
- 判断依据: 需要实时感知变更用 A；启动时读一次的静态配置也可用 A（不监听也无副作用）

### 场景: 写入/修改配置

- 前提条件: 需要通过代码动态修改配置（非控制台操作）
- 选项: A) QConfig Admin API 写入 B) 仅通过控制台手动修改
- 推荐: B — 绝大多数场景通过控制台修改，保留审计轨迹
- 判断依据: 代码写入适用于自动化运维场景（如动态扩容参数）；业务配置走控制台+审批流

### 场景: 动态开关

- 前提条件: 需要不发布代码即可控制功能开启/关闭
- 选项: A) Boolean 开关（简单开/关） B) 百分比灰度开关 C) 白名单开关
- 推荐: 视场景组合使用 — 新功能上线用 B 灰度，问题回滚用 A 快速关闭
- 判断依据: A 粒度最粗但最快；B 可渐进放量；C 适合定向测试

## 骨架代码

### @QConfig 注解读取骨架

```java
@Component
public class OrderConfig {

    /**
     * properties 文件注入（自动监听变更）
     * 文件名: order-config.properties
     * 内容格式: key=value
     */
    @QConfig("order-config.properties")
    private Properties orderProperties;

    /**
     * JSON 文件注入为 Map
     * 文件名: order-rules.json
     */
    @QConfig("order-rules.json")
    private Map<String, Object> orderRules;

    public int getMaxRetryCount() {
        return Integer.parseInt(
            orderProperties.getProperty("max.retry.count", "3"));
    }

    public String getDefaultCurrency() {
        return orderProperties.getProperty("default.currency", "CNY");
    }
}
```

### ConfigListener 监听变更骨架

```java
@Component
public class DynamicRuleConfigListener {

    private volatile List<RuleConfig> currentRules = Collections.emptyList();

    @QConfig("dynamic-rules.json")
    public void onRuleConfigChanged(String newContent) {
        // 变更回调：每次配置变更时触发
        try {
            List<RuleConfig> rules = JsonUtil.parseArray(newContent, RuleConfig.class);
            this.currentRules = Collections.unmodifiableList(rules);
            log.info("Dynamic rules reloaded, count={}", rules.size());
        } catch (Exception e) {
            log.error("Failed to parse dynamic-rules.json, keep old value", e);
            // 解析失败不更新，保留旧值
        }
    }

    public List<RuleConfig> getCurrentRules() {
        return currentRules;
    }
}
```

### 动态开关类骨架

```java
@Component
public class FeatureSwitch {

    @QConfig("feature-switch.properties")
    private Properties switchProps;

    /** 简单开关 */
    public boolean isNewCheckoutEnabled() {
        return Boolean.parseBoolean(
            switchProps.getProperty("feature.new.checkout.enabled", "false"));
    }

    /** 百分比灰度：根据 userId hash 判断 */
    public boolean isGrayEnabled(String featureKey, String userId) {
        int percentage = Integer.parseInt(
            switchProps.getProperty(featureKey + ".gray.percentage", "0"));
        if (percentage <= 0) return false;
        if (percentage >= 100) return true;
        int hash = Math.abs(userId.hashCode() % 100);
        return hash < percentage;
    }

    /** 白名单开关 */
    public boolean isWhitelisted(String featureKey, String userId) {
        String whitelist = switchProps.getProperty(featureKey + ".whitelist", "");
        if (whitelist.isEmpty()) return false;
        Set<String> whiteSet = Set.of(whitelist.split(","));
        return whiteSet.contains(userId);
    }
}
```

## 检查清单

- [ ] 配置文件 key 命名：{模块}.{功能}.{属性}（如 order.timeout.ms）
- [ ] 所有 @QConfig 注入字段有默认值兜底（配置拉取失败不影响启动）
- [ ] 监听回调中 catch 异常，解析失败保留旧值
- [ ] Properties 类型字段声明为 volatile 或使用线程安全容器
- [ ] 开关命名：feature.{功能名}.enabled / feature.{功能名}.gray.percentage
- [ ] 灰度配置：支持 0%（全关）和 100%（全开）边界值
- [ ] 环境隔离：fat/uat/pro 配置值独立，不要跨环境引用
- [ ] 配置变更有日志记录（变更前后值）
- [ ] 敏感配置（密码、token）不要放 QConfig，走密钥管理
