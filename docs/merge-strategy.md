# Merge Strategy

ace never destroys your existing configuration. Here's how each file type is handled:

## Merge Behaviors

| File | Strategy | Details |
|------|----------|---------|
| CLAUDE.md | **Smart merge** | Appends only missing `@` references; existing content untouched |
| settings.json | **Deep merge** | Preserves your `model`, `theme`, `locale` settings; adds hooks and plugins |
| memory/MEMORY.md | **Skip** | Never modified if already exists |
| Other files | **Skip** | Existing files skipped unless `--force` is used |

## Backup Mechanism

Before modifying any file, ace creates two types of backups:

1. **Pre-install snapshot** (`.pre-ace`) — Created on first install only. Used by `ace uninstall` to fully restore your original config.
2. **Timestamped backup** (`.ace-backup.<timestamp>`) — Created on every merge operation. Allows manual recovery.

## Uninstall Restore

`ace uninstall` restores your config in this order:

1. If a `.pre-ace` snapshot exists → restore it (full fidelity)
2. If no snapshot → surgically remove ace-added content (remove `@~/.claude/rules/ace/` references from CLAUDE.md, remove `ace@ace-local` from settings.json enabledPlugins)
3. Clean up all backup files

## Force Mode

Using `--force` will overwrite existing files, but still creates a `.pre-ace` snapshot first (if one doesn't already exist) so you can always `uninstall` to recover.
