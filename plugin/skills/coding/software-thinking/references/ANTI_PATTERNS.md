# Anti-Patterns — Common Design Mistakes Catalog

> Every anti-pattern here was once considered "best practice" by someone.
> They survive because they FEEL professional, organized, or extensible.
> They're actually tax on every future developer.
>
> For each anti-pattern: what it looks like, why it's wrong, what to do instead.

---

## Category 1: Structural Anti-Patterns

### 1.1 The Layer Cake

**Looks like:**
```
controller/
  OrderController.java
service/
  OrderService.java
repository/
  OrderRepository.java
model/
  Order.java
dto/
  OrderDTO.java
  OrderRequest.java
  OrderResponse.java
mapper/
  OrderMapper.java
```

**Why it's wrong:**
- Adding one feature changes ALL layers (zero isolation)
- The "architecture" provides no protection against ripple effects
- You're organized by technical role, not by business concept
- Navigation cost: understanding "order" requires 7 files

**What to do instead:**
```
order/
  Order.java           // domain model
  OrderWorkflow.java   // business logic
  OrderEndpoint.java   // entry point (thin)
  OrderStore.java      // persistence (thin)
```
Organize by business concept. Keep technical layers thin and co-located.

---

### 1.2 The Interface-Impl Pair

**Looks like:**
```java
interface OrderService { ... }
class OrderServiceImpl implements OrderService { ... }
// Only one implementation. Has been for years.
```

**Why it's wrong:**
- Doubles concept count without adding value
- "Impl" suffix admits the interface took the good name
- Forces every reader to check: "is there another implementation?" (No.)
- "But it's for testing" → you can mock concrete classes in modern frameworks

**What to do instead:**
- Delete the interface. Use the class directly.
- When (IF) a second implementation appears, extract the interface then.
- Cost of adding interface later: 5 minutes.
- Cost of maintaining useless interface forever: infinite.

---

### 1.3 The Anemic Domain Model

**Looks like:**
```java
// "Entity" with only getters/setters
class Order {
    private Long id;
    private String status;
    private BigDecimal total;
    // ... 20 more fields, all with get/set
}

// "Service" with all the business logic
class OrderService {
    void placeOrder(Order order) { ... }
    void calculateTotal(Order order) { ... }
    void applyDiscount(Order order) { ... }
    void validateOrder(Order order) { ... }
}
```

**Why it's wrong:**
- Data is separated from behavior (procedural programming in OO clothing)
- Order doesn't protect its own invariants
- Anyone can set invalid state
- Business logic is homeless — scattered across "services"

**What to do instead:**
```java
class Order {
    // State is private, only modified through behavior
    void place() { /* validates, transitions state */ }
    Money calculateTotal() { /* owns its own calculation */ }
    void applyDiscount(DiscountPolicy policy) { /* applies through policy */ }
    // Invariants enforced internally
}
```

---

### 1.4 The God Class

**Looks like:**
```java
class OrderManager {
    // 2000+ lines
    void createOrder() { ... }
    void updateOrder() { ... }
    void deleteOrder() { ... }
    void calculatePrice() { ... }
    void validateInventory() { ... }
    void processPayment() { ... }
    void arrangeShipping() { ... }
    void sendNotification() { ... }
    void generateReport() { ... }
    void exportData() { ... }
    // ... 30 more methods
}
```

**Why it's wrong:**
- Multiple responsibilities = multiple reasons to change = fragile
- Everything depends on it = change risk is maximal
- Mental load to understand: enormous
- Actually models 5-6 separate business concepts forced into one

**What to do instead:**
Identify the separate concepts and give each a home:
- `OrderWorkflow` (lifecycle transitions)
- `PricingCalculation` (price logic)
- `PaymentAuthorization` (payment flow)
- `ShipmentPlanning` (logistics)
- `OrderNotification` (messaging)

---

### 1.5 The Deep Inheritance Hierarchy

**Looks like:**
```java
abstract class AbstractEntity<T extends Serializable>
  extends BaseEntity<T>
    implements Identifiable<T>, Auditable, Validatable {

class AbstractOrder extends AbstractEntity<Long>
  implements Priceable, Shippable, Notifiable {

class DomesticOrder extends AbstractOrder {

class ExpressDomesticOrder extends DomesticOrder {
```

**Why it's wrong:**
- Understanding one class requires reading 4+ parent classes
- "Is-a" relationships are almost always wrong for business variations
- Inheritance is the strongest coupling mechanism — changes ripple down
- Usually conflates classification with behavior variation

**What to do instead:**
- Prefer composition: `Order` HAS a `ShippingMethod`, not IS a `ShippableOrder`
- Use sealed types for legitimate type hierarchies (when types are exhaustive)
- Flatten: most "abstract base" classes contribute 1-2 methods → inline them

---

## Category 2: Behavioral Anti-Patterns

### 2.1 The Premature Pattern

**Looks like:**
```java
// Strategy pattern for one strategy
interface DiscountStrategy { ... }
class PercentageDiscount implements DiscountStrategy { ... }
// No other implementations exist or are planned with evidence

// Observer for one listener
interface OrderEventListener { ... }
class InventoryListener implements OrderEventListener { ... }
// Only one listener. Direct call would suffice.

// Factory for one product
class PaymentProcessorFactory {
    PaymentProcessor create(String type) {
        // Only ever returns StripeProcessor
    }
}
```

**Why it's wrong:**
- Pattern adds indirection without solving a real variation problem
- Reader must trace through extra layers to understand behavior
- Maintenance cost of pattern > maintenance cost of simple code
- "What if we need more later?" — you won't, and if you do, adding it takes 10 minutes

**What to do instead:**
- Direct call until variation proves itself
- Inline the "factory" — it's just `new StripeProcessor()`
- When the second case arrives (not before), extract the pattern

---

### 2.2 The Distributed Monolith

**Looks like:**
```
order-service → payment-service → inventory-service → notification-service
     ↑_______________________________________________________|
     (circular dependency via events/calls)
```

**Why it's wrong:**
- Has all the coupling of a monolith PLUS network latency
- Can't deploy independently (services need coordinated releases)
- Can't understand behavior without tracing across 4 services
- Added operational complexity (monitoring, debugging, deployment) without gaining independence

**What to do instead:**
- If services always change and deploy together → merge into one service with clear internal boundaries
- If splitting is genuinely needed → ensure each service truly owns its data and can function independently

---

### 2.3 The Configuration-Driven Everything

**Looks like:**
```yaml
processors:
  order:
    validator: com.example.OrderValidator
    enricher: com.example.OrderEnricher
    handler: com.example.OrderHandler
    notifier: com.example.OrderNotifier
    steps:
      - validate
      - enrich
      - process
      - notify
```

**Why it's wrong:**
- Logic is hidden in configuration (not discoverable via IDE)
- Can't navigate via ctrl+click
- "Flexible" → nobody dares change it because they can't trace impact
- Actually never reconfigured — the flexibility is unused

**What to do instead:**
```java
// Explicit code is better than implicit configuration
order.validate();
order.enrich(context);
order.process();
notifier.notify(order);
```
Code is explicit, navigable, type-checked, and testable.

---

### 2.4 The Event Storm

**Looks like:**
```
OrderPlaced → InventoryReserved → PaymentRequested → PaymentCompleted 
→ OrderConfirmed → ShipmentCreated → NotificationSent → AuditLogged
→ MetricsUpdated → CacheInvalidated → SearchIndexUpdated → ...
```

**Why it's wrong:**
- Understanding one behavior requires tracing through 10+ event handlers
- Debugging: "why didn't the order confirm?" requires checking every handler in the chain
- Implicit ordering dependencies (handler B assumes handler A ran first)
- The "architecture" is actually a distributed spaghetti of callbacks

**What to do instead:**
- Use events for GENUINE decoupling (different bounded contexts, different teams)
- Use direct calls for things that are part of the SAME business operation
- One domain operation should be traceable in ONE place, not scattered

---

### 2.5 The Defensive Paranoia

**Looks like:**
```java
void processOrder(Order order) {
    if (order == null) throw new IllegalArgumentException("order cannot be null");
    if (order.getId() == null) throw new IllegalArgumentException("order id cannot be null");
    if (order.getItems() == null) throw new IllegalArgumentException("items cannot be null");
    if (order.getItems().isEmpty()) throw new IllegalArgumentException("items cannot be empty");
    Objects.requireNonNull(order.getCustomer(), "customer cannot be null");
    // ... 10 more checks
    // Actual logic starts here
}
```

**Why it's wrong:**
- Most of these conditions are IMPOSSIBLE if the type system and construction are correct
- Readers think: "Can order be null here? Is it a real case?" (No! But now they doubt.)
- Clutters the actual business logic
- If Order can be constructed invalidly, fix Order's constructor — don't check everywhere

**What to do instead:**
- Make invalid states unrepresentable (non-null types, validated constructors)
- Validate at SYSTEM BOUNDARIES (user input, external APIs) not internal calls
- Trust your own code. If you can't, fix the untrusted code.

---

## Category 3: Naming Anti-Patterns

### 3.1 The Semantic Void

**Names that communicate nothing:**
```
DataManager, InfoProcessor, ItemHandler, ElementUtils,
ObjectFactory, EntityHelper, ValueWrapper, ThingService
```

**Fix:** Replace with what it ACTUALLY does in business terms.

### 3.2 The Hungarian Echo

**Encoding type information in names:**
```
strName, iCount, lstOrders, dblPrice,
OrderDTO, CustomerEntity, PaymentVO, AddressBean
```

**Fix:** The type system already knows the type. Names should express WHAT, not what-type.

### 3.3 The Resume-Driven Name

**Naming things after patterns to look impressive:**
```
OrderFacadeProxyDecoratorFactoryStrategy
AbstractSingletonProxyFactoryBean  // actual Spring class name
```

**Fix:** Name for the business concept, not for the catalog of patterns you know.

---

## Category 4: Complexity Anti-Patterns

### 4.1 The Gold Plate

**Looks like:**
- Generic framework for a problem that occurs exactly once
- Configurable pipeline for a process that never changes
- Plugin system with one plugin
- Multi-tenant architecture for a single-tenant product

**Why it's wrong:** Building for imaginary future requirements. The maintenance cost is immediate and real. The future benefit is speculative and usually never materializes.

**What to do instead:** Build for today. When tomorrow comes, you'll know what it actually needs.

### 4.2 The Abstraction Astronaut

**Looks like:**
```java
interface TransformationPipeline<I, O, C extends TransformationContext> {
    TransformationResult<O> execute(
        TransformationRequest<I> request,
        TransformationConfiguration<C> config,
        TransformationInterceptorChain<I, O> chain
    );
}
// Used exactly once, for transforming an OrderRequest into an Order.
```

**Why it's wrong:** The abstraction is so generic it tells you nothing about what it does. You must read the implementation to understand anything. The generics add no type safety that a simple `Order processOrder(OrderRequest request)` wouldn't provide.

**What to do instead:** `Order processOrder(OrderRequest request)`. Done.

### 4.3 The DRY Obsession

**Looks like:**
```java
// "Shared" utility used by 3 callers, each passing different flags
void processEntity(Object entity, boolean validate, boolean notify, 
                   boolean audit, String mode, Map<String,Object> options) {
    if (validate) { ... }
    if (mode.equals("order")) { ... }
    else if (mode.equals("payment")) { ... }
    if (notify && !options.containsKey("silent")) { ... }
}
```

**Why it's wrong:** "Don't Repeat Yourself" was misapplied. These three callers have DIFFERENT business concepts that HAPPEN to share some steps. Forcing them together creates coupling without shared meaning.

**What to do instead:** Duplicate code is cheaper than wrong abstraction. Let each concept have its own implementation. If they TRULY share a concept, name it and extract it. If they just happen to share code, let them diverge.

---

## Category 5: Architecture Anti-Patterns

### 5.1 The Smart UI / Thin Backend

**Looks like:** All business logic in the frontend/controller. Backend is just a CRUD proxy to the database.

**Why it's wrong:** Business rules are duplicated across clients. Changes require updating every client. No single source of truth for business behavior.

**Fix:** Business logic lives in the domain model. Frontend is a viewport.

### 5.2 The Database-Driven Design

**Looks like:** Design starts with "what tables do we need?" Code structure mirrors the database schema. Every entity maps 1:1 to a table.

**Why it's wrong:** Database schema is an implementation detail, not a business model. Optimizing for storage != optimizing for behavior. Changes to business concepts require schema migrations.

**Fix:** Design domain model first. Map to database second. The model drives the schema, not the reverse.

### 5.3 The Dependency Injection Labyrinth

**Looks like:**
```java
// 15 constructor parameters
class OrderProcessingService {
    OrderProcessingService(
        OrderValidator validator,
        OrderEnricher enricher,
        PriceCalculator priceCalc,
        TaxCalculator taxCalc,
        DiscountCalculator discountCalc,
        InventoryChecker invChecker,
        PaymentGateway payGateway,
        ShipmentService shipService,
        NotificationService notifService,
        AuditService auditService,
        MetricsService metricsService,
        CacheService cacheService,
        ConfigService configService,
        FeatureFlagService ffService,
        LoggingService logService
    ) { ... }
}
```

**Why it's wrong:** DI made it easy to add dependencies, so you never noticed the class was becoming a god class. 15 dependencies = 15 reasons to change = 15 concepts mashed together.

**Fix:** This class is 4-5 concepts forced into one. Split by business responsibility until each has 2-4 dependencies.

---

## The Meta-Pattern

Every anti-pattern shares one root cause:

> **Optimizing for technical elegance instead of business clarity.**

The fix is always the same:

> **Ask: "What does the business need here?"
> Then build exactly that. Nothing more.**
