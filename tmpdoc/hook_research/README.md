# Claude Code Hooks 深度研究报告

> 研究日期：2026-05-27
> 研究范围：Claude Code Hooks 官方机制、业界最佳实践、后端开发全流程应用、ACE 优化方向

## 目录

1. [机制全貌](./01-mechanism.md) — 事件类型、配置格式、输出协议、安全模型
2. [业界实践案例](./02-practices.md) — 8 个经典开源/官方案例深度分析
3. [全流程应用模式](./03-workflow.md) — 后端开发各阶段的 hooks 应用映射
4. [ACE 优化方向](./04-ace-optimization.md) — 现状分析 + 分级优化建议

## 核心发现

- Claude Code Hooks 已发展为 **28 种事件 × 5 种 Handler** 的完整拦截器体系
- 业界最佳实践集中在：安全门禁、上下文连续性、自主迭代、自动格式化
- ACE 当前 hooks 架构**基础扎实**，但缺失 `if` 预过滤、async 异步、PreCompact 状态保持等高价值特性
- 建议优化路径：P0（if + UserPromptSubmit）→ P1（PreCompact + async 编译）→ P2（自动测试 + Session 恢复）
