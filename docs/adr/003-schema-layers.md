# ADR-003: Three-Layer Schema Model

**Status:** Accepted
**Date:** 2026-03-17

---

## Context

We ingest data from external vendors (Shopify today, others later). Vendor schemas are unstable, vendor-specific, and not designed for our business queries. We need a layered approach that decouples our internal models from vendor instability.

## Decision

Three schema layers:

### Layer 1: Raw Vendor Schema
- **What:** The exact JSON payload from the vendor API or webhook, unmodified.
- **Where:** S3 (stored as-is), Pydantic model in `schemas/raw/` (loose/permissive validation).
- **Versioning:** Implicit — the `api_version` in the stream spec determines what shape to expect.
- **Rule:** Never transform data before writing to S3. The raw layer IS the vendor's schema.

### Layer 2: Source Canonical Schema
- **What:** Our typed, validated representation of a vendor entity. Vendor-specific but under our control.
- **Where:** Pydantic model in `schemas/canonical/` (strict validation). Postgres tables under `shopify.*` schema.
- **Versioning:** Explicit — e.g., `shopify.order.v3`. Version in the schema module name and in the stream spec.
- **Example:** `shopify.order.v3` contains all order fields we care about, typed correctly, with nullability rules we define.
- **Rule:** Source canonical models can only reference fields that exist in the raw vendor schema. They don't invent new fields.

### Layer 3: Provider-Agnostic Normalized Schema
- **What:** Business entities that abstract away the vendor. E.g., `commerce_order` that could be populated from Shopify, WooCommerce, or any other commerce platform.
- **Where:** Pydantic model in `schemas/normalized/` (future). Postgres tables under `normalized.*` schema (future).
- **Versioning:** Independent of source versions.
- **Rule:** This layer is the boundary that prevents vendor lock-in. All downstream consumers should eventually query normalized entities, not source-specific ones.

## V1 Scope (Critical)

**V1 builds Layer 1 and Layer 2 only.** Layer 3 (normalization) is designed but not built.

See [ADR-013](013-normalization-deferred.md) for the full rationale on deferring normalization.

### V1 data flow:
```
Shopify API → S3 (Layer 1: raw) → Processor → Postgres (Layer 2: shopify.orders)
```

### Future data flow:
```
Shopify API → S3 (Layer 1) → Processor → Postgres (Layer 2: shopify.orders)
                                       → Postgres (Layer 3: normalized.commerce_orders)
```

## Schema Evolution Strategy

When a vendor changes their API or we need to capture new fields:

1. Create a new Pydantic model version (e.g., `shopify.order.v4`).
2. Update the stream spec to reference the new version.
3. The processor uses the `schema_version` from the stream spec to select the correct model.
4. Old records in Postgres carry their `schema_version` — we can query which records are on which version.
5. If needed, replay old S3 data through the new schema version.

## Alternatives Rejected

### Two layers (raw + normalized, skip source canonical)
Rejected. Without a source canonical layer, the normalization mapping must understand raw vendor quirks directly. This creates fragile mappings that break when vendors change their schema. The source canonical layer absorbs vendor instability.

### Schema registry service (Confluent, AWS Glue)
Rejected for V1. Pydantic models in git ARE the schema registry — versioned, reviewable, testable. A service adds operational overhead without proportional value at our scale. Revisit only if we have 20+ schemas and need runtime schema discovery.

### JSON Schema instead of Pydantic
Rejected. Pydantic gives us runtime validation, IDE support, serialization, and documentation in one tool. JSON Schema would require separate validation logic and doesn't integrate as cleanly with Python.

## Consequences

- Every stream must have both a raw and canonical Pydantic model.
- Schema version is tracked on every Postgres record.
- Changing a schema requires a new version, not an in-place mutation.
- The normalization layer is a known gap until Phase 2 — downstream consumers query `shopify.orders` directly in V1.
