# ADR-051: Shopify Staged Rollout — Backfill Before Webhooks

**Status:** Accepted
**Date:** 2026-04-10

---

## Decision

Shopify webhooks will not be enabled until the polling backfill is complete, reconciled, stable for several days, and snapshotted. Webhooks are a latency optimization layered on top of a proven stable corpus, not a parallel ingestion path introduced during backfill.

## Intent

The Shopify integration has 4 simultaneous polling streams (orders, customers, products, inventory) with sub-stream extraction (refunds, transactions) — the most complex ingestion surface in the platform. Introducing webhooks during backfill creates a second write path to the same tables before the first path has been proven stable.

This ADR documents why the staged approach is mandatory and what specific risks webhooks introduce during backfill.

## The Rollout Sequence

### Stage 1: Polling backfill (current)

All 4 Shopify streams backfill via GraphQL polling on EventBridge schedules. No webhooks. The corpus fills from oldest to newest. Each stream advances independently.

**Exit criteria:**
- All 4 cursors show recent timestamps (within 24 hours of current time)
- Record counts match expected order of magnitude
- Zero duplicates across all tables
- PII fields correctly restricted to `data_operator` (migration 016)

### Stage 2: Stability observation (several days)

Polling continues in incremental mode. No code changes. Monitor:
- Cursor advancement on every scheduled tick
- Error alarms not firing
- Record counts growing at expected rate
- No lock contention or idle-in-transaction connections

**Exit criteria:**
- 3+ days of clean incremental operation
- No manual intervention required

### Stage 3: Snapshot

Take an Aurora snapshot after stability is confirmed. This is the clean baseline before webhooks are introduced.

**Why before webhooks:** If webhooks introduce data corruption, duplicate processing, or race conditions with polling, the snapshot provides a rollback point to the last known-good state. Without the snapshot, recovery requires a full rebuild (8+ hours for Shopify's corpus).

### Stage 4: Enable webhooks

- Register webhook subscriptions with Shopify (orders/create, orders/updated, customers/create, customers/update, customers/delete)
- The webhook consumer Lambda processes real-time events through the routing Lambda → SQS → consumer path (ADR-037)
- Webhooks and polling coexist — webhooks provide low-latency updates, polling provides completeness guarantees

## Why Webhooks During Backfill Are Dangerous

### 1. Two write paths to the same table create race conditions

During backfill, the polling stream processes orders sequentially from oldest to newest. If a webhook fires for an order that the polling stream hasn't reached yet, the webhook writes the current state. When the polling stream later reaches that order, it upserts with potentially older data. The `WHERE updated_at < EXCLUDED.updated_at` guard handles this correctly — but only if both paths set `updated_at` consistently. A mismatch in timestamp format, timezone handling, or field mapping between the two paths would silently corrupt data.

### 2. Webhook consumer code is unproven in production

The webhook consumer Lambda has never processed a real Shopify webhook in this infrastructure. The routing Lambda (ADR-037) is new. The SQS message attribute format is new. Introducing an unproven code path while the backfill is running means debugging webhook issues and backfill issues simultaneously — the exact scenario that made the Yotpo deployment take 36 hours instead of 12 (ADR-043).

### 3. Webhook volume during backfill competes for Aurora capacity

A busy Shopify store generates hundreds of webhook events per hour. During backfill, the polling streams are already pushing Aurora at moderate load. Adding webhook writes increases the transaction volume and the risk of lock contention (ADR-046). At 0.5 ACU minimum, Aurora has limited headroom.

### 4. A webhook bug during backfill requires a full rebuild

If webhooks write bad data during backfill (wrong field mapping, duplicate records, corrupted timestamps), the damage is mixed into the backfilling corpus. Distinguishing webhook-written rows from polling-written rows requires forensic analysis of `run_id` values. A rebuild (truncate + re-backfill) takes 8+ hours for Shopify's corpus. A pre-webhook snapshot makes this a 10-minute restore instead.

## Why-Not (Rejected Alternatives)

### Enable webhooks immediately for real-time data

Rejected because real-time data is a latency optimization, not a correctness requirement. Polling catches every event within 5-15 minutes. The cost of waiting a few days for webhooks is measured in minutes of latency. The cost of debugging a webhook-induced data corruption during backfill is measured in days.

### Run webhooks to a separate staging table, merge after backfill

Rejected because it adds a merge step that has its own correctness risks (duplicate detection, timestamp reconciliation, ordering). The upsert-on-newer pattern already handles webhook+polling coexistence — but only after the polling path is proven stable.

### Test webhooks in a dev environment first

Rejected because there is no dev environment (ADR-023). The prod environment is the only environment. Staged rollout in prod replaces dev testing.

## Assumptions

- The polling backfill for Shopify's 4 streams completes within 2-3 days at the current EventBridge schedule rates
- Shopify's webhook delivery is reliable and retries failed deliveries (documented in their API docs)
- The webhook consumer code, while unproven, is architecturally sound — it uses the same schema registry, transforms, and pg_client methods as the polling path
- The pre-webhook snapshot provides a recovery path that makes webhook introduction low-risk after backfill stability is confirmed

## Tribal Context

- This staged approach was proven correct by the Yotpo and Gorgias deployments, where every new capability introduced during backfill (MySQL seed, metadata API, pagination fixes) created debugging overhead. The lesson: prove stability first, then add capabilities.
- The Shopify webhook consumer was built months before this deployment. It has never been tested against real webhook traffic because the infrastructure didn't exist until this week. The routing Lambda (ADR-037) was built during this deployment to work around an API Gateway limitation. Neither component has been battle-tested.
- The operator's instinct — "let it backfill and run for a few days" — directly reflects the experience from Yotpo (ADR-043: "default to rebuild when uncertain, prove stability before adding complexity") and Gorgias (ADR-050: five failures during first deployment, three of which were caused by unproven code paths).

## Shopify App Setup Notes

### read_all_orders scope required for historical backfill

New Shopify custom apps created via the 2026 Dev Dashboard default to `read_orders`, which only grants access to the last 60 days of orders. Full order history requires the `read_all_orders` scope. This scope may require justification to Shopify during app review.

Without this scope, the orders backfill appears to work but only ingests recent data. The date range in the database is the diagnostic: if the oldest order is within 60 days, the scope is missing.

If denied: the MySQL legacy seed (ADR-041/042) provides the historical backfill path.

### GraphQL API version 2026-04 breaking changes

The 2026-04 API changed `refunds` and `transactions` on orders from connection types (with `edges/node`) to direct arrays. The `totalRefundedSet` field name is unchanged on the Refund object despite web documentation suggesting otherwise. Always verify field names against the specific object's schema page, not summaries.

### Decimal serialization

Shopify's GraphQL responses produce `Decimal` values in Pydantic models. Every `json.dumps` call that serializes model data must include `default=str` or the upsert fails with `Object of type Decimal is not JSON serializable`. This affects every stream, not just Shopify — it was a latent bug in all `json.dumps` calls in `pg_client.py`.

## Freshness Marker

- **Captured:** 2026-04-10
- **Stale when:** the Shopify backfill is complete, stable for 3+ days, snapshotted, and webhooks have been successfully enabled — at which point this ADR's staged rollout has been executed and the restrictions no longer apply.
