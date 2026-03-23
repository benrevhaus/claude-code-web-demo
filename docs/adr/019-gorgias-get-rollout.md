# ADR-019: Gorgias GET Tickets Rollout

**Status:** Accepted
**Date:** 2026-03-23

---

## Context

We are adding the first live non-Shopify stream to the platform: Gorgias tickets.

ADR-018 established the external ingestion contract:

- source: `gorgias`
- stream: `tickets`
- polling only for v1
- `GET /api/tickets`
- `order_by=updated_datetime:asc` is viable for historical crawl
- `updated_datetime` is the durable checkpoint

This ADR records the implementation decisions made in the `gorgias-get` branch so it is clear how that contract is applied inside this repository.

## Decision

Gorgias tickets are implemented as a new polling stream that reuses the existing platform architecture:

- provider-specific poller/client
- generic processor
- generic finalizer
- raw pages in S3
- current-state + history in Postgres
- DynamoDB cursor/idempotency/freshness state

The rollout keeps Gorgias deliberately narrow:

- tickets only
- no ticket messages
- no webhooks
- one tenant/store identifier per deployed poller module

## What Was Added

### 1. Stream definition

Add:

- `streams/gorgias-tickets.yaml`

Key config choices:

- `mode: rest`
- `schema_version: gorgias.ticket.v1`
- `idempotency_key: [ticket_id, updated_datetime]`
- `cursor_field: updated_datetime`
- `page_size: 100`
- `max_pages_per_run: 500`
- `freshness_sla_minutes: 30`

### 2. Schema layer

Add:

- raw schema for Gorgias ticket pages and tickets
- canonical schema `gorgias.ticket.v1`
- deterministic raw -> canonical transform
- schema registry entry mapping `(gorgias, tickets)` to the new models

### 3. Provider client

Add:

- `src/shared/gorgias_client.py`

The client uses:

- Basic auth with email + API key
- `GET /api/tickets`
- Gorgias cursor pagination for in-run traversal only
- `updated_datetime:asc` for initial historical crawl
- `updated_datetime:desc` once a durable checkpoint exists
- rate-limit handling via `Retry-After` and `X-Gorgias-Account-Api-Call-Limit`

### 4. Processor/Postgres support

Extend the generic processor path so it can route to:

- `gorgias.tickets`
- `gorgias.tickets_history`

This required:

- schema registry metadata for provider-specific Postgres methods
- Postgres upsert/history methods for tickets
- migration `002_gorgias_tickets.sql`

### 5. Probe tooling

Add:

- `scripts/gorgias_probe.py`
- `scripts/gorgias_probe_matrix.py`

These scripts exist to validate live tenant behavior safely before large backfills.

### 6. Terraform wiring

Add Gorgias poller modules to:

- `infra/environments/dev/main.tf`
- `infra/environments/prod/main.tf`

Also update the stream-poller module so:

- per-stream `max_pages_default` is configurable
- Lambda function names include `source` + `stream` and do not collide when multiple polling streams are deployed

### 7. SSM parameters

Add placeholder parameters for:

- `/data-streams/{env}/gorgias/email`
- `/data-streams/{env}/gorgias/api_key`

## Runtime Strategy

### Historical backfill

Historical import uses the existing poll Step Function with no special backfill state machine.

For Gorgias:

1. Start with no durable checkpoint.
2. Poll `GET /api/tickets?order_by=updated_datetime:asc`.
3. Walk forward from oldest to newest.
4. Update the durable checkpoint only after finalization.

### Steady-state incremental sync

Once a checkpoint exists:

1. Poll `GET /api/tickets?order_by=updated_datetime:desc`.
2. Walk newest to oldest.
3. Stop once the page crosses the stored checkpoint.
4. Advance the durable checkpoint only when the run fully covers the delta window.

This is intentionally conservative: partial runs may re-read data, but they must not skip unseen updates.

## Important Safety Rule

For descending Gorgias runs, the durable checkpoint must **not** be advanced merely because a page contains newer records.

It may advance only when:

- the run reaches the previous checkpoint boundary, or
- the run exhausts available pages for the current delta

This prevents skipped history when a large incremental window is split across multiple runs due to `max_pages`.

## Alternatives Rejected

### Dedicated Gorgias-specific processor

Rejected. The generic processor remains sufficient once the schema registry and Postgres client are extended.

### Separate backfill state machine

Rejected. The existing poll state machine is adequate for v1. Backfill remains a run-shape choice, not a new orchestration system.

### Default to view-backed ingestion

Rejected for v1. Live tenant probes showed direct ordered `/api/tickets` is viable, so the simpler path is preferred.

### Advance checkpoint on every descending page

Rejected. That is unsafe for multi-run deltas and can permanently skip records.

## Consequences

- Gorgias is now a first-class source in the repository.
- The codebase remains aligned with the platform architecture:
  - provider-specific poller
  - generic processor/finalizer
  - config + schemas + migration for new stream support
- Terraform can deploy multiple poll streams in one environment without Lambda name collisions.
- Real deployment still requires setting the Gorgias SSM credentials and running Terraform from an environment with provider registry access.

## Verification

The branch was verified locally with:

```bash
.venv/bin/pytest tests/test_gorgias.py tests/test_stream_config.py tests/test_e2e_local.py tests/test_transforms.py tests/test_idempotency.py -q
```

Result at time of writing:

- `33 passed`

Live probe scripts also confirmed the target tenant accepted:

- `order_by=updated_datetime:asc`
- `order_by=updated_datetime:desc`

and that sampled pagination was monotonic with zero duplicates.

## Follow-Up Work

1. Run a longer live soak probe against the tenant before the full 500k+ backfill.
2. Run `terraform init/validate/plan` in a networked environment.
3. Apply migrations in dev.
4. Set real Gorgias SSM secrets.
5. Deploy to dev and execute a controlled initial crawl.
6. Observe CloudWatch metrics and Step Function behavior before scaling the backfill window.
