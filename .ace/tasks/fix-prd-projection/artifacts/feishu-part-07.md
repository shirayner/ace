                  目的地城市(酒店系)：destinationCityId                         地级市（多值用,隔开）：destinationPrefectureCityId                         县级市（多值用,隔开）：destinationCountyCityId                         目的地省份(酒店系) 多值用,隔开：destinationProvinceId                         目的地国家(酒店系) 多值用,隔开：destinationCountryId                         二级品类(PI二级品类)：category                         景点ID(PI定义)：scenicId                         是否过滤活动时间：isActivityAvailable                         老系统状态列表(为兼容老系统，新系统不支持): status                         投放范围:delivery  1:鹊桥 2:poi货架,3:poi营销货架                         poiid(poi营销货架): customPoiId                         筛选带人工排序的产品：manualSort | 否 |  |
| ▸▸▸value |  | string | 2 | 如果有多个,中间逗号分割 | 否 |  |
| ▸▸▸type |  | string | 3 | 过滤：FILTERED | 否 |  |
| ▸▸needProductAvailable |  | boolean | 3 | 校验产品有效，当为true 时，必传channelId,locale,否则校验报错 | 否 |  |
| ▸▸needActivityAvailable |  | boolean | 4 | 是否过滤活动时间 | 否 |  |
| ▸▸locale |  | string | 5 | 站点 大小写敏感 （例如zh-CN,en-HK等）(会筛选活动locale) | 否 |  |
| ▸▸channelId |  | int | 6 | 渠道  渠道中台二级渠道  （会筛选活动channelId） | 否 |  |
| ▸▸sort |  | int | 7 | 101 人工排序(召回集大时，有性能问题),0 或者不传默认排序 | 否 |  |
| ▸▸collapse |  | string | 8 | 折叠选项 | 否 |  |
| ▸▸checkStatus |  | int | 9 | 校验状态 0: 校验通过 1:校验不通过 (不传默认0:校验通过) | 否 |  |
| ▸▸promotionType |  | long | 10 | 优惠策略类型(0:优惠券 2:促销工具) | 否 |  |
| ▸▸promotionId |  | long | 11 | 优惠策略id(promotionType必传) | 否 |  |
| ▸▸pageIndex |  | int | 12 | 必传  从1开始 | 否 |  |
| ▸▸pageSize |  | int | 13 | 必传  默认20  上限50 | 否 |  |
| ▸returnFields |  | string | 5 | 必传                         返回资源或产品信息：product                         聚合目的地：location                         聚合景点：scenic                         国家：destinationCountry                         省份：destinationProvince                         地级市：destinationPrefectureCity                         县级市：destinationCountyCity | 否 |  |


**响应体（Response）**

| 字段名 | 短名 | 字段类型 | 编号 | 字段描述 | 必填 | 包名 |
|---|---|---|---|---|---|---|
| MarketingActivitySearchResponseType |  | MarketingActivitySearchResponseType | 0 |  | 否 | com.ctrip.tour.marketing.miactivity.contract |
| ▸ResultStatus |  | ResultStatusType | 1 | 业务响应类型 | 否 | com.ctrip.tour.marketing.miactivity.contract |
| ▸▸IsSuccess |  | boolean | 1 | 是否成功 | 否 |  |
| ▸▸errorCode |  | string | 2 | 错误编号 | 否 |  |
| ▸▸customerErrorMessage |  | string | 3 | 用户友好的错误信息 | 否 |  |
| ▸▸errorMessage |  | string | 4 | 错误信息 | 否 |  |
| ▸responseStatus |  | ResponseStatusType | 2 | 系统响应类型 | 否 | com.ctriposs.baiji.rpc.common.types |
| ▸▸Timestamp |  | dateTime | 1 |  | 否 |  |
| ▸▸Ack |  | AckCodeType | 2 | 附枚举值列表：Warning=2<br>PartialFailure=3<br>Success=0<br>Failure=1 | 否 | com.ctriposs.baiji.rpc.common.types |
| ▸▸Errors |  | List<ErrorDataType> | 3 |  | 否 | com.ctriposs.baiji.rpc.common.types |
| ▸▸▸Message |  | string | 1 |  | 否 |  |
| ▸▸▸ErrorCode |  | string | 2 | A unique code that identifies the particular error condition that occurred. | 否 |  |
| ▸▸▸StackTrace |  | string | 3 | ErrorDataType | 否 |  |
| ▸▸▸SeverityCode |  | SeverityCodeType | 4 | ErrorDataType<br>附枚举值列表：Warning=1<br>Error=0 | 否 | com.ctriposs.baiji.rpc.common.types |
| ▸▸▸ErrorFields |  | ErrorFieldType | 5 | ErrorDataType | 否 | com.ctriposs.baiji.rpc.common.types |
| ▸▸▸▸FieldName |  | string | 1 | ErrorFieldType | 否 |  |
| ▸▸▸▸ErrorCode |  | string | 2 | ErrorFieldType | 否 |  |
| ▸▸▸▸Message |  | string | 3 | ErrorFieldType | 否 |  |
| ▸▸▸ErrorClassification |  | ErrorClassificationCodeType | 6 | ErrorDataType<br>附枚举值列表：ServiceError=0<br>FrameworkError=2<br>SLAError=3<br>ValidationError=1 | 否 | com.ctriposs.baiji.rpc.common.types |
| ▸▸Build |  | string | 4 |  | 否 |  |
| ▸▸Version |  | string | 5 |  | 否 |  |
| ▸▸startTime |  | string | 5 | 发车时间 | 否 |  |
| ▸▸Extension |  | List<ExtensionType> | 6 |  | 否 | com.ctriposs.baiji.rpc.common.types |
| ▸▸▸Id |  | string | 1 | ExtensionType | 否 |  |
| ▸▸▸Version |  | string | 2 | ExtensionType | 否 |  |
| ▸▸▸ContentType |  | string | 3 | ExtensionType | 否 |  |
| ▸▸▸Value |  | string | 4 | ExtensionType | 否 |  |
| ▸▸responseDesc |  | string | 7 | 描述信息 | 否 |  |
| ▸▸userID |  | string | 9 |  | 否 |  |
| ▸▸msg |  | string | 10 |  | 否 |  |
| ▸▸ResponseCode |  | long | 11 | 响应编码（20000：成功） | 否 |  |
| ▸▸code |  | string | 12 |  | 否 |  |
| ▸▸reason |  | string | 13 |  | 否 |  |
| ▸items |  | List<ItemInfo> | 3 | 产品｜资源列表 | 否 | com.ctrip.tour.marketing.miactivity.contract |
| ▸▸itemId |  | long | 1 | 产品/资源ID | 否 |  |
| ▸▸categoryId |  | int | 2 | 二级品类ID | 否 |  |
| ▸▸systemId |  | int | 3 | 业务系统ID     1门票、2玩乐、3度假、4邮轮、8签证） | 否 |  |
| ▸▸productType |  | int | 4 | 产品类型    0产品、1资源 | 否 |  |
| ▸▸scenicIds |  | List<long> | 5 | 景点ID列表 | 否 |  |
| ▸▸customForm |  | string | 6 | map结构                             sortbit 排序位 1:第一位  2:第二位  3:第三位                             isforcedexposure 是否强制露出 	1:是                             例:{"sortbit":"1","isforcedexposure":"1","poiid":"0"} | 否 |  |
| ▸locations |  | List<long> | 4 | 聚合的目的地城市(酒店系)列表 | 否 |  |
| ▸scenicIds |  | List<long> | 5 | 景点聚合 | 否 |  |
| ▸total |  | int | 6 |  | 否 |  |
| ▸server |  | ServerType | 7 |  | 否 | com.ctrip.tour.marketing.miactivity.contract |
| ▸▸version |  | string | 1 |  | 否 |  |
| ▸▸variables |  | List<PairType> | 2 |  | 否 | com.ctrip.tour.marketing.miactivity.contract |
| ▸▸▸key |  | string | 1 |  | 否 |  |
| ▸▸▸value |  | string | 2 |  | 否 |  |
| ▸▸traces |  | List<PairType> | 3 |  | 否 | com.ctrip.tour.marketing.miactivity.contract |
| ▸▸▸key |  | string | 1 |  | 否 |  |
| ▸▸▸value |  | string | 2 |  | 否 |  |
| ▸filters |  | List<MarketingActivityFilterType> | 8 |  | 否 | com.ctrip.tour.marketing.miactivity.contract |
| ▸▸type |  | string | 1 | destinationCountry,destinationProvince,destinationPrefectureCity,destinationCountyCity等 | 否 |  |
| ▸▸items |  | List<MarketingActivityFilterItemType> | 2 |  | 否 | com.ctrip.tour.marketing.miactivity.contract |
| ▸▸▸type |  | string | 1 |  | 否 |  |
| ▸▸▸count |  | int | 2 |  | 否 |  |


### 附录3：[recommend](https://contract.mobile.flight.ctripcorp.com/#/operation-detail/5747/78/recommend?lang=zh-CN)

**Service Info**

- Name：用户交叉推荐查询服务
- AppId：100033295
- ServiceCode：22520
- ServiceName：recommendationqueryservice
- Owner：jieliangzhang
- Organization：用车

**请求体（Request）**

| 字段名 | 短名 | 字段类型 | 编号 | 字段描述 | 必填 | 包名 |
|---|---|---|---|---|---|---|
| IgtRecommendRequestType |  | IgtRecommendRequestType | 0 |  | 否 | com.ctrip.dcs.recommendation.query.interfaces.message |
| ▸requestHeader |  | RequestHeader | 1 | igt-请求头 | 否 | com.ctrip.igt |
| ▸▸language |  | string | 1 | 【废弃字段】语言【zh-cn：中文（简体），en-us：英文(美国)】 使用locale代替 | 否 |  |
| ▸▸host |  | string | 2 | 站点域名【hk.trip.com，www.trip.com，m.ctrip.com】 | 否 |  |
| ▸▸languageCode |  | string | 3 | 语言【en-英国，hk-香港】 | 否 |  |
| ▸▸locale |  | string | 4 | 站点本地语言【zh-cn：中文（简体），en-us：英文(美国)】 | 否 |  |
| ▸▸currency |  | string | 5 | 币种【cny-人民币,hkd-港币,eur-欧元,usd-美元,jpy-日元,krw-韩币,twd-台币,sgd-新币,gbp-英镑】 | 否 |  |
| ▸▸channelId |  | int | 6 | 渠道ID | 否 |  |
| ▸▸patternType |  | int | 7 | 产品形态 【17-接机，18-送机，55-点对点，23-按天包车，66-线路包车，88-定制包车】 | 否 |  |
| ▸▸patternGroup |  | int | 8 | 产品形态组【1718-接送机，55-点对点，23-按天包车，66-线路包车，88-定制包车】 | 否 |  |
| ▸▸businessType |  | int | 9 | 业务形态【32-国内，33-海外】 | 否 |  |
| ▸▸severFrom |  | string | 10 | 业务来源【online,h5,app】 | 否 |  |
| ▸▸cid |  | string | 11 | 客户端ID【online-客户端IP地址，无线-框架生成的客户端ID】 | 否 |  |
| ▸▸ubt |  | CommonUBTDTO | 12 | ubt相关参数 | 否 | com.ctrip.igt |
| ▸▸▸abtest |  | string | 1 | abtest版本，例如：M:4,160608_ind_phnum:A; | 否 |  |
| ▸▸▸pageid |  | string | 2 | 页面id | 否 |  |
| ▸▸▸pvid |  | string | 3 | pageview标识 | 否 |  |
| ▸▸▸sid |  | string | 4 | session 标识 | 否 |  |
| ▸▸▸vid |  | string | 5 | 网站用户身份标识 | 否 |  |
| ▸▸union |  | CommonAllianceDTO | 13 | 分销信息 | 否 | com.ctrip.igt |
| ▸▸▸aid |  | string | 1 | 主渠道ID | 否 |  |
| ▸▸▸sid |  | string | 2 | 副渠道ID | 否 |  |
| ▸▸▸ouid |  | string | 3 | 分销用户id | 否 |  |
| ▸▸▸mktinfo |  | string | 4 | 分销订单业绩采集信息 | 否 |  |
| ▸▸uid |  | string | 14 | 【用户明文UID】 | 否 |  |
| ▸▸ip |  | string | 15 | 客户端IP地址 | 否 |  |
| ▸▸ticket |  | string | 16 | online登录态 | 否 |  |
| ▸▸gps |  | CommonGPSDTO | 17 | 用户定位信息 | 否 | com.ctrip.igt |
| ▸▸▸lat |  | string | 1 | 定位经纬度 | 否 |  |
| ▸▸▸lng |  | string | 2 | 定位经纬度 | 否 |  |
| ▸▸▸cid |  | int | 3 | 定位城市id | 否 |  |
| ▸▸▸cnm |  | string | 4 | 定位城市名称 | 否 |  |
| ▸▸▸coord |  | string | 5 | 坐标系(WGS84/GCJ02/BD09) | 否 |  |
| ▸▸▸qcid |  | string | 6 | 定位q端城市id | 否 |  |
| ▸▸os |  | string | 18 | 手机系统【ios，android】 | 否 |  |
| ▸▸mode |  | string | 19 | 技术模式【h5,hybrid,crn,mini(小程序) | 否 |  |
| ▸▸wirelessVersion |  | decimal | 20 | 无线版本号(如7月31号发布7.6.2版本，【online：0，H5：0.0731,APP:7062.0731】) | 否 |  |
| ▸▸token |  | string | 21 | 鉴权标示 | 否 |  |
| ▸▸globalTraceId |  | string | 22 | 全局TraceId | 否 |  |
| ▸▸rmsToken |  | string | 23 | 风控所需token | 否 |  |
| ▸▸osVersion |  | string | 24 | 系统版本号【5.0】 | 否 |  |
| ▸▸did |  | string | 25 | 客户端机器设备ID【硬件标识】 | 否 |  |
| ▸▸appid |  | string | 26 | 应用id(携程APP-9999，IBUApp-37，去哪儿app-xx，小程序应用id-xx) | 否 |  |
| ▸▸miniProgram |  | CommonMiniProgramDTO | 27 | 小程序特殊参数 | 否 | com.ctrip.igt |
| ▸▸▸openid |  | string | 1 | 单个微信小程序上用户的唯一标识 | 否 |  |
| ▸▸▸unionid |  | string | 2 | 多个微信产品端使用相同的微信用户ID | 否 |  |
| ▸▸username |  | string | 28 | 用户名 | 否 |  |
| ▸▸accountId |  | string | 29 | 账户id | 否 |  |
| ▸▸accountType |  | string | 30 | 账户类型 | 否 |  |
| ▸▸accountName |  | string | 31 | 账户名称 | 否 |  |
| ▸▸source |  | string | 32 | 【废弃字段】来源：q, c, t | 否 |  |
| ▸▸plateForm |  | string | 33 | 【废弃字段】平台：H5 ，app，小程序 ，online | 否 |  |
| ▸▸clientType |  | string | 34 | 客户端类型：app（App客户端）、h5（手机浏览器）、miniprogram（小程序）、online（PC客户端）、openapi（API对接） | 否 |  |
| ▸▸platform |  | string | 35 | 平台：ctrip（携程）、qunar（去哪儿）、trip（Trip.com）、distribution（对外分销） | 否 |  |
| ▸▸miniType |  | string | 36 | 小程序类型【weixin(微信小程序), alipay(支付宝小程序), baidu(百度小程序), bytedance(字节小程序，包含头条,抖音), quick(快应用)】，若有未识别的小程序则值为空 | 否 |  |
| ▸schedules |  | List<IgtRecommendRequestScheduleDTO> | 2 | 旅行日程传参 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | int | 1 | 唯一标识 | 否 |  |
| ▸▸shelfNumber |  | string | 2 | 货架号：A/B/C/AC/BC/CA/CB | 否 |  |
| ▸flights |  | List<IgtRecommendRequestFlightDTO> | 3 | 机票推车传参 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | long | 1 | id信息 | 否 |  |
| ▸▸flightNumber |  | string | 2 | 航班号 | 否 |  |
| ▸▸scheduledDepartureTime |  | string | 3 | 航班出发时间(计划出发时间) yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸scheduledArrivalTime |  | string | 4 | 航班到达时间(计划到达时间) yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸departureAirportCode |  | string | 5 | 出发机场三字码 | 否 |  |
| ▸▸arrivalAirportCode |  | string | 6 | 到达机场三字码 | 否 |  |
| ▸▸departureTerminalCode |  | string | 7 | 出发航站楼(如果有就传) T1,T2 | 否 |  |
| ▸▸arrivalTerminalCode |  | string | 8 | 到达航站楼(如果有就传) T1,T2 | 否 |  |
| ▸▸productType |  | int | 9 | 17接机/18送机 | 否 |  |
| ▸▸needH5Domain |  | boolean | 10 | 是否需要H5的域名前缀，默认为false(只对qunar生效，其它的都会带域名前缀) | 否 |  |
| ▸▸showMarketing |  | RecommendCommonV2ShowMarketingCondition | 11 | 优惠信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.message |
| ▸▸▸couponCodes |  | List<string> | 1 | 优惠券券码列表 | 否 |  |
| ▸▸departureCityId |  | long | 12 | 起飞机场城市id | 否 |  |
| ▸▸arrivalCityId |  | long | 13 | 降落机场id | 否 |  |
| ▸▸flightWay |  | string | 14 | 航班类型(S:单程，D:往返，M:多程) | 否 |  |
| ▸▸journeyNo |  | string | 15 | 航程序号 | 否 |  |
| ▸▸segmentNo |  | string | 16 | 航段序号 | 否 |  |
| ▸▸passengerIds |  | List<long> | 17 | 乘客id | 否 |  |
| ▸▸departureTerminalId |  | long | 18 | 出发航站楼ID（携程机票数据源） | 否 |  |
| ▸▸arrivalTerminalId |  | long | 19 | 到达侧航站楼ID（携程机票数据源） | 否 |  |
| ▸trains |  | List<IgtRecommendRequestTrainDTO> | 4 | 火车票推车传参 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | long | 1 | id信息 | 否 |  |
| ▸▸trainNumber |  | string | 2 | 列车车次 | 否 |  |
| ▸▸scheduledDepartureTime |  | string | 3 | 列车发车时间(计划出发时间)  yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸scheduledArrivalTime |  | string | 4 | 列车到达时间(计划出发时间)  yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸departureStationCode |  | string | 5 | 出发火车站三字码 | 否 |  |
| ▸▸arrivalStationCode |  | string | 6 | 到达火车站三字码 | 否 |  |
| ▸▸productType |  | int | 7 | 17接站/18送站 | 否 |  |
| ▸hotels |  | List<IgtRecommen