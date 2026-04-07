# ADR-033: Keep Review Source Streams Pure, Publish a Generalized Review Layer

**Status:** Accepted
**Date:** 2026-04-07

---

## Decision

Review ingestion in `data-streams` will use an explicit layered model:

1. raw source payloads
2. source-canonical review tables
3. generalized published review tables

For Yotpo specifically:

- source ingestion stays Yotpo-shaped
- the official downstream contract is a generalized reviews layer
- Yotpo-specific joined current tables are still published for debugging and validation
- internal identity/binding data lives in a restricted companion table, not in the broad-access generalized reviews table

## Intent

The system needs two properties at the same time:

- lossless, debuggable source truth during a risky migration away from Yotpo
- a durable downstream contract that survives provider replacement and internal review tooling

This ADR sets the boundary where abstraction belongs:

- not in the source ingest tables
- yes in the published generalized layer

## Constraints

- The existing legacy review pipeline mixes ingestion, ranking, remapping, caching, and publication behavior.
- Yotpo is expected to be replaced within roughly a year, so downstream systems should not deepen their dependency on Yotpo-native contracts.
- Review data includes sensitive linkage concerns that must support Customer 360 without exposing identity joins to broad analyst access.
- Future review sources may include site reviews and internal review systems, not only product reviews from Yotpo.
- The generalized layer must be query-friendly for analysts and application code, not only technically normalized.

## Why

### 1. Source truth and downstream durability are different jobs

The Yotpo layer should remain easy to compare against Yotpo itself. That is only possible if the source-canonical layer preserves Yotpo-native fields and endpoint boundaries closely.

The generalized layer serves a different purpose: one durable business contract across providers and internal systems.

### 2. Abstracting too early makes migration riskier

If the Yotpo ingest layer is generalized too soon, every discrepancy becomes ambiguous:

- source API mismatch
- mapping bug
- normalization bug

Keeping the source layer pure narrows failure modes while the corpus is being rebuilt.

### 3. Downstream systems need a stable join key and contract now

Future systems should depend on:

- namespaced identities
- generalized review fields
- explicit subject contracts

not on Yotpo IDs, Yotpo endpoint quirks, or provider-specific visibility semantics.

### 4. Sensitive linkage must be separated from broad-access review data

Customer binding and raw identity keys are operationally necessary, but they widen blast radius if exposed in the main generalized table.

The correct split is:

- broad-access generalized review record
- restricted identity/linkage companion keyed by the same canonical review ID

## Why-Not (Rejected Alternatives)

### Generalize at the source-canonical layer immediately

Rejected because it increases migration ambiguity and weakens source debugging fidelity. The source layer should mirror vendor truth closely enough that it can be reconciled against the vendor without interpretive confusion.

### Skip the Yotpo-specific published joined layer and publish generalized reviews directly from raw source tables

Rejected because this is the first generalized reviews implementation and the source corpus is being rebuilt from a legacy system with known drift. A Yotpo-specific joined current layer provides a stabilization and debugging boundary before generalization.

### Put customer linkage directly on the generalized reviews table

Rejected because it makes broad-access review data an accidental bridge into customer identity systems. The blast radius is too large for a field that most analysts do not need.

### Delay generalized reviews until after Yotpo source cleanup is complete

Rejected because the generalized review contract is the durable edge the company actually wants. Building it in phase 1 reduces downstream rework and lets Customer 360 depend on the right abstraction from the start.

## Assumptions

- A review is always about a subject, and published generalized review rows should never carry a null subject contract.
- Multiple providers and internal tools will eventually feed the generalized reviews layer.
- Product-specific review identity is not a safe long-term universal contract, so subject identity must be explicit and namespaced at publication time.
- Provider-specific history and replay concerns belong primarily in raw and source-canonical layers, not in generalized published history for phase 1.

## Tribal Context

- The practical problem is not “how do we model reviews perfectly?” It is “how do we stop a legacy Yotpo implementation from remaining the de facto source of truth while avoiding a second rebuild when Yotpo is replaced.”
- The broad table is optimized for analysts and product/application consumers.
- The restricted companion exists because Customer 360 and operator debugging need privileged join power on day 1.
- Query ergonomics matter. High-value business fields belong in typed columns, while long-tail or provider-specific shape stays in JSONB.

## Human vs AI Decisioning

- Human role:
  - set the boundaries between source truth, generalized publication, and restricted identity
  - determine what is operationally safe to expose broadly
  - decide where abstraction is load-bearing versus premature
- AI role:
  - compress and structure the reasoning chain
  - preserve rejected alternatives and assumptions
  - make the artifact legible for reuse in future review streams

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** the company decides not to build generalized review contracts in `data-streams`, Customer 360 no longer depends on generalized reviews, or a future source proves that source-pure plus generalized publication is the wrong boundary for review data.
