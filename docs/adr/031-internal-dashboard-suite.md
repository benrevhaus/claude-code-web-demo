# ADR-031: Keep Data Streams Explorer in Data Streams as a Read-Only Internal Suite Surface

**Status:** Accepted
**Date:** 2026-04-02

**Supersedes:** ADR-030

---

## Context

ADR-030 proposed splitting the GA4 dashboard into a separate repository.

That boundary is too strong for the actual use case.

Data Streams Explorer is not a standalone analytics product. It is an internal, read-only suite surface whose purpose is to help inspect the quality and shape of the data streams managed by this repository.

The intended future state is broader than GA4 alone:

- Shopify
- GA4 / GTM
- Gorgias
- additional streams over time

Data Streams Explorer should let operators and analysts navigate between streams and inspect stream quality, analytical rollups, and source-specific behavior from inside the `data-streams` suite.

## Decision

Keep Data Streams Explorer in the `data-streams` repository as an internal read-only suite surface.

It is part of the `data-streams` suite, not a separate product.

The boundary between ingestion and dashboard concerns is preserved through an explicit analytics contract, not by forcing a separate repository boundary.

## Why

### 1. The dashboard exists to visualize data-stream quality

Its primary purpose is not external product delivery.

Its purpose is to:

- inspect stream outputs
- evaluate normalization quality
- compare behavior across streams
- give the operator a navigable internal surface for understanding what the platform is producing

That is an internal suite concern and belongs close to the platform.

### 2. The dashboard is read-only

The risk of muddling responsibilities is reduced because the dashboard is not the ingestion control plane.

It reads from documented analytical surfaces and does not own vendor sync, replay, or write paths.

### 3. Future multi-stream navigation is valuable here

A shared internal dashboard for Shopify, GA4, Gorgias, and future streams is more useful when it is treated as a native operational/analytical surface of the suite rather than a detached product.

## Boundary

### Ingestion-owned concerns

These remain ingestion responsibilities even when the dashboard lives in-repo:

- stream ingestion
- backfill and sync logic
- normalization and transformation rules
- analytical schema and migrations
- data quality and instrumentation rules

### Dashboard-owned concerns

These remain dashboard responsibilities:

- read-only presentation
- filters, grouping, pagination, and saved views
- stream navigation
- local UI state
- analyst/operator workflows

### Binding mechanism

Data Streams Explorer is bound to ingestion through the analytics contract in [Analytics Contract](../specs/analytics-contract.md).

The contract, not folder proximity, defines the allowed dependency surface.

## Consequences

- the dashboard can remain in-repo without becoming a hidden write path
- `data-streams` gains an internal suite surface for stream observability and exploration
- cross-stream navigation remains easy to implement
- the analytics contract becomes the formal guardrail against accidental coupling

## Non-Goals

This ADR does not:

- turn the dashboard into the ingestion control plane
- authorize writes from the dashboard into ingestion-owned analytical tables
- remove the need for stable documented read contracts
