# Naming — The Ubiquitous Language in Code

> Names should reflect the ubiquitous language.
> Never expose implementation.
> Always expose intent.
>
> A name is not a label. It is a CLAIM about what something IS.
> A wrong name is worse than no name — it actively misleads.

---

## The Core Principle

```
Good name: tells you WHAT IT IS in business terms
Bad name:  tells you HOW IT WORKS in technical terms

Good name: a domain expert would recognize it
Bad name:  only a programmer would recognize it

Good name: makes wrong usage look wrong
Bad name:  makes all usages look equally valid
```

---

## The Naming Test

For every name you create, ask:

```
1. Would a domain expert recognize this word?
   NO → Rename using their vocabulary

2. Does this name tell me WHAT, not HOW?
   NO → Remove implementation details from the name

3. Does this name express the INTENT of usage?
   NO → Rename to communicate purpose

4. Can this name be misunderstood?
   YES → Make it more specific

5. Is this the SIMPLEST name that works?
   NO → Shorten (but don't abbreviate)
```

---

## Forbidden Names

These names ALWAYS indicate a modeling failure:

| Forbidden | Why | Better Alternative |
|-----------|-----|-------------------|
| Manager | Means nothing. What does it manage? How? | Name the actual responsibility |
| Processor | Means nothing. What does it process? | Name the business operation |
| Handler | Means nothing. What does it handle? | Name the business reaction |
| Helper | Means nothing. A symptom of homeless logic | Move logic to its owner |
| Util/Utils | Dump for unmodeled concepts | Create proper domain types |
| Service | Too vague. Every class "serves" something | Name the capability |
| Controller | Framework term, not domain term | Name the use case |
| Executor | Implementation mechanism | Name what's being accomplished |
| Wrapper | Admits it's indirection without purpose | Name the added value, or remove |
| Base/Abstract | Describes inheritance position, not role | Name the common concept |
| Impl | Admits the interface name took the good name | Delete interface or rename both |
| Data/Info | Vague qualifiers that add nothing | Name the specific concept |
| Factory | Pattern name, not business name | Name what's being created and why |
| Context | Bag of stuff. What context? For whom? | Name the specific scope |
| Provider | Means "gives you something." What? | Name the source or capability |

### Forbidden Name Decision Tree

```
You're about to name something *Manager:

STOP. What does it actually do?

├── "It coordinates a workflow" → name it [Domain]Workflow or [Domain]Orchestrator
├── "It owns lifecycle of X" → name it [X]Registry or [X]Lifecycle  
├── "It applies business rules" → name it [Domain]Policy or [Domain]Rules
├── "It transforms data" → name it [Input]To[Output] or [Domain]Calculation
└── "It does many things" → SPLIT IT. It's a god class.
```

---

## Naming Patterns by Category

### Entity Names

```
Pattern: [Domain noun]

Good:
  Order, Customer, Invoice, Shipment, Product, Account

Bad:
  OrderEntity, CustomerModel, InvoiceData, ShipmentObject
  (Adding technical suffixes exposes implementation)
```

### Value Object Names

```
Pattern: [Domain measurement/descriptor]

Good:
  Money, Address, DateRange, Quantity, Email, PhoneNumber

Bad:
  MoneyValue, AddressVO, DateRangeDTO
  (Technical suffixes are noise)
```

### Behavior Names (methods/functions)

```
Pattern: [verb] + [domain object/concept]

Good:
  placeOrder(), calculateDiscount(), reserveInventory()
  authorizePayment(), cancelShipment(), verifyIdentity()

Bad:
  processOrder() — what "process" means is unclear
  handlePayment() — "handle" is too vague
  doCalculation() — "do" says nothing
  executeLogic() — meaningless
```

### Boolean Names

```
Pattern: [is/has/can/should] + [condition in domain terms]

Good:
  isEligibleForDiscount()
  hasReachedCreditLimit()
  canBeCancelled()
  shouldRequireVerification()

Bad:
  isValid() — valid according to what?
  checkFlag() — what flag?
  isProcessed() — from whose perspective?
  getStatus() — boolean shouldn't be called get
```

### Collection Names

```
Pattern: [plural domain noun] or [domain concept] + [qualifier]

Good:
  orders, pendingShipments, eligibleCustomers, activePromotions

Bad:
  orderList, shipmentArray, customerCollection
  (Container type is implementation detail — exposed in name)
  
  data, items, elements, records
  (Too generic — what kind of data/items?)
```

### Event Names

```
Pattern: [Entity] + [past tense verb]

Good:
  OrderPlaced, PaymentAuthorized, ShipmentDelivered
  InventoryReserved, CustomerVerified, DiscountApplied

Bad:
  OrderEvent — what happened?
  ProcessPayment — imperative (that's a command, not event)
  HandleShipment — meaningless combination
  PaymentProcessedEvent — "Event" suffix is noise
```

### Interface/Abstraction Names

```
Pattern: [Business capability] (no prefix/suffix)

Good:
  PaymentMethod, ShippingCalculation, PricingPolicy
  NotificationChannel, TaxRule, DiscountStrategy

Bad:
  IPaymentMethod — Hungarian notation for interfaces
  PaymentMethodInterface — redundant type in name
  AbstractPaymentMethod — position in hierarchy, not role
  PaymentMethodBase — same issue
```

---

## Context-Dependent Naming

The same concept may need different names in different bounded contexts:

```
Context: Catalog
  "Product" = name, description, images, categories

Context: Inventory
  "StockItem" = SKU, quantity, warehouse location, reorder level

Context: Pricing
  "PricedProduct" = base price, discount rules, tax category

Context: Order
  "LineItem" = product reference, quantity ordered, unit price at time of order
```

**Rule:** Don't force one name across contexts. Each context names the concept as IT sees it.

---

## Naming Refactoring Decisions

### When to Rename

```
Rename when:
├── The current name uses forbidden words (Manager, Handler, etc.)
├── The current name exposes implementation (OrderDTO, CustomerEntity)
├── The current name doesn't match what domain experts say
├── New team members consistently misunderstand what it does
└── The concept it models has evolved but the name hasn't
```

### How to Rename

1. Identify the BUSINESS concept this thing represents
2. Ask: "What would a domain expert call this?"
3. Use that word. Exactly. Don't "programmer-ify" it.
4. If no single word works, the thing might be doing too much → split first

---

## Name Length Guidelines

```
Scope vs Length:

  Local variable (tiny scope)   → short is fine: i, order, item
  Method parameter              → descriptive but brief: targetCustomer, maxRetries
  Method name                   → verb + object: calculateTotal, reserveInventory
  Class name                    → noun/noun phrase: OrderWorkflow, PricingPolicy
  Module/Package name           → single domain word: pricing, fulfillment, catalog
```

**Never abbreviate domain terms:**
```
WRONG: custPref, ordSvc, pmt, inv, txn
RIGHT: customerPreference, orderService, payment, inventory, transaction

(The 3 characters saved cost every reader 3 seconds of decoding)
```

**Exception:** Universal, industry-standard abbreviations are fine:
- HTTP, URL, ID, API, JSON, SQL, HTML
- NOT fine: svc, mgr, proc, impl, cfg, ctx

---

## Naming Smells and Fixes

| Smell | Indicates | Fix |
|-------|-----------|-----|
| "And" in name (OrderAndPaymentService) | Class does two things | Split into two classes |
| Number suffix (OrderService2, OrderServiceNew) | Fear of replacing | Replace the original |
| "Legacy" prefix | Shame but no action | Migrate or accept |
| Generic + specific (DataProcessor) | Missing domain term | Find the domain term |
| Same prefix everywhere (order*) | Possible boundary | Create package/module |
| Synonyms (create/make/build/new) | Inconsistent vocabulary | Pick one, use everywhere |
| Antonyms that don't pair (open/finish) | Confused lifecycle | Use proper pairs (open/close, start/finish, begin/end) |

---

## The Ultimate Naming Rule

> **If you can't name it in domain language, you don't understand it yet.**
>
> Naming difficulty is never a vocabulary problem.
> It's always an understanding problem.
>
> When naming is hard: stop naming, start understanding.
> The right name will become obvious when you truly understand the concept.
