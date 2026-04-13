# ADR-054: Shopify First Deployment and Pagination Gap

**Status:** Accepted
**Date:** 2026-04-13

---

## Decision

Shopify streams are deployed and backfilling. A weekly gap sweep using `created_at` month ranges supplements the `updated_at` pagination to achieve complete corpus coverage. The `updated_at` backfill alone misses ~0.5% of records per year due to timestamp collisions at GraphQL page boundaries.

## What Was Deployed

Four polling streams running simultaneously on EventBridge schedules:

| Stream | Schedule | Records | Status |
|---|---|---|---|
| Orders | 5 min | 7.1M | Incremental (backfill complete) |
| Customers | 15 min | 2.5M | Backfilling (34% of 7.2M) |
| Products | 30 min | 861 | Complete (verified 1:1 against API) |
| Inventory | 15 min | 1,802 | Complete |
| Refunds | (sub-stream) | 113K | Extracted from orders |
| Transactions | (sub-stream) | 14.2M | Extracted from orders |

Total: 25.4M rows across 9 tables, 3 vendors.

## Deployment Fixes Required

### 1. Shopify 2026 OAuth client credentials flow

New Shopify custom apps use `client_id + client_secret → 24-hour rotating tokens`. The Shopify client was updated to auto-detect auth mode: tries client credentials from SSM, falls back to legacy static `shpat_` token. Token cached in memory, refreshed 5 minutes before 24-hour expiry.

### 2. GraphQL API 2026-04 breaking changes

| Change | Fix |
|---|---|
| `refunds` on Order: connection → direct array | Removed `edges/node` wrapping in query |
| `transactions` on Order: connection → direct array | Same |
| `priceV2` on ProductVariant: removed | Changed to `price` (scalar) |
| `compareAtPriceV2`: removed | Changed to `compareAtPrice` (scalar) |
| `weight`, `weightUnit` on ProductVariant: removed | Removed from query |
| `totalRefundedSet` on Refund: unchanged | Initially incorrectly renamed to `totalSet`, reverted |

### 3. `read_all_orders` scope required

New Shopify apps default to `read_orders` (60-day history). Full backfill requires `read_all_orders` scope, which must be requested in the Dev Dashboard. Without it, orders appear to backfill correctly but only contain recent data.

### 4. `read_locations` scope required for inventory

The inventory query requests `location.name` which requires `read_locations` scope.

### 5. Decimal serialization in pg_client

Pydantic models produce `Decimal` values. Every `json.dumps` call in `pg_client.py` needs `default=str` or the upsert fails. This was a latent bug affecting all streams, surfaced by Shopify orders.

### 6. GraphQL pagination cursor not persisted across runs

Same bug as Gorgias (ADR-049): the GraphQL `endCursor` was lost between runs. Each run re-queried from the checkpoint timestamp, re-processing the same first page. Fixed by encoding the full state (`checkpoint + endCursor`) in `checkpoint_cursor` when `has_more=True`.

## The Pagination Gap

### Discovery

After orders backfill completed (cursor at today's date), comparison against Shopify's `ordersCount(limit: null)` showed:

- Shopify API: 7,485,293 orders
- Postgres: 7,095,031 orders
- Gap: ~390,000 (5.2%)

### Root cause

The `updated_at` ascending backfill uses GraphQL cursor pagination. When multiple orders share the same `updated_at` timestamp (common during bulk operations, imports, or app modifications), the page boundary can split a group of same-timestamp records. The cursor lands mid-group, and the next query skips the remaining records in that group.

Year-by-year comparison showed the gap is evenly distributed (~0.5-0.7% per year), confirming it's a systematic pagination issue, not a one-time error.

### Fix: created_at gap sweep

A `gap_sweep` mode on the stream_runner iterates month-by-month using `created_at` ranges:

1. Query: `created_at:>=YYYY-MM-01 AND created_at:<next_month`
2. Paginate through all records for that month
3. Upsert everything — existing records skipped by `ON CONFLICT` / `updated_at` check
4. Advance sweep cursor to next month

Weekly EventBridge cron (Sunday 4 AM UTC). One month per invocation. Processes all months from 2016 to present, then repeats from the beginning.

### Why not fix the primary backfill instead?

The `updated_at` ascending backfill is correct for incremental mode — it catches updates to existing records. Switching to `created_at` for the primary backfill would miss updated records. The right model is `updated_at` for the primary flow (catches changes) plus a periodic `created_at` sweep (catches timestamp-collision gaps).

## The Surplus

Postgres has ~1,300 more 2026 orders than Shopify reports. These are orders that Shopify hard-deleted after we ingested them. Same data sovereignty pattern as Yotpo (ADR-053): we capture records before the vendor removes them.

Shopify's `ordersCount` excludes hard-deleted orders. Our upsert-on-newer never deletes records. The surplus is ~0.3% — not a data error, it's data preservation.

## Assumptions

- The `created_at` gap sweep catches all records missed by `updated_at` pagination because `created_at` is immutable (an order's creation timestamp never changes)
- The weekly sweep frequency is sufficient — new gaps only form during the `updated_at` backfill, which is now complete. Incremental mode processes records one at a time and doesn't have page-boundary collisions.
- The surplus from hard-deleted orders is acceptable and does not need to be cleaned

## Freshness Marker

- **Captured:** 2026-04-13
- **Stale when:** Shopify changes their GraphQL cursor pagination to avoid timestamp collisions, the gap sweep completes all months and the gap closes to <0.1%, or the platform adds a deletion detection mechanism that removes hard-deleted orders from Postgres.
