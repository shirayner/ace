# Bad-to-Good Example: DRY Obsession → Meaningful Abstraction

## Scenario

A developer noticed "similar" code in three places and extracted a "shared" utility. The forced unification created a fragile, parameter-heavy function that's harder to understand than the original duplication.

## Before (After Misguided DRY)

```java
// "Shared" utility created to avoid "duplication"
public class EntityProcessor {
    
    /**
     * Generic entity processing.
     * @param entity the entity to process
     * @param validate whether to validate
     * @param notify whether to send notifications
     * @param audit whether to create audit log
     * @param mode processing mode: "create", "update", "delete"
     * @param options additional options
     */
    public static ProcessingResult processEntity(
            Object entity,
            boolean validate,
            boolean notify,
            boolean audit,
            String mode,
            Map<String, Object> options) {
        
        ProcessingResult result = new ProcessingResult();
        
        if (validate) {
            if (mode.equals("create")) {
                validateForCreation(entity, options);
            } else if (mode.equals("update")) {
                validateForUpdate(entity, options);
            }
            // "delete" doesn't validate (but the flag is still passed!)
        }
        
        if (mode.equals("create")) {
            save(entity);
            result.setCreated(true);
        } else if (mode.equals("update")) {
            Object existing = find(entity);
            merge(existing, entity, options);
            save(existing);
            result.setUpdated(true);
        } else if (mode.equals("delete")) {
            if (options.containsKey("soft")) {
                softDelete(entity);
            } else {
                hardDelete(entity);
            }
            result.setDeleted(true);
        }
        
        if (notify) {
            String template = (String) options.getOrDefault("template", "default");
            String[] recipients = (String[]) options.getOrDefault("recipients", new String[]{});
            sendNotification(entity, mode, template, recipients);
        }
        
        if (audit) {
            String actor = (String) options.get("actor");
            createAuditLog(entity, mode, actor);
        }
        
        return result;
    }
}

// Callers:
// Creating an order
EntityProcessor.processEntity(order, true, true, true, "create",
    Map.of("template", "order-confirmation", "recipients", new String[]{customer.getEmail()},
           "actor", currentUser.getId()));

// Updating a product
EntityProcessor.processEntity(product, true, false, true, "update",
    Map.of("actor", admin.getId(), "merge-strategy", "overwrite"));

// Deleting a customer (soft)
EntityProcessor.processEntity(customer, false, true, true, "delete",
    Map.of("soft", true, "template", "account-closed", 
           "recipients", new String[]{customer.getEmail()}, "actor", system.getId()));
```

## Thinking

### What Went Wrong?

The developer saw "all three do validate + save + notify + audit" and concluded "duplication!" But:

1. **They're different business operations** — creating an order, updating a product, and closing an account are fundamentally different concepts
2. **Forced unification** — flags and mode strings replace what should be separate, clear methods
3. **Result:** nobody can read a call site and understand what it does without reading the implementation
4. **The "DRY" version is actually WORSE** — harder to understand, harder to change, more bug-prone

### The Real Question

"Are these actually the SAME concept?"

- Create order → order placement (business event)
- Update product → catalog maintenance (admin operation)
- Close customer → account closure (lifecycle event)

They share some STEPS (validate, persist, notify) but are **completely different business concepts**. Sharing implementation doesn't mean sharing identity.

### The Rule

> **Duplication is only a problem when it represents the SAME CONCEPT expressed twice.**
> If two pieces of code look similar but model different business operations,
> they are NOT duplicates. They are coincidentally similar — and they WILL diverge.

## After (Meaningful Separation)

```java
// Each business operation is its own clear concept

// === Order Placement ===
public class OrderPlacement {
    private final OrderRules rules;
    private final OrderStore orders;
    private final OrderNotification notification;
    
    public Order place(OrderDraft draft, CustomerId customerId) {
        rules.validateForPlacement(draft);
        Order order = Order.createFrom(draft, customerId);
        orders.save(order);
        notification.sendConfirmation(order);
        return order;
    }
}

// === Product Catalog Update ===
public class ProductCatalogUpdate {
    private final ProductRules rules;
    private final ProductStore products;
    private final AuditTrail audit;
    
    public Product update(ProductId id, ProductChanges changes, AdminId actor) {
        Product product = products.findById(id);
        rules.validateChanges(product, changes);
        product.apply(changes);
        products.save(product);
        audit.record(product, "updated", actor);
        return product;
    }
}

// === Account Closure ===
public class AccountClosure {
    private final AccountStore accounts;
    private final ClosureNotification notification;
    private final AuditTrail audit;
    
    public void close(CustomerId customerId, String reason, SystemActor actor) {
        Account account = accounts.findByCustomer(customerId);
        account.close(reason);
        accounts.save(account);
        notification.sendClosureConfirmation(account);
        audit.record(account, "closed", actor);
    }
}
```

## Comparison

| Aspect | DRY-Obsessed Version | Separated Version |
|--------|---------------------|-------------------|
| Readability of call site | `processEntity(obj, true, true, true, "create", Map.of(...))` — unreadable | `orderPlacement.place(draft, customerId)` — crystal clear |
| Understanding the flow | Read 50-line if/else method + decode flags | Read 5-line method top to bottom |
| Adding new behavior to orders | Touch shared code, risk breaking products/customers | Touch OrderPlacement only |
| Type safety | `Object entity`, `Map<String,Object> options` — no safety | Fully typed parameters |
| Testing | Mock everything, pass complex flag combinations | Test each operation independently |
| Business vocabulary | "processEntity" — means nothing | "place", "update", "close" — domain language |

## When DRY IS Appropriate

DRY is correct when the duplication represents the **same concept**:

```java
// SAME concept repeated → extract
// Both are "money conversion" — genuinely one concept
Money toUSD(Money amount, Currency from) { ... }
// Used by pricing AND reporting AND invoicing — same concept everywhere

// DIFFERENT concepts that look similar → DON'T extract
// Order validation ≠ Product validation ≠ Account validation
// They happen to "validate something" but rules are unrelated
```

## The Decision Tree

```
Two pieces of code look similar.

Do they model the SAME business concept?
│
├─ YES: Would they ALWAYS change together?
│       │
│       ├─ YES → Extract. This is real DRY. Name the shared concept.
│       │
│       └─ NO → They're diverging. Let them be separate.
│
└─ NO: They're coincidentally similar.
       │
       → DO NOT extract. Three clear, independent methods is better
         than one confusing "shared" method with flags.
         
         "Duplication is far cheaper than the wrong abstraction." — Sandi Metz
```
