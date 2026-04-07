# ADR-036: Decision Replication and ADR-Driven Autonomy

**Status:** Accepted
**Date:** 2026-04-07

---

## Decision

Architecture Decision Records in this platform serve a dual purpose: they record decisions for future reference, and they incrementally transfer decision-making capability from the original decision-maker to future agents (human or AI). This ADR documents why that transfer is difficult and what makes it work when it does.

## Intent

The platform is operated by a single technical decision-maker. That person's judgment is currently required for non-trivial architectural calls. This creates a single point of failure — not in operations (the system runs autonomously), but in evolution (the system cannot be meaningfully extended without that judgment).

This ADR exists to make the problem legible and to define what the ADR corpus must capture to close the gap over time.

## What Makes the Judgment Difficult to Replicate

The judgment that drives this platform's architecture is not one skill. It decomposes into three capabilities that present as a single instinct:

### 1. Timing — knowing what to build now vs. later

Some decisions are driven by the business calendar, not the codebase. Building a generalized publication layer in phase 1 rather than deferring it is a timing call that depends on knowing a vendor exit is imminent. Deferring a scoped identity role until a downstream consumer exists is a timing call that depends on knowing that consumer's requirements would be speculative today.

These calls cannot be made from the code alone. They require knowledge of business constraints, contractual timelines, and organizational priorities that are not visible in the repository.

**What ADRs capture:** the decision and its timing rationale. A future decision-maker reading "Rejected: delay generalized reviews until after source cleanup" with the reason "the company is leaving the vendor within a year" can apply the same logic to a similar future situation without re-deriving it.

**What ADRs cannot capture:** the real-time business context that triggers the next timing call. ADRs freeze past decisions; they do not predict future ones.

### 2. Complexity calibration — knowing how much a small team can carry

Every decision in this platform optimizes for cognitive load over theoretical completeness. Simple orchestration patterns are chosen over sophisticated ones. Platform-wide roles are chosen over per-source roles. Single migrations are chosen over phased rollouts.

This calibration depends on knowing the team size, the operator's available attention, and the maintenance cost of each additional abstraction. The same technical decision might be wrong at a different team scale.

**What ADRs capture:** the constraint ("solo operator," "scuttleable prototype") and the rejected alternative ("rejected because it introduces the first multi-stream orchestration resource in the platform"). A future decision-maker can check whether the constraint still holds before applying the precedent.

**What ADRs cannot capture:** the felt experience of maintaining a system alone — the instinct for when one more abstraction crosses the line from helpful to burdensome. This is learned, not documented.

### 3. Sufficiency — knowing when good enough is actually good enough

The platform ships with permissive raw models against unconfirmed API shapes, with publication logic before the vendor account is verified, and with placeholder credentials in SSM. These are deliberate choices enabled by architectural safety nets (immutable S3 payloads, `extra="allow"`, raw_payload JSONB).

This judgment depends on understanding which layers of the architecture are load-bearing for correctness and which are load-bearing for convenience. Shipping an approximate raw model is safe because S3 has the true payload. Shipping approximate access control is not safe because there is no downstream safety net for a PII leak.

**What ADRs capture:** which safety nets exist and what they protect. The Assumptions and Freshness Marker sections define when a "good enough" decision needs revisiting.

**What ADRs cannot capture:** the risk appetite itself. Two people reading the same ADR may draw different lines on what is safe to defer. The ADR records where the line was drawn, not the internal calibration that drew it.

## How the ADR Corpus Closes the Gap Over Time

Each ADR transfers a unit of judgment from the decision-maker to the corpus. The transfer is not uniform:

**High transfer (replicable after one ADR):**
- Technical boundary decisions (which schema holds PII, which role can read it)
- Pattern application (how to add a new stream, how to wire a new source)
- Rejected alternatives (what was considered and why it was wrong — the most transferable content in any ADR)

**Medium transfer (replicable after several related ADRs):**
- Complexity calibration (the pattern of choosing simpler options becomes visible across multiple ADRs)
- Safety net reasoning (which architectural layers justify shipping approximate work)

**Low transfer (requires external context):**
- Business timing calls (when to build, when to defer)
- Risk appetite under novel conditions (no prior ADR to reference)
- Triage instinct — knowing which decision is worth slowing down for and which is not

The practical trajectory: the corpus makes a future decision-maker (human or AI) incrementally more effective with each ADR — not linearly, but by reducing the surface area of decisions that require original judgment. The decisions that remain hardest to replicate are timing calls that depend on business context not present in the repository.

## Why This Matters for This Platform Specifically

This is not an abstract concern about documentation practices. The platform exists because its operator recognized that vendor data pipelines were a single point of failure. The same logic applies to the decision-making layer: if the platform's evolution depends on one person's judgment for every non-trivial call, the platform has replaced one bottleneck with another.

The ADR corpus is the mechanism for widening that bottleneck. It is not a documentation exercise. It is a deliberate strategy to make the system increasingly autonomous — capable of being extended by someone who was not present for the original decisions, using the recorded reasoning chain rather than re-deriving it from first principles.

## Why-Not (Rejected Alternatives)

### Rely on code comments and inline documentation instead of ADRs

Rejected because code comments capture what was done, not what was considered and rejected. The rejected alternatives are the most valuable part of the decision record — they prevent future decision-makers from re-exploring paths that were already evaluated.

### Write comprehensive design documents instead of decision records

Rejected because design documents describe systems, not choices. A design document explains how the publication pass works. An ADR explains why last-writer-wins was chosen over a Step Function, and under what conditions that choice should be revisited. The decision is the durable artifact; the implementation may change.

### Accept that judgment cannot be replicated and plan for the decision-maker to always be available

Rejected because it is the same single-point-of-failure reasoning that motivated building this platform in the first place. The goal is not to eliminate the need for judgment — it is to reduce the surface area of decisions that require it.

## Assumptions

- The ADR corpus will continue to grow as the platform evolves. Its value is cumulative, not per-document.
- Future decision-makers (human or AI) will read the ADR corpus before making architectural calls. If ADRs are written but not consulted, the transfer mechanism fails.
- The Why-Not sections are the highest-value content for replication. They should be written with enough context that a reader can evaluate whether the rejection still holds under changed conditions.
- The Freshness Marker on each ADR is the mechanism for detecting when a past decision needs re-evaluation. It must be maintained honestly.

## Tribal Context

- This ADR was prompted by the observation that a complex implementation session (new vendor source, multi-stream publication, PII boundary enforcement, platform-wide access control) proceeded unusually smoothly. The analysis of why it was smooth revealed that the bottleneck was not technical — it was decisional. The ADRs eliminated decision replay; the Golden Path eliminated design work; the decision-maker's speed eliminated wait states. All three were necessary.
- The specific insight worth preserving: the hardest judgment to replicate is not "what is the right answer" but "which question is worth slowing down for." The decision-maker paused on PII boundaries but not on EventBridge intervals. That triage instinct is the last capability the corpus can absorb, and it absorbs it slowly — one Tribal Context section at a time.

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** the platform is no longer operated by a single decision-maker, the ADR corpus stops being consulted before architectural decisions, or a future agent (human or AI) demonstrates consistent decision quality without referencing the corpus — proving the judgment has been fully internalized rather than externally referenced.
