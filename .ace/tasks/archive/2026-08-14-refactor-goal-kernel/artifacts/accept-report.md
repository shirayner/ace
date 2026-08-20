# 验收报告 — refactor-goal-kernel

验收日期：2026-08-14
验收方式：独立 verifier 现场取证（旧格式任务，无 criterion ID / criteria_sha256）

| 标准 | 判定 | 证据 |
|---|---|---|
| C001 | PASS | `goal.py` 的 `cmd_init` 拒绝空 criteria；完整/最小/缺失契约臂通过；成功状态含稳定 ID、`text_sha256`、`criteria_sha256`。 |
| C002 | PASS | `validate_bijection` 拒绝重复、遗漏、未知 ID、错误集合指纹；合法报告正常聚合；对应黑盒测试通过。 |
| C003 | PASS | `done` 从 verdicts 重算 tally，FAIL 拒绝归档，UNVERIFIABLE 仅在 `--accept-partial` 下以 `outcome=partial` 归档；篡改 tally 用例通过。 |
| C004 | PASS | references 仅有 `discover-align.md`、`execute.md`、`verify-close.md`；无旧文件名残留；`goal.py` 无 tree 子命令。 |
| C005 | PASS | 测试覆盖完整/最小/缺失/伪造四臂；`artifacts/mutation-testing.md` 记录并复验三处实现侧变异，3/3 killed。 |
| C006 | PASS | `npm test`：551 tests，546 pass，0 fail，5 skipped；`ace doctor`：56 passed，0 failed；SKILL.md 6130/6144 bytes；峰值 15135/20480 bytes。 |

## 汇总

PASS=6  FAIL=0  UNVERIFIABLE=0

## 兼容性说明

本任务由重构前的状态工具创建，`state.json` 只有字符串数组 `completion_criteria`，没有新内核要求的 criterion ID 与集合指纹。新 `goal.py` 会按设计 fail closed，拒绝把旧状态伪装成新冻结契约。因此本报告逐字对应旧状态中的六条标准，并由独立 verifier 取证；归档使用旧任务原生的 `ace task done`，不手写或伪迁移 state。
