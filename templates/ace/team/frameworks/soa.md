
# SOA使用规范


## 调用外部接口
接入依赖的外部接口时，按照如下流程进行。

比如待接入的接口
Maven依赖: 
```xml
        <!--机票X产品查询服务, 机场休息室开发负责人：赵伟程， 请求休息室X产品信息-->
        <dependency>
            <groupId>com.ctrip.flight.xapi.fltxsearchservice</groupId>
            <artifactId>fltxsearchservice-client</artifactId>
            <version>2.4.22</version>
        </dependency>
```
MOM接口契约: 
- AppId: 100011659
- OperationName: getXProductBaseInfo
- ServiceName: FlightXSearchService

(1)引入Maven依赖，并编译项目

在根目录 pom.xml 中的 dependencyManagement 中声明依赖版本

```xml
    <!-- 在根目录 pom.xml 中统一管理版本号 -->
    <properties>
        <fltxsearchservice.version>2.4.22</fltxsearchservice.version>
    </properties>
    <dependencyManagement>
        <dependency>
            <groupId>com.ctrip.flight.xapi.fltxsearchservice</groupId>
            <artifactId>fltxsearchservice-client</artifactId>
            <version>${fltxsearchservice.version}</version>
        </dependency>  
    </dependencyManagement>
```

在 data 模块下的pom.xml中实际引入依赖

```xml
    <dependencies>
        <!-- 在data模块下引入依赖时，自动引入父Pom中统一声明的版本号，因此此处无需声明版本号 -->
        <dependency>
            <groupId>com.ctrip.flight.xapi.fltxsearchservice</groupId>
            <artifactId>fltxsearchservice-client</artifactId>
        </dependency>
    </dependencies>
```
(2) 获取对应的 Client 和 ClientInterface 的全类名和包名
1》编译项目以确保所有依赖都正确加载
2》根据maven坐标找到依赖接口所在的jar包，然后查看jar包的内容来确定正确的Client和ClientInterface类信息
比如：
```bash
$ find ~/.m2/repository -name "cdpdataservice-0.0.125.jar" -exec jar tf {} \; | grep -i client
com/ctrip/ibu/cdp/service/soa/CdpdataserviceClientInterface.class
com/ctrip/ibu/cdp/service/soa/CdpdataserviceClient.class
```
这样后续就可以正确的导入包了

(3)使用 MOM MCP工具获取到依赖接口${OperationName}的契约，得到全类名请求类型和全类名响应类型

(4)实现ServiceInvoker实现类
- 作用：调用外部接口
- 基类: ServiceInvoker
- 重载方法: getClient
- 公有方法: 方法名为 ${OperationName}

```java
import org.springframework.stereotype.Component;
import com.ctrip.ibu.member.common.service.ServiceInvoker;

// 使用MOM MCP 工具获取到的全类名请求类型和响应类型
import com.ctrip.flight.xsearch.v1.GetXProductBaseInfoRequestType;
import com.ctrip.flight.xsearch.v1.GetXProductBaseInfoResponseType;
// Client 和 ClientInterface 的包名和全类名获取方法请按前文提供的方法获取
import com.ctrip.soa.flight.product.flightxsearchservice.v1.FlightXSearchServiceClient;
import com.ctrip.soa.flight.product.flightxsearchservice.v1.FlightXSearchServiceClientInterface;

@Component
public class FlightXProductServiceInvoker extends ServiceInvoker<FlightXSearchServiceClient> {

    @Override
    protected FlightXSearchServiceClient getClient() {
        // Client
        return FlightXSearchServiceClient.getInstance();
    }

    /**
     * 
     * 请求全量休息室X产品信息 
     * 方法名：${OperationName}
     * 入参：使用MOM MCP 工具获取到的全类名请求类型
     * 返回：使用MOM MCP 工具获取到的全类名响应类型
     */
    public GetXProductBaseInfoResponseType getXProductBaseInfo(GetXProductBaseInfoRequestType request) {
        // ClientInterface
        // 此处仅透传请求，入参为MOM MCP 工具获取到的全类名请求类型，同时返回MOM MCP 工具获取到的全类名响应类型
        return invoke(request, FlightXSearchServiceClientInterface::getXProductBaseInfo);
    }
}

```

(5) 实现仓储方法
在前面的ServiceInvoker中仅透传请求，并返回了契约响应类型，现在需要在对应的Respiratory中，调用这个ServiceInvoker，从而调用外部接口，并将外部接口返回的类型，转换成服务内部的领域模型并返回。

```java
@Component
public class FreeLoungeAirportRepositoryImpl implements FreeLoungeAirportRepository {

    @Autowired
    private FlightXProductServiceInvoker flightXProductServiceInvoker;

    @Override
    public Map<String, Set<Integer>> getAllLoungeAirportCodeToTerminalIdsMap() {
        // 构造请求参数
        GetXProductBaseInfoRequestType requestType = createGetXproductBaseInfoRequestType();
        GetXProductBaseInfoResponseType responseType = flightXProductServiceInvoker.getXProductBaseInfo(requestType);
        if (Objects.isNull(responseType)
                || Objects.isNull(responseType.getMessageBody())
                || CollectionUtility.isNullOrEmpty(responseType.getMessageBody().getLoungeBaseInfoList())) {
            return Collections.emptyMap();
        }
        // 解析响应结果
        return parseLoungeAirportCodeToTerminalIdsMap(responseType.getMessageBody().getLoungeBaseInfoList());
    }

    private Map<String, Set<Integer>> parseLoungeAirportCodeToTerminalIdsMap(List<LoungeBaseInfoType> loungeBaseInfoList) {
        Map<String, Set<Integer>> loungeAirportCodeToTerminalIdsMap = new HashMap<>();
        for (LoungeBaseInfoType loungeBaseInfoType : loungeBaseInfoList) {
        
            List<Integer> loungeTerminalIds;
            if (CollectionUtility.isNotNullOrEmpty(loungeBaseInfoType.getTerminalIds())
                    && loungeBaseInfoType.getTerminalIds().get(0) > 0) {
                loungeTerminalIds = loungeBaseInfoType.getTerminalIds();
            } else {
                loungeTerminalIds = Collections.emptyList();
            }

            if (loungeAirportCodeToTerminalIdsMap.containsKey(loungeBaseInfoType.getAirPort())) {
                Set<Integer> terminalIds = loungeAirportCodeToTerminalIdsMap.get(loungeBaseInfoType.getAirPort());
                terminalIds.addAll(loungeTerminalIds);
            } else {
                Set<Integer> terminalIds = new HashSet<>(loungeTerminalIds);
                loungeAirportCodeToTerminalIdsMap.put(loungeBaseInfoType.getAirPort(), terminalIds);
            }
        }
        return loungeAirportCodeToTerminalIdsMap;
    }

    private GetXProductBaseInfoRequestType createGetXproductBaseInfoRequestType() {
        RequestHeader requestHeader = new RequestHeader();
        requestHeader.setClientAppID(Foundation.app().getAppId());
        requestHeader.setRequestLogID(UUID.randomUUID().toString());

        GetXProductBaseInfoRequestBody requestBody = new GetXProductBaseInfoRequestBody();
        requestBody.setProductTypes(List.of("Lounge"));
        requestBody.setSaleChannel("EnglishSite");

        GetXProductBaseInfoRequestType requestType = new GetXProductBaseInfoRequestType();
        requestType.setRequestHeader(requestHeader);
        requestType.setMessageBody(requestBody);
        return requestType;
    }
}
```
# SOA使用规范


## 调用外部接口
接入依赖的外部接口时，按照如下流程进行。

比如待接入的接口
Maven依赖: 
```xml
        <!--机票X产品查询服务, 机场休息室开发负责人：赵伟程， 请求休息室X产品信息-->
        <dependency>
            <groupId>com.ctrip.flight.xapi.fltxsearchservice</groupId>
            <artifactId>fltxsearchservice-client</artifactId>
            <version>2.4.22</version>
        </dependency>
```
MOM接口契约: 
- AppId: 100011659
- OperationName: getXProductBaseInfo
- ServiceName: FlightXSearchService

(1)引入Maven依赖，并编译项目

在根目录 pom.xml 中的 dependencyManagement 中声明依赖版本

```xml
    <!-- 在根目录 pom.xml 中统一管理版本号 -->
    <properties>
        <fltxsearchservice.version>2.4.22</fltxsearchservice.version>
    </properties>
    <dependencyManagement>
        <dependency>
            <groupId>com.ctrip.flight.xapi.fltxsearchservice</groupId>
            <artifactId>fltxsearchservice-client</artifactId>
            <version>${fltxsearchservice.version}</version>
        </dependency>  
    </dependencyManagement>
```

在 data 模块下的pom.xml中实际引入依赖

```xml
    <dependencies>
        <!-- 在data模块下引入依赖时，自动引入父Pom中统一声明的版本号，因此此处无需声明版本号 -->
        <dependency>
            <groupId>com.ctrip.flight.xapi.fltxsearchservice</groupId>
            <artifactId>fltxsearchservice-client</artifactId>
        </dependency>
    </dependencies>
```
(2) 获取对应的 Client 和 ClientInterface 的全类名和包名
1》编译项目以确保所有依赖都正确加载
2》根据maven坐标找到依赖接口所在的jar包，然后查看jar包的内容来确定正确的Client和ClientInterface类信息
比如：
```bash
$ find ~/.m2/repository -name "cdpdataservice-0.0.125.jar" -exec jar tf {} \; | grep -i client
com/ctrip/ibu/cdp/service/soa/CdpdataserviceClientInterface.class
com/ctrip/ibu/cdp/service/soa/CdpdataserviceClient.class
```
这样后续就可以正确的导入包了

(3)使用 MOM MCP工具获取依赖接口的契约，得到全类名请求类型和全类名响应类型

(4)实现ServiceInvoker实现类
- 作用：调用外部接口
- 基类: ServiceInvoker
- 重载方法: getClient
- 公有方法: 方法名为 ${OperationName}

```java
import org.springframework.stereotype.Component;
import com.ctrip.ibu.member.common.service.ServiceInvoker;

// 契约中的请求类型和响应类型
import com.ctrip.flight.xsearch.v1.GetXProductBaseInfoRequestType;
import com.ctrip.flight.xsearch.v1.GetXProductBaseInfoResponseType;
//  Client 和 ClientInterface 的包名和全类名获取方法请按前文提供的方法获取
import com.ctrip.soa.flight.product.flightxsearchservice.v1.FlightXSearchServiceClient;
import com.ctrip.soa.flight.product.flightxsearchservice.v1.FlightXSearchServiceClientInterface;

@Component
public class FlightXProductServiceInvoker extends ServiceInvoker<FlightXSearchServiceClient> {

    @Override
    protected FlightXSearchServiceClient getClient() {
        // Client
        return FlightXSearchServiceClient.getInstance();
    }

    /**
     * 
     * 请求全量休息室X产品信息 
     * 方法名：${OperationName}
     * 入参：MOM MCP 工具获取到的全类名请求类型
     * 返回：MOM MCP 工具获取到的全类名响应类型
     */
    public GetXProductBaseInfoResponseType getXProductBaseInfo(GetXProductBaseInfoRequestType request) {
        // ClientInterface
        // 此处仅透传请求，入参为MOM MCP 工具获取到的全类名请求类型，同时返回MOM MCP 工具获取到的全类名响应类型
        return invoke(request, FlightXSearchServiceClientInterface::getXProductBaseInfo);
    }
}

```

(5) 检查 ServiceInvoker实现类是否正确实现，如果发现导入的包不正确，则可以按照前面的方法得到正确的包名，然后再导入包。


(6) 实现仓储方法
在前面的ServiceInvoker中仅透传请求，并返回了契约响应类型，现在需要在对应的Respiratory中，调用这个ServiceInvoker，从而调用外部接口，并将外部接口返回的类型，转换成服务内部的领域模型并返回。

```java
@Component
public class FreeLoungeAirportRepositoryImpl implements FreeLoungeAirportRepository {

    @Autowired
    private FlightXProductServiceInvoker flightXProductServiceInvoker;

    @Override
    public Map<String, Set<Integer>> getAllLoungeAirportCodeToTerminalIdsMap() {
        // 构造请求参数
        GetXProductBaseInfoRequestType requestType = createGetXproductBaseInfoRequestType();
        GetXProductBaseInfoResponseType responseType = flightXProductServiceInvoker.getXProductBaseInfo(requestType);
        if (Objects.isNull(responseType)
                || Objects.isNull(responseType.getMessageBody())
                || CollectionUtility.isNullOrEmpty(responseType.getMessageBody().getLoungeBaseInfoList())) {
            return Collections.emptyMap();
        }
        // 解析响应结果
        return parseLoungeAirportCodeToTerminalIdsMap(responseType.getMessageBody().getLoungeBaseInfoList());
    }

    private Map<String, Set<Integer>> parseLoungeAirportCodeToTerminalIdsMap(List<LoungeBaseInfoType> loungeBaseInfoList) {
        Map<String, Set<Integer>> loungeAirportCodeToTerminalIdsMap = new HashMap<>();
        for (LoungeBaseInfoType loungeBaseInfoType : loungeBaseInfoList) {
        
            List<Integer> loungeTerminalIds;
            if (CollectionUtility.isNotNullOrEmpty(loungeBaseInfoType.getTerminalIds())
                    && loungeBaseInfoType.getTerminalIds().get(0) > 0) {
                loungeTerminalIds = loungeBaseInfoType.getTerminalIds();
            } else {
                loungeTerminalIds = Collections.emptyList();
            }

            if (loungeAirportCodeToTerminalIdsMap.containsKey(loungeBaseInfoType.getAirPort())) {
                Set<Integer> terminalIds = loungeAirportCodeToTerminalIdsMap.get(loungeBaseInfoType.getAirPort());
                terminalIds.addAll(loungeTerminalIds);
            } else {
                Set<Integer> terminalIds = new HashSet<>(loungeTerminalIds);
                loungeAirportCodeToTerminalIdsMap.put(loungeBaseInfoType.getAirPort(), terminalIds);
            }
        }
        return loungeAirportCodeToTerminalIdsMap;
    }

    private GetXProductBaseInfoRequestType createGetXproductBaseInfoRequestType() {
        RequestHeader requestHeader = new RequestHeader();
        requestHeader.setClientAppID(Foundation.app().getAppId());
        requestHeader.setRequestLogID(UUID.randomUUID().toString());

        GetXProductBaseInfoRequestBody requestBody = new GetXProductBaseInfoRequestBody();
        requestBody.setProductTypes(List.of("Lounge"));
        requestBody.setSaleChannel("EnglishSite");

        GetXProductBaseInfoRequestType requestType = new GetXProductBaseInfoRequestType();
        requestType.setRequestHeader(requestHeader);
        requestType.setMessageBody(requestBody);
        return requestType;
    }
}
```