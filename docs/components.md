# Components

Detailed description of everything ace installs.

## Core

- **CLAUDE.md** — Global config index with `@` references pointing to each rule file
- **settings.json** — Claude Code base settings (auto memory directory, hookify plugin enabled, ace plugin enabled)

## Rules (8 rules)

Installed to `~/.claude/rules/ace/`:

| Rule | Purpose |
|------|---------|
| thinking.md | Deep thinking principles (observe, verify, depth, breadth, discern, simplify) |
| clean-code.md | Clean Code six core principles |
| code-quality.md | Code quality standards (auto-loaded when editing code files) |
| reporting.md | Auto-output analysis reports to markdown files |
| task-recovery.md | Task interruption recovery protocol |
| context-hygiene.md | Context hygiene and compaction protection |
| memory-policy.md | Memory quality policy for cross-session reuse |
| interactive-clarify.md | Interactive clarification rules for user-facing prompts |

## Plugin (4 skills + 1 command)

Installed as a Claude Code plugin under the `ace:` namespace:

| Skill | Purpose |
|-------|---------|
| `ace:auto-goal` | Autonomous goal completion (OODA loop + domain-aware routing) |
| `ace:coding` | Code domain cognitive protocol (implement / test / review intents) |
| `ace:skill-creator` | Create and evaluate new skills |
| `ace:skill-optimize` | Optimize existing skills based on seven timeless principles |

| Command | Purpose |
|---------|---------|
| `ace:report` | Analyze a topic and write incremental markdown reports |

## Hookify (3 safety guards)

| Guard | Purpose |
|-------|---------|
| block-dangerous-ops | Block `rm -rf`, `git push --force`, and other dangerous commands |
| protect-secrets | Warn when editing `.env`, key files, and other secrets |
| require-verification | Remind to compile and test before delivery |

## Hooks

| Hook | Roles | Purpose |
|------|-------|---------|
| ace.java-compile-check.sh | backend, fullstack | Auto compile-check after editing Java files |

## Memory

- **MEMORY.md** — Memory index template (skipped if already exists)
- **user_profile.md** — Role-based developer profile generated from selected role

## Spec (project-level)

Installed to project directory via `ace spec init`:

- **config.yaml** — OpenSpec 配置文件（aspec v9：context 注入流程/约束/协议，rules 注入阶段门禁）
- **dimensions.md** — 澄清维度（需求 6 维度 + 设计 7 维度 + 项目已知盲区）
- **experience-template.md** — 项目经验库（技术决策/领域词汇/风险图谱/复盘记录）
