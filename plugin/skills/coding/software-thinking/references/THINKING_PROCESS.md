# Thinking Process — The Mandatory 6-Step Sequence

> This is the NON-NEGOTIABLE thinking protocol.
> Every time you modify code — no exceptions — execute these steps IN ORDER.
> Skipping steps is the single most common cause of bad design.

---

## The Sequence

```
┌─────────────────────────────────────────┐
│  Step 1: UNDERSTAND THE BUSINESS        │
│  What real-world problem are we solving? │
├─────────────────────────────────────────┤
│  Step 2: BUILD THE CONCEPT MODEL        │
│  What concepts exist? How do they       │
│  relate?                                │
├─────────────────────────────────────────┤
│  Step 3: DEFINE BOUNDARIES              │
│  Where do concepts begin and end?       │
│  What changes independently?            │
├─────────────────────────────────────────┤
│  Step 4: ANALYZE INFORMATION FLOW       │
│  What data moves between boundaries?    │
│  What transformations occur?            │
├─────────────────────────────────────────┤
│  Step 5: REMOVE ACCIDENTAL COMPLEXITY   │
│  What exists only because of how we     │
│  coded it, not because the business     │
│  needs it?                              │
├─────────────────────────────────────────┤
│  Step 6: MODIFY CODE                    │
│  Only now — write or change code.       │
│  The code should be a natural           │
│  expression of Steps 1-5.              │
└─────────────────────────────────────────┘
```

---

## Step 1: Understand the Business

**Goal:** Know WHAT the system does and WHY before touching HOW.

### Questions to Answer

- What real-world process does this code support?
- Who are the actors? What are their goals?
- What events trigger behavior? What outcomes matter?
- What rules govern the domain?
- What vocabulary do domain experts use?

### Verification

You have sufficient understanding when:
- You can explain the feature to a non-technical stakeholder in one paragraph
- You can identify what SUCCESS looks like from the user's perspective
- You can name the domain concepts involved (not code concepts — domain concepts)
- You can state what should NOT happen (invariants, constraints)

### Common Failure Mode

```
WRONG: "I need to add a method to OrderService that calls PaymentGateway"
       (This is implementation thinking. You skipped Step 1.)

RIGHT: "When a customer completes checkout, we must authorize payment
        before confirming the order. Authorization can succeed, fail,
        or require additional verification."
       (This is business understanding. Now you can design.)
```

---

## Step 2: Build the Concept Model

**Goal:** Identify the business concepts and their relationships — independent of any technology.

### Process

1. **Extract nouns** from the business description → candidate concepts
2. **Extract verbs** → candidate behaviors
3. **Extract rules** → candidate invariants
4. **Filter:** remove implementation-leaked concepts (anything a business person wouldn't recognize)
5. **Relate:** draw connections (owns, triggers, transforms, contains)

### Output Format

```
Concepts:
  - [ConceptName]: [one-sentence responsibility]
  - [ConceptName]: [one-sentence responsibility]

Relationships:
  - [ConceptA] --triggers--> [ConceptB]
  - [ConceptC] --owns--> [ConceptD]

Invariants:
  - [Rule that must always hold]
  - [Constraint that limits behavior]
```

### Verification

- Every concept maps to a word in the business vocabulary
- No concept exists solely for "technical reasons"
- Relationships are directional and meaningful
- Invariants are business rules, not code rules

### Common Failure Mode

```
WRONG concept model:
  - OrderService (service is implementation, not concept)
  - OrderDTO (DTO is a technical artifact)
  - OrderRepository (repository is infrastructure)
  - OrderMapper (mapper is plumbing)

RIGHT concept model:
  - Order: represents a customer's purchase commitment
  - LineItem: one product within an order
  - Fulfillment: the process of delivering what was ordered
  - Payment: the financial settlement for an order
```

---

## Step 3: Define Boundaries

**Goal:** Determine which concepts belong together (cohesion) and which should be separate (decoupling).

### The Boundary Test

Two concepts belong in the SAME boundary when:
- They change for the same business reason
- They share the same lifecycle
- They are always needed together (high cohesion)
- A domain expert discusses them as one topic

Two concepts belong in DIFFERENT boundaries when:
- They change for different business reasons
- They have different lifecycles
- They can be understood independently
- Different domain experts own them

### Process

1. Group concepts by change reason
2. Identify which groups talk to each other
3. Minimize cross-boundary communication
4. Name each boundary using domain language

### Output Format

```
Boundary: [Name]
  Concepts: [A, B, C]
  Changes when: [business reason]
  Communicates with: [other boundaries and how]
```

### Verification

- Each boundary has a single, clear reason to change
- Cross-boundary communication is explicit and minimal
- No concept spans multiple boundaries
- Boundary names are domain terms, not technical terms

### Common Failure Mode

```
WRONG boundaries (technical layers):
  - Controller layer
  - Service layer  
  - Repository layer
  (Everything changes for every business reason — no isolation)

RIGHT boundaries (business domains):
  - Order context (order lifecycle)
  - Payment context (financial settlement)
  - Inventory context (stock management)
  (Each changes independently for its own business reasons)
```

---

## Step 4: Analyze Information Flow

**Goal:** Understand what data crosses boundaries and how it transforms.

### Questions to Answer

- What information enters each boundary?
- What information leaves each boundary?
- What transformations happen inside?
- What is the minimal information needed at each crossing?

### Process

1. For each boundary crossing, identify:
   - Source concept → Target concept
   - What data flows
   - Why it flows (what triggers it)
   - What shape it needs to be (transformation)
2. Minimize: can any crossing be eliminated?
3. Simplify: can any data be reduced?

### Verification

- No boundary exposes its internal structure
- Each crossing carries the minimum necessary information
- Transformations are explicit (not hidden in "adapters" nobody reads)
- Direction of dependency is intentional

### Common Failure Mode

```
WRONG: OrderService passes the entire Order entity to PaymentService
       (Internal structure leaked across boundary)

RIGHT: OrderContext publishes PaymentRequest{amount, currency, orderId}
       (Minimal, explicit contract)
```

---

## Step 5: Remove Accidental Complexity

**Goal:** Identify and eliminate everything that exists because of HOW we coded it, not because the BUSINESS needs it.

### The Accidental Complexity Test

For every element in the current code, ask:

```
If I were explaining this to a domain expert,
would they say "yes, that's part of our business"?

YES → Essential complexity (keep it)
NO  → Accidental complexity (remove it)
```

### Common Sources of Accidental Complexity

| Source | Example | Fix |
|--------|---------|-----|
| Framework ceremony | AbstractStrategyFactoryBean | Inline it |
| Premature abstraction | Interface with one impl | Remove interface |
| Pattern worship | Observer pattern for one listener | Direct call |
| Layer tax | DTO → Entity → DTO → ViewModel | Direct mapping |
| Defensive programming | Null checks for never-null values | Trust the model |
| Speculative generality | "Might need this later" | Delete it |
| Copy-paste divergence | Two similar but subtly different paths | Unify or separate clearly |

### Process

1. List every class/function/module in the change scope
2. For each: "What business concept does this represent?"
3. If answer is "none" or "it's for technical reasons" → candidate for removal
4. Verify: removing it doesn't break a real business requirement
5. Remove or inline

### Verification

- Every remaining element maps to a business concept
- No "plumbing" code exists that could be eliminated by better design
- The code reads like a description of the business process
- A new team member can understand the business by reading the code

---

## Step 6: Modify Code

**Goal:** Express Steps 1-5 as code. The code should be a NATURAL CONSEQUENCE of the thinking above.

### Pre-flight Check

Before writing any code:
- [ ] I can state the business concept in one sentence
- [ ] I know which boundary this belongs to
- [ ] I know what information flows in and out
- [ ] I have identified no accidental complexity in my plan
- [ ] My change improves the concept model (not just the implementation)

### Writing Rules

1. **Name everything in domain language** — code vocabulary = business vocabulary
2. **One concept per unit** — function/class/module represents exactly one concept
3. **Explicit over clever** — a reader should understand immediately, not after tracing
4. **The test:** read your code aloud. Does it sound like a business description?

### Post-flight Check

After writing code, return to the Review loop:

```
Business    → Did I improve business expressiveness?
Concept     → Is the concept model clearer?
Boundary    → Are boundaries respected?
Information → Is information flow minimal and explicit?
Complexity  → Did I add accidental complexity?
Naming      → Do names reflect the domain?
```

**If any answer is "no" or "I'm not sure" → iterate before committing.**

---

## The Emergency Brake

At ANY point during coding, if you notice:

- You're adding code "just in case"
- You're creating a class that has no business name
- You're implementing a pattern because "it's the right way"
- You can't explain what you're doing in business terms
- The code is getting more complex but the business isn't complex

**STOP. Go back to Step 1.** Something in your understanding is wrong.

---

## Timing Guidance

| Step | Time Budget (relative) | Failure Cost if Skipped |
|------|----------------------|------------------------|
| 1. Understand | 25% | Solve wrong problem |
| 2. Concept Model | 20% | Wrong abstractions |
| 3. Boundaries | 20% | Ripple effects forever |
| 4. Information Flow | 15% | Coupling and leakage |
| 5. Remove Complexity | 10% | Unmaintainable code |
| 6. Code | 10% | (Cheap if 1-5 done right) |

**If you're spending >30% of time on Step 6, you didn't spend enough on Steps 1-5.**
