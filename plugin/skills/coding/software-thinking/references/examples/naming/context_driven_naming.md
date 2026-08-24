# Naming Example: Domain-Driven Naming in Different Contexts

## The Challenge

The same real-world thing often needs different names in different bounded contexts. This isn't inconsistency — it's precision.

---

## Example: "User" Across Contexts

### Bad: One Name Everywhere

```java
// The "User" god-object used by every module
public class User {
    private Long id;
    private String email;
    private String passwordHash;           // Auth only
    private LocalDate lastLogin;           // Auth only
    private String firstName;              // Profile
    private String lastName;               // Profile
    private String avatarUrl;              // Profile
    private String shippingAddress;        // Order
    private String billingAddress;         // Order
    private String phoneNumber;            // Communication
    private boolean emailVerified;         // Auth
    private String tier;                   // Loyalty
    private int loyaltyPoints;             // Loyalty
    private String paymentMethodId;        // Billing
    private String stripeCustomerId;       // Billing (leaked!)
    // ... 30 more fields
}

// Every module imports User and uses 3 of 30 fields
```

### Good: Context-Specific Names

```java
// === Authentication Context ===
public class Identity {
    private final IdentityId id;
    private final Email email;
    private final PasswordHash credentials;
    private final boolean verified;
    private Instant lastAuthenticated;
    
    public AuthToken authenticate(Password attempt) { ... }
}

// === Customer Profile Context ===
public class CustomerProfile {
    private final CustomerId id;
    private final PersonName name;
    private final AvatarUrl avatar;
    private final ContactInfo contact;
    
    public void updateContact(ContactInfo newContact) { ... }
}

// === Ordering Context ===
public class Buyer {
    private final BuyerId id;
    private final ShippingAddress defaultShipping;
    private final BillingAddress defaultBilling;
    
    public ShippingAddress shippingFor(Order order) { ... }
}

// === Loyalty Context ===
public class Member {
    private final MemberId id;
    private final MemberTier tier;
    private final Points balance;
    
    public void earnPoints(PurchaseAmount amount) { ... }
    public boolean canRedeem(Points required) { ... }
}

// === Billing Context ===
public class PaymentAccount {
    private final AccountId id;
    private final PaymentMethod defaultMethod;
    
    public PaymentAuthorization authorize(Money amount) { ... }
}
```

### Why Multiple Names Are Better

| Aspect | One "User" | Multiple Names |
|--------|-----------|----------------|
| Clarity | What fields matter here? All 30? | Only fields for THIS context exist |
| Coupling | Change to billing breaks auth | Each context evolves independently |
| Vocabulary | "User" means nothing specific | Each name tells you the role |
| Size | 30-field god object | 3-5 fields per context |
| Responsibility | Does everything poorly | Each does one thing well |

---

## Example: Process Naming

### Bad: Generic Verbs

```java
class OrderProcessor {
    void process(Order order) { ... }          // WHAT processing?
}

class PaymentHandler {
    void handle(Payment payment) { ... }       // WHAT handling?
}

class DataManager {
    void manage(Data data) { ... }             // WHAT management?
}
```

### Good: Specific Business Operations

```java
class OrderFulfillment {
    void fulfill(Order order) { ... }          // Pick, pack, ship
}

class PaymentAuthorization {
    void authorize(PaymentRequest request) { ... }  // Verify and hold funds
}

class InventoryReconciliation {
    void reconcile(WarehouseReport report) { ... }  // Match expected vs actual
}
```

---

## Example: Naming at Different Abstraction Levels

### The Hierarchy

```
Level 4 (Capability):    "Fulfillment"
Level 3 (Process):       "ShipmentPlanning"
Level 2 (Operation):     "calculateOptimalRoute"
Level 1 (Step):          "lookupWarehouseDistance"
```

### Bad: Everything at the Same Abstraction Level

```java
class FulfillmentService {
    void fulfill(Order order) {
        // Mixes all abstraction levels
        List<Warehouse> warehouses = warehouseRepo.findAll();
        for (Warehouse w : warehouses) {
            double dist = geoService.calculateDistance(
                w.getLatitude(), w.getLongitude(),
                order.getShippingLat(), order.getShippingLon());
            // ... 200 lines mixing business logic with geo calculations
        }
    }
}
```

### Good: Names Reflect Their Level

```java
// Level 4: Capability
class Fulfillment {
    void fulfill(Order order) {
        ShipmentPlan plan = shipmentPlanning.planFor(order);
        plan.execute();
    }
}

// Level 3: Process
class ShipmentPlanning {
    ShipmentPlan planFor(Order order) {
        Warehouse nearest = warehouseSelection.closestTo(order.destination());
        Route route = routeOptimization.optimalRoute(nearest, order.destination());
        return new ShipmentPlan(order, nearest, route);
    }
}

// Level 2: Operation
class WarehouseSelection {
    Warehouse closestTo(Address destination) { ... }
}

// Level 1: Step (often just a method, not its own class)
// calculateDistance() — inside WarehouseSelection, not exposed
```

---

## Example: Naming Conventions by Type

### Commands (imperative — request to DO something)

```
Pattern: [Verb] + [Object]

PlaceOrder          (not CreateOrderCommand)
CancelShipment      (not ShipmentCancellationRequest)  
AuthorizePayment    (not PaymentAuthorizationCommand)
AdjustInventory     (not InventoryAdjustmentRequest)
```

### Events (past tense — something that HAPPENED)

```
Pattern: [Object] + [PastVerb]

OrderPlaced         (not OrderEvent)
PaymentAuthorized   (not PaymentProcessedEvent)
ShipmentDelivered   (not DeliveryCompletedNotification)
InventoryDepleted   (not StockLevelChangedEvent)
```

### Queries (interrogative — asking for INFORMATION)

```
Pattern: descriptive noun phrase

OrderSummary        (not GetOrderResponse)
CustomerHistory     (not FindCustomerTransactionsResult)
InventorySnapshot   (not InventoryStatusDTO)
ShipmentTracking    (not TrackingInfoResponse)
```

---

## The Naming Decision Flowchart

```
I need to name something.

1. What CONTEXT am I in?
   → Use that context's vocabulary (User in auth = Identity; User in orders = Buyer)

2. What LEVEL of abstraction?
   → Level 4: Capability noun (Fulfillment, Authentication)
   → Level 3: Process noun (ShipmentPlanning, IdentityVerification)
   → Level 2: Operation verb+noun (calculateRoute, verifyCredentials)
   → Level 1: Step — usually doesn't need its own name

3. What TYPE of concept?
   → Entity: noun (Order, Customer, Shipment)
   → Value: measurement/descriptor (Money, Address, DateRange)
   → Policy: [domain]Policy (PricingPolicy, FulfillmentPolicy)
   → Event: [noun][past-verb] (OrderPlaced, PaymentFailed)
   → Command: [verb][noun] (PlaceOrder, CancelShipment)
   → Query result: descriptive noun (OrderSummary, InventorySnapshot)

4. Does a DOMAIN EXPERT use this word?
   → YES: Use exactly that word
   → NO: Find the word they DO use
```
