# 【简版】toB PRD Review 标准


# 评审要求

1. 不要给出评审建议，只给出评审问题即可

2. 明确标出不在范围内的内容请不要进行评审

3. 明确标出不做的内容请不要进行评审

4. 划线或者明确删除的内容请不要进行评审

# 评审标准

## Step1: PRD 框架走查

<table>
<tr>
<td><strong>业务背景</strong><br/></td>
<td>1. 产品 / 功能介绍是否详细？<br/>2. 为什么做这个需求？<br/></td>
</tr>
<tr>
<td><strong>业务目标/ Metrics</strong><br/></td>
<td>业务成功指标有哪些？<br/></td>
</tr>
<tr>
<td><strong>上线策略</strong><br/></td>
<td>上线计划 & Milstone?<br/></td>
</tr>
<tr>
<td><strong>用户角色</strong><br/></td>
<td>核心用户角色有哪些？<br/></td>
</tr>
<tr>
<td><strong>权限设计</strong><br/></td>
<td>1. 是否涉及权限管控？<br/>2. 每个角色的权限范围?<br/>3. 角色之间的权限扭转关系<br/></td>
</tr>
<tr>
<td><strong>核心使用场景</strong><br/></td>
<td>主要使用场景描述是否详细？<br/></td>
</tr>
<tr>
<td><strong>业务流程</strong><br/></td>
<td>全产品使用流程描述是否详细？关注是否有 workflow 图？<br/></td>
</tr>
</table>

## Step2: 核心功能信息完整度走查

<table>
<tr>
<td><strong>信息结构</strong><br/></td>
<td>1. 每个功能模块展示哪些信息字段？<br/>2. 字段优先级如何排列？<br/></td>
</tr>
<tr>
<td><strong>交互逻辑</strong><br/></td>
<td>1. 用户从<br/>2. 用户能做哪些操作？（增删改查 / 触发 / 跳转等）<br/>3. 每个操作触发后发生什么？<br/></td>
</tr>
<tr>
<td><strong>异常场景</strong><br/></td>
<td>1. 出错时如何处理？（网络异常 / 权限不足 / 操作失败）<br/>2. 报错提示文案是什么？<br/></td>
</tr>
<tr>
<td><strong>边界场景</strong><br/></td>
<td>1. 数据为空时展示什么？<br/>2. 数据量超限 / 极端值如何处理？<br/></td>
</tr>
</table>
