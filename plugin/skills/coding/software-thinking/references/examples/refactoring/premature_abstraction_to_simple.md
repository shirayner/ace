# Refactoring Example: Premature Abstraction → Simple Code

## Scenario

A payment system was over-engineered with "extensibility" patterns. In 2 years, only Stripe was used. The abstractions add navigation cost without providing variation.

## Before

```java
// 8 classes for ONE payment provider

public interface PaymentStrategy {
    PaymentResult process(PaymentRequest request);
}

public interface PaymentStrategyFactory {
    PaymentStrategy getStrategy(PaymentType type);
}

public class PaymentStrategyFactoryImpl implements PaymentStrategyFactory {
    private final Map<PaymentType, PaymentStrategy> strategies;
    
    public PaymentStrategyFactoryImpl(List<PaymentStrategy> strategies) {
        this.strategies = strategies.stream()
            .collect(toMap(PaymentStrategy::getType, identity()));
    }
    
    @Override
    public PaymentStrategy getStrategy(PaymentType type) {
        PaymentStrategy strategy = strategies.get(type);
        if (strategy == null) {
            throw new UnsupportedPaymentTypeException(type);
        }
        return strategy;
    }
}

public class StripePaymentStrategy implements PaymentStrategy {
    private final StripeClient stripeClient;
    private final PaymentRequestMapper mapper;
    private final PaymentResponseMapper responseMapper;
    
    @Override
    public PaymentResult process(PaymentRequest request) {
        StripeChargeRequest stripeRequest = mapper.toStripeRequest(request);
        StripeChargeResponse stripeResponse = stripeClient.charge(stripeRequest);
        return responseMapper.toPaymentResult(stripeResponse);
    }
    
    @Override
    public PaymentType getType() {
        return PaymentType.CREDIT_CARD;
    }
}

public class PaymentRequestMapper {
    public StripeChargeRequest toStripeRequest(PaymentRequest request) {
        // 30 lines of field mapping
    }
}

public class PaymentResponseMapper {
    public PaymentResult toPaymentResult(StripeChargeResponse response) {
        // 20 lines of field mapping
    }
}

public enum PaymentType { CREDIT_CARD }  // One value. For 2 years.

public class PaymentRequest { /* fields */ }
public class PaymentResult { /* fields */ }

// Usage:
PaymentStrategy strategy = factory.getStrategy(PaymentType.CREDIT_CARD);
PaymentResult result = strategy.process(request);
```

**Navigation cost to understand "how do we charge a credit card?":**
1. Find factory → PaymentStrategyFactoryImpl
2. Look up strategy registration → Spring config
3. Find StripePaymentStrategy
4. Follow to PaymentRequestMapper
5. Follow to StripeClient
6. Follow to PaymentResponseMapper

**6 hops. For calling Stripe.**

## Thinking

### Decision Tree: "Should I Use a Design Pattern?"

```
Can I name the BUSINESS problem this pattern solves?
→ "Multiple payment methods" 
  
  Is the pattern the SIMPLEST solution?
  → NO. There's only one payment method. A direct call is simpler.
  
  Does the pattern make the code read like the business?
  → NO. The business says "charge the credit card." The code says 
    "get a strategy from a factory and process a request."
```

### Decision Tree: "Should This Interface Exist?"

```
Do multiple STABLE implementations exist TODAY?
→ NO. Only StripePaymentStrategy. For 2 years.

Is this "for future extensibility"?
→ YES.

→ DO NOT CREATE. YAGNI. When the second payment method arrives,
  THEN create the interface. Cost: 10 minutes.
  Current cost of maintaining this: ongoing cognitive load.
```

## After

```java
public class Payments {
    private final StripeClient stripe;
    
    public PaymentConfirmation authorize(Money amount, CustomerId customerId) {
        var response = stripe.charge(
            amount.toCents(),
            amount.currency().code(),
            lookupStripeCustomer(customerId)
        );
        return new PaymentConfirmation(
            response.getChargeId(),
            Money.ofCents(response.getAmountCaptured(), amount.currency())
        );
    }
    
    public void refund(PaymentConfirmation confirmation) {
        stripe.refund(confirmation.chargeId());
    }
    
    private String lookupStripeCustomer(CustomerId id) {
        // ...
    }
}

// Usage:
PaymentConfirmation confirmation = payments.authorize(total, customerId);
```

**Navigation cost: 1 file. Done.**

## What Was Removed

| Removed | Why |
|---------|-----|
| PaymentStrategy interface | One implementation = no abstraction needed |
| PaymentStrategyFactory | Nothing to select from |
| PaymentStrategyFactoryImpl | Ditto |
| PaymentRequestMapper | Direct mapping is 3 lines in the method |
| PaymentResponseMapper | Same |
| PaymentType enum | One value enum is a constant, not a type |
| PaymentRequest DTO | Parameters suffice |

**8 classes → 1 class. Same business capability.**

## When the Second Payment Method Arrives

When (IF) the business adds PayPal:

```java
// Then create the abstraction — with REAL motivation
public interface PaymentGateway {
    PaymentConfirmation authorize(Money amount, CustomerId customerId);
    void refund(PaymentConfirmation confirmation);
}

public class StripePayments implements PaymentGateway { ... }
public class PayPalPayments implements PaymentGateway { ... }
```

Cost of adding this LATER: 15 minutes.
Cost of maintaining it prematurely for 2 years: hours of confusion for every developer who traced through the factory/strategy/mapper maze.

## The Rule This Demonstrates

> **Don't build for hypothetical futures.**
> Build for today. When tomorrow comes, you'll know what it actually needs.
> 
> The cost of adding an abstraction later: trivial.
> The cost of maintaining a premature abstraction forever: permanent.
>
> "But what if it's expensive to add later?"
> It almost never is. And even if it were, maintaining complexity
> you don't need is MORE expensive than a future refactoring session.
