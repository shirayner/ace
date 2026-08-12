# 修改前失败基线

## 案例证据

- 来源：飞书文档《【PRD】会员页增加权益推荐模块》，revision 6418。
- 已完整读取 98,868 / 98,868 字符。
- 原文业务流程包含：未来行程获取、30 天过滤、逐行程判断四类权益、至少一个可用权益才展示、按权益聚合、点击后跳转。
- 原文“整体流程图”没有实际图形，证明该案例需要由投影规则补齐结构化流程图，而不能依赖来源自带图。

## RED-1：需求规模漂移

上游 `requirement-understanding/references/flow.md` 只允许 `Micro / Normal`，本案例已判定 `Normal`。当前写作 Skill 仍：

- 在 `requirement-writing/SKILL.md` 定义独立的 `Large 强信号`，允许写作阶段根据材料长度、跨域和章节数量重分类；
- 在 `templates/core.md` 将文档信息的需求规模列为 `Micro / Normal / Large`。

因此写作阶段可以把上游 `Normal` 覆盖为 `Large`，实际错误输出已出现。

## RED-2：结构化流程漏图

当前模板仅写“有分支 / 回流 / 循环时必填”，但：

- 未覆盖过滤、聚合、多阶段跳转、跨角色或系统交接；
- 唯一规则源 `projection-rules.md` 没有流程图准入规则；
- P0/P1/P2 自检没有检查图是否存在及是否与步骤、BR、REQ 一致。

因此案例中的过滤、逐项判断、聚合和跳转可被渲染成纯文字步骤，实际错误输出已出现。

## 可复跑断言

运行：

```bash
python .ace/tasks/fix-prd-projection/artifacts/verify_prd_projection.py
```

修改前结果：`Projection assertions: 0/6`，退出码 1。
