# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
