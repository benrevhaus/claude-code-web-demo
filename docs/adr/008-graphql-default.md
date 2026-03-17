# ADR-008: GraphQL as Default Shopify API

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

Shopify offers both REST and GraphQL Admin APIs. Which should be the default for polling?

## Decision

**GraphQL is the default for all Shopify polling streams.**

### Why GraphQL

1. **Shopify's strategic direction.** Shopify is actively deprecating REST endpoints and investing in GraphQL. Building on REST means building on a shrinking surface.

2. **Cursor-based pagination.** GraphQL provides stable cursor-based pagination natively. REST uses page-number pagination, which is fragile under concurrent writes (records shift between pages, causing duplicates or misses).

3. **Field selection.** GraphQL lets us request exactly the fields we need, reducing payload size and S3 storage costs. REST returns the full object regardless.

4. **Rate limiting model.** Shopify's GraphQL API uses a cost-based rate limit (bucket of points) which is more predictable than REST's request-count-based limit.

5. **Nested resources.** GraphQL can fetch an order with its line items, fulfillments, and transactions in one request. REST requires separate calls for nested resources.

### When to use REST instead

- The specific endpoint doesn't exist in GraphQL yet (rare but possible for newer features)
- Webhook payloads reference REST-style IDs that need REST-based lookups (unlikely)

If REST is needed, set `mode: rest` in the stream spec. The shopify-poller handles both modes.

## Alternatives Rejected

### REST as default
Rejected. Building on a deprecated foundation. Page-number pagination is fundamentally less reliable for incremental sync. Would require more complex deduplication logic.

### REST for V1 "because it's simpler"
Rejected. The complexity difference between REST and GraphQL in the poller is minimal — both are HTTP calls with pagination. GraphQL's cursor-based pagination is actually simpler to implement correctly for incremental sync.

### Bulk API for large pulls
Not rejected, but deferred. Shopify's Bulk API (GraphQL-based) is better for full backfills of large datasets. For V1, standard paginated GraphQL is sufficient. Consider Bulk API for Phase 2 backfill optimization if page counts are excessive.

## Consequences

- The shopify-poller Lambda must handle GraphQL query construction and cursor extraction.
- Stream specs include GraphQL query fragments or the poller has built-in query templates per entity.
- Decision: Built-in query templates in the poller, selected by `stream` field in config. This avoids putting raw GraphQL in YAML files.
- Rate limit handling uses the `X-Shopify-Shop-Api-Call-Limit` cost model, not simple request counting.
