# ADR-041: Legacy MySQL Seed for Review Gap Fill

**Status:** Proposed
**Date:** 2026-04-07

---

## Decision

After the Yotpo widget endpoint backfill completes, a one-time seed script will fill review gaps from the legacy MySQL database. This ADR documents the source schema, field mapping, and extraction plan so the work can be executed in a future session without rediscovery.

## Intent

The Yotpo widget endpoint caps at approximately 10,000 reviews per product. Products with more reviews than this ceiling have truncated history in data-streams. The legacy MySQL database contains the full corpus — it was the original Yotpo integration target and has been accumulating reviews for years.

This is not a recurring sync. It is a one-time gap fill that runs after the widget backfill completes, then never runs again. The incremental merchant endpoint and daily product refresh handle steady state going forward.

## When to Execute

Not now. Execute when all three conditions are met:

1. Widget backfill has completed all 757 products (cursor is a timestamp, not a position)
2. The gap check script (`scripts/check_review_caps.py`) confirms which products are truncated
3. The legacy MySQL database is accessible from the operator's machine

## Source Database

**System:** CodeIgniter PHP application (`~/projects/contactus`)
**Database:** MySQL, schema `shopify_api`
**Connection:** PDO via environment config (`config.env.php`, not in repo)
**Character set:** latin1 / utf8 / utf8mb4 (mixed)

## Source Tables

### `storereviews_reviews` — primary review data

| MySQL column | Type | Maps to | Notes |
|---|---|---|---|
| `id` | bigint unsigned PK | `id` | Yotpo review ID — same PK as widget endpoint |
| `product_id` | bigint unsigned | `domain_key` | This IS the Shopify product ID |
| `score` | tinyint unsigned | `score` | 1-5 |
| `content` | text | `content` | Review body |
| `title` | varchar(127) | `title` | |
| `display_name` | varchar(63) | `name` | Storefront display name |
| `sentiment` | decimal(10,6) | `sentiment` | 0-1 range |
| `votes_up` | smallint unsigned | `votes_up` | |
| `votes_down` | smallint unsigned | `votes_down` | |
| `verified_buyer` | tinyint unsigned | `verified_buyer` | 0/1 boolean |
| `deleted` | tinyint unsigned | `deleted` | 0/1 boolean |
| `source_review_id` | bigint unsigned | `source_review_id` | For variant-level reviews |
| `images_data` | varchar(768) | `images_data` | JSON array of image objects |
| `videos_data` | varchar(768) | — | JSON array, stored but not in current widget model |
| `created_at` | datetime | `created_at` | No timezone — assume UTC |
| `user_id` | bigint unsigned | — | Yotpo internal user ID |
| `user_type` | varchar(15) | `reviewer_type` | |
| `social_image` | varchar(255) | — | Not needed |
| `imported_at` | datetime | — | Legacy import timestamp |
| `sort_order` | decimal(18,8) | — | Legacy sorting field |

### `storereviews_reviews_users` — reviewer PII

| MySQL column | Type | Maps to | Destination |
|---|---|---|---|
| `review_id` | bigint unsigned PK | join key | |
| `email` | varchar(255) | `email` | Source-canonical only + identity companion |
| `name` | varchar(127) | — | Redundant with display_name |
| `sku` | varchar(31) | — | Not a reliable product key |
| `reviewer_type` | varchar(31) | — | Redundant with main table |

### `storereviews_reviews_metadata` — geographic enrichment

| MySQL column | Type | Maps to | Destination |
|---|---|---|---|
| `review_id` | bigint unsigned PK | join key | |
| `state` | varchar(31) | `state` | `yotpo.review_metadata_current` |
| `country` | varchar(15) | `country` | `yotpo.review_metadata_current` |

### `storereviews_reviews_images` — individual image rows

| MySQL column | Type | Notes |
|---|---|---|
| `review_id` | bigint unsigned | |
| `image_index` | smallint unsigned | Ordering |
| `thumb_url` | varchar(511) | |
| `original_url` | varchar(511) | |

Can be used to reconstruct `images_data` JSON if the `images_data` column on the main table is truncated (varchar 768 limit).

### `storereviews_reviews_videos` — video data

| MySQL column | Type | Notes |
|---|---|---|
| `review_id` | bigint unsigned | |
| `thumb_url` | varchar(511) | |
| `video_url` | varchar(511) | |
| `duration` | smallint unsigned | Seconds |

Not currently in the data-streams canonical model (videos_data was removed when the widget endpoint showed no video support). Can be added later if needed.

## Extraction Plan

### Step 1: Identify gaps

```sql
-- Run against data-streams Postgres
SELECT domain_key, COUNT(*) as ingested
FROM yotpo.reviews_raw_current
GROUP BY domain_key;
```

Compare against `bottom_lines` totals (use `scripts/check_review_caps.py`). Products where `ingested < yotpo_total` need gap fill.

### Step 2: Extract from MySQL

```sql
-- Run against legacy MySQL (shopify_api schema)
SELECT
    r.id,
    r.product_id AS domain_key,
    r.score,
    r.content,
    r.title,
    r.display_name AS name,
    r.sentiment,
    r.votes_up,
    r.votes_down,
    r.verified_buyer,
    r.deleted,
    r.source_review_id,
    r.images_data,
    r.user_type AS reviewer_type,
    r.created_at,
    u.email,
    m.state,
    m.country
FROM storereviews_reviews r
LEFT JOIN storereviews_reviews_users u ON r.id = u.review_id
LEFT JOIN storereviews_reviews_metadata m ON r.id = m.review_id
WHERE r.product_id IN (/* gap product_ids */)
    AND r.id NOT IN (/* already ingested IDs for those products */)
ORDER BY r.product_id, r.created_at;
```

### Step 3: Write to data-streams

For each extracted row:

1. Write raw JSON to S3 at standard key path (`yotpo/reviews/{store_id}/...`)
2. Transform using `transform_yotpo_review()` — the field mapping is 1:1
3. Upsert into `yotpo.reviews_raw_current` — PK `(id, store_id)` prevents duplicates
4. Insert history row
5. For rows with email: the email lands in `yotpo.reviews_raw_current` (source-canonical, operator-only)
6. For rows with metadata: upsert into `yotpo.review_metadata_current`

The existing `upsert_review` method handles all of this. The seed script's job is to read from MySQL, shape the data to match `YotpoReviewRaw`, and feed it through the standard pipeline.

### Step 4: Verify

```sql
-- After seed completes
SELECT domain_key, COUNT(*) as total
FROM yotpo.reviews_raw_current
WHERE domain_key IN (/* gap product_ids */)
GROUP BY domain_key;
```

Compare against `bottom_lines` totals. Gap should be zero or near-zero (some reviews may have been purged from Yotpo but still exist in MySQL, or vice versa).

## Implementation Notes

- Follow the pattern of `scripts/seed_from_brandhaus.py` — it already does legacy-to-data-streams seeding for Shopify data
- MySQL `created_at` has no timezone — treat as UTC
- MySQL `images_data` is varchar(768) — may be truncated for reviews with many images. Cross-reference against `storereviews_reviews_images` table if needed
- The `product_id` column in MySQL IS the `domain_key` (Shopify product ID) — this was confirmed during the Yotpo API validation
- The legacy system uses `REPLACE INTO` for ingestion, so MySQL has current-state data (no history)

## Why Not Extract Everything from MySQL Instead of Using the Yotpo API

The Yotpo API is the authoritative source for current review state. The MySQL database is a cache that may be stale for recently updated reviews. The API provides:

- Current vote counts (MySQL may lag)
- Current deletion status
- Current sentiment scores (Yotpo recomputes these)
- Reviews created after the legacy sync was last run

The MySQL seed fills historical gaps only. Steady-state ingestion must come from the Yotpo API.

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** the legacy MySQL database is decommissioned, the Yotpo widget endpoint removes its pagination ceiling, or the data-streams backfill is rerun with a method that retrieves the full corpus without the cap.
