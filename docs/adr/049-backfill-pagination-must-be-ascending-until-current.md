# ADR-049: Backfill Pagination Must Be Ascending Until Current

**Status:** Accepted
**Date:** 2026-04-10

---

## Decision

Any stream client that paginates through a vendor API for backfill must use ascending order (oldest first) until the cursor reaches within 24 hours of the current time. Only then may it switch to descending order (newest first) for incremental delta detection.

This rule applies to all polling clients across all vendors.

## Intent

The Gorgias tickets stream lost approximately 400,000 tickets during its first backfill because the client switched from ascending to descending pagination after the first run. This created a gap in the middle of the corpus that would never be filled without manual intervention.

This ADR documents the failure so that every future polling client follows the same pagination rule.

## What Happened

### The client's original logic

```
First run (no checkpoint): ascending order → oldest tickets first
Subsequent runs (checkpoint exists): descending order → newest tickets first
```

### The failure sequence

1. **First run:** ascending from oldest (Dec 2020), reached June 2023 after hitting the 500-page limit. Saved cursor at June 2023. Ingested ~50,000 tickets.

2. **Second run:** checkpoint exists (June 2023), switched to descending. Fetched from newest (April 2026) backward. Ingested ~43,000 recent tickets.

3. **Gap:** The entire period from June 2023 to approximately January 2026 was never fetched. Ascending stopped at June 2023. Descending started at April 2026 and worked backward, but had not yet reached June 2023.

4. **Scale of the gap:** The operator reported 336,000 tickets in 2025 alone. The gap contained an estimated 400,000+ tickets.

### Why descending didn't fill the gap

Descending pagination fetches by `updated_datetime` descending — newest first. For the descending run to reach the June 2023 cursor, it would need to page backward through every ticket updated between April 2026 and June 2023. At 50,000 tickets per 15-minute run, this would take approximately 2+ hours — but only if every ticket in that range had been updated recently. Tickets that were closed in 2024 and never modified would not appear in the descending pagination until their original position was reached.

The result: a permanent gap of unmodified old tickets that neither ascending nor descending pagination would reach.

## The Fix

The client now stays in ascending order until the checkpoint is within 24 hours of the current time. The logic:

```
If no checkpoint: ascending
If checkpoint exists but is > 24 hours old: ascending (still backfilling)
If checkpoint exists and is < 24 hours old: descending (incremental mode)
```

This guarantees that every ticket is seen exactly once during backfill (ascending through the full corpus), and incremental mode only activates after the backfill is complete.

The Gorgias tables were truncated and the cursor was reset. The backfill restarts from the beginning, ascending through the entire corpus with no gap.

## The Rule

**For any polling client that paginates through a vendor API:**

1. Backfill must be ascending (oldest first) — this guarantees complete corpus coverage
2. The switch to descending (incremental) must only occur when the cursor is near current time
3. "Near current time" means within one backfill cycle's worth of data (typically 24 hours)
4. The max_pages_per_run limit must not cause the client to switch pagination direction prematurely

### Why ascending for backfill

Ascending guarantees monotonic progress through the corpus. Each run advances the cursor forward in time. No ticket is skipped. The cursor always represents "everything before this point has been fetched."

### Why descending for incremental

After backfill, new and updated tickets appear at the top of the descending result set. Descending detects deltas efficiently — the client fetches the newest changes and stops when it reaches the checkpoint (data it's already seen).

### Why the 24-hour threshold

The threshold must be larger than the maximum gap between the checkpoint and the next run. With a 15-minute EventBridge schedule and 500 pages per run, each run covers approximately 50,000 tickets. If ticket volume is less than 50,000 per day (true for all current vendors), a 24-hour threshold ensures the backfill is complete before switching to incremental.

If a vendor generates more than 50,000 tickets per day, the threshold should be increased to match the expected backfill catch-up rate.

## Streams Affected

| Stream | Pagination | Status |
|--------|-----------|--------|
| Gorgias tickets | Fixed: ascending until checkpoint < 24h | Backfilling clean |
| Yotpo reviews | Not affected: uses product-by-product iteration, not time-based pagination | N/A |
| Shopify streams | Not affected: uses GraphQL cursor pagination, not time-ordered | N/A |

## Why-Not (Rejected Alternatives)

### Keep descending and let it fill the gap over time

Rejected because descending pagination by `updated_datetime` only reaches old tickets if they were recently modified. Closed tickets from 2024 that were never touched after closure would never appear in the descending results. The gap would be permanent, not eventual.

### Use two parallel cursors (ascending and descending simultaneously)

Rejected because it doubles the API call volume, doubles the complexity of cursor management, and creates a merge problem when the two cursors meet. Ascending-only until current is simpler and achieves the same result.

### Increase max_pages_per_run to cover the full corpus in one run

Rejected because it would require a Lambda timeout longer than 15 minutes for large corpora. The page limit exists to keep each run within the Lambda execution window. The fix must work within the existing pagination constraints.

## Assumptions

- The 24-hour threshold works for all current vendors because none generate more than 50,000 records per day
- The `updated_datetime` field on vendor APIs is reliable and monotonically increasing for new records
- Ascending pagination returns records in a stable order that doesn't skip records between runs

## Tribal Context

- This bug was invisible in the data. The ticket count was growing, new tickets were appearing, and the cursor showed "success." The gap was only discovered when the operator compared the total ticket count against the vendor's dashboard and found a 400K+ discrepancy.
- The original descending-after-checkpoint logic was designed for incremental delta detection — catching new and updated records quickly. It was never tested against a large initial backfill where the corpus is too large to fetch in a single run.
- The Yotpo client avoided this bug by accident: its product-by-product iteration doesn't use time-ordered pagination. But the Yotpo cursor had its own bug (ADR-040) with the same root cause: cursor behavior that works for small datasets but fails at scale.
- The pattern is: **every cursor and pagination strategy must be tested against a corpus larger than max_pages_per_run.** Small-dataset testing will not catch pagination gaps.

## Freshness Marker

- **Captured:** 2026-04-10
- **Stale when:** the platform adds a vendor with non-time-ordered pagination (e.g., cursor-token-only APIs where ascending/descending is not configurable), or the 24-hour threshold proves insufficient for a high-volume vendor.
