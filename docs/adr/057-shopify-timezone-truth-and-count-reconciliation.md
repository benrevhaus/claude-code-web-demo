# ADR-057: Shopify Timezone Truth and Count Reconciliation

**Status:** Accepted
**Date:** 2026-04-13

---

## Decision

All Shopify order count comparisons between the API and Postgres must use:

1. **Shopify API:** `created_at:>=YYYY-MM-01 AND created_at:<=YYYY-MM-DD` (last day of month, inclusive)
2. **Postgres:** `created_at >= ('YYYY-MM-01'::timestamp AT TIME ZONE 'America/Los_Angeles') AND created_at < ('YYYY-MM-DD'::timestamp AT TIME ZONE 'America/Los_Angeles' + INTERVAL '1 day')`

This is the only combination that produces matching counts between the API, ShopifyQL, the Shopify admin UI, internal analytics tools, and Postgres. It was arrived at through a multi-hour debugging session that systematically eliminated every other approach.

## Why This Was So Hard

### The surface problem

After the Shopify orders backfill completed, the total count didn't match the API. The operator asked for a per-month comparison. The first comparison showed a gap of 33 orders in May 2016. Five successive fix attempts failed to close the gap. Each attempt revealed a different layer of the problem.

### The layers

#### Layer 1: The backfill filter bug

The `updated_at:>=checkpoint` filter in the Shopify client excluded all orders never modified after creation. This was a code bug, found and fixed (ADR-055). The gap repair was built to sweep missed records.

#### Layer 2: The repair didn't find the missing orders

The repair reported `new=38` for May 2016 but the Postgres count didn't change. Investigation revealed the 38 were updates to existing rows (the upsert fired because `updated_at` was newer), not inserts. The "new" counter was misleading.

#### Layer 3: The sort key caused page-boundary collisions

The repair initially sorted by `UPDATED_AT`. When multiple orders share the same `updated_at` at a page boundary, the GraphQL cursor skips records. Changing to `CREATED_AT` still had collisions (multiple orders created in the same second). Only `sortKey: ID` eliminated collisions because IDs are unique.

#### Layer 4: The repair still reported 0 new after sort fix

With `sortKey: ID`, the API returned all 779 orders for May 2016. But the repair's existing-ID pre-filter matched all 779 and skipped them. The 33 "missing" orders existed in Postgres but their `created_at` in UTC fell outside the May boundary. They were counted as June orders in UTC but May orders in the store timezone.

#### Layer 5: Shopify uses store timezone, Postgres stores UTC

Shopify's `created_at` filter uses the store's configured timezone (America/Los_Angeles, which observes PST/PDT). An order at `2016-06-01T05:00:00 PDT` is "June 1st" in the store but `2016-06-01T12:00:00Z` in UTC. Shopify's `created_at:<2016-06-01` includes this order in the May query because it interprets `<2016-06-01` as "before June 1st in store time."

The existing-ID query in Postgres used UTC boundaries: `WHERE created_at >= '2016-05-01' AND created_at < '2016-06-01'`. This missed the 33 orders with UTC timestamps in June that Shopify considers May orders.

#### Layer 6: Shopify's < operator is inclusive of the boundary day

Shopify's `created_at:<2016-06-01` does not mean "before midnight June 1st in store time." It means "before the end of June 1st in store time" — effectively `<=2016-06-01`. This is why the API count (779) was higher than the business count (746): the API's `<next_month` filter includes the entire first day of the next month.

The operator's internal tool and ShopifyQL both use `SINCE 2016-05-01 UNTIL 2016-05-31` which correctly stops at midnight on May 31st. They agree on 746.

#### Layer 7: The correct API filter is <=last_day, not <first_of_next

To get the business-correct count from the API:
- **Wrong:** `created_at:>=2016-05-01 AND created_at:<2016-06-01` → 779 (includes June 1st)
- **Correct:** `created_at:>=2016-05-01 AND created_at:<=2016-05-31` → 746 (matches ShopifyQL)

#### Layer 8: DST transitions affect the UTC offset

America/Los_Angeles observes daylight saving time:
- PST (November–March): UTC-8
- PDT (March–November): UTC-7

The Postgres query must use `AT TIME ZONE 'America/Los_Angeles'` which handles DST automatically, not hardcoded UTC offsets. A January comparison with `-8` would be wrong in June when the offset is `-7`.

## The Debugging Chain (What the Operator Had to Untangle)

The AI made five successive attempts to match the counts, each of which the operator had to correct:

1. **AI assumed timestamp collisions at page boundaries (~0.5% gap).** Operator pushed for exact match, not tolerance. Revealed the gap was structural, not edge-case.

2. **AI changed sort key from UPDATED_AT to CREATED_AT.** Still had collisions. Operator insisted on 100% accuracy. AI changed to sort by ID — collision-free.

3. **AI reported "new=38" but count didn't change.** AI explained it as "updates, not inserts" and suggested accepting ~5% gap. Operator rejected this. Investigation revealed the 38 were timezone boundary orders, not missing data.

4. **AI loaded all 7M IDs globally to avoid the boundary issue.** Operator caught the insanity of loading 7M IDs per Lambda invocation. Scoped back to ±2 days.

5. **AI compared Postgres count against API `ordersCount` (779).** Operator pointed out that their internal tool shows 746, matching ShopifyQL. AI was comparing against the wrong source of truth. Operator directed: "the API must pass the PST/PDT adjusted numbers."

6. **AI found `<=last_day` gives 746 from the API.** This matched the operator's internal tool exactly. The operator verified all 12 months of 2016 against their own data — perfect match.

At each step, the AI's instinct was to explain why the discrepancy was acceptable or to add a workaround. The operator's instinct was to demand 100% accuracy and identify the root cause. The operator was right every time.

## What the Operator Knew That the AI Didn't

1. **The approximate order count.** The operator knew 746 was right for May 2016 because their internal tool said so. The AI had no external reference and accepted 779 from the API without questioning it.

2. **That ShopifyQL and the admin UI are the business truth.** The API's `ordersCount` is a raw count with different boundary semantics. The operator's tools use the same semantics as ShopifyQL. The AI didn't know this distinction existed.

3. **That Shopify operates in store timezone.** Every Shopify merchant knows their store timezone affects date-based queries. The AI treated all timestamps as UTC because that's what the GraphQL response returns.

4. **That DST must be handled.** The operator immediately asked about DST because they know their business spans both PST and PDT seasons. The AI would not have considered DST without being asked.

5. **That comparing Postgres against itself proves nothing.** When the AI showed "business count = 746" from Postgres and declared a match, the operator pointed out that this was circular. The count had to come from the API independently.

## The Final Correct Approach

### For per-month comparison (used by the comparison script):

```
Shopify API:
  ordersCount(limit: null, query: "created_at:>=YYYY-MM-01 AND created_at:<=YYYY-MM-DD")
  where DD = last day of month

Postgres:
  WHERE created_at >= ('YYYY-MM-01'::timestamp AT TIME ZONE 'America/Los_Angeles')
  AND created_at < ('YYYY-MM-DD'::timestamp AT TIME ZONE 'America/Los_Angeles' + INTERVAL '1 day')
  where DD = last day of month
```

Both use store timezone. Both stop at midnight on the last day of the month. Both handle DST automatically. They match.

### For the repair's existing-ID comparison:

```sql
SELECT id FROM shopify.orders
WHERE created_at >= ('YYYY-MM-01'::timestamp AT TIME ZONE 'America/Los_Angeles')
AND created_at < (('YYYY-MM+1-01'::timestamp + INTERVAL '1 day') AT TIME ZONE 'America/Los_Angeles')
```

Includes one extra day to capture timezone boundary orders that the API considers part of this month but Postgres stores with UTC timestamps in the next month.

### For the incremental polling (unchanged):

The `updated_at:>=checkpoint` filter uses full ISO timestamps with timezone info. Shopify interprets these consistently regardless of DST. The 5-minute polling cycle catches any DST edge cases on the next tick.

## Verification

All 12 months of 2016 verified against the operator's internal tool:

| Month | API (<=last day) | Postgres (store TZ) | Internal Tool | Match |
|-------|-----------------|-------------------|---------------|-------|
| Jan | 0 | 0 | 0 | ✓ |
| Feb | 0 | 0 | 0 | ✓ |
| Mar | 1 | 1 | 1 | ✓ |
| Apr | 1 | 1 | 1 | ✓ |
| May | 746 | 746 | 746 | ✓ |
| Jun | 3,406 | 3,406 | 3,406 | ✓ |
| Jul | 6,915 | 6,915 | 6,915 | ✓ |
| Aug | 6,578 | 6,578 | 6,578 | ✓ |
| Sep | 5,874 | 5,874 | 5,874 | ✓ |
| Oct | 2,542 | 2,542 | 2,542 | ✓ |
| Nov | 9,325 | 9,325 | 9,325 | ✓ |
| Dec | 24,568 | pending | pending | repair in progress |

2017-2018 also verified: all months match perfectly.

## Assumptions

- The store timezone is `America/Los_Angeles` (PST/PDT). If the store timezone changes, all comparison queries and the repair's existing-ID query must be updated.
- Shopify's `<=last_day` filter behavior is stable and won't change in future API versions.
- The `AT TIME ZONE` conversion in Postgres correctly handles all DST transitions, including the ambiguous fall-back hour.
- The incremental polling's full ISO timestamp handling is DST-safe because it runs every 5 minutes, which is shorter than any DST transition window.

## Tribal Context

- This debugging session took multiple hours. The AI made five successive attempts, each solving one layer but revealing the next. The operator had to intervene at every layer because the AI's instinct was to explain away discrepancies rather than investigate them.
- The key insight — that `<=last_day` matches ShopifyQL but `<first_of_next_month` doesn't — was only discovered by exhaustive enumeration of filter combinations. The AI tried `test:false`, `status:any`, `financial_status:paid`, `processed_at`, and six other filters before finding that the boundary operator (`<` vs `<=`) was the issue.
- The operator's internal tool agreed with ShopifyQL, which agreed with the admin UI. Three independent sources of truth all said 746. The API said 779. The AI defaulted to trusting the API because it's "the source of truth." The operator knew that the API's count semantics differ from the business semantics. This is ADR-056 blind spot #5: "not questioning assumptions when results look wrong."
- The store timezone issue was raised by the operator ("Shopify must pass the PST/PDT adjusted numbers"), not discovered by the AI. The AI would have continued comparing UTC boundaries indefinitely without this intervention.

## Freshness Marker

- **Captured:** 2026-04-13
- **Stale when:** Shopify changes their `created_at` filter boundary semantics, the store timezone changes from America/Los_Angeles, or the platform adds automated monthly reconciliation that replaces the manual comparison script.
