# ADR-022: MVP Implementation Plan and Scale-Up Path

**Status:** Accepted
**Date:** 2026-03-24
**Companion to:** [ADR-021](021-simplify-to-single-lambda-mvp.md) (the decision); this ADR is the execution plan

---

## Purpose

ADR-021 captures *why* we're simplifying. This ADR captures *how* — the exact files, the handler design, the infrastructure shape, the deployment sequence, and the tiered path back to the full architecture. Written now so that the thinking is preserved regardless of when each phase is executed.

---

## Part A: Move to MVP

### A1. New files

| File | Purpose |
|------|---------|
| `src/lambdas/stream_runner/__init__.py` | Package init |
| `src/lambdas/stream_runner/handler.py` | Single Lambda — full fetch/transform/upsert loop |
| `migrations/003_stream_cursors.sql` | Postgres table replacing DynamoDB cursor + minimal run metadata |
| `infra/environments/dev/mvp.tf` | Flat Terraform for MVP infra (~300 LOC, separate state file) |
| `infra/environments/prod/mvp.tf` | Same pattern for prod |
| `tests/test_stream_runner.py` | Unit tests for the stream runner handler |

### A2. Modified files

| File | Change |
|------|--------|
| `src/shared/pg_client.py` | Add `get_stream_cursor()` and `save_stream_cursor()` methods |

No other existing files are modified. Everything else stays dormant in place.

### A3. Stream runner handler design

The single Lambda replaces the initializer → poller → processor → finalizer chain. It reuses existing shared libs directly — no new abstractions.

```
handler(event, context)
│
│  event = { source, stream, store_id }     ← from EventBridge input
│
├── Load config
│   ├── stream_config.load_all_stream_configs()          [existing]
│   └── schema_registry.get_schema(source, stream)       [existing]
│
├── Initialize
│   ├── Build vendor client (ShopifyOrdersClient or GorgiasTicketsClient)  [existing]
│   ├── pg = PgClient.from_env()                                           [existing]
│   ├── s3 = S3Writer(bucket)                                              [existing]
│   ├── cursor = pg.get_stream_cursor(source, stream, store_id)            [NEW]
│   └── run_id = uuid4()
│
├── Page loop (up to config.max_pages_per_run)
│   │
│   ├── page = client.fetch_page(store_id, cursor, page_size)   [existing]
│   │
│   ├── Handle 429 → time.sleep(retry_after), retry
│   │   (replaces Step Function ThrottleWait / ThrottleUntilReset states)
│   │
│   ├── s3_key = s3.write_raw(page, metadata)                   [existing]
│   │
│   ├── raw_page = schema.raw_page_model(**page.body)            [existing]
│   │
│   ├── for record in raw_page.records:
│   │   ├── canonical = schema.transform(raw_record, store_id)   [existing]
│   │   ├── pg.upsert_xxx(canonical, s3_key, version, run_id)   [existing]
│   │   ├── pg.insert_xxx_history(canonical, run_id)             [existing]
│   │   └── pg.commit()                                          [existing]
│   │
│   ├── Update cursor from page response
│   └── if not has_more → break
│
├── pg.save_stream_cursor(source, stream, store_id, cursor, run_id, ...)  [NEW]
│
├── metrics.emit(records_processed, freshness_lag, pages_fetched)   [existing]
│
└── return { run_id, records, pages, status }
```

**Imports from existing shared libs (unchanged):**
- `src.shared.stream_config` — YAML parsing
- `src.shared.schema_registry` — (source, stream) → models + transform + pg methods
- `src.shared.shopify_client.ShopifyOrdersClient` — GraphQL fetch, cursor, rate limits
- `src.shared.gorgias_client.GorgiasTicketsClient` — REST fetch, checkpoint encoding
- `src.shared.s3_writer.S3Writer` — gzip + write + key building
- `src.shared.pg_client.PgClient` — upsert, history, commit/rollback + NEW cursor methods
- `src.shared.observability` — structlog setup, CloudWatch metrics
- `src.shared.ssm` — indirectly via client constructors and PgClient.from_env()

**Does NOT import:**
- `src.shared.contracts` — no inter-Lambda boundaries exist
- `src.shared.dynamo_control` — cursor lives in Postgres

**Rate limit handling:** On HTTP 429, the handler calls `time.sleep(retry_after)` inline. The Lambda's 15-minute timeout is the outer bound. This replaces the Step Function's `CheckRateLimitWait` → `ThrottleUntilReset` wait states. Simpler, and sufficient for incremental polling where total page counts are low.

**Error handling:** Per-record try/except around transform + upsert (same pattern as current `processor/handler.py`). A single record failure does not abort the run. Final status is `success` (0 failures), `partial_failure` (some failures), or `error` (unrecoverable). Cursor only advances on `success` or `partial_failure`.

### A4. Cursor migration (`003_stream_cursors.sql`)

```sql
CREATE SCHEMA IF NOT EXISTS control;

CREATE TABLE control.stream_cursors (
    source          TEXT        NOT NULL,
    stream          TEXT        NOT NULL,
    store_id        TEXT        NOT NULL,
    cursor_value    TEXT,
    run_id          TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    records_total   BIGINT      NOT NULL DEFAULT 0,
    pages_total     BIGINT      NOT NULL DEFAULT 0,
    last_status     TEXT,
    last_run_at     TIMESTAMPTZ,

    PRIMARY KEY (source, stream, store_id)
);

COMMENT ON TABLE control.stream_cursors IS
    'MVP cursor storage — replaces DynamoDB CURSOR#current. '
    'One row per (source, stream, store_id). '
    'See ADR-022 for migration path back to DynamoDB.';
```

This replaces:
- DynamoDB `CURSOR#current` record → `cursor_value` column
- DynamoDB run record (partially) → `last_status`, `last_run_at`, `records_total`, `pages_total`

It does **not** replace the full run audit trail (every run as a separate DynamoDB item). That's acceptable — we don't need per-run history yet. When we do, the DynamoDB run records come back (see Part B, Tier 2).

### A5. New `pg_client.py` methods

Two methods added to the existing `PgClient` class:

```python
def get_stream_cursor(self, source: str, stream: str, store_id: str) -> str | None:
    """Read current cursor value from control.stream_cursors."""
    self._ensure_connection()
    with self._conn.cursor() as cur:
        cur.execute(
            "SELECT cursor_value FROM control.stream_cursors "
            "WHERE source = %s AND stream = %s AND store_id = %s",
            (source, stream, store_id),
        )
        row = cur.fetchone()
        return row[0] if row else None

def save_stream_cursor(
    self, source: str, stream: str, store_id: str,
    cursor_value: str | None, run_id: str,
    status: str = "success", pages: int = 0, records: int = 0,
) -> None:
    """Upsert cursor + run metadata after a completed run."""
    self._ensure_connection()
    with self._conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO control.stream_cursors
                   (source, stream, store_id, cursor_value, run_id,
                    last_status, last_run_at, pages_total, records_total)
            VALUES (%s, %s, %s, %s, %s, %s, NOW(), %s, %s)
            ON CONFLICT (source, stream, store_id) DO UPDATE SET
                cursor_value  = EXCLUDED.cursor_value,
                run_id        = EXCLUDED.run_id,
                updated_at    = NOW(),
                last_status   = EXCLUDED.last_status,
                last_run_at   = NOW(),
                pages_total   = EXCLUDED.pages_total,
                records_total = EXCLUDED.records_total
            """,
            (source, stream, store_id, cursor_value, run_id, status, pages, records),
        )
    self._conn.commit()
```

These follow the existing `pg_client.py` patterns: `_ensure_connection()`, parameterized SQL, explicit commit. The current poller/processor/finalizer never call these methods, so adding them is non-breaking.

### A6. Simplified Terraform (`mvp.tf`)

Single flat file per environment. Separate state key (`dev-mvp/terraform.tfstate`) so the dormant `main.tf` state is untouched.

**Resources provisioned (~26):**

| Resource | Count | Notes |
|----------|-------|-------|
| S3 bucket + versioning + lifecycle | 3 | Same bucket name pattern: `data-streams-raw-{env}` |
| Aurora Serverless v2 cluster + instance | 3 | Public endpoint, SSL required, 0.5–2 ACU (dev) |
| Security group (Aurora) | 1 | Inbound 5432 from `0.0.0.0/0`, SSL enforced at DB level |
| DB subnet group | 1 | Default VPC public subnets |
| Lambda functions | 2 | One per stream, handler: `src.lambdas.stream_runner.handler.handler` |
| IAM roles + policies | 4 | One role per stream: S3 + SSM + CloudWatch + Logs |
| EventBridge rules + targets | 4 | Shopify `rate(5 minutes)`, Gorgias `rate(15 minutes)` |
| Lambda error alarms | 2 | `Errors > 2` in 10 min → SNS |
| SNS alert topic | 1 | Email subscription |
| CloudWatch log groups | 2 | 7-day retention (dev), 30-day (prod) |
| SSM parameter placeholders | 5 | `ignore_changes = [value]` — set manually |

**What is NOT provisioned:**
- No VPC, no VPC endpoints, no NAT
- No DynamoDB table
- No RDS Proxy
- No Step Function
- No SQS queues or DLQ
- No API Gateway
- No CloudWatch dashboard (use Logs Insights ad hoc)
- No freshness alarm (metric is emitted; alarm comes in Tier 1 scale-up)

**Lambda configuration:**
- Runtime: Python 3.12
- Timeout: 900 seconds (15 min max)
- Memory: 512 MB
- No VPC config
- Environment variables: `RAW_BUCKET`, `ENV`, `POSTGRES_SSM_PATH`
- Deployment package: same `dist/lambda/data-streams.zip` built by existing `scripts/build_lambda_package.sh`

### A7. Testing approach

**New test file: `tests/test_stream_runner.py`**

Follows the pattern of existing `tests/test_e2e_local.py`:

| Test | Verifies |
|------|----------|
| `test_shopify_full_run` | Pages fetched in sequence, S3 raw files written, records upserted, cursor saved |
| `test_gorgias_full_run` | Same as above for Gorgias REST path |
| `test_cursor_advances_on_success` | `save_stream_cursor` called with final cursor value |
| `test_cursor_not_advanced_on_error` | Unrecoverable error → cursor stays at previous value |
| `test_partial_failure_advances_cursor` | Some records fail, cursor still advances to last checkpoint |
| `test_rate_limit_sleep` | 429 response → `time.sleep(retry_after)` called, then retries |
| `test_no_records_first_run` | Empty API response → cursor stays None, status = success |
| `test_max_pages_respected` | Loop exits after `max_pages_per_run` even if `has_more = true` |

**Mocking strategy:**
- `moto mock_aws` for S3 (same as existing tests)
- `MockPgClient` extended with `get_stream_cursor` and `save_stream_cursor` (in-memory dict)
- Mock vendor client (return fixture data from `tests/fixtures/`)
- `unittest.mock.patch("time.sleep")` for rate limit tests

**Existing tests remain unchanged and continue to pass** — they test the shared libs and dormant handlers independently.

### A8. Deployment sequence

```
Step 1: Run migration
        psql $CONNECTION_STRING -f migrations/003_stream_cursors.sql

Step 2: Build Lambda package
        ./scripts/build_lambda_package.sh

Step 3: Initialize Terraform (new state)
        cd infra/environments/dev
        terraform init -backend-config="key=dev-mvp/terraform.tfstate"

Step 4: Apply
        terraform plan
        terraform apply

Step 5: Set SSM secrets (one-time, manual)
        aws ssm put-parameter --name /data-streams/dev/shopify/access_token --type SecureString --value "..."
        aws ssm put-parameter --name /data-streams/dev/gorgias/email       --type SecureString --value "..."
        aws ssm put-parameter --name /data-streams/dev/gorgias/api_key     --type SecureString --value "..."
        aws ssm put-parameter --name /data-streams/dev/postgres/connection_string --type SecureString --value "..."

Step 6: Smoke test (manual invocation)
        aws lambda invoke \
          --function-name data-streams-shopify-orders-dev \
          --payload '{"source":"shopify","stream":"orders","store_id":"your-store"}' \
          /dev/stdout

Step 7: Verify
        - CloudWatch Logs: structured JSON output, no errors
        - S3: raw files at shopify/orders/{store_id}/{date}/{run_id}/page_001.json.gz
        - Postgres: rows in shopify.orders and shopify.orders_history
        - Postgres: cursor row in control.stream_cursors

Step 8: Schedules go live
        EventBridge rules are created ENABLED by default.
        Monitor first 24h via CloudWatch Logs.

Step 9: Repeat for Gorgias
        aws lambda invoke \
          --function-name data-streams-gorgias-tickets-dev \
          --payload '{"source":"gorgias","stream":"tickets","store_id":"vitalityextracts"}' \
          /dev/stdout
```

---

## Part B: Scale Back Up

Each component is adopted independently when its operational trigger is hit (defined in ADR-021). This section documents the exact wiring for each, and the dependencies between them.

### Tier 1: Independent — adopt in any order, no Lambda decomposition required

These can be added to `mvp.tf` directly. The stream runner Lambda stays as-is.

---

#### B1a. VPC + RDS Proxy

**Trigger:** Postgres connection errors under concurrent Lambda invocations, or egress costs exceed VPC endpoint costs (~$22/mo per endpoint × 4 = ~$88/mo).

**Changes:**

1. **Infrastructure:** Add to `mvp.tf` or apply the relevant resources from `infra/modules/stream-platform/`:
   - VPC + 2 private subnets + route tables
   - 4 VPC endpoints (S3, DynamoDB if adopted, SSM, STS)
   - RDS Proxy + target group + IAM role
   - Move Aurora into private subnets (requires new DB subnet group)

2. **Lambda config:** Add `vpc_config` block (subnet IDs + security group) to each stream runner Lambda in `mvp.tf`.

3. **SSM update:** Change the Postgres connection string SSM parameter to point to the RDS Proxy endpoint instead of the Aurora cluster endpoint.

4. **Code changes:** None. `PgClient.from_env()` reads the connection string from SSM — it connects to whatever endpoint is configured.

5. **Downtime:** Brief (minutes) during Aurora subnet migration, or zero-downtime via blue/green if the cluster supports it.

---

#### B1b. DynamoDB idempotency layer

**Trigger:** Need sub-second idempotency checks, or need TTL-based automatic expiry of idempotency records (Postgres UNIQUE constraint is permanent; DynamoDB has 30-day TTL).

**Changes:**

1. **Infrastructure:** Add DynamoDB table to `mvp.tf` (copy resource definition from `infra/modules/stream-platform/main.tf`). Add DynamoDB permissions to each stream runner IAM role.

2. **Code change (~15 lines in `stream_runner/handler.py`):** Before the `pg.upsert_xxx()` call, add:
   ```python
   idem_key = dynamo.compute_idempotency_hash(source, stream, record, config.idempotency_key)
   if dynamo.check_idempotency(source, stream, idem_key):
       skipped += 1
       continue
   # ... existing upsert ...
   dynamo.write_idempotency(source, stream, idem_key, ttl_days=30)
   ```
   This is the same pattern as `src/lambdas/processor/handler.py` lines 105–124.

3. **Import added:** `from src.shared.dynamo_control import DynamoControl`

4. **No migration, no schema change, no Postgres change.** Postgres UNIQUE constraint remains as the safety net.

---

#### B1c. CloudWatch dashboard + alarms

**Trigger:** On-call rotation needs real-time visibility, or freshness SLA must be enforced by alarm (not just logged).

**Changes:**

1. **Infrastructure:** Add to `mvp.tf`:
   - CloudWatch dashboard (copy widget definitions from `infra/modules/stream-poller/main.tf`)
   - Freshness alarm per stream
   - Step Function failure alarm (skip if Step Function not yet adopted)
   - DLQ alarm (skip if SQS not yet adopted)

2. **Code changes:** None. The stream runner already calls `metrics.emit()` with `freshness_lag_minutes`, `records_processed`, and API health counters. The dashboard and alarms reference these existing metric names and dimensions.

---

### Tier 2: Requires Lambda decomposition

These require splitting the single stream runner back into separate functions. The existing handlers (`src/lambdas/poller/`, `src/lambdas/processor/`, etc.) are ready to use — they've been dormant, not deleted.

---

#### B2a. Split to poller + processor (2 Lambdas)

**Trigger:** Processing needs different memory/timeout/concurrency than fetching, OR processor reserved concurrency is needed to protect Postgres from concurrent writes.

**Changes:**

1. **Re-enable existing Lambdas:** `src/lambdas/poller/handler.py` and `src/lambdas/processor/handler.py` are already implemented and tested.

2. **Add SQS queue** between them (definition already exists in `stream-platform` module). Poller writes S3 key to SQS; processor is triggered by SQS.

3. **Terraform:** Add Lambda + SQS resources to `mvp.tf`. Configure processor with reserved concurrency (5 dev, 10 prod — already parameterized in the dormant module).

4. **Stream runner coexistence:** The stream runner can remain as the "simple path" for streams that don't need separation. Different streams can use different execution models.

5. **Cursor management:** Poller still needs cursor. Two options:
   - Keep cursor in Postgres (`get_stream_cursor` / `save_stream_cursor`) — simplest
   - Move cursor to DynamoDB if DynamoDB is already adopted (B1b)

---

#### B2b. Step Function pagination loop

**Trigger:** Single Lambda or split poller hits the 15-minute timeout on large backfills or slow vendor APIs.

**Changes:**

1. **Prerequisites:** DynamoDB table must exist (for run records, cursors, freshness). Adopt B1b first, or provision the full DynamoDB table at this point.

2. **Re-enable all 4 Lambda handlers:** initializer, poller, processor, finalizer. All are implemented in `src/lambdas/*/handler.py`.

3. **Apply Step Function:** The full 13-state definition is already written in `infra/modules/stream-poller/main.tf`. Either:
   - Apply the `stream-poller` module via the dormant `main.tf`, or
   - Copy the Step Function + EventBridge resources into `mvp.tf`

4. **Disable MVP path for that stream:** Remove or disable the stream runner's EventBridge rule. Enable the Step Function's EventBridge rule.

5. **Cursor handoff** (see procedure below).

6. **Inter-Lambda contracts:** `src/shared/contracts.py` becomes load-bearing again — the Step Function passes Pydantic-serialized payloads between states.

---

#### B2c. Webhook receiver

**Trigger:** Webhook volume justifies real-time ingestion alongside polling (belt-and-suspenders).

**Changes:**

1. **Prerequisite:** Processor Lambda must be separated (B2a) — webhooks write to SQS, processor reads from SQS.

2. **Apply `stream-webhook` module:** API Gateway + SQS route already defined in `infra/modules/stream-webhook/`.

3. **Implement webhook Lambda handler:** This is the one piece of the battle-hardened architecture not yet written. It needs:
   - HMAC validation (Shopify webhook secret from SSM)
   - Raw payload write to S3 (same `s3_writer.py`)
   - SQS enqueue with S3 key
   - Return 200 to webhook sender

4. **SSM:** Webhook secret already has a parameter path defined.

---

### Tier 3: Full architecture activation

**Trigger:** 5+ streams where parameterized Terraform modules pay off, or all Tier 1/2 components have been individually adopted and the flat `mvp.tf` is unwieldy.

**Changes:**

1. **Apply `infra/environments/dev/main.tf`** as written. This creates all resources from all three modules.

2. **Migrate Terraform state:** Import existing MVP resources into the modular state, or destroy MVP resources and let the modules recreate them. The latter is simpler if a brief cutover window is acceptable.

3. **Migrate cursors from Postgres → DynamoDB** (see procedure below).

4. **Decommission `mvp.tf`** — remove file or move to `infra/environments/dev/archived/`.

5. **Run full test suite** to confirm the pipeline works end-to-end with all 4 Lambdas + Step Function.

---

### Cursor handoff procedure

When graduating a stream from MVP (Postgres cursor) to battle-hardened (DynamoDB cursor):

```
1. Pause the stream
   - Disable the MVP EventBridge rule for that stream

2. Read the current cursor
   - SELECT cursor_value FROM control.stream_cursors
     WHERE source = '{source}' AND stream = '{stream}' AND store_id = '{store_id}';

3. Write to DynamoDB
   - PK: STREAM#{source}#{stream}#{store_id}
   - SK: CURSOR#current
   - cursor_value: <value from step 2>
   - updated_at: <now>
   - run_id: <last run_id from step 2>

4. Enable the Step Function EventBridge rule

5. Verify
   - Watch the first Step Function execution
   - Confirm it picks up the cursor and fetches from the correct point
   - Confirm records flow to Postgres without duplicates

6. Leave control.stream_cursors row in place
   - It's a useful audit artifact showing when the handoff occurred
```

---

### Dependency graph

```
                    Tier 1: Independent
        ┌───────────────┬──────────────────┐
        │               │                  │
   ┌────▼────┐   ┌──────▼───────┐   ┌─────▼──────┐
   │  VPC +  │   │  DynamoDB    │   │ Dashboard  │
   │  RDS    │   │  Idempotency │   │  + Alarms  │
   │  Proxy  │   │              │   │            │
   └────┬────┘   └──────┬───────┘   └────────────┘
        │               │
        │     Tier 2: Lambda Decomposition
        │               │
   ┌────▼───────────────▼────┐
   │  Split Poller/Processor │
   │  (reuse existing code)  │
   └────────────┬────────────┘
                │
   ┌────────────▼────────────┐     ┌────────────────────┐
   │  Step Function Loop     │◄────│ DynamoDB (required) │
   │  (reuse existing ASL)   │     └────────────────────┘
   └────────────┬────────────┘
                │
   ┌────────────▼────────────┐
   │  Webhook Receiver       │
   │  (needs split processor)│
   └─────────────────────────┘

                │
        Tier 3: Full Activation
                │
   ┌────────────▼────────────┐
   │  Apply main.tf          │
   │  (all modules, all      │
   │   resources, ~91/env)   │
   └─────────────────────────┘
```

---

## Resource count comparison

| | MVP (Phase 0) | + Tier 1 (all) | + Tier 2 (all) | Full (Tier 3) |
|--|---------------|----------------|----------------|---------------|
| AWS resources per env | ~26 | ~55 | ~75 | ~91 |
| Lambda functions | 2 | 2 | 8+ | 8+ |
| Terraform LOC | ~300 | ~600 | ~1,200 | ~2,350 (modules) |
| Python files touched | 1 new handler | +1 method | +0 (reuse dormant) | +0 |

---

## What this ADR is NOT

This is not a commitment to adopt every tier. It's a map. Some streams may live on the MVP architecture permanently if they never hit a scale-up trigger. The stream runner is a valid long-term execution model for low-volume streams. The battle-hardened architecture is the ceiling, not the floor.
