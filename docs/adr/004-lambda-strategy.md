# ADR-004: Lambda Runtime Roles (Config Over Bespoke)

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

We need Lambda functions to fetch data, process it, and manage run lifecycle. The question is: how many Lambdas, and how do they map to streams?

## Decision

**A small number of reusable Lambda runtime roles, driven by config.** Not one Lambda per source, not one Lambda per endpoint.

### Runtime roles:

| Role | What it does | How many Lambdas | Invoked by |
|------|-------------|-------------------|------------|
| **shopify-poller** | Fetches one page from Shopify API | 1 | Step Functions |
| **webhook-receiver** | Validates HMAC, writes raw to S3, enqueues | 1 | API Gateway |
| **processor** | Reads S3, validates, transforms, upserts Postgres | 1 | SQS or Step Functions |
| **run-finalizer** | Closes run record, emits metrics, computes freshness | 1 | Step Functions |
| **replay-worker** | Re-reads S3, re-invokes processor (Phase 2) | 1 | Step Functions |

**Total: 4 Lambdas for V1, 5 for V2.**

### How config-driven works

The **shopify-poller** doesn't know about "orders" vs "customers." It receives stream config as input from the Step Function:
- Which API endpoint to call
- Which API version to use
- What page size to use
- Which cursor field to use

The **processor** doesn't know about "orders" vs "customers." It receives a stream identifier and uses it to:
- Select the correct Pydantic schema for validation
- Select the correct Postgres table for upsert
- Apply the correct idempotency key formula

Adding a new Shopify stream (e.g., customers) means:
1. Write a new YAML stream definition
2. Write Pydantic models for the new entity
3. Register the schema in the processor's routing table
4. Deploy — no new Lambda code

## Alternatives Rejected

### One giant Lambda per source
Rejected. A single monolithic Lambda for all Shopify operations would grow unwieldy, mix concerns (fetching vs processing vs finalization), and make error isolation impossible.

### One Lambda per endpoint/entity
Rejected. This creates Lambda sprawl. At 10 Shopify entities, you'd have 10 pollers, 10 processors, etc. Each needs its own IAM role, log group, and monitoring. The operational overhead is quadratic.

### Generic "fetch anything" Lambda (not source-specific)
Rejected for V1. A fully generic poller that can call any REST/GraphQL API sounds elegant but requires handling auth, pagination, and rate limiting generically — which is hard to get right. The shopify-poller knows Shopify's auth and pagination patterns. When we add a second provider, we add a `recharge-poller` with that provider's specifics. The processor and finalizer remain generic.

## Consequences

- Poller Lambdas are provider-specific (they understand the provider's auth and pagination). One per provider, not one per entity.
- Processor, finalizer, and replay-worker are fully generic. One each, ever.
- Stream config (YAML) is the mechanism for adding new streams, not new code.
- If a specific entity requires truly unique processing logic (e.g., complex multi-entity fan-out), it gets a dedicated processor as an explicit exception, documented with a new ADR.
