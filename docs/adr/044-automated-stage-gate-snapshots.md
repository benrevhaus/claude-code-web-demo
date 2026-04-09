# ADR-044: Automated Stage Gate Snapshots During Rebuild and Seed

**Status:** Accepted
**Date:** 2026-04-09

---

## Decision

The stream_runner Lambda automatically creates Aurora database snapshots at two critical stage gates during rebuild and seed operations. After these gates, Aurora's continuous point-in-time restore handles steady-state recovery. No manual snapshots are needed for ongoing operations.

## Intent

A stream rebuild (ADR-043) has three distinct phases where data quality changes state: clean slate → API-backfilled corpus → gap-filled corpus with legacy data. If a later phase introduces bad data, the operator needs to roll back to the previous phase's clean state without re-running the entire rebuild.

Manual snapshots are unreliable because they depend on the operator remembering to take them at the right moment — often after hours of unattended backfill when the operator may not be watching. Automated snapshots at deterministic transition points eliminate this dependency.

## Stage Gates

### Gate 1: API backfill complete

**Trigger:** The reviews stream cursor transitions from a position cursor (backfill mode) to a timestamp cursor (incremental mode). This is detected in the handler by comparing the cursor state before and after the run.

**What it captures:** The complete API-sourced corpus with correct UTF-8, current vote counts, current deletion status, and verified Shopify product IDs from the widget endpoint. Zero legacy data. This is the purest possible state of the corpus from the vendor's authoritative API.

**Snapshot name:** `yotpo-backfill-complete-{run_id}`

**Why this gate matters:** If the subsequent MySQL seed introduces mapping errors, encoding issues, or orphaned records (as happened during the first deployment), the operator restores to this snapshot and re-runs only the seed — not the 8-12 hour API backfill.

### Gate 2: MySQL seed complete

**Trigger:** The seed handler's final batch returns `has_more=False` with a non-error status. This means every MySQL row has been processed and the seed is done.

**What it captures:** The API corpus plus gap-filled reviews from the legacy database, with metadata (state/country) for every review, and all product IDs mapped through the verified `storereviews_products` table.

**Snapshot name:** `yotpo-seed-complete-{run_id}`

**Why this gate matters:** This is the last snapshot before incremental mode takes over. If incremental data introduces an issue weeks later that corrupts the baseline, the operator can restore to this known-good state and replay incremental from S3.

## After the Gates: Point-in-Time Restore

Aurora Serverless v2 maintains continuous backups automatically. After the seed completes and the system enters steady state, any recovery uses Aurora's native point-in-time restore:

- Restore to any second within the backup retention window (default: 7 days)
- No manual snapshots needed for incremental data
- Restores create a new cluster, leaving the original untouched

The automated stage gate snapshots are retained indefinitely (they are manual snapshots, not subject to the retention window) and serve as permanent baselines for future rebuilds.

## Detection Logic

### Backfill completion detection

The Yotpo reviews client operates in two modes:
- **Backfill mode:** cursor encodes a product index and page number (e.g., `{"page_cursor":"34:5"}`)
- **Incremental mode:** cursor is a plain ISO 8601 timestamp (e.g., `2026-04-09T14:00:00Z`)

The handler checks after saving the cursor: if the previous cursor was a position cursor and the new cursor is a timestamp, the backfill just completed. This is a one-time transition that fires exactly once per rebuild cycle.

### Seed completion detection

The seed handler processes MySQL rows in batches. When a batch returns fewer rows than the batch size, `has_more` is False and the seed is complete. The snapshot is created immediately before the handler returns.

## IAM

The stream runner IAM role has `rds:CreateDBClusterSnapshot` permission on the Aurora cluster ARN. This is the minimum permission needed — it cannot delete snapshots, modify the cluster, or perform other destructive operations.

## Failure Handling

Snapshot creation is non-fatal. If the RDS API call fails (permissions, naming conflict, service issue), the handler logs a warning and continues. The data is safe in Postgres and S3 regardless — the snapshot is a convenience for faster rollback, not a data safety mechanism.

## Why Automated Over Manual

### The operator is not watching when the transition happens

The API backfill runs for 8-12 hours on a 15-minute EventBridge schedule. The completion happens on whichever run exhausts the last product — which is unpredictable within a few-hour window. The operator cannot reliably be present at that moment.

### The transition is deterministic and detectable

The cursor state change is binary: either the cursor is a position (backfilling) or a timestamp (incremental). There is no ambiguous middle state. This makes automated detection reliable.

### Manual snapshots were planned but never executed

During the first rebuild, the plan was to take manual snapshots at each stage. The operator documented the commands but did not execute them between stages. This is a predictable human failure that automation eliminates.

## Why Not Snapshot After Every Run

Snapshots are not free — each takes a few minutes to create and consumes storage (~$0.10/GB/month). With 8 runs per hour during backfill, automated per-run snapshots would create hundreds of snapshots. The two stage gates capture the only states that matter for rollback.

## Why Not Use S3 Replay Instead of Snapshots

S3 replay is a valid third recovery path, but it requires re-running the full transform and upsert pipeline against every raw payload. For 200K+ reviews, that takes hours. Restoring an Aurora snapshot takes minutes. The snapshots are an optimization for recovery speed, not a replacement for the S3 immutable layer.

## Multi-Stream Constraint

Aurora snapshots capture the entire cluster — all schemas, all streams. When multiple streams are live, restoring a snapshot to roll back one stream also rolls back every other stream to that point in time.

The operational rule: **only one stream may be in backfill at a time.** Other streams must be in incremental (steady-state) mode during a backfill. If a snapshot restore is needed to roll back the backfilling stream, the incremental streams self-heal on their next EventBridge tick — they read their cursor from `control.stream_cursors` (which was also rolled back) and re-fetch from the vendor API from that earlier cursor position. No data is lost; the incremental streams simply re-process a short window of data they had already ingested.

This works because:
- Incremental streams are idempotent (upsert-on-newer)
- Cursors track the last successful position, and re-fetching from an earlier position produces the same result
- The vendor API is the authority for incremental data, not the database

This rule does NOT apply after all streams are in steady state. Once all backfills are complete and the stage gate snapshots exist, Aurora's continuous point-in-time restore is sufficient — the restore window is short enough that all streams can self-heal from a few hours of rollback.

### Impact on generalized published tables

A snapshot restore also rolls back the generalized publication tables (`reviews.generalized_reviews_current`, identity links, exceptions, audit). Downstream consumers of the generalized layer see stale data until the publication pass re-runs.

The publication pass triggers automatically via last-writer-wins: once the source streams self-heal and both cursors show success, the next stream_runner invocation fires the publication pass. The generalized layer rebuilds from current source state within one EventBridge cycle (15 minutes worst case).

This inconsistency window is acceptable while no live downstream consumer depends on the generalized layer. When Customer 360 ships and requires higher availability, the published tables should move to a separate Aurora cluster so that source rollbacks do not touch the published layer. That is the upgrade path — not the current architecture.

### Rollback awareness cascade

A snapshot restore rolls back three layers of timestamps simultaneously, creating a built-in awareness signal that requires no additional code:

1. **Freshness timestamps roll back.** `last_run_at` in `control.stream_cursors` and `ingested_at` on every row revert to the snapshot point. Any downstream consumer checking data freshness sees older dates immediately and knows the data is stale before querying content.

2. **CloudWatch freshness alarms fire.** If the rolled-back `last_run_at` exceeds the configured freshness SLA (e.g., 30 minutes for reviews), the alarm triggers and the operator is notified via SNS. This happens automatically — no manual check needed.

3. **Publication pass rebuilds.** The source streams self-heal within one EventBridge cycle, which updates the cursors and triggers the publication pass. The generalized layer rebuilds from current source state.

The net effect: every layer of the system — downstream consumers, operator alerts, and the publication layer — is informed of the rollback through existing mechanisms. No rollback notification system needs to be built. The timestamps ARE the notification.

## Assumptions

- The Aurora cluster identifier (`data-streams-prod`) is stable and matches what the handler hardcodes. If the cluster is renamed or replaced, the snapshot call will fail (non-fatally).
- The snapshot naming convention (`yotpo-backfill-complete-*`, `yotpo-seed-complete-*`) does not collide across rebuilds because the run_id suffix is unique.
- The IAM permission is scoped to the specific cluster ARN. If the Terraform is reapplied with a different cluster, the permission updates automatically.

## Tribal Context

- The idea for automated snapshots came from observing that the rebuild procedure (ADR-043) has three phases, and the operator asked "should we snapshot at different stages?" The follow-up insight was that the operator would not reliably be present when the backfill completes after 8-12 hours, so the snapshot must be automated.
- The detection logic reuses the client's existing mode-switching mechanism. No new state tracking was added — the cursor format itself encodes the backfill state.
- The stage gate concept generalizes to any future stream rebuild. The two gates (vendor API complete, legacy seed complete) apply regardless of the vendor or legacy source. Only the detection logic (how "backfill complete" is detected) varies per stream.

## Freshness Marker

- **Captured:** 2026-04-09
- **Stale when:** Aurora adds native stage-gated snapshots tied to application events, the platform moves to a different database engine, or the rebuild procedure (ADR-043) changes to have different phase boundaries.
