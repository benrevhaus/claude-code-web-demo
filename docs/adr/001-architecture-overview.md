# ADR-001: Architecture Overview & Principles

**Status:** Accepted
**Date:** 2026-03-17
**Context:** Solo CTO of high 8-figure business, building a serverless data ingestion platform ("Data Streams") to ingest vendor data (starting with Shopify) into a standardized, replayable, observable system.

---

## Decision

Build a **constrained, opinionated serverless ingestion platform** with the following non-negotiable design principles:

### Core Principles

1. **Immutable Raw First** — Every external payload is written to S3 before any processing. Raw data is never modified or deleted. This is the foundation of replay, debugging, and schema evolution.

2. **Separation of Concerns** — Three storage tiers (S3, DynamoDB, Postgres) with distinct roles. No store does another store's job.

3. **Config Over Code** — Adding a new data stream should require a YAML definition and a schema model, not new Lambda code or new infrastructure.

4. **One Way to Do Things** — There is exactly one ingestion path. No "quick" Lambdas that bypass the standard flow. No alternative processing pipelines.

5. **Idempotent + Replayable** — Every operation can be safely retried. Every record can be reprocessed from raw storage. The system converges to correct state.

6. **Constrained Patterns for AI and Human Safety** — The architecture is deliberately constrained so that future engineers and AI assistants can safely extend it without understanding the entire system.

### What This Is

An enterprise-capable architecture with a lightweight operating model. Not a full enterprise data platform. Not a generic ETL framework. A pragmatic, opinionated skeleton that handles one pattern (vendor API → raw → canonical → Postgres) extremely well.

### What This Is Not

- Not a real-time streaming platform (Kinesis, Kafka)
- Not a general-purpose ETL/ELT tool (Fivetran, Airbyte)
- Not a data warehouse (Snowflake, Redshift)
- Not a data lake with ad-hoc query capability
- Not a platform designed for a 20-person data team

## Consequences

- New patterns that don't fit the golden path must go through an ADR.
- Engineers who want to "just add a quick Lambda" must be redirected to the standard stream path.
- The system will feel over-structured for simple cases — this is intentional overhead that pays off at 5+ streams.
- AI can safely generate new streams because the contracts are explicit and the patterns are constrained.

## Risks Accepted

1. **Schema layer complexity** — Three schema layers (raw, source canonical, normalized) are correct but the normalization layer is deferred to Phase 2 to avoid speculative abstraction.
2. **Step Function edge cases** — State machine behavior under partial failure requires explicit error states from day one.
3. **Terraform time sink** — Strict boundary required between "Terraform does infrastructure" and "config files do behavior" or Terraform plumbing will consume 60% of build time.
