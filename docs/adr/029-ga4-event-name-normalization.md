# ADR-029: Normalize GA4 Event Names and Quarantine Instrumentation Noise

**Status:** Accepted
**Date:** 2026-04-02

---

## Context

The GA4 event dimension currently contains a mix of:

- valid GA4 or custom event names
- URL/path values
- implementation artifacts and malformed strings

Examples:

- valid: `page_view`, `add_to_cart`, `purchase`
- path leak: `/products/helichrysum-balm`, `https://www.vitalityextracts.com/pages/f`
- instrumentation noise: `GA4 - Config`, malformed image/url hybrids

If these values are treated uniformly as "events", the dashboard becomes analytically misleading:

- event counts are polluted
- event filters become unreliable
- page URLs masquerade as events
- implementation mistakes look like business behavior

## Decision

Introduce an explicit event-normalization layer in the analytical model.

Each event aggregate row should now carry:

- `raw_event_name`
- `normalized_event_name`
- `event_class`
- `derived_page_path`

### Event classes

The event class taxonomy is:

1. `valid_event`
   - approved GA4 or custom event names

2. `page_path_leak`
   - the raw event field actually contains a URL or path

3. `implementation_noise`
   - GTM/GA4 setup artifacts or malformed non-business event strings

### Default dashboard behavior

The dashboard should show `valid_event` rows by default.

`page_path_leak` and `implementation_noise` remain queryable for debugging, but should not be treated as business events unless explicitly requested.

## Why

### 1. The current event dimension is not semantically clean

An analytics dashboard is only as useful as its dimensions are trustworthy.

When page paths and implementation artifacts live in the event slot, the event table cannot be used as a reliable behavioral surface.

### 2. We need a middle layer before deeper warehousing

This normalization step is cheaper and more useful than jumping immediately to raw-event warehousing.

It gives us:

- trustworthy default event slices
- visibility into broken instrumentation
- a stable path for cleanup over time

### 3. Broken instrumentation is operationally important

We do not want to silently drop bad values.

Quarantining them into explicit classes lets us:

- keep the business dashboard clean
- preserve debugging visibility
- identify GTM/GA4 mapping mistakes

## Normalization Rules

### Rule 1: URLs and path-like values are not events

If the raw event value:

- starts with `http://`
- starts with `https://`
- starts with `/`

then:

- `event_class = 'page_path_leak'`
- `normalized_event_name = 'page_path_leak'`
- `derived_page_path = raw_event_name`

### Rule 2: Known implementation artifacts are not business events

If the raw event value matches known implementation-artifact patterns, classify as:

- `event_class = 'implementation_noise'`

Examples:

- `GA4 - Config`
- malformed image/url hybrid values

### Rule 3: Valid event names are normalized, not discarded

For valid events:

- lowercase
- trim
- replace spaces with underscores

Example:

- `Add to cart` -> `add_to_cart`

## API Consequences

The API should:

- filter on normalized event names, not raw values
- return raw and normalized event fields where useful
- support explicit inspection of non-valid event classes
- default to `valid_event` only

## Consequences

- Event tables become analytically trustworthy by default
- Instrumentation mistakes remain visible without polluting the main dashboard
- Future event-taxonomy cleanup has a stable place to land

## Non-Goals

This ADR does not:

- define the full approved event vocabulary
- solve session-path reconstruction
- replace the need for GTM/GA4 instrumentation cleanup

