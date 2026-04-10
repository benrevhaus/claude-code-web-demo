# ADR-048: Why ADRs Are the Product, Not the Code

**Status:** Accepted
**Date:** 2026-04-10

---

## Decision

Architecture Decision Records are the primary artifact of this platform. The code is a secondary artifact that can be regenerated from the ADRs. The ADRs cannot be regenerated from the code.

Every non-trivial decision, failure, and operational scar is recorded as an ADR. This is not a documentation practice — it is the core engineering strategy.

## Intent

This ADR explains why the decision corpus exists, why it is maintained at the cost of engineering velocity, and why the alternative (skip documentation, move fast, fix later) was rejected after decades of experience with that approach.

## The Economics Before AI

For a solo operator, writing ADRs before AI was economically irrational:

- Writing a good ADR took 30-60 minutes of context-switching from engineering to documentation
- The only reader was the author, who already knew the decision
- The hypothetical future reader (a new engineer, an auditor) might never arrive
- The documentation decayed faster than it could be maintained
- The ROI was negative in every measurable timeframe

The rational choice was to skip documentation and keep the decisions in the operator's head. This worked — until it didn't. Every time the operator was unavailable, on vacation, or needed to revisit a decision from months ago, the cost of missing documentation materialized as re-derivation time, repeated mistakes, or decisions made without context.

The problem was never the instinct. The instinct to record decisions was correct for decades. The problem was the tooling: writing documentation was expensive, reading it was optional, and maintaining it was a second job.

## What Changed

AI changed two economics simultaneously:

### 1. The writing cost collapsed

The operator makes the decision. The AI writes the ADR in 2 minutes. The context switch from engineering to documentation dropped from 30-60 minutes to near zero. The ADR is written in the same conversation where the decision was made, with the full reasoning chain still in context.

### 2. The ADRs acquired a reader that uses them

Every new session begins by reading the ADR corpus. The AI makes better decisions because of prior ADRs — it doesn't re-explore rejected alternatives, it follows established patterns, and it flags stale assumptions. The ADRs are not write-only documentation. They are active inputs to every subsequent decision.

Before AI, documentation was a deposit into an account that might never be withdrawn. Now, every ADR is withdrawn within days or weeks — by the AI in the next session, by the operator looking up a prior decision, or by the validation playbook during a deployment.

## Evidence From This Platform

The data-streams platform reached 47 ADRs in two working sessions. The compound effect:

**Decisions that were never revisited because the ADR existed:**
- Schema-level PII enforcement (ADR-035) — applied to Shopify and Gorgias without re-debating the approach
- Platform-wide roles instead of per-source roles — decided once, applied across all schemas
- Last-writer-wins publication orchestration — never questioned after the initial decision
- Incremental mode detection from cursor format — reused across rebuild, seed, and steady state

**Failures that were diagnosed in minutes because a prior ADR documented the pattern:**
- SSM region mismatch (ADR-038 tribal context) — caught on second occurrence, not re-debugged
- Lock contention during seed (ADR-046) — detection query was already written
- User-Agent blocking (ADR-045) — playbook reduced future instances from 2 hours to 2 minutes

**Estimated time saved by the corpus in two sessions:** 15-20 hours of re-derivation, re-debugging, and re-deciding. Estimated time spent writing ADRs: 3 hours. The ROI is 5-7x in the first week alone, and it compounds.

## Why-Not (Rejected Alternatives)

### Skip ADRs and move faster

Rejected after decades of experience with this approach. Moving fast without recording decisions works until:
- The operator needs to revisit a decision from months ago and can't remember the reasoning
- A new tool (AI or human) joins the project and has no context
- A failure occurs that was previously debugged and fixed, but the fix wasn't recorded
- The operator is unavailable and no one else can make informed decisions

The velocity gain from skipping ADRs is real in the first week and negative by the second month.

### Write ADRs only for major architectural decisions

Rejected because the operational scars (ADRs 037-047) proved more valuable than the architectural decisions (ADRs 001-030). The architectural ADRs establish patterns. The operational ADRs prevent repeated failures. A corpus that only captures architecture misses the highest-value content.

### Use code comments instead of ADRs

Rejected because code comments capture what was done, not what was considered and rejected. The Why-Not sections are the most valuable part of every ADR. They prevent future decision-makers from re-exploring paths that were already evaluated and rejected with documented reasoning.

### Use a wiki or Confluence instead of in-repo ADRs

Rejected because documentation that lives outside the codebase decays independently of the code. In-repo ADRs travel with the code, are versioned with the code, and are read by the same tools (including AI) that read the code. External documentation becomes stale the moment someone forgets to update it.

## The Thesis

Code is cheap and getting cheaper. Decisions are expensive and staying expensive.

The code for this platform can be regenerated from the ADR corpus by any competent AI. The ADR corpus cannot be regenerated from the code — it encodes judgment, timing, rejected alternatives, and operational context that only existed in the moment the decision was made.

The ADRs are the product. The code is the implementation.

## Assumptions

- AI capabilities will continue to improve at code generation, making code increasingly regenerable
- The cost of writing ADRs with AI assistance will remain low (2-5 minutes per ADR)
- The value of the corpus compounds over time as more decisions reference prior decisions
- A future engineer or AI reading the corpus can make decisions at 70-90% of the original operator's quality without the original operator present (ADR-036)

## Freshness Marker

- **Captured:** 2026-04-10
- **Stale when:** AI advances to the point where it can derive the full reasoning chain, rejected alternatives, and operational context from code alone — making explicit ADRs redundant. This would require AI to infer intent, business context, and failure history from implementation artifacts, which is not on any current capability trajectory.
