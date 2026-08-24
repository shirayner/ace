# Checklist — Development and Refactoring Verification

> This is the complete, actionable checklist.
> Use it BEFORE coding (pre-flight) and AFTER coding (post-flight).
> Every item is a YES/NO gate. "Maybe" = NO.

---

## Pre-Flight Checklist (Before Writing Code)

### Understanding Gate

| # | Check | Verification |
|---|-------|-------------|
| 1 | **Do I truly understand the business problem?** | Can explain to a non-technical person in 1 paragraph |
| 2 | **Can I state the success criteria?** | Can write a sentence starting with "Done when..." |
| 3 | **Do I know who the actors are?** | Can name the humans/systems that trigger/receive |
| 4 | **Do I know the domain vocabulary?** | Can use the same words a domain expert uses |
| 5 | **Have I identified what should NOT happen?** | Can state at least one invariant/constraint |

**If any answer is NO → Stop. Understand first.**

### Concept Gate

| # | Check | Verification |
|---|-------|-------------|
| 6 | **Have I identified the business concepts?** | Can list them as nouns a domain expert recognizes |
| 7 | **Does each concept have a single responsibility?** | Can state each concept's job in one sentence |
| 8 | **Are relationships between concepts clear?** | Can draw ownership/reference/trigger arrows |
| 9 | **Have I identified which concepts change together?** | Can group them by change reason |
| 10 | **Have I identified which concepts are independent?** | Can state what changes separately |

**If any answer is NO → Stop. Model first.**

### Boundary Gate

| # | Check | Verification |
|---|-------|-------------|
| 11 | **Do I know which boundary this change belongs to?** | Can name it in domain language |
| 12 | **Is the boundary's responsibility clear?** | Can state one reason to change |
| 13 | **Do I know what crosses the boundary?** | Can list the information contracts |
| 14 | **Are cross-boundary dependencies one-directional?** | Can draw arrows without cycles |
| 15 | **Is the crossing minimal?** | Can justify every field that crosses |

**If any answer is NO → Stop. Design the boundary first.**

### Complexity Gate

| # | Check | Verification |
|---|-------|-------------|
| 16 | **Is my plan the simplest that achieves the goal?** | Cannot think of a simpler approach |
| 17 | **Does every new element model a business concept?** | Can name each in domain language |
| 18 | **Am I adding no "just in case" code?** | Every element is needed NOW |
| 19 | **Am I adding no speculative abstractions?** | Every interface has 2+ implementations TODAY |
| 20 | **Does my change reduce or maintain (not increase) concept count?** | Count before ≥ count after |

**If any answer is NO → Simplify the plan.**

---

## Post-Flight Checklist (After Writing Code)

### Business Value Verification

| # | Check | Verification |
|---|-------|-------------|
| 21 | **Does the code express business intent?** | Reading the code tells you what the business does |
| 22 | **Would a domain expert recognize the vocabulary?** | No forbidden names (Manager, Processor, etc.) |
| 23 | **Is the business change isolated?** | Only the relevant boundary was touched |
| 24 | **Is the success criteria met?** | The "Done when..." statement is satisfied |

### Concept Model Verification

| # | Check | Verification |
|---|-------|-------------|
| 25 | **Are there duplicate concepts?** | Same thing modeled once, not twice |
| 26 | **Are there phantom concepts?** | No code concept without business counterpart |
| 27 | **Are there missing concepts?** | No scattered logic that should have a name |
| 28 | **Is each concept in the right boundary?** | Concepts change with their boundary |

### Code Quality Verification

| # | Check | Verification |
|---|-------|-------------|
| 29 | **Is there accidental complexity?** | Every element maps to business |
| 30 | **Is there unnecessary indirection?** | Can trace behavior without excessive jumping |
| 31 | **Are there false abstractions?** | No interface with single impl; no unused generality |
| 32 | **Is information flow explicit?** | No hidden dependencies, no implicit state |
| 33 | **Are impossible states representable?** | Type system prevents invalid combinations |

### Naming Verification

| # | Check | Verification |
|---|-------|-------------|
| 34 | **Do all names express intent, not mechanism?** | WHAT, not HOW |
| 35 | **Are names consistent?** | Same concept, same name everywhere |
| 36 | **Are names at the right level?** | Business terms for domain; tech terms only for infra |
| 37 | **Can names be misunderstood?** | A new reader would interpret correctly |

### Information Flow Verification

| # | Check | Verification |
|---|-------|-------------|
| 38 | **Is information flow unidirectional?** | No circular data dependencies |
| 39 | **Does each function receive only what it needs?** | No god-object passing |
| 40 | **Are boundary crossings minimal?** | Smallest contract that works |
| 41 | **Are transformations named?** | Each data transformation is a concept |

### Deletion Verification

| # | Check | Verification |
|---|-------|-------------|
| 42 | **Can anything be deleted?** | Nothing exists "just in case" |
| 43 | **Can anything be unified?** | No semantic duplicates |
| 44 | **Can anything be inlined?** | No single-use abstractions |
| 45 | **Can anything be simplified?** | No over-engineering for future scenarios |

---

## Refactoring-Specific Checklist

When specifically refactoring (not adding features):

### Before Refactoring

| # | Check |
|---|-------|
| R1 | **I can state the business reason for this refactoring** |
| R2 | **I have tests that verify current behavior** |
| R3 | **I have identified the target concept model** |
| R4 | **I have a plan of small, reversible steps** |
| R5 | **Each step keeps tests green** |

### After Each Refactoring Step

| # | Check |
|---|-------|
| R6 | **Tests still pass** |
| R7 | **Behavior has not changed** |
| R8 | **The concept model moved toward the target** |
| R9 | **No new concepts were added without business justification** |
| R10 | **The change is committed (reversibility point)** |

### After All Refactoring

| # | Check |
|---|-------|
| R11 | **The target concept model is achieved** |
| R12 | **The next business change is now easier** |
| R13 | **A new team member would understand the domain better** |
| R14 | **No "while I'm here" changes were mixed in** |
| R15 | **All tests pass, no behavior changed** |

---

## Code Review Checklist (Reviewing Others' Code)

### Critical (Block if Failed)

| # | Check |
|---|-------|
| CR1 | **No boundary violations** (internal types don't leak) |
| CR2 | **No concept confusion** (each thing has one name, one home) |
| CR3 | **No hidden coupling** (changes won't cascade unexpectedly) |
| CR4 | **Correctness** (business rules implemented faithfully) |

### Important (Request Changes)

| # | Check |
|---|-------|
| CR5 | **Names reflect domain** (no forbidden names) |
| CR6 | **Complexity is justified** (every element has business reason) |
| CR7 | **Information flow is minimal** (no over-sharing across boundaries) |
| CR8 | **No speculative code** (everything needed NOW) |

### Nice-to-Have (Suggest, Don't Block)

| # | Check |
|---|-------|
| CR9 | **Could be simpler** (but works correctly as-is) |
| CR10 | **Naming could be better** (but is not misleading) |
| CR11 | **Structure could be cleaner** (but doesn't cause problems) |

---

## Quick Reference Card

```
BEFORE coding:
  □ Understand business
  □ Build concept model
  □ Identify boundaries
  □ Analyze information flow
  □ Plan simply (no premature abstractions)

AFTER coding:
  □ Business better expressed?
  □ No duplicate concepts?
  □ No phantom concepts?
  □ No accidental complexity?
  □ No forbidden names?
  □ Can delete anything?
  □ Can unify anything?
  □ Can simplify anything?

WHEN reviewing:
  □ Boundary integrity
  □ Concept clarity
  □ Justified complexity
  □ Domain naming
```

---

## The Meta-Check

After completing the checklist, one final question:

> **"If a domain expert spent 5 minutes reading this code,
> would they recognize their business?"**
>
> YES → Ship it.
> NO → Back to the drawing board.
