rdinateType |  | string | 6 | 经纬度类型 | 否 |  |
| ▸▸▸▸poiRef |  | string | 7 | 地址加密串-可代替其他字段信息独立传递 | 否 |  |
| ▸▸couponTag |  | int | 27 | 优惠券类型标识  0：普通券 1：专享券 | 否 |  |
| ▸▸vipType |  | int | 28 | 权益类型 0：超会 2：等级会员 | 否 |  |
| ▸▸vipLevelCode |  | int | 29 | 会员等级 20：铂金 30：钻石 35：金砖 40：黑钻 | 否 |  |
| ▸▸subTitle |  | string | 30 | 副标题 | 否 |  |
| ▸▸activityIds |  | List<int> | 31 | 活动id | 否 |  |
| ▸▸couponAmountLimit |  | decimal | 32 | 优惠券最大金额 | 否 |  |
| ▸indexes |  | List<IgtRecommendResponseIndexRecommendDTO> | 6 | 用车索引推荐响应 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | int | 1 | id信息 | 否 |  |
| ▸▸url |  | string | 2 | url | 否 |  |
| ▸▸productType |  | int | 3 | 1617-接站,1618送站,1717接机,1718送机 | 否 |  |
| ▸▸couponTips |  | string | 4 | 券文案 | 否 |  |
| ▸▸rightTips |  | string | 5 | 权益文案 | 否 |  |
| ▸▸couponTag |  | int | 6 | 优惠券类型标识  0：普通券 1：专享券 | 否 |  |
| ▸▸vipType |  | int | 7 | 权益类型 0：超会 2：等级会员 | 否 |  |
| ▸▸vipLevelCode |  | int | 8 | 会员等级 20：铂金 30：钻石 35：金砖 40：黑钻 | 否 |  |
| ▸▸couponExpireDate |  | dateTime | 9 | 最大优惠券过期时间 | 否 |  |
| ▸▸couponPackTag |  | string | 10 | 券包标签文案 | 否 |  |
| ▸pois |  | List<IgtRecommendResponsePoiRecommendDTO> | 7 | 用车poi推荐响应 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸id |  | long | 1 | id信息 | 否 |  |
| ▸▸url |  | string | 2 | url | 否 |  |
| ▸▸airportCode |  | string | 3 | 机场三字码 | 否 |  |
| ▸▸productType |  | int | 4 | 17接机/18送机 | 否 |  |
| ▸▸minAmount |  | decimal | 5 | 优惠后的起价金额 | 否 |  |
| ▸▸vipLevelCode |  | int | 6 | 会员等级 20：铂金 30：钻石 35：金砖 40：黑钻 | 否 |  |
| ▸▸vipType |  | int | 7 | 权益类型 0：超会 2：等级会员 | 否 |  |
| ▸▸extMap |  | string | 8 | 扩展字段 | 否 |  |
| ▸▸couponTips |  | string | 9 | 优惠券的宣传文案（译文） | 否 |  |
| ▸▸couponName |  | string | 10 | 优惠券名称 | 否 |  |
| ▸▸couponDeductionStrategyType |  | int | 11 | 优惠券类型，见 100033295 com.ctrip.dcs.recommendation.query.infrastructure.common.enums.DeductionStrategyType | 否 |  |
| ▸▸rightTips |  | string | 12 | 权益文案 | 否 |  |
| ▸▸newCustomerTips |  | string | 13 | 新客宣传文案 | 否 |  |
| ▸▸originalAmount |  | decimal | 14 | 原始起价金额 | 否 |  |
| ▸▸airportName |  | string | 15 | 机场名称 | 否 |  |
| ▸userProfile |  | UserProfile | 8 | 用户会员信息 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸memberLvl |  | int | 1 | 会员等级 | 否 |  |
| ▸▸ext |  | string | 2 | 扩展字段 | 否 |  |
| ▸▸memberRights |  | List<MemberRights> | 3 | 会员权益 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto |
| ▸▸▸count |  | int | 3 | 待使用次数，-1表示无限制 | 否 |  |
| ▸▸▸txt |  | string | 4 | 权益文案 | 否 |  |
| ▸▸▸title |  | string | 5 | 权益类型 | 否 |  |
| ▸▸▸subtypeTitle |  | string | 6 | 权益名称 | 否 |  |
| ▸dcRecommend |  | DcRecommend | 9 | DC组件推荐 | 否 | com.ctrip.dcs.recommendation.query.interfaces.dto.common |
| ▸▸criteria |  | string | 1 | DC组件询价入参（json字符串） | 否 |  |
| ▸▸passenger |  | string | 2 | 预订联系人信息（json字符串） | 否 |  |
| ▸▸extMap |  | string | 3 | 附加kv字段。目前有jsSrc，供H5动态升级 | 否 |  |
