# ADR-013: Normalization Layer Deferred to Phase 2

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

The architecture defines three schema layers: raw vendor, source canonical, and provider-agnostic normalized. The normalization layer is what prevents vendor lock-in (e.g., Shopify orders and WooCommerce orders both map to `commerce_order`). Should we build it in V1?

## Decision

**Design the normalization layer now. Build it in Phase 2.**

### What "design now" means

- Define the target normalized entity names (e.g., `commerce_order`, `commerce_customer`, `commerce_product`)
- Document which source canonical fields will map to which normalized fields
- Structure the Postgres schema so the `normalized.*` schema can be added alongside `shopify.*` without restructuring

### What "build in Phase 2" means

- No `schemas/normalized/` Pydantic models in V1
- No `normalized.*` Postgres tables in V1
- No mapping code from source canonical → normalized in V1
- Downstream consumers query `shopify.orders` directly in V1

### Why defer

1. **No second provider yet.** Normalization is only meaningful when you have 2+ providers mapping to the same entity. Building it for one provider is speculative abstraction.

2. **Mapping decisions need real data.** The correct normalization mapping for "order status" or "fulfillment state" depends on understanding how both Shopify AND the second provider represent these concepts. Guessing now leads to a bad abstraction that's expensive to fix.

3. **V1 priority is proving the pipeline.** The most important thing is: raw data flows from Shopify → S3 → Postgres reliably, observably, and replayably. Normalization doesn't help with that.

4. **Easy to add later.** The processor is the only code that writes to Postgres. Adding a normalization step means: add a new Pydantic model, add a new Postgres table, add a mapping function in the processor. The processor's contract doesn't change.

### Risk of deferral

If downstream consumers build reports or dashboards on `shopify.orders` during V1, migrating them to `normalized.commerce_orders` in Phase 2 requires work. This is acceptable because:
- The number of downstream consumers in V1 will be small (just you)
- The migration is a known, planned task, not a surprise

## Alternatives Rejected

### Build normalization in V1 with Shopify-only mappings
Rejected. A normalization layer with one provider is just an unnecessary indirection layer. It doesn't prove provider-independence because there's no second provider to test against.

### Skip normalization entirely
Rejected. Normalization is core to the platform's value proposition (provider independence). It must be built — just not first.

## Consequences

- V1 Postgres tables are under `shopify.*` schema, vendor-specific.
- Phase 2 adds `normalized.*` schema alongside (not replacing) vendor-specific tables.
- Downstream consumers in V1 must accept that table names/shapes will change when normalization is added.
- The Phase 2 trigger is: "we are adding a second provider" or "we have a concrete business need for cross-provider queries."
