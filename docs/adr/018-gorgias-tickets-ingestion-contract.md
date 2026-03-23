# ADR-018: Gorgias Tickets Ingestion Contract

**Status:** Accepted
**Date:** 2026-03-23

---

## Context

We want the first live non-Shopify stream to be Gorgias tickets, using the Gorgias `GET /api/tickets` family of endpoints to mirror ticket history into the platform.

This decision matters because Gorgias is a **new provider**, not just a new stream. Per ADR-004:

- pollers are provider-specific
- processor and finalizer remain generic
- new streams for an existing provider are config-first
- new providers require new poller logic for auth, pagination, and rate limiting

We also have a practical constraint: the historical backfill is large (500k+ tickets), and we do not want to depend on slow or unreliable vendor support to clarify undocumented behavior. The ingestion contract needs to be safe enough to validate empirically with small read-only probes before we run a long backfill.

## Decision

The first Gorgias stream will be:

- **source:** `gorgias`
- **stream:** `tickets`
- **mode:** polling only for v1
- **scope:** tickets only, not ticket messages or conversations
- **storage pattern:** raw pages in S3, current-state tickets in Postgres, append-only history in Postgres

The polling contract is:

1. Use **Gorgias cursor pagination** only as an in-run page traversal mechanism.
2. Use **`updated_datetime`** as the durable cross-run checkpoint stored in DynamoDB.
3. Use **`GET /api/tickets` with `order_by=updated_datetime:asc`** as the primary v1 listing strategy.
4. Perform the initial historical sync as a **controlled low-rate backfill**, not a wide-open crawl.
5. Keep **view-backed listing** as a fallback only if larger live runs reveal instability or vendor behavior changes.

## Why This Decision

### 1. Gorgias cursors are not durable checkpoints

Official Gorgias docs describe cursor-based pagination for list endpoints. Cursors are opaque position tokens and should be treated as transient pagination state, not durable checkpoint state.

This matches our platform architecture:

- provider pagination token = short-lived, in-run state
- DynamoDB checkpoint = durable business cursor between runs

### 2. `updated_datetime` is the correct durable business cursor

The documented ticket object includes `updated_datetime`. That is the most natural field for:

- incremental polling
- safe stop conditions during rescans
- idempotency versioning
- Postgres upsert conflict resolution

Recommended idempotency key:

- `ticket_id`
- `updated_datetime`

### 3. Live tenant probes confirmed direct ordered `/tickets` is viable

Small read-only probes against the target tenant showed:

- baseline `/api/tickets` paging works
- `order_by=updated_datetime:asc` is accepted
- `order_by=updated_datetime:desc` is accepted
- `updated_datetime:asc` and `updated_datetime:desc` both produced monotonic page traversal in the sample
- no duplicate ticket IDs appeared across the sampled pages

That is enough to adopt direct ordered `/tickets` as the primary v1 ingestion contract.

### 4. Views remain a fallback, not the default

The public Gorgias docs clearly expose:

- ticket listing
- cursor pagination
- view objects with `filters`, `filters_ast`, `order_by`, and `order_dir`
- view item listing endpoints

The docs still do **not** clearly establish a direct `GET /api/tickets?updated_since=...` contract, so we should not assume timestamp filtering exists. But that is now less important, because the live tenant has already shown that ordered `/tickets` pagination is stable enough to use for v1.

### 5. A low-rate empirical probe is safer than waiting for support

Given the size of the historical import and the quality/timeliness risk of vendor support, the correct approach is:

- validate behavior on the real tenant with tiny read-only probes
- confirm ordering and duplicate behavior
- honor 429s and rate-limit headers
- only then scale the backfill

This is faster than support and safer than building blind.

## Recommended v1 Ingestion Shape

### Polling mode

Use Step Functions for Gorgias polling, consistent with ADR-005.

### Data flow

`Gorgias API -> S3 raw -> generic processor -> Postgres current + history`

### Provider-specific code

Add Gorgias-specific polling code for:

- Basic auth with email + API key
- ticket page fetch from `/api/tickets`
- cursor extraction
- rate-limit handling
- response/header interpretation

Reuse generic code for:

- raw S3 writes
- run/cursor/idempotency state in DynamoDB
- schema validation and transforms
- Postgres upsert/history writes
- finalization and freshness metrics

### Backfill behavior

Initial backfill should be:

- single-threaded
- request-capped
- delay between requests
- 429-aware with backoff
- resumable from durable checkpoint

Do not use parallel walkers or speculative brute-force rescans until the live tenant behavior is understood.

## Alternatives Rejected

### Build around undocumented `/tickets` timestamp filters

Rejected. This may exist, but the public docs do not clearly support it. Building around undocumented parameters would create a fragile ingestion path.

### Make views the default ingestion path

Rejected for v1. Views are still useful as a fallback, but direct ordered `/tickets` has now been validated on the real tenant and is simpler.

### Depend on support before coding anything

Rejected. Support latency and reliability are too uncertain for a time-sensitive build. Small empirical probes are a better first move.

### Use Gorgias cursors as the stored checkpoint

Rejected. Cursors are opaque pagination tokens, not business checkpoints. They are not a stable basis for long-lived resume semantics.

### Ingest ticket messages/conversations in the first pass

Rejected. That expands scope materially and is not required to prove the provider integration or historical ticket mirror.

### Parallelize historical backfill immediately

Rejected. With 500k+ tickets, aggressive parallelism risks unnecessary load and harder debugging before we understand tenant-specific behavior.

## Consequences

- We need a new **Gorgias poller** because this is a new provider.
- The first implementation should be **polling-only**, not webhook-enabled.
- Historical sync will use direct `/api/tickets` ordered by `updated_datetime:asc`.
- We do not need direct timestamp filter support to make the backfill work.
- If larger live runs reveal instability, we will fall back to:
  - a saved view plus paginated item listing, or
  - bounded rescans ordered by `updated_datetime`
- The backfill should be validated first with controlled probe scripts against the real tenant.

## Follow-Up Work

1. Run the probe scripts against the target tenant:
   - `scripts/gorgias_probe.py`
   - `scripts/gorgias_probe_matrix.py`
2. Run a longer soak probe using `order_by=updated_datetime:asc` to confirm behavior over a larger sample.
3. Add `streams/gorgias-tickets.yaml`.
4. Implement the Gorgias poller client and Lambda path.
5. Add raw models, canonical models, transforms, schema registry entry, and Postgres migrations.
6. Keep the view-backed fallback design documented but unimplemented unless needed.

## Sources

- Gorgias Authentication: https://developers.gorgias.com/reference/authentication
- Gorgias List tickets: https://developers.gorgias.com/reference/list-tickets
- Gorgias Ticket object: https://developers.gorgias.com/reference/the-ticket-object
- Gorgias Pagination: https://developers.gorgias.com/reference/pagination
- Gorgias View object: https://developers.gorgias.com/v1.1/reference/the-view-object
- Gorgias List view's items: https://developers.gorgias.com/reference/list-view-items
- Gorgias Search for view's items: https://developers.gorgias.com/reference/update-view-items
- Gorgias Rate limits: https://developers.gorgias.com/v1.1/reference/limitations
- Live tenant probe result on 2026-03-23: `/api/tickets` accepted `order_by=updated_datetime:asc|desc` and produced monotonic pagination in sample runs
