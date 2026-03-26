# Data Streams Platform — Claude instructions

## After every code change
- Bump `VERSION` in `pyproject.toml`
- Append a short entry to the **Change Log** (below)

---

## Philosophy
This repository is a **scuttleable prototype**.
Optimize for fast iteration, clarity, and rebuildability. Avoid overengineering.
If uncertain, choose the simplest approach that still works end-to-end.

---

## What this is
A serverless data ingestion platform that pulls vendor data (starting with Shopify) into a standardized, replayable, observable system. One pattern done extremely well: **Vendor API → S3 (raw) → Processor → Postgres (canonical)**, with DynamoDB as the control plane. Built by and for a solo CTO running a high 8-figure business.

---

## Environments
**Single prod environment only (ADR-023).** No separate dev. The `dev-mvp/` Terraform exists as reference but is not deployed — don't maintain it. All work targets `infra/environments/prod-mvp/`. If you need to test a risky change, spin up a temporary cluster and tear it down.

---

## Stack
- **Runtime:** Python 3.12, Pydantic v2
- **Infrastructure:** Terraform (flat file per environment, `prod-mvp/main.tf`)
- **Compute:** AWS Lambda (stream-runner per polling stream + webhook-consumer)
- **Orchestration:** EventBridge schedules (polling), API Gateway → SQS (webhooks)
- **Storage:** S3 (immutable raw), Aurora Serverless v2 Postgres (business data + control plane)
- **Secrets:** SSM Parameter Store (SecureString)
- **Observability:** CloudWatch metrics + alarms + structured logs (structlog)
- **Scheduling:** EventBridge rules

---

## Golden Path (IMPORTANT)
To keep the code coherent and easy to regenerate, follow this structure:

```
data-streams/
├── CLAUDE.md
├── pyproject.toml
├── streams/                        # Stream YAML definitions (the config layer)
│   └── shopify-orders.yaml
├── schemas/                        # Pydantic models (the contract layer)
│   ├── raw/shopify/order.py        # Permissive raw vendor model
│   └── canonical/shopify/
│       ├── order_v3.py             # Strict canonical model
│       └── transforms.py           # Pure functions: raw → canonical
├── src/
│   ├── lambdas/                    # Lambda handlers (thin — delegate to shared)
│   │   ├── poller/handler.py       # Fetch one page from Shopify, write raw to S3
│   │   ├── processor/handler.py    # Read S3 → validate → transform → upsert Postgres
│   │   └── finalizer/handler.py    # Close run, compute freshness, emit metrics
│   └── shared/                     # Shared libraries (the logic layer)
│       ├── contracts.py            # All Pydantic input/output models for Lambdas
│       ├── stream_config.py        # Parse stream YAML → Pydantic StreamConfig
│       ├── schema_registry.py      # Route (source, stream) → models + transform
│       ├── s3_writer.py            # Write + gzip + metadata → return S3 key
│       ├── dynamo_control.py       # Run CRUD, cursor CRUD, idempotency, freshness
│       ├── pg_client.py            # Connection via RDS Proxy, upsert, transactions
│       └── observability.py        # structlog setup, CloudWatch metric helper
├── migrations/                     # Postgres DDL (numbered, sequential)
│   └── 001_shopify_orders.sql
├── infra/                          # Terraform
│   ├── modules/
│   │   ├── stream-platform/        # Core: S3 bucket, DynamoDB table, Aurora, IAM
│   │   ├── stream-poller/          # Parameterized: Step Function + EventBridge + poller Lambda
│   │   └── stream-webhook/         # Parameterized: API Gateway + SQS + webhook Lambda
│   ├── environments/
│   │   ├── prod-mvp/main.tf        # ACTIVE — single prod environment (ADR-023)
│   │   ├── dev-mvp/main.tf         # Reference only — not deployed
│   │   ├── dev/main.tf             # Dormant (battle-hardened, not deployed)
│   │   └── prod/main.tf            # Dormant (battle-hardened, not deployed)
│   └── shared/                     # Terraform backend, lock table
├── tests/
│   ├── fixtures/shopify/orders/    # Real API responses (3+ per stream)
│   ├── test_transforms.py
│   ├── test_stream_config.py
│   └── test_idempotency.py
└── docs/                           # Architecture, specs, guides (already written)
```

### Rules
- **Lambdas are thin.** Handlers parse input, call shared libs, return output. No business logic in handlers.
- **Shared libs are the logic layer.** All reusable logic lives in `src/shared/`.
- **Schemas are the contract layer.** Raw models are permissive (`extra="allow"`). Canonical models are strict. Transforms are pure functions.
- **Stream YAML is the config layer.** Adding a new stream for an existing source = YAML + schema + migration. No new Lambda code.
- **`src/shared/contracts.py` is the interface boundary.** Every Lambda's input/output is a Pydantic model defined here.
- **Only `src/shared/dynamo_control.py` talks to DynamoDB.** Only `src/shared/pg_client.py` talks to Postgres. Only `src/shared/s3_writer.py` writes to S3.

---

## Data model

### DynamoDB (`data-streams-control-{env}`, single table, on-demand)

- **Run Record** — `PK: STREAM#{source}#{stream}#{store_id}`, `SK: RUN#{run_id}`
  - Tracks each polling execution: status, cursor range, page/record counts, timing
  - No TTL (permanent audit trail)

- **Cursor Checkpoint** — `PK: STREAM#{source}#{stream}#{store_id}`, `SK: CURSOR#current`
  - Where last successful run stopped; next run starts here
  - Fields: `cursor_value`, `updated_at`, `run_id`

- **Idempotency Record** — `PK: IDEM#{source}#{stream}`, `SK: {sha256_hash}`
  - Prevents duplicate processing; hash computed from `idempotency_key` fields in stream spec
  - TTL: 30 days

- **Freshness Status** — `PK: STREAM#{source}#{stream}#{store_id}`, `SK: FRESHNESS#current`
  - `last_record_at`, `checked_at`, `lag_minutes`
  - Updated by finalizer every run

### S3 (`data-streams-raw-{env}`)

- Polling: `{source}/{stream}/{store_id}/{YYYY}/{MM}/{DD}/{run_id}/page_{NNN}.json.gz`
- Webhooks: `{source}/{stream}/{store_id}/webhooks/{YYYY}/{MM}/{DD}/{webhook_id}.json.gz`
- SSE-S3 encryption, versioning enabled, lifecycle: Glacier at 90d

### Postgres (Aurora Serverless v2, via RDS Proxy)

- `shopify.orders` — current-state table with upsert-on-newer pattern
- `shopify.orders_history` — append-only change log, `UNIQUE (order_id, store_id, changed_at)`
- Every row carries: `raw_s3_key` (lineage), `schema_version`, `run_id`, `ingested_at`

### SSM Parameters

- `/data-streams/{env}/shopify/access_token` (GraphQL Admin API token — used by poller)
- `/data-streams/{env}/shopify/webhook_secret`
- `/data-streams/{env}/postgres/connection_string`

---

## Lambda runtime contracts (summary)

### shopify-poller
- **In:** `run_id`, `stream_config`, `store_id`, `cursor`, `page_number`
- **Out:** `s3_key`, `record_count`, `next_cursor`, `has_more`, rate limit info
- **Does:** Fetch one API page, write raw to S3, update run record
- **Does NOT:** Process data, write to Postgres, decide pagination

### processor
- **In:** `source`, `stream`, `s3_key`, `run_id`, `store_id`, `trigger`
- **Out:** `records_processed`, `records_skipped`, `records_failed`, `errors`
- **Does:** Read S3 → validate raw → transform to canonical → check idempotency → upsert Postgres → write idempotency key
- **Does NOT:** Call vendor APIs, manage cursors

### run-finalizer
- **In:** `run_id`, `stream_config`, `store_id`, totals, `status`, `final_cursor`
- **Out:** `freshness_lag_minutes`, `status`
- **Does:** Close run record, update cursor, compute freshness, emit CloudWatch metrics
- **Does NOT:** Process data, call APIs

---

## Orchestration

**Step Function (polling):**
```
Initialize → FetchPage → ProcessPage → CheckMore
  ├─ has_more=true → ThrottleWait → FetchPage (loop)
  └─ has_more=false → Finalize
Error states: HandleFetchError, HandleProcessError → always reach Finalize
Timeout: 30min incremental, 4hr backfill
```

**EventBridge:** `rate(5 minutes)` → triggers Step Function

---

## Key design invariants
1. **Raw data is immutable.** Never modify or delete S3 raw payloads.
2. **Processor is stateless and deterministic.** Same S3 input → same Postgres output.
3. **Idempotency is two-layer.** DynamoDB (fast check, 30d TTL) + Postgres UNIQUE constraint (safety net).
4. **Upsert checks `updated_at`.** Never overwrite newer data with older data.
5. **Config over code.** New stream for existing source = YAML + schema + migration, not new Lambda code.

---

## Acceptance criteria (V1)
The MVP is "done" when:
- Shopify Orders stream is flowing end-to-end in dev
- Raw payloads land in S3 at correct key paths
- Run records, cursors, and freshness tracked in DynamoDB
- Orders upserted to Postgres `shopify.orders` with history in `shopify.orders_history`
- Idempotency prevents duplicate processing on retry/replay
- CloudWatch dashboard shows freshness, throughput, and errors
- Freshness alarm fires when SLA breached
- Manual replay from S3 works correctly
- `terraform plan` is clean for both dev and prod
- All unit tests pass (transforms, config parsing, idempotency)

---

## Rebuild instructions
If this repository is lost or needs to be recreated:
1. Re-read this `CLAUDE.md` + all docs in `docs/`
2. Recreate the directory structure per the **Golden Path**
3. Implement `streams/shopify-orders.yaml` per `docs/specs/stream-spec.md`
4. Implement schemas (raw + canonical + transforms) per `docs/guides/adding-a-stream.md`
5. Implement shared libs per `docs/specs/runtime-contracts.md`
6. Implement Lambda handlers (thin wrappers over shared libs)
7. Implement Postgres migrations per `docs/specs/data-model.md`
8. Implement Terraform modules per V1 checklist (`docs/roadmap/v1-checklist.md`)
9. Write tests with real Shopify fixture data
10. Confirm acceptance criteria

---

## Change Log
- V0 — initial scaffold
- V1 — CTO Vision slide deck: 16-slide AI-Native Operational Advantage presentation
- V2 — Rewrote CLAUDE.md for the real Python/Terraform Data Streams platform
- V3 — Terraform infrastructure: stream-platform (VPC, S3, DynamoDB, Aurora, RDS Proxy, IAM, SQS, SNS, SSM), stream-poller (Lambdas, Step Function, EventBridge, alarms), stream-webhook (API Gateway + SQS stub), dev + prod environments
- V4 — Terraform conformance fixes: added initializer Lambda (generates run_id, creates run record, reads cursor), fixed EventBridge input to match Step Function contract, fixed webhook QueueUrl (was ARN), added error rate + 429 storm alarms, added CloudWatch dashboard with 7 widgets
- V5 — Critical Step Function fix: Initialize ResultPath was null (discarded Lambda output), changed to "$". Fixed HandleFetchError status to "partial_failure" per spec. Fixed dashboard widget #7 to SQS queue depth per operability guide
- V6 — Step Function data flow fixes: added PrepareFinalize state (sets status="success" + normalizes field names), fixing cursor never advancing on success (finalizer checked status="success" but received "running"). Fixed Finalize reading $.cursor after HandleFetchError replaced state with $.final_cursor. Added error_message passthrough to match FinalizerInput contract. Added Aurora final_snapshot_identifier for prod (required when skip_final_snapshot=false)
- V7 — Added .gitignore: Python bytecode, venvs, .pytest_cache, IDE files, .terraform dirs, tfstate, secrets, OS files, Lambda zips
- V8 — Conformance fixes: fixed freshness metric dimension mismatch (alarm/dashboard used 2 dims, code emitted 3), added API health metrics to poller (http_429_count, http_5xx_count, pages_fetched — required by Terraform alarm #5 and dashboard widget #6), removed duplicate records_processed emission from finalizer (already emitted by processor)
- V9 — Bug fixes: (1) Step Function rate limit throttle crash — UpdateAccumulator dropped fetch_result, so CheckRateLimitWait/ThrottleUntilReset referenced missing path; now carries rate_limit_reset_at as top-level field. (2) Lambda package missing streams/ dir — initializer and processor would fail at runtime. (3) Updated SSM docs for GraphQL migration (access_token replaces api_key/api_secret). (4) Safe order_number parsing from GraphQL name field. (5) EventBridge store_id now a variable (supports multi-store).
- V10 — Cleanup: (1) Removed stale SSM parameters (api_key, api_secret) from Terraform — replaced by access_token in V9 GraphQL migration. (2) Fixed test_e2e_local.py importing duplicate ShopifyResponse from poller handler — now uses canonical ShopifyPage from shopify_client. (3) Removed duplicate ShopifyResponse class from poller handler.
- V11 — Doc fixes: (1) Updated ADR-011 to remove deprecated api_key/api_secret SSM paths and example, now shows only access_token/webhook_secret/connection_string. (2) Updated v1-checklist SSM parameter list and secrets section to match GraphQL migration. (3) Updated adding-a-stream guide with complete SchemaEntry constructor (was missing raw_page_model, version, record_list_field, idempotency_field_map).
- V12 — Removed stale api_key/api_secret reference from DEV_CHECKLIST.md SSM secrets section.
- V13 — Added dual_ai_checker.py: two Claude instances loop (builder + reviewer) until code matches architecture docs. Reviewer reads docs + code and produces structured findings; builder fixes; loop until LGTM or max rounds.
- V14 — Fixed dual_ai_checker.py: added --verbose flag to claude CLI invocation (required when using --output-format stream-json).
- V15 — dual_ai_checker.py: added unified DOCS.md synthesis. Checks if DOCS.md exists with mod date after last docs/ commit; if stale/missing, uses Claude to synthesize all docs into one file. Reviewer and builder then read DOCS.md instead of individual doc files, saving tokens and ensuring consistent context.
- V16 — dual_ai_checker.py: added --dangerously-skip-permissions to auto-approve all safe actions. Added --builder-prompt and --reviewer-prompt flags to override default system prompts per AI.
- V17 — dual_ai_checker.py: fixed pipe deadlock that caused hangs during DOCS.md synthesis. stderr=PIPE was never drained while reading stdout — when --verbose filled the 64KB stderr buffer, subprocess blocked on write and Python blocked on stdout read. Changed to stderr=DEVNULL.
- V18 — ADR-020: Gorgias secrets stay in SSM Parameter Store (not Secrets Manager). No programmatic rotation available for Gorgias API keys; blast radius is vendor-bounded not storage-bounded; consistency with Shopify pattern.
- V19 — ADR-021: Intentional simplification to single-Lambda MVP. Battle-hardened 4-Lambda/Step Function/DynamoDB architecture preserved as dormant code; MVP ships 1 Lambda per stream + EventBridge + Postgres-only control plane. Updated phases.md (added Phase 0), not-building.md (added dormant components table), v1-checklist.md (added ADR-021 reference).
- V20 — ADR-022: MVP implementation plan and scale-up path. Documents the exact files, handler design, Terraform shape, deployment sequence, and tiered scale-up path (Tier 1: independent components, Tier 2: Lambda decomposition, Tier 3: full main.tf activation). Includes cursor handoff procedure, dependency graph, and resource count comparison across tiers.
- V21 — MVP implementation: (1) `src/lambdas/stream_runner/handler.py` — single Lambda that fetches all pages, writes raw to S3, transforms, upserts Postgres, saves cursor. Reuses all existing shared libs unchanged. (2) `migrations/003_stream_cursors.sql` — Postgres cursor table replacing DynamoDB control plane. (3) `src/shared/pg_client.py` — added `get_stream_cursor()` and `save_stream_cursor()` methods. (4) `infra/environments/dev-mvp/` + `prod-mvp/` — flat Terraform (~300 LOC each), own directories with separate state from dormant main.tf. (5) `tests/test_stream_runner.py` — 7 tests covering full run, multi-page, error handling, rate limit retry, empty run, Gorgias, max pages. All 46 tests pass.
- V22 — LAUNCH.md: step-by-step deployment guide for the MVP. Covers Lambda package build, Terraform apply, SSM secrets, migrations, smoke tests for both streams, schedule verification, alarm confirmation, troubleshooting, and scale-up pointers. Moved MVP Terraform from `dev/mvp.tf` to `dev-mvp/main.tf` (Terraform loads all .tf files in a directory — can't coexist with dormant main.tf). Fixed Lambda package Docker build (entrypoint override needed).
- V23 — Added Shopify Customers stream: stream YAML config (`streams/shopify-customers.yaml`), raw model with GraphQL normalization (`schemas/raw/shopify/customer.py`), canonical model (`schemas/canonical/shopify/customer_v1.py`), Postgres migration with current-state + history tables (`migrations/004_shopify_customers.sql`). Reuses `ShopifyAddressRaw` from order module. No new Lambda code — config-over-code pattern.
- V24 — Added Shopify Products stream: stream YAML (`streams/shopify-products.yaml`), raw models with GraphQL normalization for products/variants/images (`schemas/raw/shopify/product.py`), canonical model (`schemas/canonical/shopify/product_v1.py`), transform functions (`schemas/canonical/shopify/transforms.py`), Postgres migration with current-state + history tables (`migrations/005_shopify_products.sql`), schema registry entry. Config-over-code pattern — no new Lambda code.
- V25 — Added Shopify Inventory stream: multi-location inventory with PK = (inventory_item_id, location_id, store_id). Stream YAML, raw models with GraphQL edge unwrapping and GID normalization, canonical model, transform that flattens items with nested levels into one record per (item, location) pair, Postgres migration with current-state + history tables, schema registry entry with `transform_returns_list=True`.
- V26 — Tier 2 full-store Shopify sync. (1) Refactored `ShopifyOrdersClient` into generic `ShopifyGraphQLClient` with per-stream queries (orders, customers, products, inventory). Factory function `get_shopify_client(stream)`. (2) Sub-stream extraction: `SubStreamDef` in schema registry, refunds and transactions extracted from order payloads during both polling and webhook processing. Expanded orders GraphQL query to include refunds(first:10) and transactions(first:50). (3) Webhook consumer Lambda (`src/lambdas/webhook_consumer/handler.py`): SQS-triggered, validates HMAC, routes topics to schemas, handles customer soft-delete. Updated `stream-webhook` Terraform module with SQS MessageAttributes for topic + HMAC. (4) Terraform: 3 new polling Lambdas (customers 15min, products 30min, inventory 15min), SQS webhook queue + DLQ, API Gateway webhook endpoint, webhook consumer Lambda with reserved concurrency=5, 7 new CloudWatch alarms. (5) All pg_client upsert/history methods for customers, products, inventory, refunds, transactions. All 46 tests pass.
- V27 — Dual-write + seed + webhook registration. (1) `src/shared/brandhaus_writer.py` — BrandhausWriter class that upserts raw_json to existing brandhaus Postgres tables (orders, customers, products, refunds, transactions). Controlled by `DUAL_WRITE_ENABLED` env var. Wired into both stream_runner and webhook_consumer handlers. (2) `scripts/seed_from_brandhaus.py` — batch-reads raw_json from brandhaus, writes to S3 (immutable audit trail), transforms into data-streams canonical tables, sets cursors so incremental polling picks up where seed left off. Handles sub-stream extraction for orders (refunds/transactions). (3) `scripts/register_shopify_webhooks.py` — registers webhook subscriptions via Shopify GraphQL Admin API `webhookSubscriptionCreate` mutation. Idempotent (checks existing subscriptions first). (4) SSM parameter for brandhaus connection string in Terraform.
- V28 — Prod-MVP parity: added shopify-customers, shopify-products, shopify-inventory Lambdas + EventBridge schedules, SQS webhook queue + DLQ, webhook API Gateway module, webhook consumer Lambda with SQS event source mapping (ReportBatchItemFailures), 5 new CloudWatch alarms (customers/products/inventory errors, webhook consumer errors, webhook DLQ depth), brandhaus_connection_string SSM parameter, expanded IAM for_each to all 5 streams, and new outputs. All log groups use 30-day retention.
- V29 — ADR-023: single prod environment, no separate dev. `dev-mvp/` retained as reference only. Updated CLAUDE.md stack section and Golden Path to reflect prod-only deployment. Created AGENTS.md.
