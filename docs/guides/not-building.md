# What We Chose Not To Build (And Why)

**Date:** 2026-03-17

---

## Purpose

This document is as important as the architecture itself. It captures explicit decisions about what is OUT OF SCOPE and why. When you (or a future engineer, or an AI) feel the urge to build one of these things, read the rationale first. Some of these are "not yet" and some are "not ever in this architecture."

---

## Not Building in Phase 1

### Provider-Agnostic Normalization Layer

**What it is:** A mapping layer that transforms `shopify.orders` → `commerce_orders` so downstream consumers don't depend on vendor-specific schemas.

**Why not yet:** We have one provider (Shopify). Normalization is only meaningful with 2+ providers. Building it for one provider creates speculative abstraction that will likely be wrong when the second provider arrives.

**When to build:** Phase 2, when we add the second provider. The trigger is: "we need cross-provider queries" or "we're onboarding Recharge/Stay.ai."

**What we do instead:** V1 queries `shopify.orders` directly. Accept that table names will change when normalization is added.

**See:** [ADR-013](../adr/013-normalization-deferred.md)

---

### Automated Replay Workflow

**What it is:** A Step Function that takes a replay request (time range or S3 key list) and re-processes everything automatically.

**Why not yet:** Replay frequency in V1 will be low (schema changes, occasional bugs). Manual replay (invoke processor with specific S3 keys) is sufficient.

**When to build:** Phase 2, after the first time you've done manual replay 3+ times and the process is well-understood.

**What we do instead:** Document the manual replay process. Ensure the processor is idempotent. The replay Step Function design is documented in [Step Function Design](../specs/step-function-design.md) so it can be built quickly when needed.

---

### Backfill State Machine

**What it is:** A dedicated workflow for bulk historical data loading.

**Why not yet:** Backfill reuses the incremental poll state machine with a manually set start cursor and higher `max_pages_per_run`. No new infrastructure needed.

**When to build:** Only if backfills regularly exceed Step Function execution limits (25,000 history events) or Shopify's Bulk API would be dramatically more efficient.

**What we do instead:** Start a poll Step Function with `cursor_override` and `max_pages_override` in the input.

---

### Schema Registry Service

**What it is:** A runtime service (like Confluent Schema Registry or AWS Glue Schema Registry) that stores, versions, and validates schemas.

**Why not yet:** Pydantic models in git ARE the schema registry. They're versioned (git), validated (tests), and enforced (runtime). A service adds operational overhead without proportional value at <20 schemas.

**When to build:** Only if we need runtime schema discovery (processor dynamically fetching schemas it doesn't have in code) or cross-service schema sharing. This is Phase 3+ at earliest.

**What we do instead:** Pydantic models in `schemas/`, version in the class name, `schema_version` field on every record.

---

### Multi-Store / Multi-Tenant Support

**What it is:** Running the same stream for multiple Shopify stores, each with their own credentials and data isolation.

**Why not yet:** V1 targets one store. The architecture is designed for multi-store (store_id is a dimension everywhere) but the Terraform and config aren't parameterized for it yet.

**When to build:** When we actually have a second store. Likely involves parameterizing the stream spec with store config and adding per-store SSM credentials.

**What we do instead:** Hardcode one store_id. The data model already includes `store_id` in every key and table, so no schema changes will be needed.

---

### Admin UI / Dashboard

**What it is:** A web interface for viewing run status, triggering replays, managing streams.

**Why not yet:** The AWS Console (Step Functions, CloudWatch, DynamoDB) IS the admin UI. Building a custom UI for one person is over-engineering.

**When to build:** Phase 3, when non-technical stakeholders need visibility into pipeline status, or when there are 3+ engineers who shouldn't need AWS Console access.

**What we do instead:** CloudWatch dashboard for metrics. Step Functions console for run history. DynamoDB console for control plane queries.

---

### CI/CD Pipeline

**What it is:** Automated test → plan → deploy on git push.

**Why not yet:** V1 is deployed manually (`terraform apply`, Lambda zip upload). For one engineer with one environment, manual deploy is faster than setting up CI/CD.

**When to build:** Phase 2. Before the second engineer touches production. The pipeline should be: lint → test → terraform plan (on PR) → terraform apply (on merge to main).

**What we do instead:** `make deploy` script that runs tests, zips Lambdas, and applies Terraform.

---

### CDC / Real-Time Streaming

**What it is:** DynamoDB Streams, Kinesis, or Kafka for real-time event processing downstream of ingestion.

**Why not yet:** Our use case is near-real-time (5-minute polling) not true real-time. Webhooks provide sub-minute latency for critical events. CDC adds significant infrastructure complexity.

**When to build:** Only if a downstream consumer has a hard requirement for <1 second latency on data changes.

**What we do instead:** 5-minute polling + webhook belt-and-suspenders. Good enough for reporting, analytics, and most operational use cases.

---

### dbt / Transformation Layer

**What it is:** A SQL-based transformation framework for building analytics models, marts, and aggregates from the source canonical tables.

**Why not yet:** V1 focuses on getting data INTO Postgres correctly. Transformation/analytics is a downstream concern.

**When to build:** Phase 2-3, when there are actual analytics queries that need pre-computed aggregations.

**What we do instead:** Query `shopify.orders` directly. Write ad-hoc SQL for reports.

---

## Not Building Ever (In This Architecture)

### Generic ETL Framework

**What it is:** A tool like Fivetran, Airbyte, or a custom generalized connector framework that can ingest from any API.

**Why not:** We're building a constrained, opinionated platform for a specific set of sources. A generic framework trades specificity (and therefore reliability) for generality. Our poller knows Shopify's pagination quirks, rate limits, and failure modes. A generic framework would need to learn these at runtime.

**What we do instead:** Provider-specific pollers (one per vendor) with shared processing infrastructure.

---

### Data Lake with Ad-Hoc Query Engine

**What it is:** S3 + Athena/Presto as the primary query layer instead of Postgres.

**Why not:** Our access patterns are relational (join orders with customers, query by date range, upsert on primary key). Postgres handles these natively. Athena has cold-start latency, no transactions, and query-time schema enforcement.

**S3 IS our data lake for raw storage.** But the queryable business truth lives in Postgres.

---

### Event Sourcing Architecture

**What it is:** Storing all state changes as an immutable event log and deriving current state by replaying events.

**Why not:** Event sourcing is the theoretically pure version of our immutable-raw-first principle, but it requires: an event store, a projection engine, snapshot management, and eventual consistency handling. We get 80% of the benefit (replayability, auditability) at 20% of the complexity by storing raw payloads in S3 and maintaining current state in Postgres via upsert.

---

### Kubernetes / Container Orchestration

**Why not:** We run Lambda functions. Kubernetes is for long-running services with complex deployment needs. Our workloads are short-lived (seconds to minutes), invoked on schedule or by events. Lambda is the correct compute model. K8s would add massive operational overhead for zero benefit.

---

### Multi-Region / DR

**Why not:** For V1, a single-region deployment is sufficient. S3 has 99.999999999% durability. Aurora has automated backups. The data sources (Shopify) can be re-polled if we lose everything. Multi-region adds cost and complexity that isn't justified until the platform is business-critical AND has SLA requirements that single-region can't meet.

---

## Decision Framework: When to Revisit

When someone proposes building something from the "not yet" list, ask:

1. **Is there a concrete use case today?** (Not "we might need it someday.")
2. **Does the manual/simple approach no longer work?** (Has it been tried and hit its limits?)
3. **Is the cost of building it justified by reduced operational burden?** (Will it save more time than it takes to build?)
4. **Can it be built incrementally?** (Start small, expand if valuable.)

If all four are yes, write an ADR and build it. If not, defer.
