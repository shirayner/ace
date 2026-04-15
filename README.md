[English](README.md) | [中文](README.zh-CN.md)

<div align="center">

# ace

**One command to set up your Claude Code harness.**

[![npm version](https://img.shields.io/npm/v/@shirayner/ace)](https://www.npmjs.com/package/@shirayner/ace)
[![license](https://img.shields.io/github/license/shirayner/ace)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@shirayner/ace)](package.json)

</div>

## What it looks like

```
$ ace init
? Your role: Fullstack Developer
? Preset: full
✔ core installed
✔ rules installed
✔ plugin installed (ace:auto-goal, ace:coding, ...)
✔ hookify installed
✔ hooks installed
✔ memory installed
Done! Your AI coding environment is ready.
```

## Why ace?

Claude Code is powerful out of the box — but configuring rules, skills,
safety guards, and memory templates by hand is tedious and error-prone.

**ace solves this in one command:**

- **Rules** — 7 cognitive and code-quality rules (deep thinking, clean code, ...)
- **Skills** — 4 AI skills with namespace isolation (`ace:auto-goal`, `ace:coding`, ...)
- **Safety** — Hookify guards that block dangerous ops and protect secrets
- **Memory** — Templates for cross-session memory and developer profiles
- **Non-destructive** — Smart merge preserves your existing config; uninstall restores it

## Quick Start

```bash
npm install -g @shirayner/ace
ace init
```

That's it. Run `ace doctor` to verify.

## What You Get

| Component | Contents | Preset |
|-----------|----------|--------|
| **Core** | `CLAUDE.md` + `settings.json` (smart merge) | all |
| **Rules** | 7 rules: thinking, clean-code, code-quality, ... | all |
| **Plugin** | 4 skills + 1 command (`ace:auto-goal`, `ace:coding`, ...) | all |
| **Hookify** | 3 safety guards (block-dangerous-ops, protect-secrets, ...) | full, safe |
| **Hooks** | Role-dependent scripts (e.g., Java compile check) | full |
| **Memory** | MEMORY.md template + role-based developer profile | full, safe |

## Design Philosophy

1. **Non-destructive by default** — ace merges into your existing config,
   never overwrites. Uninstall restores your original state.

2. **Namespace isolation** — Rules live in `rules/ace/`, skills use
   the `ace:` plugin namespace. Your files and ace's files never collide.

3. **Opinionated but escapable** — ace ships curated defaults for
   deep thinking, clean code, and safety. Disagree? Override any rule
   or uninstall cleanly.

## Documentation

- [CLI Reference](docs/cli-reference.md) — Commands, options, and presets
- [Components](docs/components.md) — Detailed description of all installed components
- [Merge Strategy](docs/merge-strategy.md) — How ace handles existing config files
- [Roles](docs/roles.md) — Role-based installation and developer profiles

## Contributing

Contributions are welcome on both GitHub and GitLab (internal).
See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[MIT](LICENSE)
