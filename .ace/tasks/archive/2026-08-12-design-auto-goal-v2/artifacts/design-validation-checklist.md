# auto-goal-v2 设计完整性验证

> 验证日期：2026-08-12  
> 被验对象：`artifacts/auto-goal-v2-design.md`  
> 性质：设计级 fresh verification；未创建 V2 实现，因此实现期测试尚未运行。

## 1. 完成标准逐项验证

| # | 完成标准 | 证据位置 | 结果 |
|---|---|---|---|
| 1 | 完整、可评审设计且不创建 V2 实现 | §0–§19；文件开头范围声明 | PASS |
| 2 | 私有运行时依赖完全位于 Skill 目录 | §5 目录树与依赖规则；§16 A01/A02；§17 I10 | PASS（设计） |
| 3 | 目标理解与方法路由 | §3 Frontier、信号路由、提问规则、对齐卡 | PASS |
| 4 | 控制面、状态机与端到端生命周期 | §4、§6 | PASS |
| 5 | journal event schema 与有界策略 | §7.1、§9.1 | PASS |
| 6 | checkpoint schema 与恢复语义 | §7.2、§9.2、§9.5 | PASS |
| 7 | worker 输入/输出 envelope | §7.3、§7.4 | PASS |
| 8 | artifact manifest | §7.5 | PASS |
| 9 | 错误、中断和阻塞模型 | §7.6、§11.2、§11.3 | PASS |
| 10 | 模型摄入前 Proxy 协议 | §8.1、§8.2、§8.3 | PASS |
| 11 | worker 启动输入隔离 | §7.3 16 KiB 总门限；§8.1 clean-context；§16 X02 | PASS |
| 12 | capability、risk、approval | §2.2、§2.6、§10 | PASS |
| 13 | evidence、verification、降级 | §2.4–§2.6、§11、§13 | PASS |
| 14 | 任意领域目标 | §2 三轴模型；§13 七类实例；§16 X01 | PASS |
| 15 | `SKILL.md` 骨架与渐进加载 | §5.1 | PASS |
| 16 | 实施路线 | §15 | PASS |
| 17 | 可验收测试矩阵 | §16，覆盖 37 个场景 | PASS |
| 18 | 对输入材料的采纳/调整/否决 | §14 | PASS |
| 19 | 主 Agent 角色保持有界 | §4.1、§12 | PASS |
| 20 | 终态不得由模型自述 | §11 reducer；§17 I1 | PASS |

## 2. 关键不变量交叉检查

| 检查 | 结果 | 说明 |
|---|---|---|
| Goal 与 Mandate 分离 | PASS | 仅交集可执行，residual 强制交接 |
| `Judgment/Knowledge` 不自验 | PASS | 必须由 acceptor/用户提供 E4 证据 |
| E1 不冒充目标效果 | PASS | 外部操作至少独立读回；I14 |
| 范围不可静默收窄 | PASS | `scope_version` + decider approval + I2 |
| 输入超限发生在 worker 启动前 | PASS | `DISPATCH_REJECTED` 且不产生 dispatch 事件 |
| 输出处理发生在主模型摄入前 | PASS | capture→raw write→校验→投影→return 固定顺序 |
| journal 不保存大正文或推理 | PASS | 4 KiB/event，正文转 artifact |
| worker 不写控制面 | PASS | 单写者规则 + I3 |
| 外部副作用不可盲重放 | PASS | effect intent/observation + I6 |
| 正常恢复有唯一下一步 | PASS | checkpoint `next_action` + I8 |
| Frontier 不持久化 | PASS | §3.1 + I13 |
| 私有依赖不出目录树 | PASS（设计） | §5 与 I10；实现后必须静态扫描实证 |

## 3. 机械文档检查

已对设计文件执行本地脚本检查：

- 必需章节存在；
- JSON 示例可解析；
- Goal/Mandate、五态、Proxy 顺序、输入硬预算均存在；
- 测试矩阵覆盖 architecture/context/journal/evidence/outcome/risk/understanding/cross-domain 八类；
- 搜索到的 `shared/`、V1 和 `ace goal` 均是明确的禁止项、测试条件或否决说明，不是运行时引用。

注：一次 Bash 检查调用未回显 stdout，因此又使用专用 Grep 分别检查章节、关键预算、依赖禁令和测试项；结果均有匹配。文档随后修正了一个术语歧义：`NEEDS_INPUT` 明确为持久化中断态，不会产生 `GOAL_TERMINATED`。

## 4. 设计裁决复核

- `FAILED`：不增设第六态，映射为带明确 reason 的 `BLOCKED`；避免状态重叠。
- `NEEDS_INPUT`：保留为 outcome status，但不是 sealed terminal outcome。
- 主观代理 rubric：不能替代 acceptor，只能把可机械属性作为独立 criterion。
- `required_rung`：采用 criterion 基线 + 高风险上调 + max-rung 可达性检查。
- 完成/归档：由 Skill 内 `GOAL_TERMINATED` 和 sealed manifest 表达，不依赖 `ace task done`。
- 运行时：首版统一 Node.js ESM，避免双运行时；平台 clean-context 能力必须先做 spike。

## 5. 尚待实现期验证

以下不是设计缺口，但在代码不存在时不能声称已验证：

1. 真实 worker backend 是否完全不继承主会话；
2. Proxy 是否确实在模型摄入前拦截，而非收到结果后处理；
3. transcript 中实际注入字节/token 是否满足预算；
4. 原子追加、fsync、rename 和 Windows 崩溃恢复行为；
5. symlink/path escape、并发写和 stale scope 的实测；
6. 删除目录外 `shared/` 后的完整测试；
7. 37 项测试矩阵的可执行自动化结果。

因此最终结论是：**设计完整性验证通过，可以进入实现评审；实现正确性尚未验证，也未被声称已验证。**
