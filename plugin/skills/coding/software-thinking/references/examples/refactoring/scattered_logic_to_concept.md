# Refactoring Example: Scattered Logic → Named Concept

## Scenario

A discount calculation is repeated in 4 places with slight variations. The concept "discount eligibility" exists in the business but has no name in the code.

## Before

```java
// In OrderService.java
public BigDecimal calculateTotal(Order order, Customer customer) {
    BigDecimal subtotal = order.getSubtotal();
    
    // Discount logic scattered here
    if (customer.getTier() == CustomerTier.GOLD 
        && subtotal.compareTo(new BigDecimal("100")) > 0
        && !order.hasExcludedCategories()) {
        subtotal = subtotal.multiply(new BigDecimal("0.9")); // 10% off
    }
    
    return subtotal.add(calculateTax(subtotal));
}

// In CartController.java (preview calculation)
public CartSummary getCartPreview(CartRequest request) {
    BigDecimal subtotal = calculateSubtotal(request.getItems());
    Customer customer = customerService.findById(request.getCustomerId());
    
    // Same logic, slightly different
    BigDecimal discount = BigDecimal.ZERO;
    if (customer.getTier() == CustomerTier.GOLD
        && subtotal.compareTo(new BigDecimal("100")) > 0) {
        // Bug: forgot to check excluded categories!
        discount = subtotal.multiply(new BigDecimal("0.1"));
    }
    
    return new CartSummary(subtotal, discount, subtotal.subtract(discount));
}

// In ReportGenerator.java
public BigDecimal calculateDiscountsGiven(List<Order> orders, Customer customer) {
    BigDecimal totalDiscount = BigDecimal.ZERO;
    for (Order order : orders) {
        if (customer.getTier() == CustomerTier.GOLD
            && order.getSubtotal().compareTo(new BigDecimal("100")) > 0
            && !order.hasExcludedCategories()) {
            totalDiscount = totalDiscount.add(
                order.getSubtotal().multiply(new BigDecimal("0.1")));
        }
    }
    return totalDiscount;
}

// In PromotionEmailService.java
public boolean isEligibleForDiscountEmail(Customer customer, BigDecimal cartValue) {
    // Yet another copy, checking only part of the condition
    return customer.getTier() == CustomerTier.GOLD
        && cartValue.compareTo(new BigDecimal("100")) > 0;
}
```

## Thinking

### Step 1: What's the Business Concept?

The business has a clear concept: **"Gold Tier Discount Eligibility"**
- Gold customers get 10% off orders over $100
- Excluded categories don't qualify
- This is a named policy that the business team discusses

### Step 2: What's Wrong?

1. **No named concept** — the rule exists in 4 places but has no identity
2. **Inconsistency** — CartController forgot the excluded-categories check (BUG!)
3. **Scattered knowledge** — changing the threshold means finding all 4 places
4. **Duplication** — the same decision replicated with slight drift

### Step 3: What Should It Be?

A first-class concept: `GoldTierDiscount` (or more generally, `DiscountPolicy`)

The concept should:
- Own the eligibility check
- Own the calculation
- Be the SINGLE source of truth for this business rule
- Be named in domain language

## After

```java
/**
 * Business rule: Gold-tier customers receive 10% discount on orders
 * exceeding $100, excluding restricted product categories.
 */
public class GoldTierDiscount {
    
    private static final Money MINIMUM_ORDER = Money.of(100);
    private static final BigDecimal DISCOUNT_RATE = new BigDecimal("0.10");
    
    public boolean isEligible(CustomerTier tier, Money orderAmount, 
                              boolean hasExcludedCategories) {
        return tier == CustomerTier.GOLD
            && orderAmount.exceeds(MINIMUM_ORDER)
            && !hasExcludedCategories;
    }
    
    public Money calculate(Money orderAmount) {
        return orderAmount.multiply(DISCOUNT_RATE);
    }
    
    public Money applyTo(Money orderAmount, CustomerTier tier, 
                         boolean hasExcludedCategories) {
        if (!isEligible(tier, orderAmount, hasExcludedCategories)) {
            return Money.ZERO;
        }
        return calculate(orderAmount);
    }
}
```

Now all 4 call sites use the same concept:

```java
// OrderService
Money discount = goldTierDiscount.applyTo(subtotal, customer.tier(), order.hasExcludedCategories());
Money total = subtotal.subtract(discount).add(tax);

// CartController
Money discount = goldTierDiscount.applyTo(subtotal, customer.tier(), cart.hasExcludedCategories());
// BUG FIXED: excluded categories now always checked

// ReportGenerator
orders.stream()
    .map(order -> goldTierDiscount.applyTo(order.subtotal(), customer.tier(), order.hasExcludedCategories()))
    .reduce(Money.ZERO, Money::add);

// PromotionEmailService
boolean eligible = goldTierDiscount.isEligible(customer.tier(), cartValue, false);
```

## What This Demonstrates

| Principle | Application |
|-----------|------------|
| Reveal hidden concept | "Discount eligibility" had no name → now it's `GoldTierDiscount` |
| Single source of truth | 4 copies → 1 authoritative implementation |
| Bug prevention | The CartController bug is impossible now — one path, always correct |
| Domain language | A domain expert would recognize "Gold Tier Discount" |
| Testability | One class to test, not 4 scattered conditions to verify |
| Change isolation | Threshold changes? One place. New tier? One class. |

## The Meta-Lesson

> When you see the same condition/calculation in 3+ places:
> It's not "duplication to extract."
> It's a **missing concept** to name.
>
> Don't think "I should DRY this up."
> Think "What business concept is hiding here unnamed?"
