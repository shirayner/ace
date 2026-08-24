# Architecture Example: State Explosion → Type-Safe State Machine

## Scenario

An order entity uses nullable fields and a string status. Impossible states are representable. Bugs arise from accessing fields that don't exist in certain states.

## Before

```java
public class Order {
    private Long id;
    private String status; // "DRAFT", "CONFIRMED", "PAID", "SHIPPED", "DELIVERED", "CANCELLED"
    
    // These are null in some states, populated in others
    private String paymentTransactionId;   // null until PAID
    private LocalDateTime paidAt;          // null until PAID
    private String trackingNumber;         // null until SHIPPED
    private String carrier;                // null until SHIPPED
    private LocalDateTime shippedAt;       // null until SHIPPED
    private LocalDateTime deliveredAt;     // null until DELIVERED
    private String cancellationReason;     // null unless CANCELLED
    private LocalDateTime cancelledAt;     // null unless CANCELLED
    private String refundId;               // null unless CANCELLED after payment
    
    // Getters for everything — no protection
    public String getTrackingNumber() { return trackingNumber; }
    public String getPaymentTransactionId() { return paymentTransactionId; }
    // ...
}

// Usage — riddled with defensive checks
public class ShipmentService {
    public void processShipment(Order order) {
        // Must check status manually — no compile-time guarantee
        if (!"PAID".equals(order.getStatus())) {
            throw new IllegalStateException("Cannot ship unpaid order");
        }
        // Hope nobody calls getTrackingNumber() on a DRAFT order and gets null
        // Hope nobody sets status to "SHPPED" (typo in string)
    }
}

// Bug #1: String typo
order.setStatus("SHIPED"); // compiles fine, breaks everything

// Bug #2: Accessing field in wrong state
String tracking = draftOrder.getTrackingNumber(); // returns null, NPE later

// Bug #3: Invalid transition
order.setStatus("DELIVERED"); // was still DRAFT — no guard!
```

**Possible states:** 6 status values × 2⁹ nullable combinations = 3072 states
**Valid states:** 6 (one per status, with specific fields populated)
**State explosion:** 3066 impossible-but-representable states

## Thinking

### The Problem

The type system allows expressing states that cannot exist in the business:
- A DRAFT order with a tracking number
- A CANCELLED order with a delivery date
- A PAID order without a payment ID

Every consumer must defensively check state before accessing fields.
String-based status allows typos and invalid transitions.

### The Solution

Make impossible states unrepresentable using sum types (sealed interfaces).
Each state carries EXACTLY the data that exists in that state.

## After

```java
public sealed interface Order {
    OrderId id();
    CustomerId customerId();
    List<LineItem> items();
    Money total();
    
    record Draft(
        OrderId id, CustomerId customerId, 
        List<LineItem> items, Money total
    ) implements Order {
        
        public Confirmed confirm(PaymentConfirmation payment) {
            return new Confirmed(id, customerId, items, total, 
                                 payment.transactionId(), Instant.now());
        }
        
        public Cancelled cancel(String reason) {
            return new Cancelled(id, customerId, items, total, 
                                 reason, Instant.now(), null);
        }
    }
    
    record Confirmed(
        OrderId id, CustomerId customerId,
        List<LineItem> items, Money total,
        String paymentTransactionId,    // ALWAYS present in this state
        Instant paidAt                  // ALWAYS present in this state
    ) implements Order {
        
        public Shipped ship(String trackingNumber, String carrier) {
            return new Shipped(id, customerId, items, total,
                              paymentTransactionId, paidAt,
                              trackingNumber, carrier, Instant.now());
        }
        
        public Cancelled cancel(String reason) {
            return new Cancelled(id, customerId, items, total,
                                reason, Instant.now(), paymentTransactionId);
        }
    }
    
    record Shipped(
        OrderId id, CustomerId customerId,
        List<LineItem> items, Money total,
        String paymentTransactionId, Instant paidAt,
        String trackingNumber,      // ALWAYS present in this state
        String carrier,             // ALWAYS present in this state
        Instant shippedAt           // ALWAYS present in this state
    ) implements Order {
        
        public Delivered deliver() {
            return new Delivered(id, customerId, items, total,
                               paymentTransactionId, paidAt,
                               trackingNumber, carrier, shippedAt, 
                               Instant.now());
        }
    }
    
    record Delivered(
        OrderId id, CustomerId customerId,
        List<LineItem> items, Money total,
        String paymentTransactionId, Instant paidAt,
        String trackingNumber, String carrier,
        Instant shippedAt, Instant deliveredAt
    ) implements Order {}
    
    record Cancelled(
        OrderId id, CustomerId customerId,
        List<LineItem> items, Money total,
        String reason,              // ALWAYS present in this state
        Instant cancelledAt,        // ALWAYS present in this state
        String refundId             // nullable only here (pre-payment vs post-payment cancel)
    ) implements Order {}
}

// Usage — impossible to misuse

public class ShipmentService {
    // Method signature GUARANTEES order is paid — no runtime check needed
    public Order.Shipped ship(Order.Confirmed paidOrder, TrackingInfo tracking) {
        return paidOrder.ship(tracking.number(), tracking.carrier());
    }
}

// Bug #1: IMPOSSIBLE — no string status, no typos
// Bug #2: IMPOSSIBLE — Draft has no trackingNumber() method
// Bug #3: IMPOSSIBLE — Draft only has .confirm() and .cancel(), not .ship()

// Pattern matching for polymorphic behavior
public String describe(Order order) {
    return switch (order) {
        case Order.Draft d -> "Draft order, %d items".formatted(d.items().size());
        case Order.Confirmed c -> "Paid on %s".formatted(c.paidAt());
        case Order.Shipped s -> "Tracking: %s via %s".formatted(s.trackingNumber(), s.carrier());
        case Order.Delivered d -> "Delivered on %s".formatted(d.deliveredAt());
        case Order.Cancelled c -> "Cancelled: %s".formatted(c.reason());
    };
}
```

## Comparison

| Aspect | Before (nullable fields) | After (sealed types) |
|--------|------------------------|---------------------|
| Possible states | 3072 | 6 (exactly the valid ones) |
| Invalid transition | Runtime exception (if you remember to check) | Compile error |
| Accessing wrong-state field | Returns null, NPE later | Method doesn't exist — compile error |
| Status typo | Compiles, fails at runtime | Impossible |
| Defensive checks needed | Every consumer, every field | Zero |
| Exhaustiveness | Hope you handled all cases | Compiler forces all cases in switch |
| Reading the code | "What does status DRAFT mean? What fields exist?" | Type definition IS the documentation |

## The Design Principle

> **Make impossible states unrepresentable.**
>
> Don't validate at runtime what the type system can enforce at compile time.
> Every nullable field is a lie — it says "this might not exist" when the business
> knows exactly when it exists and when it doesn't.
>
> The best error handling is making errors impossible.
