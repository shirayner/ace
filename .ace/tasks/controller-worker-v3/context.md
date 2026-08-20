# controller-worker-v3

## 目标

把 auto-goal-v3 改造成主 Agent 只调度、所有探索与实现工作由子 Agent 执行的 Controller–Worker 内核

## 完成标准

- [ ] C001 文档明确规定 Controller 不得直接实现或修复，独立探索域必须委派，每个实现任务必须委派 fresh subagent；多个无依赖且资源不冲突的 ready item 必须同轮并行
- [ ] C002 goal.py 支持创建和推进 Work Graph；每个 work item 含稳定 ID、可观察产出、局部判据、非空 criterion_ids、依赖、资源与委派生命周期
- [ ] C003 goal.py done 拒绝空 Work Graph、标准覆盖不完整、未委派或未完成的任务以及缺少 Controller 验证或独立审查的任务；合法单任务和多任务流程可关闭
- [ ] C004 黑盒测试至少覆盖完整、单原子任务、缺失委派、伪造或非法迁移、依赖与覆盖错误，并证明现有 criteria/verdict 契约不回归
- [ ] C005 至少 3 处实现侧变异会使测试转红，记录变异证据
- [ ] C006 npm test、V3 契约测试与 ace doctor 通过；SKILL.md 不超过 6144 字节，峰值 reference 摄入不超过 20480 字节

## 决策

（见 state.json 的 simple.decisions）

## 中间结论

