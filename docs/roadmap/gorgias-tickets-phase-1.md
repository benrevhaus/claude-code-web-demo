# Gorgias Tickets Phase 1

Date: 2026-03-23
Branch: `gorgias-get`
Scope: confirm the external API contract and map it to this repo's architecture before implementation

## Goal

Decide whether `GET /tickets` should be the first live Gorgias stream and lock the minimum contract needed for implementation.

## Decision

Yes. The first live Gorgias stream should be a polling-only `tickets` stream built around:

- raw page capture from `GET /api/tickets`
- generic processor reuse
- Postgres current-state table plus history table
- no webhook ingestion in v1
- no ticket messages/comments in v1

This is the smallest slice that proves a second provider without expanding the architecture unnecessarily.

## Confirmed From Official Gorgias Docs

### Base URL and endpoint

- Base API URL is tenant-scoped: `https://{domain}.gorgias.com/api/`
- Tickets listing endpoint is `GET https://{domain}.gorgias.com/api/tickets`

### Authentication

- Private apps use API keys.
- Requests can be made with HTTP Basic auth using `email` as username and `API key` as password.
- Public apps must use OAuth2, but that is out of scope for this repository's first-party sync use case.

### Pagination

- Gorgias documents cursor-based pagination for listing endpoints.
- Request parameters include `cursor`, `limit`, and optional `order_by`.
- Response pagination metadata includes `meta.prev_cursor` and `meta.next_cursor`.
- Cursors are explicitly described as opaque and short-lived, so they are not suitable as the durable checkpoint stored in DynamoDB across runs.

### Ticket identity and timestamps

The documented ticket object includes the fields needed for a history mirror:

- `id`
- `created_datetime`
- `updated_datetime`
- `closed_datetime`
- `opened_datetime`
- `last_message_datetime`
- `last_received_message_datetime`
- `status`
- `subject`
- `channel`
- `external_id`
- `spam`
- `via`
- `customer`
- `assignee_user`
- `tags`

### Rate limits

- Gorgias documents a leaky-bucket model of `2` calls per second per account with a burst of `40`.
- `429 Too Many Requests` is used for throttling.
- Response headers include:
  - `Retry-After`
  - `X-Gorgias-Account-Api-Call-Limit`

## Architecture Implications For This Repo

### Poller strategy

This repo's ADRs say pollers are provider-specific and processor/finalizer remain generic. That means Gorgias is not just "another stream"; it requires new source-specific polling code while reusing:

- `src/lambdas/processor/handler.py`
- `src/lambdas/finalizer/handler.py`
- `src/shared/dynamo_control.py`
- `src/shared/pg_client.py`
- `src/shared/s3_writer.py`

### Checkpoint strategy

The durable checkpoint should be a datetime field such as `updated_datetime`, not the API cursor. The API cursor should only be used within a single run to walk pages.

### Idempotency strategy

Recommended v1 idempotency key:

- `ticket_id`
- `updated_datetime`

That matches the existing architecture rule that idempotency should include both stable identity and a version/time dimension.

## Main Open Contract Risk

The public docs clearly document:

- `GET /api/tickets`
- cursor pagination
- `order_by`
- ticket timestamp fields

The public docs surfaced during phase 1 did not clearly document whether `GET /api/tickets` supports direct server-side timestamp filtering. That is still true.

However, live tenant probing on 2026-03-23 resolved the more important v1 question:

- `GET /api/tickets` accepts `order_by=updated_datetime:asc`
- pagination remained monotonic in the sample
- no duplicate ticket IDs appeared across the sampled pages

So v1 does not need direct timestamp filter support. We can backfill by paging `/api/tickets` in ascending `updated_datetime` order and using the max observed `updated_datetime` as the durable checkpoint.

## Recommended v1 Scope

- One Gorgias workspace
- Polling only
- Tickets only
- Current-state plus history in Postgres
- Manual backfill control
- No ticket messages
- No webhooks
- No provider-agnostic normalization layer

## Phase 2 Entry Criteria

Before full implementation begins, confirm one more thing with a longer live soak test:

- `GET /api/tickets?order_by=updated_datetime:asc` remains monotonic and duplicate-free over a larger sample window

The polling contract is now specific enough for phase 2 to start.

## Sources

- Gorgias Authentication: https://developers.gorgias.com/reference/authentication
- Gorgias Requests: https://developers.gorgias.com/v1.1/reference/requests
- Gorgias List tickets: https://developers.gorgias.com/reference/list-tickets
- Gorgias Pagination: https://developers.gorgias.com/reference/pagination
- Gorgias Ticket object: https://developers.gorgias.com/reference/the-ticket-object
- Gorgias Rate limits: https://developers.gorgias.com/v1.1/reference/limitations
- Gorgias changelog, cursor pagination rollout: https://developers.gorgias.com/changelog/deprecation-offset-based-pagination
- Live tenant probe result on 2026-03-23: `/api/tickets` accepted `order_by=updated_datetime:asc|desc`; `updated_datetime:asc` was monotonic across sample pages with zero duplicates
