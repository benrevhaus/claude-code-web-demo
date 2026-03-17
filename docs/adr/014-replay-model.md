# ADR-014: Replay From S3, Never Re-Call Vendor APIs

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

When processing fails, schema changes, or we need to reprocess historical data, how do we replay?

## Decision

**Replay always re-reads from S3. We never re-call vendor APIs for replay.**

### Replay flow

```
1. Replay request recorded in DynamoDB (who, why, which S3 keys)
2. Replay Step Function starts (Phase 2) or manual invocation (V1)
3. For each S3 key:
   a. Read raw payload from S3
   b. Run through processor (validate, transform, upsert)
   c. Idempotency check ensures no duplicates
   d. Record result in replay audit log
4. Replay marked complete in DynamoDB
```

### Why never re-call vendor APIs

1. **Immutability.** The raw payload in S3 represents what the vendor returned at that point in time. Re-calling the API returns the current state, which may be different. For historical accuracy, we need the original payload.

2. **Rate limits.** Re-calling vendor APIs for replay consumes rate limit budget that should be used for incremental sync. A schema migration that requires reprocessing 100K orders should not hammer Shopify's API.

3. **Vendor instability.** The vendor API might be down, rate-limited, or returning errors — exactly the situation that often triggers a need for replay.

4. **Cost.** S3 reads are essentially free. API calls are rate-limited and can trigger additional costs.

5. **Determinism.** The processor should produce the same output from the same input. Re-calling the API introduces a variable (current state) that makes debugging harder.

### V1 replay (manual)

In V1, replay is manual:
1. Identify the S3 key(s) to reprocess
2. Invoke the processor Lambda directly with the S3 key
3. Verify output in Postgres

This is sufficient for V1 because:
- Replay frequency will be low (schema changes, occasional bugs)
- The processor is already idempotent
- Automation (replay Step Function) comes in Phase 2

### Phase 2 replay (automated)

Phase 2 adds:
- A `replay_requests` entity in DynamoDB
- A replay Step Function that iterates S3 keys and invokes the processor
- An audit trail of what was replayed, when, and by whom
- Support for replaying by time range, run_id, or explicit S3 key list

## Alternatives Rejected

### Re-call vendor APIs for replay
Rejected. See reasons above. Fundamental violation of the immutable-raw-first principle.

### Replay by re-running the Step Function with an old cursor
Rejected. This re-calls the vendor API (same problem). It also fetches current data, not historical data. And if records were deleted at the vendor, they'd disappear from our system too.

### Event sourcing with full replay from event log
Rejected for V1. Event sourcing is the "correct" version of this pattern but requires significant infrastructure (event store, projection engine, snapshot management). Our S3-based replay gets 80% of the benefit at 20% of the complexity.

## Consequences

- Every S3 raw payload must be self-contained (include all context needed for processing).
- The processor must be stateless and deterministic: same S3 input → same Postgres output.
- S3 lifecycle policies must retain raw data long enough for replay needs (90+ days in standard tier, then Glacier).
- The `raw_s3_key` column in every Postgres table is the replay link — it tells you exactly which payload produced each row.
