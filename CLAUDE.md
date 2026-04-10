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
- **`src/shared/contracts.py` is the interface boundary.** Every Lambda's input/output is a Pydantic model defined here. (Used by dormant 4-Lambda architecture; stream_runner uses schema registry directly.)
- **Only `src/shared/pg_client.py` talks to Postgres.** Only `src/shared/s3_writer.py` writes to S3. (`brandhaus_writer.py` is a separate dual-write concern for the legacy system, gated by `DUAL_WRITE_ENABLED` env var.)

---

## Data model

### Control plane — Postgres (`control` schema, migration 003)

> **Note:** The original V2 design used DynamoDB for the control plane. The MVP architecture (ADR-021/022) moved all control state to Postgres. The DynamoDB code (`src/shared/dynamo_control.py`) is dormant but preserved for potential Tier 3 scale-up.

- **Stream Cursors** — `control.stream_cursors`
  - PK: `(source, stream, store_id)`
  - Tracks: `cursor_value`, `run_id`, `last_status`, `last_run_at`, `pages_total`, `records_total`
  - One row per stream per store — upserted after each successful run

### S3 (`data-streams-raw-{env}`)

- Polling: `{source}/{stream}/{store_id}/{YYYY}/{MM}/{DD}/{run_id}/page_{NNN}.json.gz`
- Webhooks: `{source}/{stream}/{store_id}/webhooks/{YYYY}/{MM}/{DD}/{webhook_id}.json.gz`
- SSE-S3 encryption, versioning enabled, lifecycle: Glacier at 90d

### Postgres (Aurora Serverless v2)

Source-canonical schemas per vendor, plus published and analytical schemas:

- `shopify.*` — orders, customers, products, inventory_levels, refunds, transactions (+ history tables)
- `gorgias.*` — tickets (+ history)
- `yotpo.*` — reviews_raw_current, review_metadata_current, snapshot_sets, snapshot_runs (+ history tables)
- `reviews.*` — yotpo_reviews_current, generalized_reviews_current, identity_links, publish_exceptions, publish_audit
- `analytics.*` — ga4_page_daily, ga4_event_daily, ga4_page_variant_daily, ga4_sync_runs
- `control.*` — stream_cursors

Every source-canonical row carries: `raw_s3_key` (lineage), `schema_version`, `run_id`, `ingested_at`

### Access control (migration 016)

- `data_reader` — analysts, dashboards. Non-PII tables only.
- `data_operator` — pipeline debugging, oncall. Inherits `data_reader` + PII tables.
- `data_identity` — future: scoped for Customer 360 when built.
- Admin — DDL, role management, superuser.

### SSM Parameters

- `/data-streams/{env}/shopify/access_token`
- `/data-streams/{env}/shopify/webhook_secret`
- `/data-streams/{env}/gorgias/email`
- `/data-streams/{env}/gorgias/api_key`
- `/data-streams/{env}/yotpo/app_key`
- `/data-streams/{env}/yotpo/secret_key`
- `/data-streams/{env}/postgres/connection_string`
- `/data-streams/{env}/brandhaus/connection_string`
- `/data-streams/{env}/ga4/ingest_secret`

---

## Lambda runtime contracts

### stream-runner (MVP — ADR-021/022, production)
- **In:** `{source, stream, store_id}` from EventBridge
- **Out:** `{run_id, status, pages, records_processed, records_failed, cursor, errors}`
- **Does:** Full loop: fetch all pages → write raw to S3 → transform → upsert Postgres → save cursor. For Yotpo streams, also triggers publication pass (last-writer-wins, ADR-034).
- **Does NOT:** Manage inter-Lambda state, use DynamoDB, use Step Functions

### Dormant 4-Lambda architecture (preserved for Tier 3 scale-up)
> The following handlers exist in the codebase but are NOT deployed. See ADR-021 for rationale, ADR-022 for scale-up path. The `infra/environments/dev/` and `infra/environments/prod/` Terraform directories wire this architecture but are not applied.

- `src/lambdas/initializer/handler.py` — generate run_id, create DynamoDB run record, read cursor
- `src/lambdas/poller/handler.py` — fetch one API page, write raw to S3
- `src/lambdas/processor/handler.py` — read S3 → validate → transform → upsert Postgres
- `src/lambdas/finalizer/handler.py` — close run, update cursor, emit metrics

---

## Orchestration

**EventBridge** → triggers stream_runner Lambda directly on schedule (per-stream rates defined in Terraform).

> The dormant architecture uses Step Functions (Initialize → FetchPage → ProcessPage → CheckMore loop → Finalize). See `infra/modules/stream-poller/` for the preserved Step Function definition.

---

## Dashboard (Data Streams Explorer)

The `apps/` directory contains a read-only internal analytics surface (ADR-031):
- `apps/web/` — React/Vite frontend (stream selection home + GA4 stream view)
- `apps/api/` — Express/Node.js API server (GA4 query execution against `analytics.*` tables)

The dashboard reads from `analytics.*` Postgres tables only. It does not read source-canonical or ingestion tables. The analytical contract is defined in `docs/specs/analytics-contract.md`.

---

## Key design invariants
1. **Raw data is immutable.** Never modify or delete S3 raw payloads.
2. **Upsert checks `updated_at`.** Never overwrite newer data with older data.
3. **Config over code.** New stream for existing source = YAML + schema + migration, not new Lambda code.
4. **PII boundaries are database-enforced.** Schema-level GRANT/REVOKE, not application-level filtering (ADR-035).
5. **Source-canonical stays source-shaped.** Generalization happens at publication, not ingestion (ADR-033).

---

## Operational scripts

All scripts are in `scripts/`. All AWS commands target `us-east-1` (ADR-038).

### Deploy code to Lambda

```bash
# All functions:
bash scripts/deploy-lambda.sh

# Single function:
bash scripts/deploy-lambda.sh data-streams-runner-yotpo-reviews-prod
```

### Invoke streams manually

```bash
# Yotpo reviews:
bash scripts/invoke-yotpo.sh

# Yotpo review metadata:
bash scripts/invoke-yotpo.sh review-metadata

# Any other Lambda (Shopify, Gorgias):
aws lambda invoke --region us-east-1 --function-name data-streams-runner-gorgias-tickets-prod \
  --cli-binary-format raw-in-base64-out --cli-read-timeout 900 \
  --payload '{"source":"gorgias","stream":"tickets","store_id":"YOUR_STORE_ID"}' /tmp/result.json && cat /tmp/result.json
```

### Connect to prod database

```bash
# Interactive:
bash scripts/psql-prod.sh

# Single query:
bash scripts/psql-prod.sh -c "SELECT COUNT(*) FROM yotpo.reviews_raw_current;"
```

### Full deploy + invoke + verify cycle (Yotpo)

```bash
bash scripts/deploy-yotpo.sh
```

### Check backfill progress

```bash
bash scripts/psql-prod.sh -c "
  SELECT source, stream, cursor_value, last_status, records_total, last_run_at
  FROM control.stream_cursors ORDER BY source, stream;"
```

### Check review corpus health

```bash
bash scripts/psql-prod.sh -c "
  SELECT COUNT(*) as reviews, COUNT(DISTINCT domain_key) as products,
  COUNT(*) FILTER (WHERE domain_key IS NULL) as missing_dk,
  ROUND(AVG(score)::numeric, 2) as avg_score
  FROM yotpo.reviews_raw_current;"
```

### Check review gap vs Yotpo API

```bash
.venv/bin/python scripts/check_review_caps.py
```

### Legacy MySQL seed (one-time backfill, ADR-041/042)

```bash
# Requires SSM tunnel to MySQL active (port 3308)
# Requires: AWS_REGION, RAW_BUCKET env vars
AWS_REGION=us-east-1 RAW_BUCKET=data-streams-raw-prod bash scripts/seed-from-mysql.sh
```

Processes reviews + metadata from legacy MySQL in batches of 20K. Pre-filters existing IDs in memory, bulk-inserts metadata. Cursor-resumable — Ctrl+C and re-run picks up where it left off.

### Reconcile Postgres vs MySQL (1000 random reviews)

```bash
# Requires SSM tunnel to MySQL active
AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 .venv/bin/python scripts/reconcile_sample.py
```

Compares score, title, votes, verified_buyer, deleted, name, image count, state, and country. Excludes domain_key (different ID systems) and content (MySQL latin1 loses emoji). 98.7% match rate expected.

### Check metadata from new system (not MySQL seed)

```bash
AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 .venv/bin/python scripts/test_new_metadata.py
```

Shows reviews created in last 3 days, how many have metadata, and samples of recent metadata with ingestion timestamps. Verifies the metadata Lambda is working for new reviews after the MySQL seed baseline.

### Terraform (infrastructure changes)

```bash
cd infra/environments/prod-mvp
# Requires terraform.tfvars with yotpo_store_id, shopify_store_id, db_master_password
terraform plan -lock=false
terraform apply -lock=false
```

### Set SSM secrets (always include --region us-east-1)

```bash
aws ssm put-parameter --region us-east-1 --name /data-streams/prod/VENDOR/KEY --type SecureString --value "VALUE" --overwrite
```

### Check CloudWatch logs

```bash
aws logs tail --region us-east-1 /aws/lambda/data-streams-runner-yotpo-reviews-prod --since 60m --no-cli-pager
```

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

- 0.34.0 — Added ADR-029, introduced GA4 event normalization schema changes, and updated the dashboard API to default to normalized valid events while keeping noise and path leaks queryable.
- 0.35.0 — Replaced the single-event picker with curated top-event checkboxes, defaulted the dashboard to those normalized events, removed redundant landing controls from the visible workflow, and updated API/mock filtering to support multi-event selection.
- 0.36.0 — Added select-all and deselect-all controls for the top-event filter and visible-column pickers, and let tables render a clear empty state when all columns are hidden.
- 0.36.1 — Fixed empty event selection handling so deselecting all top events now returns zero event rows instead of dropping the event filter.
- 0.37.0 — Added ADR-030 to split the GA4 dashboard product out of `data-streams` and defined the exact ownership boundary between ingestion responsibilities and analyst-facing dashboard concerns.
- 0.38.0 — Added the analytics contract spec, superseded ADR-030 with ADR-031, and re-framed the dashboard as a read-only internal suite surface inside `data-streams` bound by documented analytical contracts.
- 0.39.0 — Renamed the in-repo analytical surface to Data Streams Explorer across app copy and core docs, positioning GA4 as the first stream view inside a broader internal suite surface.
- 0.40.0 — Added a true Data Streams Explorer home view with stream selection, making GA4 a navigable stream module instead of the default root screen.
- 0.74.0 — ADR-046: seed lock contention and EventBridge guard. Seed hung silently for 2+ hours due to stale Lambda connection holding idle-in-transaction lock. Seed script now auto-disables all EventBridge rules before processing, re-enables on exit (trap EXIT). Fixed S3 writer to use explicit region. Detection playbook for lock contention.
- 0.73.0 — ADR-045: Gorgias User-Agent block debugging playbook. Documents the 2-hour debug chain (auth methods → credential verification → transport comparison), the 2-minute playbook that should replace it, and the platform-wide rule to always set explicit User-Agent on urllib requests.
- 0.72.0 — Fixed Gorgias 403: urllib's default User-Agent (Python-urllib/3.12) blocked by Gorgias bot protection. Added explicit User-Agent header. Fixed Yotpo upsert to COALESCE domain_key/product_yotpo_id/product_name — prevents incremental merchant endpoint from overwriting API-backfilled values with NULL. Gorgias validated against live API.
- 0.71.0 — Pre-Gorgias audit fixes: SSM client now uses explicit region (was relying on env default — affected all streams), Gorgias cursor fallback for empty-page edge case (same class of bug as Yotpo cursor issue), documented snapshot logic as Yotpo-only in handler.
- 0.70.0 — ADR-044: automated stage gate snapshots. Lambda auto-creates Aurora snapshots at two rebuild stage gates: (1) API backfill complete (cursor switches position→timestamp), (2) MySQL seed complete (has_more=False). After these gates, Aurora point-in-time restore handles steady state. Added rds:CreateDBClusterSnapshot IAM permission to stream runner roles. Snapshot creation is non-fatal — logs warning on failure.
- 0.69.0 — ADR-043: stream rebuild from scratch. Full purge and rehydrate procedure after Yotpo data became impure (MySQL seed overwrote API domain_keys with Yotpo internal IDs). Documents authority hierarchy (vendor API first, legacy DB gap fill only), 5-phase rebuild sequence, when to rebuild vs repair, TRUNCATE lock handling, and the principle that Postgres is the most disposable layer. MySQL seed now filters site reviews (product_id=0), skips unmappable IDs, and uses storereviews_products for Yotpo→Shopify mapping.
- 0.68.0 — Fixed metadata API parse path (response.payload.customer, not response.metadata.customer). Validated 5/5 match between Yotpo API metadata and MySQL metadata. No bad data entered the system — the metadata Lambda timed out before the bug could produce empty values. PII fields (email, name, address, phone) captured from metadata API response for identity companion.
- 0.67.0 — Yotpo stream declared golden. Added reconciliation script (scripts/reconcile_sample.py) comparing 1000 random reviews between Postgres and MySQL: 98.7% perfect match, remaining 1.3% explained by MySQL latin1 emoji loss, API vote drift, and null handling. Postgres data is strictly better than MySQL for emoji content. Updated ADR-042 with reconciliation methodology, accepted mismatch categories, and first results.
- 0.66.0 — Updated ADR-042 with performance optimizations and golden path for future seeds: pre-filter existing IDs in memory, bulk INSERT metadata (1000 rows/statement), reviews + metadata in one pass, progress output with rate/ETA, 20K batch size. Documented 10-step golden path for Gorgias and future legacy seeds.
- 0.65.0 — Added ADR-042: legacy seed operational lessons. Documents six failures during first seed attempt — Lambda can't reach private RDS, credential exposure in conversation, S3 region mismatch, per-record commit latency, processing 200K existing records to find 9K gaps, no progress visibility. Optimized seed: pre-filter existing IDs in memory, batch commits every 100, progress output, 20K batch size. Metadata stream deferred to post-seed baseline.
- 0.64.0 — Added MySQL seed mode (ADR-041): stream_runner handles mode=mysql_seed to backfill reviews + metadata from legacy MySQL. Reads storereviews_reviews + users + metadata with column-restricted user, writes raw to S3, transforms through standard pipeline, upserts to Postgres. Cursor tracks last MySQL ID for resumption across invocations. Also added pymysql dependency, fixed metadata stream to skip until MySQL seed populates baseline, added operational commands to CLAUDE.md.
- 0.63.0 — Fixed GID-prefixed domain_keys from bottom_lines (gid://shopify/Product/X → X). Backfill complete: 203,421 reviews across 744 products, cursor switched to incremental mode. Remaining 8,787 review gap (4.1%) is the 10K widget cap — fillable from MySQL per ADR-041.
- 0.62.0 — Added ADR-041: legacy MySQL seed plan for review gap fill. Documents source schema (shopify_api.storereviews_reviews + users + metadata + images + videos), 1:1 field mapping to data-streams canonical model, extraction SQL, and execution plan. Deferred until widget backfill completes and gaps are confirmed.
- 0.61.0 — Yotpo backfill-to-incremental switchover: client auto-detects mode from cursor (timestamp → merchant endpoint with since_updated_at, position → widget endpoint per product). Added daily product refresh (6 AM UTC cron) that diffs bottom_lines catalog against existing domain_keys and backfills only new products. Same Lambda, different EventBridge payload with mode=product_refresh. New reviews on new products are ingested within 24 hours.
- 0.60.0 — Added ADR-040: Yotpo first production deployment lessons. Documents the six-failure stabilization sequence (auth header, API shape mismatch, cursor persistence, SSM region, stale Lambda package, code cache), what went right (extra="allow", upsert-on-newer, S3 raw writes), and the operational scripts created. Fixed cursor persistence bug (checkpoint only emitted on completion, not mid-backfill). Created deploy-lambda.sh, invoke-yotpo.sh, psql-prod.sh, deploy-yotpo.sh operational scripts.
- 0.59.0 — Added ADR-038 (us-east-1 region rationale) and ADR-039 (operational resilience model: three tiers of failure behavior — self-healing, alerting, and silent). Documents what recovers automatically, what triggers alarms, and what requires periodic operator checks.
- 0.58.0 — Replaced direct API Gateway-to-SQS webhook integration with a routing Lambda (ADR-037). The HTTP API SQS-SendMessage integration cannot pass dynamic path parameters or headers as message attributes — discovered during first production deploy after four failed parameter formats. Routing Lambda extracts source/topic/HMAC/secret from the HTTP request and sends to SQS with native message attributes. Webhook consumer unchanged. Also fixed Aurora engine version (15.4 → 16.6) and S3 lifecycle filter. Full infrastructure deployed to prod.
- 0.57.0 — Restructured Yotpo client to two-phase fetch: bottom_lines endpoint for product catalog (757 products), then widget endpoint per product for reviews with full context (domain_key, verified_buyer, images_data, is_incentivized, incentive_type, user display_name). Fixed auth header (Authorization Bearer → X-Yotpo-Token). Updated raw model, canonical model, transform, pg_client upsert, and migration DDL to match actual widget response shape (added product_name, is_incentivized, incentive_type, archived; removed videos_data). Validated against live Yotpo API. 72/72 tests green.
- 0.56.1 — Added DATA_START_DATE (2026-04-04) as a hard floor for all date queries. Pre-cutoff data has missing critical events. Clamped in API parseFilters, frontend default filters, quick range presets, and date picker min attributes.
- 0.56.0 — Second coherence pass: created missing GA4 schema files (raw model, canonical model, transform) that blocked all Lambda cold-starts via schema_registry import failure, added ga4-events.yaml stream config, fixed 71/71 tests to green. Updated docs/README.md with current ADR index (034-036), marked dormant specs, fixed ADR-025/026 broken links, updated "How to use" section. Updated LAUNCH.md with Yotpo streams, SSM params, and migrations 010-016.
- 0.55.0 — Replaced raw metric columns with user-based ratios across both tabs. Pages shows Users, Views/User, Ev/User, Sess/User. Events shows Users, User Rate, Ev/User, Sess/User. Raw counts (views, sessions, event_count, page_users) default hidden but available in column picker. Date column trimmed to YYYY-MM-DD. Column ordering aligned between tabs for shared keys. Added `defaultHidden` support to column definitions.
- 0.54.0 — Coherence fixes: rewrote CLAUDE.md data model to reflect Postgres control plane (was stale DynamoDB), updated Lambda contracts to document stream-runner MVP vs dormant 4-Lambda architecture, added dashboard section to CLAUDE.md (ADR-031), added migration 009 placeholder documenting the numbering gap, added DORMANT markers to initializer/poller/processor/finalizer handlers, documented StreamStatus as informational-only (not enforced by Terraform), updated key design invariants and SSM parameter list, removed stale DynamoDB/Step Function references from current-state documentation.
- 0.53.0 — Added ADR-036: decision replication and ADR-driven autonomy. Documents why the decision-making layer is the platform's remaining single point of failure, decomposes judgment into three capabilities (timing, complexity calibration, sufficiency), and defines what the ADR corpus can and cannot transfer to future decision-makers.
- 0.52.0 — Platform-wide access control: migration 016 introduces `data_reader` (analysts, no PII) and `data_operator` (pipeline/oncall, inherits data_reader + PII tables) replacing per-source `reviews_reader`/`reviews_restricted`. Shopify PII tables (orders, customers + histories) and all Gorgias tables restricted to `data_operator` only. Non-PII Shopify tables (products, inventory, refunds, transactions), analytics, control, and published reviews tables granted to `data_reader`. Yotpo source-canonical and identity companion granted to `data_operator`. Customer 360 will get a future scoped `data_identity` role when built — must not connect as `data_operator`. Migration 015 role section annotated as superseded. All spec and ADR references updated.
- 0.51.0 — Added ADR-035: PII boundary enforcement in the review stream architecture. Documents schema-level access control model, JSONB PII tracing methodology, and the caught-during-review source-canonical grant leak. Fixed name/email column gaps in source-canonical DDL and upsert SQL, wired author_display_name through publication layers, and added raw_email to the restricted identity companion via source-canonical join.
- 0.50.0 — Built Yotpo reviews application code: YotpoClient REST client with utoken auth and page-number pagination, raw models (review + metadata with extra="allow"), canonical models (review_v1 + review_metadata_v1), transforms, pg_client upsert/history methods, schema registry entries, stream YAMLs, handler routing + publication hook (last-writer-wins per ADR-034), review_publisher.py shared module (freshness check + full publication pass: yotpo_reviews_current → generalized_reviews_current + identity links + exceptions + audit), migration 015 (yotpo + reviews schemas, all tables, Postgres roles), and tests. Fixed Terraform EventBridge stream name mismatch (review_metadata → review-metadata).
- 0.49.0 — Added Yotpo reviews Terraform infrastructure: two stream_runner Lambdas (yotpo-reviews at 15min, yotpo-review-metadata at 60min), EventBridge schedules, IAM roles, SSM credential placeholders, CloudWatch error alarms, yotpo_store_id variable, and outputs. Added ADR-034 documenting three infrastructure decisions: last-writer-wins publication orchestration, yotpo/reviews Postgres schema namespacing, and database-level role-based access control for the restricted identity companion.
- 0.48.0 — Updated review stream specs with three resolved decisions: last-writer-wins publication orchestration (no new Lambda/Step Function), `yotpo.*` and `reviews.*` Postgres schema namespacing in the same Aurora database, and Postgres role-based access control (`reviews_restricted`) for the restricted identity companion table.
- 0.47.0 — Added three computed engagement columns to the events table: Ev/User (event intensity per person), Sess/User (sessions before triggering), and User Rate % (reach — what % of page users trigger the event). API joins page-level user counts via CTE, adapting join dimensions to the active grouping. Also added Page Users as a visible/sortable column.
- 0.46.1 — Events table now also filters out rows with <= 5 users and shows an ignored-rows banner above the table, matching the pages behavior.
- 0.46.0 — Pages table now filters out rows with <= 5 users via HAVING clause. API returns `ignored` summary (row count, events, sessions, users) alongside results. Frontend shows an ignored-rows banner above the pages table for GA4 reconciliation. Also added COALESCE to sync run stat columns so null values from pre-migration rows return 0.
- 0.45.1 — Fixed TypeError in Latest Sync card when stat columns (`events_new`, `events_changed`) are null (pre-migration-014 rows). Falls back to showing total events synced.
- 0.45.0 — GA4 report pagination: fetches all rows in 100k chunks instead of silently truncating. Sync card now shows actual `days_back` instead of hardcoded "90 days". Full historical backfill supported via `{"days": 425}`.
- 0.44.3 — Sync card now shows new/changed/unchanged counts instead of blind "updated" count. Upsert WHERE clause skips unchanged rows entirely (compares metric values with IS DISTINCT FROM). Card also shows "last 90 days of GA4 data" context label.
- 0.44.2 — Enhanced Latest Sync card: shows timestamp, total events synced, net new vs updated counts, and sync type (incremental vs full backfill). Uses Postgres `xmax = 0` trick on RETURNING to distinguish inserts from updates. Migration 014 adds stat columns to sync_runs.
- 0.44.1 — Added automatic incremental sync on API startup: runs 30s after boot then every 6 hours, upserts last 3 days of GA4 data.
- 0.44.0 — Added incremental sync (`POST /api/sync/incremental`) that upserts the last N days (default 3) without truncating existing data. Extracted shared `upsertRows` helper used by both backfill and incremental paths. Also added `GA4_KEY_FILE` config option to read service account credentials from a JSON file instead of pasting the private key, and `credentials/` to .gitignore.
- 0.43.0 — Added `time_on_site` as second parameterized event (10s/30s/60s/120s/300s buckets). Two-line config change in data-streams, plus `time-on-site` component in absoluteweb-shopify modeled after scroll-depth (interval-based, fires to dataLayer, wired into entrypoint).
- 0.42.1 — Added ADR-032: parameterized event splitting design rationale, config-driven extensibility model, and rejected alternatives.
- 0.42.0 — Split parameterized events by their primary GA4 parameter value. `scroll_depth` now appears as `scroll_depth_25`, `scroll_depth_50`, `scroll_depth_75`, `scroll_depth_90`. Added `event_param_value` column to schema, normalization, mock data, API groupings, and frontend. Extensible via `PARAMETERIZED_EVENTS` map — adding future splits (e.g., time_on_site by seconds) is config-only.
- 0.41.2 — Auto-hide irrelevant dimension columns when groupBy is not "detail" — page/device/source columns are removed from the table and column picker based on the active grouping mode.
- 0.41.1 — Added vitest + testing-library test suite for the web app (31 tests): routing, home view, GA4 layout, navigation, tab switching, column picker, quick date ranges, result strip, and round-trip navigation with tab persistence.
- 0.41.0 — Added URL-based routing with react-router-dom: home at `/`, GA4 stream view at `/ga4-stream`, catch-all redirect. Replaced in-memory view state with real navigation.
- 0.40.2 — Updated .gitignore for monorepo: added `*.tsbuildinfo` exclusion, organized Node/build sections, removed accidentally staged tsbuildinfo.
- 0.40.1 — Made the top-left Data Streams Explorer label clickable so it always returns the UI to the explorer home view.
- 0.33.0 — Added ADR-028, introduced the variant-aware GA4 aggregate schema migration, and extended the dashboard API to support landing-page and page-variant analysis.
- 0.32.0 — Added a local GA4 historical dashboard MVP track: React/Vite frontend, Express API workspace scaffolding, aggregated Postgres schema, and ADR-027 for the 90-day backfill analytics app.
- 0.31.0 — Added ADR-026 and introduced `ga4.events` as a webhook-first GTM/GA4 stream with raw/canonical schemas, Postgres migration, and source-aware webhook auth/routing support.
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
- V30 — ADR-024: stream status lifecycle (`draft` → `ready` → `live`). Added `status` field to StreamConfig and all stream YAMLs. Code and infra are decoupled — build schemas now, add Terraform later. All 5 current streams set to `ready`.
