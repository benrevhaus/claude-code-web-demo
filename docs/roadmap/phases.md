# Phased Roadmap

**Date:** 2026-03-17

---

## Phase 1: Prove the Pattern (Solo, ~3-4 weeks)

### Goal
One golden-path stream (Shopify Orders) running end-to-end in production. Polling, processing, observability, and manual replay all work.

### Build (in order)

1. **Repo structure + Terraform skeleton**
   - S3 bucket, DynamoDB table, Aurora Serverless v2, IAM roles, VPC/subnets
   - SSM parameter paths for secrets
   - SNS topic for alerts

2. **Shared libraries**
   - `src/shared/s3_writer.py` — write raw + gzip + return key
   - `src/shared/dynamo_control.py` — create run, update cursor, check idempotency, record completion
   - `src/shared/pg_client.py` — connection pooling, upsert helper
   - `src/shared/stream_config.py` — parse YAML, return typed StreamConfig
   - `src/shared/observability.py` — structured logging setup, metric emission

3. **Pydantic schemas**
   - `schemas/raw/shopify/order.py` — raw Shopify order model (permissive)
   - `schemas/canonical/shopify/order_v3.py` — source canonical model (strict) + transform function

4. **shopify-poller Lambda**
   - GraphQL query for orders (cursor-based pagination)
   - Write raw to S3
   - Return PollerOutput

5. **processor Lambda**
   - Schema routing
   - S3 read → validate → transform → Postgres upsert
   - Idempotency check

6. **run-finalizer Lambda**
   - Close run record
   - Update cursor
   - Compute freshness
   - Emit CloudWatch metrics

7. **Incremental poll Step Function**
   - Full state machine with error handling states
   - Parameterized ASL template

8. **Stream definition**
   - `streams/shopify-orders.yaml`

9. **Postgres migration**
   - `shopify.orders` + `shopify.orders_history` tables

10. **Terraform wiring**
    - EventBridge schedule → Step Function
    - Lambda deployments
    - Everything connected end-to-end

11. **CloudWatch dashboard + alarms**
    - Freshness, errors, run outcomes

12. **Basic tests**
    - Transform unit tests with fixture data
    - Stream spec validation

### Do NOT build

- Webhook receiver (polling covers orders for V1)
- Replay Step Function (manual replay is sufficient)
- Normalization layer
- CI/CD pipeline
- Multi-store support
- Admin UI

### Exit criteria

- [ ] Shopify orders ingesting on 5-minute schedule
- [ ] Raw payloads in S3 with correct key pattern
- [ ] Records in Postgres `shopify.orders` with lineage (`raw_s3_key`)
- [ ] Cursor advancing correctly between runs
- [ ] Freshness metric in CloudWatch, within SLA
- [ ] At least one alarm tested (manually make data stale, verify alarm fires)
- [ ] Manual replay works: pick an S3 key, invoke processor, verify idempotent result
- [ ] No duplicate records after 24 hours of scheduled runs

---

## Phase 2: Harden + Expand (~2-3 weeks after Phase 1 stable)

### Goal
Second stream proves config-driven pattern. Webhooks provide real-time supplement. Replay is automated. CI/CD prevents deployment mistakes.

### Build

1. **webhook-receiver Lambda**
   - HMAC validation
   - Raw to S3
   - SQS enqueue
   - API Gateway route

2. **SQS queue + DLQ**
   - Processing queue for webhook payloads
   - Dead letter queue with alarm

3. **Second polling stream: Shopify Customers**
   - `streams/shopify-customers.yaml`
   - Pydantic schemas (raw + canonical)
   - Schema registry entry
   - Postgres migration
   - Tests

4. **Replay Step Function**
   - Map state iterating S3 keys
   - Replay request tracking in DynamoDB
   - Audit trail

5. **CI/CD pipeline**
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

- [ ] Two streams running (orders + customers)
- [ ] Webhooks flowing for orders (belt and suspenders with polling)
- [ ] Adding a third Shopify stream would take <3 days
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

**Phase 1 first** because nothing else matters if data doesn't flow reliably. Premature optimization (normalization, CI/CD, multi-store) before proving the basic pipeline wastes effort on the wrong problems.

**Phase 2 before Phase 3** because:
- The second stream validates that the architecture is actually config-driven (not just "config-driven for one stream")
- CI/CD must exist before another human touches production
- Webhooks + replay fill critical operational gaps

**Phase 3 after hiring** because:
- Normalization requires judgment about cross-provider semantics (better with two perspectives)
- Multi-provider support is only needed when the business actually has a second provider
- The CTO's time is better spent on architecture review than on grinding through a second provider integration
