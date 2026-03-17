# ADR-007: DynamoDB Single-Table Design

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

DynamoDB serves as the operational control plane. We store run records, cursors, idempotency keys, webhook delivery logs, freshness status, and replay requests. Should these be separate tables or a single table?

## Decision

**One DynamoDB table, single-table design.**

**Table:** `data-streams-control-{env}`
**Billing:** On-demand (pay per request)
**PK:** `PK` (string)
**SK:** `SK` (string)
**GSI1:** `GSI1PK` / `GSI1SK` (for reverse access patterns)

### Entity model:

| Entity | PK | SK | TTL | Purpose |
|--------|----|----|-----|---------|
| Run | `STREAM#{source}#{stream}#{store_id}` | `RUN#{run_id}` | No | Track each polling/replay run |
| Cursor | `STREAM#{source}#{stream}#{store_id}` | `CURSOR#current` | No | Where the last successful run stopped |
| Idempotency | `IDEM#{source}#{stream}` | `{idempotency_key_hash}` | 30 days | Prevent duplicate processing |
| Webhook | `WEBHOOK#{source}#{store_id}` | `{webhook_id}` | 7 days | Track webhook deliveries |
| Freshness | `STREAM#{source}#{stream}#{store_id}` | `FRESHNESS#current` | No | Last record timestamp, lag |
| Replay | `REPLAY#{replay_id}` | `META` | No | Replay request tracking |

### Why single table

- One set of capacity settings to manage
- One backup configuration
- One set of CloudWatch metrics to monitor
- One Terraform resource block
- Access patterns are well-known and don't require complex queries
- On-demand billing means no capacity planning

### TTL strategy is critical

- **Idempotency keys:** 30-day TTL. After 30 days, if the same record comes through again, it gets reprocessed — which is fine because the Postgres upsert is idempotent.
- **Webhook delivery logs:** 7-day TTL. Used for deduplication of webhook retries. After 7 days, Shopify has stopped retrying.
- **Run records:** No TTL. These are the audit trail. Cheap to store.
- **Cursors and freshness:** No TTL. Always need current state.

## Alternatives Rejected

### Multiple DynamoDB tables (one per entity type)
Rejected. Creates N tables × (capacity config + backup config + monitoring + Terraform). At our scale (thousands of items, not millions), the operational overhead of multiple tables far exceeds any performance benefit.

### Single table with GSI per access pattern
Partially accepted. We have one GSI (GSI1) for reverse lookups. We do NOT create additional GSIs until a concrete access pattern requires one. GSIs cost money and complicate capacity management.

### DynamoDB with provisioned capacity
Rejected. On-demand is more expensive per-request but eliminates capacity planning entirely. At our volume (low thousands of requests per hour), the cost difference is negligible. The reduced operational burden is worth it.

## When to add a second table

Add a separate DynamoDB table **only if**:
- A new entity has fundamentally different capacity needs (e.g., millions of writes/second for a real-time event log)
- GSI limits are hit (max 20 GSIs per table)
- Access patterns require DynamoDB Streams on a subset of entities (Streams are table-level)

None of these are expected in Phase 1 or 2.

## Consequences

- All DynamoDB access goes through a shared `dynamo_control.py` module that understands the key patterns.
- Adding a new entity type means adding a new key pattern to the module, not a new table.
- Queries are always by PK + SK prefix. No scans. No complex filters.
- TTL cleanup happens automatically — no cron jobs for table hygiene.
