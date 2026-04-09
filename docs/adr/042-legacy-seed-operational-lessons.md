# ADR-042: Legacy Seed Operational Lessons

**Status:** Accepted
**Date:** 2026-04-09

---

## Decision

Legacy database seeding runs locally, not on Lambda. The seed handler lives in the stream_runner codebase but is designed for local execution through an SSH/SSM tunnel. This ADR records the operational failures encountered during the first seed attempt and the design changes they forced.

## Intent

The Yotpo API widget endpoint caps at ~10,000 reviews per product. The legacy MySQL database contains the full corpus. A one-time seed fills the gap. This ADR exists so that future seed operations (from any legacy source) avoid the same failures.

## Failure Sequence

### 1. Lambda cannot reach the legacy database

**Symptom:** Connection timeout from Lambda to MySQL.

**Cause:** The legacy MySQL (RDS) is in a private VPC accessible only through an EC2 bastion. Lambda runs on the public internet without a fixed IP. There is no VPC peering, no NAT gateway, and no public endpoint on the RDS instance.

**Resolution:** Run the seed locally. The operator's machine can establish an SSM port-forwarding tunnel to the bastion, then connect to MySQL through `127.0.0.1:3308`. The same seed code runs locally instead of on Lambda — same S3 writes, same transforms, same Postgres upserts.

**Lesson:** Seed operations that touch legacy databases behind private networks should be designed for local execution from the start. Adding a NAT gateway ($32/month) for a one-time operation is not justified.

### 2. Credential exposure in conversation context

**Symptom:** Database credentials were displayed in tool output after the operator edited a test script with real passwords.

**Cause:** The AI assistant read back file contents that contained credentials the operator had pasted in. The assistant should have recognized credentials in the file modification notification and refused to echo them.

**Resolution:** Both passwords were rotated immediately. The test script was deleted. A behavioral rule was established: never read back or display file contents that contain credentials, even if the user edited the file.

**Lesson:** Any interactive workflow that involves editing files with credentials must treat file modification notifications as potentially containing secrets. The safe pattern is to write scripts with placeholder values and let the operator fill them in — never echo back what they entered. Temporary scripts containing credentials must be deleted immediately after use.

### 3. S3 bucket not found from local execution

**Symptom:** `NoSuchBucket` error when the seed tried to write raw payloads to S3.

**Cause:** The S3 bucket is in `us-east-1`. The local AWS SDK defaulted to `us-west-1`. The `RAW_BUCKET` environment variable was not set (Lambda gets it from Terraform; local execution doesn't).

**Resolution:** Set `AWS_REGION=us-east-1` and `RAW_BUCKET=data-streams-raw-prod` when running locally.

**Lesson:** Any seed script that writes to AWS resources must document the required environment variables. The seed wrapper script should set them explicitly rather than relying on environment defaults.

### 4. Per-record commits caused unacceptable latency

**Symptom:** Seed processing approximately 1 record per second — at 200K+ records, this would take days.

**Cause:** Each record was committed individually to Aurora in `us-east-1` from a local machine on the west coast. Cross-country round-trip latency (~60ms per commit) dominated total time.

**Resolution:** Changed to batch commits every 100 records. Added progress output every 100 records so the operator can see movement.

**Lesson:** Any seed operation running remotely from the database must batch commits. Per-record commits are only acceptable when the client and database are co-located (e.g., Lambda in the same region as Aurora).

### 5. Processing 200K existing records to find 9K gaps

**Symptom:** The first seed batch of 5,000 records contained only ~128 new rows. The remaining 4,872 already existed from the API backfill. Each one was individually checked via upsert (which returns rowcount=0 for no-op).

**Cause:** The seed iterated over all MySQL records by ID starting from 0. Most IDs already existed in Postgres from the API backfill. The upsert safely skipped them, but the round-trip to Postgres for each check was wasteful.

**Resolution:** Pre-load all existing Postgres IDs into a Python set at the start of each batch. Filter the MySQL result set in memory before any S3 writes or Postgres upserts. Batches with zero new rows advance the cursor instantly without touching Postgres.

**Lesson:** When seeding into a table that already has substantial data, always pre-filter against existing keys before processing. The cost of one `SELECT id FROM table` query is negligible compared to thousands of wasted upsert round-trips.

### 6. No progress visibility

**Symptom:** The operator had no way to tell if the seed was working, stuck, or in an error loop. No output appeared for several minutes.

**Cause:** The handler logged to structlog (which wasn't configured for local stdout) and only returned results after the entire batch completed.

**Resolution:** Added explicit `print(..., flush=True)` statements at key checkpoints: batch fetched, records skipped, progress every 100 records, batch complete.

**Lesson:** Any long-running local operation must print progress to stdout. Structlog output is not sufficient — it may not be configured for local execution. Explicit print statements with `flush=True` provide immediate feedback.

## Metadata API Is Not Viable for Bulk Backfill

A parallel discovery during this period: the Yotpo metadata API is per-review only (no bulk endpoint). For 200K reviews, this would require 200K individual API calls. At the Lambda timeout of 15 minutes, only ~4,500 calls can be made per invocation. Full metadata backfill via API would take days of Lambda cycles.

The metadata stream was changed to skip API calls entirely until the MySQL seed populates the baseline. The seed writes both review and metadata data in one pass — the legacy `storereviews_reviews_metadata` table has state and country for every review. After the seed completes, the metadata stream only needs to fetch metadata for genuinely new reviews (a few per hour at steady state).

## Performance Optimizations (applied during first run)

The initial seed implementation was functionally correct but operationally unusable. Three rounds of optimization were required to reach acceptable performance:

### 1. Pre-filter existing IDs in memory

The seed loads all existing review IDs and metadata IDs from Postgres into Python sets before processing each MySQL batch. Rows that already exist are skipped in memory — no Postgres round-trip. This turned 95% of the MySQL rows into instant no-ops.

Without this: every row requires a Postgres upsert round-trip that returns rowcount=0 (no change). At 60ms cross-country latency per call, 200K rows would take days.

### 2. Bulk INSERT for metadata

Individual `INSERT ... ON CONFLICT` statements for metadata were replaced with bulk inserts of 1,000 rows per statement. One SQL round-trip inserts 1,000 rows instead of 1,000 round-trips inserting 1 row each.

Without this: metadata processing ran at ~3 records/second. With bulk inserts: ~1,000 records/second.

### 3. Reviews and metadata in one pass

Each MySQL batch processes both reviews and metadata together. Reviews are filtered against existing IDs (most are skipped). Metadata is filtered against existing metadata IDs and bulk-inserted for every row in the batch — including rows where the review already existed. This backfills metadata for the full corpus, not just new reviews.

Without this: metadata would only be populated for the ~9K gap reviews, leaving 200K reviews without state/country data. The metadata API is per-review only (no bulk endpoint) and would take days to backfill via Lambda.

### 4. Larger batch size with larger commit interval

Batch size increased from 5,000 to 20,000 MySQL rows. Commit interval increased from 100 to 1,000 records. Both reduce the number of Postgres round-trips per batch.

### 5. Progress output with rate and ETA

Every commit prints: records processed, rate per second, estimated time remaining. Without this, the operator had no way to distinguish "working slowly" from "stuck in a loop" during multi-minute batch processing.

## Final Seed Configuration

- **Execution:** local machine via `scripts/seed-from-mysql.sh`
- **Tunnel:** SSM port forwarding through EC2 bastion (`127.0.0.1:3308 → RDS:3306`)
- **Batch size:** 20,000 MySQL rows per round
- **Reviews:** pre-filtered in memory, only new rows upserted individually (commit every 1,000)
- **Metadata:** pre-filtered in memory, bulk INSERT of 1,000 rows per SQL statement
- **Progress output:** every 1,000 records with rate/sec and ETA
- **Cursor:** `control.stream_cursors` with stream name `mysql-seed`, tracks last MySQL ID
- **Resumption:** automatic — Ctrl+C and re-run picks up from last saved cursor. Rounds with all-existing reviews skip to metadata-only mode.
- **Environment variables required:** `AWS_REGION=us-east-1`, `RAW_BUCKET=data-streams-raw-prod`
- **Estimated total time:** 15-20 minutes for ~210K MySQL rows (most skipped in memory)

## Golden Path for Future Legacy Seeds

When seeding from a legacy database (Gorgias or any future source), follow this sequence:

1. **Create a column-restricted MySQL/Postgres user** with SELECT only on the fields needed for the mapping. No write access, no access to unrelated tables.
2. **Store the connection string in SSM** at `/data-streams/{env}/legacy/{source}_connection_string`.
3. **Establish a tunnel** if the database is behind a private network. SSM port forwarding is preferred over SSH (no key management).
4. **Pre-load existing IDs into memory** before processing. Do not rely on upsert no-ops for deduplication — the round-trip cost is prohibitive at scale.
5. **Use bulk INSERT for high-volume tables.** Individual upserts are acceptable only when the new-row count is small (under 1,000).
6. **Process reviews and metadata in one pass.** Do not separate them into sequential phases — the MySQL query joins them cheaply.
7. **Print progress with rate and ETA.** Long-running local operations without visible progress cause operators to kill healthy processes.
8. **Test the tunnel stability.** SSM tunnels can drop during long operations. The seed is resumable by cursor, but a dropped tunnel mid-batch loses that batch's work.
9. **Reconcile after completion.** Compare counts and checksums between source and target databases to confirm completeness.
10. **Delete the seed cursor** from `control.stream_cursors` after reconciliation passes — it has no steady-state purpose.

## Reconciliation

After seed completion, run `scripts/reconcile_sample.py` to compare 1,000 random reviews (2-4 months old) between Postgres and MySQL across comparable fields.

### Fields compared
- `score`, `title`, `votes_up`, `votes_down`, `verified_buyer`, `deleted`, `name`

### Fields NOT compared (expected differences)
- **`domain_key` / `product_id`:** Postgres stores Shopify product IDs (from widget endpoint). MySQL stores Yotpo internal product IDs. Different ID systems for the same product.
- **`content`:** MySQL uses `latin1` charset which silently destroys emoji characters. Postgres has correct UTF-8 from the Yotpo API. Postgres data is strictly better.

### Accepted mismatch categories

**Emoji in titles (< 1%):** Same root cause as content — MySQL `latin1` limitation. Postgres has authoritative data.

**`verified_buyer` null vs true (< 1%):** The widget API returns null for some reviews where MySQL's legacy sync defaulted to true. The API is the source of truth.

**Vote count drift (< 0.5%):** Votes change over time. The API backfill and MySQL sync captured counts at different moments. Differences of 1-2 votes are expected and not a data integrity issue.

### First reconciliation result

1,000 random reviews from the 2-4 month window:
- Found in both databases: 1,000/1,000
- Perfect match: 987 (98.7%)
- Mismatches: 13 (all in accepted categories above)
- Zero unexplained mismatches

### Running the reconciliation

```bash
# Requires SSM tunnel to MySQL active
AWS_REGION=us-east-1 AWS_DEFAULT_REGION=us-east-1 .venv/bin/python scripts/reconcile_sample.py
```

## Assumptions

- The SSM tunnel remains stable for the duration of the seed (typically 15-20 minutes for the full corpus)
- The legacy MySQL database will remain accessible for the duration of the seed
- After the seed completes, the `mysql-seed` cursor can be deleted from `control.stream_cursors` — it has no steady-state purpose
- The metadata stream will begin API-based metadata fetches only after the seed has populated the baseline in `yotpo.review_metadata_current`
- Future legacy seeds (e.g., Gorgias) follow the same pattern: tunnel + local execution + pre-filter + bulk insert + reconciliation

## Freshness Marker

- **Captured:** 2026-04-09
- **Stale when:** the legacy MySQL database is decommissioned, the platform adds a VPC with NAT gateway (making Lambda-based seeding viable), or a CI/CD pipeline automates the build-deploy-seed sequence.
