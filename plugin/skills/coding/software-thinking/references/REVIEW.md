# Review — Thinking Audit, Not Code Audit

> This file defines the self-review mechanism.
> We are NOT reviewing code. We are reviewing THINKING.
>
> Code review asks: "Is the code correct?"
> Thinking review asks: "Is the DESIGN correct?"
>
> Correct code with wrong design is worse than incorrect code with right design.
> (Wrong design ships technical debt. Wrong code gets caught by tests.)

---

## The Review Loop

After EVERY code modification, execute this loop:

```
┌──────────────────────────────────────────────────────────┐
│                    THE REVIEW LOOP                         │
│                                                           │
│  1. BUSINESS: Did I improve business expressiveness?      │
│     NO → The change has no business value. Revert or     │
│          justify.                                         │
│                                                           │
│  2. CONCEPT: Is the concept model clearer?                │
│     NO → The change adds confusion. Simplify.            │
│                                                           │
│  3. BOUNDARY: Are boundaries respected?                   │
│     NO → Concept leakage detected. Fix the boundary.     │
│                                                           │
│  4. INFORMATION: Is information flow minimal and explicit? │
│     NO → Data coupling detected. Reduce the contract.    │
│                                                           │
│  5. COMPLEXITY: Did I add accidental complexity?           │
│     YES → Remove what's accidental. Keep what's essential.│
│                                                           │
│  6. NAMING: Do names reflect the domain?                  │
│     NO → Rename until domain experts would recognize it.  │
│                                                           │
│  ALL YES → Change is approved. Commit.                    │
│  ANY NO  → Iterate until all pass.                        │
└──────────────────────────────────────────────────────────┘
```

---

## Review Dimensions in Detail

### Dimension 1: Business Value

**Question:** Does this change make the system better express what the business does?

**Pass criteria:**
- The business capability is more visible in the code
- A domain expert would recognize the improvement
- The change addresses a real business need (not just aesthetics)

**Fail signals:**
- "This is technically better" (without business benefit)
- "This follows best practices" (without solving a problem)
- "This is how it should be done" (by whose standard?)

**Review questions:**
- What business scenario is better served after this change?
- Can I point to a user story, bug report, or requirement this addresses?
- If I showed this to a product manager, would they say "good"?

---

### Dimension 2: Concept Clarity

**Question:** Is the concept model more accurate and easier to understand?

**Pass criteria:**
- Fewer concepts (unified duplicates)
- OR more precisely named concepts (hidden things made explicit)
- OR better organized concepts (correct boundaries)
- A new team member would understand the domain faster

**Fail signals:**
- More concepts than before without business justification
- Concepts named in technical terms
- Concepts that require reading implementation to understand

**Review questions:**
- Count concepts before and after. Did the count go up? Why?
- Can I explain each new concept in one business sentence?
- Are there concepts a domain expert wouldn't recognize?

---

### Dimension 3: Boundary Integrity

**Question:** Do concepts stay within their boundaries?

**Pass criteria:**
- No internal types leak across boundaries
- Cross-boundary communication is through explicit contracts
- Each boundary has a single, clear responsibility
- No circular dependencies between boundaries

**Fail signals:**
- Importing internal types from another boundary
- Passing full entities across boundaries (instead of minimal contracts)
- One change rippling across multiple boundaries
- A boundary knowing about another boundary's implementation details

**Review questions:**
- Draw the dependency arrows. Do they point in one direction?
- What would break if I completely reimplemented one boundary?
- Is cross-boundary communication the minimum necessary?

---

### Dimension 4: Information Minimality

**Question:** Does information flow only where needed, in the minimal form?

**Pass criteria:**
- Each function/method receives only what it needs
- Boundary crossings carry minimum data
- No "just in case" data passing
- No god objects carrying everything

**Fail signals:**
- Methods that receive large objects but use 2 fields
- "Context" objects that accumulate everything
- The same data fetched multiple times in one flow
- Data that passes through layers unchanged

**Review questions:**
- For each parameter: is it actually used? All of it?
- For each boundary crossing: could I send less?
- Are there hidden data dependencies (thread-local, global state)?

---

### Dimension 5: Accidental Complexity

**Question:** Did this change ADD complexity that isn't required by the business?

**Pass criteria:**
- No new concepts without business justification
- No new abstraction layers without proven variation
- No pattern application without a problem it solves
- Code is not longer/more complex for "future" scenarios

**Fail signals:**
- New interface with single implementation
- New abstract class with single subclass
- New factory/builder/strategy for something that doesn't vary
- "We might need this later" code

**Review questions:**
- For each new element: what business concept does it model?
- If I remove it, does any test fail?
- Is there a simpler way to achieve the same business outcome?

---

### Dimension 6: Domain Language

**Question:** Would domain experts recognize the vocabulary in this code?

**Pass criteria:**
- Class/function/variable names use business vocabulary
- No forbidden names (Manager, Processor, Handler, Helper, Util)
- Names express WHAT things are, not HOW they're implemented
- Naming is consistent across the codebase

**Fail signals:**
- Technical jargon in domain code (DTO, DAO, Impl, Abstract...)
- Vague names (data, info, context, item, element)
- Names that require code-reading to understand
- Same concept with different names in different places

**Review questions:**
- Read the class/method names aloud. Do they tell a story?
- Would a domain expert understand the story?
- Are there naming inconsistencies?

---

## Review Severity Levels

| Level | Criteria | Action |
|-------|----------|--------|
| **CRITICAL** | Boundary violation; concept leakage across system | Block. Fix before merge. |
| **HIGH** | Wrong concept model; accidental complexity added | Block. Simplify. |
| **MEDIUM** | Naming doesn't reflect domain; information not minimal | Request change. |
| **LOW** | Minor clarity improvement possible | Suggest. Don't block. |
| **NITPICK** | Style preference; no business impact | Don't mention. |

**Rule:** Only CRITICAL and HIGH should block progress. Everything else is improvement, not requirement.

---

## Review Anti-Patterns

### Anti-Pattern 1: Review Without Understanding

```
WRONG: "This method is too long. Extract methods."
       (No understanding of what the code models)

RIGHT: "This method contains three distinct business concepts
        (validation, pricing, notification). Each should be a
        separate named concept."
       (Understanding drives the suggestion)
```

### Anti-Pattern 2: Pattern Police

```
WRONG: "This violates the Open/Closed Principle."
       (Principles are tools, not laws)

RIGHT: "When we add a new payment method, we have to modify 
        this switch statement AND the factory AND the config.
        A PaymentMethod abstraction would isolate this change."
       (Concrete problem drives the suggestion)
```

### Anti-Pattern 3: Premature Optimization Review

```
WRONG: "This could be more efficient with a different data structure."
       (No evidence of performance problem)

RIGHT: "This O(n²) loop processes our 50k daily orders. Load testing
        shows it takes 30s. Switching to a hash set makes it 200ms."
       (Measured problem drives the suggestion)
```

### Anti-Pattern 4: Style-Driven Review

```
WRONG: "I prefer early returns over nested ifs."
       (Personal preference, not design improvement)

RIGHT: "The nested structure obscures the business logic. The main
        path (happy case) is buried in error handling. Restructuring
        so the happy path reads linearly would improve understanding."
       (Readability of business logic drives the suggestion)
```

---

## Self-Review Checklist (Quick Version)

Before committing, answer honestly:

| # | Question | If NO... |
|---|----------|----------|
| 1 | Is the business better expressed? | What business value justifies this change? |
| 2 | Is the concept model clearer? | What concept is confused or missing? |
| 3 | Are boundaries respected? | What leaked and where? |
| 4 | Is information flow minimal? | What data is unnecessary? |
| 5 | Is accidental complexity absent? | What doesn't model a business concept? |
| 6 | Do names reflect the domain? | What names would a domain expert not recognize? |

**All YES → Commit with confidence.**
**Any NO → Iterate. The design is not finished.**

---

## The Review Mindset

> "I am not reviewing whether the code works.
> Tests tell me that.
>
> I am reviewing whether the code MODELS THE BUSINESS CORRECTLY.
> Only a thinking architect can tell me that.
>
> The question is never 'does it compile?'
> The question is always 'does a domain expert recognize their world in this code?'"
