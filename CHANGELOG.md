# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0-snapshot.3] - 2026-04-16

### Fixed
- Plugin installation failure: `Plugin "ace" not found in marketplace "ace-local"`
- Root cause: `ace init` did not create local marketplace directory or register in `known_marketplaces.json`

### Added
- Local marketplace self-registration during `ace init` (marketplace directory + `marketplace.json` + `known_marketplaces.json` entry)
- `mergeKnownMarketplaces()` and `removeKnownMarketplace()` in merger.js
- `setupMarketplace()` method in installer.js
- Doctor checks for marketplace directory, `marketplace.json`, and `known_marketplaces.json`
- Uninstall cleanup for marketplace directory and `known_marketplaces.json` entry

## [0.1.0-snapshot.2] - 2026-04-15

### Added
- `ace uninstall` command for clean removal with config restore
- Plugin architecture: skills and commands as Claude Code plugin (`ace:*` namespace)
- Pre-install backup mechanism (`.pre-ace` snapshots)
- `ace` prefix for hookify rules and hook scripts (namespace isolation)
- npm publish support with scoped registry

### Changed
- Rules moved to `rules/ace/` subdirectory for namespace isolation
- Skills/commands moved from `templates/` to `plugin/` directory
- Settings.json merge now uses deep merge with hook deduplication

## [0.1.0-snapshot.1] - 2026-04-15

### Added
- Initial CLI with `ace init`, `ace doctor`, `ace list` commands
- 7 cognitive and code-quality rules (thinking, clean-code, code-quality, reporting, task-recovery, context-hygiene, memory-policy)
- 4 AI skills (auto-goal, coding, skill-creator, skill-optimize)
- 3 hookify safety guards (block-dangerous-ops, protect-secrets, require-verification)
- Role-based hook installation (backend, frontend, client, fullstack)
- Smart merge for CLAUDE.md and settings.json
- Memory templates with role-based developer profiles
