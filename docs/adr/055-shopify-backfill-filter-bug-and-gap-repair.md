# ADR-055: Shopify Backfill Filter Bug and Gap Repair

**Status:** Accepted
**Date:** 2026-04-13

---

## Decision

The Shopify GraphQL client's `updated_at:>=checkpoint` filter was fundamentally incompatible with backfill. It has been removed during backfill mode. A gap repair mechanism sweeps by `created_at` month ranges to fill records missed by the original backfill. This repair applies to all Shopify streams and is reusable for any future brand.

## What Happened

### The bug

The Shopify GraphQL client applied `updated_at:>={checkpoint}` as a query filter on every request. During backfill:

1. First run: no checkpoint → no filter → fetches from the beginning, processes records, saves checkpoint (e.g., `2017-06-27`)
2. Second run: filter `updated_at:>=2017-06-27` → permanently skips all records with `updated_at` before that date

Records created in early months that were never modified after creation have `updated_at` equal to `created_at`. Once the checkpoint advanced past their date, they became permanently invisible to the backfill.

### The scale of the damage

| Stream | Shopify total | Postgres had | Missing | % missing |
|---|---|---|---|---|
| Orders | 7,485,293 | 7,095,031 | 390,262 | 5.2% |
| Customers | 7,230,229 | 2,479,611 | 4,750,618 | **65.7%** |

Orders was less affected because orders are frequently modified (refunds, fulfillments, tag changes). Customers was devastated because most customers are created once and never updated — 65% of the corpus was skipped.

### How it was discovered

1. Orders gap discovered by comparing `ordersCount(limit: null)` against Postgres totals
2. Initial assumption: timestamp collisions at GraphQL page boundaries (~0.5% gap)
3. Year-by-year comparison showed the gap was heavily concentrated in early years
4. Month-by-month analysis of 2016 revealed thousands of missing orders per month, not hundreds
5. Investigation of `min(updated_at)` for original backfill data showed no records with `updated_at` before ~2018 — proving the filter excluded them
6. Customer check prompted by the operator ("are any other endpoints similarly affected?") revealed 65% missing — the same bug, worse because customers are rarely updated

### Why it wasn't caught earlier

The backfill appeared to complete successfully:
- The cursor reached present day (switched to incremental mode)
- No errors in any run
- Record counts were in the millions (looked plausible)
- No per-year validation was performed until after the system was declared stable

The bug produced a corpus that was large, recent, and error-free — but structurally incomplete. Only comparison against the API's total count revealed the gap.

## The Fix

### 1. Remove filter during backfill (deployed)

```python
# During backfill (page_cursor exists), don't filter by updated_at
if checkpoint and not page_cursor:
    query_filter = f"updated_at:>={checkpoint}"
else:
    query_filter = None
```

The timestamp filter now only activates in incremental mode (checkpoint exists, no page_cursor from mid-pagination). During backfill, the GraphQL `endCursor` alone handles continuation.

### 2. Gap repair by created_at month ranges (deployed)

A `gap_repair` mode sweeps all historical months using `created_at` ranges:

- Queries: `created_at:>=YYYY-MM-01 AND created_at:<next_month`
- Pre-loads existing Postgres IDs for the month into a set
- Skips records that already exist (no S3 write, no upsert)
- Only truly missing records get S3 write → transform → upsert
- Cursor tracks last completed month (`orders-repair`, `customers-repair`)

Optimizations:
- 250 per page (Shopify GraphQL max)
- Self-contained GraphQL calls with month filter on every page (doesn't use `client.fetch_page()`)
- No S3 write for existing records
- Separate Lambda functions for orders and customers — safe to run in parallel

### 3. Weekly recurring sweep (deployed)

A `gap_sweep` mode runs weekly (Sunday 4 AM UTC) and checks the current and previous month only. This catches any gaps from timestamp collisions in recent incremental data.

## Why This Bug Was Missed by Prior ADRs

ADR-049 documented pagination direction bugs (Gorgias ascending/descending) and cursor persistence bugs (Gorgias/Shopify endCursor lost between runs). This bug is a third variant: **a filter that excludes records the cursor would have reached**.

The existing rules caught:
- Ascending vs descending direction (Gorgias)
- Cursor not persisting across runs (Gorgias, Shopify)
- API cursor format (Gorgias cursor-only pagination)

The existing rules did NOT catch:
- A filter applied alongside the cursor that silently narrows the result set

### The updated rule (added to ADR-049)

**During backfill, the pagination cursor IS the continuation mechanism. Timestamp filters are for incremental mode only.** If a client uses both a cursor and a filter during backfill, the filter will silently exclude records that the cursor would have reached.

### The meta-rule this exposed

**When a pagination bug is found in one client, audit every other client for the same class of bug immediately.** The Shopify filter bug existed from day one. It was the same class as the Gorgias direction bug. Finding one should have triggered auditing the other. It didn't — the customer gap (65% missing) was only found after the operator asked.

## Repair Timeline

| Action | Duration |
|---|---|
| Orders repair (120 months, 7.5M records) | ~6-8 hours |
| Customers repair (120 months, 7.2M records) | ~6-8 hours |
| Both run in parallel | ~8 hours total |

After repair, recurring weekly sweep handles future gaps from the much smaller timestamp collision edge case (~0.1-0.5% per month).

## Assumptions

- The `created_at` field in Shopify is immutable — an order's creation timestamp never changes
- The gap repair finds all missing records because it sweeps every month without filtering by `updated_at`
- The pre-load of existing IDs fits in Lambda memory (7M integer IDs ≈ 56MB, within 512MB Lambda)
- Running order and customer repairs in parallel does not cause Aurora contention (different tables, different schemas)

## Tribal Context

- The 390K orders gap was initially attributed to "timestamp collisions at page boundaries" — a plausible but wrong explanation. The real cause (filter excluding unmodified records) was only discovered by analyzing which specific months had gaps and checking the `min(updated_at)` of the original backfill data.
- The customer gap (65%) was discovered because the operator asked "are any other endpoints similarly affected?" after the orders gap was found. The AI should have audited all clients immediately after finding the orders bug — it didn't. This is documented as a meta-rule violation.
- The gap repair was initially broken — page 2+ lost the month filter and fetched random data. This was caught by the operator noticing that October 2016 showed `new=0` despite Shopify reporting 2,595 orders. The repair was rewritten as self-contained GraphQL calls that maintain the filter on every page.
- The repair was further optimized after the operator noted it was doing unnecessary S3 writes for existing records. Pre-loading existing IDs eliminated ~99% of the I/O for months with high existing coverage.

## Freshness Marker

- **Captured:** 2026-04-13
- **Stale when:** the gap repair completes for both orders and customers and the counts match Shopify's API within the expected surplus (hard-deleted orders), or the platform adds automated count validation that catches this class of bug during backfill instead of after.
