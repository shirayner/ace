# DeepSeek Harness Skill 扁平安装

## 目标
选择 dsh 后，将已选 ACE skill 作为完整 bundle 打平安装到 `${DSH_HOME:-~/.dsh}/skills/<skill>/`，使 DSH 能直接发现，同时保证第三方同名目录不被覆盖。

## 过程记录

### 决策
- **D1**: 仅 DSH 使用私有 flat copy target — 理由: DSH 只扫描 root 的直接子目录；保留 canonical 分类布局可避免影响 Codex/OpenCode。备选: 全局打平共享目录。
- **D2**: 未托管同名目标报错 — 理由: 通用 COPY 当前先删后复制，会破坏用户文件。备选: 静默覆盖、自动改名。
- **D3**: DSH 指令文件继续使用 `.agents/AGENTS.md` — 理由: 本次问题只涉及 skill 发现，避免扩大行为变更。

### 中间结论
- 当前 DSH 目标错误地声明 `projection: none` 和无限递归深度。
- 本机 DSH 0.1.1-rc.2 扫描 `${DSH_HOME:-~/.dsh}/skills`，只识别 `<root>/<skill>/SKILL.md`。
- 通用 COPY 已能生成 flat bundle，但需增加所有权保护与旧回执清理。

### 风险
- 目标目录存在第三方同名 skill: 在任何覆盖前汇总冲突并失败。
- 二次 init 取消选择留下旧投影: 使用上一份安装回执识别并清理 ACE 托管路径。
- 自定义 DSH_HOME 在模块加载时解析: 测试需隔离环境或支持显式路径注入。

## 实施结果
- DSH 目标改为 `${DSH_HOME:-~/.dsh}/skills/<skill>/` 的受保护 COPY 投影。
- 投影前汇总未托管同名目录，避免 canonical store 已改写后才失败。
- 重复 init 使用上一份回执更新已托管 skill，并清理取消选择的旧副本。
- 回执记录 DSH 真实副本路径，doctor 与 uninstall 均按这些路径检查和清理。
- README 已更新为 Codex/OpenCode 原生递归读取、DSH/Kiro 实体复制的实际布局。

## 验证记录
- 最终 DSH 相关行为测试：47/47 通过。
- `git diff --check` 通过。
- 全量 `npm test`：630 项中 623 通过、5 跳过、2 失败；失败均位于本次未修改内容（auto-goal-v3 SKILL.md 超预算、docs 缺少既存 code-review-pro），完整日志见 `artifacts/full-test.log`。
- `npm run lint` 未执行：当前环境没有可用的 `eslint` 命令（不是 lint 违规结果）。

## 已修改文件
- `src/core/constants.js`: 增加 DSH 私有根目录与 skills 路径常量。
- `src/core/targets.js`: 将 DSH 定义为受保护的扁平 COPY 目标。
- `src/core/projector.js`: 增加冲突预检和旧托管投影清理。
- `src/core/installer.js`: 读取旧回执并在 canonical 写入前预检冲突。
- `tests/multi-target-install.test.mjs`: 覆盖投影配置、冲突和重复选择。
- `tests/multi-target-e2e.test.mjs`: 覆盖真实扁平布局与 DSH_HOME。
- `tests/uninstall-roundtrip.test.mjs`: 覆盖 DSH 副本卸载。
- `README.md`: 更新多目标安装说明。
