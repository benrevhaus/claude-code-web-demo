# Yotpo Reviews Phase 1

**Status:** Proposed
**Date:** 2026-04-07

---

## Purpose

Define the phase 1 Yotpo review migration into `data-streams`.

This spec exists to do two things at once:

- rebuild a clean review corpus from Yotpo into raw and source-canonical layers
- publish both a Yotpo-specific joined current layer and a generalized reviews layer for downstream use

This artifact is intentionally written as both:

- implementation plan
- decision lens for future data streams

It preserves the reasoning chain, rejected alternatives, and boundary choices that shaped the design.

## Summary Of The Design

Phase 1 uses two required Yotpo source streams:

- `reviews`
- `review_metadata`

Media is collected from the main review payload from day 1.

The publication flow is:

1. ingest raw Yotpo source payloads
2. build Yotpo source-canonical tables
3. build `yotpo_reviews_current`
4. build `generalized_reviews_current`
5. build restricted identity, exceptions, and publish-audit tables

The official downstream contract is `generalized_reviews_current`.

`yotpo_reviews_current` is still published as an operational/debugging layer.

## What Changed From The Earlier Draft

The earlier draft assumed:

- a pure full-snapshot model
- separate required streams for reviews, metadata, images, and videos
- a Yotpo-only publication focus first

This was revised because:

- Yotpo merchant review APIs support an incremental strategy via `since_updated_at`
- the existing legacy implementation already proves images and videos are embedded in the main review payload
- the company wants generalized reviews in phase 1, not as a deferred phase
- the source layer should remain Yotpo-pure while the published layer becomes provider-agnostic

## Source Stream Set

### Required phase 1 streams

#### 1. `yotpo_reviews`

Primary corpus stream.

Source:

- merchant `Retrieve all reviews` endpoint

Responsibilities:

- core review fields
- source identity
- embedded media from the review payload
- review product linkage
- vendor visibility state

#### 2. `yotpo_review_metadata`

Per-review enrichment stream.

Source:

- review metadata endpoint

Responsibilities:

- customer/location metadata such as country and state
- any additional review metadata needed for authorship enrichment and downstream binding

### Explicitly not required as separate phase 1 streams

- dedicated images stream
- dedicated videos stream

Reason:

- legacy behavior already proves the main review payload carries media
- docs do not yet justify a stronger review-level media endpoint commitment
- the plan remains open to future repair/enrichment media streams if a later edge case requires them

## Raw And Source-Canonical Layers

### Raw

Raw payloads are written to S3 first under standard `data-streams` key patterns.

This remains the replay source of truth.

### Yotpo source-canonical tables

Recommended phase 1 source tables (all in the `yotpo` Postgres schema):

- `yotpo.reviews_raw_current`
- `yotpo.review_metadata_current`
- `yotpo.snapshot_sets`
- `yotpo.snapshot_runs`

The source-canonical review layer should stay close to Yotpo conventions.

Important source fields to preserve:

- Yotpo review ID
- Yotpo source review ID
- Yotpo/native product association
- Shopify `domain_key` when present
- embedded images and videos
- provider sentiment
- provider vote counts
- provider visibility/deletion state
- latest raw payload JSON in Postgres for migration convenience

### Product identity

`domain_key` is treated as pure source data and stored as such.

It doubles as the key to join to Shopify product data.

Rows missing `domain_key` can still exist in raw/source-canonical layers, but they are not publishable into generalized current tables until subject identity is valid.

## Publication Layers

### 1. `reviews.yotpo_reviews_current`

Joined Yotpo-specific current table built from:

- `yotpo.reviews_raw_current`
- `yotpo.review_metadata_current`

This layer is used for:

- Yotpo-specific QA
- reconciliation against Yotpo
- debugging source-vs-generalization issues

### 2. `reviews.generalized_reviews_current`

Official downstream contract.

Built from:

- `reviews.yotpo_reviews_current`
- generalized publication rules

### 3. Restricted and audit outputs (all in the `reviews` Postgres schema)

- `reviews.generalized_review_identity_links`
- `reviews.generalized_review_publish_exceptions`
- `reviews.generalized_review_publish_audit`

These are all produced from one shared publication pass.

### Postgres schema layout

All tables live in the same Aurora database. Logical separation uses Postgres schemas:

- `yotpo.*` — source-canonical tables (Yotpo-shaped)
- `reviews.*` — generalized publication tables, identity companion, exceptions, and audit

Access to `reviews.generalized_review_identity_links` is restricted via the platform-wide `data_operator` Postgres role, granted only to connections that need private linkage (e.g., Customer 360). The broad `data_reader` role cannot access the restricted identity table. The same role pair (`data_reader` / `data_operator`) applies uniformly across all schemas.

## Snapshot And Publication Model

### Publication orchestration: last-writer-wins

No new Lambda, Step Function, or schedule is introduced for publication.

Each source stream_runner checks after its own ingest whether the other required stream's source data is fresh enough. If both streams are current, the finishing stream_runner runs the publication pass inline.

This means:

- no new orchestration infrastructure
- publication happens naturally as part of the last stream to complete
- if one stream fails repeatedly, publication stalls — caught by existing freshness alarm patterns

### Shared publication cycle

Each publish attempt gets a unique `published_snapshot_set_id`.

That shared ID ties together:

- source stream runs
- Yotpo current publication
- generalized current publication
- restricted identity output
- current exceptions
- current publish audit

If any required stream in the publication cycle fails, the cycle is not published.

The next attempt creates a brand new snapshot set.

### Historical baseline

The historical rebuild is not published progressively.

Instead:

1. build source baseline first
2. verify source completion and thresholds
3. publish Yotpo-specific current
4. publish generalized current

The first successful internal generalized publication becomes the authoritative baseline snapshot for future audits and incremental comparisons.

## Backfill And Incremental Strategy

### Historical rebuild

Historical backfill should complete the source baseline first.

Completion is not defined as “perfect.”

It is defined as:

- all required source streams complete
- reconciliation checks executed
- exception rates within configured thresholds

Thresholds are configurable through shared publication policy with one Yotpo-specific override.

### Steady state

#### Main reviews corpus

- steady state incremental via `since_updated_at`
- weekly full audit snapshot

#### Metadata

- incremental where supported/possible
- monthly full audit snapshot

Audit failures alert only and do not block production publication unless a normal production cycle itself fails.

Corrective rebuilds require manual approval.

## Generalized Publication Requirements

The generalized layer must include phase 1 from the start.

Published rows require:

- namespaced canonical identity
- valid subject contract
- flattened high-value query fields
- restricted companion linkage table for private identity keys

Rows missing required subject identity are:

- retained in raw/source-canonical layers
- available in restricted identity outputs where useful
- excluded from `generalized_reviews_current`
- recorded in current publish exceptions

## Yotpo-Specific Output Fields That Matter In Generalization

### Ratings

Do not assume provider-native 1-5 ratings as the only truth.

Carry:

- source-faithful rating values
- generalized normalized-to-5 fields for current site compatibility

### Sentiment

Carry:

- provider/source sentiment
- one generalized normalized sentiment field

If provider sentiment is used directly:

- normalized sentiment is still populated
- normalization version remains null

### Geography

Flatten:

- `author_country`
- `author_country_code`
- `author_state`
- `author_state_code`

because they are heavily queried.

### Product context

Flatten product-linked descriptive fields as explicit snapshots only:

- `product_title_snapshot`
- `product_handle_snapshot`

Identity comes from:

- `product_source`
- `product_source_id`
- `product_canonical_id`

The snapshot fields are descriptive context and must never be used as stable keys.

## Publication Diagnostics

The generalized current table should not hold the full internal decision tree.

It should carry a small stable publication surface:

- `published_to_site`
- `publishable_to_site`
- `publishability_status`
- `vendor_visibility_state`
- `site_publish_blockers`

The full diagnostics, component booleans, winning-source decisions, and evaluation signatures belong in `generalized_review_publish_audit`.

## Restricted Identity

The generalized identity companion is required in phase 1 because Customer 360 will consume generalized reviews from day 1.

Rules:

- broad-access generalized reviews table does not expose customer identity joins
- restricted companion stores current private match keys and current linkage state
- identity rows exist for staged reviews even if the review is currently excluded from publication
- identity state overwrites in place, not as historical versions
- diagnostics such as `previous_identity_hash` and `last_identity_changed_at` are retained

## Why

### 1. This avoids another rebuild when Yotpo is replaced

If the company is leaving Yotpo soon, the generalized publication edge must exist now, not after the migration.

### 2. The source layer must remain easy to reconcile against Yotpo

Yotpo-specific tables and raw payloads need to stay close enough to vendor truth that source debugging remains straightforward.

### 3. The generalized layer should become the default place to work

Analysts, Customer 360, and future internal review systems should not be forced back into Yotpo-native tables unless they are doing source-level triage.

### 4. The publication pass should explain its own decisions

Reviews should not silently disappear. Publication state, blockers, identity linkage, and current exceptions all need explicit current-state surfaces.

## Why-Not (Rejected Alternatives)

### Keep the old `contactus` implementation as the source of truth and just patch it

Rejected because the legacy implementation mixes ingestion and storefront behavior too tightly. It is not a trustworthy long-term system of record.

### Make images and videos required separate streams in phase 1

Rejected because the practical source already proven by the legacy code is embedded media in the review payload. Separate media repair streams can be added later if needed.

### Build generalized reviews later

Rejected because that would force downstream systems into another migration when Yotpo is replaced.

### Force hard 100% reconciliation for baseline completion

Rejected because vendor systems are noisy. The right model is configurable thresholds with a Yotpo-specific override, not perfection theater.

## Human vs AI Decisioning

### Human decisions that mattered

- keep source-canonical Yotpo tables pure
- publish generalized reviews in phase 1
- separate restricted identity from broad-access review data
- use thresholds rather than absolutist baseline completion
- require explicit publication diagnostics and exceptions

### AI contribution

- compressed the reasoning path
- preserved rejected alternatives and assumptions
- grouped repeated decisions into reusable patterns for future data streams

### Explicit boundary

This artifact encodes the decision chain. It is not a substitute for live endpoint verification against the actual Yotpo account.

## Open Verification Items

1. Confirm the exact merchant review response fields in the live Yotpo account.
2. Confirm whether any required metadata fields are absent or delayed relative to review payloads.
3. Confirm the practical throttling behavior of the merchant endpoint under full backfill.
4. Confirm whether `deleted` semantics on the merchant endpoint match legacy expectations closely enough.

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** Yotpo changes merchant review endpoint semantics, the company decides not to generalize review publication in `data-streams`, or a future source proves the current phase 1 publication layering is the wrong reusable pattern.
