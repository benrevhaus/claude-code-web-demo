# ADR-030: Split the GA4 Dashboard Product Out of Data Streams

**Status:** Superseded by ADR-031
**Date:** 2026-04-02

---

## Context

The GA4 historical dashboard MVP was built inside this repository to accelerate local exploration and validate the analytical shape.

That was useful for speed, but the dashboard code has a different responsibility than the core platform.

`data-streams` is an ingestion system. Its job is to:

- receive vendor data
- backfill and sync historical data
- normalize and persist data
- expose stable storage contracts

The dashboard is an analytics product. Its job is to:

- present analyst-facing workflows
- manage filters, grouping, pagination, and saved views
- evolve UI and query ergonomics
- eventually own product-level concerns such as auth, deployment, and release cadence

Keeping both concerns in one repo weakens the boundary between ingestion and product surfaces.

## Decision

The GA4 dashboard should be split out of `data-streams` into its own application repository.

`data-streams` remains the system of record for ingestion and analytical data population.

The separate dashboard app becomes the system of interaction for analyst-facing exploration.

## Why

### 1. The responsibilities are different

The ingestion platform and the dashboard product will change for different reasons.

The ingestion side changes when:

- a stream is added
- a schema changes
- a backfill contract changes
- a normalization rule changes

The dashboard side changes when:

- filters change
- analysts want new views
- table behavior evolves
- saved views, auth, and deployment requirements grow

Those are different change vectors and should not be forced into the same repo lifecycle.

### 2. The dashboard will want product-specific infrastructure

Even a simple analytics UI will eventually want:

- auth
- its own deployment model
- environment management
- frontend build concerns
- product-level observability

Those concerns do not belong in the ingestion platform by default.

### 3. The data boundary is now clear enough to separate

The dashboard does not need to own ingestion.

It needs a stable read contract over:

- `analytics.ga4_page_daily`
- `analytics.ga4_event_daily`
- later aggregate tables such as `analytics.ga4_page_variant_daily`

That is a clean repo boundary.

## Exact Boundary

### `data-streams` owns

- GA4/GTM historical sync and backfill logic
- stream ingestion contracts
- normalization rules
- Postgres analytical schema and migrations
- data-quality rules and instrumentation cleanup rules
- optional internal sync entrypoints or admin endpoints

### Dashboard app owns

- React/Vite frontend
- dashboard-serving API if needed
- table/filter/grouping UX
- saved searches and local UI state
- analyst workflows
- future auth and deployment concerns

## Immediate Extraction Plan

### Keep in `data-streams`

- database migrations
- GA4 sync/backfill code
- event normalization code
- any code whose primary job is to populate analytical tables

### Move out of `data-streams`

- `apps/web`
- dashboard-focused Express routes that only exist to support UI exploration
- frontend assets and product-specific local tooling

### Transitional allowance

The existing local dashboard code may remain temporarily while the extraction happens, but it should be treated as transitional, not as the long-term home.

## Consequences

- `data-streams` stays aligned with its core purpose as an ingestion platform
- the dashboard can evolve faster without dragging ingestion concerns along with it
- deployment targets such as AWS or Vercel can be chosen for the dashboard independently
- analytical read contracts become more explicit and stable

## Non-Goals

This ADR does not:

- require immediate deletion of the existing local dashboard code
- prescribe the final name of the new dashboard repository
- decide whether the dashboard reads Postgres directly or through a thin API layer
