# ADR-039: Operational Resilience Model — What Heals, What Alerts, What Fails Silently

**Status:** Accepted
**Date:** 2026-04-07

---

## Decision

The platform relies on schedule-driven retry as its primary resilience mechanism. Lambdas run on fixed EventBridge intervals, cursors track progress, and most transient failures resolve on the next scheduled invocation without intervention.

This ADR documents the three tiers of failure behavior so that an operator knows what to expect, what to investigate, and what to watch for.

## Intent

The platform is operated by a single person. The resilience model must be legible without a runbook for every failure mode. An operator checking the system after hours or days away should be able to determine system health from CloudWatch alarms and a few queries, not by reading code.

## Tier 1: Self-Healing (No Intervention Required)

These failures resolve automatically on the next scheduled run or within the current run.

### Lambda execution errors on transient failures

EventBridge fires on schedule regardless of previous run outcome. If a run fails due to a network timeout, DNS resolution failure, or temporary API unavailability, the next run starts fresh from the last saved cursor position. No data is lost because the cursor only advances after successful processing.

### Rate limiting (HTTP 429)

The stream_runner handler detects 429 responses, sleeps for the duration specified by the `Retry-After` header (or a default), and retries the same page within the same Lambda invocation. No cursor advancement, no data loss, no operator action.

### Partial page failures

If individual records within a page fail to transform or upsert, the handler logs the error, skips the record, and continues processing. The cursor still advances. The failed record will be retried on the next run if its `updated_at` hasn't changed, or will appear in the next full audit snapshot.

### SQS webhook delivery failures

The webhook consumer reports batch item failures. SQS retries failed messages up to 3 times before moving them to the dead letter queue. Transient failures (connection timeout to Postgres, temporary S3 issue) resolve on retry.

### Aurora Serverless v2 scaling

Aurora scales from 0.5 ACU to 8 ACU automatically based on load. During backfill or concurrent stream runs, it scales up. During idle periods, it scales back down. No operator action required.

### Lambda cold starts

The first invocation after idle is slower (loading dependencies, establishing connections). Subsequent invocations within the Lambda container lifetime reuse cached connections and client instances. This is transparent — the handler is designed for it.

### Publication pass timing

The last-writer-wins publication model means publication only runs when both source streams (reviews and metadata) are fresh. If one stream falls behind, publication simply doesn't trigger until both are current. This is correct behavior — the generalized layer waits for complete data rather than publishing partial state. It resolves itself as the lagging stream catches up.

## Tier 2: Alerts (Operator Investigation Required)

These failures trigger CloudWatch alarms via SNS. They require investigation but the system is not losing data.

### Sustained Lambda errors (threshold: >2 per 10-minute window)

If a stream_runner consistently fails across multiple scheduled invocations, the error alarm fires. Common causes:

- Expired or revoked API credentials in SSM
- Vendor API endpoint changes or deprecation
- Database connection string invalid (Aurora endpoint changed, password rotated)
- Code bug introduced by a deployment

The alarm tells the operator which Lambda is failing. CloudWatch logs show the specific error. Source data is not being ingested during the failure window, but S3 raw payloads from previous successful runs are intact and the cursor marks the exact resumption point.

### Webhook dead letter queue depth (threshold: >0 messages)

Messages in the DLQ have failed 3 SQS delivery attempts. This means either the webhook consumer has a persistent bug, the webhook payload is malformed, or a downstream dependency (Postgres, S3) was unavailable for an extended period.

DLQ messages are retained for 14 days. They can be replayed after the underlying issue is fixed.

### Aurora approaching max ACU

Not currently alarmed but should be monitored. If Aurora consistently runs at max capacity (8 ACU), queries slow down and Lambda runs may timeout. The fix is either increasing `max_capacity` in Terraform or investigating query performance.

## Tier 3: Silent Failures (No Alarm, Requires Periodic Checks)

These conditions do not trigger alarms because they are not errors — they are data quality or completeness gaps that accumulate over time.

### Publication not triggering

If the metadata stream repeatedly fails while the reviews stream succeeds, the publication pass never fires because the freshness check requires both streams to be current. The reviews data is safe in source-canonical tables, but the generalized layer (`reviews.generalized_reviews_current`) becomes stale.

**How to detect:** Query `control.stream_cursors` and compare `last_run_at` for both Yotpo streams. If one is hours or days behind the other, publication is stalled.

**How to fix:** Investigate why the lagging stream is failing (check its Lambda alarm and logs). Once it catches up, publication triggers automatically.

### Orphaned reviews from removed products

If a product is removed from the vendor catalog but reviews still reference it, those reviews remain in source-canonical tables with a `domain_key` that no longer maps to a live product. They are still published to the generalized layer (the `domain_key` is non-null, so they pass the subject identity check), but the `product_title_snapshot` and `product_handle_snapshot` fields become stale.

**How to detect:** Periodic reconciliation of `domain_key` values in `yotpo.reviews_raw_current` against `shopify.products` by Shopify product ID.

**How to fix:** Manual — either update the product snapshots or mark the reviews as excluded.

### Cursor drift after schema changes

If a vendor changes the semantics of their `updated_at` field (e.g., timezone handling, precision), the cursor may skip or re-process records. The `extra="allow"` raw models and S3 raw payloads provide a safety net — no data is lost, but processing may be inefficient.

**How to detect:** Unusual spikes in `records_processed` per run, or the same records appearing in history tables repeatedly.

**How to fix:** Reset the cursor in `control.stream_cursors` to re-process from a known-good point.

### Backfill not yet complete

After initial deployment, the review corpus is ingested incrementally across multiple EventBridge cycles. The `max_pages_per_run` limit (500) means each run processes a bounded amount. With a large corpus, full backfill takes multiple hours.

**How to detect:** The stream_runner returns `"pages": 500` (hit the limit) vs `"pages": <500` (reached the end).

**How to fix:** No fix needed — let it run. Each cycle advances the cursor. Full backfill completes within several hours for a corpus in the hundreds of thousands of reviews.

### Metadata stream lags reviews during backfill

The reviews stream runs every 15 minutes. The metadata stream runs every 60 minutes. During initial backfill, the metadata stream processes fewer cycles per hour. Publication will not trigger until metadata catches up.

**How to detect:** Query `control.stream_cursors` — metadata `last_run_at` will trail reviews by up to an hour.

**How to fix:** No fix needed. Normal steady-state behavior once backfill is complete.

## Why This Model

### Schedule-driven retry is simpler than event-driven retry

Step Functions, SQS-based retry chains, and dead letter reprocessing Lambdas all add components that need their own monitoring. Fixed-schedule polling with cursor-based resumption achieves the same result with zero additional infrastructure. The cursor is the only state that matters.

### Alarms should indicate operator action, not transient noise

The error threshold (>2 per 10 minutes) filters out single transient failures. An operator who receives an alarm knows it requires investigation — it's not a one-time blip that resolved itself.

### Silent failures are acceptable when bounded

Orphaned reviews and stale product snapshots are data quality issues, not data loss. They are bounded (they don't grow unboundedly) and detectable (via periodic reconciliation queries). Alarming on them would create noise that drowns out actionable alerts.

## Assumptions

- EventBridge schedules are reliable and fire within a few seconds of the configured interval.
- Lambda execution environment provides sufficient network access to reach vendor APIs and Aurora.
- Aurora Serverless v2 auto-scaling is sufficient for the current workload without manual capacity management.
- The dead letter queue retention (14 days) is sufficient for an operator to investigate and replay failed webhooks.
- A single operator checks the system at least once per business day. Silent failures that persist longer than 24 hours without detection are acceptable for this stage.

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** the platform adds a second operator or automated monitoring (e.g., a health-check Lambda that queries cursor freshness and alerts on lag), the workload grows beyond Aurora Serverless v2 auto-scaling capacity, or a vendor introduces a failure mode not covered by the three tiers above.
