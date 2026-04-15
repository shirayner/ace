# CLI Reference

## Commands

### `ace init`

Initialize your Claude Code development environment.

```bash
ace init [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --preset <name>` | Installation preset: `full` / `minimal` / `safe` | `full` |
| `-r, --role <name>` | Developer role: `backend` / `frontend` / `client` / `fullstack` | interactive |
| `-f, --force` | Overwrite existing files | `false` |
| `--dry-run` | Show what would be done without making changes | `false` |
| `--no-interaction` | Skip prompts, use defaults | `false` |

### `ace doctor`

Verify installation integrity — checks that all files are in place and config is valid.

```bash
ace doctor
```

### `ace list`

Show installation status of each component (`installed` / `partial` / `missing`).

```bash
ace list
```

### `ace uninstall`

Remove all ace-managed files and restore pre-install config.

```bash
ace uninstall [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-y, --yes` | Skip confirmation prompt | `false` |

## Presets

| Component | full | safe | minimal |
|-----------|:----:|:----:|:-------:|
| core (CLAUDE.md + settings.json) | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| rules (7 cognitive & code quality rules) | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| plugin (4 skills + 1 command) | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| hooks (role-dependent scripts) | :white_check_mark: | | |
| hookify (3 safety guards) | :white_check_mark: | :white_check_mark: | |
| memory (templates + developer profile) | :white_check_mark: | :white_check_mark: | |
