# Information Flow — Data Movement and Transformation

> Every piece of software is fundamentally about transforming information.
> Understanding WHAT flows, WHERE it flows, and HOW it transforms
> is the key to understanding (and simplifying) any system.
>
> If you don't understand the information flow, you don't understand the system.

---

## Core Principle

```
Information should flow in ONE direction through a pipeline of transformations.
Each transformation should be:
  - Named (what business operation does it represent?)
  - Bounded (what boundary does it live in?)
  - Minimal (what is the least information needed?)
  - Explicit (no hidden side effects or implicit coupling)
```

---

## The Information Flow Model

### 1. Sources — Where Information Enters

| Source Type | Example | Contract |
|-------------|---------|----------|
| User Input | HTTP request, UI form, CLI args | Untrusted; validate at entry |
| External System | API response, file import, message | Uncontrolled; translate at boundary |
| Internal Event | Domain event from another boundary | Trusted within system; typed |
| Stored State | Database read, cache hit | System's own truth; consistent |
| Time/Clock | Scheduled trigger, timeout | External; non-deterministic |

### 2. Transformations — What Happens to Information

| Transformation | Business Meaning | Example |
|---------------|-----------------|---------|
| Validation | "Is this information acceptable?" | OrderRequest → ValidOrder |
| Enrichment | "What additional context is needed?" | OrderId → OrderWithCustomerDetails |
| Calculation | "What new information derives from existing?" | LineItems → OrderTotal |
| Decision | "What should happen next?" | Order + Rules → Action |
| Translation | "How does one boundary's language map to another?" | InternalOrder → ExternalOrderDTO |
| Aggregation | "How do many items summarize into one?" | DailyTransactions → MonthlyReport |
| Filtering | "What subset is relevant?" | AllOrders → PendingOrders |
| Projection | "What subset of attributes is needed?" | FullCustomer → CustomerName |

### 3. Sinks — Where Information Leaves

| Sink Type | Example | Contract |
|-----------|---------|----------|
| User Output | HTTP response, UI render, notification | Shaped for consumer understanding |
| External System | API call, file export, message publish | Shaped per external contract |
| Internal Event | Domain event published | Shaped for downstream boundaries |
| Stored State | Database write, cache update | Shaped for future retrieval |
| Log/Metric | Observability output | Shaped for operational understanding |

---

## Flow Analysis Process

### Step 1: Map the End-to-End Flow

For any feature or behavior, trace information from source to sink:

```
Template:

[Source] → [Transformation₁] → [Transformation₂] → ... → [Sink]
             in Boundary A        in Boundary B              

Data at each step:
  After Source:        { raw input fields }
  After Transform₁:   { validated, enriched fields }
  After Transform₂:   { calculated, decided fields }
  At Sink:             { final output shape }
```

### Step 2: Identify Boundary Crossings

Every time information crosses a boundary, there should be:
- An explicit contract (data shape)
- A translation (from source boundary's language to target boundary's language)
- A minimal surface (only what the target needs, not everything the source has)

```
WRONG:
  OrderBoundary passes entire OrderEntity to PaymentBoundary
  (Internal structure leaked; tight coupling)

RIGHT:
  OrderBoundary publishes PaymentRequest{amount, currency, orderId}
  PaymentBoundary only knows what it needs
```

### Step 3: Question Each Flow

For each information flow:

| Question | If NO... |
|----------|----------|
| Does this data NEED to flow here? | Remove the flow |
| Is this the MINIMUM data needed? | Reduce the data |
| Is the direction correct? | Reverse the dependency |
| Is the transformation named? | Name it (it's a concept!) |
| Is there a simpler path? | Simplify the flow |

---

## Information Flow Patterns

### Pattern 1: Pipeline (Linear Transformation)

```
Input → Step1 → Step2 → Step3 → Output
```

**Use when:** Transformations are sequential, each builds on the previous.
**Benefit:** Easy to understand, easy to test each step independently.
**Watch for:** "Pipeline bloat" — too many trivial steps.

### Pattern 2: Fan-Out (One Source, Many Targets)

```
         ┌→ Target1
Input → Source
         └→ Target2
```

**Use when:** One event triggers multiple independent reactions.
**Benefit:** Source is decoupled from targets; targets are independent.
**Implement via:** Domain events.
**Watch for:** Ordering assumptions between targets.

### Pattern 3: Fan-In (Many Sources, One Target)

```
Source1 →┐
          Target → Output
Source2 →┘
```

**Use when:** A decision requires information from multiple places.
**Benefit:** Target has all context to make decision.
**Watch for:** Temporal coupling (waiting for slowest source).

### Pattern 4: Scatter-Gather (Fan-Out + Fan-In)

```
         ┌→ Worker1 →┐
Request →│            │→ Aggregator → Response
         └→ Worker2 →┘
```

**Use when:** Work can be parallelized, results must be combined.
**Watch for:** Partial failure handling; timeout strategies.

### Pattern 5: Event Sourcing (Append-Only Truth)

```
Command → Event₁, Event₂, ... → Current State (derived)
```

**Use when:** History matters; auditing required; different views of same data.
**Watch for:** Complexity of event evolution; replay performance.

---

## Information Flow Anti-Patterns

### 1. The Shotgun Query

**Problem:** One boundary queries many others to assemble what it needs.

```
WRONG:
  OrderService.getOrderDetails():
    → calls CustomerService.getCustomer()
    → calls InventoryService.getStock()
    → calls PricingService.getPrice()
    → calls ShippingService.getRate()
    → assembles everything
```

**Fix:** Either:
- This IS the boundary (it's an orchestrator — accept it as a concept)
- Or the data should be published TO this boundary (invert the flow)
- Or the query responsibility is in the wrong place

### 2. The Data Waterfall

**Problem:** Data flows through many layers unchanged.

```
WRONG:
  Controller → receives OrderRequest
  → passes to Service (unchanged)
  → passes to Handler (unchanged)
  → passes to Processor (unchanged)
  → finally transforms
```

**Fix:** Remove intermediate layers that don't transform. Information should only pass through a layer if that layer adds value (validates, enriches, decides, translates).

### 3. The Implicit Flow

**Problem:** Information moves through hidden channels.

```
WRONG:
  ServiceA sets ThreadLocal
  → calls ServiceB
  → ServiceB reads ThreadLocal
  (Hidden coupling! ServiceB has an invisible dependency on ServiceA's setup)
```

**Fix:** Make all information flow explicit. Pass it as parameters. If it crosses boundaries, use a defined contract.

### 4. The Double Fetch

**Problem:** Same information is fetched multiple times in one flow.

```
WRONG:
  ValidateOrder(orderId): fetches Order from DB
  CalculateTotal(orderId): fetches same Order from DB again
  ApplyDiscount(orderId): fetches same Order from DB a third time
```

**Fix:** Fetch once at the top of the pipeline, pass the result down.

### 5. The Information Hoarder

**Problem:** A concept accumulates all information "just in case."

```
WRONG:
  OrderContext contains:
    - Order data
    - Customer profile
    - Inventory levels
    - Payment history
    - Shipping preferences
    - ... everything
```

**Fix:** Each step should receive ONLY what it needs. Use projections, not god-objects.

---

## Data Minimization Rules

### At Boundary Crossings

```
Rule: Cross a boundary with the MINIMUM information needed.

NOT: Pass the entire entity
YES: Pass only the fields the receiving side needs

NOT: "Here's the full Customer object"
YES: "Here's the CustomerName and ShippingAddress"
```

### At Transformations

```
Rule: Each transformation receives only what it needs to do its job.

NOT: calculateDiscount(Order order, Customer customer, Config config, ...)
YES: calculateDiscount(Money amount, CustomerTier tier, DiscountRules rules)
```

### At Storage

```
Rule: Store the minimum state needed to reconstruct behavior.

NOT: Store derived/calculated fields that can be recomputed
YES: Store source facts, derive everything else on read
```

---

## Flow Documentation Template

When analyzing a feature's information flow:

```
## Flow: [Feature Name]

### Trigger
  [What initiates this flow: user action, event, schedule]

### Path
  1. [Source] → data: {fields}
  2. [Transform: Name] in [Boundary] → data: {fields added/removed}
  3. [Boundary Crossing] → contract: {minimal fields}
  4. [Transform: Name] in [Boundary] → data: {fields}
  5. [Sink] → final: {output shape}

### Boundary Crossings
  - [Boundary A] → [Boundary B]: {contract}, direction: [→/←/↔]

### Key Decisions
  - At step N: [what decision is made, based on what data]

### Failure Modes
  - At step N: [what can go wrong, how it's handled]
```

---

## The Information Flow Principle

> The best system is one where information flows naturally — like water downhill.
> Every dam (unnecessary layer), every pump (forced coupling), every split (god object)
> adds friction. Remove friction until the flow is inevitable.
>
> When you can't understand where data comes from or where it goes,
> the architecture has failed — regardless of how "clean" the code looks.
