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

## Final Seed Configuration

- **Execution:** local machine via `scripts/seed-from-mysql.sh`
- **Tunnel:** SSM port forwarding through EC2 bastion (`127.0.0.1:3308 → RDS:3306`)
- **Batch size:** 20,000 MySQL rows per round (most skipped in memory)
- **Commit interval:** every 100 records
- **Progress output:** every 100 records + batch summary
- **Cursor:** `control.stream_cursors` with stream name `mysql-seed`, tracks last MySQL ID
- **Resumption:** automatic — Ctrl+C and re-run picks up from last saved cursor
- **Environment variables required:** `AWS_REGION=us-east-1`, `RAW_BUCKET=data-streams-raw-prod`

## Assumptions

- The SSM tunnel remains stable for the duration of the seed (typically 15-30 minutes for the gap fill)
- The legacy MySQL database will remain accessible for the duration of the seed
- After the seed completes, the `mysql-seed` cursor can be deleted from `control.stream_cursors` — it has no steady-state purpose
- The metadata stream will begin API-based metadata fetches only after the seed has populated the baseline in `yotpo.review_metadata_current`

## Freshness Marker

- **Captured:** 2026-04-09
- **Stale when:** the legacy MySQL database is decommissioned, the platform adds a VPC with NAT gateway (making Lambda-based seeding viable), or a CI/CD pipeline automates the build-deploy-seed sequence.
