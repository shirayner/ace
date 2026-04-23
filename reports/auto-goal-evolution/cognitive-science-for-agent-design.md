# Cognitive Science Insights for AI Agent Skill Design

> Analysis Date: 2026-04-22
> Topic: 认知科学、心理学前沿研究对 AI Agent Skill 设计的具体启示
> Sources: 2024-2026 年认知科学、教育心理学、决策科学、AI 研究文献

## 1. The Curse of Instructions: Attention Degrades Exponentially

### Research Finding

Harada et al. (ICLR 2025, "Curse of Instructions") conducted the most directly relevant empirical study for AI skill design. Using the ManyIFEval benchmark (prompts with up to 10 objectively verifiable instructions), they tested GPT-4o, Claude-3.5, Gemini-1.5, Gemma2, and Llama3.1. The core finding:

**The probability of following ALL instructions = (probability of following ONE instruction)^N**

This is exponential degradation, not linear. Concrete numbers: GPT-4 could follow 10 simultaneous instructions only ~15% of the time. Even with 95% per-instruction accuracy, 10 instructions yield only 60% overall compliance; 20 instructions yield 36%.

The degradation is also architecture-dependent -- some models maintain stable performance on certain task types while collapsing on others, making the problem unpredictable across model versions.

### Mitigation Strategies from the Literature

The authors found that **instruction-level chain-of-thought reasoning** significantly improved multi-instruction compliance. Rather than processing all instructions as a monolithic block, having the model reason about each instruction individually and then self-refine helped it detect and correct violations. Other effective strategies include:

- **Task decomposition**: Breaking complex multi-instruction tasks into sequential subtasks
- **Prompt chaining**: Executing instructions in stages rather than all at once
- **Self-refinement loops**: Generate, check against each instruction, revise

### Design Implications for Agent Skills

| Problem | Implication | Concrete Action |
|---------|-------------|-----------------|
| Exponential degradation | Each additional instruction in a skill file reduces compliance with ALL other instructions | **Ruthlessly minimize instruction count.** Every instruction competes with every other instruction. |
| Power-law transition | There is no "safe threshold" -- degradation starts from instruction #2 | **Count your instructions.** If a skill has 20 discrete directives, expect the model to miss ~40-65% of them in any given execution. |
| Architecture dependence | Different models fail on different instruction types | **Test skills across models.** Don't assume compliance transfers. |
| Self-refinement helps | Per-instruction CoT improves compliance | **Build verification checkpoints into skills** rather than relying on the model to hold all constraints in working memory simultaneously. |

**The fundamental insight**: Skill files are not wish lists. They are budgets. Every instruction you add makes every other instruction less likely to be followed. The optimal skill is not the one that covers every edge case -- it is the one that contains the minimum instructions needed to shift behavior away from the model's default in the directions that matter most.

## 2. Metacognitive Control Layer: Agents That Monitor Themselves

### Research Finding

2025-2026 research on metacognitive AI converges on a clear architectural pattern: reliable agents need **two concurrent loops**, not one.

**Cognition Loop** (object-level): Perceive → Reason → Act → Learn
**Meta-cognition Loop** (meta-level): Monitor → Evaluate → Regulate

The meta-level loop watches the object-level loop. It does not solve the task itself -- it monitors whether the task-solving is going well, detects drift, and intervenes when needed. This mirrors the psychological distinction between "doing" and "thinking about doing."

Key developments:

- **Implementable metacognitive checkpoints** (2025): Rather than vague "self-reflection," researchers propose concrete checkpoints embedded in the agent loop: self-evaluation after tool calls, confidence gating, grounded reflection, plan revision, and memory consolidation.
- **Metacognitive architectures for LLM error correction** (2025): A secondary "metacognitive" layer monitors the primary agent, predicts task failures, and initiates human handoffs when necessary, improving overall task success rates.
- **Intrinsic metacognitive learning** (2025): Moving beyond fixed, human-designed self-improvement loops to agents that evaluate and adapt their own learning processes. Framework includes metacognitive knowledge (self-assessment), metacognitive planning (deciding how to learn), and metacognitive evaluation (reflecting on learning experiences).
- **Four-layer cognitive architecture** (2026): Knowledge → Memory → Wisdom → Intelligence, with distinct persistence semantics and update mechanisms for each layer.

### The Critical Gap

Current LLM agents are mostly single-loop: they execute instructions and use tools. When they fail, they retry the same approach or hallucinate corrections. True metacognition requires the ability to:

1. **Detect** that something is going wrong (not just that an error occurred)
2. **Diagnose** why (distinguish between "wrong tool," "wrong approach," "wrong goal")
3. **Regulate** by choosing a different strategy (not just retrying harder)

### Design Implications for Agent Skills

| Metacognitive Function | Skill Design Pattern | Example |
|----------------------|---------------------|---------|
| **Monitoring** | Build explicit "check your work" steps into skill workflows | After code generation: "Verify the output compiles and passes the stated requirements before proceeding." |
| **Confidence gating** | Skills should define when to escalate vs proceed | "If uncertainty about the approach is high, present options to the user rather than choosing autonomously." |
| **Strategy selection** | Offer the agent multiple approaches, not just one path | "Try approach A first. If it fails for reason X, switch to approach B. If both fail, escalate." |
| **Memory consolidation** | State files should capture not just what happened, but what was learned | State files include a "lessons" section, not just a "progress" section. |

**The fundamental insight**: A skill that only tells the agent WHAT to do is half a skill. It also needs to tell the agent HOW TO NOTICE it is going wrong and WHAT TO DO DIFFERENTLY. The meta-level instructions are often more valuable than the object-level ones, because the model already knows how to code/write/analyze -- what it lacks is the ability to catch itself when its approach is failing.

## 3. Cognitive Load Theory Applied to AI Prompts

### Research Finding

Cognitive Load Theory (CLT), originally developed by John Sweller for human learning, distinguishes three types of cognitive load:

- **Intrinsic load**: The inherent complexity of the task itself
- **Extraneous load**: Complexity added by poor presentation/organization (wasteful)
- **Germane load**: Effort directed toward building understanding (productive)

2025-2026 research applies this framework to human-AI interaction and, by extension, to prompt design:

**Compounded cognitive friction**: Two primary sources of cognitive strain in AI interaction are (1) verification effort (checking AI outputs) and (2) prompt management (guiding/rephrasing prompts). When both are high, the result is "AI brain fry" -- cognitive fatigue that degrades decision quality.

**Prompt fatigue**: The mental effort of crafting and refining prompts is itself a cognitive load. Over sustained interaction, this leads to reduced quality of instructions and increased reliance on AI defaults.

**The germane load paradox**: AI that reduces ALL cognitive load (including germane load) can actually harm outcomes. In educational contexts, reducing the learner's productive struggle leads to shallower understanding. The parallel for AI agents: if a skill file does ALL the thinking for the model (over-specifying every step), it may prevent the model from engaging its own reasoning capabilities on novel situations.

### Design Implications for Agent Skills

**Extraneous load in skills** (eliminate these):
- Redundant instructions that repeat what the model already knows
- Inconsistent formatting that forces the model to parse structure
- Instructions that contradict each other or the system prompt
- Over-specification of obvious steps ("first read the file, then analyze it, then...")

**Germane load in skills** (preserve these):
- High-level goals that require the model to plan its approach
- Constraints that force the model to reason about tradeoffs
- Quality criteria that the model must internalize and apply

**Intrinsic load management**:
- Complex tasks should be decomposed across multiple skill invocations, not crammed into one
- When a skill addresses an inherently complex domain, organize instructions hierarchically (principles > rules > examples) rather than as a flat list

**The cognitive load budget for skills**:

```
Total effective instructions ≈ 7 ± 2 core directives
(Mirrors Miller's Law for human working memory chunks)
```

This is not a proven number for LLMs, but the exponential degradation from Section 1 suggests a similar practical ceiling. Beyond ~10 discrete instructions, compliance becomes unreliable.

## 4. Adaptive Scaffolding: Support Should Fade as Competence Grows

### Research Finding

Educational psychology's scaffolding theory (Vygotsky's Zone of Proximal Development) holds that effective support is:

1. **Calibrated** to the learner's current ability
2. **Temporary** -- fading as competence increases
3. **Responsive** -- adjusting in real-time based on performance signals

2025 research extends this to AI agent design in several ways:

**AI as metacognitive mentor**: AI pedagogical agents are being designed to function as "metacognitive mentors" that use structured prompts and guiding questions rather than direct answers. The agent SocratAIs, for instance, asks questions rather than providing solutions, encouraging the user to explain and clarify their thinking.

**Adaptive behavior tuning**: Adaptive AI systems tune their behavior to the user's level of expertise and interaction style, relying on signals like how users phrase prompts or respond to suggestions. A precise query from an experienced user prompts less direct guidance and more complex challenges.

**The Expertise Reversal Effect**: While not explicitly named in the 2025 search results, the underlying principle is well-established in educational psychology: instructional techniques that are effective for novices become redundant or even counterproductive for experts. Detailed step-by-step guidance helps beginners but creates extraneous cognitive load for experts who already have the relevant schemas.

### Application to AI Agent Skills

The expertise reversal effect has a direct analog in LLM skill design:

| Model Capability Level | Skill Design Strategy | Risk of Mismatch |
|-----------------------|----------------------|-------------------|
| **Weak model** (early GPT-3 era) | Detailed step-by-step instructions, many examples, explicit formatting rules | Under-scaffolding: model cannot infer intent from sparse instructions |
| **Moderate model** (GPT-4, Claude 3) | Principles + constraints + quality criteria, fewer examples | Appropriate scaffolding for current generation |
| **Strong model** (future) | High-level goals + evaluation criteria only | Over-scaffolding: detailed instructions conflict with the model's own superior strategies |

**The scaffolding paradox for skill designers**: Skills written for today's models will become over-specified for tomorrow's models. The detailed procedural instructions that currently help Claude follow a workflow may actively interfere with a more capable future Claude that has better judgment about how to approach the task.

**Practical principle**: Separate WHAT (goals, constraints, quality criteria) from HOW (procedures, steps, methods). The WHAT ages well; the HOW needs revision with each model generation. A skill structured as "achieve X by doing steps 1-2-3-4-5" is brittle. A skill structured as "achieve X, where quality means Y, and avoid pitfall Z" is durable.

## 5. Distributed Cognition: State Files as Cognitive Artifacts

### Research Finding

Distributed cognition (Hutchins) argues that cognition is not confined to individual minds but extends across people, tools, and artifacts. A ship's navigation system is cognitive -- not just the navigator's brain, but the charts, instruments, and communication protocols all participate in the cognitive process.

2025-2026 research extends this to human-AI teams:

**AI's Social Forcefield** (October 2025): A framework examining how linguistic, cognitive, and social coordination emerge as human and AI agents co-construct a shared representational space. AI systems act as "social forcefields" that reorganize the distributed cognitive architecture of teams. Key finding: exposure to AI-generated language influences how people speak, think, and relate to one another -- for better (efficient collaboration) or worse (eroded epistemic diversity).

**Cognitive Architecture of AI-Human Teams** (January 2026): Argues that the crucial design challenge is developing cognitive architectures where humans and AI systems can "think together." When intelligence is distributed between humans and machines, decision-making structures need fundamental rethinking.

**Shared Mental Models in Human-AI Teams**: AI agents can scaffold meta-cognitive processes to strengthen shared mental models and collaboration. But current research on human-AI shared mental models is hampered by inconsistencies in terminology and measurement.

### The State File as Cognitive Artifact

In distributed cognition theory, external artifacts are not just memory aids -- they are active participants in the cognitive process. A nautical chart does not merely store information; it structures how the navigator thinks about the problem.

State files (like `.tasks/*/state.md`) serve exactly this function in agent skill design:

| Distributed Cognition Concept | State File Analog | Design Principle |
|------------------------------|-------------------|------------------|
| **External representation** | State file captures current task progress | The file should represent the problem structure, not just log events |
| **Cognitive offloading** | Agent writes decisions to file to free context window | Offload decisions and rationale, not just data |
| **Coordination artifact** | State file enables human-agent and cross-session coordination | Design state files for the READER (future agent or human), not the writer |
| **Propagation of representational state** | Information transforms as it moves through the system | State file format should match how the information will be consumed (e.g., structured for resumption, not for reporting) |
| **Temporal distribution** | Past cognitive work shapes current cognition | Include "why" alongside "what" -- future sessions need the reasoning, not just the conclusion |

**The critical design principle**: A state file is not a log. It is a cognitive tool that shapes how the next agent (or the next session of the same agent) thinks about the problem. Design it as you would design a cockpit instrument -- to make the right action obvious and the wrong action difficult.

### Concrete Recommendations

1. **Structure state files for resumption, not archival**: The primary reader is a future agent session with zero context. Lead with "what to do next," not "what was done."
2. **Separate stable knowledge from volatile state**: Decisions and rationale (stable) should be distinct from progress markers (volatile). This mirrors the distinction between reference documents and working documents in team cognition.
3. **Use the state file to constrain the problem space**: A well-structured state file should make it hard for the resuming agent to pursue dead ends that the previous session already explored. List "approaches tried and rejected" explicitly.

## 6. Double-Loop Learning: Questioning Assumptions, Not Just Correcting Errors

### Research Finding

Chris Argyris's double-loop learning distinguishes two levels of adaptation:

- **Single-loop**: Detect error → Correct action (thermostat model: temperature too low → turn on heat)
- **Double-loop**: Detect error → Question the goals/assumptions/norms that produced the action (is the target temperature correct? Should we be heating at all?)

2025-2026 research shows this concept being operationalized in AI agent design:

**ARIA (Adaptive Reflective Interactive Agent)**: An LLM framework for continuous learning that incorporates structured internal self-dialogue. ARIA explicitly questions its own domain knowledge and identifies implicit assumptions, proactively seeking human guidance when facing uncertainties. Presented at ICML 2025.

**HyperAgents** (March 2026): Demonstrated the ability to transfer self-improvement strategies learned in one domain to entirely new domains. This goes beyond single-loop learning (fixing bugs in the current approach) to double-loop (learning HOW to learn, then applying that meta-strategy elsewhere).

**Meta's SWE-RL** (December 2025): Trains LLMs to identify and fix bugs autonomously through self-play, generating their own training data. The system learns not just to fix specific bug patterns but to develop general debugging strategies.

**Metacognitive self-improvement**: Agents being designed to modify not only their task behavior but also their own modification processes -- the clearest implementation of double-loop learning in AI.

### The Single-Loop Trap in Skill Design

Most current skill designs are single-loop: they define procedures, and when something goes wrong, the recovery strategy is to retry or escalate. They never question whether the procedure itself is appropriate.

| Learning Level | What Gets Modified | Skill Design Example |
|---------------|-------------------|---------------------|
| **Zero-loop** | Nothing -- repeat the same action | Skill always follows the same rigid steps regardless of outcome |
| **Single-loop** | Actions within fixed rules | Skill retries with a different tool when the first tool fails |
| **Double-loop** | The rules/goals themselves | Skill recognizes that the entire approach is wrong and switches strategy; experience file records "this approach type fails for this problem type" |
| **Triple-loop** | The learning process itself | System improves how it captures and applies experience (meta-learning) |

### Design Implications

1. **Experience files should capture assumption failures, not just action failures**: "I assumed the user wanted X, but they actually wanted Y" is double-loop. "The file wasn't found at path Z" is single-loop.
2. **Build explicit assumption-checking into skill workflows**: Before executing, the agent should surface its key assumptions and verify them. "I'm assuming this is a Java project. Is that correct?"
3. **Periodic strategy review**: Skills should include checkpoints where the agent asks "Is this approach still making sense?" rather than only checking "Did the last step succeed?"
4. **The experience evolution mechanism needs double-loop entries**: Not just "what went wrong" but "what assumption was wrong" and "how should I think differently next time."

## 7. Ecological Rationality: Simple Rules Win When They Match the Environment

### Research Finding

Gerd Gigerenzer's research program on fast-and-frugal heuristics demonstrates a counterintuitive finding: in environments characterized by uncertainty (as opposed to calculable risk), simple decision rules systematically outperform complex optimization algorithms.

**The core mechanism -- less-is-more effect**: Heuristics work by ignoring information. In uncertain environments, this is a feature, not a bug. Complex models overfit to noise in the training data. Simple rules, by using fewer parameters, are more robust to the unpredictable variation that characterizes real-world environments.

Key empirical findings:

- **1/N heuristic**: Allocating investments equally across N options outperformed Markowitz mean-variance optimization (which uses historical returns, variances, and covariances) when data was limited and the future was uncertain.
- **Recidivism prediction**: A simple rule using only age and prior convictions outperformed an algorithm using 137 variables.
- **The critical distinction**: In situations of RISK (known probability distributions), complex optimization wins. In situations of UNCERTAINTY (unknown distributions, structural change possible), simple heuristics win. The key question is: which environment are we designing for?

### Application to AI Agent Skill Design

AI agent execution environments are characterized by high uncertainty:
- User intent is partially observable
- Codebases are diverse and unpredictable
- Tool outputs are variable
- The right approach depends on context that is often ambiguous

This means the environment of AI agent execution is firmly in Gigerenzer's "uncertainty" territory, not "risk" territory. Complex, detailed protocols are the equivalent of Markowitz optimization -- they overfit to the skill designer's anticipated scenarios and break on novel ones.

| Complex Protocol (Overfitting) | Fast-and-Frugal Heuristic (Robust) |
|-------------------------------|-------------------------------------|
| "If the file is Java, use pattern A. If Python, use pattern B. If TypeScript, use pattern C. If unknown, ask the user..." | "Read the code first. Follow the conventions you find." |
| 20-step workflow with decision trees | 3 principles + 1 quality criterion |
| "Always use approach X for problem type Y" | "Try the simplest approach first. Escalate only if it fails." |
| Detailed error recovery procedures for each known failure mode | "When stuck, state what you tried and what went wrong. Ask for guidance." |

**The ecological rationality test for skills**: A skill is ecologically rational if it works BECAUSE of the environment it operates in, not despite it. For example:

- "Read the existing code before modifying it" works because codebases have conventions, and following them is usually correct.
- "Start with the simplest solution" works because simple solutions are easier to verify, debug, and iterate on.
- "When uncertain, ask" works because the human in the loop has context the agent lacks.

These heuristics are not lazy -- they are adapted to the structure of the environment. They exploit the fact that codebases have patterns, that simple solutions are often correct, and that humans have context.

### The Skill Design Heuristic

**Recognition heuristic for skill design**: If a skilled human developer would not need the instruction, the model probably does not need it either. Skills should encode the things that distinguish expert behavior from competent-default behavior, not the competent-default behavior itself.

## 8. Satisficing vs. Optimizing: When "Good Enough" Beats "Best"

### Research Finding

Herbert Simon's satisficing principle: when the cost of finding the optimal solution exceeds the benefit of having it (compared to a merely good solution), rational agents should satisfice -- find an option that meets their aspiration level and stop searching.

This directly challenges the assumption that more planning, more alignment, and more verification always lead to better outcomes. Beyond a certain point, the cost of additional optimization exceeds its value.

2025 developments reinforce this:

- **Inference-time compute scaling** (AISTATS 2025): LLMs can improve by spending more compute at inference time (self-verification, chain-of-thought), but with diminishing returns. There is an optimal compute budget for any given task difficulty.
- **AI Agent Conference 2025**: Discussions on autonomous AI highlighted the tradeoff between agent reliability and agent speed. Agents that verify everything are reliable but slow; agents that act on reasonable assumptions are fast but occasionally wrong.

### The Optimization Trap in Skill Design

Skill designers face a constant temptation to optimize: add more instructions to cover more cases, add more verification steps to catch more errors, add more alignment checkpoints to ensure the agent stays on track. But each addition has costs:

1. **Instruction budget cost** (Section 1): More instructions → exponential degradation in compliance
2. **Latency cost**: More verification → slower execution
3. **Rigidity cost**: More prescribed steps → less adaptation to novel situations
4. **Maintenance cost**: More detailed skills → more work to update when models improve

### The Satisficing Framework for Skills

| Dimension | Optimizing Approach | Satisficing Approach | When to Satisfice |
|-----------|--------------------|--------------------|-------------------|
| **Planning** | Comprehensive plan with full analysis before any action | Quick assessment → act → adjust | When the cost of a wrong first step is low (reversible actions) |
| **Alignment** | Clarify every ambiguity before proceeding | Clarify critical ambiguities, make reasonable assumptions for minor ones | When the user has indicated urgency or the decision is easily reversible |
| **Verification** | Test every edge case | Test the happy path + the most likely failure mode | When the task is low-stakes or exploratory |
| **Instruction coverage** | Cover every known scenario in the skill | Cover the 3-5 most common/impactful scenarios | When the long tail of scenarios is diverse and unpredictable |

**The aspiration level principle**: Define what "good enough" looks like for each skill. A coding skill does not need to produce perfect code on the first try -- it needs to produce code that is correct, readable, and testable, then iterate based on feedback. An analysis skill does not need to find every insight -- it needs to find the most important ones and present them clearly.

**Practical rule**: If adding an instruction to a skill would improve outcomes in less than 20% of invocations, it probably is not worth the compliance cost it imposes on the other 80%.

## 9. Synthesis: Design Principles Matrix

### The Eight Insights Condensed

| # | Domain | Core Insight | Design Principle | One-Liner |
|---|--------|-------------|-----------------|-----------|
| 1 | Attention Economics | Multi-instruction compliance degrades exponentially | **Instruction Budget** | Every instruction you add makes every other instruction weaker. |
| 2 | Metacognition | Agents need a monitoring loop, not just an execution loop | **Dual-Loop Architecture** | Tell the agent how to notice failure, not just how to succeed. |
| 3 | Cognitive Load | More instructions can reduce effective reasoning | **Load Management** | Eliminate extraneous load; preserve germane load. |
| 4 | Adaptive Scaffolding | Support should fade as capability grows | **Future-Proof Layering** | Separate WHAT (durable) from HOW (perishable). |
| 5 | Distributed Cognition | External artifacts shape cognition, not just store data | **Cognitive Artifacts** | Design state files for the reader, not the writer. |
| 6 | Double-Loop Learning | Systems need to question assumptions, not just correct actions | **Assumption Surfacing** | Experience should capture wrong assumptions, not just wrong actions. |
| 7 | Ecological Rationality | Simple rules outperform complex protocols under uncertainty | **Environmental Fit** | Match rule complexity to environmental predictability. |
| 8 | Satisficing | Beyond a threshold, more optimization hurts | **Good Enough Threshold** | Define "good enough" explicitly; stop optimizing past it. |

### The Unified Model: How These Eight Principles Interact

```
                    ┌─────────────────────────────────────┐
                    │     SKILL DESIGN DECISION SPACE      │
                    └─────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌──────────┐   ┌──────────┐   ┌──────────────┐
             │ CONTENT   │   │ STRUCTURE│   │ EVOLUTION    │
             │ (What to  │   │ (How to  │   │ (How skills  │
             │  include) │   │ organize)│   │  change)     │
             └──────────┘   └──────────┘   └──────────────┘
                 │               │               │
  ┌──────────────┤    ┌──────────┤    ┌──────────┤
  ▼              ▼    ▼          ▼    ▼          ▼
[#1 Budget]  [#3 Load] [#2 Meta] [#5 Dist] [#4 Scaffold] [#6 Double]
[#7 Ecology] [#8 Satisfice]      Cognition  Fading        Loop
```

**Content decisions** (what goes into a skill):
- Instruction Budget (#1) sets the hard constraint: ~7±2 core directives maximum
- Cognitive Load (#3) determines what KIND of content: eliminate extraneous, preserve germane
- Ecological Rationality (#7) determines the FORM: simple heuristics over complex protocols
- Satisficing (#8) determines the SCOPE: cover the vital 20%, not the complete 100%

**Structure decisions** (how a skill is organized):
- Metacognition (#2) requires dual-level structure: execution instructions + monitoring instructions
- Distributed Cognition (#5) shapes state file design: cognitive artifacts, not logs

**Evolution decisions** (how skills change over time):
- Adaptive Scaffolding (#4) mandates layered design: goals (stable) separate from procedures (volatile)
- Double-Loop Learning (#6) requires experience that captures assumption failures, enabling skills to evolve their own premises

### A Concrete Skill Audit Checklist

Use this checklist to evaluate any existing or proposed skill:

- [ ] **Instruction count**: Does the skill have more than 10 discrete directives? If yes, which ones can be eliminated or consolidated?
- [ ] **Extraneous load**: Does the skill repeat things the model already knows? Does it specify obvious steps?
- [ ] **Meta-level instructions**: Does the skill tell the agent how to detect failure and switch strategies, or only how to execute the happy path?
- [ ] **WHAT vs HOW separation**: If the model's capabilities doubled tomorrow, which parts of this skill would become counterproductive? Can those be isolated?
- [ ] **State file design**: Are state files structured for the READER (future session) or the WRITER (current session)? Do they include rationale, not just status?
- [ ] **Assumption surfacing**: Does the skill encourage the agent to surface and verify its assumptions before committing to an approach?
- [ ] **Ecological fit**: Are the skill's rules matched to the predictability of its environment? Complex rules for stable domains, simple heuristics for variable ones?
- [ ] **Satisficing threshold**: Is "good enough" defined? Is the skill trying to cover every edge case, or focusing on the highest-impact scenarios?
- [ ] **20% test**: For each instruction, does it improve outcomes in >20% of invocations? If not, the compliance cost likely exceeds the benefit.

### The Meta-Principle

All eight domains converge on a single meta-principle:

> **Trust the model's native capabilities. Only add instructions that shift behavior away from the model's default in directions that the model would not discover on its own. Every additional instruction is a tax on all other instructions.**

This is the skill designer's version of the Hippocratic oath: first, do no harm. A skill that adds 30 instructions to "help" the model may actually degrade its performance below what it would achieve with zero instructions. The burden of proof is on each instruction to justify its existence.

## References

### Primary Research (2025-2026)

1. Harada, K. et al. (2025). "Curse of Instructions: Large Language Models Cannot Follow Multiple Instructions at Once." Under review, ICLR 2025. Introduces ManyIFEval benchmark; demonstrates exponential degradation.
2. "Toward Artificial Metacognition" (2025). Multiple papers summarizing key ideas from cognitive psychology and their instantiation in AI systems.
3. "Metacognitive AI" (2025). Book publication on AI self-assessment and decision-making for safe and reliable systems.
4. "AI's Social Forcefield: Reshaping Distributed Cognition in Human-AI Teams" (October 2025). Framework for alignment in distributed cognition.
5. "The Cognitive Architecture of AI-Human Teams" (January 2026). Design challenges for distributed human-AI intelligence.
6. "Architecting for Augmented Intelligence" (March 2026). AI as cognitive co-processor; risks of cognitive crutch.
7. ARIA: Adaptive Reflective Interactive Agent (ICML 2025). LLM framework with structured self-dialogue for continuous learning.
8. HyperAgents (March 2026). Transferable self-improvement strategies across domains.
9. Meta SWE-RL (December 2025). Autonomous bug detection and fixing through self-play.
10. Gonzalez & Malloy (2026). "Toward Complementary Intelligence: Integrating Cognitive and Machine AI."
11. Inquizzitor (AAAI 2026). LLM-based formative assessment with human-AI hybrid intelligence.

### Foundational Works

12. Gigerenzer, G. (various). Fast-and-frugal heuristics, ecological rationality, and the less-is-more effect.
13. Simon, H. (1956). "Rational Choice and the Structure of the Environment." Bounded rationality and satisficing.
14. Argyris, C. (1977). "Double Loop Learning in Organizations." Questioning assumptions vs. correcting actions.
15. Hutchins, E. (1995). "Cognition in the Wild." Distributed cognition framework.
16. Sweller, J. (1988). "Cognitive Load During Problem Solving." Cognitive load theory.
17. Vygotsky, L. (1978). "Mind in Society." Zone of proximal development and scaffolding.
18. Kalyuga, S. et al. (2003). "The Expertise Reversal Effect." When instructional support becomes counterproductive.
