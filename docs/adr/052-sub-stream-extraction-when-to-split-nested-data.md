# ADR-052: Sub-Stream Extraction — When to Split Nested Data Into Its Own Table

**Status:** Accepted
**Date:** 2026-04-10

---

## Decision

Nested data within a vendor payload (variants inside products, refunds inside orders, line items inside orders, images inside reviews) should remain as JSONB columns in the parent table unless a downstream consumer needs to query the nested data directly. Extraction into a dedicated table is a business decision triggered by a proven consumer need, not a preemptive data modeling choice.

## Intent

Every vendor payload contains nested structures. The instinct is to normalize them into relational tables immediately. This ADR documents when that instinct is correct and when it should be resisted, based on operational experience with the platform's first three vendors.

## The Rule

### Extract when:
- A downstream consumer needs to JOIN on the nested data (e.g., inventory_levels JOIN variants ON variant_id)
- A downstream consumer needs to filter or aggregate at the nested level (e.g., "all SKUs under $20")
- The nested data changes independently of the parent (e.g., a refund is created after the order is closed)
- History tracking at the nested level has independent business value (e.g., refund history separate from order history)

### Keep as JSONB when:
- No downstream consumer queries the nested data directly
- The nested data is always read alongside its parent (e.g., line items displayed with orders)
- The nested data doesn't change independently of the parent
- The nested structure is small and bounded (e.g., 5 images per review)

### The trigger is a consumer, not a schema preference

The decision to extract is not "is this data relational?" — it always is. The decision is "does a consumer exist today that needs it in a table?" If the answer is "maybe later," the answer is JSONB now.

## Current State: What's Extracted, What's Not

| Parent | Nested Data | Extracted? | Why |
|--------|------------|-----------|-----|
| shopify.orders | refunds | **Yes** | Changes independently (refund created after order), has own history value |
| shopify.orders | transactions | **Yes** | Changes independently, financial audit trail |
| shopify.orders | line_items | No (JSONB) | Always read with the order, no independent queries |
| shopify.products | variants | No (JSONB) | No consumer queries variants directly yet |
| shopify.products | images | No (JSONB) | Always read with the product |
| yotpo.reviews | images_data | No (JSONB) | Always read with the review |
| gorgias.tickets | customer | No (JSONB) | Always read with the ticket, PII concerns argue against wider exposure |

## Candidates for Future Extraction

### Shopify variants → `shopify.variants`

**Trigger:** a consumer needs SKU-level queries, price filtering, or clean joins to inventory_levels by variant_id.

**Implementation:** `SubStreamDef` in schema registry (same pattern as refunds/transactions), migration for `shopify.variants` + history, pg_client upsert/history methods. No new Lambda code — config-over-code pattern.

**Estimated effort:** 1 hour.

**Current alternative:** `jsonb_array_elements(variants)` in SQL queries — works but is slow at scale and can't be indexed.

### Shopify line items → `shopify.order_line_items`

**Trigger:** a consumer needs product-level sales analysis across orders (e.g., "how many units of SKU X sold last month").

**Current alternative:** JSONB queries against `shopify.orders.line_items` — functional but not performant for aggregation.

### Gorgias ticket messages → `gorgias.messages`

**Trigger:** a consumer needs to search message content across tickets, or analyze response times at the message level.

**Current alternative:** not available — messages aren't in the current Gorgias payload (would require fetching the messages endpoint separately).

## Why Not Extract Everything Preemptively

### 1. Each extraction adds maintenance surface

A new table means a new upsert method, a new history table, a new SubStreamDef, and new test coverage. For 6 nested structures across 3 vendors, preemptive extraction doubles the table count without a proven consumer.

### 2. JSONB is queryable when needed

PostgreSQL's JSONB operators (`->`, `->>`, `jsonb_array_elements`) handle ad-hoc queries against nested data. The performance is acceptable for exploratory analysis. Extraction is justified when the query pattern is repeated and needs indexing, not for one-off questions.

### 3. Extraction during backfill adds risk

Per ADR-051, adding capabilities during backfill increases debugging surface. Extraction should happen after the parent stream is stable and in incremental mode.

### 4. The config-over-code pattern makes extraction cheap when needed

Adding a sub-stream is a 1-hour config change (SubStreamDef + migration + pg_client methods). There's no cost to deferring — the extraction is always available when a consumer proves the need.

## Assumptions

- JSONB queries are acceptable for exploratory and low-frequency analysis
- The config-over-code pattern (SubStreamDef) continues to work for future extractions
- Downstream consumers will make their data needs explicit before extraction is built
- Extracted sub-streams follow the same upsert-on-newer, history tracking, and PII boundary rules as parent streams

## Freshness Marker

- **Captured:** 2026-04-10
- **Stale when:** a downstream consumer (Customer 360, analytics dashboard, storefront) proves a need for direct variant queries, line item aggregation, or message-level search — triggering the extraction for that specific nested structure.
