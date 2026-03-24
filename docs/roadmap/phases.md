# Phased Roadmap

**Date:** 2026-03-17

---

## Phase 0: Ship the MVP (Solo, ~1 week)

> **See [ADR-021](../adr/021-simplify-to-single-lambda-mvp.md) for the full rationale.**

### Goal
Shopify Orders and Gorgias Tickets flowing into Postgres **this week**. Single-Lambda architecture — one Lambda per stream, triggered by EventBridge, no Step Function, no DynamoDB control plane, no VPC. Maximum data integrity, minimum moving parts.

### Build (in order)

1. **Minimal Terraform** (flat file, not modules)
   - S3 bucket (raw archival, SSE-S3, versioning)
   - Aurora Serverless v2 (public endpoint, SSL + IAM auth)
   - 1 Lambda per stream + 1 IAM role per stream
   - EventBridge rules (5 min Shopify, 15 min Gorgias)
   - SSM parameter paths for secrets
   - 1 SNS topic + Lambda error alarm

2. **Single Lambda handler per stream**
   - Fetch all pages in a loop (reuse existing `shopify_client.py`, `gorgias_client.py`)
   - Write each page raw to S3 (reuse `s3_writer.py`)
   - Transform via existing Pydantic schemas (reuse `schemas/`)
   - Upsert to Postgres (reuse `pg_client.py`)
   - Save cursor to Postgres `stream_cursors` table
   - Structured logging via structlog (reuse `observability.py`)

3. **Postgres migration**
   - `stream_cursors` table (source, stream, store_id, cursor_value, last_run_at, status)
   - Existing migrations for `shopify.orders`, `gorgias.tickets` + history tables

4. **Stream definitions** (already done)
   - `streams/shopify-orders.yaml`
   - `streams/gorgias-tickets.yaml`

5. **Deploy to dev, verify, deploy to prod**

### Reused from existing codebase (unchanged)
- `src/shared/shopify_client.py` — GraphQL client, cursor, rate limits
- `src/shared/gorgias_client.py` — REST client, checkpoint encoding
- `src/shared/s3_writer.py` — gzip + S3 write
- `src/shared/pg_client.py` — upsert-on-newer + history
- `src/shared/observability.py` — structlog + metrics
- `src/shared/ssm.py` — SSM parameter fetch
- `src/shared/stream_config.py` — YAML parsing
- `schemas/raw/` and `schemas/canonical/` — all Pydantic models + transforms
- `streams/*.yaml` — stream definitions
- `migrations/001_shopify_orders.sql`, `migrations/002_gorgias_tickets.sql`

### Intentionally deferred (dormant, not deleted)
- Step Function orchestration → adopt when Lambda hits 15-min timeout
- DynamoDB control plane → adopt when run-level audit trail is required
- DynamoDB idempotency layer → adopt when Postgres UNIQUE constraint is insufficient
- VPC + endpoints → adopt when egress cost justifies it
- RDS Proxy → adopt when connection pooling becomes an issue
- Per-function IAM roles → adopt when security posture requires least-privilege per function
- CloudWatch dashboard + 9 alarms → adopt when on-call rotation needs dashboards
- Parameterized Terraform modules → adopt at 5+ streams

### Do NOT build
- Webhook receiver
- Replay Step Function
- Normalization layer
- CI/CD pipeline
- Multi-store support
- Admin UI
- DynamoDB anything (for now)

### Exit criteria

- [ ] Shopify orders ingesting on 5-minute schedule
- [ ] Gorgias tickets ingesting on 15-minute schedule
- [ ] Raw payloads in S3 with correct key pattern
- [ ] Records in Postgres with lineage (`raw_s3_key`)
- [ ] Cursor advancing correctly between runs (stored in Postgres)
- [ ] No duplicate records after 24 hours of scheduled runs
- [ ] Structured logs visible in CloudWatch
- [ ] Lambda error alarm fires on failure

---

## Phase 1: Harden the MVP (~2-3 weeks after Phase 0 stable)

### Goal
Selectively adopt battle-hardened components as operational reality demands. Not everything at once — each component is adopted independently when its trigger is hit.

### Adopt when triggered (see ADR-021 for triggers)

1. **Step Function pagination** — if/when backfills hit Lambda timeout
2. **RDS Proxy** — if/when connection errors appear under concurrency
3. **CloudWatch dashboard + alarms** — once traffic patterns are understood
4. **VPC + endpoints** — once egress costs are measurable
5. **DynamoDB idempotency** — if Postgres UNIQUE constraint causes performance issues

### Build new

1. **CI/CD pipeline** — before second engineer touches production
2. **Replay from S3** — document manual process first, automate after 3+ manual replays

### Exit criteria (original Phase 1 criteria, now achievable incrementally)

- [ ] Shopify orders ingesting on 5-minute schedule
- [ ] Raw payloads in S3 with correct key pattern
- [ ] Records in Postgres `shopify.orders` with lineage (`raw_s3_key`)
- [ ] Cursor advancing correctly between runs
- [ ] Freshness metric in CloudWatch, within SLA
- [ ] At least one alarm tested (manually make data stale, verify alarm fires)
- [ ] Manual replay works: pick an S3 key, invoke processor, verify idempotent result
- [ ] No duplicate records after 24 hours of scheduled runs

---

## Phase 2: Expand + Webhooks (~2-3 weeks after Phase 1 stable)

### Goal
Third stream proves config-driven pattern. Webhooks provide real-time supplement. Full battle-hardened architecture adopted where triggers have been hit. CI/CD prevents deployment mistakes.

### Build

1. **webhook-receiver Lambda**
   - HMAC validation
   - Raw to S3
   - SQS enqueue
   - API Gateway route

2. **SQS queue + DLQ**
   - Processing queue for webhook payloads
   - Dead letter queue with alarm

3. **Third polling stream: Shopify Customers**
   - `streams/shopify-customers.yaml`
   - Pydantic schemas (raw + canonical)
   - Schema registry entry
   - Postgres migration
   - Tests

4. **Replay Step Function**
   - Map state iterating S3 keys
   - Replay request tracking in DynamoDB
   - Audit trail

5. **CI/CD pipeline** (if not already adopted in Phase 1)
   - PR: lint → test → terraform plan
   - Merge to main: terraform apply → Lambda deploy

6. **Idempotency hardening**
   - TTL tuning based on observed patterns
   - Edge case testing (concurrent webhook + poll delivery)

7. **Runbooks finalized**
   - All three runbooks written and tested

8. **Design normalization layer**
   - Define `commerce_order`, `commerce_customer` as Pydantic models (not in processor yet)
   - Document the field mapping from Shopify canonical → normalized

### Do NOT build

- Normalization processor (design only)
- Backfill via Bulk API
- Multi-store
- Admin UI
- Third-party observability

### Exit criteria

- [ ] Three streams running (orders + tickets + customers)
- [ ] Webhooks flowing for orders (belt and suspenders with polling)
- [ ] Adding a fourth stream would take <3 days
- [ ] Replay works end-to-end (request → Step Function → reprocess → audit)
- [ ] CI/CD pipeline operational
- [ ] A new engineer can understand the system within 1 day (test this with a real person if possible)

---

## Phase 3: Scale the Pattern (After First Hire)

### Goal
Normalization layer proven with a second provider. Platform can be extended by engineers other than the CTO.

### Build

1. **Normalization layer**
   - `schemas/normalized/commerce_order.py` etc.
   - Mapping functions: `shopify.order.v3 → commerce_order`
   - `normalized.*` Postgres schema and tables
   - Processor updated to write to both source canonical AND normalized

2. **Second provider (Recharge or Stay.ai)**
   - `recharge-poller` Lambda
   - Recharge raw + canonical schemas
   - Recharge stream definitions
   - Proves normalization layer works with real data

3. **Multi-store support**
   - Parameterize stream specs with store config
   - Per-store SSM credentials
   - Per-store cursors and freshness tracking (already in data model)

4. **Backfill optimization**
   - Evaluate Shopify Bulk API for large historical pulls
   - Build dedicated backfill mode if warranted

5. **Healthcheck Lambda**
   - API connectivity check
   - Schema drift detection (compare API response to expected fields)
   - Version compatibility check

6. **Third-party observability** (if team > 2)
   - Datadog or Grafana Cloud
   - Migrate custom metrics
   - Structured logs already compatible

7. **Internal shared library package** (if complexity warrants)
   - Extract `src/shared/` into an installable package
   - Only if multiple repos need it

### Do NOT build (until clear need)

- Kubernetes or container infrastructure
- Real-time streaming (Kinesis/Kafka)
- Data lake query layer (Athena)
- Custom admin UI (unless non-technical stakeholders need it)
- dbt (until there are actual analytics queries that need it)

### Exit criteria

- [ ] Two providers ingesting to normalized tables
- [ ] An engineer (not the CTO) has added a stream independently
- [ ] Cross-provider queries work (e.g., Shopify orders + Recharge subscriptions)
- [ ] Platform documentation is sufficient for independent operation

---

## Sequencing Rationale

### Why this order matters

**Phase 0 first** because data flowing into Postgres is the only thing that matters right now. The battle-hardened architecture was designed correctly, but deploying it all at once created paralysis. Phase 0 gets immediate ROI with the same data integrity guarantees.

**Phase 1 is reactive, not prescriptive.** Instead of building everything upfront, we adopt hardened components when operational triggers are hit. This means we only pay the complexity cost when we're getting concrete value from it.

**Phase 2 before Phase 3** because:
- The third stream validates that the architecture is actually config-driven
- CI/CD must exist before another human touches production
- Webhooks + replay fill critical operational gaps

**Phase 3 after hiring** because:
- Normalization requires judgment about cross-provider semantics (better with two perspectives)
- Multi-provider support is only needed when the business actually has a second provider
- The CTO's time is better spent on architecture review than on grinding through a second provider integration

### On preserving the battle-hardened design

All existing code for the full architecture (Step Functions, DynamoDB control plane, 4-Lambda orchestration, parameterized Terraform modules) remains in the repository. It is dormant, not deleted. See [ADR-021](../adr/021-simplify-to-single-lambda-mvp.md) for the complete decision record and scale-up triggers.
