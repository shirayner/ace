# Abstraction — Principles of Meaningful Abstraction

> "All problems in computer science can be solved by another level of indirection...
>  except for the problem of too many levels of indirection." — David Wheeler
>
> Abstraction is the most powerful tool in software design.
> It is also the most abused.
> The difference between good and bad abstraction: does it MODEL A CONCEPT or HIDE A MESS?

---

## What Is Abstraction?

Abstraction is giving a name to a pattern of behavior so you can think about it as a single unit.

**Good abstraction:** Makes complexity manageable by creating a concept you can reason about without knowing its internals.

**Bad abstraction:** Creates indirection that you must unwrap to understand what actually happens.

### The Test

```
Can I use this abstraction WITHOUT knowing its implementation?

YES → Good abstraction (it has a meaningful contract)
NO  → Bad abstraction (it's just indirection)
```

---

## The Three Laws of Abstraction

### Law 1: Abstract ONLY What Has a Name

```
Can you name this abstraction using domain vocabulary?

YES → It might deserve to exist
NO  → It's indirection without meaning. Don't create it.
```

Examples:
- "PaymentMethod" → Yes. Business concept. Multiple real implementations.
- "IOrderService" → No. "Service" is not a business concept. This is cargo.
- "ShippingCalculation" → Yes. Business concept. Rules vary by carrier.
- "AbstractProcessor" → No. "Processor" tells you nothing about the domain.

### Law 2: Abstract ONLY What Varies

```
Does this thing actually vary TODAY?

YES → Abstraction captures the variation boundary
NO  → Premature. Inline it. When variation appears, THEN abstract.
```

The cost of abstraction:
- Extra navigation (reader must find the implementation)
- Extra concepts (interface + implementation vs. just implementation)
- Coupling to abstraction shape (changing the interface is harder than changing code)

Only pay this cost when variation EXISTS (not "might exist").

### Law 3: Abstract at the RIGHT Level

```
Is this abstraction at the business concept level?

YES → It will remain stable as implementation changes
NO  → It's at the wrong level and will break with refactoring
```

Right levels:
```
Business capability: "Process payments" → PaymentProcessor(interface)
Business rule: "Apply discounts" → DiscountPolicy(interface)
Business entity: "Different order types" → Order(sealed hierarchy)
```

Wrong levels:
```
Technical mechanism: "Different DB access" → DataAccessObject(interface)
Framework dependency: "Different HTTP clients" → HttpClient(interface)  
Implementation detail: "Different sorting" → Sorter(interface)
```

---

## Abstraction Decision Framework

### When to Create an Abstraction

```
ALL THREE must be true:

1. Multiple implementations EXIST today
   (Not "might need" — exist NOW)

2. They represent different BUSINESS behaviors
   (Not just different technical implementations of same behavior)

3. Callers genuinely don't care which implementation they get
   (The abstraction is a meaningful boundary, not a leaky one)
```

### When to Remove an Abstraction

```
ANY ONE is sufficient:

1. Only one implementation exists (and has existed for >6 months)
   → Remove interface, use implementation directly

2. Callers always cast or check which implementation they have
   → The abstraction is leaky. Replace with explicit dispatch.

3. The abstraction's name is generic (IService, AbstractProcessor, BaseHandler)
   → It doesn't model a concept. Inline it.

4. Understanding requires reading through the abstraction
   → It doesn't simplify. It obfuscates. Remove it.
```

---

## Abstraction Patterns (Good)

### Pattern 1: Policy Abstraction

**When:** Business rules vary and are selected at runtime.

```
// The abstraction IS the business concept
interface PricingPolicy {
    Money calculatePrice(Order order);
}

// Implementations are business variations
class StandardPricing implements PricingPolicy { ... }
class VolumePricing implements PricingPolicy { ... }
class PromotionalPricing implements PricingPolicy { ... }
```

**Why it works:** "Pricing policy" is a domain expert term. Different policies are real business variations. Callers don't care which policy applies.

### Pattern 2: Boundary Abstraction

**When:** You need to isolate your domain from external systems.

```
// The abstraction is a boundary contract
interface PaymentGateway {
    PaymentResult authorize(PaymentRequest request);
}

// Implementations are infrastructure adapters
class StripeGateway implements PaymentGateway { ... }
class PayPalGateway implements PaymentGateway { ... }
```

**Why it works:** The domain logic shouldn't know or care about Stripe vs PayPal. The abstraction protects the domain model from external API changes.

### Pattern 3: Strategy Abstraction

**When:** An algorithm genuinely varies based on context.

```
// The abstraction captures a genuine variation point
interface ShippingCalculation {
    Money calculateCost(Package pkg, Address destination);
}

// Each carrier has genuinely different calculation logic
class FedExShipping implements ShippingCalculation { ... }
class UPSShipping implements ShippingCalculation { ... }
```

**Why it works:** Shipping calculation genuinely varies by carrier. The variation is permanent, not speculative.

---

## Abstraction Anti-Patterns (Bad)

### Anti-Pattern 1: The Speculative Interface

```
// WRONG: Interface with one implementation "for extensibility"
interface IOrderService {
    Order createOrder(OrderRequest request);
}

class OrderServiceImpl implements IOrderService {
    // The only implementation. Has been for 3 years.
}
```

**Why it's bad:** No variation exists. The interface adds navigation cost, naming pollution ("Impl"), and no value. When a second implementation is needed, creating the interface then costs 5 minutes. Having it now costs every reader forever.

**Fix:** Delete the interface. Use the class directly. Extract interface when variation appears.

### Anti-Pattern 2: The Leaky Abstraction

```
// WRONG: Abstraction that callers must understand internals to use correctly
interface Repository<T> {
    T findById(Long id);
    List<T> findAll();
    void save(T entity);
}

// Caller code:
repository.save(entity);
entityManager.flush(); // LEAK: caller must know about JPA internals
repository.findById(id); // might return stale data without flush!
```

**Why it's bad:** The abstraction promises isolation from persistence details but doesn't deliver. Callers must understand the underlying mechanism.

**Fix:** Either make the abstraction complete (hide flush semantics) or remove it (use the ORM directly — at least then the coupling is explicit).

### Anti-Pattern 3: The Wrapper Abstraction

```
// WRONG: Abstraction that just delegates without adding value
class OrderProcessor {
    private OrderValidator validator;
    private OrderPersistence persistence;
    private OrderNotifier notifier;
    
    void process(Order order) {
        validator.validate(order);    // just delegates
        persistence.save(order);      // just delegates  
        notifier.notify(order);       // just delegates
    }
}
```

**Why it's bad:** OrderProcessor adds no intelligence. It's a script of delegations that could be expressed at the call site. It creates a concept ("processing") that has no behavior of its own.

**Fix:** If the orchestration sequence is the domain concept (a workflow), name it as such and own the decision logic. If not, inline the calls at the use site.

### Anti-Pattern 4: The God Interface

```
// WRONG: Interface with too many responsibilities
interface CustomerService {
    Customer create(CustomerData data);
    Customer update(Long id, CustomerData data);
    void delete(Long id);
    Customer findById(Long id);
    List<Customer> search(SearchCriteria criteria);
    void activate(Long id);
    void deactivate(Long id);
    void sendVerification(Long id);
    void resetPassword(Long id);
    CreditScore calculateCredit(Long id);
}
```

**Why it's bad:** This isn't an abstraction — it's a dump of every operation on "Customer." No implementation would vary all these together. It forces implementors to provide all-or-nothing.

**Fix:** Split by business capability: CustomerRegistration, CustomerAuthentication, CustomerCreditAssessment.

### Anti-Pattern 5: The Abstract for Testing

```
// WRONG: Interface exists solely to enable mocking
interface TimeProvider {
    Instant now();
}

class SystemTimeProvider implements TimeProvider {
    Instant now() { return Instant.now(); }
}

class TestTimeProvider implements TimeProvider {
    // only used in tests
}
```

**Why it's bad:** "Time provider" is not a business concept. The abstraction exists for test infrastructure, polluting the domain model.

**Better alternatives:**
- Pass time as a parameter: `process(order, Instant.now())`
- Use clock injection at the framework level
- Accept the test uses the real clock (usually fine)

---

## The Abstraction Stack

Good systems have abstraction at the RIGHT levels:

```
Level 4: Business Capability (highest, most stable)
  "Process payments"
  "Manage inventory"
  "Fulfill orders"

Level 3: Business Concept
  "Pricing policy"
  "Shipping method"  
  "Payment method"

Level 2: Business Rule
  "Volume discount"
  "Express shipping"
  "Credit card payment"

Level 1: Implementation (lowest, most volatile)
  "Stripe API call"
  "FedEx rate API"
  "SQL query"
```

**Rules:**
- Higher levels are MORE abstract, MORE stable, LESS likely to change
- Lower levels are MORE concrete, MORE volatile, MORE likely to change
- Dependencies should point UPWARD (stable) not downward (volatile)
- Abstractions at Level 3-4 are often interfaces; Level 1-2 are usually concrete

---

## The Abstraction Smell Test

Before creating any abstraction, answer:

1. **Can I name it in business terms?** (If no → don't create it)
2. **Does it have 2+ implementations TODAY?** (If no → premature)
3. **Can callers use it without knowing the implementation?** (If no → leaky)
4. **Does it reduce the total concept count?** (If no → it's adding complexity)
5. **Would removing it make the code HARDER to understand?** (If no → remove it)

If any answer is "no" → the abstraction is likely harming more than helping.

---

## The Golden Rule

> **The best abstraction is one you never notice.**
> It makes complex things simple to use without hiding what matters.
>
> If you're proud of your abstraction, it's probably too clever.
> If readers don't even realize it's an abstraction, it's probably just right.
