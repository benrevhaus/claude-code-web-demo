# Gorgias Tickets Phase 1.5

Date: 2026-03-23
Branch: `gorgias-get`
Scope: resolve the incremental polling contract for Gorgias tickets from official documentation

## Outcome

Phase 1.5 started as a docs-only resolution step, but live tenant probing changed the outcome.

The primary v1 polling contract for Gorgias tickets is now:

1. call `GET /api/tickets`
2. set `order_by=updated_datetime:asc`
3. treat API cursors as in-run pagination only
4. use `updated_datetime` as the durable cross-run checkpoint in our platform
5. keep view-backed listing as fallback only if larger live runs reveal instability

The earlier docs-only fallback remains true in a narrower sense: if direct `/tickets` behavior proves unstable at scale, views are still the strongest documented backup plan.

## What Changed After Live Probing

The target tenant accepted these `order_by` values on `/api/tickets`:

- `updated_datetime:asc`
- `updated_datetime:desc`
- `created_datetime:asc`
- `created_datetime:desc`

And the sampled results showed:

- baseline `/tickets` paging worked
- `updated_datetime:asc` was monotonic across sampled pages
- `updated_datetime:desc` was also monotonic across sampled pages
- zero duplicate ticket IDs across sampled pages

That is enough to prefer direct ordered `/tickets` for v1.

## Docs-Only Fallback Outcome

Before the live probe, the safest documented polling contract for Gorgias tickets was:

1. use Gorgias views to define the ticket set and sort order
2. read tickets through `GET /api/views/{view_id}/items` or `PUT /api/views/{view_id}/items`
3. treat API cursors as in-run pagination only
4. use `updated_datetime` as the durable cross-run checkpoint in our platform
5. if we need strict incremental filtering, create or manage a dedicated view whose filter logic is based on ticket timestamps

I still do not see enough in the public docs to claim that plain `GET /api/tickets` supports direct server-side filtering on `updated_datetime`, but that is no longer required for the v1 plan.

## What The Docs Actually Support

### Ticket listing

Official docs show:

- `GET https://{domain}.gorgias.com/api/tickets`
- description: "List tickets, paginated and ordered by the attribute of the given view."

That wording is important. It implies the list endpoint is tied to a view-defined ordering model rather than a generic free-form filter contract.

### Cursor pagination

The official pagination reference documents:

- `cursor`
- `limit`
- `order_by`
- `meta.prev_cursor`
- `meta.next_cursor`

The cursor is opaque and only indicates position in a list. It is not suitable as our durable DynamoDB checkpoint.

### Views are the documented filter mechanism

The official view object documents:

- `filters`: logic used to filter items shown in the view
- `filters_ast`: AST form of that logic
- `order_by`
- `order_dir`
- `type`

The example view object explicitly shows:

- `order_by: "updated_datetime"`
- `order_dir: "desc"`
- filter logic expressed against `ticket.*` fields

That is the strongest official evidence for how Gorgias expects ticket filtering and ordering to be modeled.

### View item endpoints

Official docs show both:

- `GET /api/views/{view_id}/items`
- `PUT /api/views/{view_id}/items`

Both are described as listing view items, paginated and ordered by the attribute specified in the view.

Inference from the docs:

- `GET /api/views/{view_id}/items` is the stable documented way to enumerate the tickets in a saved view.
- `PUT /api/views/{view_id}/items` is the documented "search for view's items" variant and is the best candidate if we need to pass a richer search body.

### Search endpoint

Official docs also expose:

- `POST /api/search`

But the public reference snippets I found do not expose enough body schema detail to safely design the platform around it yet. So it remains secondary to the documented view model.

## Docs-Only Decision

Before the probe result, phase 2 would have assumed:

- durable stream checkpoint = max observed `updated_datetime`
- in-run page traversal = Gorgias `cursor`
- primary listing strategy = view-backed ticket listing, not raw `/tickets` polling with assumed timestamp filters

After the probe result, that is now fallback guidance only.

## Recommended v1 Design

### Recommended stream semantics

Use a single dedicated Gorgias view for ingestion, with:

- `type: ticket-list`
- `order_by: updated_datetime`
- `order_dir: asc` if supported for forward checkpoint walking, otherwise `desc` with bounded rescan logic
- filters excluding obvious non-business tickets only if that is intentional

If the view language supports timestamp comparisons cleanly, use a moving window filter pattern. If not, use a stable broad view and implement checkpoint cutoff logic inside the poller.

### Recommended polling algorithm

1. Load the durable checkpoint timestamp from DynamoDB.
2. Call the Gorgias view items endpoint.
3. Page using `meta.next_cursor` within the run.
4. Process tickets in sorted order.
5. Stop once tickets are older than the current checkpoint if the sort order makes that safe.
6. Advance the durable checkpoint to the max `updated_datetime` successfully observed and finalized.

### Why this is safer than relying on `/tickets`

- It uses the filtering and ordering mechanism the docs actually describe.
- It avoids inventing undocumented query parameters.
- It fits the repo's architecture, which already separates durable checkpoint state from provider pagination state.

## Remaining Unknowns

These still need either live API validation or deeper docs before implementation is locked:

- Whether `GET /api/tickets` accepts any documented timestamp filter params directly.
- Whether views can be created and updated programmatically in a way that is stable enough for stream management.
- Whether `order_dir: asc` is accepted on ticket views in a way that makes checkpoint walking straightforward.
- Whether the `PUT /api/views/{view_id}/items` body can inject ad hoc filters without mutating the saved view.

## Implementation Consequence

Phase 2 should not start by building a `GET /tickets?updated_since=...` client. That would still be an undocumented assumption.

Instead, phase 2 should start with one of these explicitly:

1. a direct `/api/tickets` poller client using `order_by=updated_datetime:asc`
2. a larger live soak test to validate the same behavior over a wider sample

Keep a view-backed poller design as fallback only if the larger soak test reveals instability.

## Sources

- Gorgias List tickets: https://developers.gorgias.com/reference/list-tickets
- Gorgias Pagination: https://developers.gorgias.com/v1.1/reference/pagination
- Gorgias View object: https://developers.gorgias.com/v1.1/reference/the-view-object
- Gorgias List view's items: https://developers.gorgias.com/reference/list-view-items
- Gorgias Search for view's items: https://developers.gorgias.com/reference/update-view-items
- Gorgias Search for resources: https://developers.gorgias.com/reference/search-1
- Live tenant probe result on 2026-03-23: `/api/tickets` accepted `order_by=updated_datetime:asc|desc` and both were monotonic across sample pages with zero duplicates
