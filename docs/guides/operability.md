# Operability Standard

**Status:** Accepted
**Date:** 2026-03-17

---

## Overview

This document defines the minimum required observability, alerting, and operational practices for the Data Streams platform. It is designed for a solo CTO or small team — lightweight enough to maintain, rigorous enough to catch problems before they become outages.

See [ADR-015](../adr/015-observability-cloudwatch-only.md) for why CloudWatch-only for V1.

---

## Metrics

All custom metrics are emitted by Lambda functions using the `boto3` CloudWatch client. Namespace: `DataStreams`.

### Required custom metrics

| Metric | Dimensions | Emitted by | What it tells you |
|--------|-----------|------------|-------------------|
| `streams/run_duration_seconds` | source, stream, store_id | run-finalizer | How long polling runs take. Trend up = problem. |
| `streams/freshness_lag_minutes` | source, stream, store_id | run-finalizer | How stale the data is. The single most important metric. |
| `streams/records_processed` | source, stream, store_id | processor | Throughput. Trend to zero = pipeline stopped. |
| `streams/records_skipped` | source, stream, store_id | processor | Idempotency dedup rate. High = overlapping data sources (ok). |
| `streams/records_failed` | source, stream, store_id | processor | Error rate. Any non-zero = investigate. |
| `streams/http_status` | source, stream, status_code | shopify-poller | API health. Watch 429 and 5xx rates. |
| `streams/pages_fetched` | source, stream, store_id | shopify-poller | Pagination volume per run. |
| `streams/schema_validation_errors` | source, stream, schema_version | processor | Schema drift. Non-zero = vendor changed something. |

### Native AWS metrics (free, already emitted)

- Lambda: Invocations, Errors, Duration, Throttles, ConcurrentExecutions
- Step Functions: ExecutionsStarted, ExecutionsFailed, ExecutionsSucceeded, ExecutionTime
- SQS: NumberOfMessagesSent, NumberOfMessagesReceived, ApproximateNumberOfMessagesVisible (queue depth), ApproximateAgeOfOldestMessage
- DynamoDB: ConsumedReadCapacityUnits, ConsumedWriteCapacityUnits, ThrottledRequests

---

## Alarms

**SNS topic:** `data-streams-alerts-{env}`
**Notification:** Email for V1. Add Slack webhook in Phase 2.

### Required alarms

| Alarm | Condition | Evaluation | Severity |
|-------|-----------|------------|----------|
| **Freshness SLA breach** | `freshness_lag_minutes > freshness_sla_minutes` | 2 consecutive datapoints (10 min at 5-min schedule) | Critical |
| **Run failure** | Step Function execution status = FAILED | Any occurrence | Critical |
| **DLQ depth** | SQS DLQ `ApproximateNumberOfMessagesVisible > 0` | 1 datapoint | Warning |
| **Processor error rate** | `records_failed / records_processed > 5%` | 15-minute window | Warning |
| **429 storm** | `http_status{status_code=429} > 10` in 5 minutes | 1 datapoint | Informational |

### Alarm response priority

- **Critical:** Investigate within 1 hour. Data is not flowing or is dangerously stale.
- **Warning:** Investigate within 4 hours. Something is degraded but data is still flowing.
- **Informational:** Review at next working session. No immediate action needed.

---

## Dashboard

**One CloudWatch dashboard:** `data-streams-{env}`

### Required widgets

| Widget | Type | Shows |
|--------|------|-------|
| Freshness by stream | Line graph | `freshness_lag_minutes` for all streams, with SLA threshold line |
| Run outcomes | Stacked bar | Step Function executions by status (succeeded/failed) per day |
| Record throughput | Line graph | `records_processed` per stream over time |
| Error rate | Line graph | `records_failed` per stream over time |
| API health | Stacked area | `http_status` by status code over time |
| SQS queue depth | Line graph | Messages visible in processing queue and DLQ |
| Run duration | Line graph | `run_duration_seconds` per stream over time |

---

## Structured Logging

All Lambdas use `structlog` for structured JSON logging. Every log line includes base context:

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

### Log levels

| Level | When |
|-------|------|
| `debug` | Per-record detail. Only enable when debugging. |
| `info` | Per-page or per-batch summaries. Standard operating level. |
| `warning` | Recoverable issues: HMAC failure, skipped record, rate limit hit. |
| `error` | Unrecoverable issues: validation failure, Postgres error, unhandled exception. |

### CloudWatch Logs retention

- **Dev:** 7 days
- **Prod:** 30 days

### Querying logs

CloudWatch Logs Insights example queries:

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

---

## Runbooks

Three runbooks, stored in the repo under `runbooks/`:

### 1. `runbooks/stale-data.md` — Freshness Alarm

**Trigger:** `freshness_lag_minutes` alarm fires.

**Steps:**
1. Check the CloudWatch dashboard — is the lag for one stream or all streams?
2. Check Step Functions console — are executions running? Failing? Stuck?
3. If executions are not starting: Check EventBridge rule. Is the schedule enabled?
4. If executions are failing: Check execution history. What state failed?
5. If Shopify is down: Check status.shopify.com. Wait for recovery. Data will catch up.
6. If the cursor is stuck: Check DynamoDB `CURSOR#current`. Is `cursor_value` progressing?
7. Manual recovery: Start a Step Function execution manually with the current cursor.

### 2. `runbooks/failed-run.md` — Step Function Failure

**Trigger:** Step Function execution status = FAILED.

**Steps:**
1. Open the failed execution in the Step Functions console.
2. Identify which state failed and read the error output.
3. Common causes:
   - **Auth expired:** Shopify API key rotated. Update SSM parameter. Redeploy poller.
   - **Schema changed:** Pydantic validation error. Check raw S3 payload. Update schema.
   - **Postgres down:** Check RDS status. Check security group. Check connection limits.
   - **Lambda timeout:** Check if page_size is too large or API is slow. Increase timeout.
4. After fixing: The next scheduled run will pick up from the last checkpointed cursor.

### 3. `runbooks/dlq-messages.md` — Dead Letter Queue

**Trigger:** DLQ depth > 0.

**Steps:**
1. Read the DLQ message(s) — they contain the S3 key and stream identifier.
2. Read the corresponding S3 payload to understand what the processor received.
3. Check processor logs for the error (filter by `s3_key`).
4. Common causes:
   - **Schema validation:** Vendor changed payload format. Update Pydantic model.
   - **Postgres constraint violation:** Data integrity issue. Check the upsert logic.
   - **Timeout:** Payload too large. Increase Lambda timeout or reduce batch size.
5. After fixing: Replay the failed S3 keys through the processor.
6. Purge the DLQ after confirming all messages are reprocessed.

---

## Ownership Model

### V1 (solo)

You own everything. The `owner` field in stream specs exists for future use.

### V2+ (small team)

- Each stream has an `owner` in its spec.
- Alarms are filtered by owner (SNS filter policy by stream tags).
- Dashboard has per-owner views.
- On-call rotation is owner-based: your streams, your alerts.

### Operational review cadence

- **Daily (2 minutes):** Glance at the CloudWatch dashboard. Freshness green? Errors zero? Good.
- **Weekly (15 minutes):** Review run metrics trends. Any degradation? Any 429 increases?
- **Monthly (30 minutes):** Review DynamoDB/S3/Postgres costs. Any unexpected growth? TTLs working?
