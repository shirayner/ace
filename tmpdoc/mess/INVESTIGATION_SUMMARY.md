# OpenSpec Path Resolution - Quick Reference

## The Core Issue

When `config.yaml` says:
```yaml
rules:
  proposal:
    - "Read shared/alignment-protocol.md"
```

Claude Code is confused about WHERE `shared/alignment-protocol.md` actually is:

| Location | Status |
|----------|--------|
| `/d/Users/r.shi/work-space/incubator/ace/shared/alignment-protocol.md` | ❌ DOESN'T EXIST |
| `/d/Users/r.shi/work-space/incubator/ace/plugin/shared/alignment-protocol.md` | ✅ ACTUALLY HERE |

## Why This Happens

### Path Resolution Chain

```
config.yaml says:          "Read shared/alignment-protocol.md"
                                      ↓
Claude Code interprets as: "From project root, find shared/alignment-protocol.md"
                                      ↓
Project root is:           /d/Users/r.shi/work-space/incubator/ace/
                                      ↓
Claude looks for:          /d/Users/r.shi/work-space/incubator/ace/shared/alignment-protocol.md
                                      ↓
But file is actually at:   /d/Users/r.shi/work-space/incubator/ace/plugin/shared/alignment-protocol.md
                                      ↓
Result:                    FILE NOT FOUND ERROR ✗
```

## Three Different Path Resolution Contexts

### 1️⃣ SKILL Files (✅ WORKS)
```
Location: plugin/skills/auto-goal/SKILL.md
Contains: Read `../../../../shared/alignment-protocol.md`

Resolution:
  From SKILL location → Up 4 levels → plugin/ → then shared/
  Final: plugin/shared/alignment-protocol.md ✓
  
Why it works: Claude Code resolves relative paths from SKILL file location
```

### 2️⃣ Config.yaml Rules (❌ BROKEN)
```
Location: openspec/config.yaml
Contains: Read shared/alignment-protocol.md

Resolution:
  From project root → shared/
  Final: /project/shared/alignment-protocol.md ✗ NOT FOUND
  
Why it breaks: Paths are interpreted from project root, not where files actually are
```

### 3️⃣ Plugin Resource System
```
Where files actually live: plugin/shared/
How plugin system sees it: Part of plugin resource directory
How Claude should see it: plugin/shared/ (but config.yaml doesn't say this)
```

## OpenSpec vs Claude Code

| Aspect | OpenSpec | Claude Code |
|--------|----------|------------|
| **What it does** | Installs CLI, creates project structure, validates YAML schema | Loads plugins, injects context, executes rules |
| **Path resolution** | None (just text) | From project root (or from file location in SKILL files) |
| **Config loading** | Validates YAML syntax | Reads and injects into system context |
| **Plugin integration** | Not aware of Claude Code | Has ACE plugin at plugin/ |

## The Gap

**OpenSpec:** "Here's the structure and rules"  
**Claude Code:** "Here's how I'll use them"  
**THE GAP:** "But WHERE are the files you want me to read?"

- OpenSpec says paths like `shared/alignment-protocol.md`
- Claude Code looks for them in project root
- Files are actually in `plugin/shared/`
- Nobody is translating between them!

## Solution Options

### Option A: Path Translation (Best)
Before injecting config into Claude, rewrite:
```
shared/alignment-protocol.md → plugin/shared/alignment-protocol.md
```

### Option B: Symlink
```bash
ln -s plugin/shared shared  # Create symlink in project root
```

### Option C: Copy Files
```bash
cp -r plugin/shared/* shared/  # Copy shared resources to project root
```

### Option D: Absolute Paths
Inject absolute paths instead of relative:
```
/d/Users/r.shi/work-space/incubator/ace/plugin/shared/alignment-protocol.md
```

## File Locations (Actual)

**Plugin Resources:**
- `/d/Users/r.shi/work-space/incubator/ace/plugin/shared/alignment-protocol.md` ✅
- `/d/Users/r.shi/work-space/incubator/ace/plugin/shared/parallel-protocol.md` ✅
- `/d/Users/r.shi/work-space/incubator/ace/plugin/shared/context-discipline.md` ✅
- `/d/Users/r.shi/work-space/incubator/ace/plugin/shared/experience-protocol.md` ✅
- `/d/Users/r.shi/work-space/incubator/ace/plugin/shared/verification-protocol.md` ✅
- `/d/Users/r.shi/work-space/incubator/ace/plugin/shared/state-template.md` ✅

**Config Template:**
- `/d/Users/r.shi/work-space/incubator/ace/templates/openspec/config.yaml` ✅

**Project's config.yaml (after init):**
- `{project}/openspec/config.yaml` ✅

## How It Should Work

```
Claude Code opens project
  ↓
Loads ACE plugin from plugin/
  ↓
Plugin discovers openspec/config.yaml
  ↓
Plugin reads config.yaml
  ↓
Plugin TRANSLATES paths:
  "Read shared/alignment-protocol.md"
  becomes
  "Read plugin/shared/alignment-protocol.md"
  ↓
Plugin injects into Claude's context
  ↓
Claude can now find all referenced files ✓
```

## Key Takeaways

1. **OpenSpec != Claude Code** — They're separate tools that need to work together
2. **Path ambiguity is real** — "shared/alignment-protocol.md" has no single meaning
3. **Plugin system has its own path rules** — Relative paths in SKILL files work differently
4. **The gap is in integration** — Someone needs to translate paths when config gets injected
5. **Current state** — Files exist, config exists, but the translation doesn't happen

## Next Steps

If you want this to work properly:

1. Find where ACE plugin injects config.yaml into Claude's context
2. Add path translation logic there
3. Rewrite `shared/xxx` → `plugin/shared/xxx` before injection
4. Verify all referenced files can be found
5. Test with Claude Code to confirm paths resolve correctly

---

**Investigation complete** — The issue is clear: there's a path resolution mismatch between where OpenSpec puts reference files and where Claude Code looks for them.
