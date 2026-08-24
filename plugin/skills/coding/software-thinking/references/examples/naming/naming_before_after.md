# Naming Examples — Before and After

## Example 1: Manager → Domain Term

| Before | After | Why |
|--------|-------|-----|
| `OrderManager` | `OrderWorkflow` | "Manager" says nothing. "Workflow" tells you it orchestrates a lifecycle. |
| `PriceManager` | `PricingPolicy` | "Manager" implies CRUD. "Policy" tells you it embodies business rules. |
| `UserManager` | `CustomerRegistry` | "Manager" is vague. "Registry" tells you it tracks who exists. |
| `InventoryManager` | `StockLedger` | "Manager" hides intent. "Ledger" is the domain's own word. |
| `NotificationManager` | `Notifier` or `MessageDispatcher` | Simpler. Says what it does. |
| `CacheManager` | `ContentCache` | What is it caching? Say that. |

---

## Example 2: Service → Capability

| Before | After | Why |
|--------|-------|-----|
| `OrderService` | `OrderPlacement` | Which aspect of order? Placement! Now it has ONE job. |
| `PaymentService` | `PaymentAuthorization` | Services do everything. This does ONE thing. |
| `AuthService` | `Authenticator` or `IdentityVerification` | What does auth mean here? Authentication or authorization? Be specific. |
| `EmailService` | `OrderConfirmationSender` | What emails? For what? Name the business operation. |
| `DataService` | `??? (split it)` | "DataService" is a red flag. It probably does 5 things. |

---

## Example 3: Util/Helper → Proper Concept

| Before | After | Why |
|--------|-------|-----|
| `PriceUtils.calculateDiscount()` | `DiscountPolicy.apply()` | Logic has a business name. Give it a home. |
| `DateHelper.isBusinessDay()` | `BusinessCalendar.isOpen()` | "Business calendar" is the domain concept. |
| `StringUtils.toSlug()` | `Slug.from(title)` | The slug IS a concept (URL identifier). Make it a type. |
| `ValidationHelper.validate()` | `OrderRules.verify(order)` | What rules? For what? Domain term. |
| `MathUtils.roundMoney()` | `Money.rounded()` | Money should know how to round itself. |

---

## Example 4: Technical Suffix → Clean Name

| Before | After | Why |
|--------|-------|-----|
| `OrderEntity` | `Order` | The type system knows it's a class. "Entity" is noise. |
| `CustomerDTO` | `CustomerSummary` | What IS this DTO? A summary view. Name the concept. |
| `OrderRequest` | `PlaceOrderCommand` | What kind of request? A command to place. Be specific. |
| `PaymentResponse` | `PaymentConfirmation` | What does the response represent? A confirmation. |
| `OrderMapper` | (deleted) | If Order can serialize itself, no mapper needed. |
| `IPaymentGateway` | `PaymentGateway` | Hungarian notation for interfaces died in 2005. |
| `PaymentGatewayImpl` | `StripePayments` | Name the WHAT, not the IS-AN-IMPL. |

---

## Example 5: Vague Verb → Specific Intent

| Before | After | Why |
|--------|-------|-----|
| `processOrder()` | `placeOrder()` | "Process" is meaningless. What do you DO to the order? |
| `handlePayment()` | `authorizePayment()` | "Handle" is a surrender word. What's the business action? |
| `doValidation()` | `enforceOrderRules()` | "Do" adds nothing. What rules are being enforced? |
| `executeLogic()` | `calculateShippingCost()` | Name the specific calculation or decision. |
| `run()` | `dispatchPendingOrders()` | What runs? For what purpose? |
| `getData()` | `loadOrderHistory()` | What data? For whom? Why? |
| `update()` | `adjustQuantity()` or `changeAddress()` | What aspect is being updated? |

---

## Example 6: Boolean Method Names

| Before | After | Why |
|--------|-------|-----|
| `isValid(order)` | `order.meetsPlacementCriteria()` | Valid by what standard? For what purpose? |
| `checkStatus()` | `isReadyForShipment()` | What status? Ready for what? |
| `canProcess()` | `canBeCancelled()` | Process what? Be specific about the operation. |
| `hasFlag()` | `requiresVerification()` | What flag means in business terms. |
| `isActive()` | `isAcceptingOrders()` | Active in what sense? Business meaning. |

---

## Example 7: Collection Names

| Before | After | Why |
|--------|-------|-----|
| `orderList` | `orders` | Don't encode the container type. |
| `itemArray` | `lineItems` | Business term + plural = perfect. |
| `customerMap` | `customersByRegion` | What's the key? Say it. |
| `data` | `pendingShipments` | WHAT data? |
| `results` | `matchingProducts` | Results of what? |
| `items` | `cartContents` or `orderLineItems` | Items of what? In what context? |

---

## Example 8: Event Names

| Before | After | Why |
|--------|-------|-----|
| `OrderEvent` | `OrderPlaced` | What happened? Past tense. Specific. |
| `PaymentEvent` | `PaymentAuthorized` | Which payment event? The authorization. |
| `ProcessOrder` | `OrderPlaced` (event) or `PlaceOrder` (command) | Is this a command or event? Different tenses. |
| `OrderUpdatedEvent` | `ShippingAddressChanged` | WHAT was updated? Be specific. |
| `GenericEvent<Order>` | `OrderCancelled` | Generic = useless. Name what happened. |

---

## The Pattern

```
BAD naming thought process:
  "What IS this thing in code terms?"
  → It's a service → OrderService
  → It's an entity → OrderEntity
  → It's a utility → OrderUtils

GOOD naming thought process:
  "What does the BUSINESS call this?"
  → The business calls it "placing an order" → OrderPlacement
  → The business calls it "pricing policy" → PricingPolicy
  → The business calls it "the customer's ledger" → CustomerLedger
```
