# Example: Layer Architecture → Concept Architecture

## Before

```
src/main/java/com/example/shop/
├── controller/
│   ├── OrderController.java
│   ├── CustomerController.java
│   └── ProductController.java
├── service/
│   ├── OrderService.java
│   ├── OrderServiceImpl.java
│   ├── CustomerService.java
│   ├── CustomerServiceImpl.java
│   ├── ProductService.java
│   └── ProductServiceImpl.java
├── repository/
│   ├── OrderRepository.java
│   ├── CustomerRepository.java
│   └── ProductRepository.java
├── model/
│   ├── OrderEntity.java
│   ├── CustomerEntity.java
│   └── ProductEntity.java
├── dto/
│   ├── OrderDTO.java
│   ├── OrderRequest.java
│   ├── OrderResponse.java
│   ├── CustomerDTO.java
│   └── ProductDTO.java
└── mapper/
    ├── OrderMapper.java
    ├── CustomerMapper.java
    └── ProductMapper.java
```

Total: 21 files for 3 business concepts.

**The problem visualized:**

```
Adding "apply coupon to order" feature requires:
  1. OrderController.java     (new endpoint)
  2. OrderDTO.java            (new field)
  3. OrderRequest.java        (new field)
  4. OrderResponse.java       (new field)
  5. OrderService.java        (new method signature)
  6. OrderServiceImpl.java    (implementation)
  7. OrderEntity.java         (new column)
  8. OrderMapper.java         (new mapping)
  9. OrderRepository.java     (maybe new query)
  
  9 files changed for ONE business concept addition.
```

## Thinking

### Problem Analysis

- **Boundary test:** Do controller, service, repository change for different reasons? NO. They all change when the Order concept changes. They are NOT separate boundaries.
- **Concept entropy:** 7 files per concept (Controller + Service + ServiceImpl + Repository + Entity + DTO + Mapper). Business has 1 concept. Code has 7 representations.
- **Navigation cost:** Understanding "how does order placement work?" requires reading 5+ files in 5 different directories.
- **The Layer Lie:** Layers claim to isolate change. In practice, every feature touches every layer. The isolation is fictional.

### The Key Insight

These "layers" are not boundaries. They're a filing system. Real boundaries separate things that change independently. These layers always change together.

## After

```
src/main/java/com/example/shop/
├── ordering/
│   ├── Order.java              // Rich domain model (entity + behavior)
│   ├── LineItem.java           // Value object
│   ├── OrderWorkflow.java      // Use cases / business operations
│   ├── OrderEndpoint.java      // HTTP entry (thin adapter)
│   └── OrderStore.java         // Persistence (thin adapter)
├── catalog/
│   ├── Product.java            // Product domain model
│   ├── ProductCatalog.java     // Business operations
│   ├── ProductEndpoint.java    // HTTP entry
│   └── ProductStore.java       // Persistence
├── customer/
│   ├── Customer.java           // Customer domain model
│   ├── CustomerRegistry.java   // Business operations
│   ├── CustomerEndpoint.java   // HTTP entry
│   └── CustomerStore.java      // Persistence
└── shared/
    └── Money.java              // Shared value object
```

Total: 14 files (down from 21), organized by business concept.

**The same feature now:**

```
Adding "apply coupon to order" feature:
  1. Order.java          (new method: applyCoupon)
  2. OrderWorkflow.java  (orchestrate the use case)
  3. OrderEndpoint.java  (new route, thin)
  
  3 files, all in ONE directory. All related. Easy to understand.
```

## Key Decisions Made

| Decision | Reasoning |
|----------|-----------|
| Delete interface+impl pairs | Single implementation, no variation |
| Delete DTOs | Endpoint can serialize domain objects directly (or use records for input) |
| Delete mappers | No separate layers = no mapping needed |
| Merge controller + service | "Controller" and "Service" are technical roles, not concepts. One business operation = one place. |
| Rename to domain terms | OrderService → OrderWorkflow; ProductService → ProductCatalog |
| Thin adapters | Endpoint and Store are THIN — just translate between external/internal. No logic. |

## The Rule This Demonstrates

> **Organize by business concept, not by technical layer.**
> 
> The question is not "what technical role does this file play?"
> The question is "what business concept does this file belong to?"
>
> When you open the `ordering/` directory, you should immediately understand
> the ordering business concept — without needing to open 5 other directories.
