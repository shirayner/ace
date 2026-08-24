# Boundary Example: Leaked Boundary → Clean Contract

## Scenario

An e-commerce system has an Order context and a Shipping context. Currently, the Shipping module imports and uses internal Order types directly — a boundary violation.

## Before

```java
// === Order Module (internal types) ===

public class Order {
    private Long id;
    private List<OrderItem> items;
    private Customer customer;
    private Address shippingAddress;
    private Address billingAddress;
    private PaymentInfo paymentInfo;    // Shipping doesn't need this!
    private List<OrderNote> notes;      // Shipping doesn't need this!
    private DiscountDetails discount;   // Shipping doesn't need this!
    private String status;
    private AuditInfo auditInfo;        // Shipping doesn't need this!
    // ... 15 more fields
}

public class OrderItem {
    private Long id;
    private Product product;    // Full product with all catalog data
    private int quantity;
    private BigDecimal price;
    private BigDecimal discount;
    private String customization;
}

// === Shipping Module (depends on Order internals) ===

public class ShippingCalculator {
    
    public ShippingQuote calculateShipping(Order order) {
        // Uses order.getShippingAddress() — OK
        // Uses order.getItems() — but only needs weight and dimensions!
        // Has ACCESS to order.getPaymentInfo() — shouldn't see this
        // Has ACCESS to order.getNotes() — shouldn't see this
        
        Address destination = order.getShippingAddress();
        
        double totalWeight = 0;
        for (OrderItem item : order.getItems()) {
            // Reaches into Product (ORDER's internal model) to get weight
            totalWeight += item.getProduct().getWeight() * item.getQuantity();
        }
        
        Dimensions totalDims = calculateDimensions(order.getItems());
        
        return carrier.getQuote(destination, totalWeight, totalDims);
    }
}

public class ShipmentCreator {
    
    public Shipment createShipment(Order order) {
        // Again depends on Order internals
        Shipment shipment = new Shipment();
        shipment.setDestination(order.getShippingAddress());
        shipment.setRecipientName(order.getCustomer().getFullName());
        shipment.setRecipientPhone(order.getCustomer().getPhone());
        
        for (OrderItem item : order.getItems()) {
            ShipmentItem si = new ShipmentItem();
            si.setSku(item.getProduct().getSku());
            si.setDescription(item.getProduct().getName());
            si.setQuantity(item.getQuantity());
            si.setWeight(item.getProduct().getWeight());
            shipment.addItem(si);
        }
        
        return shipment;
    }
}
```

## Thinking

### Boundary Violation Analysis

**What Shipping actually NEEDS from Order:**
- Shipping address (destination)
- Recipient name and phone
- For each item: SKU, weight, dimensions, quantity

**What Shipping currently HAS ACCESS TO:**
- Payment info (confidential!)
- Customer's full profile
- Order notes (private)
- Discount details (irrelevant)
- Audit trail (irrelevant)
- Full product catalog data

**The problem:** Shipping can see Order's internals. This means:
1. Changes to Order's internal structure might break Shipping
2. Shipping could accidentally depend on fields it shouldn't
3. No clear contract between the two modules
4. If Order becomes a separate service later, the coupling is hidden

### Boundary Design Questions

- What is the MINIMUM information Shipping needs? → address, recipient, item physical properties
- What is the communication direction? → Order tells Shipping what to ship (Order → Shipping)
- What is the contract? → A "shipment request" with physical items and destination

## After

```java
// === Boundary Contract (owned by Shipping module) ===

public record ShipmentRequest(
    ShippingDestination destination,
    List<PhysicalItem> items
) {
    public record ShippingDestination(
        String recipientName,
        String recipientPhone,
        String street,
        String city,
        String postalCode,
        String country
    ) {}
    
    public record PhysicalItem(
        String sku,
        String description,
        int quantity,
        double weightKg,
        Dimensions dimensions
    ) {}
    
    public record Dimensions(double lengthCm, double widthCm, double heightCm) {}
}

// === Shipping Module (depends only on its own contract) ===

public class ShippingCalculator {
    
    public ShippingQuote calculateShipping(ShipmentRequest request) {
        double totalWeight = request.items().stream()
            .mapToDouble(item -> item.weightKg() * item.quantity())
            .sum();
        
        Dimensions totalDims = calculatePackingDimensions(request.items());
        
        return carrier.getQuote(request.destination(), totalWeight, totalDims);
    }
}

public class ShipmentCreator {
    
    public Shipment createShipment(ShipmentRequest request) {
        Shipment shipment = new Shipment();
        shipment.setDestination(request.destination());
        
        for (var item : request.items()) {
            shipment.addItem(new ShipmentItem(
                item.sku(), item.description(), 
                item.quantity(), item.weightKg()
            ));
        }
        
        return shipment;
    }
}

// === Order Module (creates the contract when ready to ship) ===

public class Order {
    
    public ShipmentRequest toShipmentRequest() {
        return new ShipmentRequest(
            new ShipmentRequest.ShippingDestination(
                customer.fullName(),
                customer.phone(),
                shippingAddress.street(),
                shippingAddress.city(),
                shippingAddress.postalCode(),
                shippingAddress.country()
            ),
            items.stream()
                .map(item -> new ShipmentRequest.PhysicalItem(
                    item.product().sku(),
                    item.product().name(),
                    item.quantity(),
                    item.product().weightKg(),
                    item.product().dimensions()
                ))
                .toList()
        );
    }
}
```

## What Changed

| Aspect | Before | After |
|--------|--------|-------|
| Shipping's dependency | Full Order object (15+ fields visible) | ShipmentRequest (3 fields) |
| Information exposure | Payment, notes, discounts all visible | Only physical shipping data |
| Coupling direction | Shipping imports Order types | Order creates Shipping's contract |
| Change isolation | Order internal change might break Shipping | Order changes invisible to Shipping |
| Contract clarity | Implicit (whatever Order exposes) | Explicit (ShipmentRequest record) |

## Key Principles Demonstrated

1. **Minimum information crossing:** Only what Shipping NEEDS, nothing more
2. **Boundary-owned contract:** ShipmentRequest belongs to Shipping (the consumer defines what it needs)
3. **No internal leakage:** Order's internal types (Customer, PaymentInfo, OrderNote) never cross the boundary
4. **Translation at the boundary:** Order.toShipmentRequest() is the translation point — one place to maintain
5. **Independence:** Shipping can be tested with a hand-crafted ShipmentRequest — no Order needed
