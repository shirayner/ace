# goal.py 实现侧变异记录

日期：2026-08-14

基线命令：

```text
node --test plugin/skills/general/auto-goal-v3/tests/goal-contract.test.mjs
```

基线结果：5/5 通过。

所有变异均复制 `goal.py` 到独立临时文件，通过 `AUTO_GOAL_V3_GOAL_PY` 注入；工作树中的产品实现未被改写。每次只改变一个实现判断，且运行器先断言目标源码恰好出现一次，防止假注入。

| 变异 | 实现侧变化 | 目标测试 | 结果 |
|---|---|---|---|
| duplicate-id-guard | 禁用 `if cid in seen` | forged arm | KILLED（测试非零退出） |
| criteria-hash-guard | 禁用 `if reported_hash != recorded_hash` | forged arm | KILLED（测试非零退出） |
| done-tally-recomputation | 将 `done` 的 `tally_of(verdicts)` 改为信任 `accept.tally` | done recomputes verdict tally | KILLED（测试非零退出） |

变异得分：**3/3 killed**。

另做一处诊断性变异：仅禁用显式 `if missing` 分支。该变异存活，因为后续按冻结顺序执行 `seen[c["id"]]` 时仍会对缺失 ID fail closed。这证明实现存在第二道同义防线；不能据此声称显式分支单独具有必要性，也不将它计入上述 3/3。

Windows 量具修复：原测试直接 `spawnSync("python", ...)`，会命中 pyenv 目录中的无扩展 POSIX shim 并返回 `status=9009`。现在测试模块先从仓库位置解析 `sys.executable`，之后在临时根目录直接启动真实解释器；避免把“解释器未运行”误报为产品门禁失败。
