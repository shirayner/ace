---
name: git-commit
description: 生成符合 Conventional Commits 规范的 git 提交信息，并给出分支命名约定。当用户要求提交代码、创建 commit、说「提交一下」/「commit」/「/commit」，或需要为改动撰写提交信息、创建新分支时使用。本 skill 是 git 提交与分支命名的唯一真相源。
allowed-tools: Bash
---

# Git 提交与分支规范

> 蓝本：Conventional Commits 官方规范 + github/awesome-copilot@git-commit。
> 本文件是 git 提交与分支命名的**唯一真相源**。
> （原 `ace/rules/git.md` 与 `gitflow.md` 已废止，备份在 `~/.claude/backups/git-rules-20260826/`。）

## 分支命名

| 分支类型 | 格式 | 示例 |
| --- | --- | --- |
| 功能 | `feature/[描述]` | `feature/user-auth` |
| 修复 | `fix/[问题ID]-[描述]` | `fix/issue-42-login-crash` |
| 发布 | `release/[版本]` | `release/v2.1.0` |
| 热修复 | `hotfix/[版本]-[描述]` | `hotfix/v2.0.1-payment-fix` |

统一用 `feature/` 全拼前缀 + kebab-case（连字符）。

> 注意：历史仓库存在 `feat/req_agent_v1`、`feat_property_platform` 等旧命名
> （`feat/` 缩写 + snake_case）。这是**有意迁移**——新分支按上表命名，
> 旧分支不必改名。看到旧格式不要跟随。

## 范围

本 skill 只管**提交信息**与**分支命名**。PR 流程、分支保护、发布流程由各仓库/团队自行约定。

## 硬规则（不可跳过）

1. **默认单行**——body 是例外，不是常态。判据见下。
2. **提交前确保测试通过**——若项目有测试且未跑过，先提醒用户。
3. **绝不提交密钥**——`.env`、`credentials.json`、私钥、token。暂存前扫一遍文件名。

用户要求提交时，直接完成暂存与提交，不必再追加一轮确认。

## 格式

```
<type>(<scope>): <subject>
```

- 冒号 `:` 后**有且仅有一个空格**
- `scope` 可选，但有明确模块归属时应当写
- **subject 用中文**，不超过 **30 个汉字**
- subject 不以句号结尾

超过 30 字通常意味着**这次改动该拆成两条提交**，而不是把 subject 写长。

## type 枚举

| type | 用途 |
| --- | --- |
| `feat` | 新增功能 |
| `fix` | 修复 bug |
| `docs` | 文档、注释 |
| `style` | 代码格式（不影响运行） |
| `refactor` | 重构优化（不增功能、不修 bug） |
| `perf` | 性能优化 |
| `test` | 增加或更新测试 |
| `build` | 打包、构建系统、依赖 |
| `ci` | CI / 配置变更 |
| `chore` | 杂项维护 |
| `revert` | 回退 |

## 特殊提交（豁免上表格式）

有三类提交不套 `<type>(<scope>): <subject>`——不是例外通融，是套了反而更糟。

| 场景 | 格式 | 为什么豁免 |
| --- | --- | --- |
| 合并 | 保留 git / 平台生成的 `Merge ...` | 多数由 PR/MR 平台自动生成，改不动；且 commitlint、semantic-release 等工具靠 `Merge ` 前缀识别并跳过 |
| 回退 | `revert: <被回退的 subject>` | `git revert` 默认就生成这个格式，照用即可 |
| 发布 | `chore(release): v1.2.0` | 发布是杂项维护，不是新功能——用 `feat` 会污染 changelog |

给 merge commit 套 `chore(merge): ...` 会让它被当成普通提交写进 changelog，
一条「杂项维护」混在功能列表里，纯噪声。看到默认的 `Merge branch ...` 不要"修正"它。

**但 body 判据照旧适用**——合并冲突的解决取舍常常正是「无法从 diff 看出来」的典型：
哪两侧改动正交、为什么某行必须放在某个守卫之前、哪处是 git 未标记的语义冲突。
这类信息只存在于解冲突者的头脑里，值得写进 merge commit 的 body。

`release:` / `merge:` 都不是合法 type，别造。

## 何时写 body（例外，非常态）

**唯一判据：「为什么这么改」无法从 diff 看出来。**

需要 body：
- 修复的根因不直观（竞态、时序、上游行为差异）
- 做了反直觉的取舍，后人可能想改回去
- 有破坏性变更需要说明迁移方式

不需要 body（绝大多数情况）：
- 新增功能，diff 自解释
- 改文档、改格式、加测试
- subject 已经说清了

body 至多 2 行，写「为什么」，不复述「做了什么」。
**禁止**为凑内容而把一次改动拆成 bullet 列表罗列——那是 diff 的职责。

唯一的例外是合并冲突的解决说明：逐处交代取舍时，2 行放不下，
按冲突点分条写清楚即可——那不是凑内容，每条都在回答「为什么这样解」。

## 破坏性变更

```
feat(api)!: 移除已废弃的 v1 端点
```

或用 footer：

```
feat(config): 允许配置继承其他配置

BREAKING CHANGE: extends 字段行为变更，旧配置需手动迁移
```

## 工作流

### 1. 读取改动

```bash
git status --porcelain
git diff --staged          # 有暂存内容时以此为准
git diff                   # 暂存区为空时看工作区
```

### 2. 暂存

暂存区为空时按**逻辑分组**暂存——一次提交只包含一个逻辑变更。
改动明显跨越多个关注点时，主动提议拆成多条提交并说明分组理由。

### 3. 提交

单行（默认）：

```bash
git commit -m "fix(streaming): 修复推理模型 thinking 块未闭合"
```

带 body（例外）：

```bash
git commit -m "$(cat <<'EOF'
fix(tokens): 将工具流量计入 count_tokens

不计入会导致上下文自动压缩不触发，长会话时静默截断。
EOF
)"
```

## Trailer

`Co-Authored-By:`、`Signed-off-by:` 这类 footer trailer 由环境决定——
系统指令或仓库约定要求加就加，本 skill 既不规定也不禁止，两者不冲突。

只有一条要求：trailer 与 body 之间空一行，且集中放在信息末尾。
trailer 不计入 body 的「至多 2 行」限额。

## 安全协议

- 绝不修改 git config
- 绝不在未获明确要求时执行破坏性命令（`--force`、`reset --hard`）
- 绝不 `--no-verify` 跳过 hook
- 绝不向 main/master 强推
- hook 失败时：修复问题后**新建**提交，不要 `--amend`

## 示例

正例：

```
fix(streaming): 修复非 Claude 模型 thinking 块未闭合
feat(config): 支持 WORKERS 多进程配置
refactor(logging): 用应用层日志替代 uvicorn access log
docs(skill): 补充兑换码创建流程
chore: 忽略 .omc/ 工具状态目录
Merge branch 'feature/session-recovery' into 'main'    ← 合并保留默认格式
chore(release): v1.2.0
```

反例（均取自真实历史）：

```
feat: udpate                     ← 拼写错误 + subject 无信息量
feat: udpate -mfeat: udpate      ← -m 参数漏进了 message
update                           ← 缺 type
权益日报工具调用超时设置成200s      ← 缺 type
merge code                       ← 合并该保留默认 Merge 格式，别自创
merge: integrate main into feat  ← merge 不是合法 type
release: v0.1.15                 ← 应为 chore(release): v0.1.15
```
