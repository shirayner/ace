# Architecture Example: Information Flow Optimization

## Scenario

A report generation system fetches data from multiple sources in an inefficient, tangled way. Information flows are implicit, redundant, and hard to trace.

## Before

```java
public class MonthlyRevenueReportGenerator {
    
    private final OrderRepository orderRepo;
    private final CustomerRepository customerRepo;
    private final ProductRepository productRepo;
    private final PaymentRepository paymentRepo;
    private final RefundRepository refundRepo;
    private final ExchangeRateService exchangeRates;
    private final TaxService taxService;
    private final CategoryRepository categoryRepo;
    
    public RevenueReport generate(YearMonth month) {
        // Fetch ALL orders (N+1 problem hidden)
        List<Order> orders = orderRepo.findByMonth(month);
        
        BigDecimal totalRevenue = BigDecimal.ZERO;
        Map<String, BigDecimal> revenueByCategory = new HashMap<>();
        Map<String, BigDecimal> revenueByRegion = new HashMap<>();
        
        for (Order order : orders) {
            // FETCH customer for EVERY order (N+1!)
            Customer customer = customerRepo.findById(order.getCustomerId());
            
            // FETCH payment for EVERY order (N+1!)
            Payment payment = paymentRepo.findByOrderId(order.getId());
            
            // Convert currency for EVERY order
            BigDecimal amountUSD = exchangeRates.convert(
                payment.getAmount(), payment.getCurrency(), "USD");
            
            // FETCH refund for EVERY order (N+1!)
            Refund refund = refundRepo.findByOrderId(order.getId());
            BigDecimal netAmount = amountUSD;
            if (refund != null) {
                netAmount = amountUSD.subtract(
                    exchangeRates.convert(refund.getAmount(), refund.getCurrency(), "USD"));
            }
            
            totalRevenue = totalRevenue.add(netAmount);
            
            // FETCH category for EVERY order item (N*M!)
            for (OrderItem item : order.getItems()) {
                Product product = productRepo.findById(item.getProductId());
                Category category = categoryRepo.findById(product.getCategoryId());
                revenueByCategory.merge(category.getName(), netAmount, BigDecimal::add);
            }
            
            // Assign to region
            revenueByRegion.merge(customer.getRegion(), netAmount, BigDecimal::add);
        }
        
        return new RevenueReport(month, totalRevenue, revenueByCategory, revenueByRegion);
    }
}
```

**Problems:**
1. N+1 queries everywhere (fetch per order in a loop)
2. Information fetched redundantly (exchange rate called per order)
3. Full objects loaded when only 1-2 fields needed (full Customer for just region)
4. No clear data pipeline — everything tangled in one loop
5. Implicit dependencies on 8 repositories

## Thinking

### Information Flow Analysis

What information does this report ACTUALLY need?

```
Inputs needed:
  - Orders in month: { orderId, customerId, items[] }
  - Payments: { orderId → amount, currency }
  - Refunds: { orderId → amount, currency } (if exists)
  - Exchange rates: { currency → USD rate }
  - Customers: { customerId → region }
  - Products: { productId → categoryId }
  - Categories: { categoryId → name }

Output:
  - Total revenue (USD)
  - Revenue by category
  - Revenue by region
```

### Optimized Flow Design

```
Phase 1: Gather (bulk fetch, no N+1)
  → All orders for month
  → All payments for those orders (one query)
  → All refunds for those orders (one query)
  → All exchange rates (one call, cached)
  → Unique customer regions (one query)
  → Product-to-category mapping (one query)

Phase 2: Transform (pure calculation, no I/O)
  → Convert each payment to USD
  → Subtract refunds
  → Group by category
  → Group by region

Phase 3: Produce (assemble output)
  → Create report structure
```

## After

```java
public class MonthlyRevenueReport {
    
    private final RevenueDataSource dataSource;
    
    public RevenueReport generate(YearMonth month) {
        // Phase 1: Gather all data upfront (batch, no N+1)
        RevenueData data = dataSource.loadForMonth(month);
        
        // Phase 2: Pure transformation (no I/O, easy to test)
        List<RevenueEntry> entries = data.orders().stream()
            .map(order -> toRevenueEntry(order, data))
            .filter(entry -> entry.netRevenue().isPositive())
            .toList();
        
        // Phase 3: Aggregate
        Money totalRevenue = entries.stream()
            .map(RevenueEntry::netRevenue)
            .reduce(Money.ZERO, Money::add);
        
        Map<String, Money> byCategory = entries.stream()
            .collect(groupingBy(RevenueEntry::category, 
                     reducing(Money.ZERO, RevenueEntry::netRevenue, Money::add)));
        
        Map<String, Money> byRegion = entries.stream()
            .collect(groupingBy(RevenueEntry::region,
                     reducing(Money.ZERO, RevenueEntry::netRevenue, Money::add)));
        
        return new RevenueReport(month, totalRevenue, byCategory, byRegion);
    }
    
    private RevenueEntry toRevenueEntry(OrderSummary order, RevenueData data) {
        Money payment = data.paymentFor(order.id())
            .map(p -> data.toUSD(p.amount(), p.currency()))
            .orElse(Money.ZERO);
        
        Money refund = data.refundFor(order.id())
            .map(r -> data.toUSD(r.amount(), r.currency()))
            .orElse(Money.ZERO);
        
        return new RevenueEntry(
            payment.subtract(refund),
            data.categoryFor(order.primaryProductId()),
            data.regionFor(order.customerId())
        );
    }
}

// Data source handles all I/O in batch
public class RevenueDataSource {
    
    public RevenueData loadForMonth(YearMonth month) {
        List<OrderSummary> orders = orderStore.summariesForMonth(month);
        Set<OrderId> orderIds = orders.stream().map(OrderSummary::id).collect(toSet());
        Set<CustomerId> customerIds = orders.stream().map(OrderSummary::customerId).collect(toSet());
        Set<ProductId> productIds = orders.stream().map(OrderSummary::primaryProductId).collect(toSet());
        
        // All data loaded in bulk — 6 queries total, regardless of order count
        Map<OrderId, PaymentSummary> payments = paymentStore.forOrders(orderIds);
        Map<OrderId, RefundSummary> refunds = refundStore.forOrders(orderIds);
        Map<String, BigDecimal> exchangeRates = rateProvider.currentRates();
        Map<CustomerId, String> customerRegions = customerStore.regionsFor(customerIds);
        Map<ProductId, String> productCategories = catalogStore.categoriesFor(productIds);
        
        return new RevenueData(orders, payments, refunds, exchangeRates, 
                              customerRegions, productCategories);
    }
}

// Minimal projections — NOT full entities
public record OrderSummary(OrderId id, CustomerId customerId, ProductId primaryProductId) {}
public record PaymentSummary(Money amount, String currency) {}
public record RefundSummary(Money amount, String currency) {}
```

## Comparison

| Aspect | Before | After |
|--------|--------|-------|
| Database queries | N * 4 (per order: customer, payment, refund, product) | 6 total (batch) |
| For 1000 orders | ~4000 queries | 6 queries |
| Data loaded | Full entities (30+ fields each) | Minimal projections (2-3 fields) |
| I/O mixed with logic | Everywhere (in the loop) | Separated (Phase 1 vs Phase 2) |
| Testability | Need all 8 repos mocked | Transform phase is pure — no mocks |
| Traceability | Logic tangled with fetching | Clear pipeline: gather → transform → produce |

## The Principles Demonstrated

1. **Batch over loop** — never fetch one-at-a-time in a loop
2. **Projection over entity** — load only the fields you need
3. **Separate I/O from logic** — gather phase (impure) vs transform phase (pure)
4. **Pipeline pattern** — data flows in one direction through named stages
5. **Minimize boundary crossings** — cross the persistence boundary once per type, not per record
