# ADR-028: GA4 Dimension Coverage and Variant-Aware Aggregate Grain

**Status:** Accepted
**Date:** 2026-04-02

---

## Context

The current GA4 historical dashboard MVP proves a compact aggregate model:

- `ga4_page_daily`
- `ga4_event_daily`

That is sufficient for broad traffic and event inspection, but it does not yet answer an important class of questions:

- split test comparison
- funnel-step comparison
- variant-specific landing page analysis
- GET query-param-driven page variants

At the same time, we do **not** want to jump straight to raw-event warehousing or full query-string persistence.

We need a middle path:

- preserve the dashboard's aggregated operating model
- support variant-aware analysis
- avoid arbitrary query-param explosion

## Decision

Adopt a **three-grain GA4 historical model** for the dashboard:

1. **Page daily**
   - default traffic/content inspection
   - page path without GET params

2. **Event daily**
   - event fanout for sortable/filterable event inspection

3. **Page variant daily**
   - a whitelisted query-param-aware aggregate grain for experiments and funnel views

This decision adds two rules:

### Rule 1: Query-param awareness is opt-in and whitelisted

We will not persist arbitrary query strings as primary analytical keys.

Instead, only approved keys are promoted into the variant grain. Initial examples:

- `variant`
- `test`
- `experiment`
- `funnel`
- `step`

UTM fields remain analytical context, not page identity.

### Rule 2: The page-path grain remains the default UI and reporting surface

The main dashboard continues to use page path without GET params as the default slice.

Variant-aware analysis is a secondary analytical lens, not the new default representation of every page.

## Why

### 1. The current aggregate model is good, but incomplete

The existing page/event aggregates answer:

- what pages changed
- what events are strongest on a page
- what changed by device or source-medium

They do not answer:

- which split-test branch performed better
- which query-param-driven funnel step was weak
- whether a page's aggregate performance hides divergent variants

### 2. Raw-event storage is still the wrong immediate answer

Raw-event warehousing would solve this by brute force, but it would also:

- materially increase storage and sync complexity
- expand the modeling surface before we know which dimensions matter
- slow the dashboard path we are actually trying to validate

### 3. Variant grain gives the minimum additional structure needed

The variant-aware aggregate table creates enough resolution to answer practical experiment and funnel questions without requiring a full event warehouse.

## Data Model Decision

The dashboard model should now support these fields:

### `ga4_page_daily`

- `date_pst`
- `page_path`
- `page_title`
- `landing_page_path`
- `device_category`
- `source_medium`
- `views`
- `sessions`
- `total_users`
- `event_count`

### `ga4_event_daily`

- `date_pst`
- `page_path`
- `landing_page_path`
- `event_name`
- `device_category`
- `source_medium`
- `is_conversion_event`
- `event_count`
- `sessions`
- `total_users`

### `ga4_page_variant_daily`

- `date_pst`
- `page_path`
- `variant_key`
- `variant_value`
- `landing_page_path`
- `device_category`
- `source_medium`
- `views`
- `sessions`
- `total_users`
- `event_count`

## API Consequences

The backend should expose:

- page-level queries
- event-level queries
- variant-level queries
- filter metadata including:
  - landing pages
  - variant keys
  - variant values

Variant filters should be supported where the underlying grain can answer them honestly. We should not fake variant-aware answers from non-variant tables.

## Explicit Non-Goals

This ADR does **not** approve:

- arbitrary query-string persistence
- full session path reconstruction
- raw-event warehouse ingestion
- full BigQuery-first re-architecture

## Revisit Triggers

Revisit this ADR if any of the following become true:

1. Variant-aware aggregate analysis is insufficient for decision-making
2. Session pathing becomes a first-order requirement
3. We need attribution or event context at a level the aggregate grains cannot preserve
4. Query-param use grows beyond a manageable whitelist

