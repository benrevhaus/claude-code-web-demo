# ADR-002: Three-Tier Storage Strategy

**Status:** Accepted
**Date:** 2026-03-17
**Supersedes:** N/A

---

## Context

We need to store raw vendor data, operational metadata, and business-queryable entities. A single store cannot serve all three access patterns well.

## Decision

Three storage tiers, each with a single clear role:

| Store | Role | Access Pattern |
|-------|------|----------------|
| **S3** (`data-streams-raw-{env}`) | Immutable raw truth | Write-once from poller/webhook. Read from processor/replay. |
| **DynamoDB** (`data-streams-control-{env}`) | Operational control plane | Run tracking, cursors, idempotency, freshness, webhook log. |
| **Postgres** (Aurora Serverless v2) | Business/relational truth | Source canonical entities. Queryable. Joins. Eventually marts. |

### S3: What goes here and why

- Every raw vendor API response, complete and unmodified
- Webhook payloads, complete and unmodified
- Gzipped JSON, encrypted at rest (SSE-S3)
- Versioning enabled (belt and suspenders on immutability)
- Lifecycle policy: move to Glacier after 90 days, delete after 2 years (adjust per compliance)

S3 is the **system of record**. If Postgres is corrupt, we replay from S3. If we change schemas, we reprocess from S3. If we need to debug a weird order, we read from S3.

### DynamoDB: What goes here and why

- Run metadata (status, timestamps, page counts, errors)
- Cursor checkpoints (where the last run left off)
- Idempotency keys with TTL (prevent duplicate processing)
- Webhook delivery log with TTL
- Freshness status (last record timestamp per stream)
- Replay request records

DynamoDB is the **control plane**. Fast single-item reads/writes. No complex queries. TTLs keep it from growing unbounded.

### Postgres: What goes here and why

- Source canonical entities (shopify.orders, shopify.customers, etc.)
- History tables (append-only snapshots of entity changes)
- Cross-stream joins (orders + customers + products)
- Eventually: normalized entities, metric marts

Postgres is the **business truth**. Where analysts query. Where reports come from. Where cross-entity logic lives.

## Alternatives Rejected

### Single Postgres for everything
Rejected. Postgres cannot serve as a high-write idempotency store at Lambda concurrency levels, and storing raw JSON blobs in Postgres is expensive and defeats S3's durability guarantees.

### DynamoDB for business queries
Rejected. DynamoDB's query model doesn't support the relational joins and ad-hoc queries that business users need.

### S3 + Athena instead of Postgres
Rejected for V1. Athena is powerful for ad-hoc analysis but has cold-start latency and doesn't support the transactional upsert pattern we need. May revisit as a complement (not replacement) in Phase 3.

### Redis for idempotency
Rejected. Adds another service to manage. DynamoDB with TTL handles the idempotency pattern with zero operational overhead.

## Consequences

- Three AWS services to provision and monitor (acceptable — each is serverless/managed).
- Data flows through a defined path: vendor → S3 → processor → Postgres, with DynamoDB tracking state at each step.
- Every Postgres row must carry `raw_s3_key` for lineage back to the original payload.
