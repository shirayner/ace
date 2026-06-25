# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - 2026-06-25

### Added
- **text-to-image** skill：基于 Python 脚本的文生图能力，集成到 plugin 体系
- **test-case-gen** skill：测试用例生成器，含 case-template 与 test-design-methods 参考文档
- **tech-design** skill：技术方案设计 skill 全面重构，新增 forward-design / review / tech-selection 三 phase 流程，含 estimation-guide / quality-attributes / review-checklist / full-design-template / knowledge-anchors 参考文档
- **code-review** skill：独立代码评审 skill，含 code-review-guide 与 code-smells 参考
- **spechub-coding**：新增 `references/phases/prepare.md`（产物消化 + 条件触发的基础设施校验）与 `references/testing-guide.md`（测试框架检测、Mock 陷阱速查）
- **spechub-coding**：`scripts/openspec-init.sh` 一键完成 openspec CLI 安装与目录初始化（取代手动 `openspec init`）
- **spec-coding**：`scripts/openspec-init.sh` 与 spechub 共享初始化逻辑
- **ACE 任务管理**：`ace task` 命令族（`ace task done` 一键 complete + archive），`src/commands/task.js` + `src/core/task-utils.js`
- **shared 协议**：新增 `shared/archive-protocol.md`、`shared/artifacts-schema.md`、`shared/state-template.md` 三份共享规范

### Changed
- **spechub-coding** 状态机重构：原 6-phase（pull/comprehend/readiness/design/implement/verify/archive）合并为 5-phase（pull/prepare/design/implement/verify/archive），COMPREHEND + READINESS 合并为 PREPARE，gate 重新编号 G1/G2/G3
- **spechub-coding** SKILL.md：新增分级介入架构（Tiered Intervention，Level 0-3），G2 改为基于方案确定性的条件式判定（HIGH/MEDIUM/LOW）
- **spechub-coding** 文档语言 HARD RULE：所有生成的文档产物（proposal.md / design.md / tasks.md / prepare-summary.md / handoff-check.md）必须使用中文（代码标识符保持英文）
- **spechub-coding** PULL phase Step 4：分支管理升级为 HARD-GATE，脚本层强制检查（exit 12 = branch_mismatch），AI 无法绕过分支切换
- **spechub-workflow.py**：`start` 命令新增 `enforce_branch_for_start()` 自检，未在 `feat/{changeName}` 分支时拒绝执行并输出 `status: branch_mismatch`；新增 `--allow-branch-mismatch` 逃生口
- **auto-goal** skill：状态模板对齐统一 schema，恢复协议优化
- **requirement-analysis** skill：流程指令收敛
- **spec-coding** archive phase：归档流程优化

### Removed
- **spechub-coding** 旧 reference 文件：`dimensions.md`、`divergence-protocol.md`、`gate-formats.md`、`quality-criteria.md`、`phases/comprehend.md`、`phases/readiness.md`（被新的 prepare.md + state-schema.md 替代）

### Fixed
- **spechub-coding archive**：Git 完整性检查与 ACE 本地归档 mv 步骤补强，避免遗漏

## [1.0.0] - 2026-06-12

### Added
- **spec-coding** skill：全生命周期规范驱动编码（6 Phase + 门禁系统：understand → propose → design → plan → apply → archive）
- **spechub-coding** skill：基于 SpecHub 平台产物的本地编码工作流，与 SpecHub API 双向归档
- **requirement-analysis** skill：需求分析流水线，从原始需求到 PRD + 澄清清单 + anchors 分析
- **llm-wiki-generator** skill：为代码仓库生成 LLM 可消费的结构化知识库（anchors）
- **llm-wiki-reader** skill：渐进式消费 wiki 知识库
- **parallel-dispatch** skill：并行代理调度引擎，支持独立任务并行执行
- **subagent-execute** skill：子代理驱动执行引擎，支持两阶段审查（规范合规 + 代码质量）
- **init** skill（`/ace:init`）：项目技术画像初始化，生成 `.ace/project-profile.md`

### Fixed
- **spechub-coding**：前置检查阶段不再阻塞主流程——`project-profile.md` 不存在时以后台 Agent 并行初始化，PULL 与 init 并行执行，COMPREHEND 阶段才等待 profile 就绪
- **spechub-workflow.py**：移除 `start` 命令中对 `project-profile.md` 的前置检查（该检查属于 COMPREHEND 阶段，不属于 PULL 阶段）

### Removed
- **`ace spec init`** 子命令及实现（`src/commands/spec.js`、`src/core/spec-installer.js`）
- **`ace spec doctor`** 子命令
- **`ace spec update`** 子命令
- 项目级 spec 工作流现由 `openspec init` CLI + `/ace:spec-coding` skill 直接承载，不再需要独立命令

### Changed
- `ace init` 完成提示从 "Go to your project and run ace spec init" 改为引导使用 `/ace:spec-coding` 或 `/ace:spechub-coding`

### Docs
- **README.md**：重写 Skill 概览、快速开始、CLI 命令表（移除 spec 三命令）
- **getting-started.md**：更新规范驱动编码前置说明，移除 `ace spec init` 依赖步骤

## [0.1.11] - 2026-05-26

### Changed
- **parallel-protocol**: Refactored to pure HOW (removed WHEN triggers — each skill declares its own)
- **auto-goal**: Parallel execution section upgraded to [CONSTRAINT] with mandatory trigger table and violation definition
- **config.yaml**: proposal/design/apply rules — parallel constraints extracted as independent rule items with specific scenarios and time anchors
- **config.yaml**: Parallel Agent upper limit unified to ≤8

### Added
- **config.yaml apply**: New [CONSTRAINT] for parallel implementation (code comprehension ≥3 files → parallel Agent; ≥2 independent tasks → parallel implementation)
- **parallel-protocol**: Anti-pattern section (serial exploration bombing)
- **auto-goal**: Dependency analysis requirement during state initialization (mark `⟂` and `depends`)

### Fixed
- **CLAUDE.md**: Language drift fix — interaction language rule upgraded to HARD RULE with explicit anti-drift clause
- **config.yaml**: Parallel constraints were hidden as appendix in multi-line blocks, now promoted to standalone rule items

## [0.1.10] - 2025-05-25

### Changed
- **alignment-protocol**: Rewritten with cognitive complementarity model — AI and human blind spots illuminate each other
- **alignment-protocol**: Added deep thinking discipline (序验深广辨简), Socratic questioning, problem-driven exploration, and Defeater search
- **alignment-protocol**: Added depth quality gate (new inference, premise audit, Defeater check, sufficiency)
- **spec-installer**: Removed `installShared()` — shared protocols now referenced directly from plugin directory (DRY)
- **config.yaml**: All `openspec/shared/` paths changed to `~/.claude/plugins/marketplaces/ace-local/shared/` (single source of truth)
- **config.yaml**: Schema version bumped to 14.0.0

### Added
- Skill split architecture: skills moved to plugin directory with shared protocols
- Task management optimizations

### Removed
- `openspec/shared/` directory creation during `ace spec init` (no longer needed)

## [0.1.8-SNAPSHOT] - 2026-05-07

### Changed
- **Breaking**: Rule files moved from `~/.claude/rules/ace/` to `~/.claude/ace/rules/` (unified namespace)
- **Breaking**: CLAUDE.md template rewritten — replaced `@` eager-loading references with inline essentials + path-index lazy-loading (~77% token reduction)
- Removed hookify `@` references from CLAUDE.md (security now fully zero-token via external mechanisms)
- Enhanced "深" thinking principle with Socratic questioning techniques (追问前提/替代/问题本身)

### Added
- Auto-migration from legacy `rules/ace/` to new `ace/rules/` directory on `ace init`
- `ace/team/` directory with team conventions: languages (java.md) and frameworks (ctrip-frameworks, dal, soa, member-common)
- `team` component in PRESETS (full, safe) with recursive directory installation
- Git workflow rules: `git.md` (commit conventions) and `gitflow.md` (branch management)
- CLAUDE.md template adds "团队规范" path-index section for `ace/team/`
- `Installer.prepare()` public method for pre-installation setup
- `Installer.installRecursiveDir()` for nested directory tree installation
- Doctor check for path-index style references in CLAUDE.md

### Fixed
- `isAceOwnedRef` now correctly handles `@` prefix in reference paths
- `isAceOwnedFile` normalizes Windows backslashes for cross-platform regex matching
- `mergeClaudeMdFile` skip logic: uses content comparison instead of ref count (works with new template format)
- Uninstall surgically removes managed section and hookify references

## [0.1.4] - 2026-04-23

### Changed
- Reorganized reports directory: moved auto-goal related reports to `reports/auto-goal-evolution/`
- Added ASPEC optimization analysis document
- Added agent design philosophy research (2025-2026)

## [0.1.3] - 2026-04-23

### Changed
- Redesigned auto-goal skill: streamlined instruction set, mandatory alignment protocol, tiered state management, experience evolution system
- Updated coding skill with refined instructions
- Permission mode default set to `auto` in settings template
- Simplified interactive-clarify rule (unified tool guidance)

### Fixed
- ACE-owned file detection logic in installer

## [0.1.2] - 2026-04-21

### Added
- Hookify safety guard system with 7 built-in rules: `block-dangerous-ops`, `code-quality-gate`, `dangerous-commands`, `protect-secrets`, `require-verification`, `safe-git-commands`, `sensitive-data`
- ACE-owned files auto-overwrite with marker-based CLAUDE.md merge strategy
- UI module (`src/core/ui.js`) for improved CLI interaction
- Complete documentation library: architecture, getting-started, theory, reference, why-ace sections
- English README (`README.en-US.md`)
- RELEASE_NOTES.md for release highlights

### Changed
- Enhanced `ace init` command with improved preset/role selection UX
- Expanded installer with auto-overwrite logic for ACE-managed files
- Improved merger with marker-based CLAUDE.md merge strategy
- Updated `settings.json` template with expanded permissions and hookify integration
- Refined auto-goal skill instructions
- Updated hookify rule naming convention (`hookify.ace.*`)

### Removed
- Deprecated spec-installer stub methods

## [0.1.0] - 2026-04-16

### Added
- `ace init` command with preset (`full` / `safe` / `minimal`) and role (`backend` / `frontend` / `client` / `fullstack`) selection
- `ace doctor` command to verify installation integrity
- `ace list` command to show component installation status
- `ace uninstall` command for clean removal with config restore
- `ace spec` command family for spec-driven development workflow (`spec init`, `spec doctor`, `spec update`)
- 8 cognitive and code-quality rules (thinking, clean-code, code-quality, reporting, task-recovery, context-hygiene, memory-policy, interactive-clarify)
- 4 AI skills with `ace:` namespace isolation (auto-goal, coding, skill-creator, skill-optimize)
- 1 command (`ace:report`)
- 3 hookify safety guards (block-dangerous-ops, protect-secrets, require-verification)
- Role-based hook installation (e.g., Java compile check for backend/fullstack)
- Smart merge for CLAUDE.md and settings.json (non-destructive)
- Pre-install backup mechanism (`.pre-ace` snapshots) with uninstall restore
- Plugin architecture with local marketplace self-registration
- OpenSpec templates: taxonomy, issues, procedures, evolution, and retrospective
- Memory templates with role-based developer profiles
- `js-yaml` dependency for YAML merge support
- npm publish support with scoped registry
- GitHub Actions CI (Node 18/20/22, ubuntu/windows/macos) and publish workflow
- GitLab CI (Node 18/20/22)
