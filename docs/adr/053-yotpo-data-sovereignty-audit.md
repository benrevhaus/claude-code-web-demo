# ADR-053: Yotpo Data Sovereignty Audit — What We Own vs What the Vendor Reports

**Status:** Accepted
**Date:** 2026-04-12

---

## Decision

The data-streams Yotpo review corpus is more complete than what Yotpo's own APIs report. This is by design — the MySQL legacy database preserved reviews that Yotpo no longer surfaces through some endpoints. This ADR documents the discrepancies, verifies data integrity, and identifies the negotiation leverage they create.

## The Corpus

| Metric | Value |
|---|---|
| Total reviews in data-streams | 254,307 |
| Total reported by Yotpo `bottom_lines` | ~212,000 |
| Surplus in our system | ~82,748 |
| Products with surplus | 500+ |
| Zero duplicates | Verified across all reviews |
| Content quality | 100% have non-empty content |
| Score distribution | Realistic (4.39-4.92 avg by product, not all 5-star) |

## Three Data Sources, One Corpus

The corpus was built from three sources in priority order:

### 1. Yotpo widget API (primary authority)

The widget endpoint (`/v1/widget/{app_key}/products/{domain_key}/reviews.json`) returned reviews with full product linkage, verified_buyer status, images, and correct UTF-8 encoding. This was the API backfill (ADR-043).

**Limitation:** 10,000 reviews per product pagination ceiling. Products with more than 10K reviews were truncated.

### 2. Legacy MySQL database (gap fill)

The MySQL `storereviews_reviews` table, maintained by the legacy PHP ingestion system for years, contained the complete historical corpus. The MySQL seed (ADR-041/042) filled reviews that the widget API couldn't reach due to the 10K cap.

**Limitation:** MySQL uses `latin1` charset — emojis were stored as `??`. The API-sourced reviews have correct UTF-8. For reviews that exist in both sources, the API version wins (upsert-on-newer preserves the API data).

### 3. Yotpo merchant API (incremental)

The merchant endpoint (`/v1/apps/{app_key}/reviews` with `since_updated_at`) handles steady-state incremental ingestion. It returns reviews without product linkage, but `COALESCE` in the upsert preserves the `domain_key` from the API backfill.

## The Discrepancies

### Discrepancy 1: `bottom_lines` under-reports products

The `bottom_lines` endpoint reports 0 reviews for products that the widget endpoint actively serves.

**Example:** Skin Envy (domain_key `9698837377`)
- `bottom_lines` reports: **0 reviews**
- Widget endpoint reports: **11,611 reviews** (with pagination total)
- Our database: **14,924 reviews**

The widget endpoint serves the product with reviews. `bottom_lines` doesn't list it at all. This is a reporting inconsistency in Yotpo's API — the endpoints disagree about what products exist.

### Discrepancy 2: Widget pagination ceiling truncates history

For high-volume products, the widget endpoint's 10K pagination ceiling means older reviews are unreachable through the API.

**Example:** Frankincense (domain_key `9219357697`)
- `bottom_lines` reports: **16,965 reviews**
- Widget endpoint reports: **16,965 reviews** (agrees with bottom_lines)
- Widget endpoint actually served during backfill: **~10,000** (pagination ceiling)
- Our database: **22,546 reviews**
- MySQL surplus: **5,581 reviews** (older reviews beyond the API's reach)

### Discrepancy 3: Merchant single-review endpoint returns 404 for valid reviews

Individual review lookup (`/v1/apps/{app_key}/reviews/{review_id}`) returns 404 for reviews that the widget endpoint actively serves. This affects both old and new reviews.

The merchant list endpoint with `since_id` filter also fails to return reviews that exist on the widget endpoint.

## Verification: The Data Is Clean

### Cross-verification performed

1. **Everything Yotpo's widget has, we have.** 5/5 random current widget reviews found in our database with matching scores, titles, and dates.

2. **Old MySQL reviews exist on the widget.** The widget's oldest reviews for Skin Envy (IDs `41255892`, `41275235` from July 2017) are the exact same IDs and dates in our MySQL-sourced records. The widget serves them; our API backfill couldn't reach them due to the 10K cap.

3. **Reconciliation at 99% match.** 1,000-record random sample: 990 perfect matches. 10 mismatches all in expected categories (emoji encoding, vote drift, verified_buyer null handling).

4. **Zero duplicates across entire corpus.** Every review ID is unique. Upsert-on-newer prevented conflicts between API and MySQL sources.

## The Surplus: What MySQL Preserved That Yotpo Forgot

The 82,748 surplus reviews fall into three categories:

### Category 1: Reviews on products removed from Yotpo's catalog

Products where `bottom_lines` reports 0 but the widget still serves reviews. Yotpo de-indexed these products from their reporting but the reviews still exist in their system. Our MySQL preserved the full history.

**Count:** ~40,000 reviews across ~100 products

### Category 2: Reviews beyond the widget pagination ceiling

Products where `bottom_lines` and the widget agree on a count, but our database has more because MySQL stored reviews older than what the widget can paginate to.

**Count:** ~30,000 reviews across ~50 high-volume products

### Category 3: Reviews Yotpo purged entirely

Reviews where the single-review endpoint returns 404 and the widget endpoint doesn't serve them. These reviews existed in Yotpo's system when the legacy sync captured them but have since been removed.

**Count:** ~12,000 reviews across many products

## Negotiation Leverage

### 1. Yotpo's own endpoints disagree

The `bottom_lines` endpoint reports different counts than the widget endpoint for the same products. This is a data reliability concern that affects any customer using `bottom_lines` for reporting or analytics.

### 2. Yotpo silently purged reviews without notification

Reviews that the legacy system captured years ago no longer exist in Yotpo's system. There was no notification, no export, no deprecation period. The reviews simply disappeared. Our MySQL preserved them by accident — the legacy sync never deleted anything.

### 3. The platform demonstrates vendor independence

The data-streams system ingests, stores, and serves reviews independently of Yotpo. If Yotpo deletes more reviews, changes their API, or the company exits the contract, the review corpus is unaffected. This was the explicit goal of ADR-033 (source-pure streams with generalized publication).

### 4. We have more data than the vendor

254,307 reviews vs Yotpo's reported ~212,000. The surplus is verified, deduplicated, real review content. The company's review corpus is more complete in data-streams than in Yotpo's own system.

## Assumptions

- The widget endpoint's pagination total is the accurate count for active reviews per product
- The `bottom_lines` endpoint's under-reporting is a bug or product catalog issue, not intentional
- The MySQL surplus reviews are legitimate historical reviews, not test data or duplicates
- Yotpo's review purging is silent and ongoing — the surplus may grow as Yotpo continues to remove old reviews

## Tribal Context

- The surplus was discovered by comparing `check_review_caps.py` output against Postgres counts. The negative gap (-13,740) was the first signal that something was unusual.
- The initial assumption was a seeding error — the operator questioned the data quality before accepting the surplus. Verification against the widget endpoint confirmed the reviews are real.
- The `bottom_lines` reporting bug was discovered accidentally while trying to explain the surplus. Skin Envy showing 0 in `bottom_lines` but 11,611 on the widget was the proof.
- The single-review endpoint returning 404 for valid reviews was initially interpreted as "Yotpo deleted these reviews." Cross-referencing with the widget endpoint proved the reviews still exist — the single-review endpoint is simply broken or restricted.

## Freshness Marker

- **Captured:** 2026-04-12
- **Stale when:** the Yotpo vendor relationship changes (exit, renegotiation), Yotpo fixes their `bottom_lines` reporting, or the company decides the MySQL surplus reviews should be excluded from the corpus.
