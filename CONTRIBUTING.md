# Contributing to ace

Thank you for your interest in contributing to ace!

ace is hosted on both **GitHub** (open source) and **GitLab** (internal). The workflow is nearly identical — pick whichever platform your repository lives on.

## Development Setup

1. Fork (GitHub) or create a branch (GitLab) from the repository
2. Install dependencies: `npm install`
3. Link locally: `npm link`
4. Test your changes: `ace init --dry-run`

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run tests |
| `npm run lint` | Lint source code |
| `node bin/ace.js init --dry-run` | Test without side effects |
| `node bin/ace.js doctor` | Verify installation |

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation only
- `refactor:` — Code change that neither fixes a bug nor adds a feature
- `chore:` — Build process or auxiliary tool changes
- `test:` — Adding or correcting tests

## Pull / Merge Request Process

| Step | GitHub | GitLab |
|------|--------|--------|
| 1 | Fork repo, create feature branch | Create feature branch from `main` |
| 2 | Make changes with clear commits | Same |
| 3 | Ensure `npm test` and `npm run lint` pass | Same |
| 4 | Update CHANGELOG.md under `[Unreleased]` | Same |
| 5 | Open a **Pull Request** | Open a **Merge Request** |

Both platforms have templates that pre-fill a checklist for you.

## CI Pipelines

| Platform | Config | Triggers |
|----------|--------|----------|
| GitHub | `.github/workflows/ci.yml` | push, pull_request |
| GitLab | `.gitlab-ci.yml` | push, merge_request |

Both run lint + test across Node 18/20/22. The GitLab pipeline additionally uses per-version caching for faster runs.

## Project Structure

```
ace/
├── bin/          CLI entry point
├── src/
│   ├── commands/ CLI command handlers (init, doctor, list, uninstall)
│   └── core/     Core logic (constants, installer, merger)
├── templates/    Files installed to ~/.claude/ (rules, hookify, hooks, memory)
├── plugin/       Claude Code plugin (skills + commands)
├── tests/        Test suite
└── docs/         Documentation
```

## Reporting Issues

**GitHub**: Use [GitHub Issues](../../issues).
**GitLab**: Use [GitLab Issues](../../-/issues).

Please include:

- ace version (`ace --version`)
- Node.js version (`node --version`)
- Operating system
- Steps to reproduce
- Expected vs actual behavior
