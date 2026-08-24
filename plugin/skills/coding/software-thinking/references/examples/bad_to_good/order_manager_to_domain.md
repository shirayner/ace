# Example: OrderManager → Domain-Driven Design

## Before

```java
/**
 * Manages all order-related operations.
 */
public class OrderManager {
    
    private final OrderDAO orderDAO;
    private final CustomerDAO customerDAO;
    private final InventoryManager inventoryManager;
    private final PaymentProcessor paymentProcessor;
    private final EmailHelper emailHelper;
    private final PriceCalculationUtil priceUtil;
    
    public OrderDTO createOrder(CreateOrderRequest request) {
        // Validate customer
        CustomerEntity customer = customerDAO.findById(request.getCustomerId());
        if (customer == null) {
            throw new RuntimeException("Customer not found");
        }
        
        // Check inventory
        for (OrderItemDTO item : request.getItems()) {
            InventoryEntity inv = inventoryManager.checkAvailability(item.getProductId());
            if (inv.getQuantity() < item.getQuantity()) {
                throw new RuntimeException("Insufficient inventory for: " + item.getProductId());
            }
        }
        
        // Calculate pricing
        BigDecimal subtotal = BigDecimal.ZERO;
        for (OrderItemDTO item : request.getItems()) {
            BigDecimal itemPrice = priceUtil.calculateItemPrice(
                item.getProductId(), item.getQuantity(), customer.getTier());
            subtotal = subtotal.add(itemPrice);
        }
        BigDecimal tax = priceUtil.calculateTax(subtotal, customer.getAddress());
        BigDecimal shipping = priceUtil.calculateShipping(request.getItems(), customer.getAddress());
        BigDecimal total = subtotal.add(tax).add(shipping);
        
        // Process payment
        PaymentResult result = paymentProcessor.processPayment(
            customer.getPaymentMethodId(), total);
        if (!result.isSuccessful()) {
            throw new RuntimeException("Payment failed: " + result.getError());
        }
        
        // Reserve inventory
        for (OrderItemDTO item : request.getItems()) {
            inventoryManager.reserveStock(item.getProductId(), item.getQuantity());
        }
        
        // Create order entity
        OrderEntity order = new OrderEntity();
        order.setCustomerId(customer.getId());
        order.setStatus("CONFIRMED");
        order.setSubtotal(subtotal);
        order.setTax(tax);
        order.setShipping(shipping);
        order.setTotal(total);
        order.setPaymentId(result.getTransactionId());
        order.setCreatedAt(new Date());
        orderDAO.save(order);
        
        // Create order items
        for (OrderItemDTO item : request.getItems()) {
            OrderItemEntity entity = new OrderItemEntity();
            entity.setOrderId(order.getId());
            entity.setProductId(item.getProductId());
            entity.setQuantity(item.getQuantity());
            entity.setPrice(priceUtil.calculateItemPrice(
                item.getProductId(), item.getQuantity(), customer.getTier()));
            orderDAO.saveItem(entity);
        }
        
        // Send confirmation
        emailHelper.sendOrderConfirmation(customer.getEmail(), order.getId(), total);
        
        // Return DTO
        return convertToDTO(order);
    }
    
    // ... 500 more lines of updateOrder, cancelOrder, getOrder, searchOrders,
    //     generateReport, exportCSV, etc.
}
```

## Thinking

### Step 1: Understand the Business

Placing an order involves:
- Verifying the customer exists and can order
- Checking that requested items are available
- Calculating what the customer owes (pricing, tax, shipping)
- Authorizing payment
- Reserving inventory so others can't claim it
- Recording the confirmed order
- Notifying the customer

### Step 2: Identify Concepts

| Business Concept | Current Code Representation | Problem |
|-----------------|---------------------------|---------|
| Order | OrderEntity (anemic data bag) | No behavior, no invariants |
| Order placement | Buried in OrderManager.createOrder() | Mixed with 5 other concerns |
| Pricing | PriceCalculationUtil | "Util" = homeless logic |
| Payment | PaymentProcessor | Only the name is acceptable |
| Inventory reservation | InventoryManager | Mixed concerns |
| Notification | EmailHelper | "Helper" = homeless logic |
| Customer | CustomerEntity (anemic) | Only used for data lookup |

### Step 3: Identify Boundaries

```
Boundary: Ordering (lifecycle of an order)
  Concepts: Order, LineItem, OrderPlacement
  Changes when: order workflow changes

Boundary: Pricing (what things cost)
  Concepts: PricingPolicy, TaxCalculation, ShippingCost
  Changes when: pricing rules change

Boundary: Payment (financial settlement)
  Concepts: PaymentAuthorization, PaymentMethod
  Changes when: payment integrations change

Boundary: Inventory (stock management)
  Concepts: StockReservation, Availability
  Changes when: warehouse logic changes

Boundary: Notification (communication)
  Concepts: OrderConfirmation
  Changes when: messaging channels/templates change
```

### Step 4: Decision

- **Delete:** OrderManager (god class), PriceCalculationUtil (homeless logic), EmailHelper (homeless logic), all DTOs that mirror entities
- **Create:** Order as rich domain object, PricingPolicy, StockReservation
- **Rename:** PaymentProcessor → PaymentGateway (it's a boundary contract)

## After

```java
// === Ordering Boundary ===

public class Order {
    private final OrderId id;
    private final CustomerId customerId;
    private final List<LineItem> items;
    private final Money total;
    private final OrderStatus status;
    
    public static Order place(CustomerId customerId, List<LineItem> items, 
                              PricingPolicy pricing, PaymentGateway payments,
                              InventoryReservation inventory) {
        Money total = pricing.calculateTotal(items, customerId);
        payments.authorize(total, customerId);
        inventory.reserve(items);
        return new Order(OrderId.generate(), customerId, items, total, OrderStatus.CONFIRMED);
    }
    
    public void cancel(InventoryReservation inventory, PaymentGateway payments) {
        if (!status.isCancellable()) {
            throw new OrderNotCancellableException(id, status);
        }
        payments.refund(id);
        inventory.release(items);
        this.status = OrderStatus.CANCELLED;
    }
}

public record LineItem(ProductId productId, Quantity quantity, Money unitPrice) {
    public Money subtotal() {
        return unitPrice.multiply(quantity.value());
    }
}

// === Pricing Boundary ===

public class PricingPolicy {
    private final TaxRules taxRules;
    private final ShippingRates shippingRates;
    private final DiscountRules discountRules;
    
    public Money calculateTotal(List<LineItem> items, CustomerId customerId) {
        Money subtotal = items.stream()
            .map(LineItem::subtotal)
            .reduce(Money.ZERO, Money::add);
        Money discount = discountRules.apply(subtotal, customerId);
        Money afterDiscount = subtotal.subtract(discount);
        Money tax = taxRules.calculate(afterDiscount, customerId);
        Money shipping = shippingRates.calculate(items);
        return afterDiscount.add(tax).add(shipping);
    }
}

// === Payment Boundary (contract) ===

public interface PaymentGateway {
    void authorize(Money amount, CustomerId customerId);
    void refund(OrderId orderId);
}

// === Inventory Boundary (contract) ===

public interface InventoryReservation {
    void reserve(List<LineItem> items);
    void release(List<LineItem> items);
}

// === Notification (triggered by domain event, not inline) ===
// OrderPlaced event → NotificationListener handles asynchronously
```

## Why This Is Better

| Dimension | Before | After |
|-----------|--------|-------|
| Concept count | ~15 (Manager, DAO, DTO, Entity, Util, Helper, ...) | ~8 (Order, LineItem, PricingPolicy, PaymentGateway, ...) |
| Navigation cost | 1 god file (2000 lines) | 4-5 focused files |
| Business clarity | Buried in procedural code | Reads like a business description |
| Boundary integrity | None (everything coupled) | Clear contracts between domains |
| Naming | Manager, Util, Helper, DTO, Entity | Business vocabulary |
| Change isolation | Any change touches OrderManager | Pricing change → PricingPolicy only |
