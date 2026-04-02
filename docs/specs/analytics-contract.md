# Analytics Contract

**Status:** Accepted
**Date:** 2026-04-02

---

## Purpose

This document defines the read contract between the `data-streams` ingestion platform and Data Streams Explorer, the internal read-only suite surface that visualizes stream quality and analytical output.

The contract exists so Data Streams Explorer can evolve without depending on undocumented table internals, and so ingestion work can change safely without silently breaking read consumers.

## Scope

This contract covers the analytical datasets exposed for internal read-only use.

Initial scope:

- `analytics.ga4_page_daily`
- `analytics.ga4_event_daily`
- later additive datasets such as `analytics.ga4_page_variant_daily`

This is a data contract, not a UI contract.

## Contract Principles

1. Read consumers depend on documented analytical grains, not raw ingestion internals.
2. Additive changes are allowed within a contract version.
3. Breaking semantic changes require explicit coordination and, when material, a new contract version.
4. The dashboard is read-only and must not write to ingestion-owned tables.

## Dataset: `analytics.ga4_page_daily`

### Grain

One row per:

- `date_pst`
- `page_path`
- `device_category`
- `source_medium`

### Core dimensions

- `date_pst`
- `page_path`
- `page_title`
- `landing_page_path`
- `device_category`
- `source_medium`

### Metrics

- `views`
- `sessions`
- `total_users`
- `event_count`

### Semantics

- `date_pst` is the reporting date in the GA4 property timezone, expected to align with PT for this workload.
- `page_path` excludes query parameters in v1.
- `landing_page_path` is optional analytical context and may equal `page_path` for many rows.

## Dataset: `analytics.ga4_event_daily`

### Grain

One row per:

- `date_pst`
- `page_path`
- `normalized_event_name`
- `device_category`
- `source_medium`

### Core dimensions

- `date_pst`
- `page_path`
- `landing_page_path`
- `event_name`
- `raw_event_name`
- `normalized_event_name`
- `event_class`
- `derived_page_path`
- `device_category`
- `source_medium`
- `is_conversion_event`

### Metrics

- `event_count`
- `sessions`
- `total_users`

### Semantics

- `event_name` is the normalized analytical event name exposed for querying.
- `raw_event_name` preserves the original GA4-reported value.
- `event_class` distinguishes:
  - `valid_event`
  - `page_path_leak`
  - `implementation_noise`
- `derived_page_path` is only populated when the event slot actually contains a path or URL.
- dashboard defaults should prefer `event_class = 'valid_event'`.

## Event Vocabulary Policy

`normalized_event_name` is an open vocabulary.

### Additive events

The following are non-breaking changes:

- introducing a new `normalized_event_name`
- adding new rows for that event within the same grain
- exposing new valid event values without changing existing metric semantics

Consumers must tolerate previously unseen event names.

### Renamed events

Renaming an existing event is not additive.

Rules:

- do not silently replace an existing normalized event name in place
- if an event name must change, either emit both names during a transition period or introduce a new contract version when semantics materially change
- dashboard curation may change independently, but storage semantics may not silently drift

### Deprecated events

Rules:

- events may be deprecated explicitly before removal
- removal of an event relied on by dashboard defaults requires coordination
- if historical comparability matters, prefer keeping old values available within the current contract version

### Normalization changes

Changes to event normalization rules are contract-impacting.

If raw events are reclassified or normalized differently in a way that changes historical interpretation:

- document the effective date
- coordinate consumer expectations
- create a new contract version if comparability is materially affected

## Allowed Additive Changes

The following do not require a new contract version:

- adding new rows
- adding new valid event names
- adding optional columns that read consumers are free to ignore
- adding new analytical tables alongside existing ones

## Breaking Changes

The following are breaking unless versioned explicitly:

- changing dataset grain
- renaming or removing required columns
- changing timezone semantics
- changing metric meaning
- changing normalization behavior in a way that redefines existing values

## Dashboard Consumer Rules

Internal dashboards in this repo may:

- define curated default event lists
- hide noisy values by default
- group or reshape documented rows for presentation

Internal dashboards in this repo may not:

- assume `normalized_event_name` is a closed enum
- depend on undocumented tables or columns
- write back into ingestion-owned analytical tables

## Change Process

When analytical storage changes are proposed:

1. update this contract if semantics changed
2. add or update an ADR if the architectural boundary changed
3. prefer additive evolution over in-place breaking changes
4. version the exposed contract when breaking semantics cannot be avoided
