# Failure Modes

**Status:** Accepted
**Date:** 2026-03-17

---

## Overview

This document catalogs the most likely failure modes in the Data Streams platform. For each, we define the symptom, likely cause, containment (how the system limits blast radius), and recovery path.

This is required reading for anyone operating the platform.

---

## 1. Shopify API Rate Limited (429)

**Symptom:** Poller Lambda returns HTTP 429. Run takes longer than expected. CloudWatch metric `streams/http_status{status_code=429}` spikes.

**Likely cause:** Polling schedule too aggressive, burst during Shopify peak hours, or another app sharing the same Shopify API quota.

**Containment:** Poller returns `rate_limit_reset_at` in its output. Step Function Wait state pauses until the reset timestamp. No data loss. No error state.

**Recovery:** Automatic. If chronic, reduce `page_size` or widen `schedule` interval in stream spec. Monitor the `rate_limit_remaining` metric trend.

---

## 2. Shopify API 5xx (Vendor Outage)

**Symptom:** Poller Lambda throws exception. Step Function retries 3 times, then routes to HandleFetchError → Finalize with `partial_failure`.

**Likely cause:** Shopify infrastructure issue. Check [status.shopify.com](https://status.shopify.com).

**Containment:** Step Function retry policy (3 attempts, exponential backoff). If all retries fail, the run finalizes as partial failure. Freshness alarm may fire.

**Recovery:** Automatic on next scheduled run. The next run starts from the last successfully checkpointed cursor. No data loss — just delayed data.

---

## 3. Shopify Schema Change Without Notice

**Symptom:** Pydantic validation errors in processor. `streams/schema_validation_errors` metric spikes. Records land in DLQ.

**Likely cause:** Shopify added, removed, or renamed fields in their API response.

**Containment:** Raw payload is ALREADY in S3 (captured before validation). Processor logs the validation error, increments `records_failed`, and the record's SQS message goes to DLQ. Other records in the same batch may still process successfully.

**Recovery:**
1. Read the raw S3 payload to understand what changed.
2. Update the Pydantic raw model to accommodate the change.
3. Update the canonical model and transform if needed.
4. Deploy updated processor.
5. Replay the failed records from S3 (DLQ contains the S3 keys).

**Why this is safe:** Immutable raw storage means nothing is lost. The fix is a code change + replay.

---

## 4. Postgres Connection Exhaustion

**Symptom:** Processor Lambda fails with connection timeout or "too many connections" error.

**Likely cause:** Too many concurrent Lambda invocations overwhelming RDS connection limit. Each Lambda invocation opens a new connection.

**Containment:** Lambda reserved concurrency on processor (e.g., max 5). Failed SQS messages retry with backoff, then go to DLQ.

**Recovery:**
1. Short-term: Reduce Lambda concurrency or SQS batch size.
2. Medium-term: Add RDS Proxy (manages connection pooling).
3. Check: Is Aurora Serverless ACU scaling appropriately?

**Prevention:** RDS Proxy should be in the V1 Terraform if budget allows. If not, set processor Lambda concurrency conservatively (5-10).

---

## 5. DynamoDB Throttling

**Symptom:** Processor slows down or errors on DynamoDB calls. CloudWatch `ThrottledRequests` metric increases.

**Likely cause:** Burst writes exceeding on-demand capacity's burst limit (rare at our scale).

**Containment:** DynamoDB on-demand auto-scales, but has an initial burst limit. Idempotency checks are single-item reads (very cheap). Write operations are lightweight.

**Recovery:** At Shopify order volumes (thousands/day), this should not happen. If it does, investigate whether something is causing unexpected fan-out. Do NOT switch to provisioned capacity as a first response — find the root cause.

---

## 6. Step Function Stuck (Zombie Run)

**Symptom:** Step Function execution running for hours. Freshness alarm fires. No recent run completions in DynamoDB.

**Likely cause:** Wait state computed an absurd wait time (e.g., `rate_limit_reset_at` set to a date far in the future), or Lambda timeout misconfigured.

**Containment:** Step Function execution timeout (30 minutes for incremental, 4 hours for backfill). Execution auto-fails on timeout. EventBridge alarm fires.

**Recovery:**
1. Stop the stuck execution in the Step Functions console.
2. Check the execution history to see which state it's stuck in.
3. If stuck in ThrottleWait: fix the wait time calculation in the poller.
4. If stuck in a Lambda: fix the Lambda timeout configuration.
5. Next scheduled run starts fresh from last checkpointed cursor.

---

## 7. Duplicate Processing (Idempotency Failure)

**Symptom:** Duplicate records in Postgres. Metrics show `records_skipped` lower than expected during replay.

**Likely cause:** Idempotency key TTL expired in DynamoDB and the same record was reprocessed. Or the idempotency key formula doesn't capture all dimensions of uniqueness.

**Containment:** Postgres UNIQUE constraint on `(id, store_id)` prevents true duplicates in the current-state table. The upsert pattern overwrites with newer data (harmless). History table may get duplicate snapshots.

**Recovery:**
1. For current-state table: No action needed — upsert handles it.
2. For history table: Run a dedup query if duplicate snapshots are a problem.
3. If idempotency key formula is wrong: Fix it in the stream spec and processor. Extend DynamoDB TTL if needed.

---

## 8. Webhook HMAC Validation Failure

**Symptom:** Webhook receiver logs HMAC failure. No webhook data being ingested. Polling still works (belt and suspenders).

**Likely cause:** Shopify rotated the webhook signing secret, or the secret in SSM Parameter Store is incorrect.

**Containment:** Receiver returns HTTP 200 (to stop Shopify from retrying with the same bad signature, which creates log noise). Does NOT write to S3 or SQS. Logs the failure with the expected vs actual topic.

**Recovery:**
1. Check the webhook secret in SSM against Shopify's webhook settings.
2. Update the SSM parameter value.
3. Redeploy the webhook-receiver Lambda (to clear the cached secret).
4. Missed webhooks are covered by the next polling run.

**Important:** Returning 200 on HMAC failure is intentional. Shopify retries on non-200, and retries with a bad secret will also fail, creating noise. The polling schedule catches anything webhooks miss.

---

## 9. S3 Write Failure

**Symptom:** Poller or webhook receiver Lambda fails. No raw payload captured for this page/webhook.

**Likely cause:** IAM permission issue, bucket policy change, or (extremely rare) S3 regional outage.

**Containment:** Lambda fails → Step Function retries (for poller) or SQS retries (for webhook). The payload is still in Lambda memory on retry.

**Recovery:**
1. Check IAM roles and S3 bucket policy.
2. Retries should succeed once permissions are fixed.
3. If S3 was briefly down (extremely rare), retry succeeds automatically.
4. If the Lambda invocation itself timed out and the payload is lost: the next polling run re-fetches from the cursor position. For webhooks, Shopify will retry delivery.

---

## 10. Terraform State Drift

**Symptom:** `terraform plan` shows unexpected changes. Resources exist in AWS that aren't in Terraform state, or state references resources that don't exist.

**Likely cause:** Manual changes in AWS Console, partially applied Terraform, or another process modifying resources.

**Containment:** Always run `terraform plan` before `terraform apply`. Never skip the plan review.

**Recovery:**
1. For resources in AWS but not in state: `terraform import` to bring them under management.
2. For state entries without real resources: `terraform state rm` to clean state.
3. For unexpected modifications: Identify who/what changed the resource. Decide whether to keep the manual change (update Terraform) or revert it (apply Terraform).

**Prevention:**
- Never make manual changes to Terraform-managed resources.
- Tag all Terraform-managed resources with `managed_by = terraform`.
- Use DynamoDB state locking to prevent concurrent applies.

---

## Summary Matrix

| # | Failure | Data Loss? | Auto-Recovery? | Manual Steps? |
|---|---------|-----------|----------------|---------------|
| 1 | 429 Rate Limit | No | Yes (wait + retry) | Only if chronic |
| 2 | Vendor 5xx | No (delayed) | Yes (next run) | Only if prolonged |
| 3 | Schema Change | No (raw in S3) | No | Update model + replay |
| 4 | PG Connections | No (DLQ) | Partial (retry) | Adjust concurrency |
| 5 | DynamoDB Throttle | No | Mostly (auto-scale) | Investigate root cause |
| 6 | Zombie Run | No (cursor safe) | Yes (timeout) | Stop execution |
| 7 | Duplicate Processing | No | Yes (upsert) | Fix key formula if wrong |
| 8 | Webhook HMAC | No (polling covers) | No | Update secret |
| 9 | S3 Write Fail | Temporary | Yes (retry) | Fix IAM if needed |
| 10 | TF State Drift | No | No | Import/remove state |
