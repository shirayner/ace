# Boundary Design — Where Concepts Begin and End

> Architecture IS boundaries.
> Not layers. Not patterns. Not frameworks.
> The quality of your architecture is determined by the quality of your boundaries.
> A perfect algorithm in the wrong boundary is worse than a mediocre algorithm in the right one.

---

## What Is a Boundary?

A boundary is a line that separates concepts that change for DIFFERENT reasons.

Inside a boundary: **high cohesion** (things that change together, stay together)
Across boundaries: **loose coupling** (things that change independently, live independently)

A boundary is NOT:
- A package (packages are namespaces, not necessarily boundaries)
- A layer (layers are a specific organizational pattern, often wrong)
- A microservice (services are deployment units, not necessarily good boundaries)
- A module (modules are compilation units)

A boundary IS:
- A concept ownership line
- A change isolation mechanism
- A communication contract point
- A team alignment surface

---

## The Boundary Test

### Two concepts belong in the SAME boundary when:

| Criterion | Test Question | Example |
|-----------|--------------|---------|
| Same change reason | "When requirement X changes, does BOTH A and B need to change?" | Order + LineItem |
| Same lifecycle | "Are they created, used, and destroyed together?" | Request + Response in a flow |
| High cohesion | "Does A need to know B's internals to work?" | Aggregate + its parts |
| Same ownership | "Does the same team/expert own both?" | PricingRule + DiscountPolicy |

### Two concepts belong in DIFFERENT boundaries when:

| Criterion | Test Question | Example |
|-----------|--------------|---------|
| Different change reason | "Can A change without B needing to change?" | Order vs. Notification |
| Different lifecycle | "Can A exist without B existing?" | Customer vs. Order |
| Low cohesion | "Does A only need B's public interface?" | Order vs. Payment |
| Different ownership | "Do different teams/experts own them?" | Catalog vs. Checkout |

---

## Types of Boundaries

### 1. Concept Boundary (within a service)

The most granular: separates concepts within a single deployable unit.

```
src/
├── order/          ← boundary: order lifecycle
│   ├── Order.java
│   ├── LineItem.java
│   └── OrderPolicy.java
├── payment/        ← boundary: financial settlement
│   ├── Payment.java
│   └── PaymentMethod.java
└── fulfillment/    ← boundary: delivery process
    ├── Shipment.java
    └── FulfillmentPlan.java
```

**Rules:**
- Each directory = one business concept cluster
- No circular dependencies between directories
- Communication between directories via explicit interfaces or events
- Never reach into another boundary's internals

### 2. Service Boundary (between deployable units)

For teams or lifecycles that need independent deployment.

**Only create a service boundary when:**
- Different teams develop it at different cadences
- It needs independent scaling
- It has a genuinely different availability requirement
- A concept boundary is no longer sufficient (proven by pain, not predicted)

### 3. Context Boundary (semantic boundary)

The same word means different things in different contexts.

**Example:** "Product"
- In Catalog context: product description, images, categories
- In Inventory context: stock level, warehouse location, reorder point
- In Pricing context: base price, discount rules, currency
- In Order context: line item reference, quantity ordered

**Rule:** When the same word means different things → different bounded contexts → different models → possibly different boundaries.

---

## Boundary Design Process

### Step 1: Identify Change Vectors

List all the reasons the system might change:

```
Change Vectors:
- New payment method added
- Pricing rule changes
- Shipping carrier integration
- Order status workflow modified
- Notification template updated
- Compliance regulation changed
```

### Step 2: Group Concepts by Change Vector

```
Changes when pricing rules change:
  → PricingPolicy, Discount, TaxCalculation, PriceHistory

Changes when order workflow changes:
  → Order, OrderStatus, OrderTransition, OrderEvent

Changes when notification templates change:
  → NotificationTemplate, Channel, DeliveryPreference
```

### Step 3: Validate Independence

For each group, verify:
- Can this group change WITHOUT requiring changes to other groups?
- Does this group have a cohesive, nameable responsibility?
- Is there a clear "inside" vs "outside"?

### Step 4: Define Contracts

For each boundary pair that communicates:
- What information crosses?
- In what direction?
- Through what mechanism (call, event, shared data)?
- What is the minimal contract?

---

## Boundary Communication Patterns

### Pattern 1: Direct Call (Synchronous)

```
BoundaryA ──call──→ BoundaryB
```

**Use when:**
- A needs an immediate answer
- Strong consistency required
- Simple request-response semantics

**Risk:** Creates temporal coupling. If B is slow, A waits.

### Pattern 2: Domain Event (Asynchronous)

```
BoundaryA ──publishes──→ Event ←──subscribes── BoundaryB
```

**Use when:**
- A doesn't need to know about B
- Eventual consistency is acceptable
- Multiple boundaries react to the same event

**Risk:** Debugging is harder. State can be temporarily inconsistent.

### Pattern 3: Shared Contract (Interface)

```
BoundaryA ──depends on──→ Interface ←──implements── BoundaryB
```

**Use when:**
- A needs capability from B but shouldn't know B's implementation
- The dependency direction needs to be inverted
- Multiple implementations might exist

### Pattern 4: Anti-Corruption Layer

```
BoundaryA ──→ ACL ──translates──→ ExternalSystem
```

**Use when:**
- Integrating with external/legacy systems
- The external model doesn't match your domain model
- You need to protect your model from external pollution

---

## Common Boundary Mistakes

### Mistake 1: Layer-Based Boundaries

```
WRONG:
├── controllers/    ← changes for every feature
├── services/       ← changes for every feature
├── repositories/   ← changes for every feature
└── models/         ← changes for every feature
```

**Problem:** A single feature change touches all four "boundaries." These are not boundaries — they're filing cabinets.

```
RIGHT:
├── order/          ← changes only when order behavior changes
├── payment/        ← changes only when payment logic changes
├── catalog/        ← changes only when product info changes
└── notification/   ← changes only when messaging changes
```

### Mistake 2: Premature Service Split

```
WRONG: Splitting OrderService into a microservice "because microservices are modern"
       when one team develops both sides and they always deploy together.

RIGHT: Keep as concept boundary within one service until:
       - Different teams need independent release cycles
       - Different scaling characteristics are proven (not predicted)
       - The boundary is stable (stop changing the API)
```

### Mistake 3: Boundary by Entity

```
WRONG:
├── customer/       ← just CRUD for Customer table
├── order/          ← just CRUD for Order table
├── product/        ← just CRUD for Product table

(These are database tables, not business boundaries)
```

```
RIGHT:
├── customer-onboarding/   ← customer lifecycle: acquisition → activation
├── ordering/              ← order lifecycle: cart → checkout → confirmation
├── catalog-management/    ← product lifecycle: creation → publication → retirement
```

### Mistake 4: God Boundary

```
WRONG:
├── core/           ← contains 200 classes, "shared" by everything
└── features/       ← thin wrappers over core

(Everything depends on core. Core changes break everything.)
```

**Fix:** The "core" is probably 5-6 separate concepts forced into one package. Split by concept.

### Mistake 5: Leaky Boundary

**Symptom:** Boundary A exposes its internal types to Boundary B.

```
WRONG:
// In payment boundary
public PaymentEntity processPayment(OrderEntity order) { ... }
// OrderEntity is from the ORDER boundary — leaked into payment

RIGHT:
// In payment boundary
public PaymentConfirmation processPayment(PaymentRequest request) { ... }
// PaymentRequest is a boundary-owned contract type
```

---

## Boundary Validation Checklist

For each boundary in your design:

- [ ] **Named in domain language** — not "service" or "module" or "layer"
- [ ] **Single change reason** — one business concern, not many
- [ ] **Independent lifecycle** — can evolve without breaking others
- [ ] **Minimal API surface** — exposes least possible information
- [ ] **No internal leakage** — internal types never cross the boundary
- [ ] **Clear ownership** — one team or expert responsible
- [ ] **Explicit communication** — all cross-boundary interaction is visible
- [ ] **No circular dependencies** — A depends on B, B does not depend on A
- [ ] **Testable in isolation** — can be tested without the full system

---

## When to Redraw Boundaries

Boundaries are hypotheses about change patterns. Redraw when:

1. **Shotgun surgery** — a single change consistently touches multiple boundaries → merge them
2. **Divergent change** — one boundary changes for multiple unrelated reasons → split it
3. **Feature envy** — one boundary constantly reaches into another's internals → concepts are misplaced
4. **Bottleneck** — one boundary is the critical path for all changes → it's too big, split it
5. **Dead weight** — a boundary exists but rarely changes or is used → merge with its consumer

**The goal is not perfect boundaries. The goal is boundaries that make the NEXT change easy.**
