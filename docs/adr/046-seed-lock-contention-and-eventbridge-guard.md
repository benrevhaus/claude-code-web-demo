# ADR-046: Seed Lock Contention and EventBridge Guard

**Status:** Accepted
**Date:** 2026-04-10

---

## Decision

The MySQL seed script automatically disables all EventBridge rules before processing and re-enables them on exit (including Ctrl+C and errors). This prevents Lambda invocations from creating database lock contention during seed operations.

## What Happened

The MySQL seed hung silently for over 2 hours during a gap-fill operation. The CLI showed no error, no timeout, no progress — it appeared frozen. The operator had no way to distinguish "working slowly" from "permanently stuck."

### Root Cause

A previous Lambda invocation (triggered by EventBridge) had started a transaction on `yotpo.reviews_raw_current` and entered an `idle in transaction` state — it completed its work but never committed or closed the connection. This held a row-level lock on the table.

When the seed attempted to INSERT into the same table, Postgres queued the INSERT behind the stale lock. The seed's connection showed `Lock / transactionid` in `pg_stat_activity` — waiting for the stale transaction to release.

Subsequent Lambda invocations (firing every 15 minutes) also queued behind the same lock, creating a cascade of blocked connections:

```
pid 59158: idle in transaction (2h37m) — stale Lambda, holding lock
pid 60134: Lock / transactionid (2h24m) — seed, waiting for 59158
pid 67799: Lock / transactionid (18m) — Lambda invocation, waiting
pid 68921: Lock / transactionid (23s) — another Lambda, waiting
```

### Why It Was Silent

- Postgres does not timeout on lock waits by default (`lock_timeout = 0`)
- Python's `psycopg2` does not timeout on individual statements by default
- The seed script had no mechanism to detect or report lock contention
- The Lambda that caused the stale transaction had already returned success to EventBridge — it appeared healthy in all monitoring

## Why the Lock Occurred

The stale `idle in transaction` state happens when a Lambda handler opens a transaction (by executing an INSERT), but the Lambda execution environment is frozen by AWS before the connection is committed or closed. On Lambda warm-start reuse, the previous connection may still be open with an uncommitted transaction.

This is a known Lambda + RDS interaction pattern. The Lambda runtime can be frozen between invocations, and psycopg2 connections held in module-level globals survive the freeze. If the previous invocation's last database operation was an INSERT without a commit (e.g., due to an exception path that skipped the commit), the connection remains `idle in transaction` until the next invocation reuses it or the connection times out.

## The Fix

### 1. EventBridge guard in seed script

The seed script now:
1. Lists all `data-streams-*` EventBridge rules
2. Disables all of them before processing
3. Re-enables all of them on exit via `trap cleanup EXIT`

This prevents new Lambda invocations from firing during the seed, eliminating the source of lock contention.

The `trap` handler fires on:
- Normal completion
- Ctrl+C (SIGINT)
- Errors (non-zero exit)
- Any other signal that terminates the script

### 2. Kill stale connections before seeding

When lock contention is detected, the operator kills stale connections:

```sql
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle in transaction'
  AND query_start < NOW() - INTERVAL '5 minutes';
```

This is a manual step, not automated, because killing connections is destructive and should be a conscious operator decision.

## Detection Playbook

When the seed appears stuck (no progress for more than 2 minutes):

### Step 1: Check for locks

```sql
SELECT pid, state, wait_event_type, wait_event,
       LEFT(query, 80) as query,
       NOW() - query_start as duration
FROM pg_stat_activity
WHERE state != 'idle' AND pid != pg_backend_pid()
ORDER BY query_start;
```

Look for:
- `idle in transaction` rows with long durations — these are the blockers
- `Lock / transactionid` rows — these are the blocked queries

### Step 2: Kill the blocker

```sql
SELECT pg_terminate_backend({blocker_pid});
```

### Step 3: Verify lock cleared

Re-run the Step 1 query. The blocked queries should either complete or disappear.

## Why Not Automate Lock Detection in the Seed

The seed could detect lock contention by setting `lock_timeout` on its Postgres connection:

```sql
SET lock_timeout = '30s';
```

This would cause the INSERT to fail after 30 seconds of waiting instead of hanging forever. The seed could then log the error and retry.

This was considered but not implemented because:
- The root cause (stale Lambda connections) is prevented by disabling EventBridge
- Adding lock_timeout adds error handling complexity to every database operation
- The operator needs to know about the contention to fix the underlying cause, not just retry around it

If lock contention recurs despite the EventBridge guard, `lock_timeout` should be added.

## Assumptions

- All EventBridge rules in the account with the `data-streams-` prefix belong to this platform
- Disabling EventBridge rules for 15-30 minutes during a seed is acceptable (no data is lost — streams resume on re-enable)
- The stale `idle in transaction` pattern is caused by Lambda execution freezing, not by application bugs
- The Postgres `idle_in_transaction_session_timeout` setting (Aurora default: 0, meaning disabled) could also prevent this — but changing Aurora parameters requires a cluster restart

## Tribal Context

- The seed hung for over 2 hours before the operator noticed. The script produced no output because the INSERT was blocked at the database level — Python never returned from the `cursor.execute()` call. No amount of progress logging in the application code can detect a database-level lock wait.
- The stale Lambda connection (pid 59158) had been `idle in transaction` for 2h37m. This means it was created by a Lambda invocation that ran ~2.5 hours before the seed started. The Lambda appeared to complete successfully — EventBridge showed no errors. The stale transaction was completely invisible to application-level monitoring.
- The EventBridge guard was added to the seed script specifically, not to the Lambda handler, because the contention only occurs when a local long-running process (seed) competes with frequent short-running Lambda invocations for the same table. During normal operations, Lambda invocations don't compete with each other because they're short-lived and commit quickly.

## Freshness Marker

- **Captured:** 2026-04-10
- **Stale when:** the platform adds RDS Proxy (which manages connection pooling and prevents stale transactions), Aurora enables `idle_in_transaction_session_timeout` by default, or the seed is moved from local execution to Lambda (where it would be subject to the same EventBridge schedule, not competing with it).
