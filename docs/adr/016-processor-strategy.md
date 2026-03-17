# ADR-016: One Generic Processor, Schema-Driven

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

The processor Lambda reads raw data from S3, validates it, transforms it to source canonical form, and upserts to Postgres. Should there be one processor or many?

## Decision

**One processor Lambda for all streams.** The processor is generic and schema-driven.

### How it works

1. Processor receives input with `source`, `stream`, and `s3_key`.
2. It looks up the stream config to determine which Pydantic schemas to use.
3. It loads the raw payload from S3.
4. It validates against the raw Pydantic model (loose/permissive).
5. It transforms to the source canonical Pydantic model (strict).
6. It checks idempotency in DynamoDB.
7. It upserts to the correct Postgres table (determined by stream config).

### Schema routing

```python
# Conceptual — not production code
SCHEMA_REGISTRY = {
    ("shopify", "orders"): {
        "raw_model": ShopifyOrderRaw,
        "canonical_model": ShopifyOrderV3,
        "pg_table": "shopify.orders",
        "transform": transform_shopify_order,
    },
    ("shopify", "customers"): {
        "raw_model": ShopifyCustomerRaw,
        "canonical_model": ShopifyCustomerV2,
        "pg_table": "shopify.customers",
        "transform": transform_shopify_customer,
    },
}
```

Adding a new stream means adding an entry to this registry + the corresponding Pydantic models and transform function. The processor Lambda code itself doesn't change.

### What "transform" means

The transform function is a pure function: `raw_model → canonical_model`. It:
- Maps field names (Shopify's naming → our naming)
- Coerces types (string dates → datetime objects)
- Extracts nested fields (line items from order)
- Applies business rules (e.g., ignore test orders)

Each stream has its own transform function. These are the only stream-specific code in the system (besides the Pydantic models).

## When to break this rule

Create a separate, dedicated processor **only if**:
- A stream requires fundamentally different processing logic (e.g., multi-entity fan-out where one raw payload creates records in 3+ tables)
- A stream has unique performance requirements (e.g., needs GPU or high memory)
- The generic processor's routing table becomes a maintenance burden (unlikely before 20+ streams)

Any exception must be documented with a new ADR explaining why the generic processor was insufficient.

## Alternatives Rejected

### One processor per stream
Rejected. At 10 streams, this creates 10 Lambdas × (IAM roles + log groups + monitoring + deployment). Most processor logic is identical — only the schema and transform differ.

### One processor per source (shopify-processor, recharge-processor)
Rejected. The processor doesn't know or care about the source's API — it reads from S3, not from the vendor. The source distinction is already captured in the schema routing. A source-specific processor would duplicate all the S3-reading, idempotency-checking, and Postgres-upserting logic.

### Processor as a framework/library instead of a Lambda
Rejected for V1. A framework is warranted when processors are deployed independently by different teams. We have one team (you). A single Lambda with a routing table is simpler.

## Consequences

- One Lambda to deploy, monitor, and debug for all processing.
- Adding a new stream's processing is: write Pydantic models + write a transform function + add a registry entry.
- Processor bugs affect all streams simultaneously. This is mitigated by: per-stream error metrics, DLQ per stream (if needed), and the ability to replay individual streams.
- The processor Lambda's memory/timeout must be sized for the largest payload across all streams.
