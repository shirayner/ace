# Boundary Example: Microservice Boundary vs Concept Boundary

## Scenario

A team is debating whether to split a monolith's "promotion" feature into a separate microservice. We apply boundary thinking to decide.

## The Current State

```
monolith/
├── ordering/
│   ├── Order.java
│   ├── OrderWorkflow.java
│   └── ...
├── promotion/
│   ├── Promotion.java           // Promotion definition
│   ├── PromotionEngine.java     // Evaluation logic
│   ├── PromotionSchedule.java   // When promotions are active
│   └── PromotionEndpoint.java   // Admin CRUD for promotions
├── pricing/
│   ├── PricingPolicy.java       // Calls promotion engine
│   └── ...
└── catalog/
    └── ...
```

## The Decision Analysis

### The "Yes, Split" Arguments (Examined)

| Argument | Counter-Question | Reality |
|----------|-----------------|---------|
| "Promotions change frequently" | Do they change INDEPENDENTLY of pricing? | No — every new promotion type requires pricing changes too |
| "Separate team could own it" | IS there a separate team? | No. Same 4 engineers work on both |
| "Better scalability" | Is promotion evaluation a bottleneck? | No. 50ms per order, well within SLA |
| "It's a separate domain" | Does it have its own lifecycle? | Partially — admin CRUD is independent, but evaluation is tightly coupled to pricing |

### The Boundary Tests

**Test 1: Same change reason?**
```
Adding a new promotion type:
  → Changes Promotion.java (definition)       ← promotion boundary
  → Changes PromotionEngine.java (evaluation) ← promotion boundary
  → Changes PricingPolicy.java (application)  ← pricing boundary

Verdict: Promotion definition is independent. Promotion APPLICATION is coupled to pricing.
```

**Test 2: Same lifecycle?**
```
Promotion CRUD (create, activate, deactivate):
  → Independent of ordering. Can happen anytime.
  → Different from pricing lifecycle.
  → Admin-driven, not order-driven.
  
Promotion EVALUATION (at order time):
  → Happens DURING pricing calculation
  → Same lifecycle as order pricing
  → Must be synchronous (can't wait for network call)
  
Verdict: SPLIT THE CONCEPT. CRUD lifecycle ≠ evaluation lifecycle.
```

**Test 3: Communication overhead?**
```
If promotion is a separate service:
  → Every order must call promotion service (latency added)
  → Pricing depends on promotion availability (fragility added)
  → Promotion rules must be cached locally anyway (complexity added)
  
Verdict: Network boundary adds cost without adding independence.
```

### The Decision

```
DON'T create a microservice.
DO refine the concept boundary within the monolith.
```

## After: Refined Concept Boundaries (Still One Service)

```
monolith/
├── ordering/
│   └── ...
├── promotion-management/          ← Administrative boundary
│   ├── Promotion.java             // Definition: rules, schedule, targeting
│   ├── PromotionLifecycle.java    // CRUD, activation, deactivation
│   ├── PromotionSchedule.java     // When promotions are active
│   └── PromotionAdminEndpoint.java // Admin API
├── pricing/                       ← Calculation boundary
│   ├── PricingPolicy.java         // Orchestrates pricing
│   ├── PromotionEvaluation.java   // Evaluates active promotions for an order
│   ├── DiscountCalculation.java   // Applies discount rules
│   └── ...
└── catalog/
    └── ...
```

### What Changed

| Before | After | Why |
|--------|-------|-----|
| `promotion/PromotionEngine.java` in promotion boundary | `pricing/PromotionEvaluation.java` in pricing boundary | Evaluation is part of PRICING, not promotion management |
| One "promotion" boundary doing admin + evaluation | Two boundaries: management (admin) + pricing (evaluation) | Different lifecycles = different boundaries |
| Debate about microservice | Clear concept boundary within monolith | The split that matters is conceptual, not physical |

### The Contract Between Them

```java
// promotion-management exposes active promotions (read-only view for pricing)
public interface ActivePromotions {
    List<PromotionRule> activeRulesFor(ProductId product, CustomerTier tier);
}

// pricing consumes this contract
public class PromotionEvaluation {
    private final ActivePromotions promotions; // reads from promotion-management
    
    public Money calculateDiscount(Order order) {
        List<PromotionRule> applicable = promotions.activeRulesFor(
            order.productId(), order.customerTier());
        return applicable.stream()
            .map(rule -> rule.evaluate(order))
            .max(Money::compareTo)  // best promotion wins
            .orElse(Money.ZERO);
    }
}
```

## Key Insights

### When NOT to Create a Microservice

```
Don't split into a microservice when:
├── Same team develops both sides
├── They always deploy together
├── One cannot function without the other (synchronous dependency)
├── The performance overhead of the network call isn't justified
└── The boundary isn't stable (API still changing weekly)
```

### When a Concept Boundary Suffices

```
A concept boundary (within one service) is enough when:
├── You want independent evolution (different change reasons)
├── You want clear ownership (different responsibilities)
├── You want explicit contracts (no internal leakage)
├── But deployment independence is NOT required
└── And network latency is unacceptable
```

### The Guideline

> **Start with concept boundaries. Graduate to service boundaries only when
> deployment independence is proven necessary.**
>
> A monolith with good boundaries is better than
> a distributed system with bad boundaries.
>
> You can always split later (if boundaries are clean).
> You can rarely merge back (if services are tangled).
