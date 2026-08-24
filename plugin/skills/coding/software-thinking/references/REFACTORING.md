# Refactoring — Optimize Concepts, Not Code

> **Do NOT optimize code. Optimize concepts.**
>
> This single sentence is more important than every refactoring technique combined.
> If you remember nothing else from this file: refactoring is about making the
> CONCEPT MODEL better, not about making the CODE prettier.

---

## The Refactoring Manifesto

```
Refactoring is NOT:
  - Making code shorter
  - Making code "cleaner"
  - Applying patterns
  - Satisfying a linter
  - Reducing duplication mechanically
  - "Improving" code that works fine

Refactoring IS:
  - Making the concept model more accurate
  - Making business intent more visible
  - Making boundaries more honest
  - Making the next business change easier
  - Removing concepts that don't exist in the business
  - Unifying concepts that are actually the same thing
```

---

## When to Refactor

### Valid Triggers

| Trigger | Why It's Valid |
|---------|---------------|
| "I can't understand what this business concept is" | Concept is poorly expressed |
| "This one business change requires touching 8 files" | Boundary is wrong |
| "There are 3 representations of the same thing" | Concept duplication |
| "This code uses terminology nobody in the business uses" | Language mismatch |
| "I can't change X without breaking Y, but X and Y are unrelated" | False coupling |
| "There's a concept here that has no business counterpart" | Accidental concept |

### Invalid Triggers

| Trigger | Why It's Invalid |
|---------|-----------------|
| "This method is too long" | Length is not a problem if it reads clearly |
| "This violates SRP/OCP/DIP" | Principles are not goals; they're tools |
| "This could use a pattern" | Patterns are not achievements |
| "I don't like the style" | Personal preference is not business value |
| "This isn't how I'd write it" | Ego is not a refactoring driver |
| "We have time" | Time without purpose is waste |

---

## The Refactoring Process

### Phase 1: Understand Current Concepts

Before changing anything:

1. **Name every concept** in the current code (what does it model?)
2. **Map to business** — does each concept have a business counterpart?
3. **Identify ghosts** — concepts in code with no business reality
4. **Identify gaps** — business concepts with no code representation
5. **Identify duplicates** — same concept with multiple representations

### Phase 2: Design Target Concepts

Define where you want to be:

1. **What concepts SHOULD exist?** (from the business model)
2. **Where should each live?** (which boundary)
3. **How should they relate?** (ownership, reference, trigger)
4. **What should NOT exist?** (accidental concepts to remove)

### Phase 3: Plan the Transformation

Map current → target:

| Current Concept | Target Concept | Action |
|----------------|---------------|--------|
| OrderService + OrderHelper | OrderWorkflow | Merge + rename |
| PaymentProcessor | (removed) | Inline into Order |
| OrderDTO + OrderEntity | Order | Unify |
| (nothing) | FulfillmentPolicy | Extract from scattered logic |

### Phase 4: Execute Safely

**Rules:**
- One concept change at a time
- Tests green after each change
- Commit after each meaningful step
- Never mix behavior changes with concept changes

---

## Refactoring Catalog (Concept-Level)

### 1. Reveal Hidden Concept

**When:** Logic is scattered, unnamed, and hard to find.

**Before:**
```java
// In OrderService
if (order.getTotal() > 1000 && customer.getTier() == GOLD 
    && !order.hasFragileItems()) {
    shipping = 0;
}

// Same logic repeated in 3 other places with slight variations
```

**Thinking:** There's a hidden business concept here — "free shipping eligibility." It has rules, it's discussed in the business, but it has no name in code.

**After:**
```java
// FreeShippingPolicy is now a first-class concept
class FreeShippingPolicy {
    boolean isEligible(Order order, Customer customer) {
        return order.total().exceeds(THRESHOLD)
            && customer.tier().isAtLeast(GOLD)
            && !order.hasFragileItems();
    }
}
```

### 2. Merge Duplicate Concepts

**When:** The same business concept is modeled multiple times.

**Before:**
```java
class OrderValidator { ... }     // validates order fields
class OrderChecker { ... }       // "checks" order rules (same thing!)
class OrderVerifier { ... }      // "verifies" order state (same thing!)
```

**Thinking:** These three are the same concept ("order validation") with three names. Business has one concept, code has three.

**After:**
```java
class OrderRules {
    // All validation/checking/verification unified
    // Named for what it IS (rules), not what it DOES (validate)
}
```

### 3. Remove Phantom Concept

**When:** A code concept has no business counterpart.

**Before:**
```java
class OrderProcessingContext {
    private Order order;
    private Customer customer;
    private PaymentInfo payment;
    private ShippingInfo shipping;
    // A "context" bag that exists only because the code needed to pass data around
}
```

**Thinking:** "Order processing context" is not a business term. It's a code-level workaround for poor information flow design.

**After:**
```java
// Remove the context entirely
// Each function receives exactly what it needs
fulfillment.plan(order.items(), shipping.address())
payment.authorize(order.total(), customer.paymentMethod())
```

### 4. Split God Concept

**When:** One concept does too much — multiple responsibilities fused together.

**Before:**
```java
class OrderManager {
    void createOrder() { ... }
    void calculatePricing() { ... }
    void validateInventory() { ... }
    void processPayment() { ... }
    void arrangeShipping() { ... }
    void sendNotifications() { ... }
}
```

**Thinking:** "Order manager" is not a business concept — it's a garbage collector for responsibilities. The business has separate concepts: ordering, pricing, inventory, payment, shipping, communication.

**After:**
```java
class OrderWorkflow { ... }         // Order lifecycle
class PricingPolicy { ... }         // Pricing rules
class InventoryReservation { ... }  // Stock management
class PaymentAuthorization { ... }  // Payment processing
class ShipmentPlanning { ... }      // Shipping logistics
class OrderNotification { ... }     // Communication
```

### 5. Unify Semantic Duplicates

**When:** Different things that are actually the same concept with different names.

**Before:**
```java
class UserPreferences { ... }    // in settings module
class CustomerProfile { ... }    // in CRM module  
class AccountSettings { ... }    // in auth module
// All three model "what the user wants" — same concept, three names
```

**Thinking:** The business says "customer preferences." We have three modules each modeling their slice of it, with no shared understanding.

**After:**
```java
// Single model, referenced from where needed
class CustomerPreferences {
    // Owns ALL preference data
    // Other boundaries reference via ID, not by duplicating
}
```

### 6. Invert Abstraction Level

**When:** Abstract things are inside concrete things (upside-down).

**Before:**
```java
class StripePaymentService {
    void processPayment(Order order) {
        // Business rule mixed with Stripe-specific code
        if (order.isRecurring()) {
            stripe.createSubscription(...);
        } else {
            stripe.createCharge(...);
        }
    }
}
```

**Thinking:** Business logic (recurring vs. one-time) is INSIDE infrastructure (Stripe). It should be the opposite.

**After:**
```java
// Business concept owns the decision
class PaymentDecision {
    PaymentIntent decide(Order order) {
        return order.isRecurring() 
            ? PaymentIntent.subscription(order)
            : PaymentIntent.oneTime(order);
    }
}

// Infrastructure just executes
class StripeAdapter {
    void execute(PaymentIntent intent) { ... }
}
```

---

## Refactoring Safety Rules

### Rule 1: Behavior Must Not Change

Refactoring changes structure, NOT behavior. After refactoring:
- All tests still pass
- All business outcomes are identical
- No user-visible difference

If you're changing behavior → it's not refactoring, it's development.

### Rule 2: Small Steps, Always Green

```
Refactoring cadence:
  1. Make one small structural change
  2. Run tests (must be green)
  3. Commit
  4. Repeat

Never: Make 5 changes, hope tests pass, debug for an hour.
```

### Rule 3: Name the Motivation

Before each refactoring step, state:
- **Current:** "The code currently models X as Y"
- **Problem:** "This misrepresents the business because Z"
- **Target:** "It should model X as W"

If you cannot fill in Z (the business reason), the refactoring is not justified.

### Rule 4: Stop When Good Enough

Refactoring has diminishing returns. Stop when:
- The concept model accurately represents the business
- The next business change is easy to make
- A new team member can understand the domain by reading the code
- Further changes would be cosmetic, not conceptual

**The goal is concept clarity, not code perfection.**

---

## The Refactoring Smell-to-Fix Mapping

| Smell | Root Cause | Concept-Level Fix |
|-------|-----------|-------------------|
| Long method | Hidden concepts inside | Reveal hidden concepts |
| Large class | Multiple concepts fused | Split god concept |
| Duplicated logic | Same concept modeled twice | Unify semantic duplicates |
| Feature envy | Concept in wrong boundary | Move to correct boundary |
| Shotgun surgery | Concept scattered | Consolidate into one location |
| Primitive obsession | Missing value object | Model the business concept |
| Data clumps | Missing concept | Name the concept these represent |
| Inappropriate intimacy | Boundary violation | Enforce boundary contract |
| Lazy class | Phantom concept | Remove or merge |
| Speculative generality | Premature abstraction | Inline until variation exists |

---

## The Ultimate Refactoring Question

After every refactoring session, ask:

> "Does a domain expert reading this code recognize their business?"

If yes → stop. The code is a good model.
If no → continue. The model is still wrong.
