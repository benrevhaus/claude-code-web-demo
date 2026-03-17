# Data Model

**Status:** Accepted
**Date:** 2026-03-17

---

## DynamoDB Entity Model

**Table:** `data-streams-control-{env}`
**Billing:** On-demand
**PK:** `PK` (String)
**SK:** `SK` (String)
**GSI1:** `GSI1PK` / `GSI1SK`

See [ADR-007](../adr/007-dynamodb-single-table.md) for the rationale on single-table design.

### Entities

#### Run Record

Tracks each polling or replay execution.

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `STREAM#shopify#orders#mystore` |
| SK | String | `RUN#550e8400-e29b-41d4-a716-446655440000` |
| status | String | `running` \| `success` \| `partial_failure` \| `error` |
| started_at | String (ISO 8601) | `2024-03-15T10:00:00Z` |
| completed_at | String (ISO 8601) | `2024-03-15T10:02:30Z` |
| cursor_start | String | `2024-03-15T09:55:00Z` |
| cursor_end | String | `2024-03-15T10:00:00Z` |
| pages | Number | `4` |
| records | Number | `187` |
| records_failed | Number | `0` |
| error_message | String | `null` |
| trigger | String | `poll` \| `webhook` \| `replay` |
| TTL | - | None (permanent audit trail) |

#### Cursor Checkpoint

Where the last successful run stopped. The next run starts here.

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `STREAM#shopify#orders#mystore` |
| SK | String | `CURSOR#current` |
| cursor_value | String | `2024-03-15T10:00:00Z` |
| updated_at | String (ISO 8601) | `2024-03-15T10:02:30Z` |
| run_id | String | `550e8400-e29b-41d4-a716-446655440000` |
| TTL | - | None (always needed) |

#### Idempotency Record

Prevents duplicate processing within the TTL window.

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `IDEM#shopify#orders` |
| SK | String | `a1b2c3d4e5f6...` (SHA-256 hash) |
| processed_at | String (ISO 8601) | `2024-03-15T10:01:00Z` |
| run_id | String | `550e8400-...` |
| s3_key | String | `shopify/orders/mystore/2024/03/15/run_.../page_001.json.gz` |
| TTL | Number (epoch) | 30 days from `processed_at` |

#### Webhook Delivery Log

Tracks received webhooks for dedup and debugging.

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `WEBHOOK#shopify#mystore` |
| SK | String | `wh_abc123def456` |
| topic | String | `orders/updated` |
| received_at | String (ISO 8601) | `2024-03-15T10:05:00Z` |
| s3_key | String | `shopify/orders/mystore/webhooks/2024/03/15/wh_abc123def456.json.gz` |
| processed | Boolean | `true` |
| TTL | Number (epoch) | 7 days from `received_at` |

#### Freshness Status

How stale is the data for this stream?

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `STREAM#shopify#orders#mystore` |
| SK | String | `FRESHNESS#current` |
| last_record_at | String (ISO 8601) | `2024-03-15T10:00:00Z` |
| checked_at | String (ISO 8601) | `2024-03-15T10:02:30Z` |
| lag_minutes | Number | `2.5` |
| TTL | - | None (always needed) |

#### Replay Request (Phase 2)

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `REPLAY#rpl_789xyz` |
| SK | String | `META` |
| source | String | `shopify` |
| stream | String | `orders` |
| store_id | String | `mystore` |
| s3_keys | List[String] | `["shopify/orders/.../page_001.json.gz", ...]` |
| status | String | `pending` \| `running` \| `completed` \| `failed` |
| reason | String | `Schema v2→v3 migration` |
| requested_at | String (ISO 8601) | `2024-03-15T12:00:00Z` |
| completed_at | String (ISO 8601) | `null` |
| records_reprocessed | Number | `0` |
| records_failed | Number | `0` |
| TTL | - | None (audit trail) |

### GSI1 Access Patterns

| Access pattern | GSI1PK | GSI1SK | Purpose |
|---------------|--------|--------|---------|
| List all runs by date | `RUNS#{source}#{stream}` | `{started_at}` | Dashboard: recent runs |
| List all replays by date | `REPLAYS#all` | `{requested_at}` | Dashboard: recent replays |

GSI1 is optional for V1. Add it when you need these dashboard queries.

---

## S3 Key Strategy

**Bucket:** `data-streams-raw-{env}`
**Encryption:** SSE-S3
**Versioning:** Enabled
**Lifecycle:** Standard → Glacier after 90 days → Delete after 730 days (adjust per compliance)

### Polling payloads

```
{source}/{stream}/{store_id}/{YYYY}/{MM}/{DD}/{run_id}/page_{NNN}.json.gz

# Example:
shopify/orders/mystore/2024/03/15/550e8400-e29b-41d4-a716-446655440000/page_001.json.gz
```

### Webhook payloads

```
{source}/{stream}/{store_id}/webhooks/{YYYY}/{MM}/{DD}/{webhook_id}.json.gz

# Example:
shopify/orders/mystore/webhooks/2024/03/15/wh_abc123def456.json.gz
```

### Key design rationale

| Segment | Why |
|---------|-----|
| `{source}/{stream}` | Enables per-stream S3 lifecycle policies and IAM scoping |
| `{store_id}` | Multi-store ready. One prefix per store. |
| `{YYYY}/{MM}/{DD}` | Date partitioning for lifecycle policies and Athena queries |
| `{run_id}` | Groups all pages from one run. "Show me this run's data" = one prefix list. |
| `page_{NNN}` | Ordered within a run. Useful for debugging pagination issues. |
| `.json.gz` | Gzipped for storage efficiency (5-10x compression on Shopify JSON). Extension for tooling. |
| Webhooks in separate path | Different lifecycle (may want shorter retention), different access pattern. |

### What gets stored in S3

The raw payload is the **complete vendor response body**, unmodified. For GraphQL, this includes the `data` and `extensions` fields (rate limit info). For REST, this is the JSON body.

Additionally, each S3 object has metadata (S3 object metadata, not the JSON body):
- `x-amz-meta-source`: source identifier
- `x-amz-meta-stream`: stream identifier
- `x-amz-meta-run-id`: run ID
- `x-amz-meta-page`: page number
- `x-amz-meta-http-status`: HTTP status from vendor
- `x-amz-meta-fetched-at`: ISO 8601 timestamp

---

## Postgres Schema Strategy

**Engine:** Aurora Serverless v2 (PostgreSQL-compatible)
**Access:** Via RDS Proxy (manages connection pooling for Lambda)

### Schema organization

```
postgres/
├── shopify/           # Source-specific schemas (one per source)
│   ├── orders         # Current-state table
│   ├── orders_history # Append-only change log
│   ├── customers
│   └── customers_history
└── normalized/        # Phase 2: provider-agnostic entities
    ├── commerce_orders
    └── commerce_customers
```

### Table: shopify.orders (V1)

```sql
CREATE SCHEMA IF NOT EXISTS shopify;

CREATE TABLE shopify.orders (
    -- Primary identity
    id              BIGINT NOT NULL,
    store_id        TEXT NOT NULL,

    -- Core order fields (source canonical)
    order_number    TEXT,
    email           TEXT,
    financial_status TEXT,
    fulfillment_status TEXT,
    total_price     NUMERIC(12,2),
    currency        TEXT,
    created_at      TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    closed_at       TIMESTAMPTZ,
    tags            TEXT[],
    note            TEXT,

    -- Line items (stored as JSONB for flexibility in V1)
    line_items      JSONB,

    -- Shipping / billing (JSONB in V1, normalize later if needed)
    shipping_address JSONB,
    billing_address  JSONB,

    -- Lineage & metadata
    raw_s3_key      TEXT NOT NULL,        -- Link back to raw payload
    schema_version  TEXT NOT NULL,        -- e.g., "shopify.order.v3"
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id          TEXT,                 -- Which run ingested this

    -- Constraints
    PRIMARY KEY (id, store_id)
);

-- Index for freshness queries
CREATE INDEX idx_orders_updated_at ON shopify.orders (store_id, updated_at DESC);

-- Index for run-based queries
CREATE INDEX idx_orders_run_id ON shopify.orders (run_id);
```

### Table: shopify.orders_history (V1)

```sql
CREATE TABLE shopify.orders_history (
    history_id  BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL,
    store_id    TEXT NOT NULL,
    snapshot    JSONB NOT NULL,           -- Full source canonical at this point
    changed_at  TIMESTAMPTZ NOT NULL,     -- The order's updated_at value
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id      TEXT,

    -- Prevent duplicate history entries for same version
    UNIQUE (order_id, store_id, changed_at)
);

CREATE INDEX idx_orders_history_order ON shopify.orders_history (order_id, store_id, changed_at DESC);
```

### Upsert pattern

```sql
INSERT INTO shopify.orders (id, store_id, order_number, ..., raw_s3_key, schema_version, run_id)
VALUES ($1, $2, $3, ..., $N)
ON CONFLICT (id, store_id) DO UPDATE SET
    order_number = EXCLUDED.order_number,
    ...,
    raw_s3_key = EXCLUDED.raw_s3_key,
    schema_version = EXCLUDED.schema_version,
    ingested_at = NOW(),
    run_id = EXCLUDED.run_id
WHERE shopify.orders.updated_at < EXCLUDED.updated_at;
-- Only update if the incoming record is newer
```

### Design rules

1. **Every table has `raw_s3_key`** — lineage from Postgres row to raw payload.
2. **Every table has `schema_version`** — know which schema produced each row.
3. **Every table has `run_id`** — know which run ingested each row.
4. **Upsert checks `updated_at`** — never overwrite newer data with older data.
5. **JSONB for nested/variable structures** — line items, addresses. Normalize to proper tables only when query patterns demand it.
6. **History is append-only** — never update or delete history rows.

---

## Idempotency Key Strategy

See [ADR-017](../adr/017-idempotency-strategy.md) for full rationale.

### Summary

```python
import hashlib

def compute_idempotency_key(record: dict, key_fields: list[str]) -> str:
    """Compute idempotency key from configured fields."""
    parts = [str(record[field]) for field in key_fields]
    key_input = ":".join(parts)
    return hashlib.sha256(key_input.encode()).hexdigest()

# Example for orders:
# key_fields = ["order_id", "updated_at"]  (from stream spec)
# key_input = "5678901234:2024-03-15T10:00:00Z"
# key_hash = "a1b2c3d4..."
```

- Check DynamoDB BEFORE processing (fast skip).
- Write DynamoDB AFTER Postgres upsert succeeds (correctness guarantee).
- Postgres UNIQUE constraint is the safety net.
- DynamoDB TTL: 30 days.

---

## Freshness Representation

### In DynamoDB

The `FRESHNESS#current` entity stores:
- `last_record_at` — the `updated_at` timestamp of the most recent record seen
- `checked_at` — when the finalizer last computed this
- `lag_minutes` — `checked_at - last_record_at` in minutes

Updated by the run-finalizer on every successful run.

### In CloudWatch

Custom metric: `streams/freshness_lag_minutes`
Dimensions: `source`, `stream`, `store_id`
Published by run-finalizer.

Alarm: triggers if `freshness_lag_minutes > freshness_sla_minutes` (from stream spec) for 2 consecutive datapoints (10 minutes with 5-minute polling).

### Why both

DynamoDB is the queryable record (for dashboards, APIs).
CloudWatch is the alerting mechanism (for alarms, dashboards).
