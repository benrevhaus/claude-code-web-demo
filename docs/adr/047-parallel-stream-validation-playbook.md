# ADR-047: Parallel Stream Validation Playbook

**Status:** Accepted
**Date:** 2026-04-10

---

## Decision

When multiple streams are running simultaneously (one backfilling, one net-new), validation follows a structured check sequence that can be run at any time without disrupting either stream. This ADR documents the exact queries and checks used during the first parallel deployment (Yotpo rebuild + Gorgias first run) so future multi-stream deployments follow the same pattern.

## Context

The Yotpo reviews stream was in a full rebuild (ADR-043): API backfill complete, MySQL seed running to fill gaps and metadata. Simultaneously, the Gorgias tickets stream was launched for the first time (net-new backfill, per ADR-044's parallel rule).

Both streams write to the same Aurora cluster but different schemas (`yotpo.*` and `gorgias.*`). Validation needed to confirm both streams were ingesting cleanly without interfering with each other.

## Validation Sequence

### Step 1: Review integrity check

Run for any stream with reviews or primary records:

```sql
SELECT 
  COUNT(*) as total,
  COUNT(DISTINCT id) as unique_ids,
  COUNT(*) - COUNT(DISTINCT id) as duplicates,
  COUNT(DISTINCT domain_key) as products,
  COUNT(*) FILTER (WHERE LENGTH(domain_key) <= 8) as short_dk,
  COUNT(*) FILTER (WHERE domain_key IS NULL) as null_dk
FROM yotpo.reviews_raw_current;
```

**Expected:** duplicates = 0, short_dk = 0. null_dk is acceptable for reviews from the incremental merchant endpoint (no product linkage).

**Red flags:** any duplicates, any short domain_keys (Yotpo internal IDs leaked through), or a total that exceeds the vendor's reported count.

### Step 2: Metadata integrity check

```sql
SELECT 
  COUNT(*) as total_metadata,
  COUNT(*) FILTER (WHERE country IS NOT NULL AND country != '') as has_country,
  COUNT(*) FILTER (WHERE state IS NOT NULL AND state != '') as has_state,
  COUNT(DISTINCT review_id) as unique_review_ids,
  COUNT(*) - COUNT(DISTINCT review_id) as duplicate_review_ids
FROM yotpo.review_metadata_current;
```

**Expected:** duplicate_review_ids = 0, high country/state coverage for populated metadata.

**Red flags:** duplicate review_ids, or country/state coverage dropping below expected levels.

### Step 3: Geographic distribution sanity check

```sql
SELECT country, COUNT(*) as reviews
FROM yotpo.review_metadata_current
WHERE country IS NOT NULL AND country != ''
GROUP BY country
ORDER BY reviews DESC
LIMIT 10;
```

**Expected:** distribution matches the business reality (US-dominant for a US-based e-commerce business).

**Red flags:** unexpected countries dominating, or a single country accounting for 100% (suggests a mapping bug).

### Step 4: Product gap check (during seed)

```sql
SELECT domain_key, COUNT(*) as reviews
FROM yotpo.reviews_raw_current
WHERE domain_key IS NOT NULL
GROUP BY domain_key
ORDER BY reviews DESC
LIMIT 15;
```

**Expected:** counts for known high-volume products should exceed the API cap (~10,000) if the MySQL seed is filling gaps. Compare against vendor-reported totals.

**Red flags:** counts stuck at exactly 10,000 (seed hasn't reached that product yet), or counts exceeding vendor totals by a large margin (duplicate ingestion).

### Step 5: Cursor state check

```sql
SELECT source, stream, last_status, records_total, cursor_value, last_run_at
FROM control.stream_cursors
ORDER BY source, stream;
```

**Expected:** all active streams show `last_status = success` and recent `last_run_at`. Cursor values should be advancing between checks.

**Red flags:** `last_status = error`, stale `last_run_at` (stream stopped), or cursor not advancing (processing but not finding new data).

### Step 6: Cross-stream ticket check (Gorgias)

```sql
SELECT 
  COUNT(*) as tickets,
  MIN(created_datetime) as oldest,
  MAX(created_datetime) as newest
FROM gorgias.tickets;
```

**Expected:** count growing, date range expanding as backfill progresses.

**Red flags:** count static (Lambda not firing or erroring), or newest date far in the past (backfill stalled).

### Step 7: Lock contention check

Run when any operation appears stuck:

```sql
SELECT pid, state, wait_event_type, wait_event,
       LEFT(query, 80) as query,
       NOW() - query_start as duration
FROM pg_stat_activity
WHERE state != 'idle' AND pid != pg_backend_pid()
ORDER BY query_start;
```

**Expected:** no `idle in transaction` connections older than a few minutes, no `Lock / transactionid` waits.

**Red flags:** `idle in transaction` with long durations (stale Lambda connections), multiple `Lock / transactionid` entries (cascade pileup — see ADR-046).

## What We Validated

During the first parallel deployment:

| Check | Yotpo | Gorgias |
|-------|-------|---------|
| Duplicates | 0 | 0 |
| Short domain_keys | 0 | N/A |
| Null domain_keys | 470 (expected — merchant endpoint) | N/A |
| Metadata coverage | 100% country on populated rows | N/A (no metadata table) |
| Country distribution | 97% US, 2.8% CA (correct) | N/A |
| Gap fill progress | Target products exceeding 10K cap | N/A |
| Cursor advancing | Yes — reviews incremental, seed progressing | Yes — first backfill running |
| Lock contention | Detected and cleared (ADR-046) | None |

## When to Run These Checks

- **During backfill:** every 30 minutes, or whenever the operator checks in
- **After seed completion:** full validation pass before re-enabling EventBridge
- **After any error:** Step 1 (integrity) + Step 7 (locks) immediately
- **Daily during steady state:** Step 5 (cursors) to confirm all streams are advancing

## Assumptions

- These queries are fast on Aurora Serverless at 0.5 ACU (all complete in under 5 seconds for 200K+ rows)
- The operator has `psql` access via the `scripts/psql-prod.sh` helper
- Multiple validation passes do not interfere with active ingestion (all are SELECT queries)

## Freshness Marker

- **Captured:** 2026-04-10
- **Stale when:** the platform adds automated data quality monitoring that replaces manual validation checks, or the schema structure changes (new columns, renamed tables) that invalidate the query templates.
