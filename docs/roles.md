# Roles

Roles determine which conditional components are installed and what developer profile is generated.

## Available Roles

| Role | Label | Primary Language | Conditional Hooks |
|------|-------|------------------|-------------------|
| `backend` | Backend Developer | Java | ace.java-compile-check.sh |
| `frontend` | Frontend Developer | TypeScript | — |
| `client` | Client Developer | Kotlin/Swift | — |
| `fullstack` | Fullstack Developer | TypeScript + Java | ace.java-compile-check.sh |

## How Roles Work

1. **During `ace init`**, you select a role interactively (or pass `--role <name>`)
2. Role determines:
   - Which **hook scripts** are installed (only hooks matching your role's language stack)
   - Which **developer profile** template is placed in `~/.claude/memory/user_profile.md`
3. Rules, skills, hookify guards, and core config are **role-independent** — they install the same for all roles

## Developer Profiles

Each role comes with a pre-written `user_profile.md` memory file that helps Claude Code understand your development context (language preferences, common patterns, tool stack). This file is only installed if it doesn't already exist.
