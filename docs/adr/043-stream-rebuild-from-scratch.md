# ADR-043: Stream Rebuild From Scratch — When and How to Purge and Rehydrate

**Status:** Accepted
**Date:** 2026-04-09

---

## Decision

When a stream's data becomes impure — mixed source authorities, incorrect mappings, or hybrid records from multiple ingestion paths — the correct response is a full purge and rebuild, not incremental repair. The rebuild follows a strict authority hierarchy: vendor API first, legacy database second (gap fill only), with reconciliation between rounds.

## Intent

The Yotpo reviews stream became impure during its first production deployment. Two ingestion paths (Yotpo API and legacy MySQL seed) used different product ID systems, creating hybrid records where some reviews had Shopify product IDs and others had Yotpo internal IDs. Attempts at incremental repair introduced further complexity. The decision was made to purge all Postgres data and rebuild from scratch using a defined authority hierarchy.

This ADR documents the rebuild procedure so that any future stream that becomes dirty can be rebuilt with confidence.

## What Caused the Impurity

### The product ID mismatch

The Yotpo API widget endpoint returns `domain_key` (Shopify product ID) for each review. The legacy MySQL database stores `product_id` (Yotpo internal product ID). The initial MySQL seed naively used `product_id` as `domain_key`, creating rows with the wrong product identifier.

### The overwrite problem

The MySQL seed's upsert (keyed on review ID) overwrote API-backfilled rows that had correct Shopify `domain_key`s with rows containing Yotpo internal IDs. The `WHERE updated_at < EXCLUDED.updated_at` guard didn't prevent this because MySQL's timestamps matched or exceeded the API's.

### The repair spiral

Attempts to fix the data in place — mapping Yotpo internal IDs to Shopify IDs, deleting site reviews, filtering unmappable rows — added complexity without achieving certainty. Each repair pass required its own verification, and the boundary between "API-sourced row" and "MySQL-sourced row" was not cleanly tagged. The data became a Frankenstein of multiple ingestion paths with uncertain provenance.

## Why Full Rebuild

### Incremental repair cannot guarantee purity

When two sources wrote to the same table with different ID systems, and the upsert overwrote records from either direction, there is no reliable way to determine which fields on a given row came from which source. A row might have an API-sourced `content` field (correct emojis) but a MySQL-sourced `domain_key` (wrong ID system), or vice versa.

### The rebuild cost is low

Truncating Postgres tables and re-running the backfill costs approximately:
- $0.50 in AWS resources (Lambda, S3, Aurora)
- 8-12 hours of hands-off Lambda execution (API backfill)
- 30 minutes of attended MySQL seed (gap fill)

This is cheaper than the operator time spent debugging hybrid data.

### S3 raw payloads survive the purge

The immutable S3 layer retains every raw API response from every previous backfill. If the rebuild fails or needs to be done differently, the raw data is still available. Postgres is the most disposable layer in the architecture.

### The rebuild produces a verifiable result

A fresh build from a single authority (vendor API) followed by a verified gap fill (legacy database) produces a corpus that can be reconciled field-by-field. A repaired corpus cannot be reconciled because the expected state of each row depends on which repair path reached it.

## Rebuild Procedure

### Phase 1: Purge

1. Disable all EventBridge rules for the stream to prevent new Lambda invocations during the purge.
2. Truncate all source-canonical tables (current + history) and metadata tables.
3. Delete all cursor entries for the stream from `control.stream_cursors`.
4. Kill any active database connections that may be holding locks. TRUNCATE will block indefinitely if another connection holds a lock on the same table.
5. Verify all counts are zero.
6. Re-enable EventBridge rules.

### Phase 2: API backfill (authority: vendor API)

The vendor API is the primary authority. Let the scheduled Lambda run through the full product catalog via the standard backfill path. Do not intervene — EventBridge fires on schedule, each run advances the cursor.

**Wait for completion.** The backfill is done when the cursor switches from a position cursor to a timestamp cursor. This takes 8-12 hours for a corpus of 200K+ reviews.

**Do not run the legacy seed during this phase.** The API must be the first and only writer until its backfill completes.

### Phase 3: Pre-seed reconciliation (authority check)

Before running the legacy seed, verify that the API data and the legacy data agree at the source level. Pick 1000 random reviews from the legacy database, query the vendor API for the same review IDs, and compare field by field.

This proves the two sources agree before the legacy data touches the clean database. If they disagree, investigate before proceeding.

### Phase 4: Legacy seed (authority: legacy database, gap fill only)

The legacy seed fills only the reviews that the vendor API could not deliver (pagination ceilings, discontinued products). It must:

- Pre-filter existing review IDs in memory to avoid overwriting API-sourced rows
- Map legacy product IDs to the correct product identifier system using a verified mapping table
- Exclude rows that cannot be mapped (site reviews, orphaned products)
- Bulk-insert metadata in the same pass

### Phase 5: Post-rebuild reconciliation

1. Compare total counts against vendor API totals (from bottom_lines or equivalent).
2. Compare 1000 random reviews between Postgres and legacy database.
3. Verify zero rows with unmapped product identifiers.
4. Verify metadata coverage.

## Operational Notes

### TRUNCATE can be blocked by active connections

During the first rebuild, TRUNCATE hung for 40 minutes because EventBridge-triggered Lambda connections held locks on the tables. The procedure now requires disabling EventBridge rules before truncating and killing any active connections if the truncate doesn't complete within 2 minutes.

### Aurora Serverless at minimum ACU is slow for bulk operations

At 0.5 ACU, bulk operations (truncate, large deletes, bulk inserts) are noticeably slow. This is acceptable for infrequent rebuilds but should be noted in time estimates.

### The authority hierarchy must be strict

The vendor API is always the primary authority because it has:
- Current data (latest vote counts, deletion status, sentiment scores)
- Correct character encoding (UTF-8, including emojis)
- Authoritative product linkage

The legacy database is the secondary authority because it has:
- Historical depth (reviews beyond the API's pagination ceiling)
- Metadata (state/country via a different table)
- Product ID mappings (via a products table)

The legacy database must never overwrite data that the vendor API provided. The seed's pre-filter (checking existing IDs before inserting) enforces this.

## When to Rebuild vs. Repair

### Rebuild when:
- Two sources wrote to the same table with conflicting field values
- The provenance of individual rows is uncertain
- The product ID system or primary key mapping was wrong
- Incremental repair requires more than one pass to achieve certainty

### Repair when:
- A known, bounded set of rows has a specific fixable issue
- The fix is idempotent (running it twice produces the same result)
- The provenance of every affected row is certain

### Default to rebuild when uncertain

The cost of a rebuild is 8-12 hours of hands-off time plus 30 minutes of attended seed. The cost of debugging hybrid data is unbounded. When in doubt, purge and rebuild.

## Assumptions

- The vendor API remains stable and returns consistent data for the same review IDs across multiple fetches.
- The legacy database remains accessible for gap fill after the API backfill completes.
- S3 raw payloads are never deleted, providing a third recovery path independent of both the vendor API and the legacy database.
- The rebuild procedure applies to any stream, not just reviews. The authority hierarchy (vendor API → legacy database → S3 replay) is universal.

## Freshness Marker

- **Captured:** 2026-04-09
- **Stale when:** the platform adds automated data quality checks that detect impurity before it accumulates (preventing the need for manual rebuilds), or the legacy database is decommissioned (removing the gap-fill phase from the procedure).
