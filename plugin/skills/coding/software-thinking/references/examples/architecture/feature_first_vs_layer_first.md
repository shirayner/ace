# Architecture Example: Feature-First vs Layer-First

## Scenario

A team needs to add a "coupon redemption" feature. We contrast how the change looks in a layer-first architecture vs a concept-first architecture.

## Layer-First Architecture (Problematic)

### Existing Structure

```
src/
├── controllers/
│   ├── OrderController.java
│   ├── CouponController.java      ← new file
│   └── ...
├── services/
│   ├── OrderService.java           ← modified
│   ├── CouponService.java          ← new file
│   └── CouponValidationService.java ← new file
├── repositories/
│   ├── OrderRepository.java        ← modified (new query)
│   ├── CouponRepository.java       ← new file
│   └── ...
├── models/
│   ├── Order.java                   ← modified (new field)
│   ├── Coupon.java                  ← new file
│   ├── CouponUsage.java             ← new file
│   └── ...
├── dtos/
│   ├── OrderDTO.java                ← modified
│   ├── CouponDTO.java               ← new file
│   ├── CouponRequest.java           ← new file
│   ├── CouponResponse.java          ← new file
│   └── ApplyCouponRequest.java      ← new file
├── mappers/
│   ├── OrderMapper.java             ← modified
│   ├── CouponMapper.java            ← new file
│   └── ...
├── validators/
│   ├── CouponValidator.java         ← new file
│   └── ...
└── config/
    └── CouponConfig.java            ← new file
```

**Files touched: 7 modified + 10 new = 17 files across 8 directories**

**Problem:** To understand "how does coupon redemption work?", you must:
1. Start at CouponController → find endpoint
2. Jump to CouponService → find orchestration
3. Jump to CouponValidationService → find rules
4. Jump to CouponRepository → find persistence
5. Jump to Coupon model → find structure
6. Jump to OrderService → find integration point
7. Trace through CouponMapper → understand transformation
8. Read CouponConfig → understand wiring

**8 files across 8 directories for ONE feature.**

---

## Concept-First Architecture (Recommended)

### Existing Structure

```
src/
├── ordering/
│   ├── Order.java                   ← modified (accepts coupon)
│   └── OrderWorkflow.java           ← modified (coupon in flow)
├── coupon/                          ← new boundary
│   ├── Coupon.java                  ← new: domain model + rules
│   ├── CouponRedemption.java        ← new: the business operation
│   ├── CouponEndpoint.java          ← new: thin HTTP adapter
│   └── CouponStore.java             ← new: thin persistence adapter
└── ...
```

**Files touched: 2 modified + 4 new = 6 files in 2 directories**

**To understand "how does coupon redemption work?":**
1. Open `coupon/` directory → see everything in one place
2. Read `CouponRedemption.java` → understand the complete business flow
3. Done.

---

## The Concept-First Code

```java
// === coupon/Coupon.java ===

public class Coupon {
    private final CouponCode code;
    private final DiscountType discountType;  // PERCENTAGE or FIXED_AMOUNT
    private final Money discountValue;
    private final Money minimumOrder;
    private final LocalDate expiresAt;
    private final int maxUsages;
    private int currentUsages;
    
    public boolean isRedeemableFor(Money orderTotal) {
        return !isExpired() 
            && !isExhausted() 
            && orderTotal.isAtLeast(minimumOrder);
    }
    
    public Money calculateDiscount(Money orderTotal) {
        if (!isRedeemableFor(orderTotal)) {
            return Money.ZERO;
        }
        return switch (discountType) {
            case PERCENTAGE -> orderTotal.multiply(discountValue.asPercentage());
            case FIXED_AMOUNT -> discountValue.min(orderTotal);
        };
    }
    
    public void recordRedemption() {
        if (isExhausted()) throw new CouponExhaustedException(code);
        currentUsages++;
    }
    
    private boolean isExpired() { return LocalDate.now().isAfter(expiresAt); }
    private boolean isExhausted() { return currentUsages >= maxUsages; }
}

// === coupon/CouponRedemption.java ===

public class CouponRedemption {
    private final CouponStore coupons;
    
    public Money redeem(CouponCode code, Money orderTotal) {
        Coupon coupon = coupons.findByCode(code)
            .orElseThrow(() -> new CouponNotFoundException(code));
        
        Money discount = coupon.calculateDiscount(orderTotal);
        
        if (discount.isPositive()) {
            coupon.recordRedemption();
            coupons.save(coupon);
        }
        
        return discount;
    }
}

// === coupon/CouponEndpoint.java ===

@RestController
public class CouponEndpoint {
    private final CouponRedemption redemption;
    
    @PostMapping("/coupons/validate")
    public CouponPreview validate(@RequestBody ValidateCouponRequest request) {
        Coupon coupon = coupons.findByCode(request.code())
            .orElseThrow(() -> new CouponNotFoundException(request.code()));
        Money discount = coupon.calculateDiscount(request.orderTotal());
        return new CouponPreview(discount, coupon.isRedeemableFor(request.orderTotal()));
    }
}

// === ordering/Order.java (minimal modification) ===

public class Order {
    // ... existing fields ...
    private Money couponDiscount = Money.ZERO;
    
    public void applyCoupon(Money discount) {
        this.couponDiscount = discount;
    }
    
    public Money finalTotal() {
        return subtotal().subtract(couponDiscount).add(tax());
    }
}
```

## Comparison

| Metric | Layer-First | Concept-First |
|--------|-------------|---------------|
| Files for feature | 17 | 6 |
| Directories touched | 8 | 2 |
| Files to read to understand feature | 8 | 2 |
| Boundary isolation | None (coupon logic in 8 places) | Complete (coupon/ owns everything) |
| Impact of changing coupon rules | Touch service + validator + model | Touch Coupon.java only |
| Impact of changing coupon persistence | Touch repo + config + possibly service | Touch CouponStore.java only |
| Can test coupon logic in isolation? | Hard (tangled with OrderService) | Easy (Coupon is self-contained) |

## The Architecture Principle

```
Layer architecture organizes by TECHNICAL ROLE:
  "Where does this GO?" (controller? service? repository?)
  
Concept architecture organizes by BUSINESS MEANING:
  "What IS this?" (ordering? pricing? shipping? coupon?)

The first question leads to scattered features.
The second question leads to cohesive modules.
```

## When Layers Make Sense

Layers are appropriate when:
- You have a genuine cross-cutting concern (logging, auth, metrics)
- Different layers deploy independently (rare)
- Different teams own different layers (very rare)

For business features: **always organize by concept, never by layer.**
