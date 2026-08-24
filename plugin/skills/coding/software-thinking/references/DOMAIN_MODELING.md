# Domain Modeling — Technology-Agnostic Concept Modeling

> This file discusses CONCEPTS only.
> No Java. No Spring. No Python. No frameworks.
> The domain model exists BEFORE any technology choice.
> If your model changes when you change frameworks, it wasn't a domain model — it was a technology artifact.

---

## What Is a Domain Model?

A domain model is a structured representation of the business concepts and their relationships. It answers:

- What THINGS exist in this business?
- What RESPONSIBILITIES does each thing have?
- What STATE does each thing maintain?
- What BEHAVIOR does each thing perform?
- How do things RELATE to each other?
- Where are the BOUNDARIES?

A domain model is NOT:
- A class diagram (that's implementation)
- A database schema (that's persistence)
- An API contract (that's interface)
- A data flow diagram (that's information architecture)

---

## The Modeling Process

### Phase 1: Discovery — Extract Raw Concepts

**Source:** Business descriptions, user stories, domain expert conversations, existing documentation.

**Method:** Linguistic analysis

| Linguistic Element | Domain Model Element |
|-------------------|---------------------|
| Nouns | Candidate concepts (entities, value objects) |
| Verbs | Candidate behaviors (commands, events) |
| Adjectives | Candidate states or types |
| Rules/Constraints | Invariants |
| "When X then Y" | Domain events and reactions |
| "X belongs to Y" | Ownership/composition relationships |
| "X becomes Y" | State transitions |

**Example:**

> "When a customer places an order, the system checks inventory availability. 
> If all items are available, the order is confirmed and payment is authorized.
> If some items are unavailable, the customer is notified and can modify the order."

Extracted:
- **Concepts:** Customer, Order, Inventory, Item, Payment, Notification
- **Behaviors:** PlaceOrder, CheckAvailability, ConfirmOrder, AuthorizePayment, NotifyCustomer, ModifyOrder
- **States:** Available, Unavailable, Confirmed, Pending
- **Invariants:** Order can only be confirmed if all items are available
- **Events:** OrderPlaced, AvailabilityChecked, OrderConfirmed, PaymentAuthorized

---

### Phase 2: Filtering — Remove Non-Domain Concepts

For each extracted concept, apply:

```
Would a domain expert (non-programmer) recognize this word?
│
├─ YES → Keep it
│
└─ NO → Is it an implementation artifact?
        │
        ├─ YES → Remove it
        │        Examples: Service, Manager, Handler, Processor,
        │        Repository, Factory, Adapter, Mapper, DTO
        │
        └─ NO → Is it a cross-cutting concern?
                │
                ├─ YES → Set aside (it's infrastructure, not domain)
                │        Examples: Logging, Caching, Security, Messaging
                │
                └─ NO → Investigate further. It might be a hidden domain concept.
```

---

### Phase 3: Classification — Categorize Each Concept

| Category | Definition | Key Property | Example |
|----------|-----------|-------------|---------|
| **Entity** | Has identity; persists over time; changes state | Identity + lifecycle | Order, Customer, Account |
| **Value Object** | Defined by attributes; immutable; no identity | Equality by value | Money, Address, DateRange |
| **Aggregate** | Cluster of entities with consistency boundary | Transactional unit | Order + LineItems |
| **Domain Event** | Something that happened; past tense | Immutable fact | OrderPlaced, PaymentFailed |
| **Command** | Intent to change state; imperative | Can be rejected | PlaceOrder, CancelOrder |
| **Policy/Rule** | Business logic that governs behavior | Decision function | PricingPolicy, EligibilityRule |
| **Process** | Multi-step business workflow | State machine | FulfillmentProcess, OnboardingFlow |

### Classification Decision Tree

```
Does it have a unique identity that matters over time?
│
├─ YES: Does it contain other entities with shared invariants?
│       │
│       ├─ YES → AGGREGATE (consistency boundary)
│       │
│       └─ NO → ENTITY
│
└─ NO: Does it represent something that happened?
        │
        ├─ YES → DOMAIN EVENT (past tense, immutable)
        │
        └─ NO: Does it represent an intent to act?
                │
                ├─ YES → COMMAND (imperative, can be rejected)
                │
                └─ NO: Does it embody a business rule or decision?
                        │
                        ├─ YES → POLICY/RULE
                        │
                        └─ NO: Does it describe a property or measurement?
                                │
                                ├─ YES → VALUE OBJECT (immutable, compare by value)
                                │
                                └─ NO: Does it coordinate multiple steps?
                                        │
                                        ├─ YES → PROCESS (workflow/saga)
                                        │
                                        └─ NO → Reconsider. It might not be a domain concept.
```

---

### Phase 4: Relationships — How Concepts Connect

| Relationship | Meaning | Direction | Example |
|-------------|---------|-----------|---------|
| **Owns/Contains** | Lifecycle dependency | Parent → Child | Order owns LineItems |
| **References** | Knows about, no lifecycle coupling | Referrer → Referenced | Order references Customer |
| **Triggers** | Causes another to act | Source → Target | OrderPlaced triggers InventoryReservation |
| **Transforms** | Changes one thing into another | Input → Output | PaymentRequest transforms into PaymentConfirmation |
| **Constrains** | Limits behavior of another | Rule → Subject | PricingPolicy constrains Order total |
| **Extends** | Specializes behavior | General → Specific | ExpressShipping extends ShippingMethod |

### Relationship Rules

1. **Ownership is exclusive** — A child has exactly one parent
2. **References are loose** — Referenced entity can exist independently
3. **Triggers are unidirectional** — Source doesn't know about all targets
4. **Cycles are suspicious** — If A references B references A, the model is likely wrong
5. **Fewer is better** — Every relationship is a coupling. Minimize.

---

### Phase 5: Invariants — The Rules That Must Hold

An invariant is a business rule that must be true at ALL times.

**Formulation pattern:**

```
[Subject] must always [condition] when [context].
```

**Examples:**
- An Order must have at least one LineItem when confirmed
- A Payment amount must equal the Order total when authorized
- An Account balance must never be negative when withdrawing
- A Reservation must not overlap with existing reservations for the same resource

**Invariant Classification:**

| Scope | Where Enforced | Example |
|-------|---------------|---------|
| Single entity | Within the entity itself | "Balance >= 0" |
| Aggregate | Within the aggregate root | "Order total = sum of line items" |
| Cross-aggregate | Via domain events + eventual consistency | "Total reserved <= total stock" |
| Cross-boundary | Via saga/process manager | "Payment matches shipment" |

**Rule:** The scope of an invariant defines the minimum boundary. If an invariant spans two concepts, they probably belong in the same aggregate.

---

### Phase 6: State Analysis — Understanding Change

For each entity/aggregate, model its states:

```
State Machine Template:

[Entity]
├── States: [S1, S2, S3, ...]
├── Transitions:
│   ├── S1 --[event/command]--> S2 [guard: condition]
│   ├── S2 --[event/command]--> S3 [guard: condition]
│   └── S3 --[event/command]--> S1 [guard: condition]
├── Terminal States: [states with no outgoing transitions]
└── Invariants Per State:
    ├── In S1: [what must be true]
    ├── In S2: [what must be true]
    └── In S3: [what must be true]
```

**Example: Order lifecycle**

```
Order
├── States: Draft, Confirmed, Paid, Shipped, Delivered, Cancelled
├── Transitions:
│   ├── Draft --PlaceOrder--> Confirmed [guard: has items, valid address]
│   ├── Confirmed --AuthorizePayment--> Paid [guard: payment succeeds]
│   ├── Paid --Ship--> Shipped [guard: all items fulfilled]
│   ├── Shipped --Deliver--> Delivered [guard: delivery confirmed]
│   ├── Draft --Cancel--> Cancelled [guard: always]
│   ├── Confirmed --Cancel--> Cancelled [guard: before payment]
│   └── Paid --Cancel--> Cancelled [guard: within refund window]
├── Terminal: Delivered, Cancelled
└── Invariants:
    ├── In Confirmed: items.all(available)
    ├── In Paid: payment.amount == total
    └── In Shipped: tracking.exists
```

---

## Output: The Domain Model Document

After completing all phases, the domain model should be expressible as:

```
DOMAIN MODEL: [Context Name]

CONCEPTS:
  [ConceptName] (Entity|ValueObject|Aggregate|...)
    Responsibility: [one sentence]
    State: [key attributes]
    Behavior: [key operations]
    Invariants: [rules that must hold]

RELATIONSHIPS:
  [ConceptA] --[relationship]--> [ConceptB]

STATE MACHINES:
  [Entity]: [State] → [Event] → [State]

DOMAIN EVENTS:
  [EventName]: emitted when [condition], carries [data]

BUSINESS RULES:
  [RuleName]: [formulation]
```

---

## Quality Checks for Domain Models

| Check | Pass Criteria |
|-------|--------------|
| Business alignment | Every concept has a business counterpart |
| No implementation leak | No technical terms (Service, Manager, DTO, etc.) |
| Completeness | Every business rule is represented |
| Minimality | No concept can be removed without losing meaning |
| Consistency | No contradictory invariants |
| Testability | Every invariant can be verified |
| Ubiquitous language | Model vocabulary matches business vocabulary |
| Boundary clarity | Every concept belongs to exactly one boundary |

---

## Anti-Patterns in Domain Modeling

### 1. The Anemic Model
**Symptom:** Entities are data-only; all behavior lives in "services"
**Problem:** Concepts have been separated from their behavior — logic is homeless
**Fix:** Move behavior INTO the entity that owns the data it operates on

### 2. The God Entity
**Symptom:** One entity knows everything, does everything
**Problem:** Multiple concepts collapsed into one
**Fix:** Identify separate responsibilities → extract into separate concepts

### 3. The Phantom Concept
**Symptom:** A concept exists in code but nobody in the business recognizes it
**Problem:** Implementation artifact masquerading as domain concept
**Fix:** If no business person owns it, delete it

### 4. The Missing Concept
**Symptom:** Complex logic spread across multiple places with no name
**Problem:** A domain concept exists in the business but hasn't been modeled
**Fix:** Name it, give it a home, consolidate the scattered logic

### 5. The Premature Inheritance
**Symptom:** Deep inheritance hierarchies for "type" variations
**Problem:** Conflating classification with behavior variation
**Fix:** Prefer composition. Use strategy/policy for behavioral variation.
