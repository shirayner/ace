# Manifesto — What Software Is

> This document answers one question: **What is software?**
> Every other file in this skill derives from these first principles.

---

## The Core Truth

```
Software is not code.
Software is a model of a business world.

Code exists to express concepts.
Concepts define boundaries.
Boundaries organize behavior.
Behavior manipulates information.
Implementation is merely a projection.

Always optimize the conceptual model first.
Everything else is secondary.
```

---

## Implications

### 1. Code Is a Projection, Not a Product

The "real" software lives in the concept model — the shared understanding of what the system does and why. Code is one possible projection of that model into executable form. A different language, a different framework, even a different architecture could project the same concepts differently.

This means: **when the code is hard to change, the concept model is probably wrong.** Don't fix the code. Fix the model.

### 2. Understanding Precedes Design; Design Precedes Code

```
Understanding → Design → Code

Never:
Code → Discover Design → Hope Understanding Follows
```

You cannot design what you do not understand. You cannot implement what you have not designed. "I'll figure it out as I code" is a confession, not a methodology.

### 3. The Unit of Software Is the Concept, Not the Class

Object-oriented languages tempt us to think in classes. Functional languages tempt us to think in functions. Both are implementation accidents. The real unit is the **business concept** — a named idea that stakeholders recognize.

```
Good: "An Order goes through a Fulfillment Workflow"
Bad:  "OrderService calls FulfillmentManager which delegates to ProcessingExecutor"
```

The first sentence could be validated by a business person. The second is a programmer-to-programmer encoding that no one outside engineering would recognize.

### 4. Complexity Is Debt; Concepts Are Assets

Every concept added to a system is a permanent tax on everyone who touches it. Every concept removed is a permanent dividend. Therefore:

- Adding a concept requires justification: "What business reality does this model?"
- Removing a concept is always a win — unless it modeled a real business reality.
- The best refactoring is not "cleaner code." It is fewer concepts that model the same business.

### 5. Boundaries Are the Architecture

Architecture is not about layers. Architecture is not about patterns. Architecture is about **where concepts end and other concepts begin.**

A well-bounded system:
- Each boundary maps to a business boundary (team, process, lifecycle)
- Concepts inside a boundary are cohesive (they change together)
- Concepts across boundaries are independent (they change separately)
- Information crossing a boundary is explicit and minimal

A poorly bounded system:
- Boundaries follow technical accidents (one package per pattern)
- Concepts leak across boundaries (a "helper" touches three domains)
- Changes ripple across boundaries (renaming here breaks there)
- Information flows implicitly (shared mutable state, god objects)

### 6. Names Are the API of Understanding

A name is a contract between the writer and every future reader. A good name:
- Comes from the business vocabulary (ubiquitous language)
- Tells you WHAT it is, not HOW it works
- Makes the wrong usage look wrong

A bad name:
- Comes from implementation details (Manager, Processor, Handler)
- Tells you its technical mechanism (StringUtils, DataHelper)
- Makes all usages look equally plausible

### 7. The Test of Good Design: Business Change Maps to Code Change

In a well-designed system:
- A new business rule → one new or modified concept
- A business process change → changes in one bounded context
- A new business entity → one new aggregate, one boundary adjusted

In a poorly designed system:
- A new business rule → scattered changes across 15 files
- A business process change → changes in every layer
- A new business entity → a new class in each of 7 packages

**If business change does not map cleanly to code change, the concept model is wrong.**

---

## The Fundamental Error

The fundamental error in software engineering is:

> **Optimizing code instead of optimizing concepts.**

When you see:
- "Let's extract a method here" → Ask: is a concept missing?
- "Let's add an interface here" → Ask: is there a real boundary?
- "Let's create a factory here" → Ask: what business variation does this serve?
- "Let's add a layer here" → Ask: what business concept does this layer represent?

If the answer is "it's for testability / extensibility / clean architecture" — it's cargo cult.

Real software design never adds implementation concepts that don't model business concepts.

---

## The Manifesto in Practice

Every time you touch code, ask:

```
1. What business concept am I modeling?
2. What boundary does it belong to?
3. What information does it transform?
4. Can I express this with fewer concepts?
5. Does my code read like the business speaks?
```

If you cannot answer question 1, **stop coding and start understanding.**

---

## A Thought Experiment

Imagine explaining your code change to a domain expert (not a programmer). If they would say:

- "Yes, that's exactly how our business works" → Good design
- "I don't understand what that means" → Bad naming
- "That's one thing in our business, why is it three things in code?" → Over-engineering
- "That's three things in our business, why is it one thing in code?" → Under-modeling
- "We never do it that way" → Wrong concept model

**The domain expert is the oracle. The compiler is just a type-checker.**
