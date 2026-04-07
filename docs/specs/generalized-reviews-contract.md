# Generalized Reviews Contract

**Status:** Proposed
**Date:** 2026-04-07

---

## Purpose

Define the phase 1 provider-agnostic contract for published reviews in `data-streams`.

This contract is intended to:

- support downstream applications without binding them to a single review vendor
- provide one broad-access query surface for analysts
- separate review content from restricted identity/linkage data
- remain flexible enough for future sources including internal review systems

## Position In The Layering Model

This is a published generalized layer.

It sits below:

- raw source payloads
- source-canonical review tables

and above:

- Customer 360
- analyst queries
- internal review tooling
- downstream publication/projection surfaces

## Core Rules

1. Source-canonical stays source-shaped.
   Generalization happens after source joins and validation, not during raw ingestion.

2. Every published review row must have a valid subject contract.
   Null subject identity is not allowed in the published generalized table.

3. Broad-access review data must not expose sensitive identity joins.
   Restricted identity/linkage keys live in a companion table.

4. Query ergonomics matter.
   Frequently queried business fields are flattened into typed columns.

5. Long-tail variation stays flexible.
   Provider-specific extras and future associated entities remain in JSONB buckets.

## Required Published Tables

All generalized tables live in the `reviews` Postgres schema within the shared Aurora database. Source-canonical tables live in source-scoped schemas (e.g., `yotpo.*`).

### `reviews.generalized_reviews_current`

Broad-access current-state published review table.

### `reviews.generalized_review_identity_links`

Restricted companion table keyed by `canonical_record_id`.

Contains private linkage fields and current identity match state for all staged rows, including rows not currently published.

Access is controlled via the platform-wide `data_operator` Postgres role. The broad `data_reader` role cannot query this table.

### `reviews.generalized_review_publish_exceptions`

Current-state table for rows excluded from publication.

### `reviews.generalized_review_publish_audit`

Current-state audit table recording publication decision details, diagnostics, winning-source choices, and evaluation timestamps.

## Required Identity Fields

Every published row in `generalized_reviews_current` must include:

- `canonical_record_id`
- `source`
- `source_record_id`

Every published row must also include a valid subject contract:

- `subject_type`
- `subject_source`
- `subject_source_id`
- `subject_canonical_id`

These are mandatory. Rows missing any of them are excluded to publish exceptions.

## Namespaced Identity Standard

The generalized layer uses a namespaced identity model.

Example:

- `canonical_record_id = yotpo:982341771`
- `subject_canonical_id = shopify_product:35677700`

The same pattern is expected for future streams and internal tools.

## Top-Level Field Shape

The generalized current table should flatten high-value fields while retaining structured JSONB for flexible payloads.

### Required typed columns

- `canonical_record_id`
- `source`
- `source_record_id`
- `source_schema_version`
- `generalized_schema_version`
- `source_snapshot_set_id`
- `published_snapshot_set_id`
- `review_type`
- `subject_type`
- `subject_source`
- `subject_source_id`
- `subject_canonical_id`
- `vendor_visibility_state`
- `publishability_status`
- `publishable_to_site`
- `published_to_site`
- `site_publish_blockers`
- `rating_value`
- `rating_scale_min`
- `rating_scale_max`
- `rating_normalized_5`
- `rating_normalization_version`
- `sentiment_source_value`
- `sentiment_source_model`
- `sentiment_normalized`
- `sentiment_normalization_version`
- `helpful_vote_count`
- `unhelpful_vote_count`
- `supports_helpful_votes`
- `supports_unhelpful_votes`
- `verified_buyer`
- `is_incentivized`
- `incentive_type`
- `submitted_at`
- `published_at`
- `updated_at`
- `deleted_at`
- `title`
- `body`
- `author_display_name`
- `author_verified_buyer`
- `author_country`
- `author_country_code`
- `author_state`
- `author_state_code`
- `customer_binding_status`

### Product-specific snapshot columns

These are nullable and populated when `subject_type = product`.

- `product_source`
- `product_source_id`
- `product_canonical_id`
- `product_title_snapshot`
- `product_handle_snapshot`

These are explicit snapshot fields and must never be treated as stable join keys.

### Structured JSONB / array fields

- `media`
- `metadata`
- `relationships`
- `provider_fields`

Contract rules:

- top-level containers should not be null
- use empty arrays/objects instead

## Review Type

`review_type` is a shared business enum:

- `product`
- `site`
- `service`
- `ugc`
- `other`

`review_type` is business classification.

`subject_type` is the actual entity type the review is about.

Both are retained because they answer different questions.

## Visibility And Publication Semantics

### `vendor_visibility_state`

Provider state normalized into a shared enum where possible.

Examples:

- `published`
- `unpublished`
- `deleted`
- `suppressed`

Provider-specific raw state remains in `provider_fields`.

### `published_to_site`

Convenience boolean only.

It is not the explanation surface.

### `publishable_to_site`

Boolean representing whether the row is currently eligible for site publication under generalized publication rules.

### `site_publish_blockers`

JSONB array of machine-readable blocker codes.

Shared blocker vocabulary should exist across providers, but provider-specific codes are allowed under a namespaced pattern such as `yotpo:*`.

## Ratings And Sentiment

### Ratings

The generalized contract does not assume a 1-5 native provider scale.

It carries:

- source-faithful rating fields
- site-facing normalized-to-5 rating fields

The normalized 1-5 field can be redefined in future by versioning `rating_normalization_version`.

### Sentiment

The contract always exposes one canonical sentiment value:

- `sentiment_normalized`

Rules:

- if provider sentiment is used directly, `sentiment_normalization_version = null`
- if internal normalization is applied, the normalization version is populated

## Engagement

The generalized contract carries:

- `helpful_vote_count`
- `unhelpful_vote_count`
- `supports_helpful_votes`
- `supports_unhelpful_votes`

Counts default to numeric values for query simplicity.

Capability flags prevent false interpretation of zero as universal support.

## Restricted Identity Companion

`reviews.generalized_review_identity_links` is keyed by `canonical_record_id` and holds:

- raw and normalized private match keys
- source user/customer references
- current resolved linkage state
- whether the linked review is currently published
- identity change diagnostics such as:
  - `previous_identity_hash`
  - `last_identity_changed_at`

Phase 1 keeps only the current identity state, not historical identity versions.

If source identity changes, the system overwrites in place and updates diagnostics.

### Access control

Access to the restricted identity companion is enforced at the Postgres level:

- The platform-wide `data_operator` role has `SELECT` on `reviews.generalized_review_identity_links`
- Only connections that need private linkage (e.g., Customer 360) are granted this role
- The broad `data_reader` role has `SELECT` on all other `reviews.*` tables but not the identity companion
- This is enforced in the database, not at the application layer
- The same `data_reader` / `data_operator` roles apply uniformly across all schemas (shopify, gorgias, yotpo, reviews, analytics, control)

## Audit And Exceptions

### `reviews.generalized_review_publish_exceptions`

Current-state only.

One row per currently excluded review.

Includes:

- `canonical_record_id`
- `published_snapshot_set_id`
- `exception_code`
- `exception_reason`
- `first_seen_at`
- `last_seen_at`
- supporting diagnostics

### `reviews.generalized_review_publish_audit`

Current-state only.

One row per staged review evaluated in the latest publication pass.

Includes:

- publication decision
- winning-source diagnostics
- current blocker set
- decision signature
- `first_seen_at`
- `last_evaluated_at`
- `decision_changed_at`

`decision_changed_at` updates when the effective evaluation changes, including reason changes even if the high-level decision remains the same.

## Why

### 1. The generalized table is the durable downstream edge

Downstream systems should not be rebuilt every time a review provider changes.

### 2. Analysts need a one-stop broad-access query surface

The generalized layer is meant to support cross-source querying without forcing analysts into provider-native schemas.

### 3. Sensitive linkage must remain separable

Customer binding is operationally necessary but should not widen blast radius across every consumer of review data.

### 4. Query ergonomics matter more than theoretical purity

Frequently queried fields belong in columns. Flexibility belongs in JSONB.

## Why-Not (Rejected Alternatives)

### Put everything in JSONB and index it

Rejected because it weakens type safety, makes query ergonomics worse, and pushes too much interpretive burden onto every consumer.

### Flatten every possible field

Rejected because the contract would widen too quickly and become sparse, brittle, and expensive to evolve across providers.

### Put customer IDs directly on the broad generalized table

Rejected because it creates an unnecessary identity bridge in a broad-access surface.

### Store full generalized publication history in phase 1

Rejected because raw and source-canonical layers already carry the heavier historical burden. Phase 1 needs a trustworthy current-state surface first.

## Human vs AI Decisioning

- Human role:
  - decide contract boundaries
  - decide blast-radius limits for sensitive linkage
  - determine which fields are worth flattening
- AI role:
  - compress and preserve the decision chain
  - expose reusable patterns for future data streams
  - preserve Why-Not, assumptions, and freshness boundaries for later reuse

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** the company decides generalized reviews should no longer live in `data-streams`, analyst access requirements materially change, or a future provider/internal source proves that current field flattening and restricted identity boundaries are the wrong default.
