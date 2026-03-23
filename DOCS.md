# Data Streams Platform — Unified Reference

> **Auto-generated synthesis** of all docs in `docs/` + `CLAUDE.md`.
> Organized by topic. Do not edit manually — regenerate from source docs.
> Last synthesized: 2026-03-20.

---

## Table of Contents

1. [Platform Overview & Philosophy](#1-platform-overview--philosophy)
2. [Architecture Principles & Design Invariants](#2-architecture-principles--design-invariants)
3. [Technology Stack](#3-technology-stack)
4. [Repository Structure (Golden Path)](#4-repository-structure-golden-path)
5. [Data Model](#5-data-model)
   - [DynamoDB — Control Plane](#51-dynamodb--control-plane)
   - [S3 — Immutable Raw Storage](#52-s3--immutable-raw-storage)
   - [Postgres — Business Truth](#53-postgres--business-truth)
   - [SSM Parameters — Secrets](#54-ssm-parameters--secrets)
6. [Schema Architecture (Three Layers)](#6-schema-architecture-three-layers)
7. [Stream YAML Specification](#7-stream-yaml-specification)
8. [Lambda Runtime Roles & Contracts](#8-lambda-runtime-roles--contracts)
9. [Orchestration](#9-orchestration)
10. [Idempotency Strategy](#10-idempotency-strategy)
11. [Observability & Operability](#11-observability--operability)
12. [Failure Modes & Recovery](#12-failure-modes--recovery)
13. [Infrastructure (Terraform)](#13-infrastructure-terraform)
14. [AI Leverage Model](#14-ai-leverage-model)
15. [Adding a New Stream](#15-adding-a-new-stream)
16. [What Is NOT Being Built](#16-what-is-not-being-built)
17. [Phased Roadmap](#17-phased-roadmap)
18. [V1 Launch Checklist](#18-v1-launch-checklist)
19. [Architecture Decision Records (ADR Index)](#19-architecture-decision-records-adr-index)

---

## 1. Platform Overview & Philosophy

### What This Is

A **serverless data ingestion platform** that pulls vendor data (starting with Shopify) into a standardized, replayable, observable system. One pattern done extremely well:

```
Vendor API → S3 (raw) → Processor → Postgres (canonical)
```

DynamoDB serves as the control plane. Built by and for a solo CTO running a high 8-figure business.

### What This Is NOT

- Not a real-time streaming platform (Kinesis, Kafka)
- Not a general-purpose ETL/ELT tool (Fivetran, Airbyte)
- Not a data warehouse (Snowflake, Redshift)
- Not a data lake with ad-hoc query capability
- Not a platform designed for a 20-person data team

An enterprise-capable architecture with a lightweight operating model. A pragmatic, opinionated skeleton that handles vendor API → raw → canonical → Postgres extremely well.

### Philosophy

This repository is a **scuttleable prototype**.

- Optimize for fast iteration, clarity, and rebuildability.
- Avoid overengineering.
- If uncertain, choose the simplest approach that still works end-to-end.
- The system is deliberately over-constrained — this is a feature, enabling both humans and AI to safely extend it without understanding the entire system.

### Core Principles (Non-Negotiable)

1. **Immutable Raw First** — Every external payload is written to S3 before any processing. Raw data is never modified or deleted. This is the foundation of replay, debugging, and schema evolution.
2. **Separation of Concerns** — Three storage tiers (S3, DynamoDB, Postgres) with distinct roles. No store does another store's job.
3. **Config Over Code** — Adding a new data stream = YAML + schema + migration. No new Lambda code.
4. **One Way to Do Things** — One ingestion path. No "quick" Lambdas that bypass the standard flow. No alternative pipelines.
5. **Idempotent + Replayable** — Every operation can be safely retried. Every record can be reprocessed from raw storage. The system converges to correct state.
6. **Constrained Patterns for Safety** — Architecture is constrained so future engineers and AI can safely extend it.

### Consequences of the Philosophy

- New patterns that don't fit the golden path must go through an ADR.
- Engineers who want to "just add a quick Lambda" must be redirected to the standard stream path.
- The system will feel over-structured for simple cases — this is intentional overhead that pays off at 5+ streams.
- AI can safely generate new streams because the contracts are explicit and the patterns are constrained.

---

## 2. Architecture Principles & Design Invariants

### Key Design Invariants

1. **Raw data is immutable.** Never modify or delete S3 raw payloads.
2. **Processor is stateless and deterministic.** Same S3 input → same Postgres output.
3. **Idempotency is two-layer.** DynamoDB (fast check, 30d TTL) + Postgres UNIQUE constraint (safety net).
4. **Upsert checks `updated_at`.** Never overwrite newer data with older data.
5. **Config over code.** New stream for existing source = YAML + schema + migration, not new Lambda code.

### Code Boundary Rules

- **Lambdas are thin.** Handlers parse input, call shared libs, return output. No business logic in handlers.
- **Shared libs are the logic layer.** All reusable logic lives in `src/shared/`.
- **Schemas are the contract layer.** Raw models are permissive (`extra="allow"`). Canonical models are strict. Transforms are pure functions.
- **Stream YAML is the config layer.** Adding a new stream for an existing source = YAML + schema + migration. No new Lambda code.
- **`src/shared/contracts.py` is the interface boundary.** Every Lambda's input/output is a Pydantic model defined here.
- **Only `src/shared/dynamo_control.py` talks to DynamoDB.** Only `src/shared/pg_client.py` talks to Postgres. Only `src/shared/s3_writer.py` writes to S3.

### Risks Accepted

1. **Schema layer complexity** — Three schema layers are correct; normalization layer deferred to Phase 2 to avoid speculative abstraction.
2. **Step Function edge cases** — State machine behavior under partial failure requires explicit error states from day one.
3. **Terraform time sink** — Strict boundary required between "Terraform does infrastructure" and "config files do behavior" or Terraform plumbing will consume 60% of build time.

---

## 3. Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime | Python 3.12 | Best Shopify libs, boto3, Pydantic, widest hiring pool, AI generation reliability |
| Schema validation | Pydantic v2 | Runtime validation, IDE support, serialization, tests all in one |
| AWS SDK | boto3 | Most complete AWS SDK |
| HTTP client | httpx | Async-capable, modern |
| Structured logging | structlog | Structured JSON output |
| Postgres client | psycopg2-binary or asyncpg | Via RDS Proxy |
| Infrastructure | Terraform | Most widely understood IaC, largest hiring pool, debuggable |
| Compute | AWS Lambda (4 roles) | Short-lived workloads, event-driven, serverless |
| Polling orchestration | AWS Step Functions | Durable workflow, visible, auditable |
| Webhook queue | SQS | Fast ack, DLQ, retry, buffering |
| Raw storage | S3 | Write-once, immutable, lifecycle, cheap |
| Control plane | DynamoDB (single table, on-demand) | Fast single-item ops, TTL, serverless |
| Business data | Aurora Serverless v2 Postgres | Relational, joins, upserts, analytics |
| Connection pooling | RDS Proxy | Lambda-friendly connection management |
| Secrets | SSM Parameter Store (SecureString) | Free for standard tier, IAM-controlled, zero-ops |
| Scheduling | EventBridge | `rate(5 minutes)` → Step Function |
| Observability | CloudWatch only (V1) | Zero setup, built-in, sufficient at V1 scale |
| Linting | ruff | Fast, comprehensive Python linter |
| Testing | pytest | Standard Python testing |

### Lambda Packaging

- One Lambda Layer for shared dependencies (pydantic, httpx, structlog, psycopg2-binary)
- Individual Lambda packages contain handler code + shared modules
- Packaged via `terraform archive_file` or `make zip`

---

## 4. Repository Structure (Golden Path)

```
data-streams/
├── CLAUDE.md                           # Architecture summary, conventions, changelog
├── pyproject.toml                      # VERSION + dependencies
├── streams/                            # Stream YAML definitions (the config layer)
│   └── shopify-orders.yaml
├── schemas/                            # Pydantic models (the contract layer)
│   ├── raw/shopify/order.py            # Permissive raw vendor model
│   └── canonical/shopify/
│       ├── order_v3.py                 # Strict canonical model
│       └── transforms.py              # Pure functions: raw → canonical
├── src/
│   ├── lambdas/                        # Lambda handlers (thin — delegate to shared)
│   │   ├── poller/handler.py           # Fetch one page from Shopify, write raw to S3
│   │   ├── processor/handler.py        # Read S3 → validate → transform → upsert Postgres
│   │   └── finalizer/handler.py        # Close run, compute freshness, emit metrics
│   └── shared/                         # Shared libraries (the logic layer)
│       ├── contracts.py                # All Pydantic input/output models for Lambdas
│       ├── stream_config.py            # Parse stream YAML → Pydantic StreamConfig
│       ├── schema_registry.py          # Route (source, stream) → models + transform
│       ├── s3_writer.py                # Write + gzip + metadata → return S3 key
│       ├── dynamo_control.py           # Run CRUD, cursor CRUD, idempotency, freshness
│       ├── pg_client.py                # Connection via RDS Proxy, upsert, transactions
│       └── observability.py            # structlog setup, CloudWatch metric helper
├── migrations/                         # Postgres DDL (numbered, sequential)
│   └── 001_shopify_orders.sql
├── infra/                              # Terraform
│   ├── modules/
│   │   ├── stream-platform/            # Core: S3 bucket, DynamoDB, Aurora, IAM, VPC, SQS, SNS, SSM
│   │   ├── stream-poller/              # Parameterized: Step Function + EventBridge + poller Lambda
│   │   └── stream-webhook/             # Parameterized: API Gateway + SQS + webhook Lambda
│   ├── environments/
│   │   ├── dev/main.tf
│   │   └── prod/main.tf
│   └── shared/                         # Terraform backend, lock table
├── tests/
│   ├── fixtures/shopify/orders/        # Real API responses (3+ per stream)
│   ├── test_transforms.py
│   ├── test_stream_config.py
│   └── test_idempotency.py
├── runbooks/
│   ├── stale-data.md
│   ├── failed-run.md
│   └── dlq-messages.md
└── docs/                               # Architecture, specs, guides, roadmap
```

### Single Repo Policy (ADR-006)

Everything in one repository until 3+ engineers are working concurrently. Benefits:
- Atomic commits across infra + code + config
- Stream definition + schema + Terraform wiring in one PR
- AI assistants can see full context

**Split only when:** 3+ engineers regularly blocked on merge conflicts, or compliance requires separate infra access controls. If split, keep schemas + stream definitions with application code, not infrastructure.

---

## 5. Data Model

### 5.1 DynamoDB — Control Plane

**Table:** `data-streams-control-{env}`
**Billing:** On-demand (pay per request)
**Keys:** `PK` (String), `SK` (String)
**GSI1:** `GSI1PK` / `GSI1SK` (optional, add when dashboard queries need it)

#### Entity: Run Record

Tracks each polling or replay execution. No TTL — permanent audit trail.

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

#### Entity: Cursor Checkpoint

Where the last successful run stopped. The next run starts here. No TTL.

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `STREAM#shopify#orders#mystore` |
| SK | String | `CURSOR#current` |
| cursor_value | String | `2024-03-15T10:00:00Z` |
| updated_at | String (ISO 8601) | `2024-03-15T10:02:30Z` |
| run_id | String | `550e8400-e29b-41d4-a716-446655440000` |

#### Entity: Idempotency Record

Prevents duplicate processing within the 30-day TTL window.

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `IDEM#shopify#orders` |
| SK | String | `a1b2c3d4e5f6...` (SHA-256 hash of key fields) |
| processed_at | String (ISO 8601) | `2024-03-15T10:01:00Z` |
| run_id | String | `550e8400-...` |
| s3_key | String | `shopify/orders/mystore/2024/03/15/run_.../page_001.json.gz` |
| TTL | Number (epoch) | 30 days from `processed_at` |

#### Entity: Webhook Delivery Log

Tracks received webhooks for dedup and debugging. 7-day TTL (Shopify stops retrying after 7 days).

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `WEBHOOK#shopify#mystore` |
| SK | String | `wh_abc123def456` |
| topic | String | `orders/updated` |
| received_at | String (ISO 8601) | `2024-03-15T10:05:00Z` |
| s3_key | String | `shopify/orders/mystore/webhooks/2024/03/15/wh_abc123def456.json.gz` |
| processed | Boolean | `true` |
| TTL | Number (epoch) | 7 days from `received_at` |

#### Entity: Freshness Status

How stale is the data for this stream? Updated by run-finalizer on every run. No TTL.

| Attribute | Type | Example |
|-----------|------|---------|
| PK | String | `STREAM#shopify#orders#mystore` |
| SK | String | `FRESHNESS#current` |
| last_record_at | String (ISO 8601) | `2024-03-15T10:00:00Z` |
| checked_at | String (ISO 8601) | `2024-03-15T10:02:30Z` |
| lag_minutes | Number | `2.5` |

#### Entity: Replay Request (Phase 2)

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

#### GSI1 Access Patterns (Add When Needed)

| Access Pattern | GSI1PK | GSI1SK |
|---------------|--------|--------|
| List all runs by date | `RUNS#{source}#{stream}` | `{started_at}` |
| List all replays by date | `REPLAYS#all` | `{requested_at}` |

#### TTL Strategy

| Entity | TTL | Reason |
|--------|-----|--------|
| Idempotency | 30 days | After 30 days, reprocessing is safe (Postgres upsert is idempotent) |
| Webhook log | 7 days | Shopify stops retrying after 7 days |
| Run records | None | Permanent audit trail |
| Cursors, Freshness | None | Always need current state |

#### Alternatives Rejected

- **Multiple DynamoDB tables:** Creates N tables × (capacity config + backup + monitoring + Terraform). At our scale, operational overhead far exceeds performance benefit.
- **DynamoDB with provisioned capacity:** On-demand eliminates capacity planning. Cost difference negligible at our volume.
- **Redis for idempotency:** Adds another service; DynamoDB already in the stack.

---

### 5.2 S3 — Immutable Raw Storage

**Bucket:** `data-streams-raw-{env}`
**Encryption:** SSE-S3
**Versioning:** Enabled (belt and suspenders on immutability)
**Lifecycle:** Standard → Glacier after 90 days → Delete after 730 days

#### Key Patterns

**Polling payloads:**
```
{source}/{stream}/{store_id}/{YYYY}/{MM}/{DD}/{run_id}/page_{NNN}.json.gz

# Example:
shopify/orders/mystore/2024/03/15/550e8400-e29b-41d4-a716-446655440000/page_001.json.gz
```

**Webhook payloads:**
```
{source}/{stream}/{store_id}/webhooks/{YYYY}/{MM}/{DD}/{webhook_id}.json.gz

# Example:
shopify/orders/mystore/webhooks/2024/03/15/wh_abc123def456.json.gz
```

#### Key Design Rationale

| Segment | Why |
|---------|-----|
| `{source}/{stream}` | Per-stream S3 lifecycle policies and IAM scoping |
| `{store_id}` | Multi-store ready; one prefix per store |
| `{YYYY}/{MM}/{DD}` | Date partitioning for lifecycle policies and Athena queries |
| `{run_id}` | Groups all pages from one run. "Show me this run's data" = one prefix list |
| `page_{NNN}` | Ordered within a run. Useful for debugging pagination issues |
| `.json.gz` | Gzipped for 5-10x compression on Shopify JSON |
| Webhooks in separate path | Different lifecycle (may want shorter retention), different access pattern |

#### What Gets Stored

The raw payload is the **complete vendor response body, unmodified**. For GraphQL, this includes `data` and `extensions` fields (rate limit info). For REST, the full JSON body.

S3 object metadata (not part of the JSON body):
- `x-amz-meta-source`: source identifier
- `x-amz-meta-stream`: stream identifier
- `x-amz-meta-run-id`: run ID
- `x-amz-meta-page`: page number
- `x-amz-meta-http-status`: HTTP status from vendor
- `x-amz-meta-fetched-at`: ISO 8601 timestamp

#### Why S3 Is the System of Record

If Postgres is corrupt → replay from S3. If schemas change → reprocess from S3. If debugging a weird order → read from S3.

#### Alternatives Rejected

- **Single Postgres for everything:** Cannot serve as high-write idempotency store at Lambda concurrency; raw JSON in Postgres is expensive and defeats S3 durability.
- **S3 + Athena instead of Postgres:** Cold-start latency, no transactional upsert pattern. May revisit as complement (not replacement) in Phase 3.

---

### 5.3 Postgres — Business Truth

**Engine:** Aurora Serverless v2 (PostgreSQL-compatible)
**Access:** Via RDS Proxy (manages connection pooling for Lambda)

#### Schema Organization

```
postgres/
├── shopify/               # Source-specific (one per vendor)
│   ├── orders             # Current-state table (upsert-on-newer)
│   ├── orders_history     # Append-only change log
│   ├── customers
│   └── customers_history
└── normalized/            # Phase 2: provider-agnostic entities
    ├── commerce_orders
    └── commerce_customers
```

#### Table: `shopify.orders` (V1)

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

    -- Line items (JSONB for flexibility in V1; normalize later if needed)
    line_items      JSONB,

    -- Shipping / billing (JSONB in V1)
    shipping_address JSONB,
    billing_address  JSONB,

    -- Lineage & metadata (REQUIRED on every table)
    raw_s3_key      TEXT NOT NULL,        -- Link back to raw S3 payload
    schema_version  TEXT NOT NULL,        -- e.g., "shopify.order.v3"
    ingested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id          TEXT,

    PRIMARY KEY (id, store_id)
);

CREATE INDEX idx_orders_updated_at ON shopify.orders (store_id, updated_at DESC);
CREATE INDEX idx_orders_run_id ON shopify.orders (run_id);
```

#### Table: `shopify.orders_history` (V1)

Append-only change log. Never update or delete rows.

```sql
CREATE TABLE shopify.orders_history (
    history_id  BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL,
    store_id    TEXT NOT NULL,
    snapshot    JSONB NOT NULL,           -- Full source canonical at this point
    changed_at  TIMESTAMPTZ NOT NULL,     -- The order's updated_at value
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id      TEXT,

    UNIQUE (order_id, store_id, changed_at)  -- Prevents duplicate history snapshots
);

CREATE INDEX idx_orders_history_order ON shopify.orders_history (order_id, store_id, changed_at DESC);
```

#### Upsert Pattern (Critical)

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
-- Only update if the incoming record is NEWER
```

#### History Insert Pattern

```sql
-- Only insert history if the record actually changed
INSERT INTO shopify.orders_history (order_id, store_id, snapshot, changed_at, run_id)
SELECT ... WHERE NOT EXISTS (
    SELECT 1 FROM shopify.orders_history
    WHERE order_id = $1 AND store_id = $2 AND changed_at = $3
);
```

#### Postgres Table Design Rules

1. **Every table has `raw_s3_key`** — lineage from Postgres row to raw payload.
2. **Every table has `schema_version`** — know which schema produced each row.
3. **Every table has `run_id`** — know which run ingested each row.
4. **Upsert checks `updated_at`** — never overwrite newer data with older data.
5. **JSONB for nested/variable structures** — normalize only when query patterns demand it.
6. **History is append-only** — never update or delete history rows.

---

### 5.4 SSM Parameters — Secrets

**Convention:** `/data-streams/{env}/{source}/{secret_name}`

| Path | Type | Used by |
|------|------|---------|
| `/data-streams/{env}/shopify/access_token` | SecureString | shopify-poller (GraphQL Admin API bearer token) |
| `/data-streams/{env}/shopify/webhook_secret` | SecureString | webhook-receiver (HMAC validation) |
| `/data-streams/{env}/postgres/connection_string` | SecureString | processor, finalizer |

**Note:** `api_key` and `api_secret` are deprecated. Only `access_token` is used (GraphQL Admin API migration completed in V9).

#### Access Pattern

Lambda reads secrets at cold start using `boto3` SSM client. Secrets are cached in Lambda execution context (not re-read on every invocation). IAM role grants `ssm:GetParameter` on specific paths only.

#### Terraform Pattern

Terraform creates the parameter paths with `PLACEHOLDER` values and `lifecycle { ignore_changes = [value] }`. **Terraform never sets real secret values** — this prevents secrets from appearing in Terraform state. Set values manually via AWS Console or CLI after `terraform apply`.

#### Alternatives Rejected

- **AWS Secrets Manager:** $0.40/secret/month vs. free standard SSM. Rotation not needed.
- **Lambda environment variables:** Visible in Lambda console; can leak in stack traces.
- **.env files in repo:** Obvious security risk.
- **HashiCorp Vault:** Massive operational overhead for solo engineer.

#### Secret Rotation

1. Update the SSM parameter value.
2. Trigger Lambda redeployment to clear cached value.

---

## 6. Schema Architecture (Three Layers)

### Overview

Three layers decouple internal models from vendor instability. V1 builds Layers 1 and 2. Layer 3 is designed but deferred to Phase 2.

```
V1 data flow:
  Shopify API → S3 (Layer 1: raw) → Processor → Postgres (Layer 2: shopify.orders)

Future data flow (Phase 2+):
  Shopify API → S3 (Layer 1) → Processor → Postgres (Layer 2: shopify.orders)
                                          → Postgres (Layer 3: normalized.commerce_orders)
```

### Layer 1: Raw Vendor Schema

- **What:** Exact JSON payload from vendor API or webhook, unmodified.
- **Where stored:** S3 (as-is). Pydantic model in `schemas/raw/` (loose/permissive).
- **Validation:** Permissive. `extra = "allow"`. Heavy use of `Optional`. Never fail on unknown fields.
- **Versioning:** Implicit via `api_version` in stream spec.
- **Rule:** Never transform data before writing to S3. The raw layer IS the vendor's schema.

```python
class ShopifyOrderRaw(BaseModel):
    class Config:
        extra = "allow"   # Don't fail on unknown fields

    id: int
    email: Optional[str]
    # ... all fields from vendor API docs, all Optional
```

### Layer 2: Source Canonical Schema

- **What:** Our typed, validated representation of a vendor entity. Vendor-specific but under our control.
- **Where stored:** Pydantic model in `schemas/canonical/` (strict validation). Postgres tables under `shopify.*`.
- **Validation:** Strict. Only fields we care about. Correct types and nullability rules.
- **Versioning:** Explicit — e.g., `shopify.order.v3`. Version in module name and in stream spec.
- **Rule:** Can only reference fields that exist in the raw vendor schema. No invented fields.

```python
class ShopifyOrderV3(BaseModel):
    id: int
    store_id: str
    email: Optional[str]
    created_at: datetime
    updated_at: datetime
    # ... only fields we actually need
```

### Layer 3: Provider-Agnostic Normalized Schema (Deferred — Phase 2)

- **What:** Business entities that abstract away vendor. E.g., `commerce_order` populated from Shopify, WooCommerce, etc.
- **Where stored (future):** `schemas/normalized/`. Postgres `normalized.*` schema.
- **Why deferred:** Normalization is only meaningful with 2+ providers. Building for one = speculative abstraction that's likely wrong when the second provider arrives.
- **When to build:** Phase 2 trigger — "we are adding a second provider" or "we need cross-provider queries."
- **Risk accepted:** Downstream consumers in V1 query `shopify.orders` directly. They'll need to migrate to `normalized.commerce_orders` in Phase 2. Acceptable because consumer count is small and the migration is planned.

### Transform Functions

A pure function per stream: `raw_model → canonical_model`. These are the **only stream-specific code** in the system (besides Pydantic models).

```python
def transform_shopify_order(raw: ShopifyOrderRaw, store_id: str) -> ShopifyOrderV3:
    return ShopifyOrderV3(
        id=raw.id,
        store_id=store_id,
        email=raw.email,
        # ... map fields, coerce types, extract nested data
    )
```

Transform functions:
- Map field names (vendor naming → our naming)
- Coerce types (string dates → datetime objects)
- Extract nested fields (line items from order)
- Apply business rules (e.g., ignore test orders)

### Schema Evolution Strategy

When vendor changes API or we need new fields:
1. Create a new Pydantic model version (e.g., `shopify.order.v4`).
2. Update stream spec to reference new version.
3. Processor uses `schema_version` from stream spec to select correct model.
4. Old records in Postgres carry their `schema_version` — queryable.
5. If needed, replay old S3 data through the new schema version.

### Schema Registry (`src/shared/schema_registry.py`)

Routes `(source, stream)` → models + transform:

```python
SCHEMA_REGISTRY = {
    ("shopify", "orders"): SchemaEntry(
        raw_model=ShopifyOrderRaw,
        raw_page_model=ShopifyOrdersPageRaw,
        canonical_model=ShopifyOrderV3,
        transform=transform_shopify_order,
        pg_table="shopify.orders",
        version="shopify.order.v3",
        record_list_field="orders",
        idempotency_field_map={"order_id": "id", "updated_at": "updated_at"},
    ),
}
```

Key `SchemaEntry` fields:
- **`raw_page_model`** — wrapper model holding a list of raw records (a page of API results)
- **`record_list_field`** — field name on the page model containing the record list
- **`version`** — must match `schema_version` in stream YAML
- **`idempotency_field_map`** — maps stream YAML idempotency key names to canonical model field names

### Alternatives Rejected

- **Two layers (raw + normalized, no source canonical):** Normalization mapping must handle raw vendor quirks directly — fragile.
- **Schema registry service (Confluent, Glue):** Pydantic models in git ARE the schema registry. Service adds operational overhead without value at <20 schemas.
- **JSON Schema instead of Pydantic:** Pydantic gives runtime validation, IDE support, serialization, and docs in one tool.

---

## 7. Stream YAML Specification

Every data stream is defined by a YAML file in `streams/`. Read by Terraform (infrastructure), Lambdas (behavior), and humans/AI (understanding).

### Full Schema

```yaml
apiVersion: streams/v1              # [R] Must be "streams/v1"

# --- Identity ---
source: string                      # [R] Vendor identifier (e.g., "shopify", "recharge")
stream: string                      # [R] Entity name within source (e.g., "orders")
display_name: string                # [R] Human-readable name

# --- Connection ---
mode: enum                          # [R] One of: graphql, rest, webhook, graphql+webhook, rest+webhook
api_version: string                 # [R] Vendor API version string (e.g., "2024-01")
endpoint: string                    # [O] Override URL path. Default: derived from mode + source.

# --- Schedule ---
schedule: string                    # [R for polling modes] EventBridge expression
                                    #     e.g., "rate(5 minutes)", "cron(0/15 * * * ? *)"
backfill_enabled: boolean           # [O] Default: false

# --- Schema ---
schema_version: string              # [R] Source canonical schema ref (e.g., "shopify.order.v3")
normalizes_to: string               # [O] Provider-agnostic target (Phase 2 intent only)

# --- Identity & Idempotency ---
idempotency_key: list[string]       # [R] Fields that uniquely identify a record version.
                                    #     MUST include a version/time dimension.
cursor_field: string                # [R for polling] Field used for incremental cursor.
cursor_type: enum                   # [R for polling] One of: datetime, integer, string

# --- Operational ---
freshness_sla_minutes: integer      # [R] Alert if data older than this. Minimum: 5.
max_pages_per_run: integer          # [O] Safety valve. Default: 500.
page_size: integer                  # [O] Items per API page. Default: 50.
rate_limit_bucket: string           # [O] Shared rate limit group. Default: source name.

# --- Webhook (required if mode includes "webhook") ---
webhook_topics: list[string]        # [O] Vendor webhook topics. e.g., ["orders/create", "orders/updated"]
hmac_header: string                 # [O] Header with HMAC signature.
                                    #     Default for Shopify: "X-Shopify-Hmac-Sha256"

# --- Metadata ---
owner: string                       # [R] Team or person responsible.
tags: list[string]                  # [O] Arbitrary tags.
```

### Validation Rules

1. `apiVersion` must be `streams/v1`.
2. `source` and `stream`: lowercase alphanumeric + hyphens only.
3. `mode` must be a valid enum value.
4. If mode includes polling: `schedule`, `cursor_field`, `cursor_type` are required.
5. If mode includes webhook: `webhook_topics` should be specified (warning if missing).
6. `idempotency_key`: at least one field, should include a temporal dimension.
7. `freshness_sla_minutes`: >= 5.
8. `schema_version`: must match a registered Pydantic model.

### Concrete Example: Shopify Orders

```yaml
apiVersion: streams/v1

source: shopify
stream: orders
display_name: Shopify Orders

mode: graphql+webhook
api_version: "2024-01"

schedule: rate(5 minutes)
backfill_enabled: false

schema_version: shopify.order.v3
normalizes_to: commerce_order

idempotency_key:
  - order_id
  - updated_at
cursor_field: updated_at
cursor_type: datetime

freshness_sla_minutes: 10
max_pages_per_run: 200
page_size: 50
rate_limit_bucket: shopify

webhook_topics:
  - orders/create
  - orders/updated
hmac_header: X-Shopify-Hmac-Sha256

owner: platform
tags:
  - commerce
  - critical
```

### How Stream Specs Are Consumed

| Consumer | Fields Read | Used for |
|----------|------------|----------|
| **Terraform** | `mode`, `schedule`, `webhook_topics` | Provision Step Functions, EventBridge, API Gateway |
| **shopify-poller** | `api_version`, `cursor_field`, `page_size`, `max_pages_per_run` | API call config |
| **processor** | `schema_version`, `idempotency_key` | Schema routing, idempotency check |
| **run-finalizer** | `freshness_sla_minutes` | Freshness computation and alerting |
| **webhook-receiver** | `hmac_header`, `webhook_topics` | HMAC validation, routing |

### Evolving the Spec

1. Add the field with a default value (backward compatible).
2. Update the Pydantic `StreamConfig` model in `src/shared/stream_config.py`.
3. Update this document.
4. If the field changes infrastructure behavior, update the Terraform module.
5. Bump `apiVersion` only for breaking changes (fields removed or semantics changed).

---

## 8. Lambda Runtime Roles & Contracts

All contracts live in `src/shared/contracts.py` as Pydantic models. These are the interface boundary — every Lambda input/output must conform exactly.

### Lambda Roles Overview

| Role | What it does | Count | Invoked by |
|------|-------------|-------|------------|
| **initializer** | Load config, read cursor, create run record | 1 | Step Functions |
| **shopify-poller** | Fetch one page from Shopify API, write raw to S3 | 1 | Step Functions |
| **webhook-receiver** | Validate HMAC, write raw to S3, enqueue SQS | 1 | API Gateway |
| **processor** | Read S3, validate, transform, upsert Postgres | 1 | SQS or Step Functions |
| **run-finalizer** | Close run record, compute freshness, emit metrics | 1 | Step Functions |
| **replay-worker** (Phase 2) | Re-read S3, re-invoke processor | 1 | Step Functions |

Total: **4 Lambdas for V1**, 5 for Phase 2.

Poller Lambdas are **provider-specific** (know the provider's auth and pagination). Processor, finalizer, and replay-worker are **fully generic** — one each, ever.

---

### initializer

**Purpose:** Load stream config, read current cursor, create run record, seed Step Function state.

```python
class InitializerInput(BaseModel):
    source: str
    stream: str
    store_id: str
    max_pages: Optional[int]
    cursor_override: Optional[str]
    max_pages_override: Optional[int]

class InitializerOutput(BaseModel):
    run_id: str
    stream_config: StreamConfig
    store_id: str
    cursor: Optional[str]
    checkpoint_cursor: Optional[str]
    page_number: int
    total_records: int
    total_pages: int
    max_pages: int
    status: str
```

**Behavior:**
1. Loads stream config from `streams/`.
2. Reads current cursor from DynamoDB unless `cursor_override` is provided.
3. Creates run record in DynamoDB with status `running`.
4. Returns initial state accumulator for polling Step Function.
5. Seeds both `cursor` (poller pagination state) and `checkpoint_cursor` (durable datetime checkpoint for freshness/finalization).

---

### shopify-poller

**Purpose:** Fetch one page from Shopify GraphQL API, write raw to S3, return cursor.

```python
class PollerInput(BaseModel):
    run_id: str
    stream_config: StreamConfig
    store_id: str
    cursor: Optional[str]   # None on first page
    page_number: int         # 1-indexed

class PollerOutput(BaseModel):
    run_id: str
    s3_key: str
    record_count: int
    next_cursor: Optional[str]            # Opaque pagination state for next page
    checkpoint_cursor: Optional[str]      # Last order.updated_at seen in this page
    has_more: bool                        # Explicit boolean for Step Function Choice
    http_status: int
    rate_limit_remaining: Optional[int]
    rate_limit_reset_at: Optional[datetime]
```

**Behavior (in order):**
1. Calls Shopify GraphQL Admin API for one page using `cursor` from input.
2. Writes raw response body to S3 (full JSON, gzipped) using standard key pattern.
3. Updates DynamoDB run record with page count.
4. Returns both `next_cursor` (in-run pagination) and `checkpoint_cursor` (for finalization).
5. Does NOT decide whether to continue — Step Function decides.
6. On 429: Returns with `has_more=True` and `rate_limit_reset_at` populated. Does not retry.
7. On 5xx: Raises exception → Step Function retry policy handles retries (3 attempts, exponential backoff: 2s, 4s, 8s).
8. On 2xx with empty results: Returns `has_more=False`, `record_count=0`.

**Does NOT:** Process or transform data, write to Postgres, make pagination decisions, implement retry logic.

**Shopify API choice — GraphQL (ADR-008):** GraphQL is the default because:
- Shopify's strategic direction (actively deprecating REST)
- Stable cursor-based pagination (vs. fragile page-number REST pagination)
- Field selection reduces payload and storage costs
- Cost-based rate limiting model (`X-Shopify-Shop-Api-Call-Limit`) is more predictable
- Nested resources (order + line items + fulfillments) in one request

Use REST only if a specific endpoint doesn't exist in GraphQL yet. Set `mode: rest` in stream spec.

---

### webhook-receiver

**Purpose:** Validate webhook HMAC, write raw to S3, enqueue for processing.

**Input:** Raw API Gateway event (HTTP request from Shopify).
**Output:** HTTP 200 (always, after HMAC validation).

**Side effects:**
1. Validates HMAC signature using secret from SSM.
2. Writes raw request body to S3 (gzipped) using webhook key pattern.
3. Sends SQS message:

```python
class WebhookSQSMessage(BaseModel):
    source: str              # "shopify"
    stream: str              # Derived from webhook topic (e.g., "orders")
    topic: str               # "orders/updated"
    store_id: str            # From Shopify headers
    s3_key: str              # Where raw was written
    webhook_id: str          # From X-Shopify-Webhook-Id header
    received_at: datetime
    idempotency_key: str     # webhook_id (for SQS dedup)
```

4. Records delivery in DynamoDB webhook log.

**Behavior rules:**
1. Returns 200 immediately after S3 write + SQS send. Fast path only.
2. On HMAC failure: Logs warning, returns 200 (NOT 4xx — Shopify retries on non-200, creating noise). Does NOT write to S3 or SQS.
3. Does ZERO business logic. No parsing beyond extracting headers.

**Does NOT:** Process, transform, or validate payload body. Write to Postgres. Call any other APIs.

---

### processor

**Purpose:** Read raw from S3, validate schema, transform to canonical, upsert to Postgres.

```python
class ProcessorInput(BaseModel):
    source: str              # "shopify"
    stream: str              # "orders"
    s3_key: str              # S3 key of raw payload
    run_id: Optional[str]    # None for webhook-triggered
    store_id: str
    trigger: str             # "poll" | "webhook" | "replay"

class ProcessorOutput(BaseModel):
    records_processed: int   # Successfully upserted
    records_skipped: int     # Skipped (idempotency)
    records_failed: int      # Failed validation or upsert
    schema_version: str      # Which schema version was used
    errors: list[str]        # Error messages (empty on full success)
```

**Behavior (in order):**
1. Read raw payload from S3.
2. Determine schema from `(source, stream)` → look up in schema registry.
3. Parse into raw vendor Pydantic model (loose/permissive).
4. Transform to source canonical Pydantic model (strict).
5. For each record:
   - a. Compute idempotency key hash.
   - b. Check DynamoDB. If key exists → increment `records_skipped`, continue.
   - c. Upsert to Postgres (single transaction per batch).
   - d. Insert history record if data changed.
   - e. Write idempotency key to DynamoDB **AFTER** successful Postgres write.
6. Emit metrics (records processed, skipped, failed).
7. Return output.

**Critical invariant:** The processor is **stateless and deterministic**. Same S3 input → same Postgres output (modulo idempotency skips). This is what makes replay safe.

**Does NOT:** Call vendor APIs. Manage cursors or run state. Decide what to process next.

**Schema routing:** Processor receives `(source, stream)` and looks up the correct Pydantic models and transform function in `schema_registry.py`. Adding a new stream = add schema registry entry + Pydantic models + transform function. No change to processor code.

---

### run-finalizer

**Purpose:** Close run record, compute freshness, emit metrics.
Always runs — even after partial failure.

```python
class FinalizerInput(BaseModel):
    run_id: str
    stream_config: StreamConfig
    store_id: str
    total_pages: int
    total_records: int
    status: str              # "success" | "partial_failure" | "error"
    error_message: Optional[str]
    final_cursor: Optional[str]   # Last successful cursor value

class FinalizerOutput(BaseModel):
    run_id: str
    freshness_lag_minutes: float
    status: str
```

**Behavior:**
1. Updates DynamoDB run record to terminal state.
2. If status is `success` or `partial_failure`, updates cursor checkpoint in DynamoDB.
3. Computes freshness: `now() - max(cursor_value)`.
4. Publishes CloudWatch custom metrics: `streams/freshness_lag_minutes`, `streams/run_duration_seconds`.
5. If freshness exceeds SLA from stream config, CloudWatch alarm triggers.

**Does NOT:** Process data. Call vendor APIs. Write to Postgres.

---

### replay-worker (Phase 2)

**Purpose:** Re-process raw payloads from S3. Never re-calls vendor APIs.

```python
class ReplayInput(BaseModel):
    replay_id: str
    source: str
    stream: str
    store_id: str
    s3_keys: list[str]   # Explicit list of raw payloads to reprocess
    reason: str          # Why this replay was requested

class ReplayOutput(BaseModel):
    replay_id: str
    records_reprocessed: int
    records_failed: int
    errors: list[str]
```

**Behavior:**
1. For each S3 key, invoke processor with `trigger="replay"`.
2. Record per-key results in DynamoDB replay record.
3. Idempotency keys ensure no duplicates (processor handles this).
4. Return aggregate results.

**Does NOT:** Call vendor APIs (replay is always from S3). Modify raw S3 data.

**V1 manual replay:** In V1, replay is manual — identify S3 keys, invoke processor Lambda directly with the S3 key, verify output. No replay Step Function until Phase 2.

---

## 9. Orchestration

### Polling: AWS Step Functions

Used because polling requires:
- Pagination (multiple pages in sequence)
- Rate limit handling (wait on 429)
- Retry with backoff (on 5xx)
- Checkpointing (progress on partial failure)
- Long-running flows (backfills can run for hours)
- Explicit state transitions (visible in console, debuggable)

**EventBridge:** `rate(5 minutes)` → triggers Step Function

### Webhooks: API Gateway → Lambda → SQS → Lambda

Used because webhooks require:
- Fast acknowledgment (Shopify retries on slow responses)
- No complex orchestration (receive → store → enqueue → process)
- Decoupling (SQS absorbs spikes, provides retry + DLQ)

Webhook-receiver: validate HMAC, write raw to S3, send SQS message → return 200. Processor picks up from SQS asynchronously.

### Decision Guide: Step Functions vs SQS → Lambda

| Situation | Use |
|-----------|-----|
| Multi-page API polling | Step Functions |
| Webhook receive + process | SQS → Lambda |
| Replay from S3 | Step Functions (Phase 2) |
| Backfill (wide-window poll) | Step Functions (reuse poll workflow) |
| One-shot triggered processing | SQS → Lambda |
| Fan-out to many records | SQS → Lambda |
| >100 executions/minute | SQS → Lambda (Step Functions too expensive) |

**Default:** If it paginates or needs durable state → Step Functions. Otherwise → SQS → Lambda.

---

### Incremental Poll State Machine

```
                ┌──────────────┐
                │  Initialize  │
                └──────┬───────┘
                       │
                ┌──────▼───────┐
          ┌─────│  FetchPage   │◄─────────┐
          │     └──────┬───────┘          │
          │            │                  │
          │     ┌──────▼───────┐          │
          │     │ ProcessPage  │          │
          │     └──────┬───────┘          │
          │            │                  │
          │     ┌──────▼───────┐          │
          │     │  CheckMore   │──yes──┐  │
          │     └──────┬───────┘       │  │
          │            │ no    ┌───────▼──┴──┐
          │            │       │ ThrottleWait │
          │     ┌──────▼─────┐ └────────────┘
          │     │  Finalize  │
          │     └────────────┘
          │
          │  ┌────────────────────┐
          └──│ HandleFetchError   │──→ Finalize
             └────────────────────┘
             ┌─────────────────────┐
             │ HandleProcessError  │──→ CheckMore
             └─────────────────────┘
```

#### State Definitions

**Initialize** (Task — Lambda)
- Loads stream config, reads cursor from DynamoDB (or uses `cursor_override`)
- Creates run record in DynamoDB (status: `running`)
- Sets `page_number = 1`
- Output: `{ run_id, stream_config, store_id, cursor, checkpoint_cursor, page_number: 1, total_records: 0 }`

**FetchPage** (Task → shopify-poller Lambda)
- Fetches one page from vendor API. Writes raw to S3.
- Input: PollerInput. Output: PollerOutput.
- Retry: 3 attempts, exponential backoff (2s, 4s, 8s) on 5xx
- Catch: All errors → HandleFetchError

**ProcessPage** (Task → processor Lambda)
- Reads S3 payload, validates, transforms, upserts Postgres.
- Input: ProcessorInput. Output: ProcessorOutput.
- Catch: All errors → HandleProcessError (log, continue — do NOT abort run)

**CheckMore** (Choice)
- If `has_more == true` AND `page_number < max_pages_per_run` → ThrottleWait
- Else → Finalize (PrepareFinalize state sets `status="success"` and normalizes field names first)

**ThrottleWait** (Wait)
- If `rate_limit_reset_at` is set → wait until that timestamp
- Else → fixed wait of 1 second
- Then: FetchPage (with incremented page_number and updated cursor)
- **Critical:** `rate_limit_reset_at` must be carried as a top-level field in state; if dropped by UpdateAccumulator, ThrottleWait will crash.

**HandleFetchError** (Pass or Task)
- Logs the error. Sets status to `partial_failure`.
- Then: Finalize

**HandleProcessError** (Pass or Task)
- Logs the failed S3 key. Increments error counter. Does NOT abort the run.
- Then: CheckMore (continue fetching remaining pages)

**Finalize** (Task → run-finalizer Lambda)
- Closes run record. Updates cursor. Computes freshness. Emits metrics.
- Input: FinalizerInput. Output: FinalizerOutput.
- **Always runs** — even on partial failure.

#### Timeouts

- **Incremental poll:** 30 minutes max execution time
- **Backfill:** 4 hours max (via input override)
- On timeout: Step Function fails → CloudWatch alarm fires → next run picks up from last checkpoint

#### State Accumulator

Step Functions passes state via execution context:

```json
{
  "run_id": "abc-123",
  "stream_config": { "..." : "..." },
  "store_id": "mystore",
  "cursor": "{\"checkpoint\":\"2024-03-15T00:00:00Z\",\"page_cursor\":\"opaque\"}",
  "checkpoint_cursor": "2024-03-15T00:00:00Z",
  "page_number": 3,
  "total_records": 150,
  "total_pages": 3,
  "status": "running",
  "rate_limit_reset_at": "2024-03-15T10:00:05Z",
  "last_fetch_result": { "..." : "..." },
  "last_process_result": { "..." : "..." }
}
```

#### Where State Lives

| State | Stored in | Lifetime |
|-------|-----------|----------|
| Current page/cursor during run | Step Function execution context | Duration of execution |
| Cursor checkpoint (between runs) | DynamoDB `CURSOR#current` | Permanent |
| Run metadata | DynamoDB `RUN#{run_id}` | Permanent |
| Per-page raw data | S3 | Permanent (lifecycle to Glacier) |
| Step Function execution history | AWS-managed | 90 days |

#### Critical: Checkpoint Timing

Cursor checkpoint is updated in **Finalize only**, not after every page. If a run fails mid-way, the next run restarts from the last completed run's cursor. This may re-fetch some pages, but idempotency ensures no duplicates. Simpler and safer than per-page checkpointing.

---

### Replay State Machine (Phase 2)

```
Initialize → ForEachKey (Map) → [ ProcessKey → RecordResult ] → Finalize
```

- **Initialize:** Validates replay request. Records replay start in DynamoDB.
- **ForEachKey:** Map state, sequential (`MaxConcurrency: 1`) — avoids hammering Postgres.
  - Why Map (not loop): Purpose-built for iterating lists. Per-item error isolation. Built-in tracking.
- **ProcessKey:** Task → processor Lambda with `trigger="replay"`.
- **RecordResult:** Updates replay record in DynamoDB with per-key results.
- **Finalize:** Marks replay complete. Logs aggregate results.

---

### Backfill Strategy

**Backfill reuses the incremental poll state machine.** No separate state machine.

```json
{
  "cursor_override": "2020-01-01T00:00:00Z",
  "max_pages_override": 5000,
  "timeout_override": "PT4H"
}
```

Initialize uses `cursor_override` instead of reading from DynamoDB. Pagination proceeds normally. Cursor checkpoint updated to last fetched record on completion.

**Consider dedicated backfill mechanism (Phase 3+) only if:**
- Backfills regularly exceed 5000 pages
- Shopify Bulk API would be significantly more efficient
- Multiple concurrent backfills are needed

---

### Replay Model: Why Never Re-Call Vendor APIs (ADR-014)

Replay always re-reads from S3. Never re-calls vendor APIs because:

1. **Immutability:** Raw S3 payload = what vendor returned at that point in time. Re-calling returns current state (different).
2. **Rate limits:** Replay shouldn't consume rate limit budget from incremental sync.
3. **Vendor instability:** API may be down exactly when replay is needed.
4. **Cost:** S3 reads are essentially free. API calls are rate-limited.
5. **Determinism:** Same input → same output. Re-calling introduces a variable.

Every Postgres table's `raw_s3_key` column is the replay link.

---

## 10. Idempotency Strategy

Two-layer idempotency: DynamoDB for fast dedup, Postgres constraints as safety net.

### Layer 1: DynamoDB Fast Check

Before processing a record, the processor checks DynamoDB for the idempotency key:

```python
import hashlib

def compute_idempotency_key(record: dict, key_fields: list[str]) -> str:
    parts = [str(record[field]) for field in key_fields]
    key_input = ":".join(parts)
    return hashlib.sha256(key_input.encode()).hexdigest()

# Example for orders (key_fields = ["order_id", "updated_at"]):
# key_input = "5678901234:2024-03-15T10:00:00Z"
# key_hash = "a1b2c3d4..."
```

- If key exists in DynamoDB → skip. Return `records_skipped` in output.
- If key doesn't exist → process, then write key to DynamoDB.
- DynamoDB TTL: 30 days.

**Why DynamoDB first:** <5ms single-item reads. Avoids unnecessary S3 reads, Pydantic validation, and Postgres round-trips for already-processed records.

### Layer 2: Postgres UNIQUE Constraint (Safety Net)

```sql
CREATE TABLE shopify.orders (
    ...
    UNIQUE (id, store_id)   -- Or PRIMARY KEY
);

-- Upsert handles gracefully:
INSERT ... ON CONFLICT (id, store_id) DO UPDATE SET ...
WHERE shopify.orders.updated_at < EXCLUDED.updated_at;
```

If DynamoDB misses a duplicate (TTL expiry, race condition), Postgres prevents true duplicates.

### Why Two Layers

| Scenario | DynamoDB catches? | Postgres catches? |
|----------|--------------------|-------------------|
| Normal retry (within 30 days) | Yes (fast skip) | Would also catch |
| Replay after 30 days (TTL expired) | No | Yes (upsert) |
| Race condition (concurrent processors) | Possible miss | Yes (constraint) |
| Webhook + poll deliver same record | Yes (fast skip) | Would also catch |

DynamoDB = **performance optimization** (avoid unnecessary work).
Postgres = **correctness guarantee** (no duplicates ever).

### Critical Idempotency Key Design Rules

1. The `idempotency_key` in stream spec MUST include a **version dimension** (like `updated_at`). A key of just `order_id` would skip processing updated versions of the same order.
2. The processor MUST write the DynamoDB idempotency key **AFTER** successful Postgres upsert, not before — ensures we don't mark something as processed if Postgres write fails.

### History Table Idempotency

```sql
-- Only insert history if the record actually changed
INSERT INTO shopify.orders_history (order_id, store_id, snapshot, changed_at, run_id)
SELECT ... WHERE NOT EXISTS (
    SELECT 1 FROM shopify.orders_history
    WHERE order_id = $1 AND store_id = $2 AND changed_at = $3
);
```

### Alternatives Rejected

- **Postgres-only:** Every record requires a Postgres round-trip even if already processed. At high volume, adds unnecessary DB load.
- **Idempotency key without TTL:** Table grows forever. 30 days is generous for replay/retry window.
- **Content-based deduplication (hash payload):** Fragile — vendors can add metadata fields that change the hash without changing business data.

---

## 11. Observability & Operability

CloudWatch is the only observability tool for V1 (ADR-015). No Datadog, Grafana, New Relic.

**CloudWatch-only rationale:** Zero additional infrastructure, no additional vendor, sufficient for V1 scale (5-10 Step Function executions/hour, thousands of records/day), one engineer.

### Custom Metrics

All emitted via `boto3` CloudWatch client. Namespace: `DataStreams`.

| Metric | Dimensions | Emitted by | What it tells you |
|--------|-----------|------------|-------------------|
| `streams/run_duration_seconds` | source, stream, store_id | run-finalizer | How long polling runs take. Trend up = problem. |
| `streams/freshness_lag_minutes` | source, stream, store_id | run-finalizer | How stale data is. **The single most important metric.** |
| `streams/records_processed` | source, stream, store_id | processor | Throughput. Trend to zero = pipeline stopped. |
| `streams/records_skipped` | source, stream, store_id | processor | Idempotency dedup rate. High = overlapping sources (ok). |
| `streams/records_failed` | source, stream, store_id | processor | Error rate. Any non-zero = investigate. |
| `streams/http_status` | source, stream, status_code | shopify-poller | API health. Watch 429 and 5xx rates. |
| `streams/pages_fetched` | source, stream, store_id | shopify-poller | Pagination volume per run. |
| `streams/schema_validation_errors` | source, stream, schema_version | processor | Schema drift. Non-zero = vendor changed something. |

**Important dimension note:** All three dimensions (source, stream, store_id) must be emitted consistently. Alarms and dashboards must use the same dimensions as the code — a mismatch causes alarms to never fire (V8 bug).

### Native AWS Metrics (Free)

- **Lambda:** Invocations, Errors, Duration, Throttles, ConcurrentExecutions
- **Step Functions:** ExecutionsStarted, ExecutionsFailed, ExecutionsSucceeded, ExecutionTime
- **SQS:** NumberOfMessagesSent, NumberOfMessagesReceived, ApproximateNumberOfMessagesVisible, ApproximateAgeOfOldestMessage
- **DynamoDB:** ConsumedReadCapacityUnits, ConsumedWriteCapacityUnits, ThrottledRequests

### Alarms

**SNS topic:** `data-streams-alerts-{env}` → email (V1). Add Slack webhook in Phase 2.

| Alarm | Condition | Evaluation | Severity |
|-------|-----------|------------|----------|
| **Freshness SLA breach** | `freshness_lag_minutes > freshness_sla_minutes` | 2 consecutive datapoints (10 min) | Critical |
| **Run failure** | Step Function execution status = FAILED | Any occurrence | Critical |
| **DLQ depth** | SQS DLQ `ApproximateNumberOfMessagesVisible > 0` | 1 datapoint | Warning |
| **Processor error rate** | `records_failed / records_processed > 5%` | 15-minute window | Warning |
| **429 storm** | `http_status{status_code=429} > 10` in 5 minutes | 1 datapoint | Informational |

**Response priority:**
- **Critical:** Investigate within 1 hour. Data not flowing or dangerously stale.
- **Warning:** Investigate within 4 hours. Degraded but data still flowing.
- **Informational:** Review at next working session. No immediate action needed.

### Dashboard

**Name:** `data-streams-{env}` — one dashboard for all streams.

| Widget | Type | Shows |
|--------|------|-------|
| Freshness by stream | Line graph | `freshness_lag_minutes` for all streams, with SLA threshold |
| Run outcomes | Stacked bar | Step Function executions by status per day |
| Record throughput | Line graph | `records_processed` per stream over time |
| Error rate | Line graph | `records_failed` per stream over time |
| API health | Stacked area | `http_status` by status code over time |
| SQS queue depth | Line graph | Messages visible in processing queue and DLQ |
| Run duration | Line graph | `run_duration_seconds` per stream over time |

### Structured Logging

All Lambdas use `structlog` for structured JSON. Every log line includes:

```json
{
  "level": "info",
  "timestamp": "2024-03-15T10:01:00Z",
  "source": "shopify",
  "stream": "orders",
  "store_id": "mystore",
  "run_id": "550e8400-...",
  "lambda_name": "data-streams-processor",
  "message": "Record upserted successfully",
  "order_id": 5678901234,
  "s3_key": "shopify/orders/..."
}
```

**Log levels:**
- `debug` — Per-record detail. Only enable when debugging.
- `info` — Per-page or per-batch summaries. Standard operating level.
- `warning` — Recoverable issues: HMAC failure, skipped record, rate limit hit.
- `error` — Unrecoverable issues: validation failure, Postgres error, unhandled exception.

**Log retention:** Dev: 7 days. Prod: 30 days.

**CloudWatch Logs Insights examples:**
```
# Find all errors for a specific run
fields @timestamp, @message
| filter run_id = "550e8400-..."
| filter level = "error"
| sort @timestamp asc

# Find all 429s in the last hour
fields @timestamp, source, stream, http_status
| filter http_status = 429
| stats count() by source, stream
```

### Runbooks

Stored in `runbooks/`.

**`stale-data.md` — Freshness Alarm:**
1. Check dashboard — one stream or all streams?
2. Check Step Functions — are executions running? Failing? Stuck?
3. If not starting: check EventBridge rule. Is schedule enabled?
4. If failing: check execution history. What state failed?
5. If Shopify is down: check status.shopify.com. Wait. Data will catch up.
6. If cursor stuck: check DynamoDB `CURSOR#current`. Is `cursor_value` progressing?
7. Manual recovery: start Step Function execution manually with current cursor.

**`failed-run.md` — Step Function Failure:**
1. Open failed execution in Step Functions console.
2. Identify which state failed and read error output.
3. Common causes:
   - **Auth expired:** Shopify API key rotated. Update SSM parameter. Redeploy poller.
   - **Schema changed:** Pydantic validation error. Check raw S3 payload. Update schema.
   - **Postgres down:** Check RDS status. Check security group. Check connection limits.
   - **Lambda timeout:** Check if page_size too large or API slow. Increase timeout.
4. After fixing: next scheduled run picks up from last checkpointed cursor.

**`dlq-messages.md` — Dead Letter Queue:**
1. Read DLQ message(s) — contains S3 key and stream identifier.
2. Read corresponding S3 payload.
3. Check processor logs (filter by `s3_key`).
4. Common causes:
   - Schema validation: vendor changed payload format. Update Pydantic model.
   - Postgres constraint violation: check upsert logic.
   - Timeout: payload too large. Increase Lambda timeout or reduce batch size.
5. After fixing: replay failed S3 keys through processor.
6. Purge DLQ after confirming all messages reprocessed.

### Operational Review Cadence

- **Daily (2 minutes):** Glance at CloudWatch dashboard. Freshness green? Errors zero?
- **Weekly (15 minutes):** Review run metrics trends. 429 rate increasing?
- **Monthly (30 minutes):** Review DynamoDB/S3/Postgres costs. TTLs working?

### When to Add a Third-Party Observability Tool

Add Datadog/Grafana only when:
- 2+ engineers need to collaborate on incidents
- Need cross-service distributed tracing
- CloudWatch dashboard limitations become painful
- Need alerting more sophisticated than CloudWatch alarms

Expected: Phase 3 (after first hire).

---

## 12. Failure Modes & Recovery

### Summary Matrix

| # | Failure | Data Loss? | Auto-Recovery? | Manual Steps? |
|---|---------|-----------|----------------|---------------|
| 1 | 429 Rate Limit | No | Yes (wait + retry) | Only if chronic |
| 2 | Vendor 5xx | No (delayed) | Yes (next run) | Only if prolonged |
| 3 | Schema Change | No (raw in S3) | No | Update model + replay |
| 4 | Postgres Connections | No (DLQ) | Partial (retry) | Adjust concurrency |
| 5 | DynamoDB Throttle | No | Mostly (auto-scale) | Investigate root cause |
| 6 | Zombie Run | No (cursor safe) | Yes (timeout) | Stop execution |
| 7 | Duplicate Processing | No | Yes (upsert) | Fix key formula if wrong |
| 8 | Webhook HMAC | No (polling covers) | No | Update secret |
| 9 | S3 Write Fail | Temporary | Yes (retry) | Fix IAM if needed |
| 10 | Terraform State Drift | No | No | Import/remove state |

### Detailed Failure Modes

**1. Shopify API Rate Limited (429)**

- **Symptom:** Poller Lambda returns HTTP 429. `streams/http_status{status_code=429}` spikes.
- **Containment:** Poller returns `rate_limit_reset_at`. Step Function Wait state pauses until reset. No data loss, no error state.
- **Recovery:** Automatic. If chronic, reduce `page_size` or widen `schedule` in stream spec.

**2. Shopify API 5xx (Vendor Outage)**

- **Symptom:** Poller throws exception. Step Function retries 3 times, then HandleFetchError → Finalize as `partial_failure`.
- **Containment:** Retry policy (3 attempts, exponential backoff). Freshness alarm may fire.
- **Recovery:** Automatic on next scheduled run. Next run starts from last checkpointed cursor. No data loss — just delayed data.

**3. Shopify Schema Change Without Notice**

- **Symptom:** Pydantic validation errors in processor. `schema_validation_errors` spikes. Records land in DLQ.
- **Containment:** Raw payload is already in S3 (captured before validation). Processor logs error, increments `records_failed`, sends to DLQ. Other records in same batch may still process.
- **Recovery:**
  1. Read raw S3 payload to understand what changed.
  2. Update Pydantic raw model.
  3. Update canonical model and transform if needed.
  4. Deploy updated processor.
  5. Replay failed records from S3 (DLQ contains S3 keys).
- **Why safe:** Immutable raw storage means nothing is lost.

**4. Postgres Connection Exhaustion**

- **Symptom:** Processor fails with connection timeout or "too many connections".
- **Cause:** Too many concurrent Lambda invocations; each opens a new connection.
- **Containment:** Lambda reserved concurrency (e.g., max 5). Failed SQS messages retry → DLQ.
- **Recovery:**
  1. Short-term: Reduce Lambda concurrency or SQS batch size.
  2. Medium-term: Add RDS Proxy.
  3. Check: Is Aurora Serverless ACU scaling?
- **Prevention:** RDS Proxy in V1 Terraform if budget allows. Otherwise, set processor Lambda concurrency conservatively (5-10).

**5. DynamoDB Throttling**

- **Symptom:** Processor slows or errors on DynamoDB calls. `ThrottledRequests` metric increases.
- **Containment:** On-demand auto-scales with initial burst limit (rare at our scale).
- **Recovery:** At Shopify order volumes, this should not happen. If it does, investigate unexpected fan-out. Do NOT switch to provisioned capacity first — find root cause.

**6. Step Function Stuck (Zombie Run)**

- **Symptom:** Execution running for hours. Freshness alarm fires. No recent completions in DynamoDB.
- **Cause:** Wait state with absurd wait time (e.g., `rate_limit_reset_at` set far in future), or Lambda timeout misconfigured.
- **Containment:** Step Function execution timeout (30 min incremental, 4 hr backfill). Auto-fails on timeout.
- **Recovery:**
  1. Stop stuck execution in Step Functions console.
  2. Check execution history to see which state is stuck.
  3. If stuck in ThrottleWait: fix wait time calculation in poller.
  4. If stuck in Lambda: fix Lambda timeout configuration.
  5. Next scheduled run starts fresh from last checkpoint.

**7. Duplicate Processing (Idempotency Failure)**

- **Symptom:** Duplicate records in Postgres. `records_skipped` lower than expected during replay.
- **Cause:** Idempotency TTL expired, or key formula doesn't capture all uniqueness dimensions.
- **Containment:** Postgres UNIQUE constraint prevents true duplicates in current-state table. Upsert overwrites with newer data (harmless).
- **Recovery:**
  1. Current-state table: No action needed — upsert handles it.
  2. History table: Run dedup query if needed.
  3. If key formula wrong: fix in stream spec + extend DynamoDB TTL if needed.

**8. Webhook HMAC Validation Failure**

- **Symptom:** Webhook receiver logs HMAC failure. No webhook data ingesting. Polling still works.
- **Cause:** Shopify rotated webhook signing secret, or SSM has wrong value.
- **Containment:** Returns HTTP 200 (intentional — Shopify retries on non-200, creating noise). Does NOT write to S3 or SQS.
- **Recovery:**
  1. Check webhook secret in SSM against Shopify's webhook settings.
  2. Update SSM parameter value.
  3. Redeploy webhook-receiver Lambda (to clear cached secret).
  4. Missed webhooks covered by next polling run.

**9. S3 Write Failure**

- **Symptom:** Poller or webhook receiver Lambda fails. No raw payload captured.
- **Cause:** IAM permission issue, bucket policy change, or (extremely rare) S3 regional outage.
- **Containment:** Lambda fails → Step Function retries (poller) or SQS retries (webhook). Payload still in Lambda memory on retry.
- **Recovery:**
  1. Check IAM roles and S3 bucket policy.
  2. Retries succeed once permissions fixed.
  3. If Lambda timed out and payload lost: next polling run re-fetches from cursor. Shopify will retry webhook delivery.

**10. Terraform State Drift**

- **Symptom:** `terraform plan` shows unexpected changes.
- **Cause:** Manual changes in AWS Console, partial apply, or another process modifying resources.
- **Containment:** Always run `terraform plan` before `terraform apply`. Never skip the plan review.
- **Recovery:**
  1. Resources in AWS but not in state: `terraform import`.
  2. State entries without real resources: `terraform state rm`.
  3. Unexpected modifications: decide whether to keep (update Terraform) or revert (apply Terraform).
- **Prevention:** Tag all Terraform-managed resources with `managed_by = terraform`. Use DynamoDB state locking.

---

## 13. Infrastructure (Terraform)

### Module Structure

| Module | Responsibility | Changes when |
|--------|---------------|--------------|
| `stream-platform` | Core infra: S3, DynamoDB, Postgres/Aurora, IAM base roles, VPC, SQS, SNS, API Gateway base, SSM | Rarely. Infrastructure evolution. |
| `stream-poller` | One Step Function + EventBridge rule per polling stream. Parameterized by stream config. | Never (template). Instantiated per stream. |
| `stream-webhook` | One API Gateway route + webhook config per webhook stream. | Never (template). Instantiated per stream. |

### Environment Pattern

Directory per environment (not Terraform workspaces). Workspaces rejected because they hide which environment you're operating on — directory-per-env is explicit. Future engineers cannot accidentally apply to wrong environment.

```
infra/
├── modules/
│   ├── stream-platform/
│   ├── stream-poller/
│   └── stream-webhook/
├── environments/
│   ├── dev/main.tf       # Reads stream YAMLs, calls modules
│   └── prod/main.tf
└── shared/
    └── state.tf          # S3 backend config
```

### The Critical Trick: Terraform Reads Stream YAMLs

```hcl
locals {
  stream_files    = fileset("${path.root}/../../../streams", "*.yaml")
  streams         = { for f in local.stream_files :
                      trimsuffix(f, ".yaml") => yamldecode(file(".../${f}")) }
  polling_streams = { for k, v in local.streams : k => v
                      if contains(["graphql", "rest", "graphql+webhook"], v.mode) }
  webhook_streams = { for k, v in local.streams : k => v
                      if contains(["webhook", "graphql+webhook"], v.mode) }
}

module "poller" {
  for_each      = local.polling_streams
  source        = "../../modules/stream-poller"
  stream_config = each.value
}
```

**Adding a new stream = add a YAML file + `terraform apply`. No new HCL.**

### Step Function ASL Template

Single parameterized ASL JSON template inside `stream-poller` module, using `templatefile()` to inject stream-specific values. Not one hand-written ASL per stream.

### State Management

- One S3 state backend per environment
- DynamoDB lock table for state locking
- No Terraform workspaces
- No remote module versioning (everything in-repo)

### Rules to Prevent Sprawl

| Rule | Why |
|------|-----|
| No hand-written ASL per stream | One template, parameterized |
| No hand-written HCL per stream | `for_each` over stream YAMLs |
| No Terraform workspaces | Directory-per-env is explicit |
| No remote module registry | Over-engineering for one repo |
| Lambda code deployed via `archive_file` | Simple, no separate build pipeline |

### V1 Infrastructure Checklist (Key Resources)

- S3 bucket: encryption (SSE-S3), versioning, lifecycle (Glacier at 90d)
- DynamoDB table: on-demand, PK/SK string, TTL enabled
- Aurora Serverless v2: security group, subnet group, minimum ACU=0.5
- RDS Proxy (recommended) or set processor Lambda concurrency low (5-10)
- IAM role: shopify-poller (S3 write, DynamoDB read/write, SSM read, CloudWatch write)
- IAM role: processor (S3 read, DynamoDB read/write, RDS connect, CloudWatch write)
- IAM role: run-finalizer (DynamoDB read/write, CloudWatch write)
- SQS queue: `data-streams-process-{env}` + DLQ: `data-streams-dlq-{env}`
- SNS topic: `data-streams-alerts-{env}` with email subscription
- EventBridge rule: `rate(5 minutes)` → Step Function
- Step Function: parameterized ASL, 30-minute timeout
- CloudWatch log groups: 30-day retention (prod), 7-day (dev)
- SSM parameter paths: placeholder values, `ignore_changes = [value]`
- Aurora `final_snapshot_identifier` required for prod when `skip_final_snapshot=false`

### When to Evolve

- **Add module versioning:** Only if/when repo splits (Phase 3+).
- **Add CI/CD plan-and-apply pipeline:** Phase 2 (plan on PR, apply on merge).
- **Add remote state data sources:** Only if repos split and need cross-referencing.

### Alternatives Rejected

- **CDK or Pulumi:** Terraform most widely understood, largest hiring pool, doesn't require runtime for infrastructure.
- **Terraform workspaces:** Hide which environment you're on — directory-per-env is explicit.
- **Separate Terraform repo:** Infrastructure and application code change together during stream additions.
- **One giant `main.tf`:** Without modules, every new stream requires copying HCL blocks.

---

## 14. AI Leverage Model

### Where AI Is HIGH LEVERAGE

| Area | What AI does | Why it's safe |
|------|-------------|---------------|
| **New stream definitions** | Generates YAML from stream spec + examples | Highly constrained format. Machine-validatable. |
| **New Pydantic schemas** | Reads vendor API docs → generates raw + canonical models | Mechanical translation. Pydantic catches type errors at runtime. |
| **Processor transform logic** | Maps raw fields to canonical fields | Input/output contracts are explicit. Tests verify correctness. |
| **Test generation** | Reads contracts → generates test cases with fixtures | Contracts define expected behavior. Tests are verifiable. |
| **Terraform stream instances** | Verifies/generates HCL for new streams | Module interface is rigid. `terraform plan` catches errors. |
| **Runbook updates** | Drafts runbook steps from failure patterns | Structured format. Human-reviewable. |
| **Documentation** | Updates docs when architecture evolves | Low-risk output. |

### Where AI Is DANGEROUS (Require Human Review)

| Area | Risk | Mitigation |
|------|------|------------|
| **Step Function ASL edits** | Subtle state machine bugs (infinite loops, stuck states) that only manifest on edge cases | ASL template is locked. AI proposes, human reviews and tests. |
| **DynamoDB key design changes** | Breaking single-table access patterns, corrupting control plane | Entity model is a controlled schema. Changes require ADR. |
| **IAM policy changes** | Over-permissive roles, privilege escalation | All IAM in Terraform, reviewed in plan. Never `*` resources. |
| **Postgres migrations** | Destructive DDL, data loss, locking production tables | All migrations reviewed. No `DROP` without explicit human approval. |
| **Secrets or credential handling** | Accidental logging, exposure in errors, hardcoding | Secrets only in SSM. AI code never handles raw secret values. |
| **Error handling in shared libs** | Silent failures, swallowed exceptions breaking observability | Shared lib changes require integration test verification. |

### How the Architecture Enables Safe AI Contribution

1. **`CLAUDE.md` in repo root** — AI reads this first.
2. **Stream spec is the contract** — AI generates streams by filling a well-defined YAML schema.
3. **Pydantic models are guardrails** — Even bad transform logic is caught by Pydantic validation at runtime.
4. **Test fixtures for every stream** — AI runs transforms against known inputs.
5. **CI validation gates** — Stream YAML validation, Pydantic checks, `terraform validate`, pytest all run on every PR.
6. **Immutable raw storage** — If AI generates a bad transform, raw data is untouched. Fix, replay, done.

### Rules for AI-Generated PRs

1. AI-generated code gets the same review as human code.
2. AI must not modify locked files (ASL template, DynamoDB entity model, IAM policies) without human-initiated ADR.
3. AI-generated stream definitions must pass the stream spec validator before merge.
4. AI must include test cases for any new transform logic.
5. AI should reference relevant ADRs and specs in PR descriptions.

---

## 15. Adding a New Stream

> **Prerequisite:** Read Section 2 (Architecture Principles) and Section 7 (Stream YAML Specification) first.

### For an Existing Source (e.g., New Shopify Entity)

Time estimate: **2-3 days** for a competent engineer.

You should NOT need to:
- Write new Lambda code (processor routes by config)
- Write new Terraform modules (existing modules handle it via `for_each`)
- Modify the Step Function template (it's parameterized)
- Modify the poller Lambda (it's driven by stream config)
- Create new IAM roles (existing roles scope to bucket/table prefix)

If you find yourself doing any of the above, stop — the platform skeleton may need a small extension, not a one-off workaround.

#### Step 1: Define the Stream (30 min)

Create `streams/{source}-{stream}.yaml`. Copy an existing stream as starting point. Fill in source, stream identifiers, API mode, schema version name, idempotency key fields, cursor field, freshness SLA.

#### Step 2: Create the Schemas (2-4 hours)

**Raw model** (`schemas/raw/{source}/{entity}.py`) — permissive:
```python
class ShopifyCustomerRaw(BaseModel):
    class Config:
        extra = "allow"
    id: int
    email: Optional[str]
    # ... all fields from vendor API docs, all Optional
```

**Canonical model** (`schemas/canonical/{source}/{entity}_v{N}.py`) — strict:
```python
class ShopifyCustomerV1(BaseModel):
    id: int
    store_id: str
    email: Optional[str]
    created_at: datetime
    updated_at: datetime
    # ... only fields you actually need
```

**Transform function** (`schemas/canonical/{source}/transforms.py`) — pure function:
```python
def transform_shopify_customer(raw: ShopifyCustomerRaw, store_id: str) -> ShopifyCustomerV1:
    return ShopifyCustomerV1(
        id=raw.id,
        store_id=store_id,
        email=raw.email,
        created_at=raw.created_at,
        updated_at=raw.updated_at,
    )
```

#### Step 3: Register the Schema (15 min)

Add entry to `src/shared/schema_registry.py`:
```python
SCHEMA_REGISTRY[("shopify", "customers")] = SchemaEntry(
    raw_model=ShopifyCustomerRaw,
    raw_page_model=ShopifyCustomersPageRaw,
    canonical_model=ShopifyCustomerV1,
    transform=transform_shopify_customer,
    pg_table="shopify.customers",
    version="shopify.customer.v1",
    record_list_field="customers",
    idempotency_field_map={"customer_id": "id", "updated_at": "updated_at"},
)
```

#### Step 4: Create Postgres Tables (30 min)

Add a migration SQL file. Pattern:
```sql
CREATE TABLE shopify.customers (
    id BIGINT NOT NULL,
    store_id TEXT NOT NULL,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    raw_s3_key TEXT NOT NULL,      -- Required: lineage
    schema_version TEXT NOT NULL,  -- Required: schema tracking
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id TEXT,
    PRIMARY KEY (id, store_id)
);

CREATE TABLE shopify.customers_history (
    history_id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL,
    store_id TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_id TEXT,
    UNIQUE (customer_id, store_id, changed_at)
);
```

#### Step 5: Write Tests (1-2 hours)

Save 3+ real API responses in `tests/fixtures/{source}/{stream}/`.

```python
def test_transform_customer():
    raw = load_fixture("shopify/customers/customer_1.json")
    raw_model = ShopifyCustomerRaw(**raw)
    canonical = transform_shopify_customer(raw_model, "teststore")
    assert canonical.id == raw["id"]
    assert canonical.store_id == "teststore"
    assert isinstance(canonical.updated_at, datetime)
```

#### Step 6: Deploy (30 min)

```bash
# Validate stream spec
python -m src.shared.stream_config validate streams/shopify-customers.yaml

# Terraform (creates Step Function + EventBridge rule)
cd infra/environments/dev
terraform plan
terraform apply

# Run Postgres migration
psql -f migrations/002_shopify_customers.sql
```

#### Step 7: Verify (1 hour)

1. Trigger a manual Step Function execution.
2. Verify raw payload in S3 at expected key path.
3. Verify run record in DynamoDB.
4. Verify records in Postgres table.
5. Verify cursor updated in DynamoDB.
6. Verify freshness metric in CloudWatch.
7. Let scheduled runs execute for a few hours.
8. Check for duplicates.

---

### For a New Source (e.g., Adding Recharge)

Requires more work — a new provider has its own auth and pagination patterns:

1. **New poller Lambda** — `recharge-poller` that understands Recharge auth and pagination.
2. **New SSM parameters** — API credentials for the new vendor.
3. **New schemas** — Raw and canonical Pydantic models for Recharge entities.
4. **New Postgres schema** — `CREATE SCHEMA recharge;`
5. **Stream definitions** — YAMLs for each Recharge entity.
6. **Terraform** — May need a new poller module variant if Step Function pattern differs significantly.

The **processor, finalizer, webhook-receiver, DynamoDB table, and S3 bucket are all shared and do not change**.

---

## 16. What Is NOT Being Built

> When someone proposes building something from this list, ask: (1) Is there a concrete use case today? (2) Does the manual approach no longer work? (3) Is the cost justified? (4) Can it be built incrementally? If all four are yes, write an ADR. Otherwise, defer.

### Not Building in Phase 1

**Provider-Agnostic Normalization Layer**
→ Only meaningful with 2+ providers. Building for one = speculative abstraction.
→ Build in Phase 2 when adding second provider.
→ V1 queries `shopify.orders` directly.

**Automated Replay Workflow**
→ Replay frequency in V1 will be low. Manual replay (invoke processor with S3 key) is sufficient.
→ Build in Phase 2, after manual replay done 3+ times.
→ Manual replay process is documented; replay Step Function design is in `specs/step-function-design.md`.

**Backfill State Machine**
→ Backfill reuses incremental poll state machine with `cursor_override` + `max_pages_override`.
→ Build dedicated mechanism only if backfills exceed Step Function limits or Shopify Bulk API would be dramatically more efficient.

**Schema Registry Service**
→ Pydantic models in git ARE the schema registry (versioned, validated, enforced).
→ Build only if we need runtime schema discovery or cross-service schema sharing (Phase 3+ at earliest).

**Multi-Store / Multi-Tenant Support**
→ V1 targets one store. `store_id` dimension is already everywhere in data model (no schema changes needed later).
→ Build when actually needed (likely Phase 3).

**Admin UI / Dashboard**
→ AWS Console (Step Functions, CloudWatch, DynamoDB) IS the admin UI.
→ Build in Phase 3 when non-technical stakeholders need visibility, or when 3+ engineers shouldn't need AWS Console access.

**CI/CD Pipeline**
→ V1 deploys manually (`terraform apply`, Lambda zip upload). Faster for one engineer than setting up CI/CD.
→ Build in Phase 2, before second engineer touches production.
→ Pipeline: lint → test → terraform plan (on PR) → terraform apply (on merge to main).

**CDC / Real-Time Streaming**
→ Use case is near-real-time (5-minute polling), not true real-time. Webhooks provide sub-minute latency for critical events.
→ Build only if downstream consumer has hard requirement for <1 second latency.

**dbt / Transformation Layer**
→ V1 focuses on getting data into Postgres correctly. Transformation/analytics is downstream.
→ Build in Phase 2-3 when actual analytics queries need pre-computed aggregations.

### Not Building Ever (In This Architecture)

**Generic ETL Framework** — We build a constrained, opinionated platform for specific sources. A generic framework trades reliability for generality.

**Data Lake with Ad-Hoc Query Engine** — S3 IS the data lake for raw storage. Queryable business truth lives in Postgres. Athena has cold-start latency, no transactions, no transactional upsert pattern.

**Event Sourcing Architecture** — Event sourcing is the theoretically pure version of our pattern but requires event store + projection engine + snapshot management. S3-based replay gets 80% of the benefit at 20% of the complexity.

**Kubernetes / Container Orchestration** — We run Lambda functions. Our workloads are short-lived (seconds to minutes), invoked on schedule or by events. Lambda is the correct compute model.

**Multi-Region / DR** — Single-region is sufficient for V1. S3 has 99.999999999% durability. Aurora has automated backups. Data sources can be re-polled. Multi-region not justified until business-critical with specific SLA requirements.

---

## 17. Phased Roadmap

### Phase 1: Prove the Pattern (~3-4 weeks, Solo)

**Goal:** One golden-path stream (Shopify Orders) running end-to-end in production.

**Build (in order):**
1. Repo structure + Terraform skeleton (S3, DynamoDB, Aurora, IAM, VPC, SSM, SNS)
2. Shared libraries: `s3_writer.py`, `dynamo_control.py`, `pg_client.py`, `stream_config.py`, `observability.py`
3. Pydantic schemas: `schemas/raw/shopify/order.py`, `schemas/canonical/shopify/order_v3.py` + transforms
4. shopify-poller Lambda (GraphQL, cursor-based pagination, S3 write)
5. processor Lambda (schema routing, S3 → validate → transform → Postgres upsert, idempotency)
6. run-finalizer Lambda (close run, update cursor, compute freshness, emit metrics)
7. Incremental poll Step Function (full state machine with error handling, parameterized ASL)
8. Stream definition: `streams/shopify-orders.yaml`
9. Postgres migration: `shopify.orders` + `shopify.orders_history`
10. Terraform wiring (EventBridge → Step Function, Lambda deployments, end-to-end)
11. CloudWatch dashboard + alarms
12. Basic tests (transform unit tests with fixtures, stream spec validation)

**Do NOT build:** Webhook receiver, replay Step Function, normalization layer, CI/CD, multi-store, admin UI.

**Exit criteria:**
- [ ] Shopify orders ingesting on 5-minute schedule
- [ ] Raw payloads in S3 with correct key pattern
- [ ] Records in Postgres `shopify.orders` with lineage (`raw_s3_key`)
- [ ] Cursor advancing correctly between runs
- [ ] Freshness metric in CloudWatch, within SLA
- [ ] At least one alarm tested (manually make data stale, verify alarm fires)
- [ ] Manual replay works: pick S3 key, invoke processor, verify idempotent result
- [ ] No duplicate records after 24 hours of scheduled runs

### Phase 2: Harden + Expand (~2-3 weeks after Phase 1 stable)

**Goal:** Second stream proves config-driven pattern. Webhooks supplement polling. Replay is automated. CI/CD prevents deployment mistakes.

**Build:**
1. webhook-receiver Lambda (HMAC validation, S3 write, SQS enqueue, API Gateway route)
2. SQS queue + DLQ (with alarm)
3. Second polling stream: Shopify Customers (YAML, schemas, registry entry, Postgres migration, tests)
4. Replay Step Function (Map state iterating S3 keys, DynamoDB tracking, audit trail)
5. CI/CD pipeline (lint → test → terraform plan on PR; terraform apply → Lambda deploy on merge)
6. Idempotency hardening (TTL tuning, edge case testing)
7. All three runbooks written and tested
8. Design (but not build) normalization layer — define `commerce_order`, `commerce_customer` Pydantic models; document Shopify canonical → normalized field mapping

**Do NOT build:** Normalization processor, Bulk API backfill, multi-store, admin UI, third-party observability.

**Exit criteria:**
- [ ] Two streams running (orders + customers)
- [ ] Webhooks flowing for orders (belt and suspenders)
- [ ] Adding a third Shopify stream would take <3 days
- [ ] Replay works end-to-end (request → Step Function → reprocess → audit)
- [ ] CI/CD pipeline operational
- [ ] New engineer can understand the system within 1 day

### Phase 3: Scale the Pattern (After First Hire)

**Goal:** Normalization layer proven with second provider. Platform extendable by engineers other than the CTO.

**Build:**
1. Normalization layer (`schemas/normalized/commerce_order.py`, mapping functions, `normalized.*` Postgres schema, processor writes to both source canonical AND normalized)
2. Second provider (Recharge or Stay.ai): `recharge-poller`, schemas, stream definitions — proves normalization layer with real data
3. Multi-store support (per-store SSM credentials, parameterized stream specs)
4. Backfill optimization (evaluate Shopify Bulk API)
5. Healthcheck Lambda (API connectivity check, schema drift detection)
6. Third-party observability if team > 2 (Datadog/Grafana Cloud)
7. Internal shared library package (only if multiple repos need it)

**Do NOT build until clear need:** Kubernetes, real-time streaming, Athena, custom admin UI, dbt.

**Exit criteria:**
- [ ] Two providers ingesting to normalized tables
- [ ] Engineer (not CTO) has added a stream independently
- [ ] Cross-provider queries work
- [ ] Platform documentation sufficient for independent operation

### Sequencing Rationale

**Phase 1 first:** Nothing else matters if data doesn't flow reliably.
**Phase 2 before Phase 3:** Second stream validates config-driven architecture is real; CI/CD must exist before another human touches production; webhooks + replay fill critical operational gaps.
**Phase 3 after hiring:** Normalization requires judgment about cross-provider semantics; multi-provider support only needed when business has second provider.

---

## 18. V1 Launch Checklist

### Infrastructure (Terraform)
- [ ] S3 bucket: encryption, versioning, lifecycle (Glacier at 90d)
- [ ] DynamoDB table: on-demand, PK/SK string, TTL enabled
- [ ] Aurora Serverless v2: security group, subnet group, min ACU=0.5
- [ ] RDS Proxy or set processor Lambda concurrency to 5-10
- [ ] IAM roles: shopify-poller, processor, run-finalizer
- [ ] SQS queue + DLQ with alarm
- [ ] SNS topic with email subscription
- [ ] EventBridge rule: `rate(5 minutes)` → Step Function
- [ ] Step Function: parameterized, 30-minute timeout
- [ ] CloudWatch log groups: 30-day prod, 7-day dev
- [ ] SSM parameter paths created (placeholders): `shopify/access_token`, `shopify/webhook_secret`, `postgres/connection_string`
- [ ] `terraform plan` clean, `terraform apply` succeeds

### Secrets (Manual, Post-Terraform)
- [ ] Set Shopify access token in SSM (GraphQL Admin API bearer token)
- [ ] Set Shopify webhook secret in SSM
- [ ] Set Postgres connection string in SSM
- [ ] Verify Lambda can read SSM values (test invocation)

### Application Code
- [ ] All shared libraries: `s3_writer.py`, `dynamo_control.py`, `pg_client.py`, `stream_config.py`, `observability.py`, `contracts.py`
- [ ] All schemas: raw order model, canonical order_v3 model, transforms, schema_registry
- [ ] All lambdas: poller, processor, finalizer handlers
- [ ] Stream definition: `streams/shopify-orders.yaml` (valid per stream spec)
- [ ] Postgres migrations: `shopify` schema, `shopify.orders`, `shopify.orders_history`, indexes

### Testing
- [ ] 3+ real Shopify order fixtures in `tests/fixtures/shopify/orders/`
- [ ] Unit tests: raw model parses fixture, transform produces correct canonical, idempotency key is deterministic, stream config validates
- [ ] Integration tests: S3 writer round-trip, processor end-to-end
- [ ] All tests pass

### Deploy to Dev
- [ ] Trigger manual Step Function execution
- [ ] Verify: raw payload in S3 at correct key
- [ ] Verify: run record in DynamoDB (`status = success`)
- [ ] Verify: orders in `shopify.orders`, history in `shopify.orders_history`
- [ ] Verify: cursor updated in DynamoDB `CURSOR#current`
- [ ] Verify: `raw_s3_key` on Postgres rows points to real S3 objects
- [ ] Verify: `schema_version` on Postgres rows is correct
- [ ] Verify: freshness metric in CloudWatch
- [ ] Verify: structured JSON logs with correct fields
- [ ] Enable EventBridge schedule, run 24 hours
- [ ] Verify: no duplicate records, cursor advancing, freshness within SLA (10 min)

### Observability
- [ ] CloudWatch dashboard with all 7 widgets
- [ ] Freshness alarm configured and tested (manually make stale, verify alarm fires, verify email)
- [ ] Run failure alarm configured
- [ ] DLQ alarm configured

### Manual Replay Test
- [ ] Pick S3 key from successful run, invoke processor → `records_skipped > 0` (idempotency working)
- [ ] Delete idempotency record from DynamoDB, invoke processor again → `records_processed > 0`
- [ ] Verify Postgres row updated (not duplicated)

### Production Deploy
- [ ] All dev verifications pass
- [ ] `terraform plan` for prod reviewed (no surprises)
- [ ] `terraform apply` for prod, set SSM secrets, run migrations, deploy Lambda code
- [ ] Trigger manual execution, verify same as dev checks
- [ ] Enable EventBridge schedule, monitor first 2 hours actively
- [ ] Monitor first 24 hours (check dashboard morning + evening)
- [ ] Verify freshness SLA met, no alarms firing

### Documentation
- [ ] `CLAUDE.md` complete
- [ ] `README.md` with setup instructions
- [ ] All ADRs written and indexed
- [ ] All specs written
- [ ] Runbooks written (stale data, failed run, DLQ)
- [ ] "Adding a stream" guide written

### V1 Sign-off
- [ ] Data flowing in production
- [ ] Freshness within SLA
- [ ] Manual replay works
- [ ] Documentation complete
- [ ] A person unfamiliar with the system could read the docs and understand it within a day

---

## 19. Architecture Decision Records (ADR Index)

ADRs are numbered and immutable once accepted. A new ADR replaces a superseded one with back-reference.

| ADR | Title | Status | Key Decision |
|-----|-------|--------|-------------|
| ADR-001 | Architecture Overview & Principles | Accepted | Constrained, opinionated serverless ingestion platform. Immutable raw, config over code, one ingestion path. |
| ADR-002 | Three-Tier Storage Strategy | Accepted | S3 (raw truth), DynamoDB (control plane), Postgres (business truth). Each store has a single role. |
| ADR-003 | Three-Layer Schema Model | Accepted | Raw (permissive) → Source Canonical (strict) → Normalized (deferred). Layer 3 deferred to Phase 2. |
| ADR-004 | Lambda Runtime Roles | Accepted | 4 Lambdas for V1. Provider-specific pollers. Generic processor/finalizer/replay. Config-driven, not per-stream. |
| ADR-005 | Step Functions for Polling, SQS for Webhooks | Accepted | Step Functions for paginated/durable polling. SQS → Lambda for fast webhook acknowledgment. |
| ADR-006 | Single Repo Until Team Scale | Accepted | One repo until 3+ engineers. Stream definitions + schemas stay with application code. |
| ADR-007 | DynamoDB Single-Table Design | Accepted | One table `data-streams-control-{env}`. On-demand billing. One GSI. TTLs for idempotency (30d) and webhooks (7d). |
| ADR-008 | GraphQL as Default Shopify API | Accepted | GraphQL for cursor-based pagination, field selection, cost-based rate limiting, Shopify's strategic direction. REST only for missing endpoints. |
| ADR-009 | Terraform Module Strategy | Accepted | Three modules (platform, poller template, webhook template). Directory-per-env. Terraform reads stream YAMLs via `for_each`. |
| ADR-010 | Python 3.12 as Sole Runtime | Accepted | One language. Python for Shopify ecosystem, boto3, Pydantic, hiring pool, AI generation reliability. No polyglot. |
| ADR-011 | SSM Parameter Store for Secrets | Accepted | SSM SecureString. Terraform creates placeholders (does not set values). IAM-scoped per Lambda. No Secrets Manager, no env vars. |
| ADR-012 | AI Leverage Model | Accepted | AI is high-leverage for stream definitions, schemas, transforms, tests, Terraform instances, docs. Dangerous for ASL, DynamoDB key design, IAM, migrations, secrets. |
| ADR-013 | Normalization Layer Deferred | Accepted | Design Layer 3 now. Build in Phase 2. No speculative abstraction with only one provider. |
| ADR-014 | Replay From S3, Never Re-Call Vendor APIs | Accepted | Replay always re-reads from S3. Preserves point-in-time accuracy, no API rate limit consumption, deterministic. |
| ADR-015 | CloudWatch-Only Observability for V1 | Accepted | No third-party tools for V1. CloudWatch sufficient for V1 scale and one engineer. Structured logs compatible with future migration. |
| ADR-016 | One Generic Processor, Schema-Driven | Accepted | One processor Lambda for all streams. Schema routing via registry. Break rule only for multi-entity fan-out or unique performance needs. |
| ADR-017 | Idempotency via DynamoDB + Postgres Constraints | Accepted | Two-layer: DynamoDB (fast check, 30d TTL) + Postgres UNIQUE constraint (safety net). Idempotency key MUST include version dimension. Write DynamoDB key AFTER Postgres write. |

---

## Rebuild Instructions

If this repository is lost or needs to be recreated:

1. Re-read this `DOCS.md` (synthesizes all docs)
2. Recreate directory structure per **Section 4** (Golden Path)
3. Implement `streams/shopify-orders.yaml` per **Section 7** (Stream YAML Spec)
4. Implement schemas (raw + canonical + transforms) per **Section 6** and **Section 15** (Adding a Stream)
5. Implement shared libs per **Section 8** (Runtime Contracts)
6. Implement Lambda handlers (thin wrappers over shared libs)
7. Implement Postgres migrations per **Section 5.3** (Postgres Schema)
8. Implement Terraform modules per **Section 13** (Infrastructure)
9. Write tests with real Shopify fixture data
10. Follow **Section 18** (V1 Launch Checklist)
11. Confirm **Section 2** acceptance criteria

---

*Synthesized from: `CLAUDE.md`, `docs/README.md`, `docs/adr/001–017`, `docs/specs/stream-spec.md`, `docs/specs/runtime-contracts.md`, `docs/specs/step-function-design.md`, `docs/specs/data-model.md`, `docs/specs/failure-modes.md`, `docs/guides/adding-a-stream.md`, `docs/guides/operability.md`, `docs/guides/not-building.md`, `docs/roadmap/phases.md`, `docs/roadmap/v1-checklist.md`.*
