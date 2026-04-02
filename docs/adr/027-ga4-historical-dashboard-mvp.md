# ADR-027: Build the Initial Data Streams Explorer GA4 View as an Aggregated Local App

**Status:** Accepted
**Date:** 2026-04-02

---

## Context

The immediate need is to inspect Shopify site activity through the GA4 lens with historical data available on day one.

The requirement is analytical, not operational mirroring:

- backfill the last 90 days
- query by PST date, page, and event
- support compact cross-section analysis
- avoid overbuilding raw-event storage now

## Decision

Build an initial local Data Streams Explorer app layer inside this repository with:

- React/Vite frontend
- Express backend
- Postgres-backed aggregated GA4 historical tables
- GA4 Data API sync for 90-day backfill

For the MVP:

- store page aggregates without GET params in page keys
- store event aggregates fanned out by date/page/event/device/source-medium
- provide filters, sorting, pagination, and saved searches in localStorage

## Why

- This gives a usable explorer surface immediately.
- It avoids forcing the core ingestion system to become a warehouse-first analytics app.
- It preserves a path to later granularity if query-param detail becomes important.

## Deferred

- raw-event warehousing
- query-param normalization
- BigQuery export integration
- hosted deployment hardening for AWS/Vercel
