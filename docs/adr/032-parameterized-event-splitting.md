# ADR-032: Split Parameterized Events by Their Primary GA4 Dimension

**Status:** Accepted
**Date:** 2026-04-03

---

## Decision

Events that carry a meaningful parameter value (e.g., `scroll_depth` with `percent_scrolled`, or a future `time_on_site` with seconds) are split into distinct rows at ingestion time rather than aggregated into a single event name.

The normalized event name becomes a compound key — `scroll_depth_90`, not `scroll_depth` — and the raw parameter value is preserved in a dedicated `event_param_value` column. A configuration map (`PARAMETERIZED_EVENTS`) controls which events split and by which GA4 custom dimension.

## Intent

A single `scroll_depth` row per page/date/device is analytically useless — it collapses 25% scrollers and 90% scrollers into one number. The dashboard needs to show scroll engagement as a funnel (25 → 50 → 75 → 90) to surface meaningful behavioral differences across pages, devices, and traffic sources.

The same pattern applies to any event where the parameter value is the analytically important axis, not just the event name.

## Constraints

- The GA4 Data API allows a maximum of 9 dimensions per report. The event report was using 5, leaving room for parameter dimensions.
- The Postgres primary key on `ga4_event_daily` must include `event_param_value` to prevent compound event names from colliding.
- The normalization layer (ADR-029) already exists and handles event classification — this extends it rather than replacing it.
- Mock data must reflect the split so the dashboard is usable without a live GA4 connection.

## Why

### 1. Aggregated parameterized events hide the signal

`scroll_depth` with 1,000 events tells you nothing. `scroll_depth_25` with 800 and `scroll_depth_90` with 120 tells you that 85% of users don't finish the page. That's the whole point of the metric.

### 2. Splitting at ingestion is cheaper than splitting at query time

If the raw parameter is only stored as a column and the event name stays generic, every dashboard query that wants the breakdown needs a GROUP BY on the parameter. Baking the split into the normalized name means the existing event filters, groupings, and Top Events checkboxes work without any query-layer changes.

### 3. The pattern recurs

Scroll depth is the first case, but `time_on_site` bucketed by seconds, `video_progress` by percentage, and `form_step` by step number are all the same shape. A config-driven approach avoids rebuilding the pipeline for each one.

## Why-Not (Rejected Alternatives)

### Keep `scroll_depth` as one event, filter by parameter in the UI

Rejected because it would require a separate filter control, a new query pattern, and special-case UI for parameterized events. The compound-name approach works with the existing filter/grouping infrastructure unchanged.

### Pull all GA4 event parameters as dimensions

Rejected because the GA4 API has a 9-dimension limit per report, and most event parameters are not analytically useful at the aggregate level. The config map lets us be selective about which parameters justify the extra dimension slot.

### Store raw parameter but don't change the event name

Rejected because the event name is the primary filter axis in the dashboard. Users would see `scroll_depth` in the event list and have no way to distinguish thresholds without a secondary filter. The compound name makes the split visible at the top level.

## Assumptions

- Events worth splitting have a small, discrete set of parameter values (percentages, step numbers, buckets). Continuous values (arbitrary milliseconds) would need bucketing before this pattern applies.
- The GA4 custom event dimension names (`customEvent:percent_scrolled`) are stable and match what GTM/GA4 is actually emitting.
- The 9-dimension API limit won't become a bottleneck — we're at 6 dimensions with one parameter and have room for 3 more.

## Tribal Context

- The mock data generates scroll_depth rows with a realistic decay curve (25% has the most events, 90% the fewest) so the dashboard looks plausible without a live GA4 connection.
- `PARAMETERIZED_EVENTS` and `EVENT_PARAM_DIMENSIONS` in `eventNormalization.ts` are the only two touchpoints to add a new parameterized event split — no Lambda, migration, or UI code changes needed beyond those two lines.

## Freshness Marker

- **Captured:** 2026-04-03
- **Stale when:** the GA4 API dimension limit changes, the GTM configuration stops emitting `percent_scrolled` as a custom event parameter, or the number of parameterized events exceeds the remaining dimension slots (currently 3 available).
