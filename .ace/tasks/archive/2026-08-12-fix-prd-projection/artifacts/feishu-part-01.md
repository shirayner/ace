# 【PRD】会员页增加权益推荐模块


# 背景

> [!TIP]
> <strong>目标：</strong>
> 提升会员页面的大盘渗透UV，强化会员心智
> 会员页面MAU：在大盘占比整体从<strong>11.1% --> 12%</strong>，MAU <strong>210w-->227w</strong>
> - 完整对会员页的想法：[【PRD Demo】丰富会员页核心触点--增加多模块](https://trip.larkenterprise.com/docx/Id0qdKqDZojSVSx5ANGcdUmsnQb)

### 核心目标用户

- 近60天有待出行订单且该订单符合权益使用的用户

- 预计覆盖用户数：会员页40%的用户在来访会员页时有近60天内待出行的机酒火订单，<strong>dau维度预估覆盖2.4w人</strong>
	- 会员页来访用户中铂金及以上（有权益的用户）的占比：56%
		
		![识别的图片内容：图片为一张堆叠柱状图的截图，标题为“会员页面流量占比”，主要展示不同维度的流量占比情况。图表上方有筛选条件，包括“行：d”和“列：dim_ibugrade”，右侧有“重置”按钮。图表主体为多组堆叠柱状图，每组柱状图表示不同日期（如2026-05-06至2026-05-19），每个柱状图由多种颜色的区块组成，分别代表不同维度（如silver_ALL_app、gold_ALL_app、platinum_ALL_app等）。图例位于图表下方，标注了各颜色对应的维度名称。图表右侧有鼠标悬停显示的提示框，显示了2026-05-19的具体数据，包括各维度的名称及其对应的百分比值（如silver_ALL_app为20.73%、gold_ALL_app为22.83%等）。背景为白色，整体布局清晰，配色以绿色、橙色、黄色、蓝色、紫色等为主，右上角有“AI”标识。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ZWJmODE3OWJlMzRjMTg0N2YyODQzMGMxMWYyNjJkNjdfNGRmZTAzZDU2Y2M2MThhYjBmMzVjZjVhOWI5YjgwOTFfSUQ6NzY0MTkwNTQ4ODAyODAyNzg3MF8xNzg2NTQwODMzOjE3ODY2MjcyMzNfVjM)

	- 切片2026.5.20数据，未来60天内有待出行订单的用户数（产线限定机酒火）和订单数量分布
	<table>
<tr>
<td>会员页访问uv</td>
<td>未来60天有待出行订单uv</td>
<td>占比</td>
</tr>
<tr>
<td>105261</td>
<td>42129</td>
<td>0.4002337047909482</td>
</tr>
</table>
<table>
<tr>
<td>全等级访问uv</td>
<td>105261</td>
<td></td>
<td></td>
<td></td>
<td>仅筛选钻石+和黑钻用户</td>
<td></td>
<td>钻+和黑钻的访问人数</td>
<td>3637</td>
</tr>
<tr>
<td>订单笔数</td>
<td>人数</td>
<td>占比：有待出行单用户</td>
<td>占比：全等级访问uv</td>
<td></td>
<td>订单笔数</td>
<td>人数</td>
<td>占比：有单钻+和黑钻</td>
<td>占比：访问页面的钻+/黑钻</td>
</tr>
<tr>
<td>1</td>
<td>17505</td>
<td>0.415509506515702</td>
<td>0.166300909168638</td>
<td></td>
<td>1</td>
<td>610</td>
<td>0.241392956074397</td>
<td>0.167720648886445</td>
</tr>
<tr>
<td>2</td>
<td>10206</td>
<td>0.242255928220466</td>
<td>0.096958987659247</td>
<td></td>
<td>2</td>
<td>411</td>
<td>0.162643450732093</td>
<td>0.113005224085785</td>
</tr>
<tr>
<td>3</td>
<td>5241</td>
<td>0.124403617460657</td>
<td>0.0497905207056745</td>
<td></td>
<td>3</td>
<td>341</td>
<td>0.134942619707163</td>
<td>0.0937585922463569</td>
</tr>
<tr>
<td>4</td>
<td>3315</td>
<td>0.0786868902656128</td>
<td>0.031493145609485</td>
<td></td>
<td>4</td>
<td>263</td>
<td>0.10407597942224</td>
<td>0.0723123453395656</td>
</tr>
<tr>
<td>5</td>
<td>1943</td>
<td>0.0461202497092264</td>
<td>0.0184588784070073</td>
<td></td>
<td>5</td>
<td>199</td>
<td>0.0787495053423031</td>
<td>0.0547154248006599</td>
</tr>
<tr>
<td>6</td>
<td>1177</td>
<td>0.0279379999525268</td>
<td>0.0111817292254491</td>
<td></td>
<td>6</td>
<td>136</td>
<td>0.0538187574198655</td>
<td>0.0373934561451746</td>
</tr>
<tr>
<td>7</td>
<td>781</td>
<td>0.0185382990339196</td>
<td>0.00741965210286811</td>
<td></td>
<td>7</td>
<td>108</td>
<td>0.0427384250098932</td>
<td>0.0296948034094034</td>
</tr>
<tr>
<td>8</td>
<td>535</td>
<td>0.0126990908875122</td>
<td>0.00508260419338596</td>
<td></td>
<td>8</td>
<td>76</td>
<td>0.0300751879699248</td>
<td>0.0208963431399505</td>
</tr>
<tr>
<td>9</td>
<td>360</td>
<td>0.00854518265327921</td>
<td>0.00342007011143728</td>
<td></td>
<td>9</td>
<td>66</td>
<td>0.0261179263949347</td>
<td>0.0181468243057465</td>
</tr>
<tr>
<td>10+</td>
<td>1066</td>
<td>0.025303235301099</td>
<td>0.010127207607756</td>
<td></td>
<td>10+</td>
<td>317</td>
<td>0.125445191927186</td>
<td>0.0871597470442673</td>
</tr>
<tr>
<td>合计</td>
<td>42129</td>
<td>1</td>
<td>0.400233704790948</td>
<td></td>
<td>合计</td>
<td>2527</td>
<td>1</td>
<td>0.694803409403354</td>
</tr>
</table>
```sql
-- 会员页来访用户中，未来60天内有待出行订单的占比（2026-05-20）
WITH member_page_users AS (
  SELECT 
    uid
  FROM trip-ibu-bi-dw-etl.ibu_bi_dw_cdw.edw_usr_ubt_ibu_pageview
  WHERE 
    channeltype = 'app'
    AND d = '2026-05-20'
    AND page.p_pageid = '10320667530'
    AND iscrawler = 0
  GROUP BY uid
),

user_orders AS (
  SELECT 
    uid,
    orderid
  FROM trip-ibu-bi-dw-etl.ibu_bi_dw_cdw.edw_ord_ibu_order
  WHERE orderstatus <> 'C'
    AND DATE(startdate) > '2026-05-20'
    AND DATE(startdate) <= '2026-07-19'
    AND prdtype IN ('F','H','T','E')
  GROUP BY uid, orderid
)

SELECT 
  COUNT(*) AS total_member_page_users,
  COUNT(CASE WHEN o.uid IS NOT NULL THEN 1 END) AS users_with_upcoming_orders,
  COUNT(CASE WHEN o.uid IS NOT NULL THEN 1 END) / COUNT(*) AS pct_with_upcoming_orders
FROM member_page_users m
LEFT JOIN (
  SELECT DISTINCT uid FROM user_orders
) o ON m.uid = o.uid;

-- 会员页来访用户中，未来60天内待出行订单数分布（2026-05-20）
WITH member_page_users AS (
  SELECT 
    uid
  FROM trip-ibu-bi-dw-etl.ibu_bi_dw_cdw.edw_usr_ubt_ibu_pageview
  WHERE 
    channeltype = 'app'
    AND d = '2026-05-20'
    AND page.p_pageid = '10320667530'
    AND iscrawler = 0
  GROUP BY uid
),

user_order_count AS (
  SELECT 
    m.uid,
    COUNT(DISTINCT o.orderid) AS order_cnt
  FROM member_page_users m
  INNER JOIN trip-ibu-bi-dw-etl.ibu_bi_dw_cdw.edw_ord_ibu_order o
    ON m.uid = o.uid
  WHERE o.orderstatus <> 'C'
    AND DATE(o.startdate) > '2026-05-20'
    AND DATE(o.startdate) <= '2026-07-19'
    AND o.prdtype IN ('F','H','T','E')
  GROUP BY m.uid
)

SELECT 
  CASE 
    WHEN order_cnt = 1 THEN '1'
    WHEN order_cnt = 2 THEN '2'
    WHEN order_cnt = 3 THEN '3'
    WHEN order_cnt = 4 THEN '4'
    WHEN order_cnt = 5 THEN '5'
    WHEN order_cnt = 6 THEN '6'
    WHEN order_cnt = 7 THEN '7'
    WHEN order_cnt = 8 THEN '8'
    WHEN order_cnt = 9 THEN '9'
    ELSE '10+'
  END AS order_bucket,
  COUNT(*) AS user_count
FROM user_order_count
GROUP BY 
  CASE 
    WHEN order_cnt = 1 THEN '1'
    WHEN order_cnt = 2 THEN '2'
    WHEN order_cnt = 3 THEN '3'
    WHEN order_cnt = 4 THEN '4'
    WHEN order_cnt = 5 THEN '5'
    WHEN order_cnt = 6 THEN '6'
    WHEN order_cnt = 7 THEN '7'
    WHEN order_cnt = 8 THEN '8'
    WHEN order_cnt = 9 THEN '9'
    ELSE '10+'
  END
ORDER BY 
  MIN(order_cnt);

  -- Diamond+/black Diamond用户（level 5/6），未来60天内待出行订单数分布（2026-05-20）
WITH member_page_users AS (
  SELECT 
    uid
  FROM trip-ibu-bi-dw-etl.ibu_bi_dw_cdw.edw_usr_ubt_ibu_pageview
  WHERE 
    channeltype = 'app'
    AND d = '2026-05-20'
    AND page.p_pageid = '10320667530'
    AND iscrawler = 0
  GROUP BY uid
),

user_grade AS (
  SELECT 
    uid,
    ibugrade AS member_level
  FROM `trip-ibu-bi-dw-etl.ibu_bi_dw_cdw.edw_usr_mem_grade_d`
  WHERE d = '2026-05-20'
    AND ibugrade IN (5, 6)
),

user_order_count AS (
  SELECT 
    m.uid,
    COUNT(DISTINCT o.orderid) AS order_cnt
  FROM member_page_users m
  INNER JOIN user_grade g ON m.uid = g.uid
  INNER JOIN `trip-ibu-bi-dw-etl.ibu_bi_dw_cdw.edw_ord_ibu_order` o
    ON m.uid = o.uid
  WHERE o.orderstatus <> 'C'
    AND DATE(o.startdate) > '2026-05-20'
    AND DATE(o.startdate) <= '2026-07-19'
    AND o.prdtype IN ('F','H','T','E')
  GROUP BY m.uid
)

SELECT 
  CASE 
    WHEN order_cnt = 1 THEN '1'
    WHEN order_cnt = 2 THEN '2'
    WHEN order_cnt = 3 THEN '3'
    WHEN order_cnt = 4 THEN '4'
    WHEN order_cnt = 5 THEN '5'
    WHEN order_cnt = 6 THEN '6'
    WHEN order_cnt = 7 THEN '7'
    WHEN order_cnt = 8 THEN '8'
    WHEN order_cnt = 9 THEN '9'
    ELSE '10+'
  END AS order_bucket,
  COUNT(*) AS user_count
FROM user_order_count
GROUP BY 
  CASE 
    WHEN order_cnt = 1 THEN '1'
    WHEN order_cnt = 2 THEN '2'
    WHEN order_cnt = 3 THEN '3'
    WHEN order_cnt = 4 THEN '4'
    WHEN order_cnt = 5 THEN '5'
    WHEN order_cnt = 6 THEN '6'
    WHEN order_cnt = 7 THEN '7'
    WHEN order_cnt = 8 THEN '8'
    WHEN order_cnt = 9 THEN '9'
    ELSE '10+'
  END
ORDER BY 
  MIN(order_cnt);
```

> reference：[会员页数据摸排](https://trip.larkenterprise.com/wiki/WFxRwlenPicO9EkDhOhcoHIBnOe)
> 多目的地的用户：
> - 行程页用户中，60.3%的用户一趟旅行有2个以上目的地
> - 行程页用户中20.6%有2趟及以上的旅行

- 同时用户在下单后也有权益使用的诉求，目前入口较深找不到

> iq参考：http://iquality.ctripcorp.com/details?taskId=34572007&pid=undefined

# 主要思路

采用<strong>权益挂靠行程</strong>方案，分为两层交互结构：

<table>
<tr>
<td>层级</td>
<td>组件</td>
<td>作用</td>
</tr>
<tr>
<td>第一层</td>
<td>旅行卡片（入口组件）</td>
<td>会员主页露出，展示用户未来行程摘要，吸引点击</td>
</tr>
<tr>
<td>第二层</td>
<td>行程浮层</td>
<td>点击卡片后弹出，展示行程详情 + 权益推荐</td>
</tr>
</table>
### 涉及权益（按展示优先级排序）

1. 休息室（Airport Lounge）

2. 免费门票（Free Attraction Ticket）

3. 免费eSIM（Free Global eSIM）

4. 接送机升级（Airport Transfer Upgrade）

### 涉及页面

1. <strong>会员主页</strong> — Tier Rewards 区域嵌入旅行卡片入口

2. <strong>行程浮层</strong> — 点击卡片后出现，承载行程信息 + 权益推荐

3. <strong>休息室权益详情页</strong> — 页面第一屏展示可订航段浮层

### 整体流程图

# AB实验

- 实验号：260624_IBU_MemBenefit

- 实验人群：满足模块展示条件的用户（有权益 + 有符合条件的行程）

- 对照组：不展示模块

- 实验组：展示模块和浮层

- 主测指标：使用会员权益的订单数

- 观测指标：
	- 全产线订单量-累计
	- 会员页人均访问次数
	- 会员页人均停留时长
	- 实验组vs对照组用户D30回访率

# 产品需求

> [!TIP]
> UI稿：https://www.figma.com/design/ADdYufM8o45CmrjqZBCUGA/2026-H1-2025-H2_APP_Trip.com-Rewards-Page?node-id=19269-115107&p=f&t=PAPdclqyBZxtWiru-0

## 会员主页

### 入口--组件模块

#### 位置

1. 当用户有符合条件的旅行卡片时，露出在权益说明的上方

2. 仅展示在当前等级内

#### 数据来源

<strong>公共行程聚合接口</strong>：[行程接口字段说明](https://trip.larkenterprise.com/wiki/Mj8Hw09jWitXbhkYMOgcm9sAnBd)

> 旅行聚合现有能力：将用户不同产线的未来订单（机票、酒店、火车等）聚合为一段完整"旅行"
> - 示例：用户有伦敦的机票订单 + 伦敦的酒店订单 → 聚合为"伦敦之旅"
> 2026.5.21沟通后：因为会员这会将旅行中的目的地数据单独拆出来做聚合，本质上是拿待出行行程，聚合能力在这里并没有用上。所以需求改为依赖公共的底层<strong>行程接口</strong>进行数据处理，不包含旅行打包逻辑。

- 会员入参：uid

- 期望返回：用户未来的所有待出行行程，城市id都使用酒店系
	- 酒店：
		- 订单id
		- 具体酒店
		- 开始时间
		- 退场时间
		- 结束时间
		- 目的地城市id
		- 国家id
	- 机票行程信息（颗粒度落到航段）
		- <strong>订单号、订单区域类型、支付币种、订单所属产线（bundle、flight）</strong>
		- 航班号
		- 航段的出发机场-三字码
		- 航段的到达机场-三字码
		- 航段的出发城市、国家
		- 航段的到达城市、国家
		- 航段出发、落地时间 -->下发时间戳？是否有时区概念，机票上的时区or当前系统的时区？
		- 航段开始、结束时间
		- 机票乘客数
	- 火车：
		- 订单号
		- 开始时间
		- 结束时间
		- 退场时间
		- 出发站
		- 到达站
		- 出发城市id、所属国家id
		- 到达城市id、所属国家id
	- 跟团游/私家团
		- 订单号
		- 开始时间
		- 结束时间
		- 出发、到达城市id，所属国家id -->出发城市暂时给不到
		- 途径城市、途径国家 -->行程接口暂时给不到
	- <del>邮轮</del> 
		- <del>开始时间</del>
		- <del>结束时间</del>
		- <del>出发城市id、所属国家id</del>
		- <del>到达城市id、所属国家id</del>
		- <del>出发港口</del>
		- <del>到达港口</del>
		- <del>班期 ID（SailingID）</del>
		> -->不需要邮轮的原因：
> ![识别的图片内容：这是一张表格截图，表格标题为“权益 对邮轮用户的适用性”，表格分为两列，左列为权益类型，右列为适用性说明。左列包括“休息室”“接送机”“免费门票”“免费eSIM”，右列分别对应以下内容：“休息室：需要机票航段，纯邮轮订单没有航段”；“接送机：需要机票订单，同上”；“免费门票：理论上挂靠港口城市可以用，但靠岸时间短（8-12h），实际使用率极低”；“免费eSIM：海上无信号，靠岸时间短，实用性差”。表格整体为浅灰背景，文字为黑色，部分内容使用红色叉号、黄色感叹号标注，表格边框为细线分隔。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ODM5NjkxMDM0ZDFkYjdjODE2YzVkYjBjMjcyNDdiODVfNzQ1YmFmMzlmMWExODMzNzNkMTc5NGNkNjJlYTAzYzNfSUQ6NzY0MjYwMDYyMjIwNTc4MzIzOF8xNzg2NTQwODMzOjE3ODY2MjcyMzNfVjM)

	- <del>船票</del>
		- <del>开始时间</del>
		- <del>结束时间</del>
		- <del>出发城市id、所属国家id</del>
		- <del>到达城市id、所属国家</del>
		> -->不需要船票的原因：
> 1. 覆盖面太窄了（此前年报在数据摸排的时候已将船票去除），为了极少数能命中的 case 加一个订单类型进判断池
> 2. 大多船票为上岛船票（印尼海岛跨境船票 ：如佩妮达岛、蓝梦岛的上岛船票），free ticket覆盖少
> 3. 港澳或广州-香港的船票，用户大多是通勤需求，旅行需求许多人会坐高铁，被火车覆盖
	

#### 模块露出逻辑

- 模块出现逻辑：
	1. 行程过滤：
		1. 仅保留有<strong>机票、酒店、火车、跟团游/私家团</strong>订单的待出行行程
		2. 仅保留开始时间在30天内的旅行（旅行开始日期<=访问当日的30天），时间戳判断
			1. <strong>“30天”这个信息做成配置项，不写死</strong>
	2. 在完成旅行过滤后，用户至少有1个旅行 <strong>且 </strong>旅行中至少有1个可用的会员权益
	>  旅行可能只由"附属型"订单构成（如只有租车、只有餐厅、只有接送机），这些场景下盲目推权益没有意义
> ![识别的图片内容：图片为截图，内容为表格形式，背景为深色，文字为浅色，整体对比度较高。表格分为三列，分别为“类型”“产线”和“含义”，每列包含两行数据。第一行的“类型”为“主订单”，“产线”为“机票、酒店、火车、船票、邮轮、跟团游/私家团”，“含义”为“能独立确认‘用户会去某个目的地’”。第二行的“类型”为“附属订单”，“产线”为“租车、接送机、玩乐、餐厅”，“含义”为“依附于主行程，单独存在时目的地或出行意图不够明确”。表格线条简洁，文字对齐整齐，未见其他界面元素或装饰。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=NzY4YmUxOWQyYjJkNWIyYzdhZTExOGQ3NjgxZDE1M2ZfYzY1ZGJkYTgyNzg0NDczYjczNDg2YTdhZDE3ZDFmOThfSUQ6NzYzOTYzNzE3MDUwOTA0MDYwN18xNzg2NTQwODMzOjE3ODY2MjcyMzNfVjM)


#### 模块信息

1. 组件信息：

<table>
<tr>
<td>模块内容<br/></td>
<td>逻辑<br/></td>
<td>交互样式<br/></td>
</tr>
<tr>
<td>基础信息<br/></td>
<td>- 组件标题	- shark key固定文案，突出未来一段时间内的待出行行程可用的rewards <br/>- 卡片标题：shark key，动态参数：	- 目的地名称：		1. 对所有通过30天窗口过滤的行程，逐条判断4个权益的可用性		2. 筛出“有可用权益的行程”的行程		3. 从这些行程中取目的地城市，去重后按行程开始时间从早到晚排列	- 最多露出2个目的地，超过3个时使用“,and more”的表达<br/>- 卡片副标题：shark key	- 动态参数：		- 可用的权益类型数，最多4个，至少1个<br/>- 插画图片：取开始时间最近的“有可用权益的行程”的目的地图片，接口无url返回，顺位取第二个目的地	- City id调图片接口：[http://contract.mobile.flight.ctripcorp.com/#/operation-detail/1285/89/districtGlobalizationDetail?lang=zh-CN（契约详情见附录1）](http://contract.mobile.flight.ctripcorp.com/#/operation-detail/1285/89/dis