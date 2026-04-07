# Review Stream Implementation Guide

**Status:** Proposed
**Date:** 2026-04-07

---

## Purpose

This document is the implementation-grade companion to:

- [ADR-033](../adr/033-source-pure-review-streams-and-generalized-publication.md)
- [Generalized Reviews Contract](./generalized-reviews-contract.md)
- [Yotpo Reviews Phase 1](./yotpo-reviews-stream.md)

It is written so that:

- another engineer can implement the review-stream architecture without replaying the original conversations
- another AI can reason from explicit rules instead of inferring intent from partial code
- future review sources can reuse the same structure without silently drifting from the Yotpo lessons

This is not only a build plan. It is also a decision lens.

The central principle is:

- source streams stay pure
- publication is where generalization happens
- identity sensitivity is separated deliberately
- every decision surface should be explainable from current-state artifacts

## Scope

Phase 1 covers:

- Yotpo as the first source
- one single store
- source-canonical Yotpo review ingestion
- Yotpo-specific current publication
- generalized reviews current publication
- restricted identity companion
- current-state exceptions and audit tables
- baseline backfill
- steady-state incremental and audit policies

Phase 1 does not cover:

- generalized published-history tables
- separate dedicated Yotpo media streams
- replies/threads as first-class entities
- moderation/suppression policy storage inside `data-streams`
- a generalized identity-resolution subsystem beyond the restricted companion table

## Implementation Layers

The review architecture has four operational layers.

### Layer 1: Raw source payloads

Stored in S3.

Purpose:

- immutable replay
- source debugging
- baseline reconciliation

Rules:

- never transform before writing raw
- store full vendor response bodies
- keep source stream boundaries separate

### Layer 2: Source-canonical tables

Stored in Postgres under source-specific schemas.

Purpose:

- latest source-shaped current state
- source-specific joins and publication preparation
- lossless enough to reconcile against provider behavior

Rules:

- remain provider-shaped
- do not over-generalize field names or semantics
- preserve high-value raw payload JSON in Postgres for migration convenience where explicitly approved

### Layer 3: Source-specific published current tables

Example:

- `yotpo_reviews_current`

Purpose:

- source-specific QA surface
- reconciliation and debugging boundary
- stable join surface before generalization

Rules:

- one joined current table per source family when needed
- publish from validated source-canonical inputs only
- retain source semantics

### Layer 4: Generalized published current tables

Examples:

- `generalized_reviews_current`
- `generalized_review_identity_links`
- `generalized_review_publish_exceptions`
- `generalized_review_publish_audit`

Purpose:

- official downstream contract
- cross-provider query surface
- Customer 360 integration
- durable analytical edge

Rules:

- broad-access tables stay non-sensitive
- generalized contract is explicit
- every published row must have valid subject identity
- current-state explanation surfaces must exist for exclusions and publish decisions

## Yotpo Phase 1 Source Inventory

### Required source streams

#### `yotpo_reviews`

Primary corpus stream.

Use:

- merchant `Retrieve all reviews`

Responsibilities:

- review identity
- review text/content
- score/rating
- provider sentiment
- votes/helpfulness
- product linkage
- embedded images and videos
- provider visibility/deletion state
- latest source payload JSON in source-canonical storage

#### `yotpo_review_metadata`

Per-review enrichment stream.

Use:

- metadata endpoint by review ID

Responsibilities:

- country/state and location metadata
- author enrichment inputs
- additional metadata needed for generalized authorship and identity binding

### Explicitly not required as separate phase 1 streams

- `yotpo_review_images`
- `yotpo_review_videos`

Reason:

- the current implementation already proves media arrives embedded in the main review payload
- no stronger documented review-level media stream contract has been committed yet
- the architecture remains open to future media repair streams if truncation or divergence appears

## Source-Canonical Table Plan

Recommended table families for Yotpo phase 1:

- `yotpo.reviews_raw_current`
- `yotpo.review_metadata_current`
- `yotpo.snapshot_sets`
- `yotpo.snapshot_runs`

If implementation requires staging or helper tables, keep them clearly source-scoped.

### `yotpo.reviews_raw_current`

This is the current source-canonical review state.

Must preserve:

- Yotpo review ID
- Yotpo source review ID
- provider-native product association
- Shopify `domain_key` when present
- core text/title/content
- provider visibility/deletion state
- provider rating and scale assumptions as raw source values
- provider sentiment
- votes up/down
- embedded images/videos
- latest full raw review JSON
- lineage fields:
  - source stream name
  - raw S3 key
  - source schema version
  - source snapshot set
  - source run ID

Rules:

- this table is not the generalized table
- keep field naming close to provider semantics where possible
- preserve nulls where the provider truly did not supply a value

### `yotpo.review_metadata_current`

This is the current source-canonical metadata state by review.

Must preserve:

- review ID
- raw metadata payload
- author/location-related fields
- any provider metadata needed for downstream joins or display
- lineage fields matching the review stream model

Rules:

- metadata remains separate from the core review stream
- metadata can override or enrich generalized fields later, but source storage remains separate

### `yotpo.snapshot_sets`

Tracks grouped source ingestion and publication attempts.

Minimum responsibilities:

- one shared identifier for a coordinated publish attempt
- source family / provider
- store ID
- status
- baseline vs incremental mode
- timestamps
- threshold policy used

### `yotpo.snapshot_runs`

Tracks individual stream executions within a snapshot set.

Minimum responsibilities:

- snapshot set ID
- stream name
- run ID
- status
- pagination/progress state
- counts
- started/completed times
- error message when failed

## Publication Artifacts

### `yotpo_reviews_current`

Joined Yotpo-specific current table built from:

- `yotpo.reviews_raw_current`
- `yotpo.review_metadata_current`

Purpose:

- source-specific validation
- QA against Yotpo UI/API
- debugging of generalization mismatches

This table should preserve Yotpo-native semantics where useful, but can already flatten obvious join outputs such as:

- `domain_key`
- `country`
- `state`
- embedded media with metadata enrichment applied where appropriate

### `generalized_reviews_current`

Official downstream published contract.

Built from `yotpo_reviews_current` and generalized publication rules.

This table should follow the contract in [Generalized Reviews Contract](./generalized-reviews-contract.md).

### `generalized_review_identity_links`

Restricted companion keyed by `canonical_record_id`.

Purpose:

- Customer 360 support
- private linkage keys
- review/customer binding state
- support for staged-but-excluded records

Rules:

- do not expose broad-access customer linkage on `generalized_reviews_current`
- identity state is current-state only
- overwrite in place when source identity changes
- keep lightweight diagnostics such as:
  - `previous_identity_hash`
  - `last_identity_changed_at`
  - `is_published`

### `generalized_review_publish_exceptions`

Current-state only.

Purpose:

- explicit record of reviews excluded from generalized publication
- support repair/debugging without silent disappearance

Rules:

- one current row per excluded review
- update `last_seen_at`
- remove the row once the review becomes publishable

### `generalized_review_publish_audit`

Current-state only.

Purpose:

- explain current publication state without going back to provider tables unless necessary
- preserve decision diagnostics in a queryable way

Must include:

- current decision state
- `decision_signature`
- `first_seen_at`
- `last_evaluated_at`
- `decision_changed_at`
- winning-source diagnostics
- blocker set
- current publication flags

Rules:

- `decision_changed_at` updates when the effective evaluation changes, not only when a simple publish boolean flips

## Generalized Reviews Contract: Implementation Rules

This section translates the generalized contract into build rules.

### Required identity contract

Every published row must include:

- `canonical_record_id`
- `source`
- `source_record_id`
- `subject_type`
- `subject_source`
- `subject_source_id`
- `subject_canonical_id`

If any are missing:

- do not publish the row to `generalized_reviews_current`
- do retain it in source-canonical storage
- do allow the restricted identity table to keep staged/debuggable linkage info when available
- do write/update its exception row

### Required broad-access fields

High-value typed columns must be flattened.

This is non-negotiable for:

- IDs
- source lineage
- subject identity
- visibility/publication
- rating
- sentiment
- engagement
- timestamps
- frequently queried authorship geography
- product snapshot descriptors

### Container rules

Use empty containers instead of null for:

- `media`
- `metadata`
- `relationships`
- `provider_fields`

Rules:

- top-level containers should be predictable
- null should be used for unknown scalar values, not for the existence of the container itself

### Product-specific snapshot fields

Flatten and name explicitly as snapshots:

- `product_title_snapshot`
- `product_handle_snapshot`

Rules:

- these are descriptive only
- never join on them
- product identity always comes from explicit identity fields

### Ratings

Always carry both:

- provider/source rating fields
- normalized-to-5 fields for site compatibility

Required generalized fields:

- `rating_value`
- `rating_scale_min`
- `rating_scale_max`
- `rating_normalized_5`
- `rating_normalization_version`

### Sentiment

Always expose one canonical sentiment field:

- `sentiment_normalized`

And preserve source lineage:

- `sentiment_source_value`
- `sentiment_source_model`
- `sentiment_normalization_version`

Rule:

- if provider sentiment is used directly, normalized value is still populated and version is null

### Engagement

Include:

- `helpful_vote_count`
- `unhelpful_vote_count`
- `supports_helpful_votes`
- `supports_unhelpful_votes`

Rule:

- counts should be numeric and queryable
- capability flags explain whether zeros represent “supported but zero” or “not supported”

### Visibility and publication

Keep a small stable publication surface on the main generalized table:

- `vendor_visibility_state`
- `publishability_status`
- `publishable_to_site`
- `published_to_site`
- `site_publish_blockers`

Do not place the entire internal decision tree on the main table.

That belongs in the audit table.

### Sensitive linkage

Do not place:

- raw email
- normalized email
- customer IDs
- source customer references used for identity binding

on `generalized_reviews_current`.

They belong in the restricted identity companion.

## Publication Decision Model

The publication model must be explainable.

### Summary fields on the main table

The main generalized table should support common filters without forcing a join to the audit table.

Keep:

- final publication booleans/status
- machine-readable blocker set
- normalized vendor visibility state

### Full explanation in audit

The audit table should record:

- all current decision components
- which source won for enrichment families
- counts/completeness metrics
- decision signature

### Blocker vocabulary

Use:

- a shared core blocker vocabulary
- provider-specific extensions allowed via namespaced values such as `yotpo:*`

Store blockers in a multi-value JSONB/array field.

## Provenance And Winning-Source Rules

When multiple source inputs can populate a generalized field:

- prefer the more complete/richer source
- preserve current-state diagnostics about which source won

### For Yotpo phase 1

- the main review payload is authoritative for media by default
- metadata stream can override/enrich when richer
- future repair streams can be introduced later without invalidating this model

Winning-source diagnostics should live in the current-state publish audit table, not in a source-specific one only.

## Restricted Identity Table: Implementation Rules

This table is not optional for phase 1.

Purpose:

- allow Customer 360 to consume generalized reviews from day 1
- allow privileged debugging without leaking identity joins broadly

Recommended fields:

- `canonical_record_id`
- `published_snapshot_set_id`
- `source`
- `source_record_id`
- `is_published`
- `customer_binding_status`
- private linkage keys
- normalized linkage keys
- source user/customer/order references
- `previous_identity_hash`
- `last_identity_changed_at`
- `updated_at`

Rules:

- current-state only
- one active row per review
- source identity changes overwrite in place
- excluded rows still get identity rows when useful for triage

## Backfill Model

### Principle

Backfill baseline must complete at the source layer first.

Do not generalize or publish incrementally during baseline construction.

### Source baseline completion

Completion means:

- all required source streams completed
- no active failed runs in the baseline set
- reconciliation checks executed
- exception rates under policy thresholds

It does not mean literal perfection.

### Publication after baseline

Only after source baseline completion:

1. build `yotpo_reviews_current`
2. build `generalized_reviews_current`
3. build identity/exceptions/audit outputs

The first successful internal generalized publication becomes the authoritative baseline snapshot for later comparisons.

## Incremental Model

### Main reviews

- incremental via `since_updated_at`
- weekly full audit snapshot

### Metadata

- incremental if supported or operationally feasible
- monthly full audit snapshot

### Audit behavior

- audit failures alert only
- audit failures do not automatically block current production publication
- corrective rebuilds require manual approval

## Publication Policy

Publication policy must be configurable because this is a reusable pattern across streams.

Recommended model:

- shared default publication policy
- one explicit Yotpo override
- future stream/provider overrides allowed

For Yotpo:

- main review count delta threshold should be tight
- metadata/media completeness thresholds can be looser and more diagnostic-oriented

## AI-Executable Implementation Sequence

This is the recommended build order another AI should follow.

### Step 1: codify stream inventory

Create/update:

- stream configs
- endpoint client modules
- schema registry entries

For Yotpo phase 1:

- `yotpo_reviews`
- `yotpo_review_metadata`

### Step 2: build raw and source-canonical schemas

Create:

- raw models for source payloads
- source-canonical models for current-state tables

Rules:

- source-canonical remains Yotpo-shaped
- preserve raw payload JSON where approved

### Step 3: create source-canonical tables and snapshot tracking tables

Add migrations for:

- review current table
- metadata current table
- snapshot set and run tracking

### Step 4: implement source ingestion and source validation

Implement:

- S3 raw writes
- source-canonical upserts
- snapshot set/run state transitions
- count and completeness metrics

### Step 5: build `yotpo_reviews_current`

Implement source-specific current join logic.

Rules:

- preserve source semantics
- enrich with metadata
- preserve domain key and lineage

### Step 6: build generalized publication transformation

Implement:

- namespaced identity construction
- subject contract validation
- flattening of high-value fields
- container defaults
- blocker computation
- publication status derivation

### Step 7: build restricted identity, exceptions, and audit outputs

All from the same publication pass.

Rules:

- current-state only
- explicit timestamps
- explicit decision signatures

### Step 8: implement baseline and incremental publication policy

Implement:

- baseline completion rules
- configurable publication thresholds
- Yotpo-specific override
- weekly/monthly audit schedules
- alert-only audit failure handling

### Step 9: validate against Yotpo and legacy expectations

Validate:

- corpus counts
- publishable row counts
- exception rates
- domain key coverage
- metadata coverage
- media coverage

### Step 10: document the next reusable pattern

When implementing another review stream, do not start from chat.

Start from:

- ADR-033
- Generalized Reviews Contract
- this implementation guide
- the concrete Yotpo implementation

Then answer only what differs.

## Future Review Sources: Reuse Rules

For future review streams:

### Reuse directly

- raw/source/generalized layering
- namespaced identities
- restricted identity companion
- current exceptions and current audit tables
- configurable publication policy
- baseline-first publication

### Re-evaluate source-specific assumptions

- endpoint inventory
- availability of embedded media
- source visibility semantics
- source rating scale
- source identity linkage quality

### Never assume from Yotpo

- that product is the only review subject
- that helpful/unhelpful votes exist
- that provider sentiment exists
- that metadata is delivered per review
- that subject linkage uses Shopify-style product IDs

## Human vs AI Decisioning

### Human decisions that another AI must not silently override

- keep source streams pure
- generalize at publication, not ingestion
- keep sensitive identity in a restricted companion
- require valid subject identity for published generalized rows
- treat product descriptors as snapshots, not keys
- use configurable publication thresholds rather than perfection gates

### AI decisions that are allowed

- implementation decomposition
- naming cleanup within the approved model
- migration ordering
- diagnostics additions that do not violate the layer boundaries

### AI behavior constraints

When extending this system:

- do not collapse source and generalized layers
- do not expose private linkage on broad-access tables
- do not replace current-state audit/exceptions with silent filtering
- do not over-generalize source fields until a second real source proves the abstraction

## Freshness Marker

- **Captured:** 2026-04-07
- **Stale when:** ADR-033 changes, the generalized reviews contract changes materially, or implementation evidence proves a different build order or table boundary is safer for future review streams.
