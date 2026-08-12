end_popup_item_exposure<br/></td>
<td><code>benefit_type</code> 权益类型按数字上报，和前面保持一致<code>dest_city_id</code> <br/><code>dest_country_id</code><br/><code>dep_city_id</code> 休息室item加出发<br/></td>
</tr>
<tr>
<td>权益推荐具体item点击<br/></td>
<td>APP<br/></td>
<td>点击<br/></td>
<td>会员主页<br/></td>
<td><br/></td>
<td>ibu_loyalty_app_rewards_benefitrecommend_popup_item_click<br/></td>
<td><code>benefit_type</code><code>dest_city_id</code> <br/><code>dest_country_id</code><br/><code>dep_city_id</code> 休息室item加出发城市<br/></td>
</tr>
<tr>
<td>权益推荐展开更多-曝光<br/></td>
<td>APP<br/></td>
<td>曝光<br/></td>
<td>会员主页<br/></td>
<td><br/></td>
<td>ibu_loyalty_app_rewards_benefitrecommend_popup_expand_exposure<br/></td>
<td><code>benefit_type</code><br/><code>button_type</code><br/></td>
</tr>
<tr>
<td>权益推荐展开更多-点击<br/></td>
<td>APP<br/></td>
<td>点击<br/></td>
<td>会员主页<br/></td>
<td><br/></td>
<td>ibu_loyalty_app_rewards_benefitrecommend_popup_expand_click<br/></td>
<td><code>benefit_type</code><br/><code>button_type</code><br/></td>
</tr>
<tr>
<td>权益推荐浮层关闭<br/></td>
<td>APP<br/></td>
<td>浮层消失<br/></td>
<td>会员主页<br/></td>
<td><br/></td>
<td>ibu_loyalty_app_rewards_benefitrecommend_popup_close<br/></td>
<td><code>close_type</code>（manual_close / jump_and_back）<br/></td>
</tr>
</table>

<details>
<summary>本段共4组评论</summary>

[评论1]: 引用：「收到请求到渲染组件的耗时」
- ou_96d83e7b458356e71f4ba78dafea942e (2026-06-17 11:53:15): 记录渲染耗时的目的是？
- ou_8a78c83ec397b0a5cd756050ece52fa8 (2026-06-17 16:00:10):  接口性能的判断

[评论10]: 引用：「has_lounge / has_free_ticket / has_esim / has_transfer（各权益是否存在） 或者埋权益个数，上报具体是哪些权益」
- ou_96d83e7b458356e71f4ba78dafea942e (2026-06-17 11:57:26): 建议上报权益类型

[评论11]: 引用：「权益推荐权益区块曝光」
- ou_96d83e7b458356e71f4ba78dafea942e (2026-06-17 12:00:08): 卡片头部区域吗？
- ou_8a78c83ec397b0a5cd756050ece52fa8 (2026-07-07 14:34:29):  浮层里单个卡片的头部曝光就上报

[评论13]: 引用：「benefit_type（lounge/free_ticket/esim/transfer）」
- ou_96d83e7b458356e71f4ba78dafea942e (2026-06-17 11:59:01): 建议权益类型用数字

</details>

# Reference

<table>
<tr>
<td>页面<br/></td>
<td>内容<br/></td>
<td>交互想法<br/></td>
</tr>
<tr>
<td><strong>会员主页</strong><br/></td>
<td><strong>*有2个想法，一是行程挂靠权益，在单个权益上露出有哪些行程可用；二是权益挂靠行程，在单个行程上展示有哪些可用的权益</strong><br/><br/><strong>想法一：行程挂靠权益，在单个权益上露出有哪些行程可用</strong><br/>- 每个 reward item 有两层内容：	- 固定层：权益名称 + 描述（现有，代表&quot;钻石会员拥有这个权益&quot;）	- 动态层：匹配到相关行程，仅条件满足时出现，内嵌在item中		- 多个行程匹配--&gt;动态层内部横滑，item本身不变		- 用户首次触发权益推荐时，highlight该板块		- 无完成态，权益已使用或无订单满足状态时，不展示动态推荐的内容<br/>- 组件仅展示在当前等级页，切换至其他等级时组件不跟随<br/>- 涉及动态推荐的权益：<br/>1. 休息室：“你有n段行程可使用休息室”	1. 推荐窗口期：departure_time &gt;= now + 2h且 departure_time &lt;= now + 30d	2. 符合使用条件：		1. 判断该行程有休息室权益可使用		2. 用户已实名	3. 具体的机票订单信息，多订单时允许滑动		1. 订单状态：已支付未退		2. 信息展示：航段信息（出发、到达、联程拆成多航段）、出发日期、休息室名称	4. 点击模块中的具体行程进入休息室补订流程 <br/>2. 接送机升级：“PVG trip eligible”	1. 行程窗口期： 已支付未退的机票订单departure_time &lt;= now + 30d或落地时间&lt;= now + 2h	2. 符合使用条件：		1. 接送机权益有剩余可用次数		2. 近30天内没有与机票出发或到达城市相同的接送机订单		3. 存在已支付未退的机票订单，且该订单其中一段起飞或落地机场在接送机的覆盖范围内	3. 信息露出：机票的出发时间、起飞落地城市、单独cta	4. 点击模块中的具体行程进入接送机产线首页<br/>3. Free esim：“您有一笔出境订单，Japen covered”	1. 行程窗口期：近30天内有待出行的已支付未退的机票/酒店/火车订单	2. 符合使用条件：		1. 用户存在符合产线的待出行的“出境订单”且不存在esim订单		2. 用户的出境订单目的地国家在free esim的覆盖范围内	3. 信息露出：		1. 目的地国家	4. 点击模块中的具体行程进入free esim的指定sku页<br/>4. Free attraction ticket：“您可免费预订‘日本’的门票”	1. 行程窗口期：近30天内有待出行的已支付未退的机票/酒店订单	2. 符合使用条件：		1. 用户有已支付的机票或酒店订单		2. 用户有“ANT产线”意图		3. 用户近30天内无该目的地国家的门票订单	3. 信息露出：		1. 目的地国家	4. 点击模块中的具体行程进入门票产线首页<br/><br/><strong>想法二：权益挂靠行程，在单个行程上展示有哪些可用的权益</strong><br/>- 涉及推荐的权益：休息室、接送机升级、free esim、free ticket	- 排序：休息室&gt;接送机升级&gt;free ticket&gt;free esim<br/>- Tier rewards上放露出行程卡片，多行程支持滑动选择	- 卡片需露出的信息：出发到达城市、出行时间、该行程有哪几个权益可用	- 机票行程必须拆	- 酒店订单怎么做成行程卡片<br/>- icon的点击反馈：	- 机票：休息室补订页	- esim：指定esim的兑换页	- ticket：门票产线首页	- 接送机升级：接送机首页<br/></td>
<td>想法一：<br/>![识别的图片内容：这是一个界面截图，整体风格为深色主题，主要色调为黑色和金色，文字以白色和黄色为主，布局清晰，内容分为多个模块。顶部显示“Membership”和“Your Benefits”标题，右侧有一个金色“Diamond”标识，下方有提示“Complete your profile to unlock all benefits”，右侧有“Update”按钮。中间部分为“Diamond Tier Rewards”模块，显示“3 rewards ready for your upcoming trips”，右侧有“View”按钮。下方列出四项奖励，每项包含图标、标题和描述，右侧标有“READY”状态，分别为“Airport Lounge Access: Free access at 1,400+ lounges worldwide”，“Free Train Refund: No cancellation fee on eligible train tickets”，“Free eSIM Plan: Data coverage at your destination”，“Free Attraction Ticket: Complimentary entry to selected attractions”。整体界面简洁，信息层次分明，主要用于展示会员权益和奖励状态。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=N2IwZTI2MDJlNzQ2YTk4N2ZiNzY1MjIwNTFmNTU3ZmJfY2JmMmJhY2YzYzAzMzgxOThjODUwYmVhMTYxZTNiMGZfSUQ6NzYyNjMyNjE2MDEyMTMzNDk2M18xNzg2NTQwODM1OjE3ODY2MjcyMzVfVjM)![识别的图片内容：这是一个界面截图，主要展示用户即将旅行的相关权益信息，整体风格为深色主题，文字和图标以白色和浅色为主，布局简洁清晰。顶部显示标题“Available for your trips ✨”，并附有说明“Matched to your upcoming trips. Tap Use now before they expire.”，右上角有“DIAMOND”标识。界面分为三个卡片模块：第一模块为“Airport Lounge Access”，包含航班信息“HKG → SIN”、日期“Mar 15, 2026”，以及详细说明“HKIA Terminal 1 · Plaza Premium Lounge Opens 3 hrs before departure · Booking required”；第二模块为“Free Train Refund”，显示订单号“ORDER #TK2893”、日期“Mar 22, 2026”，以及详细信息“Shanghai → Beijing G-class · ¥553.00 Cancellation fee waived · Valid until departure”；第三模块为“Free eSIM Plan”，显示目的地“Singapore”、日期“Mar 15–18, 2026”，以及详细说明“5GB · 4G/5G · Valid 7 days from activation Activate anytime before departure”。每个模块左侧有对应图标，分别为机场休息室、火车和信号图标，卡片边框颜色分别为蓝色、绿色和紫色。背景为深色，内容区域以卡片形式分隔，整体设计简洁直观。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=YWEwZjllNWY2MmJmZDc5MmZiZjAyYWYxMzAyZjY0YThfYmM0NjYxNjc5NDZhZGE3OGI4YWIxOGRmMWMzMWM0MzdfSUQ6NzYyNjMyNjE2MzMyMDg2Nzc4MF8xNzg2NTQwODM1OjE3ODY2MjcyMzVfVjM)<br/>![识别的图片内容：这是一个界面截图，主要展示了“Diamond Tier Rewards”页面的内容，背景为深色主题，文字和图标清晰可见。页面分为四个奖励模块，每个模块包含图标、标题、描述和状态信息。第一模块为“Airport Free Lounge”，描述为“Access premium lounges worldwide”，状态为绿色“Available”，右侧有向下箭头。第二模块为“Free Train Ticket Refund”，描述为“No cancellation fee on train tickets”，状态为绿色“Available”，右侧有向下箭头。第三模块为“Free eSIM Package”，描述为“Global data plan included”，状态为灰色“No upcoming trips”。第四模块为“Free Attraction Ticket”，描述为“Complimentary entry to top attractions”，状态为灰色“Not eligible now”。整体布局简洁，信息层次分明，图标与文字对齐整齐。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=ZTgzMTU5N2YyYjc3ZTVjYTFhNDNjNjFiYmJmZjc2OTFfYmEzMGQ4MDBiN2E3ZmUwNjUxYTI3NWM3MGQ2NjEzZTJfSUQ6NzYyNjMyNjE1OTg3ODE5NjE2Nl8xNzg2NTQwODM1OjE3ODY2MjcyMzVfVjM)![识别的图片内容：图片为界面截图，整体风格为深色主题，主要色调为黑色与深蓝色，搭配绿色、黄色和白色文字。顶部显示“DIAMOND TIER REWARDS”标题，以下为四个奖励选项的卡片式布局，每个卡片包含图标、标题、描述文字及状态信息。第一项“Airport Free Lounge”显示“Access premium lounges worldwide”，右侧状态为绿色“Available”，下方显示航班信息“HKG → SIN, Mar 15, 2026 · Departing 09:30”，状态为绿色“Matched”，并有黄色按钮“Use Lounge Access →”。第二项“Free Train Ticket Refund”显示“No cancellation fee on train tickets”，右侧状态为绿色“Available”。第三项“Free eSIM Package”显示“Global data plan included”，右侧状态为灰色“No upcoming trips”。第四项“Free Attraction Ticket”显示“Complimentary entry to top attractions”，右侧状态为灰色“Not eligible now”。整体布局清晰，信息层次分明，按钮和状态标识明显。](https://api3-eeft-drive.feishu.cn/space/api/box/stream/download/authcode/?code=YTg1YzQ0YWFkNGFjYzQyMDZkMmIyMTY1OTkxZmZjNWJfMDkzZTA0ZjE2ZGYzYjA2MTE3MzY4YzcxNDZhYjI4NTJfSUQ6NzYyNjMyNjE1OTgyMDA4MjEzMF8xNzg2NTQwODM1OjE3ODY2MjcyMzVfVjM)<br/>![识别的图片内容：这是一张界面截图，整体风格为深色主题，主要色调为黑色和灰色，文字和图标使用白色、绿色和黄色点缀。画面顶部显示“REWARDS”和“4 active”标题，右对齐。下方有四个奖励选项，每个选项包含图标、标题、描述和剩余数量信息。第一项为“Airport Lounge”，图标为房屋图案，描述为“Free access at 1,200+ lounges world...”，右侧显示“2 left”；第二项为“Airport Transfer”，图标为车辆图案，描述为“Free private transfer to/from airport”，右侧显示“4 left”；第三项为“Free eSIM”，图标为SIM卡图案，描述为“Data plan for 80+ destinations”，右侧显示“1 left”；第四项为“Free Ticket”，图标为票券图案，描述为“Museum, park & attraction entries”，右侧显示“3 left”。每个选项右侧有一个下拉箭头图标，表示可展开更多内容。整体布局整齐，信息分区清晰，文字对齐方式为左对齐。](https://api3-eeft-drive.feishu.cn/space/api/box/stream/download/authcode/?code=ZmRiNzU2ZDU0YzE2YjRhNTlmNzgyNTg2ZjZkZGQ2ZDdfYzU2YzkxZGFiYjcwM2FkZjlhYTZlMTQ5NjM2NTM2NThfSUQ6NzYyNjMyNjE1OTcxNDc2NTc4NV8xNzg2NTQwODM1OjE3ODY2MjcyMzVfVjM)![识别的图片内容：图片为界面截图，整体风格为深色主题，主要色调为黑色和金色，布局紧凑，信息层次清晰。顶部显示“REWARDS”标题，右侧标注“4 active”。界面分为两部分：第一部分为“Airport Lounge”，显示剩余次数“2 left”，描述为“Free access at 1,200+ lounges world...”，下方为“ELIGIBLE TRIPS”，列出两个航班选项“PVG – NRT Mar 18”和“SHA – LHR Apr 5”。选中航班“PVG – NRT”后，显示详细信息，包括“PVG Pudong Intl”到“NRT Narita Intl”，航班号“MU553”，起飞时间“Mar 18, 09:30”，舱位“Economy”。绿色提示框显示“PVG Lounge T2 available — Book up to 3h before departure. Your 2 remaining passes apply.”，下方为黄色按钮“Book Lounge for PVG – NRT”。第二部分为“Airport Transfer”，显示剩余次数“4 left”，描述为“Free private transfer to/from airport”，同样列出两个航班选项，选中“PVG – NRT”后，显示详细信息，包括“PVG Pudong Intl”到“NRT Narita Intl”，航班号“MU553”，接送时间“Mar 18, 07:00”，起点为“Your address”。蓝色提示框显示“Pick-up from your home — Sedan available for PVG. Book at least 24h before departure.”，下方为蓝色按钮“Book Transfer for Mar 18”。](https://api3-eeft-drive.feishu.cn/space/api/box/stream/download/authcode/?code=OGZhZjRiYjFkMTM5MTBiNzFiZjM2NjM2YzI4NDc1ZmRfOTE1ZWYxYjgzNjQyMzEyMmQyZDkxODcwZTZkNjRjMTlfSUQ6NzYyNjMyNjE2MzQyOTg4NzE2OV8xNzg2NTQwODM1OjE3ODY2MjcyMzVfVjM)![识别的图片内容：图片为界面截图，整体为深色背景，主要展示“REWARDS”相关内容，右上角显示“4 active”。界面分为多个卡片式模块，每个模块包含图标、标题、描述和剩余数量。第一模块为“Airport Lounge”，图标为房屋，描述为“Free access at 1,200+ lounges world...”，右侧显示“2 left”。第二模块为“Airport Transfer”，图标为车辆，描述为“Free private transfer to/from airport”，右侧显示“4 left”。第三模块为“Free eSIM”，图标为SIM卡，描述为“Data plan for 80+ destinations”，右侧显示“1 left”。下方为“DESTINATIONS COVERED”区域，包含“JP Japan 10GB”和“UK UK 5GB”标签，以及“Hotel · Tokyo Mar 18–22”和“Flight · NRT Mar 18”信息。最下方有一紫色按钮“Activate Japan eSIM”，并附有说明“Japan covered · 10GB plan — Activate before Mar 18. Use for your Tokyo hotel stay + NRT flight trip”。最后一个模块为“Free Ticket”，图标为票券，描述为“Museum, park & attraction entries”，右侧显示“3 left”。](https://api3-eeft-drive.feishu.cn/space/api/box/stream/download/authcode/?code=NmRmZTljZmU5MjUxMzg4YmYzNzg1MDU2Mzk5MTcxZTJfNzVlNDVlMWRmZjVkNzU5YmFjMjY3MDE5MWQ3YTlhY2JfSUQ6NzYyNjMyNjE1OTM4Nzc5MDU1N18xNzg2NTQwODM1OjE3ODY2MjcyMzVfVjM)<br/><br/>想法二：<br/>![识别的图片内容：图片为一张界面截图，整体风格为现代化设计，主色调为紫色和白色，布局清晰。顶部显示“Trip.com REWARDS Diamond Unlocked”，背景为渐变紫色，右上角有问号图标。下方有一个进度条，显示用户当前处于“Diamond”等级，并提示“你高于此等级”。中部为“Upcoming Trips”模块，列出一条行程信息“Singapore → Tokyo”，包含“FLIGHT”和“HOTEL”标签，日期为“Mar 22 - Mar 28, 2026”，并显示“4 benefits”图标。右侧有“View all”链接。下方为“Diamond tier rewards”模块，标注“x7”，列出四项奖励：1. “Earn 100% more Trip Coins”，显示余额为“0 ($0.00)”，右侧有黄色“T”图标；2. “Free Airport VIP Lounge Access”，标注“2 times”，右侧有沙发图标；3. “Free Global eSIM Data Package”，标注“3GB/5-day (x1)”，右侧有紫色eSIM图标；4. “Airport Transfer Model Upgrade”，标注“Standard upgrades to Medium (x2)”，右侧有汽车图标。整体界面简洁，信息清晰，适合移动端使用。](https://api3-eeft-drive.feishu.cn/space/api/box/stream/download/authcode/?code=YTI1OWM2MGNmMWMwNWI1NGE1NmViZTRlNWRhN2Y2YmVfNjY2NWJkN2UxMGNiYmRlMTdmYTBkMGU1MDExZDU0ZmZfSUQ6NzYyNjMyNjE2MTU5MzQwNDM4MV8xNzg2NTQwODM1OjE3ODY2MjcyMzVfVjM)![识别的图片内容：这是一个界面截图，包含顶部会员信息和即将到来的旅行列表，整体风格简洁现代，主要色调为紫色、蓝色和白色，比例为纵向布局。顶部区域显示会员等级为“Diamond Tier”，拥有16枚Trip Coins（约合S$0.20），并有一个按钮“View all benefits”。下方是“Upcoming Trips”标题，右侧有“View all”链接。旅行列表包括三个卡片：第一张为“Singapore -> Tokyo”，日期为2026年3月22日至3月28日，包含“FLIGHT”和“HOTEL”标签，显示4项福利图标；第二张为“Singapore -> London”，日期为2026年4月10日至4月18日，包含“FLIGHT”标签，显示2项福利图标；第三张为“Singapore -> Bali”，日期为2026年5月3日至5月7日，包含“HOTEL”和“TRANSFER”标签，显示1项福利图标。每张卡片左侧有图标，右侧有指向详情的箭头。背景为渐变紫色，卡片背景为白色，整体布局清晰有序。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=MjkxMjVmY2M5NGUyY2QxOTViOGEzNjMyZDQxYjIxM2FfMjFkZjNkNjk5NzQ5NjdjZDdiYjAwN2M4MzEwYTJkY2ZfSUQ6NzYyNjMyNjE2MDI3NjU3MzEyNl8xNzg2NTQwODM2OjE3ODY2MjcyMzZfVjM)![识别的图片内容：图片为一张手机应用界面截图，整体为深色背景，顶部显示“会员中心”标题，左上角有返回按钮，右上角有“管家”图标和更多选项按钮。页面分为多个模块：第一部分为“私享礼遇”，包含三张图片卡片，分别为“高奢酒店权益”“专享观演礼遇”“私享活动臻席”，每张卡片下方有简短描述和箭头；第二部分为“品牌联名卡”，展示了多个品牌权益卡片，右上角有“更多”按钮；第三部分为通知区域，显示“您最近有4笔行程可用权益”，下方列出具体行程信息，包括日期、地点和权益内容，如“机场休息室”和“高铁休息室”，并附有相关图片。底部为导航栏，包含“会员中心”“签到·任务”“我的积分”“会员商城”“积分夺宝”五个按钮，图标和文字并列显示，整体布局清晰，文字信息完整且对齐规范。](https://internal-api-drive-stream.feishu.cn/space/api/box/stream/download/authcode/?code=OWYxZTEzNDNlMTAzMGE5MTIwYTE4YTBjMmYxOTI5ZDlfM2JlZTlkZmNmODJkN2JjZDNmOTFhMTFlOTkxN2U4YjlfSUQ6NzYyNjMyNjE2MTM5NjQxOTU1MF8xNzg2NTQwODM2OjE3ODY2MjcyMzZfVjM)<br/><br/></td>
</tr>
<tr>
<td><strong>权益子频道页</strong><br/></td>
<td>仅“休息室权益详情页”需要改动，其他页面无需改动<br/>1. 位置：放在休息室次数下方<br/>2. 逻辑同会员主