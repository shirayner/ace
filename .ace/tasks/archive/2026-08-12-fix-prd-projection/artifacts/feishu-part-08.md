dRequestHotelDTO> | 5 | 酒店推车传参 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸key |  | long | 1 | key | 否 |  |
| ▸▸id |  | string | 2 | 酒店id信息 | 否 |  |
| ▸▸checkInTime |  | string | 3 | 酒店入住时间  yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸checkOutTime |  | string | 4 | 酒店离店时间  yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸name |  | string | 5 | 酒店名称 | 否 |  |
| ▸▸address |  | string | 6 | 酒店地址 | 否 |  |
| ▸▸latitude |  | decimal | 7 | 酒店纬度 | 否 |  |
| ▸▸longitude |  | decimal | 8 | 酒店经度 | 否 |  |
| ▸▸productTypes |  | List<int> | 9 | 23-打车,1617-接站,1618送站,1717接机,1718送机 | 否 |  |
| ▸▸channelId |  | int | 10 | 渠道号 为空则以requestHeader为准 | 否 |  |
| ▸▸redirectUrlPageType |  | string | 11 | 跳转页面 首页index_page 列表页product_page_priority，默认index页，当信息完整才会真正跳转列表页 | 否 |  |
| ▸▸hotelOrderId |  | string | 12 | 酒店订单id | 否 |  |
| ▸▸activityIds |  | List<int> | 13 | 活动id | 否 |  |
| ▸▸countryId |  | long | 14 | 订单国家id | 否 |  |
| ▸▸showMarketing |  | RecommendCommonV2ShowMarketingCondition | 15 | 优惠信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.message |
| ▸▸▸couponCodes |  | List<string> | 1 | 优惠券券码列表 | 否 |  |
| ▸▸coordinateType |  | string | 16 | 经纬度坐标类型：GCJ02、BD09、WGS84 | 否 |  |
| ▸▸needH5Domain |  | boolean | 17 | 是否需要H5的域名前缀，默认为false(只对qunar生效，其它的都会带域名前缀) | 否 |  |
| ▸indexes |  | List<IgtRecommendRequestIndexDTO> | 6 | 用车索引推荐传参 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | int | 1 | id信息 | 否 |  |
| ▸▸productType |  | int | 2 | 1617-接站,1618送站,1717接机,1718送机 | 否 |  |
| ▸▸needH5Domain |  | boolean | 3 | 是否需要H5的域名前缀，默认为false | 否 |  |
| ▸pois |  | List<IgtRecommendRequestPOIDTO> | 7 | poi推荐传参 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | long | 1 | id信息 | 否 |  |
| ▸▸poiId |  | long | 2 | poiId | 否 |  |
| ▸▸cityId |  | long | 3 | cityId | 否 |  |
| ▸▸poiType |  | long | 4 | 标识poiId标准 | 否 |  |
| ▸▸cityIdType |  | long | 5 | 标识cityId类型 | 否 |  |
| ▸▸productType |  | int | 6 | 1617-接站，1619-送站，1717-接机，1718-送机 | 否 |  |
| ▸▸useTime |  | string | 7 | 用车时间，yyyy-MM-dd HH:mm:ss。选填。 | 否 |  |
| ▸▸showMarketing |  | RecommendCommonV2ShowMarketingCondition | 8 | 优惠信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.message |
| ▸▸▸couponCodes |  | List<string> | 1 | 优惠券券码列表 | 否 |  |
| ▸passengerInfos |  | List<RecommendPassengerInfo> | 8 | 乘车人信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.message |
| ▸▸uchoseid |  | string | 0 | 常旅组件passengerId | 否 |  |
| ▸▸unm |  | string | 1 | 用户中文名称 | 否 |  |
| ▸▸ufstnm |  | string | 2 | 用户英文名称 | 否 |  |
| ▸▸ulstnm |  | string | 3 | 用户英文名称 | 否 |  |
| ▸▸utelad |  | string | 4 | 手机区号 | 否 |  |
| ▸▸utel |  | string | 5 | 手机号 | 否 |  |
| ▸▸age |  | int | 6 | 年龄（缺省情况下取birthday字段计算） | 否 |  |
| ▸▸birthday |  | string | 7 | 出生年月日（格式：yyyy-MM-dd HH:mm:ss） | 否 |  |
| ▸▸cardType |  | int | 8 | 乘机人证件类型 | 否 |  |
| ▸▸tel |  | string | 9 | 境内手机 | 否 |  |
| ▸▸id |  | long | 10 | id，passengerMapping中维护此id与航班的关联关系 | 否 |  |
| ▸liaisonInfos |  | List<RecommendLiaisonInfo> | 9 | 联系人信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.message |
| ▸▸nm |  | string | 1 | 联系人名称 | 否 |  |
| ▸▸telad |  | string | 2 | 联系人区号 | 否 |  |
| ▸▸tel |  | string | 3 | 联系人手机号 | 否 |  |
| ▸▸email |  | string | 4 | 联系人邮箱 | 否 |  |
| ▸▸utelad |  | string | 5 | 联系人境外手机区号 | 否 |  |
| ▸▸utel |  | string | 6 | 联系人境外手机号 | 否 |  |
| ▸qAuth |  | QAuth | 10 | qunar用户身份标识信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto.common |
| ▸▸sCookie |  | string | 1 | scookie | 否 |  |
| ▸▸username |  | string | 2 | username | 否 |  |
| ▸▸uuid |  | string | 3 | Qunar cookie登录态的token | 否 |  |


**响应体（Response）**

| 字段名 | 短名 | 字段类型 | 编号 | 字段描述 | 必填 | 包名 |
|---|---|---|---|---|---|---|
| IgtRecommendResponseType |  | IgtRecommendResponseType | 0 |  | 否 | com.ctrip.dcs.recommendation.query.interfaces.message |
| ▸responseStatus |  | ResponseStatusType | 1 | ctrip响应 | 否 | com.ctriposs.baiji.rpc.common.types |
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
| ▸responseResult |  | ResponseResult | 2 | igt-请求头 | 否 | com.ctrip.igt |
| ▸▸success |  | boolean | 1 | 是否成功 | 否 |  |
| ▸▸returnCode |  | string | 2 | 响应Code | 否 |  |
| ▸▸returnMessage |  | string | 3 | 响应信息 | 否 |  |
| ▸flights |  | List<IgtRecommendResponseRecommendDTO> | 3 | 机票推车响应 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | long | 1 | id信息 | 否 |  |
| ▸▸url |  | string | 2 | url | 否 |  |
| ▸▸productType |  | int | 3 | 17接机/18送机 | 否 |  |
| ▸▸originalAmount |  | decimal | 4 | 原始金额 | 否 |  |
| ▸▸minAmount |  | decimal | 5 | 优惠后金额 | 否 |  |
| ▸▸promotionAmount |  | decimal | 6 | 活动金额 | 否 |  |
| ▸▸promotionName |  | string | 7 | 活动名称 | 否 |  |
| ▸▸couponAmount |  | decimal | 8 | 优惠券金额 | 否 |  |
| ▸▸couponName |  | string | 9 | 优惠券名称 | 否 |  |
| ▸▸tips |  | string | 10 | 文案提示 | 否 |  |
| ▸▸couponTips |  | string | 11 | 券文案 | 否 |  |
| ▸▸rightTips |  | string | 12 | 权益文案 | 否 |  |
| ▸▸couponTag |  | int | 13 | 优惠券类型标识 0：普通券 1：专享券 | 否 |  |
| ▸▸vipType |  | int | 14 | 权益类型 0：超会 2：等级会员 | 否 |  |
| ▸▸vipLevelCode |  | int | 15 | 会员等级 20：铂金 30：钻石 35：金砖 40：黑钻 | 否 |  |
| ▸▸newCustomerTips |  | string | 16 | 新客宣传文案 | 否 |  |
| ▸▸flightStatus |  | int | 17 | 航班动态 1:起飞 2:到达3:延误4:取消 5:计划6:迫降 7:备降8:失事9:失联 0:未知 | 否 |  |
| ▸▸couponDeductionPercent |  | decimal | 18 | 百分比优惠券折扣比例 | 否 |  |
| ▸▸fixedDeductionAmount |  | decimal | 19 | 固定金额券优惠额 | 否 |  |
| ▸▸couponExpireDate |  | dateTime | 20 | 最大优惠券过期时间 | 否 |  |
| ▸▸arrivalAirport |  | string | 21 | arrivalAirport | 否 |  |
| ▸▸departureAirport |  | string | 22 | departureAirport | 否 |  |
| ▸▸deductionAmountLimit |  | decimal | 23 | 最大抵扣金额（百分比折扣券配置） | 否 |  |
| ▸▸couponPackTag |  | string | 24 | 券包标签文案 | 否 |  |
| ▸trains |  | List<IgtRecommendResponseRecommendDTO> | 4 | 火车票推车响应 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | long | 1 | id信息 | 否 |  |
| ▸▸url |  | string | 2 | url | 否 |  |
| ▸▸productType |  | int | 3 | 17接机/18送机 | 否 |  |
| ▸▸originalAmount |  | decimal | 4 | 原始金额 | 否 |  |
| ▸▸minAmount |  | decimal | 5 | 优惠后金额 | 否 |  |
| ▸▸promotionAmount |  | decimal | 6 | 活动金额 | 否 |  |
| ▸▸promotionName |  | string | 7 | 活动名称 | 否 |  |
| ▸▸couponAmount |  | decimal | 8 | 优惠券金额 | 否 |  |
| ▸▸couponName |  | string | 9 | 优惠券名称 | 否 |  |
| ▸▸tips |  | string | 10 | 文案提示 | 否 |  |
| ▸▸couponTips |  | string | 11 | 券文案 | 否 |  |
| ▸▸rightTips |  | string | 12 | 权益文案 | 否 |  |
| ▸▸couponTag |  | int | 13 | 优惠券类型标识 0：普通券 1：专享券 | 否 |  |
| ▸▸vipType |  | int | 14 | 权益类型 0：超会 2：等级会员 | 否 |  |
| ▸▸vipLevelCode |  | int | 15 | 会员等级 20：铂金 30：钻石 35：金砖 40：黑钻 | 否 |  |
| ▸▸newCustomerTips |  | string | 16 | 新客宣传文案 | 否 |  |
| ▸▸flightStatus |  | int | 17 | 航班动态 1:起飞 2:到达3:延误4:取消 5:计划6:迫降 7:备降8:失事9:失联 0:未知 | 否 |  |
| ▸▸couponDeductionPercent |  | decimal | 18 | 百分比优惠券折扣比例 | 否 |  |
| ▸▸fixedDeductionAmount |  | decimal | 19 | 固定金额券优惠额 | 否 |  |
| ▸▸couponExpireDate |  | dateTime | 20 | 最大优惠券过期时间 | 否 |  |
| ▸▸arrivalAirport |  | string | 21 | arrivalAirport | 否 |  |
| ▸▸departureAirport |  | string | 22 | departureAirport | 否 |  |
| ▸▸deductionAmountLimit |  | decimal | 23 | 最大抵扣金额（百分比折扣券配置） | 否 |  |
| ▸▸couponPackTag |  | string | 24 | 券包标签文案 | 否 |  |
| ▸hotels |  | List<IgtRecommendResponseHotelRecommendDTO> | 5 | 酒店推车响应 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸key |  | long | 1 | key | 否 |  |
| ▸▸originalAmount |  | decimal | 2 | 原始金额 | 否 |  |
| ▸▸minAmount |  | decimal | 3 | 优惠后金额 | 否 |  |
| ▸▸url |  | string | 4 | url | 否 |  |
| ▸▸newCustomer |  | boolean | 5 | 是否新客 | 否 |  |
| ▸▸marketingTag |  | string | 6 | 营销标签 | 否 |  |
| ▸▸cityId |  | int | 7 | 城市ID | 否 |  |
| ▸▸cityName |  | string | 8 | 城市名称 | 否 |  |
| ▸▸productType |  | int | 9 | 17接机/站,18送机/站 | 否 |  |
| ▸▸productGroup |  | int | 10 | 16火车站,17机场 | 否 |  |
| ▸▸airportCode |  | string | 11 | 机场三字码 | 否 |  |
| ▸▸airportName |  | string | 12 | 机场名称 | 否 |  |
| ▸▸terminalCode |  | string | 13 | 机场航站楼短名 T1,T2 | 否 |  |
| ▸▸stationName |  | string | 14 | 火车站名 | 否 |  |
| ▸▸stationCode |  | string | 15 | 火车站Code | 否 |  |
| ▸▸trainNo |  | string | 16 | 车次 | 否 |  |
| ▸▸couponTips |  | string | 17 | 券文案 | 否 |  |
| ▸▸rightTips |  | string | 18 | 权益文案 | 否 |  |
| ▸▸flightPlanDateTimeLocal |  | string | 19 | 航班预计时间 yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸terminalId |  | int | 20 | 航站楼id | 否 |  |
| ▸▸terminalName |  | string | 21 | 航站楼名 | 否 |  |
| ▸▸stationPlanDateTimeLocal |  | string | 22 | 火车预计时间 yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸distance |  | int | 23 | 距离（km）* | 否 |  |
| ▸▸duration |  | int | 24 | 时长（min）* | 否 |  |
| ▸▸flightNumber |  | string | 25 | 航班号 | 否 |  |
| ▸▸productsInfo |  | IgtRecommendResponseHotelProductsRecommendDTO | 26 | 询价接口条件 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸▸useTimeLocal |  | string | 1 | 用车时间 | 否 |  |
| ▸▸▸traffic |  | IgtRecommendResponseHotelProductsTrafficDTO | 2 | 行程信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸▸▸trafficFacilityNo |  | string | 1 | 航班号或者车次号 | 否 |  |
| ▸▸▸▸trafficFacilityType |  | int | 2 | 类型 1-航班 2-车次 | 否 |  |
| ▸▸▸▸departureLocalTime |  | string | 3 | 预计出发时间 yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸▸▸arrivalLocalTime |  | string | 4 | 预计到达时间 yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸▸▸planDptLocalTime |  | string | 5 | 计划到达时间 yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸▸▸planArrLocalTime |  | string | 6 | 计划到达时间 yyyy-MM-dd HH:mm:ss | 否 |  |
| ▸▸▸▸planDptAirportCode |  | string | 7 | 出发机场三字码 | 否 |  |
| ▸▸▸▸planArrAirportCode |  | string | 8 | 到达机场三字码 | 否 |  |
| ▸▸▸▸planDptTerminalId |  | int | 9 | 出发航站楼ID | 否 |  |
| ▸▸▸▸planArrTerminalId |  | int | 10 | 到达航站楼ID | 否 |  |
| ▸▸▸▸dptStationCode |  | string | 11 | 出发火车站code | 否 |  |
| ▸▸▸▸arrStationCode |  | string | 12 | 到达火车站code | 否 |  |
| ▸▸▸fixedLocation |  | IgtRecommendResponseHotelProductsFixedLocationDTO | 3 | 固定点 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸▸▸type |  | int | 1 | 固定点类型 1-机场 2-火车站 | 否 |  |
| ▸▸▸▸code |  | string | 2 | 固定点code type=1-->机场三字码 type=2--->火车站三字码 | 否 |  |
| ▸▸▸▸terminalId |  | int | 3 | 航站楼ID | 否 |  |
| ▸▸▸geo |  | IgtRecommendResponseHotelProductsGeoDTO | 4 | poi信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸▸▸longitude |  | decimal | 1 | 经度 | 否 |  |
| ▸▸▸▸latitude |  | decimal | 2 | 纬度 | 否 |  |
| ▸▸▸▸address |  | string | 3 | 地址名称 | 否 |  |
| ▸▸▸▸detailAddress |  | string | 4 | 详细地址 | 否 |  |
| ▸▸▸▸mapType |  | string | 5 | 唯一码来源（Google、Baidu、Gaode） | 否 |  |
| ▸▸▸▸coo