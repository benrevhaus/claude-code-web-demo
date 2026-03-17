# Step Function Design

**Status:** Accepted
**Date:** 2026-03-17

---

## Overview

Two state machines serve the platform:
1. **Incremental Poll** — runs on schedule, fetches new/updated records
2. **Replay** — runs on demand, reprocesses from S3 (Phase 2)

Backfill is NOT a separate state machine. It reuses the poll state machine with a manually set start cursor.

---

## Incremental Poll State Machine

### Visual flow

```
                    ┌──────────────┐
                    │  Initialize  │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
              ┌─────│  FetchPage   │◄─────────┐
              │     └──────┬───────┘          │
              │            │                  │
              │     ┌──────▼───────┐          │
              │     │ ProcessPage  │          │
              │     └──────┬───────┘          │
              │            │                  │
              │     ┌──────▼───────┐          │
              │     │  CheckMore   │──yes──┐  │
              │     └──────┬───────┘       │  │
              │            │ no            │  │
              │            │        ┌──────▼──┴──┐
              │     ┌──────▼─────┐  │ThrottleWait│
              │     │  Finalize  │  └────────────┘
              │     └──────┬─────┘
              │            │
              │         (done)
              │
              │  ┌────────────────┐
              └──│HandleFetchError│──────┐
                 └────────────────┘      │
                                  ┌──────▼──────────┐
                                  │HandleProcessError│──→ CheckMore
                                  └─────────────────┘
```

### State definitions

#### Initialize
- **Type:** Task (Lambda or Pass with intrinsic functions)
- **Owns:**
  - Create run record in DynamoDB (status: "running")
  - Load stream config from input
  - Read last cursor from DynamoDB (`CURSOR#current`)
  - Set `page_number = 0`
- **Checkpoints:** `run_id`, `start_cursor`
- **Output:** `{ run_id, stream_config, store_id, cursor, page_number: 0, total_records: 0 }`

#### FetchPage
- **Type:** Task → shopify-poller Lambda
- **Owns:** Fetch one page from vendor API. Write raw to S3.
- **Input:** PollerInput (from state accumulator)
- **Output:** PollerOutput
- **Retry:** On 5xx errors — 3 attempts, exponential backoff (2s, 4s, 8s)
- **Catch:** On all errors → HandleFetchError
- **Checkpoints:** `s3_key`, `page_number`, `next_cursor` (via PollerOutput)

#### ProcessPage
- **Type:** Task → processor Lambda
- **Owns:** Read S3 payload, validate, transform, upsert Postgres
- **Input:** ProcessorInput (constructed from FetchPage output)
- **Output:** ProcessorOutput
- **Catch:** On all errors → HandleProcessError (log error, continue to CheckMore)

#### CheckMore
- **Type:** Choice
- **Logic:**
  - If `has_more == true` AND `page_number < max_pages_per_run` → ThrottleWait
  - Else → Finalize
- **Checkpoints:** None (pure decision)

#### ThrottleWait
- **Type:** Wait
- **Logic:**
  - If `rate_limit_reset_at` is set → wait until that timestamp (`TimestampEquals`)
  - Else → fixed wait of 1 second
- **Then:** FetchPage (with incremented `page_number` and updated `cursor`)

#### HandleFetchError
- **Type:** Pass (or Task for structured logging)
- **Owns:** Log the error. Set status to `partial_failure`.
- **Then:** Finalize

#### HandleProcessError
- **Type:** Pass (or Task for structured logging)
- **Owns:** Log the failed S3 key. Increment error counter. Do NOT abort the run.
- **Then:** CheckMore (continue fetching remaining pages)

#### Finalize
- **Type:** Task → run-finalizer Lambda
- **Owns:** Close run record. Update cursor. Compute freshness. Emit metrics.
- **Input:** FinalizerInput (aggregated from run state)
- **Output:** FinalizerOutput
- **This state always runs.** Even on partial failure.

### Execution timeout

- **Max execution time:** 30 minutes for incremental polls
- **Max execution time:** 4 hours for backfills (override via input)
- On timeout: Step Function fails → CloudWatch alarm fires → next run picks up from last checkpoint

### State accumulator pattern

Step Functions passes state between steps via the execution input/output. We use `ResultPath` and `OutputPath` to accumulate state:

```json
{
  "run_id": "abc-123",
  "stream_config": { ... },
  "store_id": "mystore",
  "cursor": "2024-03-15T00:00:00Z",
  "page_number": 3,
  "total_records": 150,
  "total_pages": 3,
  "status": "running",
  "last_fetch_result": { ... },
  "last_process_result": { ... }
}
```

---

## Replay State Machine (Phase 2)

### Visual flow

```
Initialize → ForEachKey (Map) → [ ProcessKey → RecordResult ] → Finalize
```

### State definitions

#### Initialize
- **Type:** Task
- **Owns:** Validate replay request. Record replay start in DynamoDB.

#### ForEachKey
- **Type:** Map (sequential, MaxConcurrency: 1)
- **Iterates:** Over `s3_keys` list from input
- **Why sequential:** Avoid hammering Postgres with parallel upserts

#### ProcessKey
- **Type:** Task → processor Lambda
- **Input:** ProcessorInput with `trigger="replay"`

#### RecordResult
- **Type:** Task or Pass
- **Owns:** Update replay record in DynamoDB with per-key results

#### Finalize
- **Type:** Task
- **Owns:** Mark replay complete. Log aggregate results.

### Why Map state (not a loop)

The Map state is purpose-built for iterating over a list. It handles:
- Per-item error isolation (one failed key doesn't abort others)
- Built-in item tracking in execution history
- No manual loop counter management

---

## Backfill Strategy

**Backfill reuses the incremental poll state machine.** No separate state machine.

To backfill:
1. Start the poll Step Function with override input:
   ```json
   {
     "cursor_override": "2020-01-01T00:00:00Z",
     "max_pages_override": 5000,
     "timeout_override": "PT4H"
   }
   ```
2. The Initialize state uses `cursor_override` instead of reading from DynamoDB.
3. The poll runs as normal, paginating through historical data.
4. On completion, the cursor checkpoint is updated to the last fetched record.

**When to consider a dedicated backfill mechanism (Phase 3+):**
- Backfills regularly exceed 5000 pages
- Shopify Bulk API would be significantly more efficient
- Multiple backfills need to run concurrently

---

## Where State Lives

| State | Stored in | Lifetime |
|-------|-----------|----------|
| Current page / cursor during run | Step Function execution context | Duration of execution |
| Cursor checkpoint (between runs) | DynamoDB `CURSOR#current` | Permanent |
| Run metadata | DynamoDB `RUN#{run_id}` | Permanent |
| Per-page raw data | S3 | Permanent (lifecycle to Glacier) |
| Step Function execution history | AWS-managed | 90 days (default) |

### Critical: Checkpoint timing

The cursor checkpoint is updated in **Finalize only**, not after every page. This means:
- If a run fails mid-way, the next run restarts from the last completed run's cursor.
- This may re-fetch some pages, but idempotency ensures no duplicates.
- This is simpler and safer than per-page checkpointing, which risks cursor gaps.
