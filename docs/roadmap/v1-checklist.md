# V1 Launch Checklist

**Date:** 2026-03-17 (updated 2026-03-24)
**Stream:** Shopify Orders (golden path)

> **Note:** Per [ADR-021](../adr/021-simplify-to-single-lambda-mvp.md), the MVP ships as Phase 0 (single-Lambda architecture). The full checklist below remains the target for Phase 1 hardening. See [Phase 0 checklist](phases.md#phase-0-ship-the-mvp-solo-1-week) for the simplified launch criteria.

---

## Pre-Build

- [ ] Create repo with directory structure per [ADR-006](../adr/006-single-repo.md)
- [ ] Write `CLAUDE.md` with architecture summary, golden path, and conventions
- [ ] Set up Terraform S3 backend + DynamoDB lock table (manually, one-time)
- [ ] Create dev and prod AWS accounts (or environment prefixes)
- [ ] Register a Shopify development app for API access

---

## Infrastructure (Terraform)

- [ ] S3 bucket: encryption (SSE-S3), versioning, lifecycle policy (Glacier at 90d)
- [ ] DynamoDB table: on-demand, PK/SK string, TTL enabled
- [ ] Aurora Serverless v2: security group, subnet group, minimum ACU=0.5
- [ ] RDS Proxy (recommended) or set processor Lambda concurrency low (5-10)
- [ ] IAM role: shopify-poller (S3 write, DynamoDB read/write, SSM read, CloudWatch write)
- [ ] IAM role: processor (S3 read, DynamoDB read/write, RDS connect, CloudWatch write)
- [ ] IAM role: run-finalizer (DynamoDB read/write, CloudWatch write)
- [ ] SQS queue: `data-streams-process-{env}` (for future webhook use, provision now)
- [ ] SQS DLQ: `data-streams-dlq-{env}` with alarm
- [ ] SNS topic: `data-streams-alerts-{env}` with email subscription
- [ ] API Gateway: base setup (for future webhook use, provision now)
- [ ] EventBridge rule: `rate(5 minutes)` → Step Function
- [ ] Step Function: parameterized from stream config, 30-minute timeout
- [ ] CloudWatch log groups: 30-day retention for prod, 7-day for dev
- [ ] SSM parameter paths created (with placeholder values):
  - `/data-streams/{env}/shopify/access_token`
  - `/data-streams/{env}/shopify/webhook_secret`
  - `/data-streams/{env}/postgres/connection_string`
- [ ] `terraform plan` is clean
- [ ] `terraform apply` succeeds

---

## Secrets (Manual, Post-Terraform)

- [ ] Set Shopify access token in SSM (GraphQL Admin API bearer token)
- [ ] Set Shopify webhook secret in SSM
- [ ] Set Postgres connection string in SSM
- [ ] Verify Lambda can read SSM values (test invocation)

---

## Application Code

### Shared libraries
- [ ] `src/shared/s3_writer.py` — write + gzip + metadata + return key
- [ ] `src/shared/dynamo_control.py` — run CRUD, cursor CRUD, idempotency check/write, freshness update
- [ ] `src/shared/pg_client.py` — connection via RDS Proxy, upsert helper, transaction management
- [ ] `src/shared/stream_config.py` — parse YAML, return Pydantic StreamConfig, validate
- [ ] `src/shared/observability.py` — structlog setup, CloudWatch metric helper
- [ ] `src/shared/contracts.py` — all Pydantic input/output models from [runtime contracts](../specs/runtime-contracts.md)

### Schemas
- [ ] `schemas/raw/shopify/order.py` — permissive raw model
- [ ] `schemas/canonical/shopify/order_v3.py` — strict canonical model
- [ ] `schemas/canonical/shopify/transforms.py` — raw → canonical transform
- [ ] `src/shared/schema_registry.py` — routing table: (source, stream) → models + transform

### Lambdas
- [ ] `src/lambdas/poller/handler.py` — shopify-poller
- [ ] `src/lambdas/processor/handler.py` — generic processor
- [ ] `src/lambdas/finalizer/handler.py` — run-finalizer

### Stream definition
- [ ] `streams/shopify-orders.yaml` — complete and valid per [stream spec](../specs/stream-spec.md)

### Database
- [ ] Postgres migration: create `shopify` schema
- [ ] Postgres migration: create `shopify.orders` table
- [ ] Postgres migration: create `shopify.orders_history` table
- [ ] Postgres migration: create indexes

---

## Testing

- [ ] Store 3+ real Shopify order API responses in `tests/fixtures/shopify/orders/`
- [ ] Unit test: raw model parses fixture data without error
- [ ] Unit test: transform produces correct canonical output
- [ ] Unit test: idempotency key computation is deterministic
- [ ] Unit test: stream config YAML validates correctly
- [ ] Integration test: S3 writer writes and reads correctly
- [ ] Integration test: processor end-to-end (S3 read → validate → transform → Postgres upsert)
- [ ] All tests pass

---

## Deploy to Dev

- [ ] Deploy all infrastructure to dev
- [ ] Set SSM secrets for dev
- [ ] Run Postgres migrations
- [ ] Deploy Lambda code
- [ ] Trigger one manual Step Function execution with test input
- [ ] Verify: raw payload appears in S3 at expected key
- [ ] Verify: run record in DynamoDB with status "success"
- [ ] Verify: order records in Postgres `shopify.orders`
- [ ] Verify: history records in `shopify.orders_history`
- [ ] Verify: cursor updated in DynamoDB `CURSOR#current`
- [ ] Verify: `raw_s3_key` on Postgres rows points to real S3 objects
- [ ] Verify: `schema_version` on Postgres rows is correct
- [ ] Verify: freshness metric in CloudWatch
- [ ] Verify: structured logs in CloudWatch Logs (JSON, correct fields)
- [ ] Enable EventBridge schedule
- [ ] Let scheduled runs execute for 24 hours
- [ ] Verify: no duplicate records in Postgres
- [ ] Verify: cursor advancing correctly each run
- [ ] Verify: freshness stays within SLA (10 minutes)

---

## Observability

- [ ] CloudWatch dashboard created with all widgets from [operability standard](../guides/operability.md)
- [ ] Freshness alarm configured
- [ ] Freshness alarm tested (manually set stale, verify alarm fires, verify email received)
- [ ] Run failure alarm configured (Step Function failure → SNS)
- [ ] DLQ alarm configured
- [ ] All alarms route to SNS → email

---

## Manual Replay Test

- [ ] Pick one S3 key from a successful run
- [ ] Invoke processor Lambda manually with that S3 key
- [ ] Verify: processor returns `records_skipped` > 0 (idempotency working)
- [ ] Delete the idempotency record from DynamoDB
- [ ] Invoke processor again
- [ ] Verify: processor returns `records_processed` > 0 (reprocessing works)
- [ ] Verify: Postgres row updated (not duplicated)

---

## Production Deploy

- [ ] All dev verifications pass
- [ ] `terraform plan` for prod reviewed (no surprises)
- [ ] `terraform apply` for prod
- [ ] Set SSM secrets for prod
- [ ] Run Postgres migrations on prod
- [ ] Deploy Lambda code to prod
- [ ] Trigger one manual execution, verify same as dev checks
- [ ] Enable EventBridge schedule
- [ ] Monitor first 2 hours actively (watch dashboard)
- [ ] Monitor first 24 hours (check dashboard morning + evening)
- [ ] Verify freshness SLA met in prod
- [ ] Verify no alarms firing

---

## Documentation

- [ ] `CLAUDE.md` complete: architecture summary, golden path, conventions, data model
- [ ] `README.md`: setup instructions (clone, install deps, configure AWS, deploy)
- [ ] All ADRs written and indexed in `docs/README.md`
- [ ] All specs written
- [ ] Runbooks written (stale data, failed run, DLQ)
- [ ] "Adding a stream" guide written

---

## Sign-off

- [ ] Data is flowing in production
- [ ] Freshness is within SLA
- [ ] Manual replay works
- [ ] Documentation is complete
- [ ] A person unfamiliar with the system could read the docs and understand it within a day

**V1 is done.**
