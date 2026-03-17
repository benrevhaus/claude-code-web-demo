# ADR-012: AI Leverage Model — Where AI Should and Should Not Operate

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

As a solo CTO, AI is a force multiplier. But AI-generated code is only safe when the system provides strong contracts and constraints. This ADR defines where AI is high leverage, where it is dangerous, and how the architecture enables safe AI contribution.

## Decision

### Where AI is HIGH LEVERAGE (encourage use)

| Area | What AI does | Why it's safe |
|------|-------------|---------------|
| **New stream definitions** | Generates YAML from stream spec + existing examples | Highly constrained format. Machine-validatable. |
| **New Pydantic schemas** | Reads vendor API docs → generates raw + canonical models | Mechanical translation. Pydantic catches type errors at runtime. |
| **Processor transform logic** | Maps raw fields to canonical fields | Input/output contracts are explicit. Tests verify correctness. |
| **Test generation** | Reads contracts → generates test cases with fixtures | Contracts define expected behavior. Tests are verifiable. |
| **Terraform stream instances** | Verifies/generates HCL for new streams | Module interface is rigid. `terraform plan` catches errors. |
| **Runbook updates** | Drafts runbook steps from failure patterns | Structured format. Human-reviewable. |
| **Documentation** | Updates docs when architecture evolves | Low-risk output. |

### Where AI is DANGEROUS (require human review)

| Area | Risk | Mitigation |
|------|------|------------|
| **Step Function ASL edits** | Subtle state machine bugs that only manifest on edge cases (infinite loops, stuck states) | ASL template is locked. AI proposes changes, human reviews and tests. |
| **DynamoDB key design changes** | Breaking the single-table access patterns. Corrupting the control plane. | Entity model is a controlled schema. Changes require ADR. |
| **IAM policy changes** | Over-permissive roles. Privilege escalation. | All IAM in Terraform, reviewed in plan. Never `*` resources. |
| **Postgres migrations** | Destructive DDL. Data loss. Locking production tables. | All migrations reviewed. No `DROP` without explicit human approval. |
| **Secrets or credential handling** | Accidental logging, exposure in error messages, hardcoding | Secrets only in SSM. AI code never handles raw secret values — only references to SSM paths. |
| **Error handling changes in shared libs** | Silent failures, swallowed exceptions that break observability | Shared library changes require integration test verification. |

### How the architecture enables safe AI contribution

1. **CLAUDE.md in repo root** — Describes architecture, golden path, conventions. AI reads this first.

2. **Stream spec is the contract** — AI generates streams by filling a well-defined YAML schema, not by writing arbitrary code.

3. **Pydantic models are guardrails** — Even if AI writes bad transform logic, Pydantic validation catches type mismatches at runtime.

4. **Test fixtures for every stream** — Example raw payloads stored in `tests/fixtures/`. AI runs transforms against known inputs.

5. **CI validation gates** — Stream YAML validation, Pydantic model checks, `terraform validate`, pytest all run on every PR. AI-generated code must pass the same gates as human code.

6. **Immutable raw storage** — If AI generates a bad transform, raw data is untouched. Fix the transform, replay, done.

### Rules for AI-generated PRs

1. AI-generated code gets the same review as human code.
2. AI must not modify locked files (ASL template, DynamoDB entity model, IAM policies) without human-initiated ADR.
3. AI-generated stream definitions must pass the stream spec validator before merge.
4. AI must include test cases for any new transform logic.
5. AI should reference this ADR and relevant specs in PR descriptions.

## Consequences

- The system is deliberately over-constrained compared to a "flexible" architecture — this is a feature, not a bug.
- New patterns that don't fit the constrained path require human judgment (new ADR).
- AI productivity scales with the number of well-defined streams and schemas. The 10th stream is much faster than the 2nd.
- The architecture's legibility IS the AI strategy. There is no separate "AI layer."
