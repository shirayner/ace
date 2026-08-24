---
name: software-thinking
description: |
  Software design methodology — teaches AI to think like an architect before writing code.
  Applies to ALL coding scenarios: new features, bug fixes, refactoring, code review, design.
  
  This is NOT a code generation prompt. It is a Continuous Architecture Review system.
  
  Trigger signals:
  - User invokes /software-thinking explicitly
  - Other skills (coding, spec-coding, code-review) reference this as a thinking foundation
  - User asks for architectural guidance, design review, or concept-level analysis
  
  DO NOT TRIGGER: Pure learning/research with no code target (→ auto-goal); trivial one-line edits where the answer is obvious.
allowed-tools: Read, Write, Edit, Bash, Agent, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate, TaskList
---

# Software Thinking — AI Software Design Methodology

> **Software is not code. Software is a model of a business world.**
> Code exists to express concepts. Concepts define boundaries.
> Boundaries organize behavior. Behavior manipulates information.
> Implementation is merely a projection.
> **Always optimize the conceptual model first. Everything else is secondary.**

---

## Core Protocol

Before modifying any code, execute this thinking sequence:

```
Step 1: Understand the Business
Step 2: Build the Concept Model
Step 3: Define Boundaries
Step 4: Analyze Information Flow
Step 5: Remove Accidental Complexity
Step 6: Only then — modify code
```

After modifying code, execute the Review loop:

```
Business → Concept → Boundary → Information → Complexity → Naming
```

If business understanding has not improved → the change is wrong.

---

## Dimension Loading

This skill is structured as multiple focused files. Load the relevant dimension(s) based on the task:

| Task Type | Primary Load | Secondary Load |
|-----------|-------------|----------------|
| New feature design | THINKING_PROCESS.md → DOMAIN_MODELING.md → BOUNDARY_DESIGN.md | INFORMATION_FLOW.md |
| Refactoring | THINKING_PROCESS.md → REFACTORING.md → COMPLEXITY.md | ABSTRACTION.md |
| Code review | REVIEW.md → CHECKLIST.md → ANTI_PATTERNS.md | NAMING.md |
| Naming decisions | NAMING.md → DOMAIN_MODELING.md | examples/naming/ |
| Architecture decisions | DECISION_RULES.md → BOUNDARY_DESIGN.md → INFORMATION_FLOW.md | ABSTRACTION.md |
| Bug fix analysis | THINKING_PROCESS.md → COMPLEXITY.md | BOUNDARY_DESIGN.md |

**Loading protocol:**
1. Always load THINKING_PROCESS.md first (the thinking sequence is non-negotiable)
2. Load dimension files via `Read references/{filename}` based on task type
3. Load examples via `Read references/examples/{category}/{file}` when concrete illustration is needed

---

## The Three Laws

1. **Concept Before Code** — Never write code without a clear concept model. If you cannot name what you're building in business terms, stop.

2. **Delete Before Add** — The best code is no code. Before adding anything, ask: can I achieve this by removing or unifying existing concepts?

3. **Surprise = Stop** — If a design decision would surprise a domain expert reading the code, the design is wrong. Pause and re-think.

---

## Anti-Cargo-Cult Principle

Do NOT blindly apply patterns. Every decision must pass:

```
Does this pattern serve the business concept?
  YES → Apply
  NO  → It's cargo cult. Remove it.
```

Patterns exist to express concepts. Concepts do not exist to justify patterns.

---

## Checklist (Quick Reference)

Before coding:
- [ ] Do I truly understand the business?
- [ ] Have I built a concept model?
- [ ] Have I identified boundaries?
- [ ] Have I analyzed what changes and why?
- [ ] Have I analyzed information flow?

After coding:
- [ ] Are there duplicate concepts?
- [ ] Are there false abstractions?
- [ ] Is there accidental complexity?
- [ ] Is there navigation overhead?
- [ ] Is there concept leakage?
- [ ] Can I delete anything?
- [ ] Can I unify anything?
- [ ] Can I name anything better?

For the complete checklist with decision criteria, Read `references/CHECKLIST.md`.

---

## File Index

| File | Purpose |
|------|---------|
| `references/MANIFESTO.md` | First principles — what software is |
| `references/THINKING_PROCESS.md` | The mandatory 6-step thinking sequence |
| `references/DECISION_RULES.md` | Decision trees for all design choices |
| `references/DOMAIN_MODELING.md` | Technology-agnostic concept modeling |
| `references/BOUNDARY_DESIGN.md` | Boundaries and context mapping |
| `references/INFORMATION_FLOW.md` | Data flow and transformations |
| `references/COMPLEXITY.md` | Essential vs accidental complexity |
| `references/ABSTRACTION.md` | Abstraction principles |
| `references/REFACTORING.md` | Refactoring as concept optimization |
| `references/NAMING.md` | Ubiquitous language in code |
| `references/REVIEW.md` | Self-review: thinking audit |
| `references/CHECKLIST.md` | Complete development checklist |
| `references/ANTI_PATTERNS.md` | Common anti-patterns catalog |
| `references/examples/` | Concrete before/after cases |
