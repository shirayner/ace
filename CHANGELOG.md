# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
