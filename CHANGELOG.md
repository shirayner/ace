# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
