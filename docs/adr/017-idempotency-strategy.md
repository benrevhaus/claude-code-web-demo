# ADR-017: Idempotency via DynamoDB + Postgres Constraints

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

The system must be safely replayable. Records may be processed more than once (retries, replays, overlapping webhook + poll delivery). Duplicate processing must not create duplicate data.

## Decision

**Two-layer idempotency: DynamoDB for fast dedup, Postgres constraints as safety net.**

### Layer 1: DynamoDB idempotency check (fast path)

Before processing a record, the processor checks DynamoDB for the idempotency key.

**Idempotency key construction:**
```python
import hashlib
# Fields defined in stream spec's idempotency_key list
key_input = f"{order_id}:{updated_at}"
key_hash = hashlib.sha256(key_input.encode()).hexdigest()
```

- If key exists in DynamoDB → skip processing. Return "skipped" in output.
- If key doesn't exist → process the record, then write the key to DynamoDB.
- DynamoDB idempotency records have a 30-day TTL.

**Why DynamoDB first:** DynamoDB single-item reads are <5ms. Checking before processing avoids unnecessary S3 reads, Pydantic validation, and Postgres round-trips for already-processed records.

### Layer 2: Postgres UNIQUE constraint (safety net)

```sql
CREATE TABLE shopify.orders (
    id BIGINT NOT NULL,
    store_id TEXT NOT NULL,
    ...
    UNIQUE (id, store_id)
);
```

If the DynamoDB check somehow misses a duplicate (TTL expiry, race condition), the Postgres UNIQUE constraint prevents a true duplicate row. The upsert (`INSERT ... ON CONFLICT DO UPDATE`) handles this gracefully — it updates the existing row with potentially newer data.

### Why two layers

| Scenario | DynamoDB catches it? | Postgres catches it? |
|----------|---------------------|---------------------|
| Normal retry (within 30 days) | Yes (fast skip) | Would also catch |
| Replay after 30 days (TTL expired) | No | Yes (upsert) |
| Race condition (concurrent processors) | Possible miss | Yes (constraint) |
| Webhook + poll deliver same record | Yes (fast skip) | Would also catch |

DynamoDB is the **performance optimization** (avoid unnecessary work).
Postgres is the **correctness guarantee** (no duplicates ever).

### Idempotency key design per stream

The `idempotency_key` field in the stream spec defines which fields form the key:

```yaml
# For orders: same order + same updated_at = same version, skip
idempotency_key:
  - order_id
  - updated_at

# For webhooks: same webhook delivery ID = same event, skip
idempotency_key:
  - webhook_id
```

**Critical:** The idempotency key must include a **version dimension** (like `updated_at`). If the key is just `order_id`, we'd skip processing updated versions of the same order.

### History table idempotency

The `shopify.orders_history` table is append-only. A duplicate insert to the history table (same order_id + same snapshot) is acceptable but wasteful. We prevent it with:

```sql
-- Only insert history if the record actually changed
INSERT INTO shopify.orders_history (order_id, store_id, snapshot, changed_at, run_id)
SELECT ... WHERE NOT EXISTS (
    SELECT 1 FROM shopify.orders_history
    WHERE order_id = $1 AND store_id = $2 AND changed_at = $3
);
```

## Alternatives Rejected

### Postgres-only idempotency (no DynamoDB check)
Rejected. Every record would require a Postgres round-trip even if already processed. At high volume (thousands of records per run), this adds unnecessary database load.

### Redis for idempotency
Rejected. Adds another service to manage. DynamoDB is already in the stack for other control-plane purposes.

### Idempotency key without TTL
Rejected. Without TTL, the DynamoDB table grows forever. Idempotency records are only useful within a window (the replay/retry window). 30 days is generous.

### Content-based deduplication (hash the payload)
Rejected as primary strategy. Payload hashing is fragile — vendors can add metadata fields that change the hash without changing the business data. Field-based keys (order_id + updated_at) are more stable. However, payload hashing can be added as a supplementary check if needed.

## Consequences

- Every stream spec MUST define `idempotency_key` fields.
- The idempotency key must include a version/timestamp dimension.
- DynamoDB idempotency records auto-expire via TTL. No cleanup jobs needed.
- After TTL expiry, a re-delivered record will be reprocessed. This is a Postgres upsert (safe) that updates the row to potentially newer data (harmless at worst, correct at best).
- The processor must write the DynamoDB idempotency key AFTER successful Postgres upsert, not before. This ensures we don't mark something as processed if the Postgres write failed.
