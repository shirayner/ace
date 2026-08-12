rovince的名称）</strong>			- 特殊处理中国非港澳台的province：<strong>统一露出为“中国内地”</strong> --&gt;要单独提shark<br/><br/>- <u>接送机车型免费升级</u>	- 露出条件：		- 必须有待出行的机票行程		- 航班号可查到接送机跳转链接			- <del>即：机票订单挂靠的旅行出发城市或目的地城市是否在接送机的可用范围内（</del><del>传订单order id由接送机来判断是否可以推荐权益--&gt;他们做不到，导流接口只判断了用户是否有权益）</del>			- 调接送机导流接口，入参航班，返回了url代表该航班有接送机业务覆盖和推荐，取第一条返回链接				- 接送机导流接口：RecommendationQueryService.recommend				- 接口契约：https://contract.mobile.flight.ctripcorp.com/#/operation-detail/5747/78/recommend?lang=zh-CN（契约详情见附录3）		- 用户账户内有权益剩余次数		- 未到行程的<strong>退场时间</strong>		- 去除中转航段的目的地城市		![识别的图片内容：图片为界面截图，包含表格和文字说明，主要内容为“segmentNo与sequenceNo举例”的说明，展示了一个单程S的航线示例，航线为香港(HKG)到上海(PVG)再到北京(PEK)。表格中列出了物理航段、segmentNo、sequenceNo和航线的对应关系，物理航段1对应segmentNo为1、sequenceNo为1，航线为HKG→PVG；物理航段2对应segmentNo为1、sequenceNo为2，航线为PVG→PEK。顶部有红色文字“去除pvg所在的城市‘上海’”，底部说明中提到中转时segment相同，sequence递增。界面整体为白底，文字以黑色为主，部分文字为红色强调，表格线条清晰，布局简洁。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=MWU5NmE4Y2E4NGZjZTgzMDdjODIyOWUyZmI4MGM0ZTNfNWRhMGIzMjk4Y2E4NGJiZTMxNTUzOGQ3OTBjYjRlOWVfSUQ6NzY0NDkwNzYxMzA5MTk0MTMxMl8xNzg2NTQwODM0OjE3ODY2MjcyMzRfVjM)	- 露出信息		- 主标题：固定文案，shark key		- 副标题：露出待出行的机票行程的到达城市名称和出发城市名称，去重			- 去除同一个“去程”中的重复出发/到达城市				- eg. 上海-吉隆坡-珀斯，吉隆坡为中转城市，拆成了2个航段（上海-吉隆坡，吉隆坡-珀斯），打上了相同去程的标识，将吉隆坡去除，不露出该城市			- 城市数超过3个时，使用“, and more”的表达			- 排序：开始时间更早的航段的出发城市--&gt;到达城市	- 跳转链接：接送机接口返回的链接  --&gt;会员这没区分接机or送机，接送机接口处理了优先级的逻辑，取第一个<br/></td>
</tr>
</table>

### 权益使用后

<table>
<tr>
<td><strong>权益类型</strong><br/></td>
<td><strong>使用后浮层行为</strong><br/></td>
<td><strong>入口卡片行为</strong><br/></td>
</tr>
<tr>
<td>休息室<br/></td>
<td>1. 该航段从列表中移除，剩余次数 -1<br/>2. 航段结束后，该航段item消失<br/>3. 当剩余次数=0，不展示休息室模块<br/></td>
<td rowspan="4">单次权益使用后无变化，入口的露出逻辑和文案逻辑只有在权益种类变化或旅行变化时才变化，当权益全部耗尽时，入口消失<br/><br/></td>
</tr>
<tr>
<td>免费门票<br/></td>
<td>1. 该城市信息保留（用户可为他人预订或订其他景点）， 剩余次数 -1<br/>2. 当该目的地的行程结束后，目的地城市消失<br/></td>
</tr>
<tr>
<td>免费eSIM<br/></td>
<td>1. 该国家行保留，剩余次数 -1<br/>2. 当该目的地的行程结束后，目的地城市消失<br/></td>
</tr>
<tr>
<td>接送机升级<br/></td>
<td>1. 该出发、到达城市信息保留（接送机可能需要多次），剩余次数 -1<br/>2. 当该目的地的行程结束后，目的地城市消失<br/></td>
</tr>
</table>

## 休息室权益详情页 -->下迭代做[【PRD】休息室详情页增加可用航段](https://trip.larkenterprise.com/docx/OE5Yd2kPEogmNuxJ0YNcliJQnGh)

1. 后端逻辑：筛选未来30天（和主页的qconfig走一个配置）的待出行机票行程，露出所有可用休息室的航段

2. 前端新增航段卡片，归属在可用休息室次数下

3. 不开ab实验，全量

4. ui稿：https://www.figma.com/design/ADdYufM8o45CmrjqZBCUGA/2026-H1-2025-H2_APP_Trip.com-Rewards-Page?node-id=20393-164555&p=f&t=0HKsjGOJ0d9ieBhp-0

<table>
<tr>
<td>逻辑<br/></td>
<td>交互<br/></td>
</tr>
<tr>
<td>- 休息室无可用航段	- 无航段展示，btn跟随权益，点击跳转至机票首页<br/>- 休息室有可用航段	- 平铺展示每个航段，信息包括：	- 最多展示3个，超过3个航段折叠	- 点击跳转至该航段的补订页	- 消失逻辑：		- 起飞时间&lt;=60min时不露出该航段<br/>- 高端休息室场景：	- 高端休息室和普通休息室分别展示各自可用的航段（当一个航段两个休息室同时可用时，会展示2次）	- 高端休息室有航段可用时，折叠普通休息室的航段<br/>- FAQ：使用线上已有的页面，锚定至休息室权益的FQA，	- 单独再加一段<br/>![识别的图片内容：这是一张手机屏幕截图，显示了一个应用程序的界面，主要内容为“常见问题”页面，顶部有时间“15:36”、返回按钮和标题“常見問題”，右上角显示电池电量为71%。页面分为多个折叠卡片，当前展开的部分为“免費使用機場貴賓休息室”，卡片内有标题和详细说明文字，解释了通过Trip.com预订机票可享受免费使用机场贵宾休息室的礼遇，并列出了无法享受该礼遇的可能原因，内容以编号列表的形式呈现。页面整体采用白色背景，文字为黑色，部分标题和标签为蓝色，界面简洁明了，主要以文字信息为主。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ZDZmNjIzNzAzZmYwY2NkNjVmM2NmNDExODNiNjkyN2ZfYzAyYjkxNTRlMGE0YWVhOGQ5MDhjYjE5NzVkYjI1YzNfSUQ6NzY0ODkyNjUxMjc4MTA1Mjg3OF8xNzg2NTQwODM0OjE3ODY2MjcyMzRfVjM)<br/>- 将休息室次数的说明文案归入info内，点击info出弹窗内容	<br/></td>
<td>![识别的图片内容：图片为界面设计截图，展示了一个关于机场贵宾厅访问权限的功能页面，整体风格简洁现代，主要色调为白色和灰色，布局清晰。左侧为“Before”版本，右侧为“After”版本，分为默认状态和展开状态。顶部显示导航栏，包括返回按钮、标题“My Rewards”以及时间和电池状态图标。主要内容为“Free Airport VIP Lounge Access”功能，描述了用户当前等级为“Black Diamond”，并提供贵宾厅访问次数和详细信息。界面包含两个主要模块：“VIP Lounge Access”和“Prestige VIP Lounge Access”，分别显示剩余次数、详细信息按钮以及使用按钮。展开状态下，显示具体的贵宾厅信息，包括机场名称、日期、时间、服务描述、价格以及选择按钮。底部为“如何使用”说明，列出步骤和详细信息按钮。界面元素包括按钮、列表、标签、图标和文字说明，整体布局以卡片形式排列，信息层次分明。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=YmFiOWNjZDhmZTJkOWU5MjZhZDBkM2NiYjRmMGEzMGVfZjAxYTEyMzYwMzllZTJhODEyYTRkNzQ5MWVkZTk3ZWJfSUQ6NzY0NDEyNjc4MTI1MTczNDQ2OV8xNzg2NTQwODM0OjE3ODY2MjcyMzRfVjM)<br/>![识别的图片内容：根据提供的图片内容，以下是对其的结构化描述：

图片展示了一个移动应用界面设计的对比图，分为“Before”和“After”两个部分，主要内容为“Free Airport VIP Lounge Access”功能的界面优化。Before部分显示了旧版界面，顶部为标题“My Rewards”，下方展示了用户当前的会员等级“Platinum”，并列出“VIP lounge access”的相关信息，包括“1 time left/1 total”，以及“Book and Use”按钮。页面底部显示了“Member tier rewards”模块。After部分展示了优化后的界面，顶部仍为“My Rewards”，但整体设计更简洁，配色以黑白为主。页面中间新增了一个弹窗，列出了具体的VIP休息室信息，包括机场名称、开放时间、价格等，并提供“Select”按钮。右侧进一步展示了详细信息页面，包含FAQ和“Benefit Source & Expiration”弹窗，解释了权益来源和有效期。整体布局更加清晰，信息层次分明，交互设计更为直观。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=MjE2ZTliMDRhMTZlNjI1NDFkZGM0Njc2YjYxMzFhMDJfMDVlMmU4OTE2NWRlZGI2ZjA0MTExZWNiN2I5ZTIzNGRfSUQ6NzY0NDEyNjg2OTMxNTQ1NTk2Nl8xNzg2NTQwODM0OjE3ODY2MjcyMzRfVjM)<br/><br/></td>
</tr>
</table>

## 权益中台&会员等级需求：

### 增加航段维度休息室可用判断

> 目前行程卡片调的接口已可以判断机票订单中哪段航段可以用什么类型的休息室

选填传入，入参机票行程查询该行程是否有休息室可预定

1. 上游传入：订单号、订单区域类型、支付币种、订单所属产线

2. 对下游返回： 航段号+休息室信息+休息室类型（高端/普通）

### 增加接送机可用判断

> - <strong>免费升舱权益信息：</strong>
	1. 接送机接口关于会员权益的判断没有深到“权益的使用范围”
	2. t站的接送机权益覆盖范围=接送机业务覆盖范围，c站有服务商的使用限制，t没有
> - <strong>接送机接口情况</strong>
	- <strong>接送机范围</strong>：跨城接送机以机场为主，可以跨城，<strong>接送机的出发或到达一定是机场</strong>；T站没有火车接送站，C站有火车接送站场景。
	- <strong>酒店接送机</strong>：酒店可以做接送机推荐，但目前做得不精确，若入参是酒店，会反查用户机票，若机票和酒店能匹配则做推荐。
> - <strong>行程权益查询</strong>
	- <strong>信息提供</strong>
		- 航班信息：查询用户权益需判断行程是否有接送机覆盖，提供信息最好有航班号，更精确。
		- 火车车次：火车入参给列车车次。
	- <strong>行程筛选</strong>：若直接筛选好行程，仅提供入参机票；询问提供航班号时是否会返回两段信息。
> - <strong>跳转链接参数</strong>
	- <strong>链接信息</strong>：推荐逻辑只返回一个跳转地址，可能有接和送两个锚点，内部处理逻辑；跳转链接带机票、城市、航班、成人数、儿童数等信息。
	- <strong>中转订单处理</strong>：中转会忽略，不进行推荐，如北京到上海再到广州，上海中转不做推荐，会忽略中间的接和送。
> - <strong>多程行程推荐</strong>
	- <strong>推荐规则</strong>
		- C站规则：C站多程行程目前只推最近的一个接和送。
		- 特殊情况：若过平均两个航班且首航班过出发时间，推首航班的接和次航班的送，无往返逻辑。
	- <strong>请求方式</strong>：往返和多程航班号不同时，发多段或一段请求均可。
> - <strong>CMT对接逻辑</strong>
	- <strong>推荐方式</strong>：CMT以目的地城市做推荐，不提供机票信息，只给城市ID，接送机会自己补充“热门机场”逻辑，但不够精确。
	- <strong>请求情况</strong>：CMT发两段分别用于接机和送机城市，接送机会补热门机场作为出发或到达机场。
> 接送机产品：
> 1.用户有机票，你们入参机票信息，我们自己反查酒店，不管有没有酒店，都会给你返回url（只要有资源覆盖）
> 2.用户有酒店，你们入参酒店信息，我们自己反查机票，不管有没有机票，也都会给你返回url（这个要改造接口支持）-->权益中台角度考虑，需要有机票才返回

> [!TIP]
> 接送机导流接口：RecommendationQueryService.recommend
> 接口契约：https://contract.mobile.flight.ctripcorp.com/#/operation-detail/5747/78/recommend?lang=zh-CN（契约详情见附录3） 
	- 研发：@ou_15664c3e9028dd8385038e4e41a41e82
	- 产品：@ou_89dafff33693403ddcee53be907bd3dc


- 权益中台和接送机接口的交互：
	- url的逻辑

<table>
<tr>
<td>权益中台可以给的入参<br/></td>
<td>拿接送机的核心信息<br/></td>
</tr>
<tr>
<td>1. 航班五要素	1. 航班号、出发到达的三字码和时间<br/>2. 旅行的到达城市city id<br/>3. 旅行的出发城市city id<br/>4. 订单id<br/>5. 机票订单的人数<br/></td>
<td>1. 跳转链接	1. 链接中会处理人数、起落预填<br/>2. 权益信息<br/><br/></td>
</tr>
</table>

- 下游和权益中台的交互：
	- 依靠use limit字段承接
	<table>
<tr>
<td>下游可入参<br/></td>
<td>权益中台出参<br/></td>
</tr>
<tr>
<td>机票<br/>1. 航班号：必填<br/>2. 出发时间和到达时间：必填<br/>3. 出发和到达机场三字码：必填<br/>4. 出发和到达城市id：是否必传？<br/>5. 接送机type：选填<br/>酒店 --&gt;T没有机票的话<br/>6. 酒店id：必填<br/>7. 酒店入离时间：必填<br/>8. 接送机type：选填<br/>poi<br/>9. City id：必填<br/>10. 用车时间：必填<br/>11. 接送机type：选填<br/></td>
<td>1. Url<br/>2. 权益是否可用的判断中增加业务是否覆盖的判断<br/><br/></td>
</tr>
</table>

coupon信息cmt怎么拿

入参member right和coupon+productline

# Shark key

<table>
<tr>
<td>位置<br/></td>
<td>示意<br/></td>
<td>要求<br/></td>
<td>cw文案<br/></td>
<td>appId<br/></td>
<td>Shark key<br/></td>
</tr>
<tr>
<td>入口-组件大标题<br/></td>
<td>![识别的图片内容：这是一张手机应用界面的截图，整体风格简洁现代，主要以蓝色和白色为主色调，顶部显示时间为9:41，右上角有信号、电池等状态栏图标。界面顶部显示“Trip.com REWARDS”标志，下方为“Diamond+”等级标识及当前等级说明，右侧有一个钻石形状的图标。页面中部显示升级到“Black Diamond”所需的消费金额和截止日期，进度条显示当前消费进度，旁边有一个信封图标。下方有“Great News! Black Diamond Level is now available”的提示信息。页面进一步显示“Rewards for Upcoming Trips”标题，列出“Trip to Tokyo and London”相关奖励信息，包括“4 rewards ready for your trip”，并附有相关图标和图片。底部显示“Diamond+ Benefits”标题，标注有“x9”，列出“Free Airport VIP Lounge Access”及“5-time free access”说明，并配有相关图标。整体布局清晰，分区明确，主要信息通过标题和图标进行强调。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=YWYwYzE0MDA0ZDc1OWE0MmZkNmFkMjBmNDZhZWQ1MDNfZDE1NjI4Nzc4OTgxMzlkMWQ0NTBjZjBmMDA1ZmU3ZDhfSUQ6NzY0NjcxNTkwODU1OTMyNjQ0MV8xNzg2NTQwODM0OjE3ODY2MjcyMzRfVjM)<br/></td>
<td>1. 告知用户这是未来一段时间内的行程可用的权益（暂定是30天）<br/>2. 突出行程中可用的权益，而不是行程本身<br/><br/></td>
<td>Rewards for your upcoming trip<br/><br/></td>
<td rowspan="8">100024399<br/></td>
<td>Trip_Reward_Component_Module_Title<br/></td>
</tr>
<tr>
<td>入口-组件标题<br/></td>
<td>![识别的图片内容：这是一张移动应用界面的截图，主要展示了Trip.com的奖励计划页面，整体风格简洁现代，主色调为蓝色。顶部显示时间为9:41，右上角有信号、电池图标和一个问号按钮，左上角有返回箭头。页面标题为“Trip.com REWARDS”，下方显示用户当前等级“Diamond+”，并附有钻石图标和等级进度条，进度条上有多个节点，当前节点为Diamond+。主要内容包括“Spend over $620 and receive invitation by Jan 20, 2025 to unlock Black Diamond”，并显示消费进度为“US$10,000/US$20,000”，下方标注“Diamond+ tier expires on Jan 20, 2025”。页面中部有一条通知“Great News! Black Diamond Level is now available”，右侧有箭头按钮。下方“Rewards for Upcoming Trips”部分显示“Trip to Tokyo and London”，并标注“4 rewards ready for your trip”，右侧有旅行相关图标和图片。底部“Diamond+ Benefits”部分显示“Free Airport VIP Lounge Access”，并标注“5-time free access”，右侧有沙发图标和进度条。整体布局清晰，信息层次分明。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ZWI3N2QyOGU2OTEwMmZlNDQ0Nzg3MmNjYmE0YWJiY2NfNWQ0MmQwYTc4ODllYWVmNWM2YTUyNzYwYzY0MDNlZTZfSUQ6NzY0NjcxOTc3MTc3OTQ2ODI1NV8xNzg2NTQwODM0OjE3ODY2MjcyMzRfVjM)<br/></td>
<td>1. 表明用户接下来的行程目的地城市<br/>2. 动态变量是目的地城市名称<br/>3. 最多露出2个目的地，超过3个时使用“,and more”的表达<br/></td>
<td>1个城市：<br/>Trip to [city]<br/>2个城市：<br/>Trip to [city1] and [city2]<br/>超过3个：<br/>Trip to [city1], [city2], and more<br/></td>
<td>1个城市：<br/>- Trip_Reward_Component_Card_Title_One_City<br/>- Trip to %1$s<br/><br/>2个城市：<br/>- Trip_Reward_Component_Card_Title_Two_Cities<br/>- Trip to %1$s  and %2$s<br/><br/>超过3个：<br/>- Trip_Reward_Component_Card_Title_More_Cities<br/>- Trip to %1$s, %2$s, and more<br/></td>
</tr>
<tr>
<td>入口-组件副标题<br/></td>
<td>![识别的图片内容：图片为一张移动端界面截图，整体风格简洁现代，主色调为蓝色，顶部显示时间、电池和信号状态。页面标题为“Trip.com REWARDS”，下方显示“Diamond+”及“Your current tier”，右侧有一个钻石形状的图标。页面中部有一条进度条，标注“Spend over $620 and receive invitation by Jan 20, 2025 to unlock Black Diamond”，进度条下方显示“US$10,000/US$20,000”，并附有信封图标。页面底部显示“Rewards for Upcoming Trips”和“Diamond+ Benefits”，其中“Trip to Tokyo and London”下方标注“4 rewards ready for your trip”，右侧有东京塔的图片和相关图标。页面整体布局清晰，文字与图标信息明确。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ZGRkZjJkMDRiNzViNjg2YjFkNzliMThhMjM3ZTRkZTJfZjJmNzQwNDYwZDVkM2VkNjE3ZDRjZGUxZjEyY2JhNjJfSUQ6NzY0NjcyMDc4NjQzNDMxMzE2Nl8xNzg2NTQwODM0OjE3ODY2MjcyMzRfVjM)<br/></td>
<td>1. 用户一共有几个权益可用（最少1，最多4）<br/><br/></td>
<td>1个:<br/>Your 1 reward are ready<br/>&gt;1:<br/>Your [number] rewards are ready<br/>可以合并成一个，用复数key<br/><br/></td>
<td>- Trip_Reward_Component_Card_Subtitle<br/>- Your %1$s rewards are ready	- 有复数Key<br/><br/></td>
</tr>
<tr>
<td>浮层-会员等级<br/></td>
<td>![识别的图片内容：图片为手机界面截图，顶部显示时间为9:41，右上角有信号、电池图标和一个问号按钮，左上角有返回箭头和关闭按钮。页面顶部显示“Trip.com REWARDS”标志，下方有红框标注的“Diamond Member”字样，右侧有一张东京塔的图片。标题为“Rewards for Upcoming Trips”，下方列出多个奖励项目，包括“Free Airport VIP Lounge Access”“Free Global eSIM Data Package”和“Airport Transfer Model Upgrade”。每个奖励项目包含标题、描述、剩余数量、适用地点和日期等信息，并配有图标和“Use”按钮。整体界面以白色为背景，文字为黑色，按钮为蓝色，布局清晰，风格简洁现代。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=YWQ1NzBhNTIyNzEzYjhiYTkwNDgyZmZhYTAxNjJmNTZfM2Q5ZGEzNDJjYTk5MTVkY2QwMDM5NzI4YjYwYjgxYzVfSUQ6NzY0NjcyMTQ1OTc4MDI5MTc4N18xNzg2NTQwODM0OjE3ODY2MjcyMzRfVjM)<br/></td>
<td>- 白银：Member_level_Name_Silver<br/>- 黄金：Member_level_Name_Gold<br/>- 铂金：Member_level_Name_Platinum<br/>- 钻石：Member_level_Name_Diamond<br/>- 钻+ ：Member_level_Name_Diamond_Plus<br/>- 黑钻：Member_level_Name_Black_Diamond<br/></td>
<td>Silver tier <br/>Gold tier<br/>...<br/></td>
<td>复用已有的等级MemberName<br/></td>
</tr>
<tr>
<td>浮层-标题<br/></td>
<td>![识别的图片内容：这是一个移动应用界面的截图，主要展示了一个名为“Trip.com REWARDS”的页面，顶部显示时间“9:41”，左上角有返回按钮，右上角有帮助图标。页面标题为“Rewards for Upcoming Trips”，下方有“Diamond Member”标识和一张东京塔的图片。界面分为多个奖励模块，包括“Free Airport VIP Lounge Access”（显示2次剩余使用次数，列出“Shanghai Hongqiao Airport”和“HND haneda Airport”的航班信息及日期），“Free Global eSIM Data Package”（显示1GB/3天的数据包，支持英国），以及“Airport Transfer Model Upgrade”（显示1次标准升级为中型车的机会）。每个模块右侧有“Use”按钮，部分模块带有图标，如沙发和