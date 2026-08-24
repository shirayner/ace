# Decision Rules — The AI Architect's Decision Trees

> Every design decision is a YES/NO gate.
> No "it depends" without concrete criteria.
> This file is a complete set of decision trees for common software design choices.

---

## How to Use This File

When facing a design decision:
1. Find the relevant decision tree below
2. Walk the tree from top to bottom
3. The leaf node tells you what to do
4. If you cannot answer a gate question → you need more understanding (go back to THINKING_PROCESS Step 1)

---

## Decision Tree: Should I Create a New Class/Type?

```
Does it represent a new BUSINESS concept?
│
├─ YES: Does a domain expert have a word for it?
│       │
│       ├─ YES: Does it have its own lifecycle?
│       │       │
│       │       ├─ YES → CREATE IT (as a first-class domain entity)
│       │       │
│       │       └─ NO: Does it have its own behavior (not just data)?
│       │               │
│       │               ├─ YES → CREATE IT (as a value object or policy)
│       │               │
│       │               └─ NO → It might just be a field/property of its parent
│       │
│       └─ NO: You're inventing vocabulary. 
│              → DO NOT CREATE. Rethink using existing domain terms.
│
└─ NO: Is it purely for technical organization?
       │
       ├─ YES: Can you achieve the same by restructuring existing concepts?
       │       │
       │       ├─ YES → DO NOT CREATE. Restructure instead.
       │       │
       │       └─ NO: Is it infrastructure that EVERY project needs?
       │               (logging, metrics, configuration — not business logic)
       │               │
       │               ├─ YES → CREATE IT (but keep it in an infra boundary)
       │               │
       │               └─ NO → DO NOT CREATE. It's accidental complexity.
       │
       └─ NO → DO NOT CREATE. If it's not business and not infra, it shouldn't exist.
```

---

## Decision Tree: Should I Create an Interface/Abstraction?

```
Do multiple STABLE implementations exist TODAY?
│
├─ YES: Do they represent genuinely different business behaviors?
│       │
│       ├─ YES: Do they share a meaningful contract (not just method signatures)?
│       │       │
│       │       ├─ YES → CREATE INTERFACE
│       │       │        Name it after the business capability, not the pattern.
│       │       │        Example: PaymentMethod, not IPaymentProcessor
│       │       │
│       │       └─ NO → They're unrelated. Don't force a shared interface.
│       │
│       └─ NO: They're implementation variants of the same business behavior.
│              → PROBABLY DON'T NEED INTERFACE. Use composition or configuration.
│
└─ NO: Is this "for testability"?
       │
       ├─ YES: Can you test via the public contract without mocking?
       │       │
       │       ├─ YES → DO NOT CREATE INTERFACE.
       │       │
       │       └─ NO: Is the dependency crossing a boundary?
       │               │
       │               ├─ YES → CREATE INTERFACE (boundary contract)
       │               │
       │               └─ NO → Restructure so you can test without mocking.
       │
       └─ NO: Is this "for future extensibility"?
              │
              → DO NOT CREATE. YAGNI. When the second implementation arrives,
                THEN create the interface. Not before.
                
              "But what if it's expensive to add later?"
              → It's almost never expensive. The cost of maintaining a 
                speculative interface is always higher than adding one later.
```

---

## Decision Tree: Should I Use a Design Pattern?

```
Can I name the BUSINESS problem this pattern solves?
│
├─ YES: Is the pattern the SIMPLEST solution to that problem?
│       │
│       ├─ YES: Does using the pattern make the code read like the business?
│       │       │
│       │       ├─ YES → USE THE PATTERN
│       │       │        But name it using business vocabulary.
│       │       │        Example: PricingPolicy, not PricingStrategy
│       │       │
│       │       └─ NO → The pattern adds indirection that obscures meaning.
│       │              → SIMPLIFY. Maybe a plain function or switch is clearer.
│       │
│       └─ NO: There's a simpler solution.
│              → USE THE SIMPLER SOLUTION. Patterns are not goals.
│
└─ NO: Is this "because it's the proper way" or "for clean architecture"?
       │
       → DO NOT USE THE PATTERN. This is cargo cult.
         Patterns exist to solve problems, not to demonstrate knowledge.
         
         Common cargo cult patterns:
         - Factory for classes that never vary
         - Strategy for algorithms that never change
         - Observer for single subscribers
         - Decorator for single wrapping
         - Builder for objects with <5 fields
         - Facade for services with <3 methods
```

---

## Decision Tree: Should I Add a Layer/Module/Package?

```
Does this layer represent a distinct BUSINESS concern?
│
├─ YES: Does it have its own reason to change?
│       │
│       ├─ YES: Is the layer boundary a communication boundary?
│       │       (Different teams, different deployment, different lifecycle)
│       │       │
│       │       ├─ YES → ADD THE LAYER (it's a real boundary)
│       │       │
│       │       └─ NO: Do concepts INSIDE this layer have high cohesion?
│       │               │
│       │               ├─ YES → ADD THE LAYER (logical boundary, still valuable)
│       │               │
│       │               └─ NO → You're grouping unrelated things.
│       │                      → DON'T ADD. Reorganize by concept instead.
│       │
│       └─ NO: It changes WITH something else.
│              → MERGE WITH THAT SOMETHING ELSE. Separate packages that 
│                always change together is artificial separation.
│
└─ NO: Is this for "separation of concerns"?
       │
       → ONLY if the concerns actually change independently.
         "Controller - Service - Repository" is NOT separation of concerns
         unless you regularly change one without the other.
         
         In practice: 
         - Adding a business feature changes ALL three layers
         - Therefore they are ONE concern split across three places
         - This is ANTI-cohesion disguised as architecture
```

---

## Decision Tree: Should I Extract a Method/Function?

```
Does extracting make a CONCEPT explicit that was previously hidden?
│
├─ YES: Can I give it a name from the business domain?
│       │
│       ├─ YES → EXTRACT
│       │        The method name IS the concept. This is modeling, not refactoring.
│       │
│       └─ NO: Can I give it a name that expresses INTENT (not mechanism)?
│               │
│               ├─ YES → EXTRACT (it reveals hidden intent)
│               │
│               └─ NO → DON'T EXTRACT. If you can't name it well, 
│                        the concept doesn't exist as a unit.
│
└─ NO: Is this for "method length" or "clean code" rules?
       │
       ├─ Is the original method actually hard to read?
       │   │
       │   ├─ YES: Is the difficulty from LOGIC or from SYNTAX?
       │   │       │
       │   │       ├─ LOGIC → EXTRACT (name the logic)
       │   │       │
       │   │       └─ SYNTAX → Fix the syntax (better names, less nesting).
       │   │                    Don't split to hide bad code.
       │   │
       │   └─ NO → DON'T EXTRACT. Short methods are not a goal.
       │            A 50-line method that reads clearly is better than
       │            5 methods that require jumping around.
       │
       └─ Will this be reused?
           │
           ├─ YES (it's used >1 place TODAY) → EXTRACT for DRY
           │
           └─ NO / "maybe later" → DON'T EXTRACT for speculative reuse
```

---

## Decision Tree: Should I Add a Dependency?

```
Does this dependency model a REAL business relationship?
│
├─ YES: Is the direction correct?
│       (More stable thing ← Less stable thing)
│       │
│       ├─ YES: Is the dependency across a boundary?
│       │       │
│       │       ├─ YES: Is it through an explicit contract (interface/event)?
│       │       │       │
│       │       │       ├─ YES → ADD DEPENDENCY (proper boundary contract)
│       │       │       │
│       │       │       └─ NO → Add contract first, then depend on contract.
│       │       │
│       │       └─ NO (within boundary) → ADD DEPENDENCY (internal cohesion)
│       │
│       └─ NO: The direction is wrong.
│              → INVERT. The stable thing should not know about the unstable thing.
│                Use events, callbacks, or dependency inversion.
│
└─ NO: Is this a convenience dependency ("it's easier to call from here")?
       │
       → DO NOT ADD. Convenience dependencies are technical debt.
         They create coupling without modeling reality.
         
         Ask: "If I were designing from scratch, would this connection exist?"
         If NO → find another way (event, shared interface, restructure).
```

---

## Decision Tree: Should I Add Error Handling Here?

```
Can this error actually occur in this context?
│
├─ YES: Is it a BUSINESS error (domain rule violation)?
│       │
│       ├─ YES: Does the business have a defined response?
│       │       │
│       │       ├─ YES → HANDLE IT (model the business response)
│       │       │        Name the error in business terms.
│       │       │        Example: InsufficientBalance, not ValidationException
│       │       │
│       │       └─ NO → Surface it to the caller who CAN decide.
│       │              Don't swallow or wrap. Propagate with meaning.
│       │
│       └─ NO: Is it a TECHNICAL error (infra failure)?
│               │
│               ├─ YES: Are we at a boundary?
│               │       │
│               │       ├─ YES → HANDLE AT BOUNDARY
│               │       │        Translate to business terms or retry.
│               │       │
│               │       └─ NO → LET IT PROPAGATE to the boundary.
│               │              Don't catch-and-rethrow for "logging."
│               │
│               └─ NO: Is it a PROGRAMMING error (bug)?
│                      │
│                      → DO NOT HANDLE. Let it crash.
│                        Programming errors should fail loudly.
│                        Catching NullPointerException hides bugs.
│
└─ NO: This error cannot occur here.
       │
       → DO NOT ADD ERROR HANDLING.
         Defensive programming for impossible cases is noise.
         It makes readers think the error IS possible (misleading).
         
         Trust the type system. Trust the contract.
         If the contract guarantees non-null, don't check for null.
```

---

## Decision Tree: Should I Add Configuration/Parameterization?

```
Does this value ACTUALLY vary between environments or deployments?
│
├─ YES: Is the variation a BUSINESS decision (not just technical tuning)?
│       │
│       ├─ YES: Who changes it?
│       │       │
│       │       ├─ BUSINESS USER → Make it a first-class domain concept
│       │       │                   (not just config — model it)
│       │       │
│       │       └─ DEVELOPER/OPS → Configuration file/env var is appropriate
│       │
│       └─ NO (technical tuning):
│           Is the default correct 99% of the time?
│           │
│           ├─ YES → HARDCODE the default. Document how to override if needed.
│           │        Don't add UI/config for 1% case.
│           │
│           └─ NO → Add configuration. Keep it close to where it's used.
│
└─ NO: "But what if we need to change it later?"
       │
       → HARDCODE IT. When "later" comes, you'll know the actual requirement.
         Premature configuration:
         - Adds indirection
         - Requires documentation
         - Creates "what does this setting do?" confusion
         - Is usually never changed
         
         Constant in code > config that never varies.
```

---

## Decision Tree: Should I Add a Comment?

```
Can I make the code self-explanatory instead?
│
├─ YES → DO THAT INSTEAD. Don't comment, clarify.
│        - Rename variables to express intent
│        - Extract method with descriptive name
│        - Restructure to make flow obvious
│
└─ NO: Is the comment explaining WHY (not WHAT)?
       │
       ├─ YES: Is the WHY non-obvious?
       │       (A reader would be surprised by this choice)
       │       │
       │       ├─ YES → ADD COMMENT
       │       │        Good comments:
       │       │        - Business rule origins ("per contract clause 4.2")
       │       │        - Counterintuitive constraints ("must be before X because...")
       │       │        - Workarounds ("library bug #123 — remove when fixed")
       │       │
       │       └─ NO → DON'T COMMENT. Obvious WHY = no comment needed.
       │
       └─ NO: It's explaining WHAT or HOW.
              │
              → DON'T COMMENT. The code already says what and how.
                If it doesn't, fix the code.
                
                Banned comments:
                - "// get the order" above getOrder()
                - "// check if null" above if (x == null)
                - "// loop through items" above for(item : items)
                - "// constructor" above constructor
```

---

## Decision Tree: Should I Refactor This Now?

```
Is there a business change driving this?
│
├─ YES: Will refactoring make the business change EASIER to implement?
│       │
│       ├─ YES → REFACTOR FIRST, then implement the business change.
│       │        ("Make the change easy, then make the easy change" — Kent Beck)
│       │
│       └─ NO → IMPLEMENT without refactoring. Don't refactor just because
│              you're "in the area."
│
└─ NO: Is the current code BLOCKING something?
       │
       ├─ YES: What is it blocking?
       │       │
       │       ├─ UNDERSTANDING (can't read it) → REFACTOR for clarity
       │       │
       │       ├─ MODIFICATION (can't change safely) → REFACTOR for changeability
       │       │
       │       └─ PERFORMANCE (too slow for business needs) → Profile first.
       │              Then optimize the bottleneck only.
       │
       └─ NO → DON'T REFACTOR NOW.
              "The code could be better" is not a reason.
              "I don't like the style" is not a reason.
              "It violates a principle" is not a reason.
              
              Refactoring without business value is waste.
              The only valid driver is: "this makes future business change easier."
```

---

## Meta-Rule: When Decision Trees Conflict

If two trees give contradictory answers:

1. **Business clarity wins** over technical elegance
2. **Fewer concepts wins** over more concepts
3. **Explicit wins** over clever
4. **Delete wins** over reorganize
5. **Now wins** over later (don't optimize for hypothetical future)

When truly stuck: **do the simplest thing that could work.** You can always refactor with understanding. You cannot easily undo over-engineering.
